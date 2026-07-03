/**
 * useBuildingOccupancy — the ONE shared occupancy hook.
 *
 * Powers SpaceOperationsConsole, the floor map, and SpaceDetailDrawer with a
 * single 4-query fetch + in-memory joins (no N+1). All space/contract surfaces
 * agree on: occupant, contract, effective discount, entry date, anniversary.
 *
 * Query rules (single source of truth):
 *   - Contracts filtered to status IN ('active', 'pending_signature').
 *   - Deterministic contract pick per workspace: prefer 'active', tie-break
 *     latest start_date (fixes last-write-wins in the old console query where
 *     a draft could shadow an active contract).
 *   - Funnel-item occupants: join contracts via startup_contracts.funnel_item_id.
 *   - Allocation contract link: prefer allocation.contract_id when present,
 *     fall back to workspace/funnel inference.
 *   - Effective discount: canonical helper `computeEffectiveDiscount`
 *     (contract_discounts rows first, legacy column as fallback).
 *   - Anniversary: `nextAnniversary` / `yearsCompleted` from contractLifecycle
 *     (calendar-exact).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  computeEffectiveDiscount,
  nextAnniversary,
  yearsCompleted,
  isExpiringSoon,
  LIFECYCLE_THRESHOLDS,
  type ContractDiscountRow,
  type EffectiveDiscount,
} from '@/lib/contractLifecycle';
import { differenceInDays } from 'date-fns';

export type OccupancyWarning =
  | 'occupied_no_allocation'
  | 'allocation_no_link'
  | 'active_no_contract'
  | 'contract_draft'
  | 'contract_pending_signature'
  | 'imported_unclaimed'
  | 'claimed_no_contract'
  | 'allocation_expiring'
  | 'anniversary_upcoming';

export interface OccupancyContractSummary {
  id: string;
  status: string;
  typeName: string | null;
  monthlyFee: number | null;
  effectiveDiscount: EffectiveDiscount;
  effectiveMonthlyFee: number | null;
  /** Contract start = anniversary driver. */
  contractStart: string;
  contractEnd: string | null;
  /** Next contract-year anniversary (Date). */
  anniversary: Date | null;
  anniversaryDaysUntil: number | null;
  anniversaryYearsCompleted: number;
  billingDay: number | null;
  isExpiringSoon: boolean;
}

export interface OccupancyOccupant {
  kind: 'workspace' | 'funnel_item';
  name: string | null;
  workspaceId: string | null;
  workspaceStatus: string | null;
  funnelItemId: string | null;
  contactEmail: string | null;
}

export interface OccupancyRoom {
  id: string;
  name: string;
  number: string | null;
  status: string;
  type: string;
  floor: string | null;
  spaceId: string | null;
  spaceName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  pinX: number | null;
  pinY: number | null;
  floorMapId: string | null;
  shapeType: string | null;
  shapeJson: any;
  /** Allocation start = "no espaço desde". */
  entryDate: string | null;
  allocationId: string | null;
  allocationType: string | null;
  allocationEnd: string | null;
  occupant: OccupancyOccupant | null;
  contract: OccupancyContractSummary | null;
  warnings: OccupancyWarning[];
}

interface BuildingLite {
  id: string;
  name: string;
}

export interface BuildingOccupancyResult {
  rooms: OccupancyRoom[];
  buildings: BuildingLite[];
}

/** Deterministic "best" contract per key: active first, then latest start_date. */
function pickBestContract<T extends { status: string; start_date: string }>(
  candidates: T[],
): T | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => {
    const aActive = a.status === 'active' ? 0 : 1;
    const bActive = b.status === 'active' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.start_date || '').localeCompare(a.start_date || '');
  });
  return sorted[0];
}

function toContractSummary(
  contract: any,
  today: Date,
): OccupancyContractSummary {
  const disc = computeEffectiveDiscount(
    contract.contract_discounts as ContractDiscountRow[] | null,
    contract.discount_percentage,
    contract.discount_reason ?? null,
    today,
  );
  const monthlyFee = contract.monthly_fee != null ? Number(contract.monthly_fee) : null;
  const effectiveMonthlyFee =
    monthlyFee != null ? monthlyFee * (1 - disc.effectivePct / 100) : null;
  const anniversary = contract.start_date
    ? nextAnniversary({ start_date: contract.start_date, end_date: contract.end_date, status: contract.status }, today)
    : null;
  return {
    id: contract.id,
    status: contract.status,
    typeName: contract.incubation_type?.name ?? null,
    monthlyFee,
    effectiveDiscount: disc,
    effectiveMonthlyFee,
    contractStart: contract.start_date,
    contractEnd: contract.end_date,
    anniversary,
    anniversaryDaysUntil: anniversary ? differenceInDays(anniversary, today) : null,
    anniversaryYearsCompleted: contract.start_date
      ? yearsCompleted({ start_date: contract.start_date, end_date: contract.end_date, status: contract.status }, today)
      : 0,
    billingDay: contract.billing_day ?? null,
    isExpiringSoon: isExpiringSoon({
      start_date: contract.start_date,
      end_date: contract.end_date,
      status: contract.status,
    }, today),
  };
}

export function useBuildingOccupancy() {
  return useQuery<BuildingOccupancyResult>({
    queryKey: ['building-occupancy'],
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);

      const [roomsRes, allocRes, contractsRes, buildingsRes] = await Promise.all([
        supabase
          .from('rooms')
          .select(`
            id, name, room_number, floor, room_type, status, space_id, building_id,
            pin_x, pin_y, floor_map_id, shape_type, shape_json,
            space:office_spaces(id, name, building_id),
            building:buildings(id, name)
          `)
          .order('name'),
        supabase
          .from('room_allocations')
          .select(`
            id, room_id, workspace_id, funnel_item_id, contract_id, allocation_type,
            start_date, end_date,
            workspace:workspaces(id, status, startup:startups(name, main_contact_email)),
            funnel_item:funnel_items(id, organization_name, contact_name, contact_email)
          `)
          .lte('start_date', todayIso)
          .or(`end_date.is.null,end_date.gte.${todayIso}`),
        supabase
          .from('startup_contracts')
          .select(`
            id, workspace_id, funnel_item_id, status, start_date, end_date,
            monthly_fee, discount_percentage, discount_reason, billing_day,
            incubation_type:incubation_types(name),
            contract_discounts(id, discount_percentage, start_date, end_date, reason)
          `)
          .in('status', ['active', 'pending_signature']),
        supabase.from('buildings').select('id, name').order('name'),
      ]);

      const rooms = roomsRes.data || [];
      const allocations = allocRes.data || [];
      const contracts = contractsRes.data || [];
      const buildings = (buildingsRes.data || []) as BuildingLite[];

      // Group contracts by workspace and by funnel_item, then pick the best.
      const byWorkspace = new Map<string, any[]>();
      const byFunnel = new Map<string, any[]>();
      const byId = new Map<string, any>();
      for (const c of contracts) {
        byId.set(c.id, c);
        if (c.workspace_id) {
          const list = byWorkspace.get(c.workspace_id) ?? [];
          list.push(c);
          byWorkspace.set(c.workspace_id, list);
        }
        if (c.funnel_item_id) {
          const list = byFunnel.get(c.funnel_item_id) ?? [];
          list.push(c);
          byFunnel.set(c.funnel_item_id, list);
        }
      }

      const allocByRoom = new Map<string, any>();
      for (const a of allocations) allocByRoom.set(a.room_id, a);

      const result: OccupancyRoom[] = rooms.map(room => {
        const alloc = allocByRoom.get(room.id);
        const ws = alloc?.workspace;
        const funnel = alloc?.funnel_item;

        // Resolve contract: explicit link → workspace best → funnel best.
        let rawContract: any = null;
        if (alloc?.contract_id) rawContract = byId.get(alloc.contract_id) ?? null;
        if (!rawContract && ws?.id) rawContract = pickBestContract(byWorkspace.get(ws.id) ?? []);
        if (!rawContract && funnel?.id) rawContract = pickBestContract(byFunnel.get(funnel.id) ?? []);

        const contract = rawContract ? toContractSummary(rawContract, today) : null;

        // Building preference: room → space → contract fallback (via id).
        const buildingId =
          (room as any).building_id ??
          (room as any).space?.building_id ??
          null;
        const buildingName =
          (room as any).building?.name ??
          (buildingId ? buildings.find(b => b.id === buildingId)?.name : null) ??
          null;

        const occupant: OccupancyOccupant | null = alloc
          ? {
              kind: ws ? 'workspace' : 'funnel_item',
              name:
                (ws?.startup?.name as string | undefined) ??
                (funnel?.organization_name as string | undefined) ??
                (funnel?.contact_name as string | undefined) ??
                null,
              workspaceId: ws?.id ?? null,
              workspaceStatus: ws?.status ?? null,
              funnelItemId: funnel?.id ?? null,
              contactEmail:
                (ws?.startup?.main_contact_email as string | undefined) ??
                (funnel?.contact_email as string | undefined) ??
                null,
            }
          : null;

        const warnings: OccupancyWarning[] = [];
        if (room.status === 'occupied' && !alloc) warnings.push('occupied_no_allocation');
        if (alloc && !alloc.workspace_id && !alloc.funnel_item_id) warnings.push('allocation_no_link');
        if (ws?.status === 'active' && !contract) warnings.push('active_no_contract');
        if (ws && contract?.status === 'pending_signature') warnings.push('contract_pending_signature');
        if (ws?.status === 'imported_unclaimed') warnings.push('imported_unclaimed');
        if (ws?.status === 'claimed' && !contract) warnings.push('claimed_no_contract');
        if (alloc?.end_date) {
          const daysLeft = differenceInDays(new Date(alloc.end_date), today);
          if (daysLeft <= 30 && daysLeft > 0) warnings.push('allocation_expiring');
        }
        if (
          contract?.anniversaryDaysUntil != null &&
          contract.anniversaryDaysUntil >= 0 &&
          contract.anniversaryDaysUntil <= LIFECYCLE_THRESHOLDS.anniversaryWindowDays
        ) {
          warnings.push('anniversary_upcoming');
        }

        return {
          id: room.id,
          name: room.name,
          number: room.room_number,
          status: room.status,
          type: room.room_type,
          floor: room.floor,
          spaceId: room.space_id,
          spaceName: (room as any).space?.name ?? null,
          buildingId,
          buildingName,
          pinX: room.pin_x,
          pinY: room.pin_y,
          floorMapId: room.floor_map_id,
          shapeType: (room as any).shape_type ?? 'pin',
          shapeJson: (room as any).shape_json ?? null,
          entryDate: alloc?.start_date ?? null,
          allocationId: alloc?.id ?? null,
          allocationType: alloc?.allocation_type ?? null,
          allocationEnd: alloc?.end_date ?? null,
          occupant,
          contract,
          warnings,
        };
      });

      return { rooms: result, buildings };
    },
  });
}

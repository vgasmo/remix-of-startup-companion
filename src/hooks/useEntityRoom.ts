/**
 * useEntityRoom — resolve the physical room currently linked to a workspace
 * or contract, reusing the shared occupancy snapshot (no extra queries).
 */
import { useMemo } from 'react';
import { useBuildingOccupancy, type OccupancyRoom } from './useBuildingOccupancy';

export function useWorkspaceRoom(workspaceId: string | null | undefined): OccupancyRoom | null {
  const { data } = useBuildingOccupancy();
  return useMemo(() => {
    if (!workspaceId || !data?.rooms) return null;
    return data.rooms.find(r => r.occupant?.workspaceId === workspaceId) ?? null;
  }, [data, workspaceId]);
}

export function useContractRoom(contractId: string | null | undefined): OccupancyRoom | null {
  const { data } = useBuildingOccupancy();
  return useMemo(() => {
    if (!contractId || !data?.rooms) return null;
    return data.rooms.find(r => r.contract?.id === contractId) ?? null;
  }, [data, contractId]);
}

/** URL to deep-link into the Espaços surface, opening the given room on the map. */
export function buildRoomDeepLink(roomId: string): string {
  return `/admin?tab=backoffice&subtab=spaces&view=map&room=${roomId}`;
}

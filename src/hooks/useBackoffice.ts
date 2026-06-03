import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

// ============================================
// Re-exports from modular hooks (single source of truth)
// ============================================
// Types + CRUD for: Buildings, IncubationTypes, Contracts, Invoices, Payments
// live in src/hooks/backoffice/* and are re-exported here for backwards
// compatibility with the 25+ consumers of useBackoffice.
export type { Building } from './backoffice/useBuildings';
export type { IncubationType } from './backoffice/useIncubationTypes';
export type { StartupContract } from './backoffice/useContracts';
export type { Invoice, Payment } from './backoffice/useInvoices';

export {
  useBuildings,
  useCreateBuilding,
  useUpdateBuilding,
} from './backoffice/useBuildings';

export {
  useIncubationTypes,
  useCreateIncubationType,
  useUpdateIncubationType,
} from './backoffice/useIncubationTypes';

export {
  useContracts,
  useCreateContract,
  useUpdateContract,
} from './backoffice/useContracts';

export {
  useInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  usePayments,
  useRecordPayment,
} from './backoffice/useInvoices';

// ============================================
// OFFICE SPACES (legacy, kept here)
// ============================================

export interface OfficeSpace {
  id: string;
  name: string;
  type: 'desk' | 'private_office' | 'meeting_room' | 'hot_desk';
  floor: string | null;
  capacity: number;
  is_available: boolean;
  monthly_cost: number;
  amenities: string[];
  notes: string | null;
  created_at: string;
}

export interface SpaceAllocation {
  id: string;
  office_space_id: string;
  workspace_id: string;
  start_date: string;
  end_date: string | null;
  monthly_cost_override: number | null;
  notes: string | null;
  created_at: string;
  // Joined
  office_space?: OfficeSpace;
  workspace?: { id: string; startup?: { name: string } | null };
}



export function useOfficeSpaces() {
  return useQuery({
    queryKey: ['office-spaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_spaces')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as OfficeSpace[];
    },
  });
}

export function useCreateOfficeSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('office_spaces')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-spaces'] });
      toast.success(t('backoffice.spaceCreated'));
    },
    onError: () => toast.error(t('backoffice.spaceCreateError')),
  });
}

export function useUpdateOfficeSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('office_spaces')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-spaces'] });
      toast.success(t('backoffice.spaceUpdated'));
    },
    onError: () => toast.error(t('backoffice.spaceUpdateError')),
  });
}

// ============================================
// SPACE ALLOCATIONS
// ============================================

export function useSpaceAllocations(filters?: { officeSpaceId?: string; workspaceId?: string }) {
  return useQuery({
    queryKey: ['space-allocations', filters],
    queryFn: async () => {
      let query = supabase
        .from('space_allocations')
        .select(`
          *,
          office_space:office_spaces(*),
          workspace:workspaces(id, startup:startups(name))
        `)
        .order('start_date', { ascending: false });

      if (filters?.officeSpaceId) {
        query = query.eq('office_space_id', filters.officeSpaceId);
      }
      if (filters?.workspaceId) {
        query = query.eq('workspace_id', filters.workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SpaceAllocation[];
    },
  });
}

export function useCreateSpaceAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('space_allocations')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['office-spaces'] });
      toast.success(t('backoffice.spaceAllocated'));
    },
    onError: () => toast.error(t('backoffice.spaceAllocateError')),
  });
}

// ============================================
// DASHBOARD STATS
// ============================================

export function useBackofficeDashboard() {
  return useQuery({
    queryKey: ['backoffice-dashboard'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Get contract stats
      const { data: contracts } = await supabase
        .from('startup_contracts')
        .select('status, start_date');
      
      // Get invoice stats
      const { data: invoices } = await supabase
        .from('invoices')
        .select('status, total, due_date');
      
      // Get upcoming anniversaries (contracts starting around this month in previous years)
      const thisMonth = new Date().getMonth() + 1;
      const { data: anniversaries } = await supabase
        .from('startup_contracts')
        .select(`
          id,
          start_date,
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('status', 'active');

      const activeContracts = contracts?.filter(c => c.status === 'active').length || 0;
      const pendingInvoices = invoices?.filter(i => i.status === 'sent').length || 0;
      const overdueInvoices = invoices?.filter(i => i.status === 'overdue' || (i.status === 'sent' && i.due_date < today)).length || 0;
      const totalOutstanding = invoices
        ?.filter(i => i.status === 'sent' || i.status === 'overdue')
        .reduce((sum, i) => sum + (i.total || 0), 0) || 0;

      // Find contracts with anniversaries this month
      const upcomingAnniversaries = anniversaries?.filter(c => {
        const startMonth = new Date(c.start_date).getMonth() + 1;
        return startMonth === thisMonth;
      }) || [];

      return {
        activeContracts,
        pendingInvoices,
        overdueInvoices,
        totalOutstanding,
      upcomingAnniversaries,
    };
  },
});
}

// ============================================
// ROOMS
// ============================================

export type RoomShapeType = 'pin' | 'rect' | 'polygon';

export interface RoomShapeRect {
  x: number; // percentage 0-100
  y: number;
  w: number;
  h: number;
}

export interface RoomShapePolygon {
  points: Array<{ x: number; y: number }>; // percentage 0-100
}

export interface Room {
  id: string;
  space_id: string;
  name: string;
  room_number: string | null;
  floor: string | null;
  room_type: string;
  capacity: number | null;
  amenities: string[] | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Pin coordinates for floor map placement (0-100 percentage)
  pin_x: number | null;
  pin_y: number | null;
  floor_map_id: string | null;
  // Shape data for interactive maps (optional, defaults to pin)
  shape_type: RoomShapeType;
  shape_json: RoomShapeRect | RoomShapePolygon | null;
  // Joined
  space?: OfficeSpace;
  current_allocation?: RoomAllocation | null;
}

export interface RoomAllocation {
  id: string;
  room_id: string;
  workspace_id: string | null;
  funnel_item_id: string | null;
  allocation_type: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  workspace?: { id: string; startup?: { name: string } | null };
  funnel_item?: { id: string; organization_name: string | null; contact_name: string | null };
}

export interface FloorMap {
  id: string;
  space_id: string;
  name: string;
  floor: string | null;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
  // Joined
  space?: OfficeSpace;
}

export interface SpaceWaitingListItem {
  id: string;
  workspace_id: string | null;
  funnel_item_id: string | null;
  request_type: string;
  preferred_space_id: string | null;
  preferred_capacity: number | null;
  priority: number;
  status: string;
  notes: string | null;
  requested_by: string | null;
  requested_at: string;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  offered_room_id: string | null;
  created_at: string;
  // Joined
  workspace?: { id: string; startup?: { name: string } | null };
  funnel_item?: { id: string; organization_name: string | null; contact_name: string | null };
  preferred_space?: OfficeSpace;
  offered_room?: Room;
}

export function useRooms(filters?: { spaceId?: string; status?: string }) {
  return useQuery({
    queryKey: ['rooms', filters],
    queryFn: async () => {
      let query = supabase
        .from('rooms')
        .select(`
          *,
          space:office_spaces(*)
        `)
        .order('name', { ascending: true });

      if (filters?.spaceId) {
        query = query.eq('space_id', filters.spaceId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Room[];
    },
  });
}

export function useRoomsWithAllocations(spaceId?: string) {
  return useQuery({
    queryKey: ['rooms-with-allocations', spaceId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      let roomQuery = supabase
        .from('rooms')
        .select(`*, space:office_spaces(*)`)
        .order('name', { ascending: true });
      
      if (spaceId) {
        roomQuery = roomQuery.eq('space_id', spaceId);
      }
      
      const { data: rooms, error: roomsError } = await roomQuery;
      if (roomsError) throw roomsError;

      // Get current allocations
      const { data: allocations } = await supabase
        .from('room_allocations')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          funnel_item:funnel_items(id, organization_name, contact_name)
        `)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`);

      const allocMap = new Map<string, RoomAllocation>();
      (allocations || []).forEach(a => {
        allocMap.set(a.room_id, a as unknown as RoomAllocation);
      });

      return (rooms || []).map(room => ({
        ...room,
        shape_type: (room.shape_type || 'pin') as RoomShapeType,
        shape_json: (room.shape_json as unknown) as RoomShapeRect | RoomShapePolygon | null,
        current_allocation: allocMap.get(room.id) || null,
      })) as Room[];
    },
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('rooms')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      toast.success(t('backoffice.roomCreated'));
    },
    onError: () => toast.error(t('backoffice.roomCreateError')),
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('rooms')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      toast.success(t('backoffice.roomUpdated'));
    },
    onError: () => toast.error(t('backoffice.roomUpdateError')),
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rooms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      toast.success(t('backoffice.roomDeleted'));
    },
    onError: () => toast.error(t('backoffice.roomDeleteError')),
  });
}

// ============================================
// ROOM ALLOCATIONS
// ============================================

export function useRoomAllocations(roomId?: string) {
  return useQuery({
    queryKey: ['room-allocations', roomId],
    queryFn: async () => {
      let query = supabase
        .from('room_allocations')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          funnel_item:funnel_items(id, organization_name, contact_name)
        `)
        .order('start_date', { ascending: false });

      if (roomId) {
        query = query.eq('room_id', roomId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as RoomAllocation[];
    },
  });
}

export function useCreateRoomAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('room_allocations')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      
      // Update room status
      await supabase
        .from('rooms')
        .update({ status: 'occupied' })
        .eq('id', payload.room_id as string);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      toast.success(t('backoffice.roomAllocated'));
    },
    onError: () => toast.error(t('backoffice.roomAllocateError')),
  });
}

export function useEndRoomAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, roomId }: { id: string; roomId: string }) => {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('room_allocations')
        .update({ end_date: today })
        .eq('id', id);
      if (error) throw error;
      
      // Check if there are other active allocations for this room
      const { data: otherAllocations } = await supabase
        .from('room_allocations')
        .select('id')
        .eq('room_id', roomId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .neq('id', id);
      
      if (!otherAllocations?.length) {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', roomId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      toast.success(t('backoffice.allocationEnded'));
    },
    onError: () => toast.error(t('backoffice.allocationEndError')),
  });
}

// ============================================
// FLOOR MAPS
// ============================================

export function useFloorMaps(spaceId?: string) {
  return useQuery({
    queryKey: ['floor-maps', spaceId],
    queryFn: async () => {
      let query = supabase
        .from('floor_maps')
        .select(`*, space:office_spaces(*)`)
        .order('floor', { ascending: true });

      if (spaceId) {
        query = query.eq('space_id', spaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as FloorMap[];
    },
  });
}

export function useCreateFloorMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('floor_maps')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floor-maps'] });
      toast.success(t('backoffice.floorMapUploaded'));
    },
    onError: () => toast.error(t('backoffice.floorMapUploadError')),
  });
}

export function useDeleteFloorMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      // Delete from storage
      await supabase.storage.from('floor-maps').remove([filePath]);
      // Delete record
      const { error } = await supabase.from('floor_maps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floor-maps'] });
      toast.success(t('backoffice.floorMapDeleted'));
    },
    onError: () => toast.error(t('backoffice.floorMapDeleteError')),
  });
}

// ============================================
// SPACE WAITING LIST
// ============================================

export function useSpaceWaitingList(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['space-waiting-list', filters],
    queryFn: async () => {
      let query = supabase
        .from('space_waiting_list')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          funnel_item:funnel_items(id, organization_name, contact_name),
          preferred_space:office_spaces(*),
          offered_room:rooms(*)
        `)
        .order('priority', { ascending: false })
        .order('requested_at', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as SpaceWaitingListItem[];
    },
  });
}

export function useCreateWaitingListRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('space_waiting_list')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-waiting-list'] });
      toast.success(t('backoffice.waitingListAdded'));
    },
    onError: () => toast.error(t('backoffice.waitingListAddError')),
  });
}

export function useUpdateWaitingListRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('space_waiting_list')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-waiting-list'] });
      toast.success(t('backoffice.waitingListUpdated'));
    },
    onError: () => toast.error(t('backoffice.waitingListUpdateError')),
  });
}

export function useFulfillWaitingListRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ 
      requestId, 
      roomId, 
      startDate,
      userId 
    }: { 
      requestId: string; 
      roomId: string; 
      startDate: string;
      userId: string;
    }) => {
      // Get request details
      const { data: request } = await supabase
        .from('space_waiting_list')
        .select('*')
        .eq('id', requestId)
        .single();
      
      if (!request) throw new Error('Request not found');
      
      // Create allocation
      await supabase.from('room_allocations').insert({
        room_id: roomId,
        workspace_id: request.workspace_id,
        funnel_item_id: request.funnel_item_id,
        allocation_type: request.request_type === 'hotdesk' ? 'hotdesk' : 'permanent',
        start_date: startDate,
        created_by: userId,
      });
      
      // Update room status
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId);
      
      // Mark request as fulfilled
      const { error } = await supabase
        .from('space_waiting_list')
        .update({ 
          status: 'fulfilled', 
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: userId,
          offered_room_id: roomId,
        })
        .eq('id', requestId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-waiting-list'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      toast.success(t('backoffice.waitingListFulfilled'));
    },
    onError: () => toast.error(t('backoffice.waitingListFulfillError')),
  });
}

/**
 * Regression: SpaceDetailDrawer must not violate Rules of Hooks when `room`
 * transitions from null → a real room. Previously `useBuildingOccupancy` was
 * called AFTER `if (!room) return null`, causing "Rendered more hooks than
 * during the previous render" and crashing the drawer on first open.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Room } from '@/hooks/useBackoffice';

// ── Mock every hook the drawer calls, so no network / router / auth needed ──
vi.mock('@/hooks/useBackoffice', async () => {
  const noopMutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useEndRoomAllocation: () => noopMutation,
    useCreateRoomAllocation: () => noopMutation,
    useUpdateRoom: () => noopMutation,
    useSpaceWaitingList: () => ({ data: [] }),
    useFulfillWaitingListRequest: () => noopMutation,
  };
});

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ data: [] }),
  ALL_WORKSPACE_STATUSES: [],
}));

vi.mock('@/hooks/useBuildingOccupancy', () => ({
  useBuildingOccupancy: () => ({ data: { rooms: [], buildings: [] } }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

vi.mock('./RoomAllocationHistory', () => ({
  RoomAllocationHistory: () => null,
}));

// Import AFTER mocks are registered.
import { SpaceDetailDrawer } from '@/components/backoffice/SpaceDetailDrawer';

const validRoom: Room = {
  id: 'room-1',
  name: 'Sala Alpha',
  room_number: '101',
  floor: '1',
  room_type: 'office',
  status: 'available',
  space_id: null,
  building_id: 'b-1',
  pin_x: null,
  pin_y: null,
  floor_map_id: null,
  shape_type: 'pin',
  shape_json: null,
  current_allocation: null,
} as unknown as Room;

describe('SpaceDetailDrawer — hook order stability', () => {
  afterEach(() => cleanup());

  it('does not crash when room transitions from null to a real room', () => {
    const errors: unknown[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });

    const { rerender } = render(
      <SpaceDetailDrawer open={false} onOpenChange={() => {}} room={null} />,
    );

    // The prior bug: switching room from null → object added a hook call and
    // React threw "Rendered more hooks than during the previous render".
    expect(() => {
      rerender(
        <SpaceDetailDrawer open onOpenChange={() => {}} room={validRoom} buildingName="B1" />,
      );
    }).not.toThrow();

    const hookErrors = errors.filter(e =>
      /Rendered more hooks|Rendered fewer hooks|Rules of Hooks|change in the order of Hooks/i.test(
        String(e),
      ),
    );
    expect(hookErrors, `Unexpected hook errors:\n${hookErrors.join('\n')}`).toHaveLength(0);

    errSpy.mockRestore();
  });

  it('also survives the reverse transition (room → null)', () => {
    const errors: unknown[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });

    const { rerender } = render(
      <SpaceDetailDrawer open onOpenChange={() => {}} room={validRoom} />,
    );
    expect(() => {
      rerender(<SpaceDetailDrawer open={false} onOpenChange={() => {}} room={null} />);
    }).not.toThrow();

    const hookErrors = errors.filter(e =>
      /Rendered more hooks|Rendered fewer hooks|Rules of Hooks/i.test(String(e)),
    );
    expect(hookErrors).toHaveLength(0);

    errSpy.mockRestore();
  });
});

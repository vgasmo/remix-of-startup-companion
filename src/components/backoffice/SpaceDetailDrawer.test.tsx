/**
 * Regression + behaviour tests for SpaceDetailDrawer.
 *
 * Covers:
 *   - Hook order stays stable across rapid room ↔ null transitions.
 *   - The Sheet-based empty state renders when room is null (not `return null`).
 *   - Empty state exposes the correct accessible name + role.
 *   - Localized copy resolves correctly in both PT and EN.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, within, fireEvent } from '@testing-library/react';
import type { Room } from '@/hooks/useBackoffice';

// ── Locale strings kept in sync with src/i18n/locales/{pt,en}.json ──────────
const STRINGS = {
  pt: {
    'admin.backoffice.spaceDetailsTitle': 'Detalhes do espaço',
    'admin.backoffice.spaceDetailsEmpty': 'Selecione um espaço para ver os detalhes.',
    'admin.backoffice.spaceDetailsEmptyBody': 'Nenhum espaço selecionado.',
  },
  en: {
    'admin.backoffice.spaceDetailsTitle': 'Space details',
    'admin.backoffice.spaceDetailsEmpty': 'Select a space to see the details.',
    'admin.backoffice.spaceDetailsEmptyBody': 'No space selected.',
  },
} as const;

// Hoisted mutable locale switch — vi.mock factories run before imports, so
// they must reach the flag through vi.hoisted rather than a top-level `let`.
const state = vi.hoisted(() => ({ locale: 'pt' as 'pt' | 'en' }));

vi.mock('react-i18next', async () => {
  const S = {
    pt: {
      'admin.backoffice.spaceDetailsTitle': 'Detalhes do espaço',
      'admin.backoffice.spaceDetailsEmpty': 'Selecione um espaço para ver os detalhes.',
      'admin.backoffice.spaceDetailsEmptyBody': 'Nenhum espaço selecionado.',
    },
    en: {
      'admin.backoffice.spaceDetailsTitle': 'Space details',
      'admin.backoffice.spaceDetailsEmpty': 'Select a space to see the details.',
      'admin.backoffice.spaceDetailsEmptyBody': 'No space selected.',
    },
  } as const;
  const changeLanguage = async (lng: string) => {
    if (lng === 'pt' || lng === 'en') state.locale = lng;
  };
  return {
    useTranslation: () => ({
      t: (key: string, opts?: { defaultValue?: string }) => {
        const table = S[state.locale] as Record<string, string>;
        return table[key] ?? opts?.defaultValue ?? key;
      },
      i18n: { language: state.locale, changeLanguage },
    }),
    // Some modules read the initReactI18next / Trans exports even if unused at
    // runtime; return no-ops so importing them from mocked module doesn't throw.
    initReactI18next: { type: '3rdParty', init: () => {} },
    Trans: ({ children }: { children?: unknown }) => children ?? null,
  };
});

vi.mock('@/hooks/useBackoffice', () => {
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

function collectHookErrors() {
  const errors: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '));
  });
  return {
    hookErrors: () =>
      errors.filter(e =>
        /Rendered more hooks|Rendered fewer hooks|Rules of Hooks|change in the order of Hooks/i.test(
          e,
        ),
      ),
    restore: () => spy.mockRestore(),
  };
}

describe('SpaceDetailDrawer', () => {
  beforeEach(() => {
    state.locale = 'pt';
  });
  afterEach(() => cleanup());

  describe('hook order stability', () => {
    it('survives rapid rerenders room → null → room → null → room', () => {
      const guard = collectHookErrors();

      const { rerender } = render(
        <SpaceDetailDrawer open onOpenChange={() => {}} room={validRoom} />,
      );
      expect(screen.getByRole('dialog', { name: /Sala Alpha/ })).toBeInTheDocument();

      expect(() => {
        rerender(<SpaceDetailDrawer open onOpenChange={() => {}} room={null} />);
      }).not.toThrow();
      expect(screen.getByRole('dialog', { name: STRINGS.pt['admin.backoffice.spaceDetailsTitle'] }))
        .toBeInTheDocument();

      expect(() => {
        rerender(<SpaceDetailDrawer open onOpenChange={() => {}} room={validRoom} />);
      }).not.toThrow();
      expect(screen.getByRole('dialog', { name: /Sala Alpha/ })).toBeInTheDocument();

      expect(() => {
        rerender(<SpaceDetailDrawer open onOpenChange={() => {}} room={null} />);
      }).not.toThrow();

      expect(() => {
        rerender(<SpaceDetailDrawer open onOpenChange={() => {}} room={validRoom} />);
      }).not.toThrow();

      const errs = guard.hookErrors();
      expect(errs, `Unexpected hook errors:\n${errs.join('\n')}`).toHaveLength(0);
      guard.restore();
    });
  });

  describe('empty state (room = null)', () => {
    it('renders the empty-state Sheet with an accessible name + status region', () => {
      const guard = collectHookErrors();
      render(<SpaceDetailDrawer open onOpenChange={() => {}} room={null} />);

      const dialog = screen.getByRole('dialog', {
        name: STRINGS.pt['admin.backoffice.spaceDetailsTitle'],
      });
      expect(dialog).toBeInTheDocument();

      // aria-live status region announces the empty state to AT users.
      const status = within(dialog).getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveTextContent(STRINGS.pt['admin.backoffice.spaceDetailsEmptyBody']);

      // Description copy is also present.
      expect(
        within(dialog).getByText(STRINGS.pt['admin.backoffice.spaceDetailsEmpty']),
      ).toBeInTheDocument();

      expect(guard.hookErrors()).toHaveLength(0);
      guard.restore();
    });

    it('uses PT localized strings when locale is pt', () => {
      state.locale = 'pt';
      render(<SpaceDetailDrawer open onOpenChange={() => {}} room={null} />);
      const dialog = screen.getByRole('dialog', {
        name: STRINGS.pt['admin.backoffice.spaceDetailsTitle'],
      });
      expect(within(dialog).getByText(STRINGS.pt['admin.backoffice.spaceDetailsEmpty']))
        .toBeInTheDocument();
      expect(within(dialog).getByText(STRINGS.pt['admin.backoffice.spaceDetailsEmptyBody']))
        .toBeInTheDocument();
    });

    it('uses EN localized strings when locale is en', () => {
      state.locale = 'en';
      render(<SpaceDetailDrawer open onOpenChange={() => {}} room={null} />);
      const dialog = screen.getByRole('dialog', {
        name: STRINGS.en['admin.backoffice.spaceDetailsTitle'],
      });
      expect(within(dialog).getByText(STRINGS.en['admin.backoffice.spaceDetailsEmpty']))
        .toBeInTheDocument();
      expect(within(dialog).getByText(STRINGS.en['admin.backoffice.spaceDetailsEmptyBody']))
        .toBeInTheDocument();
    });

    it('closes the empty-state Sheet when the close control is clicked', () => {
      const guard = collectHookErrors();
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <SpaceDetailDrawer open onOpenChange={onOpenChange} room={null} />,
      );

      const dialog = screen.getByRole('dialog', {
        name: STRINGS.pt['admin.backoffice.spaceDetailsTitle'],
      });
      expect(dialog).toBeInTheDocument();

      const closeButton = within(dialog).getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();

      fireEvent.click(closeButton);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);

      // Simulate the controlled parent closing the drawer.
      rerender(<SpaceDetailDrawer open={false} onOpenChange={onOpenChange} room={null} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      expect(guard.hookErrors()).toHaveLength(0);
      guard.restore();
    });
  });
});

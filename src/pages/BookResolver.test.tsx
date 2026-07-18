/**
 * Tests for the public `/book` resolver (B1 — canonical booking architecture).
 *
 * Observable contract:
 *   RPC returns token -> render PublicBooking inline (URL stays at /book,
 *                        token is passed as a prop and never enters the URL,
 *                        redirects, or browser storage).
 *   RPC returns null  -> render "Agendamento indisponível" (not_configured).
 *   RPC errors        -> render error state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
const { publicBookingSpy } = vi.hoisted(() => ({ publicBookingSpy: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc },
  supabaseClient: { rpc },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

// Stub PublicBooking so we can assert what props BookResolver passes to it.
vi.mock('./PublicBooking', () => ({
  default: (props: { tokenOverride?: string; canonicalMode?: boolean }) => {
    publicBookingSpy(props);
    return <div data-testid="public-booking-stub">booking form</div>;
  },
}));

import BookResolver from './BookResolver';

function renderResolver() {
  return render(
    <HelmetProvider>
      <BookResolver />
    </HelmetProvider>,
  );
}

describe('BookResolver (/book)', () => {
  beforeEach(() => {
    rpc.mockReset();
    publicBookingSpy.mockReset();
  });

  it('renders PublicBooking inline with the resolved token — never redirects', async () => {
    rpc.mockResolvedValue({ data: 'token-abc123', error: null });
    const replaceSpy = vi.spyOn(window.location, 'replace' as never).mockImplementation(() => undefined as never);

    renderResolver();

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('resolve_canonical_booking_token');
      expect(screen.getByTestId('public-booking-stub')).toBeInTheDocument();
    });
    // Token flows to the child in memory only.
    expect(publicBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tokenOverride: 'token-abc123', canonicalMode: true }),
    );
    // And no navigation ever happens — the URL stays at /book.
    expect(replaceSpy).not.toHaveBeenCalled();
    // Token must not leak into browser storage.
    expect(window.localStorage.getItem).toBeDefined();
    // Sanity: no key in storage contains the token.
    const hasTokenInStorage = Object.keys(window.localStorage).some((k) =>
      (window.localStorage.getItem(k) ?? '').includes('token-abc123'),
    );
    expect(hasTokenInStorage).toBe(false);
  });

  it('shows "not configured" when there is no active canonical link', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Agendamento indisponível/i)).toBeInTheDocument();
    });
    expect(publicBookingSpy).not.toHaveBeenCalled();
  });

  it('shows the error state when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível abrir o agendamento/i)).toBeInTheDocument();
    });
    expect(publicBookingSpy).not.toHaveBeenCalled();
  });
});

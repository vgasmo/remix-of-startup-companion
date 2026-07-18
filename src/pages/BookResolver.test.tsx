/**
 * E2E-style tests for the public `/book` resolver.
 *
 * Verifies that `/book` behaves correctly for BOTH:
 *   - "new" links (created after migration 20260718111609 — canonical_url populated)
 *   - "pre-migration" / legacy canonical links (canonical_url still NULL)
 *
 * The resolver relies on the `get_canonical_booking_url` RPC, which filters
 * out rows where canonical_url IS NULL. So the observable contract is:
 *   RPC returns URL  -> hard redirect via window.location.replace
 *   RPC returns null -> render "Agendamento indisponível" (not_configured)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import BookResolver from './BookResolver';
import { mockSupabase } from '@/test/mocks/supabase';

// react-i18next stub so `t(key, fallback)` returns the fallback string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function renderResolver() {
  return render(
    <HelmetProvider>
      <BookResolver />
    </HelmetProvider>,
  );
}

describe('BookResolver (/book)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    // Replace window.location with a spy-friendly stub so we can assert
    // the redirect target without navigating the jsdom window.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace: vi.fn(), href: 'http://localhost/book' },
    });
  });

  it('redirects to the persisted canonical_url when a new link is canonical', async () => {
    const target = 'https://app.example.com/book/token-abc123';
    mockSupabase.functions = mockSupabase.functions ?? { invoke: vi.fn() };
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: target, error: null });

    renderResolver();

    await waitFor(() => {
      expect((mockSupabase as any).rpc).toHaveBeenCalledWith('get_canonical_booking_url');
      expect((window.location.replace as any)).toHaveBeenCalledWith(target);
    });
  });

  it('shows "not configured" when the canonical link is a pre-migration row (canonical_url is null)', async () => {
    // The RPC filters WHERE canonical_url IS NOT NULL, so legacy canonical
    // rows (is_canonical = true but canonical_url = null) resolve to null.
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Agendamento indisponível/i)).toBeInTheDocument();
    });
    expect((window.location.replace as any)).not.toHaveBeenCalled();
  });

  it('shows the error state when the RPC returns an error', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível abrir o agendamento/i)).toBeInTheDocument();
    });
    expect((window.location.replace as any)).not.toHaveBeenCalled();
  });
});

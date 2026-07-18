/**
 * E2E-style tests for the public `/book` resolver.
 *
 * Verifies the resolver contract for BOTH:
 *   - "new" links (created after migration 20260718111609 — canonical_url populated)
 *   - "pre-migration" / legacy canonical links (canonical_url still NULL)
 *
 * The `get_canonical_booking_url` RPC filters out rows where canonical_url IS NULL,
 * so the observable contract at /book is:
 *   RPC returns URL  -> hard redirect via window.location.replace
 *   RPC returns null -> render "Agendamento indisponível" (not_configured)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';

const rpc = vi.fn();

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

// Import AFTER mocks are declared so the component picks up the stubbed supabase.
import BookResolver from './BookResolver';

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
    rpc.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace: vi.fn(), href: 'http://localhost/book' },
    });
  });

  it('redirects to the persisted canonical_url for a new canonical link', async () => {
    const target = 'https://app.example.com/book/token-abc123';
    rpc.mockResolvedValue({ data: target, error: null });

    renderResolver();

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('get_canonical_booking_url');
      expect((window.location.replace as any)).toHaveBeenCalledWith(target);
    });
  });

  it('shows "not configured" for a pre-migration canonical row (canonical_url null)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Agendamento indisponível/i)).toBeInTheDocument();
    });
    expect((window.location.replace as any)).not.toHaveBeenCalled();
  });

  it('shows the error state when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    renderResolver();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível abrir o agendamento/i)).toBeInTheDocument();
    });
    expect((window.location.replace as any)).not.toHaveBeenCalled();
  });
});

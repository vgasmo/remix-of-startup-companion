import { createElement, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  conversations: [
    { id: 'c1', title: 'Linked', participants: [] },
    { id: 'c2', title: 'Other', participants: [] },
  ] as unknown[],
  markRead: vi.fn(),
}));

vi.mock('@/hooks/useMessaging', () => ({
  useConversations: () => ({ data: state.conversations, isLoading: false }),
  useMessages: () => ({ data: [] }),
  useSendMessage: () => ({ mutateAsync: vi.fn() }),
  useMarkConversationRead: () => ({ mutate: state.markRead }),
  useCreateConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { MessagingPanel } from './MessagingPanel';

// jsdom does not implement scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

function SearchParamProbe() {
  const [params] = useSearchParams();
  return createElement('output', { 'data-testid': 'params' }, params.toString());
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function tree(entry: string) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      createElement(MessagingPanel, { open: true, onOpenChange: vi.fn() }),
      createElement(SearchParamProbe),
    ),
  );
}

function renderPanel(initialEntry: string) {
  return render(tree(initialEntry));
}

describe('MessagingPanel deep link', () => {
  beforeEach(() => {
    state.markRead.mockClear();
  });

  it('opens the linked conversation once and consumes the conversation param', async () => {
    renderPanel('/my-workspaces?conversation=c1');
    await waitFor(() => expect(screen.getByText('Linked')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('params').textContent ?? '').not.toContain('conversation='),
    );
  });

  it('does not reselect the linked conversation after Back when the list refetches', async () => {
    const { rerender } = render(tree('/my-workspaces?conversation=c1'));
    // Deep link opened the conversation (Back button visible).
    const back = await screen.findByRole('button', { name: /back|voltar/i });
    back.click();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /back|voltar/i })).toBeNull(),
    );
    // Simulate a conversations refetch (new array reference, as React Query does).
    state.conversations = [...state.conversations];
    rerender(tree('/my-workspaces'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /back|voltar/i })).toBeNull(),
    );
  });
});

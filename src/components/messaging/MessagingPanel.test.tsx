import { createElement, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
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
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { MessagingPanel } from './MessagingPanel';

// jsdom does not implement scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

function SearchParamProbe() {
  const [params] = useSearchParams();
  return createElement('output', { 'data-testid': 'params' }, params.toString());
}

function renderPanel(initialEntry: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(MessagingPanel, { open: true, onOpenChange: vi.fn() }),
      createElement(SearchParamProbe),
    ),
  );
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

  it('does not reselect the linked conversation when the list refetches', async () => {
    const { rerender } = renderPanel('/my-workspaces?conversation=c1');
    await waitFor(() =>
      expect(screen.getByTestId('params').textContent ?? '').not.toContain('conversation='),
    );
    // Simulate a conversations refetch (new array reference, as React Query does).
    state.conversations = [...state.conversations];
    rerender(
      createElement(
        MemoryRouter,
        { initialEntries: ['/my-workspaces'] },
        createElement(MessagingPanel, { open: true, onOpenChange: vi.fn() }),
        createElement(SearchParamProbe),
      ),
    );
    expect(screen.queryByText('Linked')).toBeNull();
  });
});

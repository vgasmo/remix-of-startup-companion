import { describe, expect, it } from 'vitest';
import { conversationLink, legacyConversationLink } from './conversationLink';

describe('conversation links', () => {
  it('opens the requested conversation on an existing destination', () => {
    expect(conversationLink('abc-123')).toBe('/my-workspaces?conversation=abc-123');
  });
  it('preserves the conversation in already sent email links', () => {
    expect(legacyConversationLink('?conversation=abc-123')).toBe('/my-workspaces?conversation=abc-123');
  });
  it('opens the inbox when a legacy link has no conversation', () => {
    expect(legacyConversationLink('')).toBe('/my-workspaces?messaging=open');
  });
  it('encodes identifiers without allowing extra parameters', () => {
    expect(conversationLink('abc&other=1')).toBe('/my-workspaces?conversation=abc%26other%3D1');
  });
});
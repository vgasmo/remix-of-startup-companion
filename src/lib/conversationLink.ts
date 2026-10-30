export function conversationLink(conversationId: string) {
  return `/my-workspaces?conversation=${encodeURIComponent(conversationId)}`;
}

export function legacyConversationLink(search: string) {
  const id = new URLSearchParams(search).get('conversation');
  return id ? conversationLink(id) : '/my-workspaces?messaging=open';
}
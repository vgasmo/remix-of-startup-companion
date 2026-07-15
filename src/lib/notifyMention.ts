/**
 * Fire an "activity mention" notification email + Slack push for a mentioned user.
 * Best-effort — failures are swallowed so they never block the primary action.
 */
import { supabase } from '@/lib/supabaseClient';

export async function notifyMention(args: {
  mentionedUserId: string;
  authorId: string;
  text: string;
  contextUrl?: string;
  workspaceId?: string | null;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-notification-email', {
      body: {
        type: 'activity_mention',
        workspace_id: args.workspaceId ?? null,
        mention: {
          mentioned_user_id: args.mentionedUserId,
          author_id: args.authorId,
          text: args.text,
          context_url: args.contextUrl,
        },
      },
    });
  } catch {
    /* silent — mentions are secondary to the primary action */
  }
}

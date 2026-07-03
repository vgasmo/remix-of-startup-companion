import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { Linkedin, Briefcase, UserPlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/lib/notify';

interface MentorProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  bio: string | null;
  expertise: string[] | null;
}

interface MentorProfileDialogProps {
  mentor: MentorProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAssigned?: boolean;
  /** Founder's active workspace id — required to send a scoped connection request. */
  workspaceId?: string | null;
  /** Existing connection status for this mentor (if any). */
  existingStatus?: 'pending' | 'accepted' | 'declined' | null;
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function MentorProfileDialog({ mentor, open, onOpenChange, isAssigned, workspaceId, existingStatus }: MentorProfileDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const requestConnection = useMutation({
    mutationFn: async () => {
      if (!mentor || !user || !workspaceId) throw new Error('missing_context');
      const { error } = await supabase.from('mentor_connections').insert({
        mentor_id: mentor.id,
        workspace_id: workspaceId,
        founder_id: user.id,
        status: 'pending',
        message: message.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentor-connections'] });
      notify.success(t('mentorsPage.connectionRequested', { defaultValue: 'Pedido de ligação enviado' }));
      setMessage('');
      onOpenChange(false);
    },
    onError: (err: any) => {
      notify.error(err?.message || t('common.error'));
    },
  });

  if (!mentor) return null;

  const canRequest = !!workspaceId && !isAssigned && existingStatus !== 'pending' && existingStatus !== 'accepted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">{mentor.full_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center gap-4">
          <Avatar className="h-20 w-20 border-2 border-primary/20">
            <AvatarImage src={mentor.avatar_url || undefined} />
            <AvatarFallback className="bg-primary text-xl text-primary-foreground">
              {getInitials(mentor.full_name)}
            </AvatarFallback>
          </Avatar>

          <div>
            <h3 className="text-lg font-semibold">{mentor.full_name || t('mentorsPage.unnamedMentor')}</h3>
            {isAssigned && (
              <Badge variant="outline" className="mt-1 gap-1 border-[hsl(var(--success))]/50 text-xs text-[hsl(var(--success))] ">
                {t('mentorsPage.assigned', 'Atribuído')}
              </Badge>
            )}
            {!isAssigned && existingStatus === 'pending' && (
              <Badge variant="outline" className="mt-1 text-xs">
                {t('mentorsPage.requestPending', { defaultValue: 'Pedido pendente' })}
              </Badge>
            )}
          </div>

          {mentor.bio && (
            <p className="text-sm text-muted-foreground leading-relaxed">{mentor.bio}</p>
          )}

          {mentor.expertise && mentor.expertise.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
                <Briefcase className="h-3 w-3" />
                {t('mentorsPage.expertise', 'Áreas de especialidade')}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {mentor.expertise.map(exp => (
                  <Badge key={exp} variant="secondary" className="text-xs">{exp}</Badge>
                ))}
              </div>
            </div>
          )}

          {mentor.linkedin_url && (
            <a
              href={sanitizeUrl(mentor.linkedin_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </a>
          )}

          {canRequest && (
            <div className="w-full space-y-2 border-t border-border pt-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('mentorsPage.connectionMessagePlaceholder', { defaultValue: 'Mensagem opcional para o mentor…' })}
                className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-[70px]"
              />
              <Button
                className="w-full gap-2"
                onClick={() => requestConnection.mutate()}
                disabled={requestConnection.isPending}
              >
                {requestConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {t('mentorsPage.requestConnection', { defaultValue: 'Pedir ligação' })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

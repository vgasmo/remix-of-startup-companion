import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Json } from '@/integrations/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

interface DocumentFeedbackButtonProps {
  documentId: string;
  documentName: string;
  workspaceId: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Request feedback button for documents.
 * Sends notifications to workspace consultants/mentors (not the requester).
 */
export function DocumentFeedbackButton({
  documentId,
  documentName,
  workspaceId,
  variant = 'ghost',
  size = 'sm',
}: DocumentFeedbackButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/workspace/${workspaceId}?tab=documents&doc=${documentId}`;
    await navigator.clipboard.writeText(shareUrl);
    notify.success(t('documentFeedback.linkCopied', { defaultValue: 'Link copiado!' }));
    setShowDialog(false);
  };

  const handleSendRequest = async () => {
    if (!user) return;
    
    setIsSending(true);
    try {
      // Get workspace members who are consultants or mentors (excluding requester)
      const { data: members, error: membersError } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .eq('active', true)
        .in('role', ['consultor', 'mentor_externo', 'admin'])
        .neq('user_id', user.id);

      if (membersError) throw membersError;

      if (!members || members.length === 0) {
        notify.info(t('documentFeedback.noReviewers', { defaultValue: 'Sem consultores ou mentores atribuídos para notificar.' }));
        setShowDialog(false);
        return;
      }

      // Create notifications for each consultant/mentor
      const notifications = members.map(member => ({
        user_id: member.user_id,
        type: 'feedback_request',
        title: t('documentFeedback.requestTitle', { defaultValue: 'Pedido de feedback' }),
        message: t('documentFeedback.requestMessage', {
          defaultValue: '{{user}} pediu feedback sobre "{{doc}}"',
          user: user.email,
          doc: documentName,
        }),
        link: `/workspace/${workspaceId}?tab=documents&doc=${documentId}`,
        metadata: { documentId, workspaceId, requestedBy: user.id, message } as unknown as Json,
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) throw error;

      notify.success(t('documentFeedback.requestSent', { defaultValue: 'Pedido de feedback enviado!' }));
      setShowDialog(false);
      setMessage('');
    } catch (error) {
      notify.error(t('documentFeedback.requestFailed', { defaultValue: 'Falha ao enviar pedido.' }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowDialog(true)}
        title={t('documentFeedback.requestFeedback', { defaultValue: 'Pedir Feedback' })}
      >
        <MessageSquare className="h-4 w-4" />
        {size !== 'icon' && (
          <span className="ml-1.5">{t('documentFeedback.feedback', { defaultValue: 'Feedback' })}</span>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('documentFeedback.title', { defaultValue: 'Pedir Feedback' })}
            </DialogTitle>
            <DialogDescription>
              {t('documentFeedback.description', {
                defaultValue: 'Peça feedback sobre "{{name}}" aos seus consultores e mentores.',
                name: documentName,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedback-message">
                {t('documentFeedback.whatFeedback', { defaultValue: 'Que feedback procura?' })}
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('documentFeedback.placeholder', { defaultValue: 'ex: "Reveja a estrutura do pitch deck e projeções financeiras..."' })}
                rows={3}
              />
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                {t('documentFeedback.orShare', { defaultValue: 'Ou partilhe um link para feedback:' })}
              </p>
              <Button variant="outline" size="sm" onClick={handleCopyLink} className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                {t('documentFeedback.copyLink', { defaultValue: 'Copiar Link' })}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button onClick={handleSendRequest} disabled={isSending}>
              <Send className="h-4 w-4 mr-1.5" />
              {isSending 
                ? t('common.sending', { defaultValue: 'A enviar...' }) 
                : t('documentFeedback.sendRequest', { defaultValue: 'Enviar Pedido' })
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Copy, 
  Mail, 
  Plus,
  Clock,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  useCommunicationLog, 
  useEmailAlias, 
  useCreateEmailAlias,
  useAddCommunication 
} from '@/hooks/useCommunicationLog';
import { format } from 'date-fns';
import { notify } from "@/lib/notify";

interface CommunicationsTabProps {
  workspaceId: string;
}

export function CommunicationsTab({ workspaceId }: CommunicationsTabProps) {
  const { t } = useTranslation();
  const { data: communications, isLoading: loadingComms } = useCommunicationLog(workspaceId);
  const { data: emailAlias, isLoading: loadingAlias } = useEmailAlias(workspaceId);
  const createAlias = useCreateEmailAlias();
  const addCommunication = useAddCommunication();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newComm, setNewComm] = useState({
    from_address: '',
    subject: '',
    body: '',
  });

  const handleCopyAlias = () => {
    if (emailAlias?.alias) {
      navigator.clipboard.writeText(`${emailAlias.alias}@yourdomain.com`);
      notify.success(t('communications.aliasCopied'));
    }
  };

  const handleCreateAlias = async () => {
    await createAlias.mutateAsync(workspaceId);
  };

  const handleAddCommunication = async () => {
    if (!newComm.subject.trim()) {
      notify.error(t('communications.subjectRequired'));
      return;
    }
    
    await addCommunication.mutateAsync({
      workspace_id: workspaceId,
      channel: 'email',
      from_address: newComm.from_address || null,
      subject: newComm.subject,
      body: newComm.body || null,
    });
    
    setNewComm({ from_address: '', subject: '', body: '' });
    setShowAddDialog(false);
  };

  if (loadingComms || loadingAlias) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Forwarding Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            {t('communications.emailCapture')}
          </CardTitle>
          <CardDescription>
            {t('communications.emailCaptureDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailAlias ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm">
                {emailAlias.alias}@yourdomain.com
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyAlias} aria-label={t('common.copy')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={handleCreateAlias} disabled={createAlias.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              {t('communications.generateAlias')}
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {t('communications.forwardEmailsHint')}
          </p>
        </CardContent>
      </Card>

      {/* Communications Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('communications.timeline')}</CardTitle>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('communications.logCommunication')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('communications.logCommunication')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('communications.from')}</label>
                    <Input
                      placeholder="email@example.com"
                      value={newComm.from_address}
                      onChange={(e) => setNewComm({ ...newComm, from_address: e.target.value })}
                    />
                  </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium">{t('communications.subject')} *</label>
                    <Input
                      placeholder={t('communications.subjectPlaceholder')}
                      value={newComm.subject}
                      onChange={(e) => setNewComm({ ...newComm, subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium">{t('communications.content')}</label>
                    <Textarea
                      placeholder={t('communications.contentPlaceholder')}
                      value={newComm.body}
                      onChange={(e) => setNewComm({ ...newComm, body: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <Button 
                    onClick={handleAddCommunication} 
                    className="w-full"
                    disabled={addCommunication.isPending}
                  >
                    {t('communications.saveCommunication')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!communications?.length ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('communications.noCommLogged')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('communications.noCommHint')}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {communications.map((comm) => (
                  <div 
                    key={comm.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="gap-1">
                            <Mail className="h-3 w-3" />
                            {comm.channel}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(comm.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        {comm.from_address && (
                          <p className="text-sm text-muted-foreground">
                            From: {comm.from_address}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <h4 className="font-medium">{comm.subject || t('communications.noSubject')}</h4>
                    
                    {comm.body && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {comm.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

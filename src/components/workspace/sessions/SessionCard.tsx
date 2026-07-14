import { useTranslation } from 'react-i18next';
import { format, isPast } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import {
  FileText,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionSyncStatus } from '@/components/sessions/SessionSyncStatus';

interface SessionCardProps {
  session: any;
  workspaceId: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, workspaceId, canWrite, onEdit, onDelete }: SessionCardProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const isPastSession = isPast(new Date(session.scheduled_at));
  const hasNotes = !!session.notes;
  const hasDecisions = !!session.decisions;

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onEdit}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs text-primary font-medium">
                {format(new Date(session.scheduled_at), 'MMM', { locale })}
              </span>
              <span className="text-lg font-bold text-primary leading-none">
                {format(new Date(session.scheduled_at), 'd', { locale })}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold truncate">{session.title}</h3>
                {isPastSession && !hasNotes && (
                  <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10">
                    {t('sessions.needsNotes')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(session.scheduled_at), 'HH:mm', { locale })}
                </span>
                {session.duration && <span>{session.duration} min</span>}
              </div>
              {session.agenda && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                  {session.agenda}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {hasNotes && (
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    {t('sessions.notes')}
                  </Badge>
                )}
                {hasDecisions && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {t('sessions.decisions')}
                  </Badge>
                )}
                {session.ai_generated_at && (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI
                  </Badge>
                )}
                <SessionSyncStatus
                  sessionId={session.id}
                  workspaceId={workspaceId}
                  syncStatus={session.outlook_sync_status}
                  syncError={session.outlook_sync_error}
                  syncedAt={session.outlook_synced_at}
                  teamsMeetingUrl={session.teams_meeting_url}
                  canWrite={canWrite}
                />
              </div>
            </div>
          </div>
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.moreActions', { defaultValue: 'More actions' })}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

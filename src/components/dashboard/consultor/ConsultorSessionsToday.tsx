import { memo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Sparkles, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from "@/lib/notify";
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface ConsultorSessionsTodayProps {
  upcomingSessions: WorkspaceWithDetails[];
}

export const ConsultorSessionsToday = memo(function ConsultorSessionsToday({ upcomingSessions }: ConsultorSessionsTodayProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {t('consultor.agenda.title')}
          </CardTitle>
          <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">{upcomingSessions.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {upcomingSessions.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('consultor.agenda.empty')}
            </p>
            <Button 
              variant="link" 
              size="sm" 
              className="mt-2"
              onClick={() => navigate('/my-workspaces')}
            >
              {t('consultor.agenda.schedule')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingSessions.map(w => (
              <div
                key={w.id}
                className="relative flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/workspace/${w.id}?tab=agenda`)}
              >
                <Avatar className="h-7 w-7 rounded">
                  <AvatarImage src={w.startup?.logo_url || undefined} alt={w.startup?.name || 'Startup logo'} />
                  <AvatarFallback className="rounded bg-primary/10 text-primary text-[10px] font-semibold">
                    {w.startup?.name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{w.startup?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(w.nextMeetingDate!), "EEE, d MMM 'às' HH:mm", { locale: pt })}
                  </p>
                </div>
                <AiBriefingButton workspaceId={w.id} />
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  {t('consultor.agenda.prep')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

/** Inline AI Briefing button — calls generate-relationship-recap for a workspace */
function AiBriefingButton({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [recap, setRecap] = useState<{ summary: string; key_points: string[]; next_best_actions: string[] } | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (!cooldownEnd) { setCooldownSec(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setCooldownSec(left);
      if (left <= 0) setCooldownEnd(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  const [aiUnavailable, setAiUnavailable] = useState(false);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cooldownSec > 0) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithAuth('generate-relationship-recap', {
        body: { workspace_id: workspaceId, language: i18n.language === 'pt' ? 'pt' : 'en' },
      });
      if (error) throw error;
      setRecap(data as { summary: string; key_points: string[]; next_best_actions: string[] });
      setCooldownEnd(Date.now() + 60000);
    } catch {
      notify.error(t('consultor.aiBriefing.error', { defaultValue: 'Briefing indisponível neste momento. Tente mais tarde.' }));
      setAiUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  if (recap) {
    return (
      <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm rounded-md p-3 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            {t('consultor.aiBriefing.title', { defaultValue: '30-Day Briefing' })}
          </span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setRecap(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{recap.summary}</p>
        {recap.key_points?.length > 0 && (
          <ul className="text-xs space-y-1 mb-2">
            {recap.key_points.slice(0, 3).map((p, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {recap.next_best_actions?.length > 0 && (
          <div className="border-t pt-1.5 mt-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">{t('consultor.aiBriefing.nextActions', { defaultValue: 'Próximas ações' })}</span>
            <ul className="text-xs space-y-0.5 mt-0.5">
              {recap.next_best_actions.slice(0, 2).map((a, i) => (
                <li key={i} className="text-muted-foreground">→ {a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (aiUnavailable) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-7 gap-1 opacity-50"
        onClick={handleGenerate}
        title={t('consultor.aiBriefing.unavailableHint', { defaultValue: 'Briefing IA indisponível — clique para tentar novamente' })}
      >
        <Sparkles className="h-3 w-3" />
        {t('consultor.aiBriefing.retry', { defaultValue: 'Tentar' })}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs h-7 gap-1"
      onClick={handleGenerate}
      disabled={loading || cooldownSec > 0}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {cooldownSec > 0
        ? `${cooldownSec}s`
        : t('consultor.aiBriefing.cta', { defaultValue: 'Briefing' })}
    </Button>
  );
}

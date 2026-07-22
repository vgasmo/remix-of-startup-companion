import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, HeartPulse } from 'lucide-react';
import { notify } from '@/lib/notify';

interface Props {
  workspaceId: string;
}

const SCALE = [1, 2, 3, 4, 5] as const;

export function FounderPulseCard({ workspaceId }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mood, setMood] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [blockers, setBlockers] = useState('');
  const [wins, setWins] = useState('');
  const [ask, setAsk] = useState('');

  const { data: cycle } = useQuery({
    queryKey: ['founder-pulse-cycle', workspaceId],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('founder_pulse_cycles')
        .select('id, period_month, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'open')
        .order('period_month', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });

  const { data: existing } = useQuery({
    queryKey: ['founder-pulse-response', cycle?.id, user?.id],
    queryFn: async () => {
      if (!cycle?.id || !user?.id) return null;
      const { data, error } = await supabase
        .from('founder_pulse_responses')
        .select('id, mood, confidence, blockers, wins, ask, submitted_at')
        .eq('cycle_id', cycle.id)
        .eq('respondent_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!cycle?.id && !!user?.id,
  });

  const monthLabel = useMemo(() => {
    if (!cycle?.period_month) return '';
    return new Date(cycle.period_month).toLocaleDateString(i18n.language, {
      month: 'long',
      year: 'numeric',
    });
  }, [cycle?.period_month, i18n.language]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!cycle?.id || !user?.id) throw new Error('missing cycle');
      if (mood == null || confidence == null) throw new Error('missing scores');
      const { error } = await supabase.from('founder_pulse_responses').insert({
        cycle_id: cycle.id,
        workspace_id: workspaceId,
        respondent_id: user.id,
        mood,
        confidence,
        blockers: blockers.trim() || null,
        wins: wins.trim() || null,
        ask: ask.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(
        i18n.language.startsWith('pt')
          ? 'Pulse enviado — obrigado!'
          : 'Pulse submitted — thank you!'
      );
      qc.invalidateQueries({ queryKey: ['founder-pulse-response', cycle?.id, user?.id] });
    },
    onError: (e: unknown) => {
      notify.error(e instanceof Error ? e.message : 'Erro');
    },
  });

  if (!cycle) return null;

  const pt = i18n.language.startsWith('pt');

  if (existing) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {pt ? 'Pulse do mês registado' : 'Monthly pulse submitted'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{monthLabel}</p>
          </div>
          <Badge variant="secondary">
            {pt ? 'Humor' : 'Mood'} {existing.mood}/5 · {pt ? 'Confiança' : 'Confidence'} {existing.confidence}/5
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4 text-primary" aria-hidden />
          {pt ? 'Pulse do fundador' : 'Founder pulse'}
          <Badge variant="outline" className="ml-2 capitalize font-normal">{monthLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {pt ? 'Como te sentes este mês?' : 'How do you feel this month?'} (1–5)
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label={pt ? 'Humor' : 'Mood'}>
            {SCALE.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={mood === n}
                onClick={() => setMood(n)}
                className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                  mood === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {pt ? 'Confiança na trajetória' : 'Confidence in trajectory'} (1–5)
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label={pt ? 'Confiança' : 'Confidence'}>
            {SCALE.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={confidence === n}
                onClick={() => setConfidence(n)}
                className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                  confidence === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Textarea
            placeholder={pt ? 'Vitórias do mês' : 'Wins this month'}
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            className="resize-y min-h-[70px]"
            maxLength={500}
          />
          <Textarea
            placeholder={pt ? 'Bloqueios / dores' : 'Blockers / pains'}
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            className="resize-y min-h-[70px]"
            maxLength={500}
          />
          <Textarea
            placeholder={pt ? 'Pedido ao ecossistema' : 'Ask from the ecosystem'}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            className="resize-y min-h-[70px]"
            maxLength={500}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => submit.mutate()}
            disabled={mood == null || confidence == null || submit.isPending}
          >
            {submit.isPending
              ? pt ? 'A enviar…' : 'Submitting…'
              : pt ? 'Enviar pulse' : 'Submit pulse'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

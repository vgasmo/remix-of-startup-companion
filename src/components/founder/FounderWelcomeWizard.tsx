/**
 * FounderWelcomeWizard — 3-step onboarding wizard shown once per founder.
 * Persisted via profiles.has_seen_welcome_wizard (DB, not localStorage).
 *
 * Steps:
 *  1) Confirm profile (logo + phone hint)
 *  2) Pick a starter template
 *  3) Schedule first session with assigned consultant
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, FileText, Calendar, User, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";

interface Props {
  workspaceId: string | null;
}

export function FounderWelcomeWizard({ workspaceId }: Props) {
  const auth = useAuth() as any;
  const user = auth?.user;
  const isFounder: boolean = !!auth?.roles?.includes?.('founder');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const { data: shouldShow } = useQuery({
    queryKey: ['welcome-wizard-eligibility', user?.id],
    enabled: !!user?.id && isFounder && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('has_seen_welcome_wizard')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) return false;
      return !!data && (data as any).has_seen_welcome_wizard === false;
    },
    staleTime: 5 * 60 * 1000,
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ has_seen_welcome_wizard: true })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welcome-wizard-eligibility'] });
    },
    onError: (e: any) => notify.error(e?.message ?? t('common.error', 'Erro')),
  });

  const open = !!shouldShow;
  if (!open) return null;

  const totalSteps = 3;
  const progress = ((step + 1) / totalSteps) * 100;

  const close = () => {
    dismiss.mutate();
  };

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else close();
  };

  const goToProfile = () => {
    close();
    navigate('/settings');
  };
  const goToTemplates = () => {
    if (!workspaceId) return;
    close();
    navigate(`/workspace/${workspaceId}?tab=documents`);
  };
  const goToSchedule = () => {
    if (!workspaceId) return;
    close();
    navigate(`/workspace/${workspaceId}?tab=agenda`);
  };

  const steps = [
    {
      icon: User,
      title: t('founderWizard.step1.title', 'Complete o seu perfil'),
      desc: t('founderWizard.step1.desc', 'Adicione logo e contacto para que a equipa o consiga apoiar melhor.'),
      cta: t('founderWizard.step1.cta', 'Abrir definições'),
      action: goToProfile,
    },
    {
      icon: FileText,
      title: t('founderWizard.step2.title', 'Escolha o seu primeiro template'),
      desc: t('founderWizard.step2.desc', 'Lean Canvas ou Pitch Deck — é um bom ponto de partida.'),
      cta: t('founderWizard.step2.cta', 'Ver templates'),
      action: goToTemplates,
    },
    {
      icon: Calendar,
      title: t('founderWizard.step3.title', 'Agende a primeira sessão'),
      desc: t('founderWizard.step3.desc', 'Marque uma conversa com o seu consultor responsável.'),
      cta: t('founderWizard.step3.cta', 'Abrir agenda'),
      action: goToSchedule,
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {t('founderWizard.welcome', 'Bem-vindo')}
            </span>
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.desc}</DialogDescription>
        </DialogHeader>

        <div className="my-4 flex items-center justify-center">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-10 w-10 text-primary" />
          </div>
        </div>

        <Progress value={progress} className="h-1.5" />
        <p className="text-xs text-muted-foreground text-center">
          {t('founderWizard.stepOf', 'Passo {{n}} de {{total}}', { n: step + 1, total: totalSteps })}
        </p>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={close} disabled={dismiss.isPending}>
            {t('founderWizard.skip', 'Saltar por agora')}
          </Button>
          <Button variant="outline" onClick={current.action} disabled={dismiss.isPending}>
            {current.cta}
          </Button>
          <Button onClick={next} disabled={dismiss.isPending}>
            {step < totalSteps - 1 ? (
              <>
                {t('founderWizard.next', 'Seguinte')} <ArrowRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                {t('founderWizard.done', 'Concluir')} <CheckCircle2 className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

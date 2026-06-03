import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Lightbulb,
  Target,
  Users,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  useCreateValueProp,
  useValuePropArtifacts,
  generateValuePropOutputs,
  ValuePropFields,
  ValuePropOutputs,
} from '@/hooks/useValueProp';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';

interface ValuePropWizardProps {
  workspaceId: string;
  onComplete?: () => void;
}

const STEP_KEYS = [
  { key: 'segment', icon: Users },
  { key: 'problem', icon: AlertTriangle },
  { key: 'consequence', icon: Target },
  { key: 'jobs', icon: Lightbulb },
  { key: 'alternatives', icon: Users },
  { key: 'value', icon: Sparkles },
  { key: 'proof', icon: Check },
];

const EXAMPLES: Record<string, string> = {
  segment: 'e.g., "B2B SaaS founders with 10-50 employees who are scaling their sales team"',
  problem: 'e.g., "They spend 40% of their time on manual data entry instead of closing deals"',
  evidence: 'e.g., "Interviewed 15 founders; 12 reported this as top-3 pain point"',
  consequence: 'e.g., "Miss quota by 20-30%, lose good salespeople to frustration"',
  jobs_to_be_done: 'e.g., "Close more deals, reduce admin time, track pipeline accurately"',
  alternatives: 'e.g., "Spreadsheets, basic CRM, or hiring more admins"',
  why_alternatives_fail: 'e.g., "Spreadsheets don\'t scale; CRMs require manual entry"',
  value_prop: 'e.g., "AI-powered CRM that auto-captures data from email/calls"',
  proof: 'e.g., "Beta users saved 10hrs/week; 3 paying pilots at $500/mo"',
};

const STEP_I18N: Record<string, { title: string; desc: string }> = {
  segment: { title: 'Segmento de Clientes', desc: 'Para quem estás a resolver?' },
  problem: { title: 'Problema & Evidência', desc: 'Que dor observaste?' },
  consequence: { title: 'Consequência', desc: 'O que acontece se não resolver?' },
  jobs: { title: 'Jobs to be Done', desc: 'O que precisam de conseguir?' },
  alternatives: { title: 'Alternativas', desc: 'O que usam hoje?' },
  value: { title: 'Proposta de Valor', desc: 'A tua solução única' },
  proof: { title: 'Prova', desc: 'Evidência & credenciais' },
};

export function ValuePropWizard({ workspaceId, onComplete }: ValuePropWizardProps) {
  const { t } = useTranslation();
  const STEPS = STEP_KEYS.map(s => ({
    ...s,
    title: t(`vp.step_${s.key}`, STEP_I18N[s.key]?.title || s.key),
    description: t(`vp.step_${s.key}_desc`, STEP_I18N[s.key]?.desc || ''),
  }));
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [fields, setFields] = useState<ValuePropFields>({
    segment: '',
    problem: '',
    evidence: '',
    consequence: '',
    jobs_to_be_done: '',
    alternatives: '',
    why_alternatives_fail: '',
    value_prop: '',
    proof: '',
  });
  const [outputs, setOutputs] = useState<ValuePropOutputs | null>(null);

  const createMutation = useCreateValueProp(workspaceId);

  const updateField = (key: keyof ValuePropFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return fields.segment.trim().length > 5;
      case 1:
        return fields.problem.trim().length > 10;
      case 2:
        return fields.consequence.trim().length > 5;
      case 3:
        return fields.jobs_to_be_done.trim().length > 5;
      case 4:
        return fields.alternatives.trim().length > 5;
      case 5:
        return fields.value_prop.trim().length > 10;
      case 6:
        return true; // Proof is optional
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Generate outputs
      const generated = generateValuePropOutputs(fields);
      setOutputs(generated);
      setShowResults(true);
    }
  };

  const handleBack = () => {
    if (showResults) {
      setShowResults(false);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    if (!outputs) return;
    if (!workspaceId) {
      notify.info(t('consultor.practiceModeCopyTheOutputs'));
      return;
    }
    try {
      await createMutation.mutateAsync({ fields, outputs });
      notify.success(t('consultor.valuePropositionSaved'));
      onComplete?.();
    } catch (error) {
      notify.error(t('consultor.failedToSave'));
    }
  };

  const canSave = !!workspaceId;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notify.success(t('consultor.copiedToClipboard'));
  };

  if (showResults && outputs) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>{t('vp.title', 'A Tua Proposta de Valor')}</CardTitle>
          </div>
          <CardDescription>{t('vp.review', 'Revê e usa a proposta gerada')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">{t('vp.fullStatement', 'Declaração Completa')}</Label>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(outputs.vp_statement)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t('common.copy', 'Copiar')}
              </Button>
            </div>
            <p className="text-sm">{outputs.vp_statement}</p>
          </div>

          <div className="p-4 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">{t('vp.oneLiner', 'Frase-Chave')}</Label>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(outputs.short_version)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t('common.copy', 'Copiar')}
              </Button>
            </div>
            <p className="text-sm">{outputs.short_version}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">{t('vp.bulletPoints', 'Pontos-Chave para Propostas')}</Label>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(outputs.bullet_points.join('\n• '))}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t('common.copyAll', 'Copiar Tudo')}
              </Button>
            </div>
            <ul className="space-y-1">
              {outputs.bullet_points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('vp.editInputs', 'Editar Respostas')}
            </Button>
            {canSave ? (
              <Button onClick={handleSave} disabled={createMutation.isPending}>
                <Check className="h-4 w-4 mr-2" />
                {t('vp.saveVp', 'Guardar Proposta de Valor')}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onComplete?.()}>
                {t('vp.donePractice', 'Concluído (Modo Prática)')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const StepIcon = STEPS[currentStep].icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StepIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{STEPS[currentStep].title}</CardTitle>
          </div>
          <Badge variant="outline">
            {currentStep + 1} / {STEPS.length}
          </Badge>
        </div>
        <CardDescription>{STEPS[currentStep].description}</CardDescription>
        <Progress value={progress} className="h-1 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step Content */}
        {currentStep === 0 && (
          <div className="space-y-3">
            <Label>{t('vp.targetSegment', 'Qual é o teu segmento-alvo?')}</Label>
            <Textarea
              value={fields.segment}
              onChange={(e) => updateField('segment', e.target.value)}
              placeholder={EXAMPLES.segment}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('vp.segmentHint', 'Sê específico: decisor, dimensão da empresa, indústria')}
            </p>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('vp.problem', 'Que problema enfrentam?')}</Label>
              <Textarea
                value={fields.problem}
                onChange={(e) => updateField('problem', e.target.value)}
                placeholder={EXAMPLES.problem}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('vp.evidence', 'Que evidência tens? (entrevistas, dados)')}</Label>
              <Textarea
                value={fields.evidence}
                onChange={(e) => updateField('evidence', e.target.value)}
                placeholder={EXAMPLES.evidence}
                rows={2}
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-3">
            <Label>{t('vp.consequence', 'O que acontece se não resolverem este problema?')}</Label>
            <Textarea
              value={fields.consequence}
              onChange={(e) => updateField('consequence', e.target.value)}
              placeholder={EXAMPLES.consequence}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('vp.consequenceHint', 'Pensa: receita perdida, tempo desperdiçado, oportunidades perdidas')}
            </p>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-3">
            <Label>{t('vp.jobsToBeDone', 'Que jobs tentam cumprir?')}</Label>
            <Textarea
              value={fields.jobs_to_be_done}
              onChange={(e) => updateField('jobs_to_be_done', e.target.value)}
              placeholder={EXAMPLES.jobs_to_be_done}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('vp.jobsHint', 'Foca em resultados, não em funcionalidades')}
            </p>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('vp.alternatives', 'Que alternativas usam hoje?')}</Label>
              <Textarea
                value={fields.alternatives}
                onChange={(e) => updateField('alternatives', e.target.value)}
                placeholder={EXAMPLES.alternatives}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('vp.whyAlternativesFail', 'Porque falham essas alternativas?')}</Label>
              <Textarea
                value={fields.why_alternatives_fail}
                onChange={(e) => updateField('why_alternatives_fail', e.target.value)}
                placeholder={EXAMPLES.why_alternatives_fail}
                rows={2}
              />
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-3">
            <Label>{t('vp.valueProp', 'Qual é a tua proposta de valor?')}</Label>
            <Textarea
              value={fields.value_prop}
              onChange={(e) => updateField('value_prop', e.target.value)}
              placeholder={EXAMPLES.value_prop}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('vp.valueHint', 'Como resolves o problema melhor que as alternativas?')}
            </p>
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-3">
            <Label>{t('vp.proof', 'Que prova ou credenciais tens?')}</Label>
            <Textarea
              value={fields.proof}
              onChange={(e) => updateField('proof', e.target.value)}
              placeholder={EXAMPLES.proof}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('vp.proofHint', 'KPIs, testemunhos, benchmarks, case studies (opcional mas poderoso)')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back', 'Voltar')}
          </Button>
          <Button onClick={handleNext} disabled={!canProceed()}>
            {currentStep === STEPS.length - 1 ? t('vp.generate', 'Gerar') : t('common.next', 'Seguinte')}
            {currentStep === STEPS.length - 1 ? (
              <Sparkles className="h-4 w-4 ml-2" />
            ) : (
              <ArrowRight className="h-4 w-4 ml-2" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

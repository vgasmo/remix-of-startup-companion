import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays, addWeeks } from 'date-fns';
import {
  Sparkles,
  Check,
  Target,
  TrendingUp,
  Calendar,
  ChevronRight,
  Loader2,
  BookOpen,
  Building2,
} from 'lucide-react';
import { WizardStepTransition } from '@/components/ui/WizardStepTransition';
import { WizardIllustration } from '@/components/ui/WizardIllustration';
import { triggerConfetti } from '@/lib/confetti';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useApplyStageDefaults } from '@/hooks/useKpis';
import { useCreateMilestone } from '@/hooks/useMilestones';
import { useCreateActionItemFull } from '@/hooks/useActionItems';
import { useCreateSession } from '@/hooks/useSessions';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { CompanyDetailsStep } from './CompanyDetailsStep';
import type { StartupStage } from '@/types/database';
import { logger } from '@/lib/logger';

interface WorkspaceOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  startupId?: string;
  stage: StartupStage;
  startupName: string;
  website?: string;
  mainContactName?: string;
  mainContactEmail?: string;
  nif?: string;
  isFounderOnboarding?: boolean;
}

// Bilingual milestone/action templates — content is stored in the DB at creation time
// so we pick the right language when the wizard runs.
type MilestoneTemplate = {
  title: { pt: string; en: string };
  description: { pt: string; en: string };
  weeksOut: number;
  actions: { title: { pt: string; en: string }; daysOffset: number }[];
};

const STAGE_MILESTONES: Record<StartupStage, MilestoneTemplate[]> = {
  ideation: [
    {
      title: { en: 'Complete problem validation interviews', pt: 'Completar entrevistas de validação do problema' },
      description: { en: 'Conduct 10+ customer interviews to validate the problem', pt: 'Realizar 10+ entrevistas com clientes para validar o problema' },
      weeksOut: 2,
      actions: [
        { title: { en: 'Create interview script with key questions', pt: 'Criar guião de entrevista com perguntas-chave' }, daysOffset: 2 },
        { title: { en: 'Identify and reach out to 15 potential interviewees', pt: 'Identificar e contactar 15 potenciais entrevistados' }, daysOffset: 4 },
        { title: { en: 'Conduct first 5 interviews', pt: 'Realizar as primeiras 5 entrevistas' }, daysOffset: 8 },
        { title: { en: 'Synthesize findings and document patterns', pt: 'Sintetizar descobertas e documentar padrões' }, daysOffset: 12 },
      ]
    },
    {
      title: { en: 'Define value proposition', pt: 'Definir proposta de valor' },
      description: { en: 'Document clear value proposition and unique selling points', pt: 'Documentar proposta de valor clara e diferenciais' },
      weeksOut: 3,
      actions: [
        { title: { en: 'Analyze competitor positioning', pt: 'Analisar posicionamento da concorrência' }, daysOffset: 2 },
        { title: { en: 'Draft value proposition canvas', pt: 'Elaborar canvas de proposta de valor' }, daysOffset: 5 },
        { title: { en: 'Test messaging with 5 potential customers', pt: 'Testar mensagem com 5 potenciais clientes' }, daysOffset: 10 },
      ]
    },
    {
      title: { en: 'Create initial business model canvas', pt: 'Criar Canvas de Modelo de Negócio inicial' },
      description: { en: 'Complete first iteration of BMC', pt: 'Completar a primeira iteração do BMC' },
      weeksOut: 4,
      actions: [
        { title: { en: 'Complete customer segments and channels sections', pt: 'Completar secções de segmentos de clientes e canais' }, daysOffset: 5 },
        { title: { en: 'Define revenue streams and cost structure', pt: 'Definir fontes de receita e estrutura de custos' }, daysOffset: 10 },
        { title: { en: 'Review BMC with mentor/advisor', pt: 'Rever BMC com mentor/consultor' }, daysOffset: 20 },
      ]
    },
    {
      title: { en: 'Identify early adopters', pt: 'Identificar early adopters' },
      description: { en: 'Build list of 50+ potential early adopter contacts', pt: 'Construir lista de 50+ contactos de potenciais early adopters' },
      weeksOut: 6,
      actions: [
        { title: { en: 'Define early adopter profile and criteria', pt: 'Definir perfil e critérios de early adopter' }, daysOffset: 3 },
        { title: { en: 'Research and list 20 potential early adopters', pt: 'Pesquisar e listar 20 potenciais early adopters' }, daysOffset: 14 },
        { title: { en: 'Reach out and qualify interest from 10 contacts', pt: 'Contactar e qualificar interesse de 10 contactos' }, daysOffset: 28 },
      ]
    },
  ],
  validation: [
    {
      title: { en: 'Launch landing page', pt: 'Lançar landing page' },
      description: { en: 'Create and deploy landing page with signup form', pt: 'Criar e publicar landing page com formulário de registo' },
      weeksOut: 2,
      actions: [
        { title: { en: 'Write compelling headline and copy', pt: 'Escrever título e copy apelativos' }, daysOffset: 2 },
        { title: { en: 'Design and build landing page', pt: 'Desenhar e construir a landing page' }, daysOffset: 7 },
        { title: { en: 'Set up analytics and email capture', pt: 'Configurar analytics e captura de email' }, daysOffset: 10 },
        { title: { en: 'Launch and share with initial contacts', pt: 'Lançar e partilhar com contactos iniciais' }, daysOffset: 12 },
      ]
    },
    {
      title: { en: 'Run first experiment', pt: 'Executar primeira experiência' },
      description: { en: 'Design and execute first validation experiment', pt: 'Conceber e executar a primeira experiência de validação' },
      weeksOut: 3,
      actions: [
        { title: { en: 'Define hypothesis and success metrics', pt: 'Definir hipótese e métricas de sucesso' }, daysOffset: 2 },
        { title: { en: 'Design experiment methodology', pt: 'Desenhar metodologia da experiência' }, daysOffset: 5 },
        { title: { en: 'Execute experiment', pt: 'Executar experiência' }, daysOffset: 14 },
        { title: { en: 'Analyze results and document learnings', pt: 'Analisar resultados e documentar aprendizagens' }, daysOffset: 18 },
      ]
    },
    {
      title: { en: 'Collect 100+ signups', pt: 'Recolher 100+ registos' },
      description: { en: 'Achieve 100 email signups from landing page', pt: 'Atingir 100 registos de email na landing page' },
      weeksOut: 5,
      actions: [
        { title: { en: 'Share landing page on social media', pt: 'Partilhar landing page nas redes sociais' }, daysOffset: 3 },
        { title: { en: 'Reach out to communities and groups', pt: 'Contactar comunidades e grupos' }, daysOffset: 10 },
        { title: { en: 'Run small paid ad campaign', pt: 'Lançar pequena campanha de anúncios pagos' }, daysOffset: 20 },
      ]
    },
    {
      title: { en: 'Complete solution interviews', pt: 'Completar entrevistas de solução' },
      description: { en: 'Validate proposed solution with 20+ prospects', pt: 'Validar solução proposta com 20+ prospects' },
      weeksOut: 6,
      actions: [
        { title: { en: 'Create solution mockups or prototype', pt: 'Criar mockups ou protótipo da solução' }, daysOffset: 5 },
        { title: { en: 'Schedule interviews with signups', pt: 'Agendar entrevistas com registados' }, daysOffset: 10 },
        { title: { en: 'Conduct 10 solution interviews', pt: 'Realizar 10 entrevistas de solução' }, daysOffset: 25 },
        { title: { en: 'Document feedback and iterate', pt: 'Documentar feedback e iterar' }, daysOffset: 35 },
      ]
    },
  ],
  mvp: [
    {
      title: { en: 'Define MVP scope', pt: 'Definir âmbito do MVP' },
      description: { en: 'Document core MVP features and success criteria', pt: 'Documentar funcionalidades core e critérios de sucesso do MVP' },
      weeksOut: 1,
      actions: [
        { title: { en: 'List all potential features', pt: 'Listar todas as funcionalidades potenciais' }, daysOffset: 1 },
        { title: { en: 'Prioritize to core must-haves only', pt: 'Priorizar apenas funcionalidades essenciais' }, daysOffset: 3 },
        { title: { en: 'Define success metrics for MVP', pt: 'Definir métricas de sucesso do MVP' }, daysOffset: 5 },
      ]
    },
    {
      title: { en: 'Complete MVP development', pt: 'Completar desenvolvimento do MVP' },
      description: { en: 'Build and deploy minimum viable product', pt: 'Construir e publicar o produto mínimo viável' },
      weeksOut: 6,
      actions: [
        { title: { en: 'Set up development environment', pt: 'Configurar ambiente de desenvolvimento' }, daysOffset: 3 },
        { title: { en: 'Build core feature #1', pt: 'Desenvolver funcionalidade core #1' }, daysOffset: 14 },
        { title: { en: 'Build core feature #2', pt: 'Desenvolver funcionalidade core #2' }, daysOffset: 28 },
        { title: { en: 'Deploy and test MVP', pt: 'Publicar e testar MVP' }, daysOffset: 38 },
      ]
    },
    {
      title: { en: 'Onboard first 10 users', pt: 'Integrar os primeiros 10 utilizadores' },
      description: { en: 'Get first paying customers or active users', pt: 'Obter os primeiros clientes pagantes ou utilizadores ativos' },
      weeksOut: 8,
      actions: [
        { title: { en: 'Invite early adopters to try MVP', pt: 'Convidar early adopters a testar o MVP' }, daysOffset: 5 },
        { title: { en: 'Provide hands-on onboarding support', pt: 'Fornecer apoio de onboarding personalizado' }, daysOffset: 15 },
        { title: { en: 'Collect feedback and fix critical bugs', pt: 'Recolher feedback e corrigir bugs críticos' }, daysOffset: 40 },
      ]
    },
    {
      title: { en: 'Collect feedback and iterate', pt: 'Recolher feedback e iterar' },
      description: { en: 'Document learnings and plan next iteration', pt: 'Documentar aprendizagens e planear próxima iteração' },
      weeksOut: 10,
      actions: [
        { title: { en: 'Conduct user feedback sessions', pt: 'Realizar sessões de feedback com utilizadores' }, daysOffset: 10 },
        { title: { en: 'Analyze usage data and patterns', pt: 'Analisar dados de utilização e padrões' }, daysOffset: 30 },
        { title: { en: 'Prioritize next iteration features', pt: 'Priorizar funcionalidades da próxima iteração' }, daysOffset: 50 },
      ]
    },
  ],
  growth: [
    {
      title: { en: 'Define growth metrics', pt: 'Definir métricas de crescimento' },
      description: { en: 'Establish key growth KPIs and targets', pt: 'Estabelecer KPIs e metas de crescimento' },
      weeksOut: 1,
      actions: [
        { title: { en: 'Identify north star metric', pt: 'Identificar métrica norte' }, daysOffset: 2 },
        { title: { en: 'Set up analytics dashboard', pt: 'Configurar dashboard de analytics' }, daysOffset: 4 },
        { title: { en: 'Define monthly growth targets', pt: 'Definir metas mensais de crescimento' }, daysOffset: 6 },
      ]
    },
    {
      title: { en: 'Launch marketing campaigns', pt: 'Lançar campanhas de marketing' },
      description: { en: 'Execute first paid acquisition campaigns', pt: 'Executar primeiras campanhas de aquisição paga' },
      weeksOut: 3,
      actions: [
        { title: { en: 'Research target audience and channels', pt: 'Pesquisar público-alvo e canais' }, daysOffset: 3 },
        { title: { en: 'Create ad creatives and copy', pt: 'Criar criativos e copy de anúncios' }, daysOffset: 10 },
        { title: { en: 'Launch and monitor campaigns', pt: 'Lançar e monitorizar campanhas' }, daysOffset: 15 },
        { title: { en: 'Optimize based on performance', pt: 'Otimizar com base no desempenho' }, daysOffset: 18 },
      ]
    },
    {
      title: { en: 'Achieve 100 active users', pt: 'Atingir 100 utilizadores ativos' },
      description: { en: 'Reach 100 monthly active users milestone', pt: 'Atingir o marco de 100 utilizadores ativos mensais' },
      weeksOut: 8,
      actions: [
        { title: { en: 'Implement referral program', pt: 'Implementar programa de referência' }, daysOffset: 10 },
        { title: { en: 'Launch content marketing strategy', pt: 'Lançar estratégia de content marketing' }, daysOffset: 25 },
        { title: { en: 'Optimize onboarding for activation', pt: 'Otimizar onboarding para ativação' }, daysOffset: 40 },
      ]
    },
    {
      title: { en: 'Optimize conversion funnel', pt: 'Otimizar funil de conversão' },
      description: { en: 'Identify and fix key conversion bottlenecks', pt: 'Identificar e corrigir bottlenecks de conversão' },
      weeksOut: 10,
      actions: [
        { title: { en: 'Map full user journey and funnel', pt: 'Mapear jornada completa e funil do utilizador' }, daysOffset: 5 },
        { title: { en: 'Identify biggest drop-off points', pt: 'Identificar maiores pontos de desistência' }, daysOffset: 20 },
        { title: { en: 'Run A/B tests on key pages', pt: 'Executar testes A/B em páginas-chave' }, daysOffset: 50 },
      ]
    },
  ],
  scale: [
    {
      title: { en: 'Hire key team members', pt: 'Contratar membros-chave da equipa' },
      description: { en: 'Recruit for critical growth positions', pt: 'Recrutar para posições críticas de crescimento' },
      weeksOut: 4,
      actions: [
        { title: { en: 'Define roles and job descriptions', pt: 'Definir funções e descrições de cargo' }, daysOffset: 3 },
        { title: { en: 'Post jobs and source candidates', pt: 'Publicar vagas e encontrar candidatos' }, daysOffset: 7 },
        { title: { en: 'Interview and select candidates', pt: 'Entrevistar e selecionar candidatos' }, daysOffset: 21 },
      ]
    },
    {
      title: { en: 'Expand to new market/segment', pt: 'Expandir para novo mercado/segmento' },
      description: { en: 'Launch in second market or customer segment', pt: 'Lançar em segundo mercado ou segmento de clientes' },
      weeksOut: 8,
      actions: [
        { title: { en: 'Research new market opportunity', pt: 'Pesquisar oportunidade no novo mercado' }, daysOffset: 10 },
        { title: { en: 'Adapt product for new segment', pt: 'Adaptar produto para novo segmento' }, daysOffset: 35 },
        { title: { en: 'Launch and test in new market', pt: 'Lançar e testar no novo mercado' }, daysOffset: 50 },
      ]
    },
    {
      title: { en: 'Implement automation', pt: 'Implementar automação' },
      description: { en: 'Automate key operational processes', pt: 'Automatizar processos operacionais-chave' },
      weeksOut: 10,
      actions: [
        { title: { en: 'Audit current manual processes', pt: 'Auditar processos manuais atuais' }, daysOffset: 5 },
        { title: { en: 'Prioritize automation opportunities', pt: 'Priorizar oportunidades de automação' }, daysOffset: 15 },
        { title: { en: 'Implement top 3 automations', pt: 'Implementar as 3 principais automações' }, daysOffset: 55 },
      ]
    },
    {
      title: { en: 'Prepare for funding round', pt: 'Preparar ronda de investimento' },
      description: { en: 'Complete materials for next funding round', pt: 'Completar materiais para próxima ronda de investimento' },
      weeksOut: 12,
      actions: [
        { title: { en: 'Update pitch deck', pt: 'Atualizar pitch deck' }, daysOffset: 20 },
        { title: { en: 'Prepare financial projections', pt: 'Preparar projeções financeiras' }, daysOffset: 40 },
        { title: { en: 'Build investor target list', pt: 'Construir lista de investidores-alvo' }, daysOffset: 60 },
        { title: { en: 'Start investor outreach', pt: 'Iniciar contacto com investidores' }, daysOffset: 75 },
      ]
    },
  ],
};

// Helper to pick the right language string from a bilingual template
function pickLang(bilingual: { pt: string; en: string }, lang: string): string {
  return lang === 'pt' ? bilingual.pt : bilingual.en;
}

type WizardStep = 'welcome' | 'company' | 'kpis' | 'milestones' | 'meeting' | 'complete';

export function WorkspaceOnboardingWizard({
  open,
  onOpenChange,
  workspaceId,
  startupId,
  stage,
  startupName: initialStartupName,
  website: initialWebsite = '',
  mainContactName: initialContactName = '',
  mainContactEmail: initialContactEmail = '',
  nif: initialNif = '',
  isFounderOnboarding = false,
}: WorkspaceOnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [prevStep, setPrevStep] = useState<WizardStep>('welcome');
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'pt' ? 'pt' : 'en';
  const [isProcessing, setIsProcessing] = useState(false);
  const confettiTriggered = useRef(false);
  
  // Company details state
  const [companyDetails, setCompanyDetails] = useState({
    startupName: initialStartupName,
    website: initialWebsite,
    mainContactName: initialContactName,
    mainContactEmail: initialContactEmail,
    nif: initialNif,
  });
  const [isNifValid, setIsNifValid] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  
  // Step results tracking
  const [kpisApplied, setKpisApplied] = useState(false);
  const [milestonesCreated, setMilestonesCreated] = useState(false);
  const [meetingScheduled, setMeetingScheduled] = useState(false);
  
  // Milestone selections - initialize with current stage
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(
    () => new Set(STAGE_MILESTONES[stage]?.map((_, i) => i) || [])
  );
  
  // Meeting form
  const [meetingTitle, setMeetingTitle] = useState(`Kickoff Meeting - ${initialStartupName}`);
  const [meetingDate, setMeetingDate] = useState(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [meetingTime, setMeetingTime] = useState('10:00');
  const [meetingDuration, setMeetingDuration] = useState('60');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep('welcome');
      setPrevStep('welcome');
      setCompanyDetails({
        startupName: initialStartupName,
        website: initialWebsite,
        mainContactName: initialContactName,
        mainContactEmail: initialContactEmail,
        nif: initialNif,
      });
      setIsNifValid(false);
      setCompanySaved(false);
      setKpisApplied(false);
      setMilestonesCreated(false);
      setMeetingScheduled(false);
      setSelectedMilestones(new Set(STAGE_MILESTONES[stage]?.map((_, i) => i) || []));
      setMeetingTitle(`Kickoff Meeting - ${initialStartupName}`);
      setMeetingDate(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
      setMeetingTime('10:00');
      setMeetingDuration('60');
      confettiTriggered.current = false;
    }
  }, [open, stage, initialStartupName, initialWebsite, initialContactName, initialContactEmail, initialNif]);

  // Trigger confetti on completion
  useEffect(() => {
    if (currentStep === 'complete' && !confettiTriggered.current) {
      confettiTriggered.current = true;
      triggerConfetti();
    }
  }, [currentStep]);

  // Build steps dynamically based on whether this is founder onboarding
  const steps: { key: WizardStep; label: string; icon: React.ElementType }[] = isFounderOnboarding
    ? [
        { key: 'welcome', label: t('onboardingWizard.stepWelcome', { defaultValue: 'Welcome' }), icon: Sparkles },
        { key: 'company', label: t('onboardingWizard.stepCompany', { defaultValue: 'Company' }), icon: Building2 },
        { key: 'kpis', label: t('onboardingWizard.stepKpis', { defaultValue: 'KPIs' }), icon: TrendingUp },
        { key: 'milestones', label: t('onboardingWizard.stepMilestones', { defaultValue: 'Milestones' }), icon: Target },
        { key: 'meeting', label: t('onboardingWizard.stepMeeting', { defaultValue: 'Meeting' }), icon: Calendar },
        { key: 'complete', label: t('onboardingWizard.stepDone', { defaultValue: 'Done' }), icon: Check },
      ]
    : [
        { key: 'welcome', label: t('onboardingWizard.stepWelcome', { defaultValue: 'Welcome' }), icon: Sparkles },
        { key: 'kpis', label: t('onboardingWizard.stepKpis', { defaultValue: 'KPIs' }), icon: TrendingUp },
        { key: 'milestones', label: t('onboardingWizard.stepMilestones', { defaultValue: 'Milestones' }), icon: Target },
        { key: 'meeting', label: t('onboardingWizard.stepMeeting', { defaultValue: 'Meeting' }), icon: Calendar },
        { key: 'complete', label: t('onboardingWizard.stepDone', { defaultValue: 'Done' }), icon: Check },
      ];

  // Helper for step transitions
  const goToStep = (step: WizardStep) => {
    setPrevStep(currentStep);
    setCurrentStep(step);
  };
  
  const direction = steps.findIndex(s => s.key === currentStep) > steps.findIndex(s => s.key === prevStep) ? 'forward' : 'backward';

  const applyDefaults = useApplyStageDefaults(workspaceId);
  const createMilestone = useCreateMilestone(workspaceId);
  const createAction = useCreateActionItemFull(workspaceId);
  const createSession = useCreateSession(workspaceId);

  const stageMilestones = STAGE_MILESTONES[stage];

  const handleApplyKpis = async () => {
    setIsProcessing(true);
    try {
      const result = await applyDefaults.mutateAsync(stage);
      setKpisApplied(true);
      if (result.length > 0) {
        notify.success(t('onboardingWizard.kpisApplied', { defaultValue: 'KPIs applied successfully' }));
      } else {
        notify.info(t('onboardingWizard.kpisAlreadyConfigured', { defaultValue: 'Default KPIs already configured' }));
      }
      goToStep('milestones');
    } catch {
      notify.error(t('onboardingWizard.kpisFailed', { defaultValue: 'Failed to apply KPI defaults' }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateMilestones = async () => {
    setIsProcessing(true);
    try {
      const milestonesToCreate = stageMilestones.filter((_, i) => selectedMilestones.has(i));
      let totalActionsCreated = 0;
      
      for (let i = 0; i < milestonesToCreate.length; i++) {
        const m = milestonesToCreate[i];
        // Create the milestone first
        const createdMilestone = await createMilestone.mutateAsync({
          title: pickLang(m.title, lang),
          description: pickLang(m.description, lang),
          target_date: format(addWeeks(new Date(), m.weeksOut), 'yyyy-MM-dd'),
          position: i,
        });
        
        // Create actions for this milestone
        for (const action of m.actions) {
          await createAction.mutateAsync({
            title: pickLang(action.title, lang),
            milestone_id: createdMilestone.id,
            due_date: format(addDays(new Date(), action.daysOffset), 'yyyy-MM-dd'),
            priority: 'medium',
          });
          totalActionsCreated++;
        }
      }
      
      setMilestonesCreated(true);
      notify.success(t('onboardingWizard.milestonesCreated', { defaultValue: 'Milestones created successfully' }));
      goToStep('meeting');
    } catch {
      notify.error(t('onboardingWizard.milestonesFailed', { defaultValue: 'Failed to create milestones' }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScheduleSession = async () => {
    if (!meetingTitle.trim()) {
      notify.error(t('onboardingWizard.meetingTitleRequired', { defaultValue: 'Please enter a session title' }));
      return;
    }
    
    setIsProcessing(true);
    try {
      const startsAt = new Date(`${meetingDate}T${meetingTime}`);
      const duration = parseInt(meetingDuration);
      
      await createSession.mutateAsync({
        title: meetingTitle,
        agenda: 'Initial kickoff session to align on goals and next steps.',
        scheduled_at: startsAt.toISOString(),
        duration: duration,
        notes: null,
        decisions: null,
      });
      
      setMeetingScheduled(true);
      notify.success(t('onboardingWizard.meetingScheduled', { defaultValue: 'Session scheduled' }));
      goToStep('complete');
    } catch {
      notify.error(t('onboardingWizard.meetingFailed', { defaultValue: 'Failed to schedule session' }));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle saving company details
  const handleSaveCompanyDetails = async () => {
    if (!startupId) {
      goToStep('kpis');
      return;
    }
    
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('startups')
        .update({
          name: companyDetails.startupName,
          website: companyDetails.website || null,
          main_contact_name: companyDetails.mainContactName || null,
          main_contact_email: companyDetails.mainContactEmail || null,
          nif: companyDetails.nif || null,
        })
        .eq('id', startupId);
      
      if (error) throw error;
      
      setCompanySaved(true);
      notify.success(t('onboardingWizard.companySaved', { defaultValue: 'Company details saved' }));
      goToStep('kpis');
    } catch (err) {
      logger.error('Failed to save company details', {}, err);
      notify.error(t('onboardingWizard.companyFailed', { defaultValue: 'Failed to save company details' }));
    } finally {
      setIsProcessing(false);
    }
  };

  // Mark onboarding as complete only when wizard reaches the 'complete' step
  const handleCompleteOnboarding = async () => {
    if (isFounderOnboarding) {
      try {
        await supabase
          .from('workspaces')
          .update({ needs_onboarding: false })
          .eq('id', workspaceId);
        logger.debug('onboarding_completed', { workspaceId });
      } catch (err) {
        logger.error('onboarding_completion_failed', { workspaceId }, err);
      }
    }
    onOpenChange(false);
  };

  const handleClose = () => {
    // Close without marking complete — onboarding remains incomplete
    onOpenChange(false);
  };

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('onboardingWizard.title', { defaultValue: 'Workspace Setup Wizard' })}
          </DialogTitle>
          <DialogDescription>
            {t('onboardingWizard.setupDesc', { defaultValue: "Let's set up your workspace for success in the {{stage}} stage.", stage })}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStepIndex;
            const isComplete = idx < currentStepIndex;
            
            return (
              <div key={step.key} className="flex items-center">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isComplete && 'bg-primary/20 text-primary',
                    !isActive && !isComplete && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                {idx < steps.length - 1 && (
                  <ChevronRight className={cn(
                    'h-4 w-4 mx-1',
                    isComplete ? 'text-primary' : 'text-muted-foreground/50'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[280px] overflow-hidden">
          <WizardStepTransition stepKey={currentStep} direction={direction}>
            {currentStep === 'welcome' && (
              <div className="text-center py-6 space-y-4">
                <WizardIllustration type="welcome" size="lg" className="mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">{t('onboardingWizard.welcomeTo', { defaultValue: 'Welcome to {{name}}!', name: companyDetails.startupName })}</h3>
                  <p className="text-muted-foreground text-sm">
                    {isFounderOnboarding 
                      ? t('onboardingWizard.founderWelcomeDesc', { defaultValue: 'This wizard will help you complete your company profile, set up KPIs, milestones, and schedule your first meeting.' })
                      : t('onboardingWizard.staffWelcomeDesc', { defaultValue: 'This wizard will help you set up your workspace with stage-appropriate KPIs, initial milestones, and schedule your first meeting.' })}
                  </p>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-left">
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-primary">{t('onboardingWizard.proTip', { defaultValue: 'Pro tip: Use Playbooks' })}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('onboardingWizard.proTipDesc', { defaultValue: 'After setup, visit the <strong>Playbooks</strong> tab to instantly apply pre-built milestone and action templates specific to your stage.' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'company' && (
              <CompanyDetailsStep
                startupName={companyDetails.startupName}
                website={companyDetails.website}
                mainContactName={companyDetails.mainContactName}
                mainContactEmail={companyDetails.mainContactEmail}
                nif={companyDetails.nif}
                onUpdate={(updates) => setCompanyDetails(prev => ({ ...prev, ...updates }))}
                onNifValid={setIsNifValid}
              />
            )}

            {currentStep === 'kpis' && (
              <div className="space-y-4">
                <div className="text-center">
                  <WizardIllustration type="kpis" className="mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">{t('onboardingWizard.setupKpis', { defaultValue: 'Setup KPI Tracking' })}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('onboardingWizard.setupKpisDesc', { defaultValue: "We'll add the recommended KPIs for the {{stage}} stage.", stage })}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="text-muted-foreground">
                    {t('onboardingWizard.kpisExplain', { defaultValue: 'This will add key metrics like revenue, burn rate, active users, and more based on what matters most at your current stage.' })}
                  </p>
                </div>
                {kpisApplied && (
                  <div className="flex items-center gap-2 text-[hsl(var(--success))] justify-center">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">{t('onboardingWizard.kpisApplied', { defaultValue: 'KPIs applied successfully' })}</span>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'milestones' && (
              <div className="space-y-4">
                <div className="text-center">
                  <WizardIllustration type="milestones" className="mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">{t('onboardingWizard.createMilestones', { defaultValue: 'Create Initial Milestones' })}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('onboardingWizard.selectMilestones', { defaultValue: 'Select the milestones to add for your {{stage}} stage journey.', stage })}
                  </p>
                </div>
                <ScrollArea className="h-[180px]">
                  <div className="space-y-2">
                    {stageMilestones.map((m, idx) => (
                      <label
                        key={idx}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                          selectedMilestones.has(idx) ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 hover:bg-muted/50'
                        )}
                      >
                        <Checkbox
                          checked={selectedMilestones.has(idx)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedMilestones);
                            if (checked) newSet.add(idx);
                            else newSet.delete(idx);
                            setSelectedMilestones(newSet);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{pickLang(m.title, lang)}</p>
                          <p className="text-xs text-muted-foreground">{pickLang(m.description, lang)}</p>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {t('onboardingWizard.weeks', { defaultValue: '~{{count}} weeks', count: m.weeksOut })}
                          </Badge>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
                {milestonesCreated && (
                  <div className="flex items-center gap-2 text-[hsl(var(--success))] justify-center">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">{t('onboardingWizard.milestonesCreated', { defaultValue: 'Milestones created successfully' })}</span>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'meeting' && (
              <div className="space-y-4">
                <div className="text-center">
                  <WizardIllustration type="meeting" className="mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">{t('onboardingWizard.scheduleKickoff', { defaultValue: 'Schedule Kickoff Meeting' })}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('onboardingWizard.scheduleKickoffDesc', { defaultValue: 'Set up your first team meeting to align on goals.' })}
                  </p>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="meeting-title">{t('onboardingWizard.meetingTitle', { defaultValue: 'Meeting Title' })}</Label>
                    <Input
                      id="meeting-title"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="meeting-date">{t('onboardingWizard.meetingDate', { defaultValue: 'Date' })}</Label>
                      <Input
                        id="meeting-date"
                        type="date"
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="meeting-time">{t('onboardingWizard.meetingTime', { defaultValue: 'Time' })}</Label>
                      <Input
                        id="meeting-time"
                        type="time"
                        value={meetingTime}
                        onChange={(e) => setMeetingTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="meeting-duration">{t('onboardingWizard.meetingDuration', { defaultValue: 'Duration' })}</Label>
                      <Input
                        id="meeting-duration"
                        type="number"
                        value={meetingDuration}
                        onChange={(e) => setMeetingDuration(e.target.value)}
                        min="15"
                        max="180"
                      />
                    </div>
                  </div>
                </div>
                {meetingScheduled && (
                  <div className="flex items-center gap-2 text-[hsl(var(--success))] justify-center">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">{t('onboardingWizard.meetingScheduled', { defaultValue: 'Meeting scheduled successfully' })}</span>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'complete' && (
              <div className="text-center py-6 space-y-4">
                <WizardIllustration type="complete" size="lg" className="mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">{t('onboardingWizard.allSet', { defaultValue: "You're all set! 🎉" })}</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('onboardingWizard.allSetDesc', { defaultValue: 'Your workspace is ready to go. You can now track KPIs, manage milestones, and collaborate with your team.' })}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-sm">
                  {kpisApplied && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> {t('onboardingWizard.kpisConfigured', { defaultValue: 'KPIs configured' })}
                    </Badge>
                  )}
                  {milestonesCreated && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> {t('onboardingWizard.milestonesCreatedBadge', { defaultValue: 'Milestones created' })}
                    </Badge>
                  )}
                  {meetingScheduled && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> {t('onboardingWizard.meetingScheduledBadge', { defaultValue: 'Meeting scheduled' })}
                    </Badge>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-3 mt-2">
                  <div className="flex items-center gap-2 justify-center text-sm">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">
                      {t('onboardingWizard.nextStepPlaybooks', { defaultValue: 'Next step: Check <strong>Playbooks</strong> tab for stage-specific templates' })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </WizardStepTransition>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {currentStep !== 'complete' && currentStep !== 'welcome' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const prev = steps[currentStepIndex - 1]?.key;
                if (prev) goToStep(prev);
              }}
              disabled={isProcessing}
            >
              {t('onboardingWizard.back', { defaultValue: 'Back' })}
            </Button>
          )}
          
          {currentStep === 'welcome' && (
            <Button 
              type="button" 
              onClick={() => goToStep(isFounderOnboarding ? 'company' : 'kpis')} 
              className="w-full sm:w-auto"
            >
              {t('onboardingWizard.getStarted', { defaultValue: 'Get Started' })}
              <ChevronRight className="h-4 w-4 ml-1" />
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {currentStep === 'company' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => goToStep('kpis')} disabled={isProcessing}>
                {t('onboardingWizard.skip', { defaultValue: 'Skip' })}
              </Button>
              <Button 
                type="button" 
                onClick={handleSaveCompanyDetails} 
                disabled={isProcessing || companySaved}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {companySaved ? t('onboardingWizard.saved', { defaultValue: 'Saved' }) : t('onboardingWizard.saveAndContinue', { defaultValue: 'Save & Continue' })}
              </Button>
            </div>
          )}
          
          {currentStep === 'kpis' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => goToStep('milestones')} disabled={isProcessing}>
                {t('onboardingWizard.skip', { defaultValue: 'Skip' })}
              </Button>
              <Button type="button" onClick={handleApplyKpis} disabled={isProcessing || kpisApplied}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {kpisApplied ? t('onboardingWizard.applied', { defaultValue: 'Applied' }) : t('onboardingWizard.applyKpis', { defaultValue: 'Apply KPIs' })}
              </Button>
            </div>
          )}
          
          {currentStep === 'milestones' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => goToStep('meeting')} disabled={isProcessing}>
                {t('onboardingWizard.skip', { defaultValue: 'Skip' })}
              </Button>
              <Button 
                type="button"
                onClick={handleCreateMilestones} 
                disabled={isProcessing || selectedMilestones.size === 0 || milestonesCreated}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {milestonesCreated ? t('onboardingWizard.created', { defaultValue: 'Created' }) : t('onboardingWizard.createCount', { defaultValue: 'Create {{count}} Milestones', count: selectedMilestones.size })}
              </Button>
            </div>
          )}
          
          {currentStep === 'meeting' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => goToStep('complete')} disabled={isProcessing}>
                {t('onboardingWizard.skip', { defaultValue: 'Skip' })}
              </Button>
              <Button type="button" onClick={handleScheduleSession} disabled={isProcessing || meetingScheduled}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {meetingScheduled ? t('onboardingWizard.scheduled', { defaultValue: 'Scheduled' }) : t('onboardingWizard.scheduleSession', { defaultValue: 'Schedule Session' })}
              </Button>
            </div>
          )}
          
          {currentStep === 'complete' && (
            <Button type="button" onClick={handleCompleteOnboarding} className="w-full sm:w-auto bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]">
              {t('onboardingWizard.goToWorkspace', { defaultValue: '🎉 Ir para o Workspace' })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import { Shield, FileText } from 'lucide-react';
import { BackToHomeLink } from '@/components/ui/BackToHomeLink';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';
import { logger } from '@/lib/logger';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';
const NDA_FORUM = 'Leiria';

const NDA_TEXT = `ACORDO DE CONFIDENCIALIDADE (NDA)
Mentores Externos — Participação Pro Bono

1. OBJETO
O Mentor Externo terá acesso a informação confidencial relativa a startups, equipas, tecnologia, clientes, métricas, documentos e estratégias (a "Informação Confidencial").

2. OBRIGAÇÃO DE CONFIDENCIALIDADE
O Mentor compromete-se a:
(i) usar a Informação Confidencial apenas para efeitos de mentoria no âmbito da plataforma;
(ii) não divulgar a terceiros;
(iii) adotar medidas razoáveis de proteção.

3. EXCEÇÕES
Não é confidencial informação que:
(i) seja pública sem violação deste acordo;
(ii) já fosse legitimamente conhecida;
(iii) seja obtida de terceiro de forma legítima;
(iv) tenha de ser divulgada por obrigação legal (devendo, quando possível, notificar previamente).

4. PROPRIEDADE
A Informação Confidencial permanece propriedade do respetivo titular (startup/organização).

5. DURAÇÃO
As obrigações mantêm-se por 3 (três) anos após o término da relação de mentoria ou do último acesso.

6. PARTICIPAÇÃO PRO BONO
A mentoria é prestada em regime pro bono (sem remuneração), salvo acordo escrito em contrário.

7. LEI APLICÁVEL E FORO
Lei portuguesa. Foro da comarca de ${NDA_FORUM}.

Versão: ${CURRENT_NDA_VERSION}`;

export default function MentorNda() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isMentor, isLoading: authLoading } = useAuth();
  
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAccepted, setHasAccepted] = useState<boolean | null>(null);
  const [checkingNda, setCheckingNda] = useState(true);
  
  // Check if NDA already accepted
  useEffect(() => {
    const checkNdaStatus = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('mentor_nda_acceptances')
          .select('id')
          .eq('user_id', user.id)
          .eq('nda_version', CURRENT_NDA_VERSION)
          .maybeSingle();
        
        setHasAccepted(!!data);
      } catch (error) {
        logger.error('Error checking NDA status', {}, error);
      } finally {
        setCheckingNda(false);
      }
    };
    
    if (user?.id) {
      checkNdaStatus();
    }
  }, [user?.id]);
  
  const handleSubmit = async () => {
    if (!accepted) {
      notify.error(t('nda.mustAccept'));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('accept-mentor-nda', {
        body: {}  // Explicit empty body for POST
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to invoke function');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      notify.success(t('nda.acceptedSuccess'));
      navigate('/my-workspaces');
    } catch (error: any) {
      logger.error('NDA submission error', {}, error);
      notify.error(error.message || t('nda.failedToAccept'));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Loading state
  if (authLoading || checkingNda) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    );
  }
  
  // Not a mentor - redirect
  if (!isMentor) {
    return <Navigate to="/my-workspaces" replace />;
  }
  
  // Already accepted - redirect
  if (hasAccepted) {
    return <Navigate to="/my-workspaces" replace />;
  }
  
  return (
    <div className="relative min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="absolute top-4 left-4">
        <BackToHomeLink />
      </div>
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <img src={startupLeiriaLogo} alt="Startup Leiria" className="h-12 mx-auto mb-4" />
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-6 w-6" />
            {t('nda.title')}
          </CardTitle>
          <CardDescription>
            {t('nda.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="h-[400px] rounded-lg border p-4 bg-muted/30">
            <pre className="whitespace-pre-wrap text-sm font-sans">{NDA_TEXT}</pre>
          </ScrollArea>
          
          <div className="flex items-start gap-3 p-4 border rounded-lg bg-card">
            <Checkbox
              id="accept-nda"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            <label htmlFor="accept-nda" className="text-sm cursor-pointer">
              {t('nda.acceptLabel')}
            </label>
          </div>
          
          <Button 
            className="w-full" 
            size="lg" 
            disabled={!accepted || isSubmitting} loading={isSubmitting}
            onClick={handleSubmit}
          >
            <FileText className="h-4 w-4 mr-2" />
            {isSubmitting ? t('common.submitting') : t('nda.acceptButton')}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            {t('nda.legalNote')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

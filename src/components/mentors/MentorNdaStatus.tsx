import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ShieldCheck, ShieldAlert, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';

export function MentorNdaStatus() {
  const { t } = useTranslation();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const isMentor = roles.includes('mentor_externo');

  const { data: ndaAcceptance, isLoading } = useQuery({
    queryKey: ['mentor-nda-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('mentor_nda_acceptances')
        .select('*')
        .eq('user_id', user.id)
        .eq('nda_version', CURRENT_NDA_VERSION)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && isMentor,
  });

  // Don't show for non-mentors
  if (!isMentor) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isAccepted = !!ndaAcceptance;

  return (
    <Card className={isAccepted ? 'border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/30 ' : 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/30 '}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {isAccepted ? (
              <ShieldCheck className="h-5 w-5 text-[hsl(var(--success))]" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-[hsl(var(--warning))]" />
            )}
            {t('mentorNda.statusTitle')}
          </CardTitle>
          <Badge variant={isAccepted ? 'secondary' : 'outline'} className={isAccepted ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ' : ''}>
            {isAccepted ? t('mentorNda.accepted') : t('mentorNda.pending')}
          </Badge>
        </div>
        <CardDescription>
          {isAccepted ? t('mentorNda.acceptedDesc') : t('mentorNda.pendingDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isAccepted ? (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{t('mentorNda.version')}: {ndaAcceptance.nda_version}</span>
            </div>
            <div className="text-muted-foreground">
              {t('mentorNda.acceptedOn')}: {format(new Date(ndaAcceptance.accepted_at), 'PPP')}
            </div>
          </div>
        ) : (
          <Button onClick={() => navigate('/mentor-nda')} className="w-full">
            <FileText className="h-4 w-4 mr-2" />
            {t('mentorNda.reviewAndSign')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

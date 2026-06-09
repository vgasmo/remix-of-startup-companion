import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FileText, Lightbulb, Sparkles, Shield, MessageSquare, Wrench, BarChart3 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExerciseLibraryTab } from '@/components/consultor/ExerciseLibraryTab';
import { SupportMaterialsTab } from '@/components/consultor/SupportMaterialsTab';
import { SessionFrameworksTab } from '@/components/consultor/SessionFrameworksTab';
import { CoachingToolkitTab } from '@/components/consultor/CoachingToolkitTab';
import { PlaybookAnalyticsTab } from '@/components/consultor/PlaybookAnalyticsTab';
import { ValuePropWizard } from '@/components/consultor/ValuePropWizard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const VALID_TABS = ['frameworks', 'coaching', 'exercises', 'materials', 'analytics'];

export default function ConsultorTools() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : 'frameworks';

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: false });
  };

  const [showVPWizard, setShowVPWizard] = useState(false);

  return (
    <AppLayout
      title={t('consultorTools.title', 'Consultor Tools')}
      subtitle={t('consultorTools.subtitle', 'Session frameworks, coaching toolkit, and playbook analytics')}
    >
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowVPWizard(true)}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('consultorTools.vpWizard.title', 'Value Proposition Wizard')}</CardTitle>
                  <CardDescription>{t('consultorTools.vpWizard.subtitle', 'Create compelling VPs in 5-7 minutes')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('consultorTools.vpWizard.description', 'Guided wizard to build value propositions. Practice mode - save from workspace.')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-[hsl(var(--success))]" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('consultorTools.qualityGates.title', 'Quality Gates')}</CardTitle>
                  <CardDescription>{t('consultorTools.qualityGates.subtitle', 'Session & proposal quality checks')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('consultorTools.qualityGates.description', 'Quality scoring automatically appears on sessions and proposals based on criteria like:')}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t('consultorTools.qualityGates.criteria.title', 'Clear title and agenda defined')}</li>
                <li>{t('consultorTools.qualityGates.criteria.time', 'Scheduled time and duration set')}</li>
                <li>{t('consultorTools.qualityGates.criteria.outputs', 'Expected outputs documented')}</li>
                <li>{t('consultorTools.qualityGates.criteria.actions', 'Action items captured after session')}</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="frameworks" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('consultorTools.sessionFrameworks', 'Session Frameworks')}
            </TabsTrigger>
            <TabsTrigger value="coaching" className="gap-2">
              <Wrench className="h-4 w-4" />
              {t('consultorTools.coachingToolkit', 'Coaching Toolkit')}
            </TabsTrigger>
            <TabsTrigger value="exercises" className="gap-2">
              <Lightbulb className="h-4 w-4" />
              {t('consultorTools.exercises', 'Exercises')}
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2">
              <FileText className="h-4 w-4" />
              {t('consultorTools.materials', 'Support Materials')}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('consultorTools.playbookAnalytics', 'Playbook Analytics')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="frameworks" className="mt-6">
            <SessionFrameworksTab />
          </TabsContent>

          <TabsContent value="coaching" className="mt-6">
            <CoachingToolkitTab />
          </TabsContent>

          <TabsContent value="exercises" className="mt-6">
            <ExerciseLibraryTab />
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            <SupportMaterialsTab />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <PlaybookAnalyticsTab />
          </TabsContent>
        </Tabs>

        {/* VP Wizard Dialog */}
        <Dialog open={showVPWizard} onOpenChange={setShowVPWizard}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('consultorTools.vpWizard.title', 'Value Proposition Wizard')}</DialogTitle>
              <DialogDescription>
                {t('consultorTools.vpWizard.practiceMode', 'Practice mode - outputs can be copied. To save permanently, use the wizard from a specific workspace.')}
              </DialogDescription>
            </DialogHeader>
            <ValuePropWizard 
              workspaceId="" 
              onComplete={() => setShowVPWizard(false)} 
            />
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

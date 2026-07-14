import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, History, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ValuePropWizard } from '@/components/consultor/ValuePropWizard';
import { useValuePropArtifacts, ValuePropArtifact } from '@/hooks/useValueProp';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';

export default function ValuePropWizardPage() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  const { data: artifacts, isLoading } = useValuePropArtifacts(workspaceId);

  if (!workspaceId) {
    return null;
  }

  return (
    <AppLayout
      title={t('valueProp.title', 'Value Proposition Wizard')}
      subtitle={t('valueProp.subtitle', 'Create a compelling value proposition in 5-7 minutes')}
      actions={
        <Button variant="ghost" onClick={() => navigate(`/workspace/${workspaceId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Workspace
        </Button>
      }
    >
      <div className="max-w-3xl mx-auto">
        <Tabs defaultValue="wizard">
          <TabsList className="mb-6">
            <TabsTrigger value="wizard" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
              {artifacts && artifacts.length > 0 && (
                <Badge variant="secondary" className="ml-1">{artifacts.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wizard">
            <ValuePropWizard
              workspaceId={workspaceId}
              onComplete={() => navigate(`/workspace/${workspaceId}`)}
            />
          </TabsContent>

          <TabsContent value="history">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : artifacts?.length === 0 ? (
              <Card className="bg-muted/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <History className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">{t('valueProp.noPropositions', 'No value propositions yet')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {artifacts?.map((artifact) => (
                  <ArtifactCard key={artifact.id} artifact={artifact} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ArtifactCard({ artifact }: { artifact: ValuePropArtifact }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Value Proposition v{artifact.version}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {format(new Date(artifact.created_at), 'MMM d, yyyy')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm">{artifact.outputs_text.vp_statement}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-sm font-medium mb-1">{t('valueProp.oneLiner', 'One-liner')}:</p>
          <p className="text-sm text-muted-foreground">{artifact.outputs_text.short_version}</p>
        </div>
        {artifact.outputs_text.bullet_points.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1">{t('valueProp.keyPoints', 'Key Points')}:</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              {artifact.outputs_text.bullet_points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

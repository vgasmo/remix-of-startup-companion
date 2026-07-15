import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { Download, CheckCircle, Clock, AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCampaignInstances,
  useSurveyInstance,
  SurveyInstance,
  SurveyQuestion,
  getCampaignQuestions,
} from "@/hooks/useSurveys";

const STATUS_ICONS = {
  submitted: <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />,
  in_progress: <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />,
  pending: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
};

interface SurveyResponsesViewerProps {
  campaignId: string;
}

export function SurveyResponsesViewer({ campaignId }: SurveyResponsesViewerProps) {
  const { t, i18n } = useTranslation();
  const { data: instances = [], isLoading } = useCampaignInstances(campaignId);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);

  const locale = getDateLocale();

  const handleExportCSV = () => {
    // Basic CSV export
    const headers = ["Startup", "Status", "Submitted At"];
    const rows = instances.map((inst) => [
      inst.workspace?.startups?.name || "Unknown",
      inst.status,
      inst.submitted_at ? format(new Date(inst.submitted_at), "yyyy-MM-dd HH:mm") : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-responses-${campaignId}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
            {instances.filter((i) => i.status === "submitted").length} submitted
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            {instances.filter((i) => i.status === "in_progress").length} in progress
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            {instances.filter((i) => i.status === "pending").length} pending
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t('common.startup', 'Startup')}</TableHead>
              <TableHead>{t('common.status', 'Status')}</TableHead>
              <TableHead>{t('common.submitted', 'Submetido')}</TableHead>
              <TableHead className="w-[100px]">{t('common.actions', 'Ações')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((instance) => (
              <TableRow key={instance.id}>
                <TableCell className="font-medium">
                  {instance.workspace?.startups?.name || "Unknown"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {STATUS_ICONS[instance.status]}
                    <span className="capitalize">{instance.status.replace("_", " ")}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {instance.submitted_at
                    ? format(new Date(instance.submitted_at), "dd MMM yyyy HH:mm", { locale })
                    : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedInstance(instance.id)}
                    disabled={instance.status === "pending"}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Instance Detail Dialog */}
      <InstanceDetailDialog
        instanceId={selectedInstance}
        onClose={() => setSelectedInstance(null)}
      />
    </div>
  );
}

function InstanceDetailDialog({
  instanceId,
  onClose,
}: {
  instanceId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useSurveyInstance(instanceId);
  const { t } = useTranslation();

  if (!instanceId) return null;

  // P4: prefer the campaign's frozen questions_snapshot so historical
  // responses stay readable even after the survey template is edited.
  const campaign = data?.instance?.campaign as
    | { questions_snapshot?: SurveyQuestion[] | null; survey_definition?: { questions_json?: SurveyQuestion[] } }
    | undefined;
  const questions = (campaign ? getCampaignQuestions(campaign as any) : []) as SurveyQuestion[];
  const responses = data?.responses || [];

  const getResponseValue = (questionId: string) => {
    const response = responses.find((r) => r.question_id === questionId);
    if (!response) return "—";

    if (response.response_json) {
      if (Array.isArray(response.response_json)) {
        return (response.response_json as string[]).join(", ");
      }
      return JSON.stringify(response.response_json);
    }

    return response.response_value || "—";
  };

  const sections = [...new Set(questions.map((q) => q.section))];

  return (
    <Dialog open={!!instanceId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data?.instance?.workspace?.startups?.name || "Survey"} - Responses
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section}>
                <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                  {section}
                </h3>
                <div className="space-y-3">
                  {questions
                    .filter((q) => q.section === section)
                    .map((q) => {
                      const response = responses.find((r) => r.question_id === q.id);
                      return (
                        <div key={q.id} className="grid grid-cols-2 gap-4 py-2 border-b border-border/50">
                          <div className="text-sm">
                            {q.question}
                            {response?.is_auto_filled && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                Auto
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-medium">
                            {getResponseValue(q.id)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

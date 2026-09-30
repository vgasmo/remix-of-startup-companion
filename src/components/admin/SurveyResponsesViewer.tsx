import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
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
  useCampaignWritebacks,
  useSurveyInstance,
  SurveyInstance,
  SurveyQuestion,
} from "@/hooks/useSurveys";
import { supabase } from "@/lib/supabaseClient";
import { notify } from "@/lib/notify";

const STATUS_ICONS = {
  submitted: <CheckCircle className="h-4 w-4 text-green-500" />,
  in_progress: <Clock className="h-4 w-4 text-yellow-500" />,
  pending: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
};

interface SurveyResponsesViewerProps {
  campaignId: string;
}

export function SurveyResponsesViewer({ campaignId }: SurveyResponsesViewerProps) {
  const { t, i18n } = useTranslation();
  const { data: instances = [], isLoading } = useCampaignInstances(campaignId);
  const { data: writebacks = [] } = useCampaignWritebacks(campaignId);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);

  // How much of each submission actually landed in the workspace.
  const appliedByInstance = writebacks.reduce<Record<string, number>>((acc, wb) => {
    if (wb.status === "applied") acc[wb.instance_id] = (acc[wb.instance_id] || 0) + 1;
    return acc;
  }, {});

  const locale = i18n.language === "pt" ? pt : undefined;

  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const esc = (v: unknown) => {
        let s = String(v ?? "");
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return `"${s.replace(/"/g, '""')}"`;
      };
      const { data: camp, error: cErr } = await supabase
        .from("survey_campaigns")
        .select("survey_definition:survey_definitions(questions_json)")
        .eq("id", campaignId)
        .single();
      if (cErr) throw cErr;
      const questions = (((camp as any)?.survey_definition?.questions_json) || []) as SurveyQuestion[];

      const ids = instances.map((i) => i.id);
      const responses: { instance_id: string; question_id: string; response_value: string | null; response_json: unknown }[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("survey_responses")
            .select("instance_id, question_id, response_value, response_json")
            .in("instance_id", chunk)
            .range(from, from + 999);
          if (error) throw error;
          responses.push(...((data || []) as any));
          if (!data || data.length < 1000) break;
          from += 1000;
        }
      }
      const byInst: Record<string, Record<string, string>> = {};
      for (const r of responses) {
        let v = r.response_value ?? "";
        if (!v && r.response_json != null) {
          v = Array.isArray(r.response_json) ? r.response_json.join("; ") : typeof r.response_json === "object" ? JSON.stringify(r.response_json) : String(r.response_json);
        }
        (byInst[r.instance_id] ||= {})[r.question_id] = v;
      }

      const headers = [
        t("common.startup", "Startup"),
        t("common.status", "Status"),
        t("common.submitted", "Submetido"),
        t("surveys.dataApplied", "Dados aplicados"),
        ...questions.map((q) => (q.section ? `${q.section} — ${q.question}` : q.question)),
      ];
      const rows = instances.map((inst) => [
        inst.workspace?.startups?.name || t("common.unknown", "Desconhecido"),
        statusLabel(inst.status),
        inst.submitted_at ? format(new Date(inst.submitted_at), "yyyy-MM-dd HH:mm") : "",
        String(appliedByInstance[inst.id] || 0),
        ...questions.map((q) => byInst[inst.id]?.[q.id] ?? ""),
      ]);

      const csv = [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respostas-inquerito-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      notify.error(t("reports.errorTitle", "Não foi possível gerar o relatório"), e instanceof Error ? e.message : "");
    } finally {
      setExporting(false);
    }
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

  const statusLabel = (status: SurveyInstance["status"]) =>
    status === "submitted"
      ? t("surveys.statusSubmitted", "Submetido")
      : status === "in_progress"
        ? t("surveys.statusInProgress", "Em progresso")
        : t("surveys.statusPending", "Pendente");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            {instances.filter((i) => i.status === "submitted").length} {t("surveys.statusSubmitted", "Submetido")}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-yellow-500" />
            {instances.filter((i) => i.status === "in_progress").length} {t("surveys.statusInProgress", "Em progresso")}
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            {instances.filter((i) => i.status === "pending").length} {t("surveys.statusPending", "Pendente")}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exporting} loading={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {t("common.exportCsv", "Exportar CSV")}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.startup', 'Startup')}</TableHead>
              <TableHead>{t('common.status', 'Status')}</TableHead>
              <TableHead>{t('common.submitted', 'Submetido')}</TableHead>
              <TableHead>{t('surveys.dataApplied', 'Dados aplicados')}</TableHead>
              <TableHead className="w-[100px]">{t('common.actions', 'Ações')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((instance) => (
              <TableRow key={instance.id}>
                <TableCell className="font-medium">
                  {instance.workspace?.startups?.name || t('common.unknown', 'Desconhecido')}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {STATUS_ICONS[instance.status]}
                    <span>{statusLabel(instance.status)}</span>
                  </div>
                </TableCell>

                <TableCell>
                  {instance.submitted_at
                    ? format(new Date(instance.submitted_at), "dd MMM yyyy HH:mm", { locale })
                    : "—"}
                </TableCell>
                <TableCell>
                  {appliedByInstance[instance.id] ? (
                    <Badge variant="secondary">{appliedByInstance[instance.id]}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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

  const questions = (data?.instance?.campaign?.survey_definition?.questions_json || []) as SurveyQuestion[];
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
            {data?.instance?.workspace?.startups?.name || t('surveys.title', 'Inquérito')} — {t('surveys.responses', 'Respostas')}
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
                                {t('surveys.autoFilled', 'Preenchido automaticamente')}
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

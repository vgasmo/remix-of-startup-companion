import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ClipboardList,
  Plus,
  Rocket,
  BarChart3,
  StopCircle,
  Eye,
  Edit,
  FileText,
  PlayCircle,
  UserPlus,
  Users,
  ListChecks,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSurveyDefinitions,
  useSurveyCampaigns,
  useCreateSurveyCampaign,
  useLaunchCampaign,
  useCloseCampaign,
  useReopenCampaign,
  useSyncCampaignParticipants,
  useUpdateCampaignEndDate,
  useCampaignCandidates,
  useToggleCampaignParticipant,
  useEnrollAllCandidates,

  useCampaignInstances,
  useCampaignStats,
  SurveyCampaign,
} from "@/hooks/useSurveys";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { SurveyTemplateEditor } from "./SurveyTemplateEditor";
import { SurveyResponsesViewer } from "./SurveyResponsesViewer";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-500/20 text-green-700 dark:text-green-400",
  closed: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  archived: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
};

export function AdminSurveysManager() {
  const { t, i18n } = useTranslation();
  const [selectedCampaign, setSelectedCampaign] = useState<SurveyCampaign | null>(null);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showResponsesViewer, setShowResponsesViewer] = useState(false);

  const { data: definitions = [], isLoading: loadingDefs } = useSurveyDefinitions();
  const { data: campaigns = [], isLoading: loadingCampaigns } = useSurveyCampaigns();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("admin.surveys.title", "Ecosystem Surveys")}</h2>
          <p className="text-muted-foreground">
            {t("admin.surveys.description", "Create and manage periodic ecosystem surveys")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplateEditor(true)}>
            <FileText className="h-4 w-4 mr-2" />
            {t("admin.surveys.manageTemplates", "Templates")}
          </Button>
          <Button onClick={() => setShowCreateCampaign(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("admin.surveys.newCampaign", "New Campaign")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">
            <ClipboardList className="h-4 w-4 mr-2" />
            {t("admin.surveys.campaigns", "Campaigns")}
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            {t("admin.surveys.analytics", "Analytics")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          {loadingCampaigns ? (
            <Card>
              <CardContent className="py-8 space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
                    <div className="h-10 w-10 bg-muted rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-muted rounded" />
                      <div className="h-3 w-32 bg-muted rounded" />
                    </div>
                    <div className="h-6 w-16 bg-muted rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">{t("admin.surveys.noCampaigns", "No campaigns yet")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("admin.surveys.noCampaignsDesc", "Create your first survey campaign to collect ecosystem data")}
                </p>
                <Button onClick={() => setShowCreateCampaign(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("admin.surveys.createFirst", "Create Campaign")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onViewResponses={() => {
                    setSelectedCampaign(campaign);
                    setShowResponsesViewer(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("admin.surveys.analyticsComingSoon", "Survey analytics dashboard coming soon")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
      <CreateCampaignDialog
        open={showCreateCampaign}
        onOpenChange={setShowCreateCampaign}
        definitions={definitions}
      />

      {/* Template Editor Dialog */}
      <Dialog open={showTemplateEditor} onOpenChange={setShowTemplateEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.surveys.templateEditor", "Survey Templates")}</DialogTitle>
            <DialogDescription>
              {t("admin.surveys.description", "Create and manage survey templates")}
            </DialogDescription>
          </DialogHeader>
          <SurveyTemplateEditor definitions={definitions} />
        </DialogContent>
      </Dialog>

      {/* Responses Viewer Dialog */}
      <Dialog open={showResponsesViewer} onOpenChange={setShowResponsesViewer}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCampaign?.name} - {t("admin.surveys.responses", "Responses")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.surveys.viewResponses", "View and export survey responses")}
            </DialogDescription>
          </DialogHeader>
          {selectedCampaign && <SurveyResponsesViewer campaignId={selectedCampaign.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignCard({
  campaign,
  onViewResponses,
}: {
  campaign: SurveyCampaign;
  onViewResponses: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [showQuestions, setShowQuestions] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [endDateValue, setEndDateValue] = useState(
    campaign.ends_at ? new Date(campaign.ends_at).toISOString().split("T")[0] : "",
  );
  const updateEndDate = useUpdateCampaignEndDate();
  const { data: stats } = useCampaignStats(campaign.id);
  const launchCampaign = useLaunchCampaign();
  const closeCampaign = useCloseCampaign();
  const reopenCampaign = useReopenCampaign();
  const syncParticipants = useSyncCampaignParticipants();
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const { data: candidates = [], isLoading: loadingCandidates } = useCampaignCandidates(
    campaign.id,
    showParticipants,
  );
  const toggleParticipant = useToggleCampaignParticipant();
  const enrollAll = useEnrollAllCandidates();
  const filteredCandidates = candidates.filter((c) =>
    c.startupName.toLowerCase().includes(participantSearch.toLowerCase()),
  );
  const enrolledCount = candidates.filter((c) => c.enrolled).length;
  const { confirm, dialogProps: confirmProps } = useConfirmDialog();

  const handleToggleParticipant = (
    c: { workspaceId: string; startupName: string; instanceStatus?: string | null },
    checked: boolean,
  ) => {
    const run = () =>
      toggleParticipant.mutate({
        campaignId: campaign.id,
        workspaceId: c.workspaceId,
        enroll: checked,
      });
    if (!checked && c.instanceStatus === "in_progress") {
      confirm({
        title: t("admin.surveys.confirmRemoveParticipant", "Remover esta startup do inquérito?"),
        description: t("admin.surveys.confirmRemoveParticipantDesc", {
          name: c.startupName,
          defaultValue:
            "{{name}} já começou a responder. As respostas guardadas serão apagadas e não podem ser recuperadas.",
        }),
        confirmLabel: t("admin.surveys.confirmRemoveParticipantAction", "Remover e apagar respostas"),
        onConfirm: run,
      });
      return;
    }
    run();
  };

  const locale = i18n.language === "pt" ? pt : undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{campaign.name}</CardTitle>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {campaign.auto_enroll && (
              <Badge variant="outline">
                {t("admin.surveys.autoEnroll", "Inscrição automática")}
              </Badge>
            )}
            <Badge className={STATUS_COLORS[campaign.status]}>
              {campaign.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("admin.surveys.template", "Template")}</p>
            <p className="font-medium">{campaign.survey_definition?.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("admin.surveys.startDate", "Start")}</p>
            <p className="font-medium">
              {format(new Date(campaign.starts_at), "dd MMM yyyy", { locale })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("admin.surveys.endDate", "End")}</p>
            <p className="font-medium">
              {format(new Date(campaign.ends_at), "dd MMM yyyy", { locale })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("admin.surveys.completion", "Completion")}</p>
            <p className="font-medium">{stats?.completionRate || 0}%</p>
          </div>
        </div>

        {stats && stats.total > 0 && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span>{t("admin.surveys.progress", "Progress")}</span>
              <span>
                {stats.submitted}/{stats.total} {t("admin.surveys.submitted", "submitted")}
              </span>
            </div>
            <Progress value={stats.completionRate} />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600">● {stats.submitted} submitted</span>
              <span className="text-yellow-600">● {stats.inProgress} in progress</span>
              <span className="text-gray-400">● {stats.pending} pending</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {campaign.status === "draft" && (
            <Button
              size="sm"
              onClick={() => launchCampaign.mutate(campaign.id)}
              disabled={launchCampaign.isPending}
            >
              <Rocket className="h-4 w-4 mr-2" />
              {t("admin.surveys.launch", "Launch")}
            </Button>
          )}
          {campaign.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeCampaign.mutate(campaign.id)}
              disabled={closeCampaign.isPending}
            >
              <StopCircle className="h-4 w-4 mr-2" />
              {t("admin.surveys.close", "Close")}
            </Button>
          )}
          {(campaign.status === "closed" || campaign.status === "archived") && (
            <Button
              size="sm"
              onClick={() => reopenCampaign.mutate(campaign.id)}
              disabled={reopenCampaign.isPending}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {t("admin.surveys.reopen", "Reabrir")}
            </Button>
          )}
          {campaign.status !== "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncParticipants.mutate(campaign.id)}
              disabled={syncParticipants.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {t("admin.surveys.enrollMissing", "Inscrever novas startups")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowParticipants(true)}>
            <Users className="h-4 w-4 mr-2" />
            {t("admin.surveys.manageParticipants", "Gerir participantes")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowEndDate(true)}>
            <Edit className="h-4 w-4 mr-2" />
            {t("admin.surveys.editEndDate", "Definir data de fim")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowQuestions(true)}>
            <ListChecks className="h-4 w-4 mr-2" />
            {t("admin.surveys.viewQuestions", "Ver questões")}
          </Button>
          <Button size="sm" variant="outline" onClick={onViewResponses}>
            <Eye className="h-4 w-4 mr-2" />
            {t("admin.surveys.viewResponses", "View Responses")}
          </Button>
        </div>

        <Dialog open={showParticipants} onOpenChange={setShowParticipants}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("admin.surveys.manageParticipants", "Gerir participantes")}</DialogTitle>
              <DialogDescription>
                {t(
                  "admin.surveys.manageParticipantsDesc",
                  "Marque as startups que devem responder a este inquérito.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("admin.surveys.searchStartup", "Procurar startup...")}
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={enrollAll.isPending}
                onClick={() => enrollAll.mutate(campaign.id)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {t("admin.surveys.enrollAll", "Incluir todas")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.surveys.enrolledCount", {
                count: enrolledCount,
                total: candidates.length,
                defaultValue: "{{count}} de {{total}} incluídas",
              })}
            </p>
            <ScrollArea className="h-[50vh] pr-3">
              {loadingCandidates ? (
                <p className="text-sm text-muted-foreground">{t("common.loading", "A carregar...")}</p>
              ) : (
                <div className="space-y-1">
                  {filteredCandidates.map((c) => (
                    <label
                      key={c.workspaceId}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={c.enrolled}
                        disabled={toggleParticipant.isPending}
                        onCheckedChange={(checked) => handleToggleParticipant(c, checked === true)}
                      />
                      <span className="text-sm flex-1">{c.startupName}</span>
                      {c.instanceStatus === "submitted" && (
                        <Badge variant="outline" className="text-xs">
                          {t("admin.surveys.submitted", "submitted")}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {c.workspaceStatus}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            <ConfirmDialog {...confirmProps} />
          </DialogContent>
        </Dialog>

        <Dialog open={showEndDate} onOpenChange={setShowEndDate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("admin.surveys.editEndDate", "Definir data de fim")}</DialogTitle>
              <DialogDescription>
                {t(
                  "admin.surveys.editEndDateDesc",
                  "As startups podem responder até esta data.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`ends-at-${campaign.id}`}>
                {t("admin.surveys.endDate", "End")}
              </Label>
              <Input
                id={`ends-at-${campaign.id}`}
                type="date"
                value={endDateValue}
                onChange={(e) => setEndDateValue(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEndDate(false)}>
                {t("common.cancel", "Cancelar")}
              </Button>
              <Button
                disabled={!endDateValue || updateEndDate.isPending}
                onClick={() => {
                  updateEndDate.mutate(
                    {
                      campaignId: campaign.id,
                      endsAt: new Date(`${endDateValue}T23:59:59`).toISOString(),
                    },
                    { onSuccess: () => setShowEndDate(false) },
                  );
                }}
              >
                {t("common.save", "Guardar")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showQuestions} onOpenChange={setShowQuestions}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {campaign.survey_definition?.name || campaign.name}
              </DialogTitle>
              <DialogDescription>
                {t("admin.surveys.viewQuestionsDesc", "Questões incluídas neste inquérito")}
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 list-decimal pl-5">
              {(campaign.survey_definition?.questions_json || []).map((q) => (
                <li key={q.id} className="text-sm">
                  <p className="font-medium">{q.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.section} · {q.type}
                    {q.required ? ` · ${t("admin.surveys.requiredLabel", "obrigatória")}` : ""}
                  </p>
                  {q.options?.length ? (
                    <p className="text-xs text-muted-foreground">{q.options.join(" · ")}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            {!(campaign.survey_definition?.questions_json || []).length && (
              <p className="text-sm text-muted-foreground">
                {t("admin.surveys.noQuestions", "Este template ainda não tem questões.")}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CreateCampaignDialog({
  open,
  onOpenChange,
  definitions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const createCampaign = useCreateSurveyCampaign();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    survey_definition_id: "",
    starts_at: new Date().toISOString().split("T")[0],
    ends_at: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(
      {
        ...formData,
        starts_at: new Date(formData.starts_at).toISOString(),
        ends_at: new Date(formData.ends_at).toISOString(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setFormData({
            name: "",
            description: "",
            survey_definition_id: "",
            starts_at: new Date().toISOString().split("T")[0],
            ends_at: "",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.surveys.createCampaign", "Create Survey Campaign")}</DialogTitle>
          <DialogDescription>
            {t("admin.surveys.noCampaignsDesc", "Create a survey campaign to collect ecosystem data")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.surveys.campaignName", "Campaign Name")}</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ecosystem Survey 2025 H1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("admin.surveys.description", "Description")}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Semi-annual ecosystem evaluation survey"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("admin.surveys.selectTemplate", "Survey Template")}</Label>
            <Select
              value={formData.survey_definition_id}
              onValueChange={(v) => setFormData({ ...formData, survey_definition_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {definitions.map((def) => (
                  <SelectItem key={def.id} value={def.id}>
                    {def.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("admin.surveys.startDate", "Start Date")}</Label>
              <Input
                type="date"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.surveys.endDate", "End Date")}</Label>
              <Input
                type="date"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={createCampaign.isPending || !formData.survey_definition_id}>
              {t("common.create", "Create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

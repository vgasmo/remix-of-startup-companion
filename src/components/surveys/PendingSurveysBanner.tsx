import { useTranslation } from "react-i18next";
import { format, Locale } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { ClipboardList, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMyPendingSurveys, SurveyInstance } from "@/hooks/useSurveys";

interface PendingSurveysBannerProps {
  workspaceId?: string;
  onOpenSurvey: (instanceId: string) => void;
}

export function PendingSurveysBanner({ workspaceId, onOpenSurvey }: PendingSurveysBannerProps) {
  const { t, i18n } = useTranslation();
  const { data: surveys = [] } = useMyPendingSurveys();

  const locale = getDateLocale();

  // Filter by workspace if provided
  const relevantSurveys = workspaceId
    ? surveys.filter((s) => s.workspace_id === workspaceId)
    : surveys;

  if (relevantSurveys.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">
              {t("surveys.pendingSurveys", "Pending Surveys")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("surveys.pendingSurveysDesc", "You have surveys waiting to be completed")}
            </p>
          </div>
          <div className="flex gap-2">
            {relevantSurveys.slice(0, 2).map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                onOpen={() => onOpenSurvey(survey.id)}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SurveyCard({
  survey,
  onOpen,
  locale,
}: {
  survey: SurveyInstance;
  onOpen: () => void;
  locale?: Locale;
}) {
  const { t } = useTranslation();
  const deadline = survey.campaign?.ends_at ? new Date(survey.campaign.ends_at) : null;
  const isUrgent = deadline && deadline.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <Button
      variant="outline"
      className="h-auto flex-col items-start p-3 min-w-[180px]"
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 w-full">
        <span className="font-medium text-sm truncate flex-1">
          {survey.campaign?.name}
        </span>
        {isUrgent && (
          <Badge variant="destructive" className="text-xs">
            {t("common.overdue", "Urgent")}
          </Badge>
        )}
      </div>
      {deadline && (
        <span className="text-xs text-muted-foreground mt-1">
          {t("surveys.deadline", "Deadline")}: {format(deadline, "dd MMM", { locale })}
        </span>
      )}
      <div className="flex items-center gap-1 text-xs text-primary mt-1">
        {survey.status === "in_progress" 
          ? t("common.continue", "Continue") 
          : t("common.start", "Start")}
        <ArrowRight className="h-3 w-3" />
      </div>
    </Button>
  );
}

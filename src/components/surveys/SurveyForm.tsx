import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { Save, Send, ChevronLeft, ChevronRight, Check, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  useSurveyInstance,
  useSaveSurveyResponses,
  SurveyQuestion,
  SurveyResponse,
} from "@/hooks/useSurveys";
import { Json } from "@/integrations/supabase/types";

interface SurveyFormProps {
  instanceId: string;
  onComplete?: () => void;
}

export function SurveyForm({ instanceId, onComplete }: SurveyFormProps) {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useSurveyInstance(instanceId);
  const saveResponses = useSaveSurveyResponses();

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [autoFilledKeys, setAutoFilledKeys] = useState<Set<string>>(new Set());

  const locale = getDateLocale();

  const questions = useMemo(() => {
    // Prefer the campaign's copy-on-write snapshot when present. Falls back
    // to the live definition for drafts / legacy campaigns without a snapshot.
    const campaign = data?.instance?.campaign;
    const snap = (campaign as unknown as { questions_snapshot?: SurveyQuestion[] | null })?.questions_snapshot;
    if (Array.isArray(snap) && snap.length > 0) return snap;
    return (campaign?.survey_definition?.questions_json || []) as SurveyQuestion[];
  }, [data]);

  const sections = useMemo(() => {
    return [...new Set(questions.map((q) => q.section))];
  }, [questions]);

  const currentSection = sections[currentSectionIndex];
  const currentQuestions = questions.filter((q) => q.section === currentSection);

  // Initialize answers from existing responses and auto-fill data
  useEffect(() => {
    if (!data) return;

    const initial: Record<string, string | string[] | number> = {};
    const autoKeys = new Set<string>();

    // Load existing responses
    data.responses.forEach((r) => {
      if (r.response_json) {
        initial[r.question_id] = r.response_json as string[];
      } else if (r.response_value) {
        initial[r.question_id] = r.response_value;
      }
      if (r.is_auto_filled) {
        autoKeys.add(r.question_id);
      }
    });

    // Apply auto-fill from instance data
    const autoFillData = data.instance.auto_filled_data as Record<string, unknown>;
    questions.forEach((q) => {
      if (q.autoFillKey && autoFillData[q.autoFillKey] && !initial[q.id]) {
        const value = autoFillData[q.autoFillKey];
        if (value !== null && value !== undefined) {
          initial[q.id] = String(value);
          autoKeys.add(q.id);
        }
      }
    });

    setAnswers(initial);
    setAutoFilledKeys(autoKeys);
  }, [data, questions]);

  const handleAnswerChange = (questionId: string, value: string | string[] | number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Remove from auto-filled if user edits
    if (autoFilledKeys.has(questionId)) {
      setAutoFilledKeys((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };

  const handleMultiselectToggle = (questionId: string, option: string) => {
    const current = (answers[questionId] as string[]) || [];
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    handleAnswerChange(questionId, updated);
  };

  const handleSave = (submit = false) => {
    const responses = Object.entries(answers).map(([question_id, value]) => ({
      question_id,
      response_value: typeof value === "string" || typeof value === "number" ? String(value) : undefined,
      response_json: Array.isArray(value) ? (value as unknown as Json) : undefined,
      is_auto_filled: autoFilledKeys.has(question_id),
    }));

    saveResponses.mutate(
      { instanceId, responses, submit },
      {
        onSuccess: () => {
          if (submit && onComplete) {
            onComplete();
          }
        },
      }
    );
  };

  const calculateProgress = () => {
    const required = questions.filter((q) => q.required);
    const answered = required.filter((q) => {
      const answer = answers[q.id];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer !== undefined && answer !== "";
    });
    return Math.round((answered.length / required.length) * 100);
  };

  const canSubmit = () => {
    return questions
      .filter((q) => q.required)
      .every((q) => {
        const answer = answers[q.id];
        if (Array.isArray(answer)) return answer.length > 0;
        return answer !== undefined && answer !== "";
      });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("surveys.loading", "Loading survey...")}
        </CardContent>
      </Card>
    );
  }

  if (!data?.instance) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("surveys.surveyNotFound", "Survey not found")}
        </CardContent>
      </Card>
    );
  }

  const campaign = data.instance.campaign;
  const deadline = campaign?.ends_at ? new Date(campaign.ends_at) : null;
  const isSubmitted = data.instance.status === "submitted";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{campaign?.name}</CardTitle>
              <CardDescription className="mt-1">
                {campaign?.description}
              </CardDescription>
            </div>
            {isSubmitted ? (
              <Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]">
                <Check className="h-3 w-3 mr-1" />
                {t("surveys.submitted", "Submitted")}
              </Badge>
            ) : (
              deadline && (
                <Badge variant="outline">
                  {t("surveys.deadline", "Deadline")}: {format(deadline, "dd MMM yyyy", { locale })}
                </Badge>
              )
            )}
          </div>
          {!isSubmitted && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>{t("surveys.progress", "Progress")}</span>
                <span>{calculateProgress()}%</span>
              </div>
              <Progress value={calculateProgress()} />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Section Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {sections.map((section, idx) => {
          const sectionQuestions = questions.filter((q) => q.section === section);
          const answered = sectionQuestions.filter((q) => {
            const answer = answers[q.id];
            if (Array.isArray(answer)) return answer.length > 0;
            return answer !== undefined && answer !== "";
          }).length;

          return (
            <Button
              key={section}
              variant={idx === currentSectionIndex ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentSectionIndex(idx)}
              className="whitespace-nowrap"
            >
              {section}
              <Badge variant="secondary" className="ml-2">
                {answered}/{sectionQuestions.length}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{currentSection}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentQuestions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(value) => handleAnswerChange(q.id, value)}
              onMultiselectToggle={(option) => handleMultiselectToggle(q.id, option)}
              isAutoFilled={autoFilledKeys.has(q.id)}
              disabled={isSubmitted}
            />
          ))}
        </CardContent>
      </Card>

      {/* Navigation & Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentSectionIndex((i) => Math.max(0, i - 1))}
          disabled={currentSectionIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("common.previous", "Previous")}
        </Button>

        <div className="flex gap-2">
          {!isSubmitted && (
            <>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saveResponses.isPending} loading={saveResponses.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {t("surveys.saveDraft", "Save Draft")}
              </Button>

              {currentSectionIndex === sections.length - 1 && (
                <Button
                  onClick={() => handleSave(true)}
                  disabled={!canSubmit() || saveResponses.isPending} loading={saveResponses.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t("surveys.submit", "Submit Survey")}
                </Button>
              )}
            </>
          )}
        </div>

        <Button
          variant="outline"
          onClick={() => setCurrentSectionIndex((i) => Math.min(sections.length - 1, i + 1))}
          disabled={currentSectionIndex === sections.length - 1}
        >
          {t("common.next", "Next")}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

interface QuestionFieldProps {
  question: SurveyQuestion;
  value: string | string[] | number | undefined;
  onChange: (value: string | string[] | number) => void;
  onMultiselectToggle: (option: string) => void;
  isAutoFilled: boolean;
  disabled: boolean;
}

function QuestionField({
  question,
  value,
  onChange,
  onMultiselectToggle,
  isAutoFilled,
  disabled,
}: QuestionFieldProps) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        {question.question}
        {question.required && <span className="text-destructive">*</span>}
        {isAutoFilled && (
          <Badge variant="secondary" className="text-xs">
            <Lock className="h-3 w-3 mr-1" />
            {t("surveys.autoFilled", "Auto-filled")}
          </Badge>
        )}
      </Label>

      {question.type === "text" && (
        <Input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}

      {question.type === "number" && (
        <Input
          type="number"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}

      {question.type === "textarea" && (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      )}

      {question.type === "select" && (
        <Select
          value={(value as string) || ""}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("common.placeholders.selectOption")} />
          </SelectTrigger>
          <SelectContent>
            {question.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.type === "multiselect" && (
        <div className="grid grid-cols-2 gap-2">
          {question.options?.map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={`${question.id}-${option}`}
                checked={((value as string[]) || []).includes(option)}
                onCheckedChange={() => onMultiselectToggle(option)}
                disabled={disabled}
              />
              <Label
                htmlFor={`${question.id}-${option}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option}
              </Label>
            </div>
          ))}
        </div>
      )}

      {question.type === "rating" && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{question.min || 0}</span>
            <Slider
              value={[Number(value) || question.min || 0]}
              onValueChange={([v]) => onChange(v)}
              min={question.min || 0}
              max={question.max || 10}
              step={1}
              disabled={disabled}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground">{question.max || 10}</span>
          </div>
          <div className="text-center font-medium">
            {value !== undefined ? value : "—"}
          </div>
        </div>
      )}
    </div>
  );
}

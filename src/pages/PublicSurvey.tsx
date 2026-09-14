import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Save, Send, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuestionField } from "@/components/surveys/SurveyForm";
import type { SurveyQuestion } from "@/hooks/useSurveys";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-survey`;

interface PublicSurveyPayload {
  status: string;
  campaignName: string;
  endsAt: string | null;
  surveyName: string;
  surveyDescription: string | null;
  questions: SurveyQuestion[];
  autoFill: Record<string, unknown>;
  startupName: string | null;
  responses: Array<{
    question_id: string;
    response_value: string | null;
    response_json: unknown;
    is_auto_filled: boolean;
  }>;
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "ready"; data: PublicSurveyPayload };

export default function PublicSurvey() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [autoFilledKeys, setAutoFilledKeys] = useState<Set<string>>(new Set());
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const locale = i18n.language === "pt" ? pt : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}?token=${encodeURIComponent(token ?? "")}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setState({ kind: "error", code: body?.error ?? "load_failed" });
          return;
        }
        const data = (await res.json()) as PublicSurveyPayload;
        if (!cancelled) setState({ kind: "ready", data });
      } catch {
        if (!cancelled) setState({ kind: "error", code: "load_failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const questions = useMemo(
    () => (state.kind === "ready" ? state.data.questions : []),
    [state],
  );
  const sections = useMemo(() => [...new Set(questions.map((q) => q.section))], [questions]);
  const currentSection = sections[currentSectionIndex];
  const currentQuestions = questions.filter((q) => q.section === currentSection);

  // Seed answers from existing responses and auto-fill data.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const initial: Record<string, string | string[] | number> = {};
    const autoKeys = new Set<string>();

    state.data.responses.forEach((r) => {
      if (Array.isArray(r.response_json)) {
        initial[r.question_id] = r.response_json as string[];
      } else if (r.response_value) {
        initial[r.question_id] = r.response_value;
      }
      if (r.is_auto_filled) autoKeys.add(r.question_id);
    });

    questions.forEach((q) => {
      const value = state.data.autoFill?.[q.autoFillKey ?? ""];
      if (q.autoFillKey && value !== null && value !== undefined && !initial[q.id]) {
        initial[q.id] = String(value);
        autoKeys.add(q.id);
      }
    });

    setAnswers(initial);
    setAutoFilledKeys(autoKeys);
  }, [state, questions]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string | string[] | number) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      setAutoFilledKeys((prev) => {
        if (!prev.has(questionId)) return prev;
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    },
    [],
  );

  const isSubmitted = state.kind === "ready" && state.data.status === "submitted";

  const calculateProgress = () => {
    const required = questions.filter((q) => q.required);
    if (required.length === 0) return 100;
    const answered = required.filter((q) => {
      const answer = answers[q.id];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer !== undefined && answer !== "";
    });
    return Math.round((answered.length / required.length) * 100);
  };

  const canSubmit = () =>
    questions
      .filter((q) => q.required)
      .every((q) => {
        const answer = answers[q.id];
        if (Array.isArray(answer)) return answer.length > 0;
        return answer !== undefined && answer !== "";
      });

  const handleSave = async (submit: boolean) => {
    setSaving(true);
    setSubmitError(null);
    try {
      const responses = Object.entries(answers).map(([question_id, value]) => ({
        question_id,
        response_value: typeof value === "string" || typeof value === "number" ? String(value) : undefined,
        response_json: Array.isArray(value) ? value : undefined,
        is_auto_filled: autoFilledKeys.has(question_id),
      }));

      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, responses, submit }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubmitError(
          body?.error === "required_missing"
            ? t("publicSurvey.requiredMissing", "Responda a todas as perguntas obrigatórias antes de submeter.")
            : t("publicSurvey.saveFailed", "Não foi possível guardar. Tente novamente."),
        );
        return;
      }

      if (submit) {
        setState((prev) =>
          prev.kind === "ready" ? { kind: "ready", data: { ...prev.data, status: "submitted" } } : prev,
        );
        window.scrollTo({ top: 0 });
      }
    } catch {
      setSubmitError(t("publicSurvey.saveFailed", "Não foi possível guardar. Tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-lg leading-tight">Startup Leiria</p>
            {state.kind === "ready" && (
              <p className="text-sm text-muted-foreground">{state.data.campaignName}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => i18n.changeLanguage(i18n.language === "pt" ? "en" : "pt")}
          >
            {i18n.language === "pt" ? "EN" : "PT"}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {state.kind === "loading" && (
          <Card>
            <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("publicSurvey.loading", "A carregar o inquérito...")}
            </CardContent>
          </Card>
        )}

        {state.kind === "error" && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="font-medium">
                {state.code === "not_found" || state.code === "invalid_token"
                  ? t("publicSurvey.invalidLink", "Este link não é válido. Confirme o endereço no email que recebeu.")
                  : state.code === "survey_closed"
                    ? t("publicSurvey.closed", "Este inquérito já não está disponível.")
                    : t("publicSurvey.loadFailed", "Não foi possível abrir o inquérito. Tente novamente.")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("publicSurvey.needHelp", "Precisa de ajuda? Responda ao email que recebeu ou escreva para vitor.ferreira@startupleiria.com.")}
              </p>
            </CardContent>
          </Card>
        )}

        {state.kind === "ready" && isSubmitted && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
              <p className="text-lg font-semibold">
                {t("publicSurvey.thankYou", "Obrigado — a sua resposta foi submetida.")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  "publicSurvey.thankYouDesc",
                  "Os dados da sua startup foram atualizados na plataforma Startup Leiria.",
                )}
              </p>
              <div className="pt-6 border-t mt-6 space-y-2">
                <p className="font-medium">
                  {t("publicSurvey.registerTitle", "Quer acompanhar a sua startup na plataforma?")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "publicSurvey.registerDesc",
                    "Com uma conta gratuita vê os dados que acabou de enviar, os marcos do programa, sessões com consultores e todos os recursos da Startup Leiria.",
                  )}
                </p>
                <Button asChild className="mt-2">
                  <Link to="/login?mode=signup">
                    {t("publicSurvey.registerCta", "Registar-me na plataforma")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state.kind === "ready" && !isSubmitted && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{state.data.surveyName}</CardTitle>
                {state.data.surveyDescription && (
                  <CardDescription>{state.data.surveyDescription}</CardDescription>
                )}
                {state.data.startupName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("publicSurvey.forStartup", "Startup:")} <strong>{state.data.startupName}</strong>
                  </p>
                )}
                {state.data.endsAt && (
                  <Badge variant="outline" className="mt-2 w-fit">
                    {t("publicSurvey.deadline", "Data limite")}:{" "}
                    {format(new Date(state.data.endsAt), "dd MMM yyyy", { locale })}
                  </Badge>
                )}
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t("publicSurvey.progress", "Progresso")}</span>
                    <span>{calculateProgress()}%</span>
                  </div>
                  <Progress value={calculateProgress()} />
                </div>
              </CardHeader>
            </Card>

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
                    onMultiselectToggle={(option) => {
                      const current = (answers[q.id] as string[]) || [];
                      handleAnswerChange(
                        q.id,
                        current.includes(option)
                          ? current.filter((o) => o !== option)
                          : [...current, option],
                      );
                    }}
                    isAutoFilled={autoFilledKeys.has(q.id)}
                    disabled={saving}
                  />
                ))}
              </CardContent>
            </Card>

            {submitError && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-between pb-8">
              <Button
                variant="outline"
                onClick={() => setCurrentSectionIndex((i) => Math.max(0, i - 1))}
                disabled={currentSectionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("common.previous", "Anterior")}
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {t("publicSurvey.saveDraft", "Guardar rascunho")}
                </Button>
                {currentSectionIndex === sections.length - 1 && (
                  <Button onClick={() => handleSave(true)} disabled={!canSubmit() || saving}>
                    <Send className="h-4 w-4 mr-2" />
                    {t("publicSurvey.submit", "Submeter respostas")}
                  </Button>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setCurrentSectionIndex((i) => Math.min(sections.length - 1, i + 1))}
                disabled={currentSectionIndex === sections.length - 1}
              >
                {t("common.next", "Seguinte")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground pb-8">
              {t("publicSurvey.registerHint", "Prefere acompanhar a sua startup com uma conta gratuita?")}{" "}
              <Link to="/login?mode=signup" className="underline underline-offset-4 hover:text-foreground">
                {t("publicSurvey.registerCta", "Registar-me na plataforma")}
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

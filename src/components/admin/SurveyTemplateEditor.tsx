import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Pencil, Eye, EyeOff } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SurveyDefinition,
  SurveyQuestion,
  useCreateSurveyDefinition,
  useUpdateSurveyDefinition,
  useDeleteSurveyDefinition,
} from "@/hooks/useSurveys";

// Default ecosystem survey based on the provided PDF
const ECOSYSTEM_SURVEY_TEMPLATE: SurveyQuestion[] = [
  { id: "q1", section: "Caracterização do Fundador", question: "Qual é o seu papel dentro do ecossistema?", type: "select", options: ["Fundador", "Co-fundador", "CEO", "CTO", "Colaborador", "Mentor", "Investidor", "Outro"], required: true },
  { id: "q2", section: "Caracterização do Fundador", question: "Género", type: "select", options: ["Masculino", "Feminino", "Outro", "Prefiro não dizer"], required: true },
  { id: "q3", section: "Caracterização do Fundador", question: "Idade", type: "select", options: ["<26", "26-35", "36-45", "46-55", "56-65", ">65"], required: true },
];

const QUESTION_TYPES: SurveyQuestion["type"][] = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "rating",
];

interface SurveyTemplateEditorProps {
  definitions: SurveyDefinition[];
}

function nextQuestionId(existing: SurveyQuestion[]) {
  const nums = existing
    .map((q) => parseInt(q.id.replace(/^q/, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `q${max + 1}`;
}

export function SurveyTemplateEditor({ definitions }: SurveyTemplateEditorProps) {
  const { t } = useTranslation();
  const createDefinition = useCreateSurveyDefinition();
  const updateDefinition = useUpdateSurveyDefinition();
  const deleteDefinition = useDeleteSurveyDefinition();

  const [selectedDef, setSelectedDef] = useState<SurveyDefinition | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingQuestions, setEditingQuestions] = useState<SurveyQuestion[]>([]);
  const [dirty, setDirty] = useState(false);

  const [questionDialog, setQuestionDialog] = useState<{
    open: boolean;
    question: SurveyQuestion | null;
    defaultSection?: string;
  }>({ open: false, question: null });

  const [confirmDelete, setConfirmDelete] = useState<null | { type: "template"; id: string } | { type: "question"; id: string }>(null);

  const handleCreateDefault = () => {
    createDefinition.mutate({
      name: "Inquérito Ecossistema Startup Leiria",
      description: "Inquérito de Avaliação do Ecossistema - baseado no modelo oficial",
      questions_json: ECOSYSTEM_SURVEY_TEMPLATE,
      auto_fill_mappings: {
        stage: "workspace.stage",
        startup_name: "startup.name",
        founded_year: "startup.founded_year",
        sector: "startup.sector",
        legal_form: "startup.legal_form",
      },
    });
  };

  const handleCreateBlank = () => {
    createDefinition.mutate({
      name: "Novo template",
      description: "",
      questions_json: [],
      auto_fill_mappings: {},
    });
  };

  const handleSelectDefinition = (def: SurveyDefinition) => {
    setSelectedDef(def);
    setEditingName(def.name);
    setEditingDescription(def.description || "");
    setEditingQuestions(def.questions_json || []);
    setDirty(false);
  };

  const handleSave = () => {
    if (!selectedDef) return;
    updateDefinition.mutate(
      {
        id: selectedDef.id,
        name: editingName,
        description: editingDescription,
        questions_json: editingQuestions,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  const upsertQuestion = (q: SurveyQuestion) => {
    setEditingQuestions((prev) => {
      const idx = prev.findIndex((x) => x.id === q.id);
      if (idx === -1) return [...prev, q];
      const copy = [...prev];
      copy[idx] = q;
      return copy;
    });
    setDirty(true);
  };

  const removeQuestion = (id: string) => {
    setEditingQuestions((prev) => prev.filter((q) => q.id !== id));
    setDirty(true);
  };

  const sections = [...new Set(editingQuestions.map((q) => q.section))];

  return (
    <div className="space-y-4">
      {definitions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-muted-foreground">
              {t("admin.surveys.noTemplates", "Sem templates de inquérito")}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={handleCreateDefault} disabled={createDefinition.isPending} loading={createDefinition.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {t("admin.surveys.createDefaultTemplate", "Criar template Ecossistema")}
              </Button>
              <Button variant="outline" onClick={handleCreateBlank} disabled={createDefinition.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {t("admin.surveys.createBlank", "Template em branco")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <Label>{t("admin.surveys.templates", "Templates")}</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={handleCreateBlank} title={t("admin.surveys.createBlank", "Template em branco")}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {definitions.map((def) => (
              <Card
                key={def.id}
                className={`cursor-pointer transition-colors ${
                  selectedDef?.id === def.id ? "border-primary" : ""
                }`}
                onClick={() => handleSelectDefinition(def)}
              >
                <CardContent className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{def.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(def.questions_json as SurveyQuestion[])?.length || 0} {t("admin.surveys.questions", "perguntas")}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ type: "template", id: def.id });
                    }}
                    title={t("common.delete", "Remover")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="col-span-2">
            {selectedDef ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editingName}
                        onChange={(e) => { setEditingName(e.target.value); setDirty(true); }}
                        className="font-semibold"
                      />
                      <Textarea
                        value={editingDescription}
                        onChange={(e) => { setEditingDescription(e.target.value); setDirty(true); }}
                        placeholder={t("admin.surveys.descriptionPlaceholder", "Descrição...")}
                        rows={2}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateDefinition.isPending || !dirty}
                      loading={updateDefinition.isPending}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {t("common.save", "Guardar")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQuestionDialog({ open: true, question: null, defaultSection: sections[0] })
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("admin.surveys.addQuestion", "Adicionar pergunta")}
                    </Button>
                  </div>

                  {sections.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {t("admin.surveys.emptyQuestions", "Sem perguntas. Adicione a primeira.")}
                    </div>
                  ) : (
                    <Accordion type="multiple" className="space-y-2" defaultValue={sections}>
                      {sections.map((section) => (
                        <AccordionItem key={section} value={section}>
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              {section}
                              <Badge variant="secondary">
                                {editingQuestions.filter((q) => q.section === section).length}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pl-2">
                              {editingQuestions
                                .filter((q) => q.section === section)
                                .map((q) => (
                                  <div
                                    key={q.id}
                                    className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                                  >
                                    <span className="text-muted-foreground w-10 shrink-0">{q.id}</span>
                                    <span className="flex-1">{q.question}</span>
                                    <Badge variant="outline" className="text-xs">{q.type}</Badge>
                                    {q.autoFillKey && (
                                      <Badge className="text-xs bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]">
                                        Auto
                                      </Badge>
                                    )}
                                    {q.required && <span className="text-destructive">*</span>}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => setQuestionDialog({ open: true, question: q })}
                                      title={t("common.edit", "Editar")}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive"
                                      onClick={() => setConfirmDelete({ type: "question", id: q.id })}
                                      title={t("common.delete", "Remover")}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setQuestionDialog({ open: true, question: null, defaultSection: section })
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                {t("admin.surveys.addToSection", "Adicionar a esta secção")}
                              </Button>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {t("admin.surveys.selectTemplate", "Selecione um template para editar")}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <QuestionDialog
        open={questionDialog.open}
        question={questionDialog.question}
        defaultSection={questionDialog.defaultSection}
        existingIds={editingQuestions.map((q) => q.id)}
        onClose={() => setQuestionDialog({ open: false, question: null })}
        onSave={(q) => {
          upsertQuestion(q);
          setQuestionDialog({ open: false, question: null });
        }}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.type === "template"
                ? t("admin.surveys.confirmDeleteTemplate", "Remover template?")
                : t("admin.surveys.confirmDeleteQuestion", "Remover pergunta?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.type === "template"
                ? t("admin.surveys.confirmDeleteTemplateDesc", "Esta ação não pode ser desfeita. As campanhas existentes que usem este template poderão ficar afetadas.")
                : t("admin.surveys.confirmDeleteQuestionDesc", "A pergunta será removida do template. Guarde para persistir a alteração.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                if (confirmDelete.type === "template") {
                  deleteDefinition.mutate(confirmDelete.id, {
                    onSuccess: () => {
                      if (selectedDef?.id === confirmDelete.id) {
                        setSelectedDef(null);
                        setEditingQuestions([]);
                      }
                    },
                  });
                } else {
                  removeQuestion(confirmDelete.id);
                }
                setConfirmDelete(null);
              }}
            >
              {t("common.delete", "Remover")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionDialog({
  open,
  question,
  defaultSection,
  existingIds,
  onClose,
  onSave,
}: {
  open: boolean;
  question: SurveyQuestion | null;
  defaultSection?: string;
  existingIds: string[];
  onClose: () => void;
  onSave: (q: SurveyQuestion) => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!question;

  const [form, setForm] = useState<SurveyQuestion>(
    question || {
      id: "",
      section: defaultSection || "Geral",
      question: "",
      type: "text",
      required: false,
    },
  );
  const [optionsText, setOptionsText] = useState(
    (question?.options || []).join("\n"),
  );

  // Reset when dialog re-opens with new payload
  const key = `${open}-${question?.id ?? "new"}-${defaultSection ?? ""}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm(
      question || {
        id: "",
        section: defaultSection || "Geral",
        question: "",
        type: "text",
        required: false,
      },
    );
    setOptionsText((question?.options || []).join("\n"));
  }

  const needsOptions = form.type === "select" || form.type === "multiselect";
  const needsRange = form.type === "rating";

  const handleSubmit = () => {
    if (!form.section.trim() || !form.question.trim()) return;
    const id = form.id?.trim()
      ? form.id.trim()
      : (() => {
          // generate next id
          const nums = existingIds
            .map((x) => parseInt(x.replace(/^q/, ""), 10))
            .filter((n) => !Number.isNaN(n));
          return `q${(nums.length ? Math.max(...nums) : 0) + 1}`;
        })();

    const payload: SurveyQuestion = {
      ...form,
      id,
      options: needsOptions
        ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
        : undefined,
      min: needsRange ? Number(form.min ?? 1) : undefined,
      max: needsRange ? Number(form.max ?? 5) : undefined,
      autoFillKey: form.autoFillKey?.trim() || undefined,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("admin.surveys.editQuestion", "Editar pergunta")
              : t("admin.surveys.addQuestion", "Adicionar pergunta")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("admin.surveys.section", "Secção")}</Label>
              <Input
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("admin.surveys.type", "Tipo")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as SurveyQuestion["type"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>{tp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t("admin.surveys.questionText", "Pergunta")}</Label>
            <Textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              rows={2}
            />
          </div>

          {needsOptions && (
            <div className="space-y-1">
              <Label>{t("admin.surveys.options", "Opções (uma por linha)")}</Label>
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={5}
                placeholder="Opção 1&#10;Opção 2"
              />
            </div>
          )}

          {needsRange && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Min</Label>
                <Input
                  type="number"
                  value={form.min ?? 1}
                  onChange={(e) => setForm({ ...form, min: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label>Max</Label>
                <Input
                  type="number"
                  value={form.max ?? 5}
                  onChange={(e) => setForm({ ...form, max: Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>{t("admin.surveys.autoFillKey", "Auto-fill key (opcional)")}</Label>
            <Input
              value={form.autoFillKey || ""}
              onChange={(e) => setForm({ ...form, autoFillKey: e.target.value })}
              placeholder="ex.: stage, startup_name"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>{t("admin.surveys.required", "Obrigatória")}</Label>
            <Switch
              checked={!!form.required}
              onCheckedChange={(v) => setForm({ ...form, required: v })}
            />
          </div>

          {isEdit && (
            <div className="space-y-1">
              <Label>ID</Label>
              <Input value={form.id} disabled />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.section.trim() || !form.question.trim()}
          >
            {t("common.save", "Guardar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

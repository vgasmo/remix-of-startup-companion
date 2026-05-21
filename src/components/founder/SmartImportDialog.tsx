/**
 * Smart Import Dialog
 * Founders + consultants upload a pitch deck / business plan (PDF) → AI extracts
 * structured data → user reviews & approves field-by-field → apply to workspace.
 *
 * Modes:
 *  - "create": no workspace context → user picks program, AI fills form, then
 *    we create a Startup + Workspace + child rows (team, funding, KPIs).
 *  - "fill":  existing workspace passed in → only fill empty fields & insert
 *    additional team/funding/KPI rows.
 */
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Sparkles, Loader2, Check, X, AlertCircle, RotateCcw } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeWithAuth } from "@/lib/invokeWithAuth";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePrograms } from "@/hooks/useWorkspaces";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import i18n from "@/i18n";

type Stage = "ideation" | "validation" | "mvp" | "growth" | "scale";

interface ExtractedStartup {
  name?: string;
  description?: string;
  website?: string;
  sector?: string;
  founded_date?: string;
  stage?: Stage;
  address?: string;
  nif?: string;
  main_contact_name?: string;
  main_contact_email?: string;
  main_contact_phone?: string;
  evidence?: string;
}
interface ExtractedTeam {
  full_name: string; title?: string; email?: string; linkedin_url?: string;
  is_founder?: boolean; evidence?: string;
}
interface ExtractedFunding {
  round_type: string; raised_amount?: number; target_amount?: number;
  valuation?: number; status?: "planning" | "open" | "closed";
  announced_at?: string; notes?: string; evidence?: string;
}
interface ExtractedKpi {
  name: string; value: number; unit?: string; period_month?: string;
  notes?: string; evidence?: string;
}
interface Extraction {
  startup: ExtractedStartup;
  team_members?: ExtractedTeam[];
  funding_rounds?: ExtractedFunding[];
  kpis?: ExtractedKpi[];
  notes?: string;
}

type Mode = "create" | "fill";

interface SmartImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, dialog runs in "fill" mode and writes into this workspace. */
  workspaceId?: string;
  /** When in "fill" mode, the startup to update. */
  startupId?: string;
}

const STAGES: Stage[] = ["ideation", "validation", "mvp", "growth", "scale"];
const MAX_PDF_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // result is "data:application/pdf;base64,XXXX"
      resolve(result.split(",")[1] ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function SmartImportDialog({
  open, onOpenChange, workspaceId, startupId,
}: SmartImportDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin, isConsultor } = useAuth();
  const qc = useQueryClient();
  const { data: programs } = usePrograms();

  const isStaff = isAdmin || isConsultor;
  const mode: Mode = workspaceId && startupId ? "fill" : "create";
  const lang = (i18n.language || "pt").startsWith("en") ? "en" : "pt";

  const [step, setStep] = useState<"upload" | "extracting" | "review" | "applying">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [meta, setMeta] = useState<{ page_count: number } | null>(null);

  // Per-field "apply" toggles + editable values (controlled copy)
  const [includeStartup, setIncludeStartup] = useState<Record<string, boolean>>({});
  const [editStartup, setEditStartup] = useState<ExtractedStartup>({});
  const [includeTeam, setIncludeTeam] = useState<boolean[]>([]);
  const [includeFunding, setIncludeFunding] = useState<boolean[]>([]);
  const [includeKpis, setIncludeKpis] = useState<boolean[]>([]);
  const [programId, setProgramId] = useState<string>("");
  const [stage, setStage] = useState<Stage>("ideation");

  const reset = () => {
    setStep("upload"); setFile(null); setError(null); setExtraction(null);
    setMeta(null); setIncludeStartup({}); setEditStartup({});
    setIncludeTeam([]); setIncludeFunding([]); setIncludeKpis([]);
    setProgramId(""); setStage("ideation");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError(t("smartImport.errors.notPdf", { defaultValue: "Only PDF files are accepted." }));
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setError(t("smartImport.errors.tooLarge", { defaultValue: "PDF must be under 15 MB." }));
      return;
    }
    setFile(f);
  };

  const runExtraction = async () => {
    if (!file) return;
    setError(null);
    setStep("extracting");
    try {
      const file_base64 = await fileToBase64(file);
      const { data, error: invokeErr } = await invokeWithAuth<{
        extraction: Extraction; meta: { page_count: number };
      }>("smart-import-pdf", {
        body: { file_base64, file_name: file.name, language: lang },
      });
      if (invokeErr || !data?.extraction) {
        throw new Error(invokeErr?.message || t("smartImport.errors.extractFailed", {
          defaultValue: "Could not extract data from this PDF.",
        }));
      }
      const ex = data.extraction;
      setExtraction(ex);
      setMeta(data.meta || null);
      // Pre-select all available fields for review
      const startupKeys = Object.keys(ex.startup || {}).filter(k => k !== "evidence");
      const sk: Record<string, boolean> = {};
      startupKeys.forEach(k => { sk[k] = true; });
      setIncludeStartup(sk);
      setEditStartup({ ...ex.startup });
      setIncludeTeam((ex.team_members || []).map(() => true));
      setIncludeFunding((ex.funding_rounds || []).map(() => true));
      setIncludeKpis((ex.kpis || []).map(() => true));
      if (ex.startup?.stage) setStage(ex.startup.stage);
      setStep("review");
    } catch (e) {
      logger.warn("smart-import extraction failed", { error: e instanceof Error ? e.message : String(e) });
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("upload");
    }
  };

  const applyImport = async () => {
    if (!extraction || !user) return;
    setStep("applying");
    setError(null);

    try {
      let targetStartupId = startupId;
      let targetWorkspaceId = workspaceId;

      // 1. CREATE mode → make startup + workspace first
      if (mode === "create") {
        // Hard gate: only staff (admin/consultor) can create active workspaces
        // from a Smart Import. Founders must use the claim/onboarding flow so
        // every new workspace goes through review before activation.
        if (!isStaff) {
          throw new Error(t("smartImport.errors.staffOnlyCreate", {
            defaultValue: "Only staff can create a workspace from Smart Import. Please use the claim/onboarding flow.",
          }));
        }
        if (!programId) throw new Error(t("smartImport.errors.programRequired", {
          defaultValue: "Please select a program.",
        }));
        if (!editStartup.name?.trim()) throw new Error(t("smartImport.errors.nameRequired", {
          defaultValue: "Startup name is required.",
        }));

        const startupPayload: any = { name: editStartup.name.trim() };
        const map: Array<[keyof ExtractedStartup, string]> = [
          ["description", "description"], ["website", "website"],
          ["founded_date", "founded_date"], ["address", "address"],
          ["nif", "nif"], ["main_contact_name", "main_contact_name"],
          ["main_contact_email", "main_contact_email"],
          ["main_contact_phone", "main_contact_phone"],
        ];
        map.forEach(([from, to]) => {
          if (includeStartup[from] && (editStartup[from] as any)) {
            startupPayload[to] = editStartup[from];
          }
        });

        const { data: newStartup, error: startupErr } = await supabase
          .from("startups").insert(startupPayload).select("id").single();
        if (startupErr) throw startupErr;
        targetStartupId = newStartup.id;

        // Staff-created workspaces from Smart Import start as imported_unclaimed
        // (review required). Activation happens through the normal review flow,
        // not by client-side insert of an "active" workspace.
        const { data: newWs, error: wsErr } = await supabase
          .from("workspaces")
          .insert({
            startup_id: targetStartupId,
            program_id: programId,
            stage,
            status: "imported_unclaimed",
            needs_onboarding: false,
          })
          .select("id").single();
        if (wsErr) throw wsErr;
        targetWorkspaceId = newWs.id;

        // NOTE: Do NOT auto-add the staff member as a workspace_user/founder.
        // Founder linkage happens through the claim flow.
      } else {
        // FILL mode → patch only checked fields that exist in editStartup
        const patch: any = {};
        const map: Array<[keyof ExtractedStartup, string]> = [
          ["description", "description"], ["website", "website"],
          ["founded_date", "founded_date"], ["address", "address"],
          ["nif", "nif"], ["main_contact_name", "main_contact_name"],
          ["main_contact_email", "main_contact_email"],
          ["main_contact_phone", "main_contact_phone"],
        ];
        map.forEach(([from, to]) => {
          if (includeStartup[from] && (editStartup[from] as any)) {
            patch[to] = editStartup[from];
          }
        });
        if (Object.keys(patch).length > 0 && targetStartupId) {
          const { error: upErr } = await supabase
            .from("startups").update(patch).eq("id", targetStartupId);
          if (upErr) throw upErr;
        }
        if (includeStartup.stage && editStartup.stage && targetWorkspaceId) {
          await supabase.from("workspaces")
            .update({ stage: editStartup.stage }).eq("id", targetWorkspaceId);
        }
      }

      // 2. Team members
      const teamRows = (extraction.team_members || [])
        .map((m, i) => ({ m, i }))
        .filter(({ i }) => includeTeam[i])
        .map(({ m }) => ({
          startup_id: targetStartupId!,
          full_name: m.full_name,
          email: m.email || null,
          title: m.title || null,
          linkedin_url: m.linkedin_url || null,
          role: "team_member",
          is_founder: !!m.is_founder,
        }));
      if (teamRows.length) {
        const { error: tErr } = await supabase.from("team_members").insert(teamRows);
        if (tErr) logger.warn("team_members insert failed", { error: tErr.message });
      }

      // 3. Funding rounds
      const fundRows = (extraction.funding_rounds || [])
        .map((f, i) => ({ f, i }))
        .filter(({ i }) => includeFunding[i])
        .map(({ f }) => ({
          startup_id: targetStartupId!,
          round_type: f.round_type,
          raised_amount: f.raised_amount ?? 0,
          target_amount: f.target_amount ?? null,
          valuation: f.valuation ?? null,
          status: f.status || (f.raised_amount ? "closed" : "planning"),
          announced_at: f.announced_at || null,
          notes: f.notes || null,
        }));
      if (fundRows.length) {
        const { error: fErr } = await supabase.from("funding_rounds").insert(fundRows);
        if (fErr) logger.warn("funding_rounds insert failed", { error: fErr.message });
      }

      // 4. KPIs — find or create kpi_definitions, then upsert kpi_values
      const kpisToWrite = (extraction.kpis || [])
        .map((k, i) => ({ k, i }))
        .filter(({ i }) => includeKpis[i])
        .map(({ k }) => k);

      if (kpisToWrite.length && targetWorkspaceId) {
        const today = new Date();
        const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
        for (const k of kpisToWrite) {
          // Look up by case-insensitive name (global definitions preferred)
          const { data: existingDef } = await supabase
            .from("kpi_definitions")
            .select("id, unit")
            .ilike("name", k.name)
            .limit(1)
            .maybeSingle();

          let defId = existingDef?.id;
          if (!defId) {
            const { data: created, error: kdErr } = await supabase
              .from("kpi_definitions")
              .insert({ name: k.name, unit: k.unit || null, is_global: false, direction: "up" })
              .select("id").single();
            if (kdErr) { logger.warn("kpi_def create failed", { error: kdErr.message }); continue; }
            defId = created.id;
          }

          const period = (k.period_month && /^\d{4}-\d{2}-\d{2}$/.test(k.period_month))
            ? k.period_month
            : defaultPeriod;

          const { error: vErr } = await supabase.from("kpi_values").upsert({
            workspace_id: targetWorkspaceId,
            kpi_definition_id: defId,
            value: k.value,
            period_month: period,
            notes: k.notes || null,
            source_type: "ai",
            created_by: user.id,
          }, { onConflict: "workspace_id,kpi_definition_id,period_month" });
          if (vErr) logger.warn("kpi_value upsert failed", { error: vErr.message });
        }
      }

      toast.success(t("smartImport.success", { defaultValue: "Smart import complete." }));
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["team-members", targetStartupId] });
      qc.invalidateQueries({ queryKey: ["funding-rounds", targetStartupId] });
      qc.invalidateQueries({ queryKey: ["kpi-values"] });
      handleClose(false);

      if (mode === "create" && targetWorkspaceId) {
        navigate(`/workspace/${targetWorkspaceId}`);
      }
    } catch (e: any) {
      logger.warn("smart-import apply failed", { error: e instanceof Error ? e.message : String(e) });
      setError(e?.message || "Apply failed");
      setStep("review");
    }
  };

  const startupFieldLabels: Record<string, string> = useMemo(() => ({
    name: t("smartImport.fields.name", { defaultValue: "Name" }),
    description: t("smartImport.fields.description", { defaultValue: "Description" }),
    website: t("smartImport.fields.website", { defaultValue: "Website" }),
    sector: t("smartImport.fields.sector", { defaultValue: "Sector" }),
    founded_date: t("smartImport.fields.foundedDate", { defaultValue: "Founded date" }),
    stage: t("smartImport.fields.stage", { defaultValue: "Stage" }),
    address: t("smartImport.fields.address", { defaultValue: "Address" }),
    nif: t("smartImport.fields.nif", { defaultValue: "NIF" }),
    main_contact_name: t("smartImport.fields.contactName", { defaultValue: "Main contact name" }),
    main_contact_email: t("smartImport.fields.contactEmail", { defaultValue: "Main contact email" }),
    main_contact_phone: t("smartImport.fields.contactPhone", { defaultValue: "Main contact phone" }),
  }), [t]);

  const startupKeys = extraction
    ? Object.keys(extraction.startup || {}).filter(k => k !== "evidence" && k in startupFieldLabels)
    : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("smartImport.title", { defaultValue: "Smart Import from PDF" })}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("smartImport.description.create", {
                  defaultValue: "Upload a pitch deck or business plan and we'll extract the data into a draft. Staff review is required before the workspace is activated.",
                })
              : t("smartImport.description.fill", {
                  defaultValue: "Upload a pitch deck or business plan and we'll fill in the workspace fields. Every field is editable — review before applying.",
                })}
          </DialogDescription>
        </DialogHeader>

        {/* STEP: Upload */}
        {step === "upload" && (
          <div className="space-y-4 flex-1">
            <label
              htmlFor="smart-import-file"
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-accent/30 transition"
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">
                  {file ? file.name : t("smartImport.uploadCta", { defaultValue: "Click to upload a PDF" })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("smartImport.uploadHint", { defaultValue: "Pitch deck or business plan · text-based PDF · max 15 MB" })}
                </p>
              </div>
              <Input
                id="smart-import-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0] || null)}
              />
            </label>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* STEP: Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 flex-1">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">{t("smartImport.extracting", { defaultValue: "Reading your document…" })}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("smartImport.extractingHint", { defaultValue: "This usually takes 10–30 seconds." })}
              </p>
            </div>
          </div>
        )}

        {/* STEP: Review */}
        {step === "review" && extraction && (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-6">
              {meta && (
                <p className="text-xs text-muted-foreground">
                  {t("smartImport.parsed", {
                    defaultValue: "Parsed {{pages}} page(s). Review the extracted data, edit anything, then choose what to apply.",
                    pages: meta.page_count,
                  })}
                </p>
              )}

              {mode === "create" && (
                <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="space-y-1">
                    <Label>{t("smartImport.program", { defaultValue: "Program" })} *</Label>
                    <Select value={programId} onValueChange={setProgramId}>
                      <SelectTrigger><SelectValue placeholder={t("common.select", { defaultValue: "Select" })} /></SelectTrigger>
                      <SelectContent>
                        {(programs || []).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("smartImport.fields.stage", { defaultValue: "Stage" })}</Label>
                    <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Startup fields */}
              {startupKeys.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t("smartImport.sections.startup", { defaultValue: "Startup profile" })}
                  </h3>
                  <div className="space-y-2">
                    {startupKeys.map(k => (
                      <div key={k} className="flex items-start gap-2 p-2 rounded border border-border">
                        <Checkbox
                          checked={!!includeStartup[k]}
                          onCheckedChange={(v) => setIncludeStartup(s => ({ ...s, [k]: !!v }))}
                          className="mt-2"
                        />
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">{startupFieldLabels[k]}</Label>
                          {k === "description" || k === "address" ? (
                            <Textarea
                              value={(editStartup as any)[k] || ""}
                              onChange={e => setEditStartup(s => ({ ...s, [k]: e.target.value }))}
                              rows={2}
                            />
                          ) : k === "stage" ? (
                            <Select
                              value={editStartup.stage || "ideation"}
                              onValueChange={(v) => setEditStartup(s => ({ ...s, stage: v as Stage }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={(editStartup as any)[k] || ""}
                              onChange={e => setEditStartup(s => ({ ...s, [k]: e.target.value }))}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Team */}
              {(extraction.team_members || []).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-2">
                    {t("smartImport.sections.team", { defaultValue: "Team members" })}
                    <span className="ml-2 text-xs text-muted-foreground">({extraction.team_members!.length})</span>
                  </h3>
                  <div className="space-y-1">
                    {extraction.team_members!.map((m, i) => (
                      <label key={i} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/30 cursor-pointer">
                        <Checkbox
                          checked={!!includeTeam[i]}
                          onCheckedChange={(v) => setIncludeTeam(arr => arr.map((x, idx) => idx === i ? !!v : x))}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{m.full_name}</span>
                            {m.title && <Badge variant="secondary">{m.title}</Badge>}
                            {m.is_founder && <Badge>Founder</Badge>}
                          </div>
                          {(m.email || m.linkedin_url) && (
                            <p className="text-xs text-muted-foreground">
                              {m.email}{m.email && m.linkedin_url ? " · " : ""}{m.linkedin_url}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* Funding */}
              {(extraction.funding_rounds || []).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-2">
                    {t("smartImport.sections.funding", { defaultValue: "Funding" })}
                    <span className="ml-2 text-xs text-muted-foreground">({extraction.funding_rounds!.length})</span>
                  </h3>
                  <div className="space-y-1">
                    {extraction.funding_rounds!.map((f, i) => (
                      <label key={i} className="flex items-start gap-2 p-2 rounded border border-border hover:bg-accent/30 cursor-pointer">
                        <Checkbox
                          checked={!!includeFunding[i]}
                          onCheckedChange={(v) => setIncludeFunding(arr => arr.map((x, idx) => idx === i ? !!v : x))}
                          className="mt-1"
                        />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{f.round_type}</Badge>
                            {f.raised_amount != null && <span>€{f.raised_amount.toLocaleString()}</span>}
                            {f.target_amount != null && <span className="text-muted-foreground">/ target €{f.target_amount.toLocaleString()}</span>}
                          </div>
                          {f.valuation != null && <p className="text-xs text-muted-foreground">Valuation: €{f.valuation.toLocaleString()}</p>}
                          {f.notes && <p className="text-xs text-muted-foreground mt-0.5">{f.notes}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {/* KPIs */}
              {(extraction.kpis || []).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-2">
                    {t("smartImport.sections.kpis", { defaultValue: "KPIs" })}
                    <span className="ml-2 text-xs text-muted-foreground">({extraction.kpis!.length})</span>
                  </h3>
                  <div className="space-y-1">
                    {extraction.kpis!.map((k, i) => (
                      <label key={i} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/30 cursor-pointer">
                        <Checkbox
                          checked={!!includeKpis[i]}
                          onCheckedChange={(v) => setIncludeKpis(arr => arr.map((x, idx) => idx === i ? !!v : x))}
                        />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{k.name}</span>
                            <Badge variant="secondary">
                              {k.value.toLocaleString()}{k.unit ? ` ${k.unit}` : ""}
                            </Badge>
                            {k.period_month && <span className="text-xs text-muted-foreground">{k.period_month}</span>}
                          </div>
                          {k.evidence && <p className="text-xs text-muted-foreground italic mt-0.5">"{k.evidence}"</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {extraction.notes && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{extraction.notes}</AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>
        )}

        {step === "applying" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 flex-1">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">{t("smartImport.applying", { defaultValue: "Applying to your workspace…" })}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button onClick={runExtraction} disabled={!file}>
                <Sparkles className="h-4 w-4 mr-2" />
                {t("smartImport.analyse", { defaultValue: "Analyse with AI" })}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={reset} className="mr-auto">
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("smartImport.startOver", { defaultValue: "Upload another" })}
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)}>
                <X className="h-4 w-4 mr-2" />
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button onClick={applyImport}>
                <Check className="h-4 w-4 mr-2" />
                {t("smartImport.applySelected", { defaultValue: "Apply selected" })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

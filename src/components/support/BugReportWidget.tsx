import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bug, Upload, X, Loader2, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { getConsoleBuffer } from '@/lib/consoleBuffer';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const MAX_FILE_MB = 5;
const MAX_FILES = 4;

type Severity = 'low' | 'normal' | 'high' | 'blocker';

export function BugReportWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const workspaceMatchSplat = useMatch('/workspace/:id/*');
  const workspaceMatchExact = useMatch('/workspace/:id');
  const workspaceId = workspaceMatchSplat?.params?.id ?? workspaceMatchExact?.params?.id ?? null;

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Clipboard paste → screenshot capture
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        addFiles(imgs);
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [open, files]);

  const consoleErrorCount = useMemo(
    () => getConsoleBuffer().filter((e) => e.level !== 'warn').length,
    [open],
  );

  function addFiles(incoming: File[]) {
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!f.type.startsWith('image/')) {
        notify.error(t('bugReport.errorNotImage', 'Só imagens são suportadas.'));
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        notify.error(
          t('bugReport.errorTooLarge', {
            defaultValue: 'Ficheiro maior que {{mb}} MB.',
            mb: MAX_FILE_MB,
          }),
        );
        continue;
      }
      accepted.push(f);
    }
    setFiles((cur) => [...cur, ...accepted].slice(0, MAX_FILES));
  }

  function resetForm() {
    setDescription('');
    setSeverity('normal');
    setFiles([]);
  }

  async function handleSubmit() {
    if (!user) {
      notify.error(t('bugReport.needAuth', 'Inicie sessão para enviar um relatório.'));
      return;
    }
    const trimmed = description.trim();
    if (trimmed.length < 5) {
      notify.error(t('bugReport.tooShort', 'Descreva o problema (mín. 5 caracteres).'));
      return;
    }
    if (trimmed.length > 4000) {
      notify.error(t('bugReport.tooLong', 'Descrição demasiado longa.'));
      return;
    }

    setSubmitting(true);
    try {
      const reportId = crypto.randomUUID();

      // Upload screenshots first (path is scoped to auth.uid()/<report_id>/…)
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = (f.name.split('.').pop() || 'png').toLowerCase().slice(0, 5);
        const path = `${user.id}/${reportId}/${i}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('bug-report-screenshots')
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
      }

      const consoleEntries = getConsoleBuffer().slice(-20);

      const { error } = await supabase.from('bug_reports').insert({
        id: reportId,
        user_id: user.id,
        workspace_id: workspaceId,
        url: window.location.href.slice(0, 2000),
        route: location.pathname,
        description: trimmed,
        severity,
        user_agent: navigator.userAgent.slice(0, 500),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        console_errors: consoleEntries,
        screenshot_paths: uploadedPaths,
        metadata: {
          language: navigator.language,
          referrer: document.referrer || null,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;

      notify.success(t('bugReport.sent', 'Relatório enviado. Obrigado!'));
      resetForm();
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(
        t('bugReport.error', { defaultValue: 'Falha ao enviar: {{msg}}', msg }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Only render for signed-in users
  if (!user) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={t('bugReport.openLabel', 'Reportar problema')}
        className="fixed bottom-4 right-4 z-40 shadow-md gap-1.5 h-9 rounded-full pl-3 pr-4 print:hidden"
      >
        <Bug className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium">
          {t('bugReport.trigger', 'Reportar bug')}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => (submitting ? null : setOpen(v))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              {t('bugReport.title', 'Reportar um bug')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'bugReport.description',
                'Descreva o que aconteceu. Vamos capturar automaticamente a página, o workspace e erros recentes da consola.',
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bug-description">
                {t('bugReport.what', 'O que aconteceu?')}
              </Label>
              <Textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'bugReport.placeholder',
                  'Passos para reproduzir, o que esperava vs. o que aconteceu…',
                )}
                rows={5}
                maxLength={4000}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-severity">{t('bugReport.severity', 'Gravidade')}</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)} disabled={submitting}>
                <SelectTrigger id="bug-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('bugReport.sev.low', 'Baixa — pequeno incómodo')}</SelectItem>
                  <SelectItem value="normal">{t('bugReport.sev.normal', 'Normal')}</SelectItem>
                  <SelectItem value="high">{t('bugReport.sev.high', 'Alta — bloqueia uma tarefa')}</SelectItem>
                  <SelectItem value="blocker">{t('bugReport.sev.blocker', 'Bloqueador — não consigo usar a app')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('bugReport.screenshots', 'Screenshots')}</Label>
              <div
                ref={dropRef}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const dropped = Array.from(e.dataTransfer.files || []);
                  if (dropped.length) addFiles(dropped);
                }}
                className="rounded-md border border-dashed p-3 text-xs text-muted-foreground flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" aria-hidden />
                  <span>
                    {t(
                      'bugReport.pasteHint',
                      'Cole (Ctrl/⌘+V), arraste, ou escolha imagens — até {{n}}, {{mb}} MB cada.',
                      { n: MAX_FILES, mb: MAX_FILE_MB },
                    )}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting || files.length >= MAX_FILES}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {t('bugReport.choose', 'Escolher')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    if (list.length) addFiles(list);
                    e.target.value = '';
                  }}
                />
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {files.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                    >
                      <span className="max-w-[140px] truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((cur) => cur.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={t('common.remove', 'Remover')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                {t('bugReport.autoCaptured', 'Anexado automaticamente')}
              </p>
              <p className="truncate">
                <span className="font-medium">{t('bugReport.page', 'Página')}:</span>{' '}
                {location.pathname}
              </p>
              {workspaceId && (
                <p className="truncate">
                  <span className="font-medium">{t('bugReport.workspace', 'Workspace')}:</span>{' '}
                  {workspaceId}
                </p>
              )}
              <p>
                <span className="font-medium">{t('bugReport.viewport', 'Viewport')}:</span>{' '}
                {typeof window !== 'undefined' && `${window.innerWidth}×${window.innerHeight}`}
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-medium">{t('bugReport.consoleErrors', 'Erros da consola')}:</span>
                <Badge variant={consoleErrorCount > 0 ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                  {consoleErrorCount}
                </Badge>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || description.trim().length < 5}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t('bugReport.submit', 'Enviar relatório')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

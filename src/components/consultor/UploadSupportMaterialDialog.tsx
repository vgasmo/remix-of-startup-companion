import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from "@/lib/notify";
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePrograms } from '@/hooks/useAdminData';
import {
  useCreateSupportMaterial,
  useUpdateSupportMaterial,
  useUploadSupportMaterialFile,
} from '@/hooks/useSupportMaterials';
import { logger } from '@/lib/logger';

const CATEGORIES = ['guide', 'checklist', 'example', 'template'] as const;
const STAGES = ['idea', 'validation', 'early_traction', 'growth', 'scale'] as const;

interface UploadSupportMaterialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadSupportMaterialDialog({
  open,
  onOpenChange,
}: UploadSupportMaterialDialogProps) {
  const { t } = useTranslation();
  const { data: programs } = usePrograms();
  const createMaterial = useCreateSupportMaterial();
  const updateMaterial = useUpdateSupportMaterial();
  const uploadFile = useUploadSupportMaterialFile();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [programId, setProgramId] = useState<string>('');
  const [category, setCategory] = useState<string>('guide');
  const [stage, setStage] = useState<string>('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [attachToProposal, setAttachToProposal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setProgramId('');
    setCategory('guide');
    setStage('');
    setTags('');
    setFile(null);
    setAttachToProposal(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      notify.error(t('consultorTools.upload.titleRequired'));
      return;
    }
    if (!file) {
      notify.error(t('consultorTools.upload.fileRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // 1) Create the row first to get an id (status = approved so founders see it immediately)
      const created = await createMaterial.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        program_id: programId || null,
        category,
        startup_stage: stage || null,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        status: 'approved',
        external_links: [],
        attach_to_proposal: attachToProposal,
      });

      // 2) Upload file to storage under <programId|global>/<material_id>/
      const filePath = await uploadFile.mutateAsync({
        file,
        programId: programId || null,
        materialId: created.id,
      });

      // 3) Patch material row with file_path
      await updateMaterial.mutateAsync({ id: created.id, file_path: filePath });

      notify.success(t('consultorTools.upload.success'));
      reset();
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to upload support material', {}, err as Error);
      notify.error(
        t('consultorTools.upload.error'),
        { description: (err as Error).message }
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('consultorTools.upload.title')}</DialogTitle>
          <DialogDescription>
            {t('consultorTools.upload.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('consultorTools.upload.titleLabel')} *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('consultorTools.upload.titlePlaceholder')}
            />
          </div>

          <div>
            <Label>{t('consultorTools.upload.descriptionLabel')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t('consultorTools.upload.descriptionPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('consultorTools.upload.program')}</Label>
              <Select value={programId || 'global'} onValueChange={(v) => setProgramId(v === 'global' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{t('consultorTools.upload.globalScope')}</SelectItem>
                  {programs?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('consultorTools.upload.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('consultorTools.upload.stage')}</Label>
              <Select value={stage || 'any'} onValueChange={(v) => setStage(v === 'any' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('consultorTools.upload.anyStage')}</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('consultorTools.upload.tags')}</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="sales, pitch"
              />
            </div>
          </div>

          <div>
            <Label>{t('consultorTools.upload.file')} *</Label>
            <Input
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.md,.zip,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                {file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
            <input
              type="checkbox"
              id="attach-to-proposal"
              className="mt-1 h-4 w-4 accent-primary"
              checked={attachToProposal}
              onChange={(e) => setAttachToProposal(e.target.checked)}
              disabled={!programId}
            />
            <div className="grid gap-1">
              <Label htmlFor="attach-to-proposal" className="text-sm font-medium">
                {t('consultorTools.upload.attachToProposal', {
                  defaultValue: 'Anexar à proposta comercial (CRM)',
                })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {programId
                  ? t('consultorTools.upload.attachToProposalHint', {
                      defaultValue:
                        'Este documento aparece pré-selecionado ao enviar propostas para leads deste programa.',
                    })
                  : t('consultorTools.upload.attachToProposalNeedsProgram', {
                      defaultValue:
                        'Escolha um programa acima para permitir anexar automaticamente às propostas.',
                    })}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} loading={submitting}>
            <Upload className="h-4 w-4 mr-2" />
            {submitting
              ? t('consultorTools.upload.uploading')
              : t('consultorTools.upload.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

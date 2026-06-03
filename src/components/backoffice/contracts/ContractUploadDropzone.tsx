import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Loader2, PenLine, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

export interface AIExtractedData {
  title?: string;
  startDate?: string;
  endDate?: string;
  monthlyFee?: number;
  parties?: string[];
  notes?: string;
  key_dates?: Array<{ date: string; description: string; is_critical: boolean }>;
  missing_info?: Array<{ field: string; severity: string; suggestion: string }>;
  risk_level?: string;
  risk_justification?: string;
}

interface ContractUploadDropzoneProps {
  workspaceId?: string;
  onAIDataExtracted: (data: AIExtractedData, documentUrl: string) => void;
  onManualEntry: () => void;
  onCancel?: () => void;
}

export function ContractUploadDropzone({ workspaceId, onAIDataExtracted, onManualEntry, onCancel }: ContractUploadDropzoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      notify.error(t('contracts.upload.invalidType', { defaultValue: 'Only PDF files are accepted.' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error(t('contracts.upload.tooLarge', { defaultValue: 'File must be under 10MB.' }));
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Upload to storage
      setProcessingStep(t('contracts.upload.uploading', { defaultValue: 'Uploading document...' }));
      const fileName = `${workspaceId || 'unassigned'}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('contract-documents')
        .upload(fileName, file, { contentType: 'application/pdf' });

      if (uploadError) throw new Error(uploadError.message);

      const documentUrl = fileName;

      // Step 2: Trigger AI analysis
      setProcessingStep(t('contracts.upload.analyzing', { defaultValue: 'Analyzing with AI...' }));
      const { data: aiResult, error: aiError } = await supabase.functions.invoke('analyze-contract-document', {
        body: { filePath: fileName, workspaceId },
      });

      if (aiError || !aiResult?.extraction) {
        // AI failed — graceful degradation
        notify.error(t('contracts.upload.aiFailed', { defaultValue: 'AI could not read the PDF. Please enter details manually.' }));
        onAIDataExtracted({}, documentUrl);
      } else {
        notify.success(t('contracts.upload.aiSuccess', { defaultValue: 'AI extracted contract data. Please review before saving.' }));
        onAIDataExtracted(aiResult.extraction, documentUrl);
      }
    } catch (err) {
      logger.error('Contract upload failed', {}, err);
      notify.error(t('contracts.upload.error', { defaultValue: 'Upload failed. Please try again.' }));
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  }, [workspaceId, onAIDataExtracted, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  return (
    <Card className="border-2 border-dashed transition-colors relative overflow-hidden">
      {isProcessing && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-primary">{processingStep}</p>
        </div>
      )}
      <CardContent className="pt-6">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-4 py-10 px-6 rounded-xl cursor-pointer transition-all',
            isDragging
              ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
              : 'bg-muted/30 hover:bg-muted/50'
          )}
        >
          <div className={cn(
            'p-4 rounded-full transition-colors',
            isDragging ? 'bg-primary/20' : 'bg-muted'
          )}>
            {isDragging ? (
              <FileText className="h-8 w-8 text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">
              {t('contracts.upload.dropzoneTitle', { defaultValue: 'Drop your contract PDF here' })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('contracts.upload.dropzoneSubtitle', { defaultValue: 'or click to browse · PDF only · Max 10MB' })}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 mt-4">
          {onCancel ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              {t('common.back', { defaultValue: 'Back' })}
            </Button>
          ) : <span />}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onManualEntry();
            }}
          >
            <PenLine className="h-4 w-4" />
            {t('contracts.upload.manualEntry', { defaultValue: 'Skip AI & Enter Data Manually' })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

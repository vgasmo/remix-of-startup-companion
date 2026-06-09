import { useState, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExportAnalyticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXPORT_OPTIONS = [
  {
    id: 'portfolio',
    icon: FileSpreadsheet,
    label: 'Portfolio Overview',
    description: 'All startups with health, stage, KPIs',
    format: 'CSV',
    rows: '~50 rows',
  },
  {
    id: 'kpis',
    icon: FileText,
    label: 'KPI Summary Report',
    description: 'Monthly KPIs across all workspaces',
    format: 'CSV',
    rows: '~200 rows',
  },
  {
    id: 'activity',
    icon: FileText,
    label: 'Activity & Sessions Log',
    description: 'Last 90 days of session activity',
    format: 'CSV',
    rows: '~150 rows',
  },
] as const;

export const ExportAnalyticsModal = forwardRef<HTMLDivElement, ExportAnalyticsModalProps>(function ExportAnalyticsModal({ open, onOpenChange }, ref) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);

  const handleExport = async (id: string) => {
    setExporting(id);
    // Simulate export delay
    await new Promise(r => setTimeout(r, 2000));
    setExporting(null);
    setCompleted(prev => [...prev, id]);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setExporting(null);
      setCompleted([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent ref={ref} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Download className="h-4 w-4 text-primary" />
            </div>
            {t('admin.exportTitle', { defaultValue: 'Export Analytics' })}
          </DialogTitle>
          <DialogDescription>
            {t('admin.exportDescription', { defaultValue: 'Download ecosystem data as CSV reports.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {EXPORT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isExporting = exporting === option.id;
            const isCompleted = completed.includes(option.id);

            return (
              <motion.div
                key={option.id}
                whileHover={{ scale: 1.01 }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
                  isCompleted ? 'border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/30' : 'border-border hover:border-primary/30 hover:bg-muted/30',
                )}
              >
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                  isCompleted ? 'bg-[hsl(var(--success))]/10' : 'bg-muted/50',
                )}>
                  {isCompleted ? (
                    <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{option.format}</Badge>
                    <span className="text-[10px] text-muted-foreground">{option.rows}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isCompleted ? 'outline' : 'default'}
                  disabled={isExporting}
                  onClick={() => handleExport(option.id)}
                  className="shrink-0 gap-1.5 text-xs"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Exporting…</span>
                    </>
                  ) : isCompleted ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Done</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      <span>Export</span>
                    </>
                  )}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
});

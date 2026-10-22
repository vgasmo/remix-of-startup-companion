import { useState } from 'react';
import { printHtmlSandboxed } from "@/lib/printHtml";
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface DownloadHtmlReportButtonProps {
  functionName: 'generate-mentor-impact-report' | 'generate-board-pack';
  body?: Record<string, any>;
  label: string;
  loadingLabel?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm';
}

/**
 * Generic button that invokes an edge function returning `{ html }` and
 * opens it in a new window for the user to print/save as PDF.
 */
export function DownloadHtmlReportButton({
  functionName, body, label, loadingLabel, variant = 'default', size = 'default',
}: DownloadHtmlReportButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithAuth(functionName, { body: body ?? {} });
      if (error) throw error;
      if (!data?.html) throw new Error('No HTML returned');
      printHtmlSandboxed(data.html);
    } catch (err: any) {
      notify.error(t('reports.errorTitle', 'Não foi possível gerar o relatório'), err?.message || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handle} disabled={loading} loading={loading} variant={variant} size={size}>
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
      {loading ? (loadingLabel || t('reports.generating', 'A gerar...')) : label}
    </Button>
  );
}

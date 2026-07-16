import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from '@/lib/notify';
import { Copy, Share2 } from 'lucide-react';

interface UtmBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base share URL, e.g. `https://fb.startupleiria.com/book/<token>`. */
  baseUrl: string;
  /** Optional label to prefill the campaign field. */
  suggestedCampaign?: string | null;
}

const SOURCE_PRESETS = ['linkedin', 'instagram', 'newsletter', 'partner', 'event', 'website'];
const MEDIUM_PRESETS = ['social', 'email', 'referral', 'paid', 'organic', 'qr'];

/**
 * Staff-only helper: append UTM parameters to a booking URL for external
 * channels. It never changes the token itself — the resulting URL still
 * resolves through the same `public-get-availability` validation path. The
 * UTM params only surface in the booking payload's metadata so we can
 * attribute where each first-contact came from.
 */
export function UtmBuilderDialog({ open, onOpenChange, baseUrl, suggestedCampaign }: UtmBuilderDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState('linkedin');
  const [medium, setMedium] = useState('social');
  const [campaign, setCampaign] = useState(suggestedCampaign || 'first-contact');
  const [content, setContent] = useState('');

  const finalUrl = useMemo(() => {
    if (!baseUrl) return '';
    try {
      const url = new URL(baseUrl);
      if (source) url.searchParams.set('utm_source', source);
      if (medium) url.searchParams.set('utm_medium', medium);
      if (campaign) url.searchParams.set('utm_campaign', campaign);
      if (content) url.searchParams.set('utm_content', content);
      return url.toString();
    } catch {
      return baseUrl;
    }
  }, [baseUrl, source, medium, campaign, content]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finalUrl);
      notify.success(t('admin.utm.copied', 'URL com UTM copiado'));
    } catch {
      notify.error(t('admin.utm.copyFailed', 'Falha ao copiar'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            {t('admin.utm.title', 'Gerar URL para canal externo')}
          </DialogTitle>
          <DialogDescription>
            {t('admin.utm.description', 'Adicione parâmetros UTM para atribuir a origem do lead. O token de reserva não muda.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label>{t('admin.utm.source', 'Origem (utm_source)')}</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_PRESETS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('admin.utm.medium', 'Meio (utm_medium)')}</Label>
            <Select value={medium} onValueChange={setMedium}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEDIUM_PRESETS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{t('admin.utm.campaign', 'Campanha (utm_campaign)')}</Label>
            <Input value={campaign} onChange={(e) => setCampaign(e.target.value.trim())} placeholder="first-contact" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{t('admin.utm.content', 'Conteúdo (utm_content, opcional)')}</Label>
            <Input value={content} onChange={(e) => setContent(e.target.value.trim())} placeholder="footer-cta" />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Label className="text-xs text-muted-foreground">{t('admin.utm.result', 'URL final')}</Label>
          <div className="flex gap-2">
            <Input readOnly value={finalUrl} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={copy} aria-label={t('common.copy', 'Copiar')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

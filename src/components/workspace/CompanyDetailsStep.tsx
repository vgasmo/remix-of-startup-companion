import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertCircle, Loader2, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CompanyDetailsStepProps {
  startupName: string;
  website: string;
  mainContactName: string;
  mainContactEmail: string;
  nif: string;
  onUpdate: (data: {
    startupName?: string;
    website?: string;
    mainContactName?: string;
    mainContactEmail?: string;
    nif?: string;
  }) => void;
  onNifValid: (valid: boolean) => void;
}

// Portuguese NIF validation function
function validatePortugueseNIF(nif: string): boolean {
  const cleanNif = nif.replace(/[^0-9]/g, '');
  
  if (cleanNif.length !== 9) return false;
  
  const firstDigit = cleanNif[0];
  if (!['1', '2', '3', '5', '6', '7', '8', '9'].includes(firstDigit)) return false;
  
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(cleanNif[i]) * (10 - i);
  }
  
  let checkDigit = 11 - (sum % 11);
  if (checkDigit >= 10) checkDigit = 0;
  
  return checkDigit === parseInt(cleanNif[8]);
}

export function CompanyDetailsStep({
  startupName,
  website,
  mainContactName,
  mainContactEmail,
  nif,
  onUpdate,
  onNifValid,
}: CompanyDetailsStepProps) {
  const { t } = useTranslation();
  const [nifStatus, setNifStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [localNif, setLocalNif] = useState(nif);

  useEffect(() => {
    if (!localNif || localNif.length < 9) {
      setNifStatus('idle');
      onNifValid(false);
      return;
    }

    setNifStatus('validating');
    
    // Debounce validation
    const timeout = setTimeout(() => {
      const isValid = validatePortugueseNIF(localNif);
      setNifStatus(isValid ? 'valid' : 'invalid');
      onNifValid(isValid);
    }, 300);

    return () => clearTimeout(timeout);
  }, [localNif, onNifValid]);

  const handleNifChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 9);
    setLocalNif(cleaned);
    onUpdate({ nif: cleaned });
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold">{t('onboardingWizard.companyDetails')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('onboardingWizard.companyDetailsDesc')}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="startup-name">{t('onboardingWizard.startupName')}</Label>
          <Input
            id="startup-name"
            value={startupName}
            onChange={(e) => onUpdate({ startupName: e.target.value })}
            placeholder="Startup Inc."
          />
        </div>

        <div>
          <Label htmlFor="website">{t('onboardingWizard.website')}</Label>
          <Input
            id="website"
            value={website}
            onChange={(e) => onUpdate({ website: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="contact-name">{t('onboardingWizard.mainContact')}</Label>
            <Input
              id="contact-name"
              value={mainContactName}
              onChange={(e) => onUpdate({ mainContactName: e.target.value })}
              placeholder="João Silva"
            />
          </div>
          <div>
            <Label htmlFor="contact-email">{t('common.email', 'Email')}</Label>
            <Input
              id="contact-email"
              type="email"
              value={mainContactEmail}
              onChange={(e) => onUpdate({ mainContactEmail: e.target.value })}
              placeholder="joao@startup.pt"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="nif" className="flex items-center gap-2">
            {t('nif.label')}
            <Badge variant="secondary" className="text-xs font-normal">
              {t('common.important', 'Important')}
            </Badge>
          </Label>
          <div className="relative">
            <Input
              id="nif"
              value={localNif}
              onChange={(e) => handleNifChange(e.target.value)}
              placeholder={t('nif.placeholder')}
              maxLength={9}
              className={cn(
                'pr-10',
                nifStatus === 'valid' && 'border-[hsl(var(--success))]/30 focus-visible:ring-green-500',
                nifStatus === 'invalid' && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {nifStatus === 'validating' && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {nifStatus === 'valid' && (
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              )}
              {nifStatus === 'invalid' && (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('nif.helpText')}
          </p>
          {nifStatus === 'invalid' && (
            <p className="text-xs text-destructive mt-1">{t('nif.invalid')}</p>
          )}
          {nifStatus === 'valid' && (
            <p className="text-xs text-[hsl(var(--success))] mt-1">{t('nif.valid')}</p>
          )}
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
          <p>{t('onboardingWizard.nifRequired')}</p>
        </div>
      </div>
    </div>
  );
}

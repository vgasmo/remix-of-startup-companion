import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, FileText, Building2, Ruler, Calendar, Euro } from 'lucide-react';
import { useContracts } from '@/hooks/useBackoffice';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';

interface LocationContractCardProps {
  workspaceId: string;
}

export function LocationContractCard({ workspaceId }: LocationContractCardProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: contracts, isLoading } = useContracts({ workspaceId });
  
  // Get the active or most recent contract
  const contract = contracts?.find(c => c.status === 'active') || contracts?.[0];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            {t('workspace.locationContract')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (!contract) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            {t('workspace.locationContract')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('workspace.noContractAssigned')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
    draft: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
    pending_signature: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
    suspended: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
    terminated: 'bg-destructive/10 text-destructive border-destructive/30',
    expired: 'bg-muted text-muted-foreground border-muted',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            {t('workspace.locationContract')}
          </CardTitle>
          <Badge className={statusColors[contract.status] || ''}>
            {t(`admin.backoffice.contractStatus.${contract.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Location */}
        {contract.building && (
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">{contract.building.name}</p>
              {contract.building.address && (
                <p className="text-sm text-muted-foreground">{contract.building.address}</p>
              )}
              <p className="text-sm text-muted-foreground">{contract.building.city}</p>
            </div>
          </div>
        )}

        {/* Contract Type */}
        {contract.incubation_type && (
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">{contract.incubation_type.name}</p>
              {contract.incubation_type.contract_type && (
                <Badge variant="outline" className="text-xs mt-1">
                  {t(`admin.backoffice.contractTypes.${contract.incubation_type.contract_type}`)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Square meters */}
        {contract.square_meters && (
          <div className="flex items-center gap-3">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{contract.square_meters} m²</span>
          </div>
        )}

        {/* Monthly fee */}
        <div className="flex items-center gap-3">
          <Euro className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            €{contract.monthly_fee?.toFixed(2)}/mo
          </span>
        </div>

        {/* Contract dates */}
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {format(new Date(contract.start_date), 'MMM yyyy', { locale: dateLocale })}
            {contract.end_date && ` - ${format(new Date(contract.end_date), 'MMM yyyy', { locale: dateLocale })}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
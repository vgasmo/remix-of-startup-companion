/**
 * CRM Drawer - Linked Context Panel
 * Shows contract, workspace, and startup details when a funnel item has linked entities
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Building2, FileText, Briefcase, ExternalLink, MapPin, Calendar, Euro, Users, PlusCircle, Send, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface LinkedContextPanelProps {
  linkedWorkspaceId: string | null;
  linkedStartupId: string | null;
  linkedContractId: string | null;
  funnelItemId: string;
  onInitiateContract?: () => void;
  onSendContract?: (contractId: string) => void;
  onCreateAndSendContract?: () => void;
}

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  draft: 'bg-muted text-muted-foreground',
  pending_signature: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
  suspended: 'bg-destructive/15 text-destructive',
  terminated: 'bg-destructive/15 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

function ContractCard({ contract, t, compact }: { contract: any; t: any; compact?: boolean }) {
  return (
    <div className={cn('space-y-1.5', compact ? 'bg-background/60 rounded-md p-2 border border-border/40' : '')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1.5 min-w-0">
          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{contract.contract_number || t('crm.contract', { defaultValue: 'Contrato' })}</span>
        </span>
        <Badge className={cn('text-[10px] h-5 shrink-0', CONTRACT_STATUS_COLORS[contract.status] || '')}>
          {t(`admin.backoffice.contractStatus.${contract.status}`, { defaultValue: contract.status })}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Euro className="h-3 w-3" />
          {contract.monthly_fee ? `€${contract.monthly_fee} /mês` : '—'}
        </span>
        {contract.square_meters && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {contract.square_meters} m²
          </span>
        )}
        {contract.start_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(contract.start_date).toLocaleDateString('pt-PT')}
            {contract.end_date ? ` → ${new Date(contract.end_date).toLocaleDateString('pt-PT')}` : ''}
          </span>
        )}
        {contract.building?.name && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {contract.building.name}
          </span>
        )}
      </div>

      {contract.incubation_type?.name && (
        <Badge variant="outline" className="text-[10px] h-5">
          {contract.incubation_type.name}
        </Badge>
      )}
    </div>
  );
}

export function LinkedContextPanel({
  linkedWorkspaceId,
  linkedStartupId,
  linkedContractId,
  funnelItemId,
  onInitiateContract,
  onSendContract,
  onCreateAndSendContract,
}: LinkedContextPanelProps) {
  const { t } = useTranslation();

  // Fetch workspace + startup info
  const { data: workspace, isLoading: loadingWs } = useQuery({
    queryKey: ['crm-linked-workspace', linkedWorkspaceId],
    enabled: !!linkedWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, stage, status, startup:startups(id, name, sector, main_contact_email, main_contact_name), program:programs(id, name)')
        .eq('id', linkedWorkspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch startup directly when the lead is linked to a startup but not to a
  // workspace yet (pre-onboarding CRM leads keep workspace_id null).
  const { data: startupOnly, isLoading: loadingStartup } = useQuery({
    queryKey: ['crm-linked-startup', linkedStartupId],
    enabled: !!linkedStartupId && !linkedWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startups')
        .select('id, name, sector, main_contact_email, main_contact_name')
        .eq('id', linkedStartupId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch linked contract
  const { data: contract, isLoading: loadingContract } = useQuery({
    queryKey: ['crm-linked-contract', linkedContractId],
    enabled: !!linkedContractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('id, contract_number, status, archived_at, start_date, end_date, monthly_fee, currency, square_meters, incubation_type:incubation_types(name), building:buildings(name, code)')
        .eq('id', linkedContractId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Always fetch workspace contracts when workspace is linked (exclude archived)
  const { data: workspaceContracts, isLoading: loadingWsContracts } = useQuery({
    queryKey: ['crm-workspace-contracts', linkedWorkspaceId],
    enabled: !!linkedWorkspaceId && !linkedContractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('id, contract_number, status, archived_at, start_date, end_date, monthly_fee, currency, square_meters, incubation_type:incubation_types(name), building:buildings(name, code)')
        .eq('workspace_id', linkedWorkspaceId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const hasAnyLink = linkedWorkspaceId || linkedStartupId || linkedContractId;
  if (!hasAnyLink) return null;

  const isLoading = loadingWs || loadingContract || loadingWsContracts;
  if (isLoading) {
    return (
      <Card className="flex-1 border-border/60">
        <CardContent className="p-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Treat archived contracts as "no usable contract"
  const contractUsable = contract && !(contract as any).archived_at;
  const primaryContractId = contractUsable ? contract!.id : (workspaceContracts?.[0]?.id || null);
  const contractMissing = !!linkedContractId && !contract;
  const contractArchived = !!contract && !!(contract as any).archived_at;
  const noUsableContract = !primaryContractId && (contractMissing || contractArchived || linkedWorkspaceId || linkedStartupId);

  // Links present but referenced rows were deleted / RLS-hidden and there is
  // nothing else to render → degrade gracefully. Still expose the create+send
  // button when the caller provided it so staff can recover.
  const nothingToShow =
    !workspace &&
    !contract &&
    !(workspaceContracts && workspaceContracts.length > 0);
  if (nothingToShow) {
    return (
      <Card className="flex-1 border-border/60 bg-muted/30">
        <CardContent className="p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {t('crm.linkedContext', { defaultValue: 'Contexto Vinculado' })}
          </p>
          <p className="text-xs text-muted-foreground">
            {contractMissing
              ? t('crm.contractMissingNotice', { defaultValue: 'O contrato vinculado já não existe (foi eliminado ou arquivado).' })
              : t('crm.noLinkedContext', { defaultValue: 'Sem contexto associado.' })}
          </p>
          {onCreateAndSendContract && (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5"
              onClick={onCreateAndSendContract}
            >
              <Zap className="h-3.5 w-3.5" />
              {t('crm.createAndSendContract', { defaultValue: 'Criar contrato e enviar' })}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }


  return (
    <Card className="flex-1 border-border/60 bg-muted/30">
      <CardContent className="flex h-full flex-col p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" />
          {t('crm.linkedContext', { defaultValue: 'Contexto Vinculado' })}
        </p>

        {/* Workspace / Startup Info */}
        {workspace && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {(workspace as any).startup?.name || 'Workspace'}
              </span>
              <Link to={`/workspace/${workspace.id}`}>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {t('common.open', { defaultValue: 'Abrir' })}
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {workspace.stage && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {String(workspace.stage)}
                </Badge>
              )}
              {(workspace as any).program?.name && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  {(workspace as any).program.name}
                </Badge>
              )}
              {(workspace as any).startup?.sector && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {(workspace as any).startup.sector}
                </Badge>
              )}
            </div>
            {(workspace as any).startup?.main_contact_email && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {(workspace as any).startup.main_contact_name} — {(workspace as any).startup.main_contact_email}
              </p>
            )}
          </div>
        )}

        {/* Contract Info — linked contract OR all workspace contracts */}
        {contract ? (
          <div className="border-t pt-2">
            <ContractCard contract={contract} t={t} />
          </div>
        ) : (workspaceContracts && workspaceContracts.length > 0) ? (
          <div className="border-t pt-2 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {t('crm.contract', { defaultValue: 'Contratos' })} ({workspaceContracts.length})
            </p>
            {workspaceContracts.map((c) => (
              <ContractCard key={c.id} contract={c} t={t} compact />
            ))}
          </div>
        ) : linkedWorkspaceId ? (
          <div className="border-t pt-2 space-y-2">
            <p className="text-xs text-muted-foreground italic">
              {contractMissing
                ? t('crm.contractMissingNotice', { defaultValue: 'O contrato vinculado já não existe (foi eliminado ou arquivado).' })
                : contractArchived
                ? t('crm.contractArchivedNotice', { defaultValue: 'O contrato vinculado foi arquivado.' })
                : t('crm.noContractsAvailable', { defaultValue: 'Sem contratos neste workspace' })}
            </p>
          </div>
        ) : null}

        {/* Clear contract actions */}
        {(onInitiateContract || (onSendContract && primaryContractId) || (onCreateAndSendContract && noUsableContract)) && (
          <div className="border-t pt-2 flex flex-wrap gap-2">
            {onInitiateContract && (
              <Button
                size="sm"
                variant={noUsableContract ? 'outline' : 'default'}
                className="h-8 text-xs gap-1.5"
                onClick={onInitiateContract}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                {t('crm.initiateContract', { defaultValue: 'Iniciar Contrato' })}
              </Button>
            )}
            {onCreateAndSendContract && noUsableContract && (
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs gap-1.5"
                onClick={onCreateAndSendContract}
              >
                <Zap className="h-3.5 w-3.5" />
                {t('crm.createAndSendContract', { defaultValue: 'Criar contrato e enviar' })}
              </Button>
            )}
            {onSendContract && primaryContractId && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => onSendContract(primaryContractId)}
              >
                <Send className="h-3.5 w-3.5" />
                {t('crm.sendContract', { defaultValue: 'Enviar Contrato' })}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

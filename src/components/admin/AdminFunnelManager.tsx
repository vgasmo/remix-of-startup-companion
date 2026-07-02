import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Settings, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useFunnelItems, useCreateFunnelItem, useUpdateFunnelItem, useConvertToStartup, FunnelItem, FunnelStage } from '@/hooks/useFunnel';
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useIncubationTypes, useBuildings } from '@/hooks/useBackoffice';
import { useAuth } from '@/contexts/AuthContext';
import { IntakeRoutingManager } from './IntakeRoutingManager';
import { RecordDrawer } from '@/components/crm/RecordDrawer';
import { PipelineView } from '@/components/crm/PipelineView';
import type { CrmInboxItem } from '@/hooks/useCrmInbox';

export function AdminFunnelManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: programs } = usePrograms();
  const { data: consultors } = useConsultors();
  const createItem = useCreateFunnelItem();
  
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [convertDialogItem, setConvertDialogItem] = useState<FunnelItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showMineOnly, setShowMineOnly] = useState(false);

  const handleOpenDrawer = (item: CrmInboxItem) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  return (
    <Tabs defaultValue="funnel" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.funnel.title')}</h2>
          <p className="text-muted-foreground">{t('admin.funnel.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-mine"
              checked={showMineOnly}
              onCheckedChange={setShowMineOnly}
            />
            <Label htmlFor="show-mine" className="text-sm cursor-pointer">{t('admin.funnel.myDealsOnly')}</Label>
          </div>
          <TabsList>
            <TabsTrigger value="funnel">{t('admin.funnel.pipeline')}</TabsTrigger>
            <TabsTrigger value="routing" className="gap-1">
              <Settings className="h-3 w-3" />
              {t('admin.funnel.intakeRouting')}
            </TabsTrigger>
          </TabsList>
          <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t('admin.funnel.addLead')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.funnel.addNewLead')}</DialogTitle>
              </DialogHeader>
              <NewLeadForm 
                programs={programs || []}
                consultors={consultors || []}
                isPending={createItem.isPending}
                onSubmit={(data) => {
                  createItem.mutate(data, { onSuccess: () => setIsNewDialogOpen(false) });
                }}
              />

            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TabsContent value="routing">
        <IntakeRoutingManager />
      </TabsContent>

      <TabsContent value="funnel">
        <PipelineView
          myItemsOnly={showMineOnly}
          currentUserId={user?.id}
          onOpenDrawer={handleOpenDrawer}
        />

        {/* CRM Record Drawer */}
        <RecordDrawer
          item={selectedItem}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </TabsContent>
    </Tabs>
  );
}

function NewLeadForm({ 
  programs, 
  consultors,
  onSubmit,
  isPending,
}: { 
  programs: { id: string; name: string }[];
  consultors: { id: string; full_name: string | null }[];
  onSubmit: (data: Partial<FunnelItem>) => void;
  isPending?: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    contact_name: '',
    contact_email: '',
    organization_name: '',
    source: '',
    notes: '',
    program_id: '',
    owner_consultant_id: '',
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...formData, owner_consultant_id: formData.owner_consultant_id || undefined, program_id: formData.program_id || undefined }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('admin.funnel.contactName')}</Label>
          <Input value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} />
        </div>
        <div className="space-y-2">
          <Label>{t('common.email')}</Label>
          <Input type="email" value={formData.contact_email} onChange={e => setFormData({...formData, contact_email: e.target.value})} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('admin.funnel.organization')}</Label>
        <Input value={formData.organization_name} onChange={e => setFormData({...formData, organization_name: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('admin.funnel.source')}</Label>
          <Input placeholder={t('admin.funnel.sourcePlaceholder')} value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} />
        </div>
        <div className="space-y-2">
          <Label>{t('admin.funnel.assignTo')}</Label>
          <Select value={formData.owner_consultant_id} onValueChange={v => setFormData({...formData, owner_consultant_id: v})}>
            <SelectTrigger><SelectValue placeholder={t('admin.funnel.selectConsultant')} /></SelectTrigger>
            <SelectContent>
              {consultors.filter(c => c.id).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.full_name || t('common.unnamed')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('common.notes')}</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <Button type="submit" disabled={isPending} loading={isPending} className="w-full">{t('admin.funnel.createLead')}</Button>
    </form>
  );
}

function ConvertForm({ 
  item, 
  programs, 
  onSubmit 
}: { 
  item: FunnelItem;
  programs: { id: string; name: string }[];
  onSubmit: (data: { 
    programId: string; 
    stage: string; 
    incubationTypeId?: string;
    buildingId?: string;
    squareMeters?: number;
    monthlyFee?: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const [programId, setProgramId] = useState(item.program_id || '');
  const [stage, setStage] = useState('ideation');
  const [incubationTypeId, setIncubationTypeId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [squareMeters, setSquareMeters] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  
  // Fetch incubation types and buildings
  const { data: incubationTypes } = useIncubationTypes();
  const { data: buildings } = useBuildings();
  
  const selectedIncubationType = incubationTypes?.find(t => t.id === incubationTypeId);
  const requiresSpace = selectedIncubationType?.requires_space;
  const pricePerSqm = selectedIncubationType?.price_per_sqm;
  
  // Calculate monthly fee when sqm or type changes
  const calculatedFee = pricePerSqm && squareMeters 
    ? (parseFloat(squareMeters) * pricePerSqm).toFixed(2)
    : selectedIncubationType?.base_monthly_fee?.toString() || '';

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('admin.funnel.convertTo')} <strong>{item.organization_name || item.contact_name}</strong>
      </p>
      
      <div className="space-y-2">
        <Label>{t('admin.funnel.program')}</Label>
        <Select value={programId} onValueChange={setProgramId}>
          <SelectTrigger><SelectValue placeholder={t('admin.funnel.selectProgram')} /></SelectTrigger>
          <SelectContent>
            {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>{t('admin.funnel.startingStage')}</Label>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ideation">{t('stages.ideation', 'Ideação')}</SelectItem>
            <SelectItem value="validation">{t('stages.validation', 'Validação')}</SelectItem>
            <SelectItem value="mvp">MVP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="border-t pt-4 mt-4">
        <Label className="text-base font-medium">{t('admin.funnel.contractDetails')}</Label>
      </div>
      
      <div className="space-y-2">
        <Label>{t('admin.backoffice.incubationType')}</Label>
        <Select value={incubationTypeId} onValueChange={setIncubationTypeId}>
          <SelectTrigger><SelectValue placeholder={t('admin.backoffice.selectIncubationType')} /></SelectTrigger>
          <SelectContent>
            {incubationTypes?.filter(t => t.is_active).map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} - €{t.base_monthly_fee}/mo
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>{t('admin.backoffice.building')}</Label>
        <Select value={buildingId} onValueChange={setBuildingId}>
          <SelectTrigger><SelectValue placeholder={t('admin.backoffice.selectBuilding')} /></SelectTrigger>
          <SelectContent>
            {buildings?.filter(b => b.is_active).map(b => (
              <SelectItem key={b.id} value={b.id}>
                {b.name} ({b.city})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {requiresSpace && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('admin.backoffice.squareMeters')}</Label>
            <Input 
              type="number" 
              step="0.01"
              value={squareMeters}
              onChange={(e) => setSquareMeters(e.target.value)}
              placeholder="m²"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('admin.backoffice.monthlyFee')}</Label>
            <Input 
              type="number" 
              step="0.01"
              value={monthlyFee || calculatedFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
              placeholder="€"
            />
          </div>
        </div>
      )}
      
      <Button 
        onClick={() => onSubmit({ 
          programId, 
          stage, 
          incubationTypeId: incubationTypeId || undefined,
          buildingId: buildingId || undefined,
          squareMeters: squareMeters ? parseFloat(squareMeters) : undefined,
          monthlyFee: monthlyFee ? parseFloat(monthlyFee) : (calculatedFee ? parseFloat(calculatedFee) : undefined),
        })} 
        disabled={!programId} 
        className="w-full"
      >
        <Rocket className="h-4 w-4 mr-2" />{t('admin.funnel.createStartupWorkspace')}
      </Button>
    </div>
  );
}

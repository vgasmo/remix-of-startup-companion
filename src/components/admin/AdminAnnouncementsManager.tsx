import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Mail, Package, AlertTriangle, Bell, Trash2, CheckCircle, Users, Send, MapPin, MessageSquare } from 'lucide-react';
import { notify } from "@/lib/notify";
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useBuildings } from '@/hooks/useBackoffice';
import { logger } from '@/lib/logger';

type AnnouncementCategory = 'mail' | 'package' | 'general' | 'urgent';

interface FormState {
  workspace_ids: string[];
  building_id: string | null;
  category: AnnouncementCategory;
  title: string;
  message: string;
  sendToAll: boolean;
  sendEmail: boolean;
  sendTeams: boolean;
}

const EMPTY_FORM: FormState = {
  workspace_ids: [],
  building_id: null,
  category: 'general',
  title: '',
  message: '',
  sendToAll: false,
  sendEmail: true,
  sendTeams: false,
};

const CATEGORY_CONFIG: Record<AnnouncementCategory, { icon: typeof Mail; labelKey: string; color: string }> = {
  mail: { icon: Mail, labelKey: 'admin.announcements.categoryMail', color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ' },
  package: { icon: Package, labelKey: 'admin.announcements.categoryPackage', color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ' },
  general: { icon: Bell, labelKey: 'admin.announcements.categoryGeneral', color: 'bg-muted text-foreground ' },
  urgent: { icon: AlertTriangle, labelKey: 'admin.announcements.categoryUrgent', color: 'bg-destructive/10 text-destructive ' },
};

export function AdminAnnouncementsManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [buildingFilter, setBuildingFilter] = useState<string>('all');

  const { data: buildings } = useBuildings();

  const { data: workspaces } = useQuery({
    queryKey: ['admin-workspaces-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, startup:startups(id, name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['admin-announcements', buildingFilter],
    queryFn: async () => {
      let query = supabase
        .from('admin_announcements')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          building:buildings(id, name, code)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (buildingFilter !== 'all') {
        query = query.eq('building_id', buildingFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const targetIds = data.sendToAll 
        ? workspaces?.map(ws => ws.id) || []
        : data.workspace_ids;
      
      if (targetIds.length === 0) throw new Error('No workspaces selected');
      
      const inserts = targetIds.map(workspace_id => ({
        workspace_id,
        building_id: data.building_id || null,
        category: data.category,
        title: data.title,
        message: data.message || null,
        created_by: user?.id,
        send_email: data.sendEmail,
        send_teams: data.sendTeams,
      }));
      
      // Insert announcements
      const { data: insertedAnnouncements, error } = await supabase
        .from('admin_announcements')
        .insert(inserts)
        .select('id');
      
      if (error) throw error;

      // Send emails if option is enabled
      if (data.sendEmail && insertedAnnouncements && insertedAnnouncements.length > 0) {
        const announcementIds = insertedAnnouncements.map(a => a.id);
        
        const { error: emailError } = await supabase.functions.invoke('send-announcement-email', {
          body: { announcement_ids: announcementIds },
        });

        if (emailError) {
          logger.error('Email send error', {}, emailError);
          // Don't throw - announcement was created, just email failed
          notify.warn(t('admin.announcements.emailFailed'));
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      notify.success(formData.sendEmail 
        ? t('admin.announcements.sentWithEmail') 
        : t('admin.announcements.sent')
      );
      setFormData(EMPTY_FORM);
      setIsDialogOpen(false);
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      notify.success(t('admin.announcements.deleted'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sendToAll && formData.workspace_ids.length === 0) {
      notify.error(t('admin.announcements.requiredFields'));
      return;
    }
    if (!formData.title) {
      notify.error(t('admin.announcements.requiredFields'));
      return;
    }
    createMutation.mutate(formData);
  };

  const toggleWorkspace = (workspaceId: string) => {
    setFormData(prev => ({
      ...prev,
      workspace_ids: prev.workspace_ids.includes(workspaceId)
        ? prev.workspace_ids.filter(id => id !== workspaceId)
        : [...prev.workspace_ids, workspaceId]
    }));
  };

  const unreadCount = announcements?.filter(a => !a.is_read).length || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('admin.announcements.title')}
          </CardTitle>
          <CardDescription>
            {t('admin.announcements.description')}
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('admin.announcements.new')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('admin.announcements.newTitle')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendToAll"
                    checked={formData.sendToAll}
                    onCheckedChange={(checked) => setFormData({ ...formData, sendToAll: !!checked, workspace_ids: [] })}
                  />
                  <Label htmlFor="sendToAll" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    {t('admin.announcements.sendToAll')}
                  </Label>
                </div>
                
                {!formData.sendToAll && (
                  <div>
                    <Label>{t('admin.announcements.startup')} *</Label>
                    <ScrollArea className="h-48 border rounded-md p-2 mt-1">
                      {workspaces?.map((ws) => {
                        const startupName = (ws.startup as { name: string } | null)?.name || 'Unknown';
                        return (
                          <div key={ws.id} className="flex items-center space-x-2 py-1.5">
                            <Checkbox
                              id={ws.id}
                              checked={formData.workspace_ids.includes(ws.id)}
                              onCheckedChange={() => toggleWorkspace(ws.id)}
                            />
                            <Label htmlFor={ws.id} className="cursor-pointer flex-1">
                              {startupName}
                            </Label>
                          </div>
                        );
                      })}
                    </ScrollArea>
                    {formData.workspace_ids.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {formData.workspace_ids.length} {t('admin.announcements.selected')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label>{t('admin.announcements.building')}</Label>
                <Select value={formData.building_id || 'all'} onValueChange={(v) => setFormData({ ...formData, building_id: v === 'all' ? null : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.announcements.allBuildings')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('admin.announcements.allBuildings')}</SelectItem>
                    {buildings?.filter(b => b.is_active).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('admin.announcements.category')} *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as AnnouncementCategory })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {t(config.labelKey)}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('admin.announcements.titleLabel')} *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('admin.announcements.titlePlaceholder')}
                  maxLength={200}
                />
              </div>

              <div>
                <Label>{t('admin.announcements.message')}</Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder={t('admin.announcements.messagePlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2 p-3 bg-muted/50 rounded-md">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendEmail"
                    checked={formData.sendEmail}
                    onCheckedChange={(checked) => setFormData({ ...formData, sendEmail: !!checked })}
                  />
                  <Label htmlFor="sendEmail" className="flex items-center gap-2 cursor-pointer text-sm">
                    <Send className="h-4 w-4" />
                    {t('admin.announcements.sendEmailNotification')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendTeams"
                    checked={formData.sendTeams}
                    onCheckedChange={(checked) => setFormData({ ...formData, sendTeams: !!checked })}
                  />
                  <Label htmlFor="sendTeams" className="flex items-center gap-2 cursor-pointer text-sm">
                    <MessageSquare className="h-4 w-4" />
                    {t('admin.announcements.sendTeamsNotification')}
                  </Label>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.sending') : t('admin.announcements.send')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Building filter */}
        <div className="mb-4">
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('admin.announcements.allBuildings')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.announcements.allBuildings')}</SelectItem>
              {buildings?.filter(b => b.is_active).map(b => (
                <SelectItem key={b.id} value={b.id}>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    {b.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : announcements?.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t('admin.announcements.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.announcements.categoryHeader')}</TableHead>
                <TableHead>{t('admin.announcements.startup')}</TableHead>
                <TableHead>{t('admin.announcements.titleLabel')}</TableHead>
                <TableHead>{t('admin.announcements.date')}</TableHead>
                <TableHead>{t('admin.announcements.status')}</TableHead>
                <TableHead className="w-16">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements?.map((ann) => {
                const config = CATEGORY_CONFIG[ann.category as AnnouncementCategory];
                const Icon = config?.icon || Bell;
                return (
                  <TableRow key={ann.id}>
                    <TableCell>
                      <Badge className={config?.color || ''}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config ? t(config.labelKey) : ann.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {((ann.workspace as any)?.startup as { name: string } | null)?.name || '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{ann.title}</p>
                        {ann.message && (
                          <p className="text-sm text-muted-foreground truncate max-w-xs">{ann.message}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(ann.created_at), 'dd MMM yyyy HH:mm', { locale: pt })}
                    </TableCell>
                    <TableCell>
                      {ann.is_read ? (
                        <Badge variant="outline" className="text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('admin.announcements.read')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t('admin.announcements.unread')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(ann.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

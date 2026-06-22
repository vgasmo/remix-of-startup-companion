import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { notify } from "@/lib/notify";
import { Link2, Copy, Plus, Trash2, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface BookingLink {
  id: string;
  token_hash: string;
  owner_consultant_id: string | null;
  owner_email: string | null;
  program_id: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export function BookingLinksManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const { confirm, dialogProps } = useConfirmDialog();

  // Fetch programs
  const { data: programs } = useQuery({
    queryKey: ['programs-list'],
    queryFn: async () => {
      const { data } = await supabase.from('programs').select('id, name').order('name');
      return data || [];
    },
  });

  // Fetch existing booking links
  const { data: bookingLinks, isLoading } = useQuery({
    queryKey: ['public-booking-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_booking_links')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BookingLink[];
    },
  });

  // Generate new booking link
  const generateLink = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Use the shared booking-token helpers so token format & hashing stay
      // identical across BookingLinksManager, IntakeRoutingManager, and any
      // future surface that creates public booking links. The DB stores only
      // the SHA-256 hash; the plaintext is returned once and embedded in the
      // copied share URL.
      const { generateBookingToken, sha256Hex } = await import('@/lib/bookingTokens');
      const token = generateBookingToken();
      const tokenHash = await sha256Hex(token);

      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .maybeSingle();

      const expiresAt = expiresInDays 
        ? new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from('public_booking_links')
        .insert({
          token_hash: tokenHash,
          owner_consultant_id: user.id,
          owner_email: profile?.email,
          program_id: selectedProgram || null,
          expires_at: expiresAt,
          created_by: user.id,
        });

      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ['public-booking-links'] });
      const baseUrl = window.location.origin;
      const bookingUrl = `${baseUrl}/book/${token}`;
      navigator.clipboard.writeText(bookingUrl);
      
      notify.success(
        t('admin.bookingLinkCreatedCopied', 'Link de reserva criado e copiado!'),
        { description: bookingUrl }
      );
      
      setIsDialogOpen(false);
      setSelectedProgram('');
    },
    onError: (error: Error) => {
      notify.error(t('admin.failedToCreateLink', { message: error.message }));
    },
  });

  // Deactivate link
  const deactivateLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('public_booking_links')
        .update({ active: false })
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-booking-links'] });
      notify.success(t('admin.bookingLinkDeactivated'));
    },
    onError: (error: Error) => {
      notify.error(t('admin.failedToDeactivate', { message: error.message }));
    },
  });

  // Delete link permanently
  const deleteLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('public_booking_links')
        .delete()
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-booking-links'] });
      notify.success(t('admin.bookingLinkDeleted', 'Link apagado'));
    },
    onError: (error: Error) => {
      notify.error(t('admin.failedToDelete', { message: error.message }));
    },
  });

  const getProgramName = (programId: string | null) => {
    if (!programId) return t('admin.generalIncubation', 'Incubação Geral');
    return programs?.find(p => p.id === programId)?.name || t('common.unknown', 'Desconhecido');
  };

  return (
    <>
    <ConfirmDialog {...dialogProps} />
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {t('admin.bookingLinks.title', 'Links por Programa / Incubação Geral')}
            </CardTitle>
            <CardDescription>
              {t('admin.bookingLinks.description', 'Gerar links de marcação por programa específico ou para incubação geral')}
            </CardDescription>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {t('admin.bookingLinks.generate', 'Gerar Link')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.bookingLinks.generateNew', 'Gerar Novo Link de Marcação')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{t('admin.bookingLinks.program', 'Programa')}</Label>
                  <Select value={selectedProgram || '__any__'} onValueChange={(v) => setSelectedProgram(v === '__any__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.generalIncubation', 'Incubação Geral')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">{t('admin.generalIncubation', 'Incubação Geral')}</SelectItem>
                      {programs?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>{t('admin.bookingLinks.expires', 'Expira em')}</Label>
                  <Select value={expiresInDays || '__never__'} onValueChange={(v) => setExpiresInDays(v === '__never__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">{t('admin.days', { count: 7, defaultValue: '7 dias' })}</SelectItem>
                      <SelectItem value="30">{t('admin.days', { count: 30, defaultValue: '30 dias' })}</SelectItem>
                      <SelectItem value="90">{t('admin.days', { count: 90, defaultValue: '90 dias' })}</SelectItem>
                      <SelectItem value="__never__">{t('common.never', 'Nunca')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={() => generateLink.mutate()} 
                  disabled={generateLink.isPending}
                  className="w-full"
                >
                  {generateLink.isPending ? t('admin.generating', 'A gerar...') : t('admin.generateAndCopy', 'Gerar e Copiar Link')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 p-3 border rounded-lg animate-pulse">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
                <div className="h-6 w-14 bg-muted rounded-full ml-auto" />
              </div>
            ))}
          </div>
        ) : !bookingLinks?.length ? (
          <p className="text-muted-foreground text-sm">
            {t('admin.bookingLinks.empty', 'No booking links created yet')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.program', 'Programa')}</TableHead>
                <TableHead>{t('common.created', 'Criado')}</TableHead>
                <TableHead>{t('common.expires', 'Expira')}</TableHead>
                <TableHead>{t('common.status', 'Estado')}</TableHead>
                <TableHead className="w-[100px]">{t('common.actions', 'Ações')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookingLinks.map(link => (
                <TableRow key={link.id}>
                  <TableCell>{getProgramName(link.program_id)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {format(new Date(link.created_at), 'MMM d, yyyy')}
                    </div>
                  </TableCell>
                  <TableCell>
                    {link.expires_at 
                      ? format(new Date(link.expires_at), 'MMM d, yyyy')
                      : t('common.never', 'Nunca')}
                  </TableCell>
                  <TableCell>
                    {link.active ? (
                      link.expires_at && new Date(link.expires_at) < new Date() ? (
                        <Badge variant="outline" className="text-[hsl(var(--warning))]">{t('common.expired', 'Expirado')}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[hsl(var(--success))]">{t('common.active', 'Ativo')}</Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">{t('common.inactive', 'Inativo')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {link.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={()= aria-label="Delete"> deactivateLink.mutate(link.id)}
                          title={t('admin.deactivate', 'Desativar')}
                         aria-label={t('common.delete')}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      {!link.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={()= aria-label="Delete"> confirm({
                            title: t('common.delete', 'Apagar'),
                            description: t('admin.confirmDeleteLink', 'Tem a certeza que quer apagar este link?'),
                            variant: 'destructive',
                            onConfirm: () => deleteLink.mutate(link.id),
                          })}
                          title={t('common.delete', 'Apagar')}
                         aria-label={t('common.delete')}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
    </>
  );
}

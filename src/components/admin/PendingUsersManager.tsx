import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Check, X, Clock, User, Mail, Calendar } from 'lucide-react';
import { notify } from "@/lib/notify";
import { formatDistanceToNow } from 'date-fns';

interface PendingUser {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_status: string;
  created_at: string;
  roles: { role: string }[];
}

export function PendingUsersManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);

  const { data: pendingUsers, isLoading } = useQuery({
    queryKey: ['pending-users'],
    queryFn: async (): Promise<PendingUser[]> => {
      // Use raw SQL to query the account_status column since types may not be updated yet
      const { data, error } = await supabase
        .rpc('get_pending_users' as any)
        .select();

      if (error) {
        // Fallback: query profiles directly
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles_safe')
          .select(`
            id,
            full_name,
            email,
            avatar_url,
            created_at
          `)
          .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;
        
        // Get roles for each profile
        const userIds = profiles?.map(p => p.id) || [];
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        const rolesMap = new Map<string, { role: string }[]>();
        rolesData?.forEach(r => {
          if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
          rolesMap.get(r.user_id)!.push({ role: r.role });
        });

        return (profiles || []).map(p => ({
          ...p,
          account_status: 'pending', // Default since we can't filter properly
          roles: rolesMap.get(p.id) || [],
        })) as unknown as PendingUser[];
      }

      return (data || []) as unknown as PendingUser[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Use raw update for the new column
      const { error } = await supabase.rpc('approve_user_account' as any, { p_user_id: userId });
      if (error) {
        // Fallback: direct update
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ account_status: 'approved' } as any)
          .eq('id', userId);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      notify.success(t('admin.userApproved', 'User approved successfully'));
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'suspended' } as any)
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      notify.success(t('admin.userSuspended', 'User suspended'));
      setRejectUserId(null);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('admin.pendingUsers', 'Pending User Approvals')}
          </CardTitle>
          <CardDescription>
            {pendingUsers?.length 
              ? t('admin.usersAwaitingApproval', '{{count}} user awaiting approval', { count: pendingUsers.length })
              : t('admin.noPendingUsers', 'No users awaiting approval')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingUsers?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('admin.allUsersReviewed', 'All user accounts have been reviewed.')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingUsers.map((user) => {
                const initials = user.full_name
                  ?.split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'U';
                const rolesList = user.roles.map(r => r.role);

                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {user.full_name || 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {rolesList.map(role => (
                            <Badge key={role} variant="secondary" className="text-xs">
                              {t(`roles.${role}`, role)}
                            </Badge>
                          ))}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectUserId(user.id)}
                        disabled={suspendMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t('common.reject', 'Reject')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(user.id)}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        {t('admin.approve')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!rejectUserId} onOpenChange={() => setRejectUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.suspendUser', 'Suspend User')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.suspendUserConfirm', 'Are you sure you want to suspend this user? They will not be able to access the platform.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectUserId && suspendMutation.mutate(rejectUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('admin.suspend', 'Suspend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

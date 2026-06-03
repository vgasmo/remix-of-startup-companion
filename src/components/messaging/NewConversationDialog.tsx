import React, { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateConversation, Conversation } from '@/hooks/useMessaging';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Users } from 'lucide-react';
import { notify } from "@/lib/notify";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversation: Conversation) => void;
}

interface UserOption {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export function NewConversationDialog({ open, onOpenChange, onConversationCreated }: NewConversationDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const createConversation = useCreateConversation();

  // Fetch all users the current user can message (workspace members, etc.)
  const { data: users, isLoading } = useQuery({
    queryKey: ['messageable-users'],
    queryFn: async (): Promise<UserOption[]> => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return [];

      // Get all profiles except current user
      const { data, error } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .neq('id', currentUser.id)
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const filteredUsers = users?.filter(u => 
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) return;

    try {
      const conversation = await createConversation.mutateAsync({
        participantIds: selectedUsers,
      });

      // Reset and close
      setSelectedUsers([]);
      setSearch('');
      onOpenChange(false);
      onConversationCreated(conversation as Conversation);
    } catch (e: any) {
      notify.error(t('messaging.conversationFailed', 'Não foi possível iniciar conversa'), {
        description: e?.message ?? t('common.tryAgain', 'Tente novamente.'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('messaging.newConversation', 'Nova Conversa')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('messaging.searchUsers', 'Pesquisar utilizadores...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-64 border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 px-4">
                <p className="text-sm font-medium text-foreground mb-0.5">{t('messaging.noUsersFound', 'Nenhum utilizador encontrado')}</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  {t('messaging.adjustSearch', 'Tente ajustar a pesquisa ou verifique se o utilizador já está registado.')}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredUsers.map(user => (
                  <div
                    key={user.id}
                    {...clickableProps(() => toggleUser(user.id))}
                    className="w-full p-2 rounded-lg hover:bg-muted/50 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <Checkbox 
                      checked={selectedUsers.includes(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>{user.full_name?.[0] || user.email[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.full_name || t('common.unnamed', 'Sem nome')}</p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedUsers.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('messaging.usersSelected', { count: selectedUsers.length, defaultValue: '{{count}} utilizador(es) selecionado(s)' })}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={selectedUsers.length === 0 || createConversation.isPending}
            >
              {t('messaging.startConversation', 'Iniciar Conversa')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

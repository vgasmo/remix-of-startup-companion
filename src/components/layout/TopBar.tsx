import { LogOut, Shield, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { Search } from 'lucide-react';
import { AskAiMenu } from './AskAiMenu';

export function TopBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, roles, isAdmin, signOut } = useAuth();

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const displayRole = isAdmin 
    ? t('roles.admin')
    : roles.includes('consultor') 
      ? t('roles.consultor')
      : roles.includes('mentor_externo') 
        ? t('roles.mentor_externo')
        : roles.includes('founder') 
          ? t('roles.founder')
          : t('roles.team_member');

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {/* Command Palette trigger – full on desktop, icon-only on mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden h-9 w-9 text-muted-foreground"
        onClick={()= aria-label="Search"> document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
        aria-label={t('common.search', { defaultValue: 'Search' })}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex items-center gap-2 text-muted-foreground h-8 px-3 w-[220px] justify-start font-normal bg-muted/40 border-border/70 hover:bg-muted/60"
        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">{t('common.search', { defaultValue: 'Search' })}…</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/60 bg-background/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      
      {/* Ask AI dropdown – context-aware suggested questions */}
      <AskAiMenu />

      {/* Notifications Bell */}
      <NotificationCenter />

      {/* Language Selector - hidden on mobile */}
      <div className="hidden md:block">
        <LanguageSelector />
      </div>
      
      {/* Theme Toggle */}
      <ThemeToggle className="text-muted-foreground" />

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2.5 h-auto py-1 px-1.5 hover:bg-muted/60 rounded-md transition-colors">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium leading-none">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {displayRole}
              </p>
            </div>
            <Avatar className="h-8 w-8 ring-1 ring-border/70 transition-all hover:ring-primary/40">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || 'User avatar'} />
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 animate-scale-in">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t('topBar.roles')}
          </DropdownMenuLabel>
          <div className="px-2 py-1.5 flex flex-wrap gap-1">
            {roles.length > 0 ? (
              roles.map((role) => (
                <Badge key={role} variant="secondary" className="text-xs capitalize">
                  {role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                  {t(`roles.${role}`, role.replace('_', ' '))}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">{t('topBar.noRoles')}</span>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
            <Settings className="h-4 w-4 mr-2" />
            {t('topBar.accountSettings')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
            <LogOut className="h-4 w-4 mr-2" />
            {t('auth.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
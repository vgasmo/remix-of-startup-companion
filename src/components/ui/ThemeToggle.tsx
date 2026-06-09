import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("relative overflow-hidden", className)}
         aria-label={t('common._iconToggleTheme')}>
          <Sun className={cn(
            "h-4 w-4 transition-all duration-300",
            resolvedTheme === 'dark' ? "rotate-90 scale-0" : "rotate-0 scale-100"
          )} />
          <Moon className={cn(
            "absolute h-4 w-4 transition-all duration-300",
            resolvedTheme === 'dark' ? "rotate-0 scale-100" : "-rotate-90 scale-0"
          )} />
          <span className="sr-only">{t('ui.theme.toggle')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
          onClick={() => setTheme('light')}
          className={cn(theme === 'light' && "bg-accent")}
        >
          <Sun className="mr-2 h-4 w-4" />
          {t('ui.theme.light')}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('dark')}
          className={cn(theme === 'dark' && "bg-accent")}
        >
          <Moon className="mr-2 h-4 w-4" />
          {t('ui.theme.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('system')}
          className={cn(theme === 'system' && "bg-accent")}
        >
          <Monitor className="mr-2 h-4 w-4" />
          {t('ui.theme.system')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
import { useState, useEffect } from 'react';
import { Keyboard, Command, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['g', 'h'], description: 'shortcuts.goHome', category: 'shortcuts.navigation' },
  { keys: ['g', 's'], description: 'shortcuts.goSettings', category: 'shortcuts.navigation' },
  { keys: ['g', 'm'], description: 'shortcuts.goMentors', category: 'shortcuts.navigation' },
  { keys: ['g', 'a'], description: 'shortcuts.goAdmin', category: 'shortcuts.navigation' },
  { keys: ['Esc'], description: 'shortcuts.closeModal', category: 'shortcuts.navigation' },
  { keys: ['←', '→'], description: 'shortcuts.navigateTabs', category: 'shortcuts.navigation' },
  
  // Search & Create
  { keys: ['⌘', 'K'], description: 'shortcuts.globalSearch', category: 'shortcuts.searchCreate' },
  { keys: ['/'], description: 'shortcuts.focusSearch', category: 'shortcuts.searchCreate' },
  { keys: ['n'], description: 'shortcuts.createNew', category: 'shortcuts.searchCreate' },
  { keys: ['⌘', 'Enter'], description: 'shortcuts.saveForm', category: 'shortcuts.searchCreate' },
  
  // View & Display
  { keys: ['v', 'c'], description: 'shortcuts.cardView', category: 'shortcuts.view' },
  { keys: ['v', 't'], description: 'shortcuts.tableView', category: 'shortcuts.view' },
  { keys: ['t'], description: 'shortcuts.toggleTheme', category: 'shortcuts.view' },
  { keys: ['?'], description: 'shortcuts.showShortcuts', category: 'shortcuts.view' },
  
  // Actions
  { keys: ['⌘', 'S'], description: 'shortcuts.quickSave', category: 'shortcuts.actions' },
  { keys: ['⌘', 'Z'], description: 'shortcuts.undo', category: 'shortcuts.actions' },
  { keys: ['⌘', '⇧', 'Z'], description: 'shortcuts.redo', category: 'shortcuts.actions' },
];

/**
 * P2: Enhanced keyboard shortcuts dialog with categories, better visuals, and i18n.
 */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const categories = [...new Set(shortcuts.map(s => s.category))];

  const renderKey = (key: string) => {
    const iconMap: Record<string, JSX.Element> = {
      '⌘': <Command className="h-3 w-3" />,
      '↑': <ArrowUp className="h-3 w-3" />,
      '↓': <ArrowDown className="h-3 w-3" />,
      '←': <ArrowLeft className="h-3 w-3" />,
      '→': <ArrowRight className="h-3 w-3" />,
    };
    
    return iconMap[key] || <span>{key}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
          <Keyboard className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">{t('shortcuts.title', 'Shortcuts')}</span>
          <kbd className="hidden md:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ?
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            {t('shortcuts.title', 'Keyboard Shortcuts')}
          </DialogTitle>
          <DialogDescription>
            {t('shortcuts.description', 'Navigate faster with keyboard shortcuts')}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 py-2 pr-4">
            {categories.map(category => (
              <div key={category}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t(category, category.replace('shortcuts.', ''))}
                </h4>
                <div className="space-y-1 rounded-lg bg-muted/30 p-2">
                  {shortcuts
                    .filter(s => s.category === category)
                    .map((shortcut, i) => (
                      <div 
                        key={i} 
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm">{t(shortcut.description, shortcut.description.replace('shortcuts.', ''))}</span>
                        <div className="flex items-center gap-0.5">
                          {shortcut.keys.map((key, j) => (
                            <span key={j} className="flex items-center">
                              {j > 0 && key.length === 1 && shortcuts.find(s => s.keys === shortcut.keys)?.keys[0].length === 1 && (
                                <span className="text-[10px] text-muted-foreground mx-0.5">then</span>
                              )}
                              <kbd className={cn(
                                "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-mono rounded",
                                "bg-background border shadow-sm",
                                key === '⌘' && "bg-primary/10 border-primary/30"
                              )}>
                                {renderKey(key)}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="shrink-0 flex items-center justify-center gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">{t('shortcuts.pressAnytime', 'Press')}</span>
          <kbd className="px-1.5 py-0.5 text-xs font-mono rounded bg-muted border">?</kbd>
          <span className="text-xs text-muted-foreground">{t('shortcuts.toShow', 'to show')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

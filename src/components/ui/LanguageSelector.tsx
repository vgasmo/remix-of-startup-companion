import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { changeLanguage as switchLanguage } from '@/i18n';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

interface LanguageSelectorProps {
  className?: string;
  variant?: 'icon' | 'full';
}

export function LanguageSelector({ className, variant = 'icon' }: LanguageSelectorProps) {
  const { i18n } = useTranslation();

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

  const changeLanguage = (code: string) => {
    void switchLanguage(code);
    localStorage.setItem('language', code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size={variant === 'icon' ? 'icon' : 'sm'}
          className={cn("text-muted-foreground hover:text-foreground", className)}
        >
          {variant === 'icon' ? (
            <Globe className="h-4 w-4" />
          ) : (
            <>
              <span className="mr-2">{currentLang.flag}</span>
              {currentLang.name}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={cn(
              "cursor-pointer",
              i18n.language === lang.code && "bg-accent"
            )}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

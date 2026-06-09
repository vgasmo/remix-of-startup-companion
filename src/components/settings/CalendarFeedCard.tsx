import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { AppConfig } from '@/lib/appConfig';
import { 
  Calendar,
  Copy, 
  Check, 
  ChevronDown,
  Download,
  RefreshCw,
  Rss,
  Key
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface CalendarFeedCardProps {
  workspaceId?: string;
}

export function CalendarFeedCard({ workspaceId }: CalendarFeedCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);
  const [needsRegeneration, setNeedsRegeneration] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch existing calendar token info
  useEffect(() => {
    const fetchToken = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('calendar_feed_token, calendar_token_expires_at')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!error && data?.calendar_feed_token) {
        // Token exists but is hashed - user needs to regenerate to get a usable URL
        // Check if we have the original token in sessionStorage (for same-session use)
        const cachedToken = sessionStorage.getItem(`calendar_token_${user.id}`);
        
        if (cachedToken) {
          setCalendarToken(cachedToken);
        } else {
          // Token is hashed, user needs to regenerate
          setNeedsRegeneration(true);
        }
        
        if (data.calendar_token_expires_at) {
          const expiresAt = new Date(data.calendar_token_expires_at);
          setTokenExpiresAt(expiresAt);
          if (expiresAt < new Date()) {
            setNeedsRegeneration(true);
          }
        }
      }
      setIsLoading(false);
    };
    
    fetchToken();
  }, [user?.id]);

  // Generate the calendar feed URL using secure token
  const feedUrl = calendarToken 
    ? `${AppConfig.supabaseUrl}/functions/v1/calendar-feed?token=${calendarToken}`
    : workspaceId 
      ? AppConfig.workspaceCalendarUrl(workspaceId)
      : '';

  const generateToken = async () => {
    if (!user?.id) return;
    
    setIsGenerating(true);
    try {
      // Generate a cryptographically secure 256-bit token (64 hex chars)
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Hash the token before storing (SHA-256)
      const tokenHashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token)
      );
      const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Set expiration to 90 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          calendar_feed_token: tokenHash,
          calendar_token_expires_at: expiresAt.toISOString()
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      // Store the original token in sessionStorage for same-session URL generation
      sessionStorage.setItem(`calendar_token_${user.id}`, token);
      
      // Store the original token in state (not the hash) for URL generation
      setCalendarToken(token);
      setTokenExpiresAt(expiresAt);
      setNeedsRegeneration(false);
      notify.success(t('calendarFeed.tokenGenerated', { defaultValue: 'Token de calendário gerado com sucesso (válido por 90 dias)' }));
    } catch (err) {
      logger.error('Error generating token', {}, err);
      notify.error(t('calendarFeed.generateFailed', { defaultValue: 'Falha ao gerar token de calendário' }));
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateToken = async () => {
    if (!user?.id) return;
    if (!confirm(t('calendarFeed.regenerateConfirm', { defaultValue: 'Regenerar o token irá invalidar as subscrições atuais. Continuar?' }))) {
      return;
    }
    await generateToken();
  };

  const copyToClipboard = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notify.success(t('calendarFeed.urlCopied', { defaultValue: 'URL do calendário copiado' }));
    } catch (err) {
      notify.error(t('calendarFeed.copyFailed', { defaultValue: 'Falha ao copiar URL' }));
    }
  };

  const handleDownloadICS = () => {
    if (!feedUrl) return;
    window.open(feedUrl, '_blank');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('calendarFeed.title', { defaultValue: 'Feed de Calendário' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('calendarFeed.title', { defaultValue: 'Feed de Calendário' })}
          <Badge variant="secondary" className="gap-1">
            <Rss className="h-3 w-3" />
            ICS
          </Badge>
        </CardTitle>
        <CardDescription>
          {t('calendarFeed.description', { defaultValue: 'Subscreva o seu calendário de sessões no Outlook, Google Calendar ou Apple Calendar' })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token Regeneration Needed Alert */}
        {needsRegeneration && user && (
          <Alert variant="destructive">
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>{t('calendarFeed.regenerationRequired', { defaultValue: 'Regeneração necessária' })}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                {tokenExpiresAt && tokenExpiresAt < new Date() 
                  ? t('calendarFeed.tokenExpired', { defaultValue: 'O seu token expirou. Gere um novo para continuar a sincronizar.' })
                  : t('calendarFeed.tokenNeedsRegeneration', { defaultValue: 'Por razões de segurança, o token precisa de ser regenerado. As subscrições de calendário terão de ser atualizadas com o novo URL.' })}
              </p>
              <Button
                size="sm"
                onClick={generateToken}
                disabled={isGenerating}
                className="mt-2"
              >
                {isGenerating ? t('common.generating', { defaultValue: 'A gerar...' }) : t('calendarFeed.regenerateToken', { defaultValue: 'Regenerar Token' })}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Generate Token Section */}
        {!calendarToken && !needsRegeneration && user && (
          <Alert>
            <Key className="h-4 w-4" />
            <AlertTitle>{t('calendarFeed.secureAccess', { defaultValue: 'Acesso Seguro ao Calendário' })}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                {t('calendarFeed.generateDesc', { defaultValue: 'Gere um token seguro para subscrever o feed de calendário. Este token permite que aplicações de calendário acedam às suas sessões sem fazer login. Válido por 90 dias.' })}
              </p>
              <Button
                size="sm"
                onClick={generateToken}
                disabled={isGenerating}
                className="mt-2"
              >
                {isGenerating ? t('common.generating', { defaultValue: 'A gerar...' }) : t('calendarFeed.generateToken', { defaultValue: 'Gerar Token de Calendário' })}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Calendar URL */}
        {calendarToken && (
          <div className="space-y-2">
            <Label>{t('calendarFeed.subscriptionUrl', { defaultValue: 'URL de subscrição do calendário' })}</Label>
            <div className="flex gap-2">
              <Input
                value={feedUrl}
                readOnly
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                disabled={!feedUrl}
                title={t('calendarFeed.copyUrl', { defaultValue: 'Copiar URL' })}
               aria-label={t('common.confirm')}>
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('calendarFeed.autoSync', { defaultValue: 'Este URL sincroniza automaticamente novas sessões com o seu calendário' })}
            </p>
          </div>
        )}

        {/* Quick Actions */}
        {calendarToken && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadICS}
              disabled={!feedUrl}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              {t('calendarFeed.downloadIcs', { defaultValue: 'Descarregar .ics' })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={regenerateToken}
              disabled={isGenerating}
              className="gap-2 text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('calendarFeed.regenerate', { defaultValue: 'Regenerar token' })}
            </Button>
          </div>
        )}

        {/* Setup Instructions */}
        {calendarToken && (
          <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto">
                <ChevronDown className={`h-3 w-3 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
                {t('calendarFeed.howToSubscribe', { defaultValue: 'Como subscrever na sua aplicação de calendário' })}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4 text-sm">
                {/* Outlook */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span className="text-[#0078D4]">📬</span> Outlook
                  </h4>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                    <li>{t('calendarFeed.outlook1', { defaultValue: 'Abrir Outlook → Calendário' })}</li>
                    <li>{t('calendarFeed.outlook2', { defaultValue: 'Clicar "Adicionar calendário" → "Subscrever da web"' })}</li>
                    <li>{t('calendarFeed.outlook3', { defaultValue: 'Colar o URL do calendário acima' })}</li>
                    <li>{t('calendarFeed.outlook4', { defaultValue: 'Nomear "Sessões Startup Leiria" e clicar Importar' })}</li>
                  </ol>
                </div>

                {/* Google Calendar */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span className="text-[#4285F4]">📅</span> Google Calendar
                  </h4>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                    <li>{t('calendarFeed.google1', { defaultValue: 'Abrir Google Calendar → Definições' })}</li>
                    <li>{t('calendarFeed.google2', { defaultValue: 'Clicar "Adicionar calendário" → "A partir de URL"' })}</li>
                    <li>{t('calendarFeed.google3', { defaultValue: 'Colar o URL do calendário e clicar "Adicionar calendário"' })}</li>
                  </ol>
                </div>

                {/* Apple Calendar */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span>🍎</span> Apple Calendar
                  </h4>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                    <li>{t('calendarFeed.apple1', { defaultValue: 'Abrir Calendário → Ficheiro → Nova Subscrição de Calendário' })}</li>
                    <li>{t('calendarFeed.apple2', { defaultValue: 'Colar o URL do calendário' })}</li>
                    <li>{t('calendarFeed.apple3', { defaultValue: 'Configurar frequência de atualização e clicar Subscrever' })}</li>
                  </ol>
                </div>

                <Alert>
                  <RefreshCw className="h-4 w-4" />
                  <AlertTitle className="text-xs">{t('calendarFeed.autoRefreshTitle', { defaultValue: 'Atualização automática' })}</AlertTitle>
                  <AlertDescription className="text-xs">
                    {t('calendarFeed.autoRefreshDesc', { defaultValue: 'A maioria das aplicações verifica atualizações a cada 15-60 minutos. Alterações às sessões aparecem automaticamente.' })}
                  </AlertDescription>
                </Alert>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

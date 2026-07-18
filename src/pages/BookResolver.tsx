import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';
import PublicBooking from './PublicBooking';

/**
 * Public-facing `/book` route (B1 — canonical booking architecture).
 *
 * Resolves the currently active canonical link server-side via
 * `resolve_canonical_booking_token()` and renders the booking form **inline**
 * on the same `/book` URL. The routing token is kept in React state only —
 * it never appears in the browser URL, navigation history, localStorage,
 * sessionStorage, or any redirect.
 *
 * Fail-closed: if no canonical link is configured (or the RPC fails), we
 * show a clear message instead of guessing a token — never send a real
 * visitor to `/book/demo`.
 */
export default function BookResolver() {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'ready' | 'not_configured' | 'error'>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase.rpc('resolve_canonical_booking_token');
        if (cancelled) return;
        if (error) {
          setState('error');
          return;
        }
        const resolved = (data as string | null) ?? null;
        if (!resolved) {
          setState('not_configured');
          return;
        }
        setToken(resolved);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'ready' && token) {
    // Render inline — the URL stays at `/book`, the token lives only in
    // this component's memory and is passed to the child as a prop.
    return <PublicBooking tokenOverride={token} canonicalMode />;
  }

  return (
    <>
      <Helmet>
        <title>{t('publicBooking.resolver.title', 'A abrir agendamento — Startup Leiria') as string}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          {state === 'loading' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  {t('publicBooking.resolver.loadingTitle', 'A abrir agendamento…')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t('publicBooking.resolver.loadingDesc', 'Estamos a preparar o formulário de reserva.')}
              </CardContent>
            </>
          )}

          {state === 'not_configured' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" aria-hidden="true" />
                  {t('publicBooking.resolver.notConfiguredTitle', 'Agendamento indisponível')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {t(
                    'publicBooking.resolver.notConfiguredDesc',
                    'De momento não há um link público de agendamento ativo. Contacte a equipa Startup Leiria para receber um link direto.',
                  )}
                </p>
                <p>
                  <a
                    href="mailto:info@startupleiria.com"
                    className="text-primary underline underline-offset-4"
                  >
                    info@startupleiria.com
                  </a>
                </p>
              </CardContent>
            </>
          )}

          {state === 'error' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  {t('publicBooking.resolver.errorTitle', 'Não foi possível abrir o agendamento')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(
                  'publicBooking.resolver.errorDesc',
                  'Ocorreu um erro. Tente novamente em instantes ou contacte info@startupleiria.com.',
                )}
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </>
  );
}

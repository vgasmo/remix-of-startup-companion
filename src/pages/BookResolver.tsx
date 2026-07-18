import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Public-facing `/book` route. Resolves the current canonical booking link
 * (persisted in `public_booking_links.canonical_url` when an admin marks a
 * link as canonical) and hard-redirects the visitor.
 *
 * Fail-closed: if no canonical link is configured, we show a clear message
 * instead of guessing a token — never send a real visitor to `/book/demo`.
 */
export default function BookResolver() {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'not_configured' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_canonical_booking_url');
        if (cancelled) return;
        if (error) {
          setState('error');
          return;
        }
        const target = (data as string | null) ?? null;
        if (!target) {
          setState('not_configured');
          return;
        }
        // Prefer same-origin relative redirect to keep session storage / auth
        // context, but the DB stores an absolute URL so use `href` for parity.
        window.location.replace(target);
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
                {t('publicBooking.resolver.loadingDesc', 'Estamos a levar-te ao formulário de reserva.')}
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

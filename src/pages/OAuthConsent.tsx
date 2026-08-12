import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ShieldCheck } from "lucide-react";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

function oauthNamespace(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsent() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError(t("oauthConsent.missingId", { defaultValue: "Pedido de autorização inválido (falta authorization_id)." }));
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?returnTo=${encodeURIComponent(next)}`;
        return;
      }
      const { data, error: detailsError } = await oauthNamespace().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, t]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthNamespace();
    const { data, error: decideError } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError(t("oauthConsent.noRedirect", { defaultValue: "O servidor de autorização não devolveu um redirecionamento." }));
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? t("oauthConsent.genericClient", { defaultValue: "uma aplicação" });

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <CardTitle className="text-lg">
              {t("oauthConsent.title", { defaultValue: "Autorizar acesso" })}
            </CardTitle>
          </div>
          <CardDescription>
            {t("oauthConsent.subtitle", {
              defaultValue: "Confirme se quer ligar esta aplicação à sua conta Startup Leiria.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!error && !details && (
            <p className="text-sm text-muted-foreground">
              {t("oauthConsent.loading", { defaultValue: "A carregar o pedido de autorização…" })}
            </p>
          )}

          {!error && details && (
            <>
              <p className="text-sm text-foreground">
                {t("oauthConsent.body", {
                  defaultValue:
                    "{{client}} vai poder usar esta plataforma em seu nome, com as suas permissões.",
                  client: clientName,
                })}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  {t("oauthConsent.approve", { defaultValue: "Autorizar" })}
                </Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                  {t("oauthConsent.deny", { defaultValue: "Recusar" })}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

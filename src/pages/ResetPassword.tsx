import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const passwordSchema = z.string().min(6, { message: t('login.passwordMinLength') });

  useEffect(() => {
    // Handle both PKCE (?code=) and implicit (#access_token&type=recovery) recovery flows.
    // CRITICAL: We must distinguish a *real* recovery context (code/hash/event) from a
    // pre-existing logged-in session, otherwise a logged-in user clicking a malformed
    // link would change the wrong account's password.
    let recoveryConfirmed = false;

    const verifyRecovery = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const errorParam = url.searchParams.get('error') || url.searchParams.get('error_description');
        const hash = window.location.hash || '';
        const hasRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token');

        // PKCE flow: exchange the code for a session.
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          recoveryConfirmed = true;
          window.history.replaceState({}, '', '/reset-password');
          setVerifying(false);
          return;
        }

        if (errorParam) throw new Error(errorParam);

        // Implicit flow: wait for Supabase JS to parse the hash and fire PASSWORD_RECOVERY.
        if (hasRecoveryHash) {
          // The onAuthStateChange listener below will flip recoveryConfirmed and verifying.
          // Give it up to 3s; if nothing fires, treat as invalid.
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 250));
            if (recoveryConfirmed) return;
          }
          throw new Error(t('auth.invalidRecoveryLink', 'Invalid or expired recovery link'));
        }

        // No recovery context at all — do NOT trust any pre-existing session.
        // Send the user to login with a clear message.
        setError(t('auth.invalidRecoveryLink', 'Invalid or expired recovery link'));
        setVerifying(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid or expired recovery link';
        setError(msg);
        setVerifying(false);
      }
    };

    // Listen for the PASSWORD_RECOVERY event Supabase fires after parsing the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryConfirmed = true;
        setVerifying(false);
      }
    });

    verifyRecovery();
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [navigate, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }
    
    if (password !== confirmPassword) {
      setError(t('settingsPage.passwordsDoNotMatch'));
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });
      
      if (updateError) throw updateError;
      setSuccess(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/my-workspaces');
      }, 2000);
    } catch (err: any) {
      setError(err.message || t('auth.resetPasswordError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src={startupLeiriaLogo} 
            alt="Startup Leiria" 
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {t('auth.resetPassword')}
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.setNewPassword')}</CardTitle>
            <CardDescription>
              {t('auth.setNewPasswordDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verifying ? (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              </div>
            ) : success ? (
              <div className="py-6 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t('auth.passwordResetSuccess')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('auth.redirecting')}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    t('auth.updatePassword')
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

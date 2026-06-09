import { useState, forwardRef } from 'react';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ForgotPasswordDialog - Password reset modal
 * 
 * Uses forwardRef to prevent React warnings when used as a child of components
 * that may pass refs (e.g., when used inside form libraries or wrappers).
 */
export const ForgotPasswordDialog = forwardRef<HTMLDivElement, ForgotPasswordDialogProps>(
  function ForgotPasswordDialog({ open, onOpenChange }, _ref) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const emailSchema = z.string().trim().email({ message: t('login.invalidEmail') });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      
      try {
        emailSchema.parse(email);
      } catch (err) {
        if (err instanceof z.ZodError) {
          setError(err.errors[0].message);
          return;
        }
      }

      setIsSubmitting(true);
      
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        
        if (resetError) throw resetError;
        setSuccess(true);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('auth.resetPasswordError');
        setError(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleClose = () => {
      setEmail('');
      setError(null);
      setSuccess(false);
      onOpenChange(false);
    };

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.forgotPassword')}</DialogTitle>
            <DialogDescription>
              {t('auth.forgotPasswordDesc')}
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-[hsl(var(--success))]" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t('auth.resetEmailSent')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('auth.checkYourInbox')}
                </p>
              </div>
              <Button variant="outline" onClick={handleClose} className="mt-4">
                {t('common.close')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('common.back')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    t('auth.sendResetLink')
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);

// Keep default export for backwards compatibility
export default ForgotPasswordDialog;

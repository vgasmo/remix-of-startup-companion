import { useTranslation } from 'react-i18next';
import { LogOut, ShieldX, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';

export default function SuspendedAccount() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-destructive/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img 
              src={startupLeiriaLogo} 
              alt="Startup Leiria" 
              className="h-16 w-auto"
            />
          </div>
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-destructive/10">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t('approval.suspendedTitle', 'Account Suspended')}</CardTitle>
          <CardDescription className="text-base">
            {t('approval.suspendedDescription', 'Your account has been suspended. Please contact support if you believe this is an error.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Mail className="h-4 w-4" />
              <span className="font-medium">{profile?.email}</span>
            </div>
            <p>{t('approval.contactSupport', 'Contact: support@startupleiria.com')}</p>
          </div>

          <Button variant="outline" onClick={() => signOut()} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            {t('auth.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

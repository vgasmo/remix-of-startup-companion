import { Link } from 'react-router-dom';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AccessDeniedProps {
  title?: string;
  message?: string;
  backTo?: string;
  backLabel?: string;
}

export function AccessDenied({
  title,
  message,
  backTo = "/my-workspaces",
  backLabel
}: AccessDeniedProps) {
  const { t } = useTranslation();
  
  const displayTitle = title || t('accessDenied.title');
  const displayMessage = message || t('accessDenied.message');
  const displayBackLabel = backLabel || t('accessDenied.backToWorkspaces');
  
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="bg-muted/50 border-destructive/20 max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-6">
            <ShieldX className="h-12 w-12 text-destructive" />
          </div>
          <h3 className="font-heading text-xl font-semibold mb-2">{displayTitle}</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            {displayMessage}
          </p>
          <Link to={backTo}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {displayBackLabel}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

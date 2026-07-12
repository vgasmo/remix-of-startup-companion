import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import startupLeiriaLogo from "@/assets/startup-leiria.svg";
import { logger } from '@/lib/logger';

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    logger.error('404 Error: non-existent route', { path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
      <div className="text-center px-6 max-w-md">
        {/* Logo */}
        <div className="mb-8">
          <img 
            src={startupLeiriaLogo} 
            alt="Startup Leiria" 
            className="h-16 w-auto mx-auto opacity-80"
          />
        </div>
        
        {/* 404 Display */}
        <div className="relative mb-6">
          <h1 className="text-[120px] font-bold leading-none text-muted-foreground/20 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              404
            </div>
          </div>
        </div>
        
        {/* Message */}
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {t('notFound.title', 'Page not found')}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t('notFound.description', "The page you're looking for doesn't exist or has been moved.")}
        </p>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default" size="lg">
            <Link to="/" className="gap-2">
              <Home className="h-4 w-4" />
              {t('notFound.backHome', 'Go back home')}
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="gap-2" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.goBack', 'Go back')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

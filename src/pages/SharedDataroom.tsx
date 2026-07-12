import { useState, useEffect } from 'react';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { FolderLock, FileText, TrendingUp, Link2, Download, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/dateLocale';

interface DataroomItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  document?: {
    id: string;
    name: string;
    mime_type?: string;
    download_url?: string;
  };
  investor_update?: {
    id: string;
    month: string;
    content: any;
  };
}

interface DataroomData {
  id: string;
  startup_name: string;
  logo_url?: string;
  allow_download: boolean;
}

export default function SharedDataroom() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [dataroom, setDataroom] = useState<DataroomData | null>(null);
  const [items, setItems] = useState<DataroomItem[]>([]);

  useEffect(() => {
    const fetchDataroom = async () => {
      if (!token) return;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dataroom-get-by-token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          setError({ message: data.error || 'Failed to load dataroom', code: data.code });
          return;
        }

        setDataroom(data.dataroom);
        setItems(data.items || []);
      } catch (err: any) {
        setError({ message: err.message || 'Network error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDataroom();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h1 className="text-2xl font-bold mb-2">
              {error.code === 'EXPIRED' ? t('dataroom.linkExpired') : 
               error.code === 'REVOKED' ? t('dataroom.linkRevoked') : 
               t('dataroom.linkInvalid')}
            </h1>
            <p className="text-muted-foreground">
              {error.code === 'EXPIRED' ? t('dataroom.linkExpiredDesc') :
               error.code === 'REVOKED' ? t('dataroom.linkRevokedDesc') :
               t('dataroom.linkInvalidDesc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            {dataroom?.logo_url && (
              <img src={dataroom.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{dataroom?.startup_name}</h1>
              <p className="text-muted-foreground flex items-center gap-2">
                <FolderLock className="h-4 w-4" />
                Dataroom
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FolderLock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('dataroom.emptyPublic')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-3 rounded-lg bg-muted">
                      {item.type === 'document' && <FileText className="h-6 w-6 text-[hsl(var(--info))]" />}
                      {item.type === 'investor_update' && <TrendingUp className="h-6 w-6 text-[hsl(var(--success))]" />}
                      {item.type === 'link' && <Link2 className="h-6 w-6 text-primary" />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{item.title}</h3>
                      {item.description && (
                        <p className="text-muted-foreground mt-1">{item.description}</p>
                      )}
                      
                      {item.type === 'document' && item.document && (
                        <div className="mt-3">
                          <Badge variant="secondary" className="mb-2">
                            {item.document.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                          {dataroom?.allow_download && item.document.download_url && (
                            <Button asChild variant="outline" size="sm" className="ml-2">
                              <a href={sanitizeUrl(item.document.download_url)!} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4 mr-2" />
                                {t('dataroom.download')}
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {item.type === 'investor_update' && item.investor_update && (
                        <div className="mt-3">
                          <Badge variant="secondary">
                            {format(new Date(item.investor_update.month), 'MMMM yyyy', { locale: getDateLocale() })}
                          </Badge>
                          {item.investor_update.content && (
                            <div className="mt-4 prose prose-sm max-w-none dark:prose-invert">
                              {/* Render investor update content summary */}
                              {item.investor_update.content.highlights && (
                                <div>
                                  <h4 className="font-medium">{t('common.highlights', 'Highlights')}</h4>
                                  <p>{item.investor_update.content.highlights}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {item.type === 'link' && sanitizeUrl(item.url) && (
                        <div className="mt-3">
                          <Button asChild variant="outline" size="sm">
                            <a href={sanitizeUrl(item.url)!} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              {t('dataroom.openLink')}
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Footer */}
        <Separator className="my-8" />
        <p className="text-center text-sm text-muted-foreground">
          {t('dataroom.poweredBy')}
        </p>
      </main>
    </div>
  );
}

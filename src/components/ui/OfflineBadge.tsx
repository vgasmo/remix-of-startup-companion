import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Wifi } from 'lucide-react';
import { notify } from "@/lib/notify";

export function OfflineBadge() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOffline = () => {
      wasOffline.current = true;
      setIsOffline(true);
    };

    const goOnline = () => {
      setIsOffline(false);
      // Only show reconnection toast if user was previously offline
      if (wasOffline.current) {
        wasOffline.current = false;
        notify.success(t('offline.backOnline', { defaultValue: 'Back online! Syncing your data...' }), {
          icon: <Wifi className="h-4 w-4 text-green-500" />,
          duration: 3000,
        });
      }
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [t]);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-destructive px-4 py-3 text-destructive-foreground shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
      <span className="text-sm font-medium">
        {t('offline.youAreOffline', { defaultValue: 'You are offline. Cached data is still available.' })}
      </span>
    </div>
  );
}

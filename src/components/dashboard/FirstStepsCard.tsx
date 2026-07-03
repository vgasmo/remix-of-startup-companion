import { type ComponentType, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface FirstStepItem {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface FirstStepsCardProps {
  /** Unique dismissal scope, e.g. "consultor" | "backoffice" | "admin" | "mentor" */
  storageScope: string;
  title: string;
  subtitle?: string;
  items: FirstStepItem[];
  className?: string;
}

/**
 * Dismissible "primeiros passos" card shown once per user+role.
 * Persistence uses `profiles.dismissed_prompts` (jsonb array) — same mechanism
 * as OpsActionPrompts — so dismissal survives device changes and cache clears.
 * The prompt id stored is `first-steps:{scope}`.
 */
export function FirstStepsCard({ storageScope, title, subtitle, items, className }: FirstStepsCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const promptId = `first-steps:${storageScope}`;

  const { data: dismissedList } = useQuery({
    queryKey: ['profile', 'dismissed_prompts', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('dismissed_prompts')
        .eq('id', user!.id)
        .maybeSingle();
      const raw = (data?.dismissed_prompts ?? []) as unknown;
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    },
  });

  const dismissed = useMemo(() => (dismissedList ?? []).includes(promptId), [dismissedList, promptId]);

  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('not authenticated');
      const next = Array.from(new Set<string>([...(dismissedList ?? []), promptId]));
      const { error } = await supabase
        .from('profiles')
        .update({ dismissed_prompts: next })
        .eq('id', user.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['profile', 'dismissed_prompts', user?.id], next);
    },
  });

  if (!user?.id || dismissed || !items.length) return null;

  return (
    <Card className={cn('border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background', className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold font-heading">{title}</h3>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"
                onClick={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending}
                aria-label={t('common.dismiss')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 text-sm hover:border-border hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                        {i + 1}
                      </span>
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="text-muted-foreground"> — {item.description}</span>
                        )}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

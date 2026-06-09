import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { 
  FileText, 
  Plus, 
  Copy, 
  Link2, 
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Sparkles,
  CheckCircle,
  Clock,
  Edit3,
  ChevronDown,
  ChevronUp,
  BookTemplate,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvestorTemplateLibrary } from './InvestorTemplateLibrary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInvestorUpdates, useShareLinks, useGenerateInvestorUpdate, useCreateShareLink, useRevokeShareLink } from '@/hooks/useInvestorUpdates';
import { notify } from "@/lib/notify";

interface InvestorUpdatesTabProps {
  workspaceId: string;
  canWrite: boolean;
}

interface UpdateContent {
  highlights?: string[];
  lowlights?: string[];
  kpis?: { name: string; value: number | null; target?: number | null; delta?: number | null; unit?: string }[];
  milestones_achieved?: string[];
  next_milestones?: { title: string; target_date: string }[];
  risks?: string[];
  asks?: string[];
  next_month_priorities?: string[];
  health_score?: number | null;
  stage?: string;
}

export function InvestorUpdatesTab({ workspaceId, canWrite }: InvestorUpdatesTabProps) {
  const { t } = useTranslation();
  const { data: investorUpdates, isLoading } = useInvestorUpdates(workspaceId);
  const { data: shareLinks } = useShareLinks(workspaceId);
  const generateInvestorUpdate = useGenerateInvestorUpdate();
  const createShareLink = useCreateShareLink();
  const revokeShareLink = useRevokeShareLink();

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [shareDays, setShareDays] = useState('7');
  const [shareScope, setShareScope] = useState('report_only');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [expandedUpdates, setExpandedUpdates] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedUpdates);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedUpdates(newSet);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateInvestorUpdate.mutateAsync({ workspaceId, month: selectedMonth });
      setShowGenerateDialog(false);
      notify.success(
        t('investorUpdates.updateGenerated', { defaultValue: '✅ Atualização gerada com sucesso!' }),
        {
          description: t('investorUpdates.updateGeneratedDesc', { defaultValue: 'A atualização foi adicionada ao Data Room automaticamente.' }),
          duration: 5000,
        }
      );
    } catch (error: any) {
      const message = error?.message || t('investorUpdates.failedToGenerate', { defaultValue: 'Falha ao gerar atualização' });
      notify.error(message, { duration: 5000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateShareLink = async () => {
    setIsCreatingLink(true);
    try {
      const link = await createShareLink.mutateAsync({
        workspaceId,
        scope: shareScope,
        expiresInDays: parseInt(shareDays),
      });
      notify.success(t('investorUpdates.linkCreated'));
      
      const shareUrl = `${window.location.origin}/dataroom/shared/${link.token}`;
      await navigator.clipboard.writeText(shareUrl);
      notify.success(t('investorUpdates.linkCopied'));
      
      setShowShareDialog(false);
    } catch (error) {
      notify.error(t('investorUpdates.failedToCreateLink'));
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const shareUrl = `${window.location.origin}/dataroom/shared/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    notify.success(t('investorUpdates.linkCopied'));
  };

  const handleRevokeLink = async (linkId: string) => {
    try {
      await revokeShareLink.mutateAsync({ id: linkId, workspaceId });
      notify.success(t('investorUpdates.linkRevoked'));
    } catch (error) {
      notify.error(t('investorUpdates.failedToRevokeLink'));
    }
  };

  const copyUpdateAsMarkdown = (content: UpdateContent, month: string) => {
    let markdown = `# ${t('investorUpdates.title')} - ${format(new Date(month), 'MMMM yyyy')}\n\n`;
    
    if (content.health_score !== undefined && content.health_score !== null) {
      markdown += `**${t('investorUpdates.healthScore')}**: ${content.health_score}/100\n`;
    }
    if (content.stage) {
      markdown += `**${t('investorUpdates.stage')}**: ${content.stage}\n\n`;
    }

    if (content.highlights?.length) {
      markdown += `## ${t('investorUpdates.highlights')}\n${content.highlights.map(h => `- ${h}`).join('\n')}\n\n`;
    }
    if (content.lowlights?.length) {
      markdown += `## ${t('investorUpdates.lowlights')}\n${content.lowlights.map(l => `- ${l}`).join('\n')}\n\n`;
    }
    if (content.kpis?.length) {
      markdown += `## ${t('investorUpdates.keyMetrics')}\n${content.kpis.map(k => {
        const deltaStr = k.delta !== null && k.delta !== undefined ? ` (${k.delta > 0 ? '+' : ''}${k.delta}${k.unit === '%' ? 'pp' : ''})` : '';
        return `- **${k.name}**: ${k.value ?? 'N/A'}${k.unit || ''}${deltaStr}`;
      }).join('\n')}\n\n`;
    }
    if (content.milestones_achieved?.length) {
      markdown += `## ${t('investorUpdates.milestonesAchieved')}\n${content.milestones_achieved.map(m => `- ✅ ${m}`).join('\n')}\n\n`;
    }
    if (content.next_milestones?.length) {
      markdown += `## ${t('investorUpdates.upcomingMilestones')}\n${content.next_milestones.map(m => `- ${m.title} (${m.target_date})`).join('\n')}\n\n`;
    }
    if (content.risks?.length) {
      markdown += `## ${t('investorUpdates.risks')}\n${content.risks.map(r => `- ⚠️ ${r}`).join('\n')}\n\n`;
    }
    if (content.asks?.length) {
      markdown += `## ${t('investorUpdates.asks')}\n${content.asks.map(a => `- 🙏 ${a}`).join('\n')}\n\n`;
    }
    if (content.next_month_priorities?.length) {
      markdown += `## ${t('investorUpdates.priorities')}\n${content.next_month_priorities.map(p => `- ${p}`).join('\n')}\n\n`;
    }

    navigator.clipboard.writeText(markdown);
    notify.success(t('investorUpdates.copiedMarkdown'));
  };

  const getHealthColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'bg-muted';
    if (score >= 80) return 'bg-[hsl(var(--success))]';
    if (score >= 60) return 'bg-[hsl(var(--success))]/10';
    if (score >= 40) return 'bg-[hsl(var(--warning))]';
    if (score >= 20) return 'bg-[hsl(var(--warning))]/10';
    return 'bg-destructive';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="updates" className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="updates" className="gap-2">
            <FileText className="h-4 w-4" />
            {t('investorUpdates.title')}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <BookTemplate className="h-4 w-4" />
            {t('investorUpdates.templates')}
          </TabsTrigger>
        </TabsList>
        {canWrite && (
          <div className="flex gap-2">
            <Button onClick={() => setShowGenerateDialog(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {t('investorUpdates.generateUpdate')}
            </Button>
            <Button variant="outline" onClick={() => setShowShareDialog(true)} className="gap-2">
              <Link2 className="h-4 w-4" />
              {t('investorUpdates.createShareLink')}
            </Button>
          </div>
        )}
      </div>

      {/* Templates Tab */}
      <TabsContent value="templates" className="mt-6">
        <InvestorTemplateLibrary />
      </TabsContent>

      {/* Updates Tab */}
      <TabsContent value="updates" className="mt-6 space-y-6">
      {/* Active Share Links */}
      {shareLinks && shareLinks.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              {t('investorUpdates.activeLinks')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shareLinks.filter(l => !l.revoked_at).map((link) => (
                <div key={link.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-normal">
                      {link.scope === 'report_only' ? t('investorUpdates.scopeReportOnly') :
                       link.scope === 'kpis_only' ? t('investorUpdates.scopeKpisOnly') :
                       t('investorUpdates.scopeFullReadonly')}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {t('investorUpdates.expires')} {format(new Date(link.expires_at), 'MMM d, yyyy')}
                    </span>
                    {link.views_count !== null && link.views_count > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {link.views_count} {link.views_count === 1 ? t('investorUpdates.views') : t('investorUpdates.views_plural')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleCopyLink(link.token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevokeLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Updates List */}
      {investorUpdates?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="font-semibold text-lg mb-2">{t('investorUpdates.noUpdatesYet')}</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t('investorUpdates.noUpdatesDesc')}
            </p>
            {canWrite && (
              <Button onClick={() => setShowGenerateDialog(true)} size="lg" className="gap-2">
                <Sparkles className="h-5 w-5" />
                {t('investorUpdates.generateFirst')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {investorUpdates?.map((update) => {
            const content = update.content_json as UpdateContent;
            const isExpanded = expandedUpdates.has(update.id);
            
            return (
              <Collapsible key={update.id} open={isExpanded} onOpenChange={() => toggleExpanded(update.id)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {format(new Date(update.month), 'MMMM yyyy')}
                            </CardTitle>
                            <CardDescription>
                              {t('investorUpdates.generated')} {format(new Date(update.created_at), 'MMM d, yyyy')}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {content.health_score !== null && content.health_score !== undefined && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground mb-1">{t('investorUpdates.healthScore')}</p>
                              <div className="flex items-center gap-2">
                                <Progress value={content.health_score} className="w-24 h-2" />
                                <span className="font-semibold text-sm">{content.health_score}%</span>
                              </div>
                            </div>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-6">
                      {/* Quick Stats Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <p className="text-2xl font-bold text-primary">{content.kpis?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">{t('investorUpdates.keyMetrics')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <p className="text-2xl font-bold text-[hsl(var(--success))]">{content.milestones_achieved?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">{t('investorUpdates.milestonesAchieved')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <p className="text-2xl font-bold text-[hsl(var(--warning))]">{content.risks?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">{t('investorUpdates.risks')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <p className="text-2xl font-bold text-[hsl(var(--info))]">{content.asks?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">{t('investorUpdates.asks')}</p>
                        </div>
                      </div>

                      {/* Content Grid */}
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Highlights */}
                        {content.highlights && content.highlights.length > 0 && (
                          <div className="p-4 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30">
                            <div className="flex items-center gap-2 mb-3">
                              <TrendingUp className="h-5 w-5 text-[hsl(var(--success))]" />
                              <span className="font-semibold text-[hsl(var(--success))]">{t('investorUpdates.highlights')}</span>
                            </div>
                            <ul className="space-y-2">
                              {content.highlights.map((h, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-[hsl(var(--success))]">
                                  <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                  <span>{h}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Lowlights */}
                        {content.lowlights && content.lowlights.length > 0 && (
                          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                            <div className="flex items-center gap-2 mb-3">
                              <TrendingDown className="h-5 w-5 text-destructive" />
                              <span className="font-semibold text-destructive">{t('investorUpdates.lowlights')}</span>
                            </div>
                            <ul className="space-y-2">
                              {content.lowlights.map((l, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                                  <span className="text-destructive">•</span>
                                  <span>{l}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* KPIs */}
                        {content.kpis && content.kpis.length > 0 && (
                          <div className="p-4 rounded-lg bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/30">
                            <div className="flex items-center gap-2 mb-3">
                              <Target className="h-5 w-5 text-[hsl(var(--info))]" />
                              <span className="font-semibold text-[hsl(var(--info))]">{t('investorUpdates.keyMetrics')}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {content.kpis.slice(0, 6).map((kpi, i) => (
                                <div key={i} className="p-2 rounded bg-background/50">
                                  <p className="text-xs text-muted-foreground truncate">{kpi.name}</p>
                                  <div className="flex items-baseline gap-1">
                                    <span className="font-bold text-[hsl(var(--info))]">
                                      {kpi.value ?? 'N/A'}{kpi.unit || ''}
                                    </span>
                                    {kpi.delta !== null && kpi.delta !== undefined && (
                                      <span className={`text-xs ${kpi.delta >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                                        {kpi.delta > 0 ? '+' : ''}{kpi.delta}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Risks */}
                        {content.risks && content.risks.length > 0 && (
                          <div className="p-4 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
                            <div className="flex items-center gap-2 mb-3">
                              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
                              <span className="font-semibold text-[hsl(var(--warning))]">{t('investorUpdates.risks')}</span>
                            </div>
                            <ul className="space-y-2">
                              {content.risks.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-[hsl(var(--warning))]">
                                  <span className="text-[hsl(var(--warning))]">⚠</span>
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Asks */}
                        {content.asks && content.asks.length > 0 && (
                          <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 ">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-lg">🙏</span>
                              <span className="font-semibold text-primary ">{t('investorUpdates.asks')}</span>
                            </div>
                            <ul className="space-y-2">
                              {content.asks.map((a, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-primary ">
                                  <span className="text-primary">•</span>
                                  <span>{a}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Priorities */}
                        {content.next_month_priorities && content.next_month_priorities.length > 0 && (
                          <div className="p-4 rounded-lg bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/30 ">
                            <div className="flex items-center gap-2 mb-3">
                              <Clock className="h-5 w-5 text-[hsl(var(--info))]" />
                              <span className="font-semibold text-[hsl(var(--info))] ">{t('investorUpdates.priorities')}</span>
                            </div>
                            <ul className="space-y-2">
                              {content.next_month_priorities.map((p, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-[hsl(var(--info))] ">
                                  <span className="font-bold text-[hsl(var(--info))]">{i + 1}.</span>
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Milestones */}
                      {((content.milestones_achieved && content.milestones_achieved.length > 0) || 
                        (content.next_milestones && content.next_milestones.length > 0)) && (
                        <div className="grid gap-4 md:grid-cols-2">
                          {content.milestones_achieved && content.milestones_achieved.length > 0 && (
                            <div className="p-4 rounded-lg border bg-muted/30">
                              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                                {t('investorUpdates.milestonesAchieved')}
                              </h4>
                              <ul className="space-y-1">
                                {content.milestones_achieved.map((m, i) => (
                                  <li key={i} className="text-sm flex items-center gap-2">
                                    <span className="text-[hsl(var(--success))]">✓</span> {m}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {content.next_milestones && content.next_milestones.length > 0 && (
                            <div className="p-4 rounded-lg border bg-muted/30">
                              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-[hsl(var(--info))]" />
                                {t('investorUpdates.upcomingMilestones')}
                              </h4>
                              <ul className="space-y-1">
                                {content.next_milestones.map((m, i) => (
                                  <li key={i} className="text-sm flex items-center justify-between">
                                    <span>{m.title}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {m.target_date ? format(new Date(m.target_date), 'MMM d') : '-'}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyUpdateAsMarkdown(content, update.month)}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          {t('investorUpdates.copyAsMarkdown')}
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('investorUpdates.generateUpdate')}</DialogTitle>
            <DialogDescription>
              {t('investorUpdates.description')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('investorUpdates.month')}</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('investorUpdates.generating')}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t('investorUpdates.generateUpdate')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Link Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('investorUpdates.createShareLink')}</DialogTitle>
            <DialogDescription>
              {t('investorUpdates.description')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('investorUpdates.shareScope')}</Label>
              <Select value={shareScope} onValueChange={setShareScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="report_only">{t('investorUpdates.scopeReportOnly')}</SelectItem>
                  <SelectItem value="kpis_only">{t('investorUpdates.scopeKpisOnly')}</SelectItem>
                  <SelectItem value="full_readonly">{t('investorUpdates.scopeFullReadonly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('investorUpdates.expiresIn')}</Label>
              <Select value={shareDays} onValueChange={setShareDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('investorUpdates.oneDay')}</SelectItem>
                  <SelectItem value="7">{t('investorUpdates.sevenDays')}</SelectItem>
                  <SelectItem value="30">{t('investorUpdates.thirtyDays')}</SelectItem>
                  <SelectItem value="90">{t('investorUpdates.ninetyDays')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateShareLink} disabled={isCreatingLink} className="gap-2">
              {isCreatingLink ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('investorUpdates.creatingLink')}
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  {t('investorUpdates.createShareLink')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </TabsContent>
    </Tabs>
  );
}
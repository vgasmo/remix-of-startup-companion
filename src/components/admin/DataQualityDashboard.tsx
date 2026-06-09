import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Mail, Send, Users, Building2, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface DataIssue {
  id: string;
  name: string;
  type: 'missing_nif' | 'missing_founder' | 'missing_contact';
  workspaceId?: string;
  email?: string;
}

export function DataQualityDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  // Fetch data quality issues
  const { data: issues, isLoading } = useQuery({
    queryKey: ['data-quality-issues'],
    queryFn: async () => {
      const allIssues: DataIssue[] = [];

      // Fetch startups missing NIF
      const { data: startupsNoNif } = await supabase
        .from('startups')
        .select('id, name, main_contact_email')
        .or('nif.is.null,nif.eq.')
        .order('name');

      startupsNoNif?.forEach(s => {
        allIssues.push({
          id: `nif-${s.id}`,
          name: s.name,
          type: 'missing_nif',
          email: s.main_contact_email || undefined,
        });
      });

      // Fetch workspaces without founders
      const { data: workspacesNoFounder } = await supabase
        .from('workspaces')
        .select(`
          id,
          startup:startups!workspaces_startup_id_fkey(id, name, main_contact_email),
          workspace_users!inner(user_id, role)
        `)
        .eq('status', 'active');

      const workspaceFounderMap = new Map<string, boolean>();
      workspacesNoFounder?.forEach(w => {
        const hasFounder = (w.workspace_users as any[])?.some(
          (wu: any) => wu.role === 'founder'
        );
        if (!hasFounder && w.startup) {
          const startup = w.startup as any;
          allIssues.push({
            id: `founder-${w.id}`,
            name: startup.name,
            type: 'missing_founder',
            workspaceId: w.id,
            email: startup.main_contact_email || undefined,
          });
        }
      });

      // Fetch startups missing contact info
      const { data: startupsNoContact } = await supabase
        .from('startups')
        .select('id, name')
        .or('main_contact_email.is.null,main_contact_email.eq.')
        .order('name');

      startupsNoContact?.forEach(s => {
        allIssues.push({
          id: `contact-${s.id}`,
          name: s.name,
          type: 'missing_contact',
        });
      });

      return allIssues;
    },
  });

  const missingNifCount = issues?.filter(i => i.type === 'missing_nif').length || 0;
  const missingFounderCount = issues?.filter(i => i.type === 'missing_founder').length || 0;
  const missingContactCount = issues?.filter(i => i.type === 'missing_contact').length || 0;

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIssues);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIssues(newSet);
  };

  const selectAllFounderIssues = () => {
    const founderIssues = issues?.filter(i => i.type === 'missing_founder' && i.email) || [];
    const newSet = new Set(selectedIssues);
    founderIssues.forEach(i => newSet.add(i.id));
    setSelectedIssues(newSet);
  };

  const handleBulkInvite = async () => {
    const toInvite = issues?.filter(i => 
      selectedIssues.has(i.id) && 
      i.type === 'missing_founder' && 
      i.email && 
      i.workspaceId
    ) || [];

    if (toInvite.length === 0) {
      notify.error(t('dataQuality.noStartupsToInvite', 'No valid invites selected'));
      return;
    }

    setIsSendingInvites(true);
    let successCount = 0;
    let errorCount = 0;

    for (const issue of toInvite) {
      try {
        // Add delay between emails to avoid rate limits
        if (successCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        const { error } = await supabase.functions.invoke('send-workspace-invite', {
          body: {
            workspaceId: issue.workspaceId,
            email: issue.email,
            role: 'founder',
          },
        });

        if (error) throw error;
        successCount++;
      } catch (err) {
        logger.error('Failed to send invite', {}, err);
        errorCount++;
      }
    }

    setIsSendingInvites(false);
    setSelectedIssues(new Set());
    queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });

    if (successCount > 0) {
      notify.success(t('dataQuality.invitesSent', '{{count}} invites sent successfully').replace('{{count}}', String(successCount)));
    }
    if (errorCount > 0) {
      notify.error(t('dataQuality.invitesFailed', '{{count}} invites failed').replace('{{count}}', String(errorCount)));
    }
  };

  // intentional: data-issue category palette — distinct hue per issue type (orange/red/yellow paired with category cards below)
  const getIssueIcon = (type: DataIssue['type']) => {
    switch (type) {
      case 'missing_nif':
        return <Building2 className="h-4 w-4 text-[hsl(var(--warning))]" />;
      case 'missing_founder':
        return <Users className="h-4 w-4 text-destructive" />;
      case 'missing_contact':
        return <Phone className="h-4 w-4 text-[hsl(var(--warning))]" />;
    }
  };

  const getIssueLabel = (type: DataIssue['type']) => {
    switch (type) {
      case 'missing_nif':
        return t('dataQuality.missingNif');
      case 'missing_founder':
        return t('dataQuality.missingFounders');
      case 'missing_contact':
        return t('dataQuality.missingContact');
    }
  };

  const selectedFounderInvites = Array.from(selectedIssues).filter(id => {
    const issue = issues?.find(i => i.id === id);
    return issue?.type === 'missing_founder' && issue.email;
  }).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--warning))]/10 ">
                <Building2 className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <p className="text-2xl font-bold">{missingNifCount}</p>
                <p className="text-sm text-muted-foreground">{t('dataQuality.missingNif')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 ">
                <Users className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{missingFounderCount}</p>
                <p className="text-sm text-muted-foreground">{t('dataQuality.missingFounders')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--warning))]/10 ">
                <Phone className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <p className="text-2xl font-bold">{missingContactCount}</p>
                <p className="text-sm text-muted-foreground">{t('dataQuality.missingContact')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{issues?.length || 0}</p>
                <p className="text-sm text-muted-foreground">{t('dataQuality.totalIssues')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions */}
      {missingFounderCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t('dataQuality.bulkInvite')}
            </CardTitle>
            <CardDescription>
              {t('dataQuality.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={selectAllFounderIssues}>
                {t('dataQuality.selectAllWithEmail', 'Select all with email')}
              </Button>
              <Button
                onClick={handleBulkInvite}
                disabled={selectedFounderInvites === 0 || isSendingInvites}
              >
                {isSendingInvites ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {t('dataQuality.sendInvites', 'Send {{count}} invites').replace('{{count}}', String(selectedFounderInvites))}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataQuality.title')}</CardTitle>
          <CardDescription>{t('dataQuality.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : issues?.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success))] mx-auto mb-4" />
              <p className="text-lg font-medium">{t('dataQuality.noIssues')}</p>
              <p className="text-sm text-muted-foreground">{t('dataQuality.allDataComplete')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>{t('dataQuality.startup', 'Startup')}</TableHead>
                  <TableHead>{t('dataQuality.issue', 'Issue')}</TableHead>
                  <TableHead>{t('dataQuality.email', 'Email')}</TableHead>
                  <TableHead className="w-24">{t('dataQuality.action', 'Action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues?.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell>
                      {issue.type === 'missing_founder' && issue.email && (
                        <Checkbox
                          checked={selectedIssues.has(issue.id)}
                          onCheckedChange={() => toggleSelection(issue.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {issue.workspaceId ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/workspace/${issue.workspaceId}`)}
                          className="text-left text-primary hover:underline focus:outline-none focus-visible:underline"
                        >
                          {issue.name}
                        </button>
                      ) : (
                        issue.name
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {getIssueIcon(issue.type)}
                        {getIssueLabel(issue.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {issue.email || '—'}
                    </TableCell>
                    <TableCell>
                      {issue.type === 'missing_founder' && issue.email && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { error } = await supabase.functions.invoke('send-workspace-invite', {
                                body: {
                                  workspaceId: issue.workspaceId,
                                  email: issue.email,
                                  role: 'founder',
                                },
                              });
                              if (error) throw error;
                              notify.success(t('dataQuality.inviteSent', 'Invite sent'));
                              queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
                            } catch {
                              notify.error(t('dataQuality.inviteFailed', 'Failed to send invite'));
                            }
                          }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

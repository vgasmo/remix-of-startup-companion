import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Database, 
  Shield, 
  Zap, 
  Mail,
  ChevronDown,
  Play,
  Loader2,
  Bell,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'warn';

interface TestResult {
  status: TestStatus;
  message: string;
  details?: string;
}

export default function CrmDiagnostics() {
  const { t } = useTranslation();
  const { isAdmin, isConsultor } = useAuth();
  const isStaff = isAdmin || isConsultor;
  const [funnelItemId, setFunnelItemId] = useState('');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Test results state
  const [schemaTest, setSchemaTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [permissionsTest, setPermissionsTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [notificationsDryRunTest, setNotificationsDryRunTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [notificationsLiveTest, setNotificationsLiveTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [graphSyncTest, setGraphSyncTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [drawerTest, setDrawerTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [bulkTest, setBulkTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });
  const [metricsTest, setMetricsTest] = useState<TestResult>({ status: 'idle', message: 'Not run' });

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  if (!isStaff) {
    return <AppLayout><AccessDenied /></AppLayout>;
  }

  const runSchemaCheck = async () => {
    setSchemaTest({ status: 'running', message: 'Checking...' });
    addLog('Starting schema check...');
    
    try {
      // Check communication_log columns
      const { data: commLog, error: commErr } = await supabase
        .from('communication_log')
        .select('id, status, due_at, assigned_to, priority, completed_at, visibility, activity_type')
        .limit(1);
      
      if (commErr) throw new Error(`communication_log: ${commErr.message}`);
      addLog('✓ communication_log task columns exist');

      // Check funnel_items columns
      const { data: funnel, error: funnelErr } = await supabase
        .from('funnel_items')
        .select('id, next_action_at, next_action_description, last_activity_at')
        .limit(1);
      
      if (funnelErr) throw new Error(`funnel_items: ${funnelErr.message}`);
      addLog('✓ funnel_items next_action columns exist');

      // Check notifications columns
      const { data: notif, error: notifErr } = await supabase
        .from('notifications')
        .select('id, entity_type, entity_id')
        .limit(1);
      
      if (notifErr) throw new Error(`notifications: ${notifErr.message}`);
      addLog('✓ notifications entity columns exist');

      setSchemaTest({ status: 'pass', message: 'All required columns present' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Schema error: ${msg}`);
      setSchemaTest({ status: 'fail', message: msg });
    }
  };

  const runPermissionsCheck = async () => {
    setPermissionsTest({ status: 'running', message: 'Checking...' });
    addLog('Starting permissions check...');
    
    try {
      // Staff can query communication_log
      const { data: staffItems, error: staffErr } = await supabase
        .from('communication_log')
        .select('id, visibility')
        .limit(20);
      
      if (staffErr) throw new Error(`Staff query failed: ${staffErr.message}`);
      addLog(`✓ Staff can query communication_log (${staffItems?.length || 0} items)`);

      // Check visibility distribution
      const staffOnly = staffItems?.filter(i => i.visibility === 'staff').length || 0;
      const shared = staffItems?.filter(i => i.visibility === 'shared').length || 0;
      addLog(`  - Staff visibility: ${staffOnly}, Shared: ${shared}`);

      // Verify RLS is in place
      const { data: funnelItems, error: funnelErr } = await supabase
        .from('funnel_items')
        .select('id, owner_consultant_id')
        .limit(10);

      if (funnelErr) throw new Error(`Funnel query failed: ${funnelErr.message}`);
      addLog(`✓ Staff can query funnel_items (${funnelItems?.length || 0} items)`);

      setPermissionsTest({ 
        status: 'pass', 
        message: `Staff access OK. ${staffItems?.length || 0} log items, ${funnelItems?.length || 0} funnel items visible.`,
        details: `Staff-only: ${staffOnly}, Shared: ${shared}`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Permissions error: ${msg}`);
      setPermissionsTest({ status: 'fail', message: msg });
    }
  };

  const runNotificationsDryRun = async () => {
    setNotificationsDryRunTest({ status: 'running', message: 'Calling edge function (dry run)...' });
    addLog('Calling generate-crm-notifications (dry_run=true)...');
    
    try {
      const { data, error } = await invokeWithAuth('generate-crm-notifications', {
        body: { dry_run: true },
      });
      
      if (error) throw error;
      
      addLog(`✓ Dry run result: would create ${data?.would_create || 0} notifications`);
      addLog(`  - Would escalate: ${data?.would_escalate || 0}`);
      addLog(`  - Tasks checked: ${data?.checked?.tasks || 0}`);
      addLog(`  - Funnel items checked: ${data?.checked?.funnelItems || 0}`);
      
      setNotificationsDryRunTest({ 
        status: 'pass', 
        message: `Would create ${data?.would_create || 0} notifications (${data?.would_escalate || 0} escalations)`,
        details: `Tasks: ${data?.checked?.tasks || 0}, Leads: ${data?.checked?.funnelItems || 0}`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Notification dry-run error: ${msg}`);
      setNotificationsDryRunTest({ status: 'fail', message: msg });
    }
  };

  const runNotificationsLive = async () => {
    setNotificationsLiveTest({ status: 'running', message: 'Calling edge function (LIVE)...' });
    addLog('Calling generate-crm-notifications (LIVE mode - writes data!)...');
    
    try {
      const { data, error } = await invokeWithAuth('generate-crm-notifications', {
        body: {},
      });
      
      if (error) throw error;
      
      addLog(`✓ Function returned: created ${data?.created || 0} notifications`);
      setNotificationsLiveTest({ 
        status: 'pass', 
        message: `Created ${data?.created || 0} notifications`,
        details: `Tasks checked: ${data?.checked?.tasks || 0}, Funnel items: ${data?.checked?.funnelItems || 0}`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Notification function error: ${msg}`);
      setNotificationsLiveTest({ status: 'fail', message: msg });
    }
  };

  const runGraphSyncCheck = async () => {
    if (!funnelItemId) {
      setGraphSyncTest({ status: 'warn', message: 'Enter a funnel_item_id first' });
      return;
    }
    
    setGraphSyncTest({ status: 'running', message: 'Running dry-run sync...' });
    addLog(`Calling sync-graph-email-history (dry_run) for ${funnelItemId}...`);
    
    try {
      const { data, error } = await invokeWithAuth('sync-graph-email-history', {
        body: { funnel_item_id: funnelItemId, dry_run: true },
      });
      
      if (error) throw error;
      
      if (data?.error) {
        addLog(`⚠ Function returned error: ${data.error}`);
        setGraphSyncTest({ status: 'warn', message: data.error });
      } else {
        addLog(`✓ Dry run result: would insert ${data?.would_insert || 0} emails`);
        setGraphSyncTest({ 
          status: 'pass', 
          message: `Would sync ${data?.would_insert || 0} emails`,
          details: `Mailbox: ${data?.mailbox || 'N/A'}`
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Graph sync error: ${msg}`);
      setGraphSyncTest({ status: 'fail', message: msg });
    }
  };

  const runDrawerCheck = async () => {
    if (!funnelItemId) {
      setDrawerTest({ status: 'warn', message: 'Enter a funnel_item_id first' });
      return;
    }
    
    setDrawerTest({ status: 'running', message: 'Loading timeline...' });
    addLog(`Loading timeline for ${funnelItemId}...`);
    
    try {
      const { data: timeline, error: tlErr } = await supabase
        .from('communication_log')
        .select('id, activity_type, status')
        .eq('funnel_item_id', funnelItemId)
        .limit(50);
      
      if (tlErr) throw tlErr;
      
      const tasks = timeline?.filter(t => t.activity_type === 'task') || [];
      const openTasks = tasks.filter(t => t.status === 'open').length;
      
      addLog(`✓ Timeline loaded: ${timeline?.length || 0} items, ${tasks.length} tasks (${openTasks} open)`);
      
      setDrawerTest({ 
        status: 'pass', 
        message: `${timeline?.length || 0} timeline items loaded`,
        details: `Tasks: ${tasks.length} (${openTasks} open)`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Drawer load error: ${msg}`);
      setDrawerTest({ status: 'fail', message: msg });
    }
  };

  const runBulkCheck = async () => {
    setBulkTest({ status: 'running', message: 'Checking bulk action capabilities...' });
    addLog('Checking bulk update capabilities...');
    
    try {
      // Check if we can query funnel_items for bulk operations
      const { data: items, error: queryErr } = await supabase
        .from('funnel_items')
        .select('id, owner_consultant_id, next_action_at')
        .not('stage', 'in', '(rejected,archived)')
        .limit(5);
      
      if (queryErr) throw new Error(`Query failed: ${queryErr.message}`);
      addLog(`✓ Can query funnel_items for bulk ops (${items?.length || 0} items)`);

      // Check if consultors exist for assignment
      const { data: consultors, error: consErr } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'consultor')
        .limit(10);
      
      if (consErr) throw new Error(`Consultor query failed: ${consErr.message}`);
      addLog(`✓ Found ${consultors?.length || 0} consultors for assignment`);

      setBulkTest({ 
        status: 'pass', 
        message: `Bulk capabilities OK. ${items?.length || 0} items, ${consultors?.length || 0} consultors available.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Bulk check error: ${msg}`);
      setBulkTest({ status: 'fail', message: msg });
    }
  };

  const runMetricsCheck = async () => {
    setMetricsTest({ status: 'running', message: 'Calculating CRM metrics...' });
    addLog('Calculating CRM metrics...');
    
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const staleThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // Count overdue next actions
      const { count: overdueNextActions } = await supabase
        .from('funnel_items')
        .select('id', { count: 'exact', head: true })
        .lt('next_action_at', todayStart)
        .not('stage', 'in', '(rejected,archived)');

      // Count today's next actions
      const { count: todayNextActions } = await supabase
        .from('funnel_items')
        .select('id', { count: 'exact', head: true })
        .gte('next_action_at', todayStart)
        .lt('next_action_at', todayEnd)
        .not('stage', 'in', '(rejected,archived)');

      // Count stale items
      const { count: staleItems } = await supabase
        .from('funnel_items')
        .select('id', { count: 'exact', head: true })
        .or(`last_activity_at.lt.${staleThreshold},last_activity_at.is.null`)
        .is('next_action_at', null)
        .not('stage', 'in', '(rejected,archived)');

      // Count open tasks
      const { count: openTasks } = await supabase
        .from('communication_log')
        .select('id', { count: 'exact', head: true })
        .eq('activity_type', 'task')
        .eq('status', 'open');

      // Count overdue tasks
      const { count: overdueTasks } = await supabase
        .from('communication_log')
        .select('id', { count: 'exact', head: true })
        .eq('activity_type', 'task')
        .eq('status', 'open')
        .lt('due_at', todayStart);

      addLog(`✓ Overdue next actions: ${overdueNextActions || 0}`);
      addLog(`✓ Today's next actions: ${todayNextActions || 0}`);
      addLog(`✓ Stale items: ${staleItems || 0}`);
      addLog(`✓ Open tasks: ${openTasks || 0}`);
      addLog(`✓ Overdue tasks: ${overdueTasks || 0}`);

      setMetricsTest({ 
        status: 'pass', 
        message: `Overdue: ${overdueNextActions || 0}, Today: ${todayNextActions || 0}, Stale: ${staleItems || 0}`,
        details: `Open tasks: ${openTasks || 0}, Overdue tasks: ${overdueTasks || 0}`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Metrics error: ${msg}`);
      setMetricsTest({ status: 'fail', message: msg });
    }
  };

  const getStatusIcon = (status: TestStatus) => {
    switch (status) {
      case 'pass': return <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />;
      case 'fail': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warn': return <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />;
      case 'running': return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default: return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const runAllTests = async () => {
    await runSchemaCheck();
    await runPermissionsCheck();
    await runNotificationsDryRun();
    await runBulkCheck();
    await runMetricsCheck();
    if (funnelItemId) {
      await runGraphSyncCheck();
      await runDrawerCheck();
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('crm.diagnostics.title', 'CRM Diagnostics')}</h1>
            <p className="text-muted-foreground">{t('crm.diagnostics.subtitle', 'Validate CRM features without affecting production data')}</p>
          </div>
          <Button onClick={runAllTests} variant="outline">
            <Play className="h-4 w-4 mr-2" />
            {t('crm.diagnostics.runAll', 'Run All Tests')}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('crm.diagnostics.config', 'Test Configuration')}</CardTitle>
            <CardDescription>{t('crm.diagnostics.configDesc', 'Provide a funnel_item_id for targeted tests')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="funnel-id">{t('crm.diagnostics.funnelId', 'Funnel Item ID (optional)')}</Label>
                <Input 
                  id="funnel-id"
                  value={funnelItemId} 
                  onChange={(e) => setFunnelItemId(e.target.value)}
                  placeholder="Enter UUID..."
                  className="font-mono text-sm"
                />
              </div>
              <Button variant="outline" onClick={() => window.open('/crm', '_blank')}>
                {t('crm.diagnostics.openCrm', 'Open CRM')} →
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Core Infrastructure Tests */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t('crm.diagnostics.infrastructure', 'Infrastructure')}
          </h3>
          <div className="grid gap-3">
            {/* Schema Check */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(schemaTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.schemaCheck', 'Schema Check')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{schemaTest.message}</p>
                      {schemaTest.details && <p className="text-xs text-muted-foreground">{schemaTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runSchemaCheck} disabled={schemaTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Permissions Check */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(permissionsTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.permissions', 'Permissions Check')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{permissionsTest.message}</p>
                      {permissionsTest.details && <p className="text-xs text-muted-foreground">{permissionsTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runPermissionsCheck} disabled={permissionsTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Notifications Tests */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t('crm.diagnostics.notifications', 'Notifications')}
          </h3>
          <div className="grid gap-3">
            {/* Notifications Dry Run */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(notificationsDryRunTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.notificationsDryRun', 'CRM Notifications (Dry Run)')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{notificationsDryRunTest.message}</p>
                      {notificationsDryRunTest.details && <p className="text-xs text-muted-foreground">{notificationsDryRunTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runNotificationsDryRun} disabled={notificationsDryRunTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notifications Live */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(notificationsLiveTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.notificationsLive', 'CRM Notifications (Live)')}</span>
                        <Badge variant="secondary" className="text-[10px]">writes data</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{notificationsLiveTest.message}</p>
                      {notificationsLiveTest.details && <p className="text-xs text-muted-foreground">{notificationsLiveTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" variant="destructive" onClick={runNotificationsLive} disabled={notificationsLiveTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* CRM Features Tests */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t('crm.diagnostics.features', 'CRM Features')}
          </h3>
          <div className="grid gap-3">
            {/* Bulk Actions Check */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(bulkTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.bulkActions', 'Bulk Actions Capability')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{bulkTest.message}</p>
                      {bulkTest.details && <p className="text-xs text-muted-foreground">{bulkTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runBulkCheck} disabled={bulkTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Metrics Check */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(metricsTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.metrics', 'CRM Metrics')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{metricsTest.message}</p>
                      {metricsTest.details && <p className="text-xs text-muted-foreground">{metricsTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runMetricsCheck} disabled={metricsTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Graph Sync (Dry Run) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(graphSyncTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.graphSync', 'Graph Email Sync (Dry Run)')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{graphSyncTest.message}</p>
                      {graphSyncTest.details && <p className="text-xs text-muted-foreground">{graphSyncTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runGraphSyncCheck} disabled={graphSyncTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* UI Wiring Check */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(drawerTest.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('crm.diagnostics.drawerLoad', 'RecordDrawer Timeline Load')}</span>
                        <Badge variant="outline" className="text-[10px]">read-only</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{drawerTest.message}</p>
                      {drawerTest.details && <p className="text-xs text-muted-foreground">{drawerTest.details}</p>}
                    </div>
                  </div>
                  <Button size="sm" onClick={runDrawerCheck} disabled={drawerTest.status === 'running'}>
                    <Play className="h-3 w-3 mr-1" /> {t('common.run', 'Run')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Logs Panel */}
        <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('crm.diagnostics.logs', 'Diagnostic Logs')}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{logs.length} {t('crm.diagnostics.entries', 'entries')}</Badge>
                    <ChevronDown className={`h-4 w-4 transition-transform ${logsExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ScrollArea className="h-48 rounded border bg-muted/30 p-2">
                  {logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('crm.diagnostics.runToSee', 'Run tests to see logs...')}</p>
                  ) : (
                    <div className="space-y-1 font-mono text-xs">
                      {logs.map((log, i) => (
                        <div key={i} className="text-muted-foreground">{log}</div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {logs.length > 0 && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLogs([])}>
                    {t('crm.diagnostics.clearLogs', 'Clear Logs')}
                  </Button>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </AppLayout>
  );
}
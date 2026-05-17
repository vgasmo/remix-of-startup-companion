import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { supabase } from '@/lib/supabaseClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Play, Loader2, CheckCircle2, XCircle, Clock, Copy, ChevronDown, Database, Shield, Zap, Globe, BarChart3, Navigation } from 'lucide-react';
import { toast } from 'sonner';

type TestStatus = 'pending' | 'running' | 'pass' | 'fail';

interface TestResult {
  name: string;
  status: TestStatus;
  message: string;
  details?: string;
}

interface TestCategory {
  name: string;
  icon: React.ReactNode;
  tests: TestResult[];
}

type TestDef = {
  name: string;
  test: () => Promise<{ pass: boolean; message: string; details?: string }>;
};

const EDGE_FUNCTIONS_BASE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

async function runEdgeFunctionPreflight(functionName: string): Promise<{ pass: boolean; message: string; details?: string }> {
  if (!EDGE_FUNCTIONS_BASE_URL) {
    return { pass: false, message: 'Functions URL not configured' };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${EDGE_FUNCTIONS_BASE_URL}/${functionName}`, {
      method: 'OPTIONS',
      signal: controller.signal,
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, apikey, x-client-info',
      },
    });

    const details = await response.text().catch(() => '');

    return {
      pass: response.ok,
      message: response.ok
        ? `✓ Preflight OK (${response.status})`
        : `Preflight failed (${response.status})`,
      details: details || undefined,
    };
  } catch (error: any) {
    return {
      pass: false,
      message: error?.name === 'AbortError' ? 'Timeout (5s)' : `Unreachable: ${error?.message || 'Unknown error'}`,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const buildTests = (t: (k: string, d?: string) => string): { name: string; icon: React.ReactNode; tests: TestDef[] }[] => {
  const dbTables = [
    'profiles', 'workspaces', 'funnel_items', 'startup_contracts', 'sessions',
    'action_items', 'consultant_notes', 'programs', 'playbook_items',
    'contract_intakes', 'communication_log', 'activity_log', 'office_spaces',
    'rooms', 'buildings', 'incubation_types', 'mentor_nda_acceptances',
    'public_booking_links', 'user_roles', 'workspace_users', 'funnel_events',
  ];

  const dbTests: TestDef[] = dbTables.map(table => ({
    name: `${table} readable`,
    test: async () => {
      const { data, error } = await (supabase.from(table as any).select('id').limit(1) as any);
      return { pass: !error, message: error?.message || `${data?.length || 0} rows` };
    },
  }));

  const rlsTests: TestDef[] = [
    {
      name: 'Staff can update workspaces',
      test: async () => {
        const { data: ws } = await supabase.from('workspaces').select('id, priority_level').limit(1);
        if (!ws?.length) return { pass: true, message: 'No workspaces to test' };
        const { error } = await supabase.from('workspaces').update({ priority_level: ws[0].priority_level } as any).eq('id', ws[0].id);
        return { pass: !error, message: error?.message || 'UPDATE allowed' };
      },
    },
    {
      name: 'Staff can update funnel_items',
      test: async () => {
        const { data } = await supabase.from('funnel_items').select('id, notes').limit(1);
        if (!data?.length) return { pass: true, message: 'No funnel items' };
        const { error } = await supabase.from('funnel_items').update({ notes: data[0].notes }).eq('id', data[0].id);
        return { pass: !error, message: error?.message || 'UPDATE allowed' };
      },
    },
    {
      name: 'Staff can read consultant_notes',
      test: async () => {
        const { error } = await supabase.from('consultant_notes').select('id').limit(0);
        return { pass: !error, message: error?.message || 'SELECT OK' };
      },
    },
    {
      name: 'Staff can manage contracts',
      test: async () => {
        const { data } = await supabase.from('startup_contracts').select('id, status').limit(1);
        if (!data?.length) return { pass: true, message: 'No contracts' };
        const { error } = await supabase.from('startup_contracts').update({ status: data[0].status } as any).eq('id', data[0].id);
        return { pass: !error, message: error?.message || 'UPDATE allowed' };
      },
    },
    {
      name: 'Staff can read intakes',
      test: async () => {
        const { error } = await supabase.from('contract_intakes').select('id').limit(1);
        return { pass: !error, message: error?.message || 'SELECT OK' };
      },
    },
    {
      name: 'Communication log accessible',
      test: async () => {
        const { error } = await supabase.from('communication_log').select('id').limit(0);
        return { pass: !error, message: error?.message || 'Accessible' };
      },
    },
  ];

  const edgeFunctionTests: TestDef[] = [
    'generate-contract-pdf', 'copilot-chat', 'transcribe-audio',
    'accept-mentor-nda', 'recompute-health-scores', 'recompute-work-queue',
    'generate-session-summary',
  ].map(fn => ({
    name: `${fn} reachable`,
    test: async () => runEdgeFunctionPreflight(fn),
  }));

  const i18nTests: TestDef[] = [
    {
      name: 'PT and EN have same top-level key count',
      test: async () => {
        const pt = Object.keys(i18n.getResourceBundle('pt', 'translation') || {});
        const en = Object.keys(i18n.getResourceBundle('en', 'translation') || {});
        return {
          pass: pt.length === en.length,
          message: `PT: ${pt.length}, EN: ${en.length}${pt.length !== en.length ? ' — MISMATCH' : ''}`,
        };
      },
    },
    {
      name: 'Critical i18n keys exist in PT',
      test: async () => {
        const critical = [
          'common.save', 'common.cancel', 'common.close',
          'workspace.overview', 'workspace.actions', 'workspace.kpis',
        ];
        const missing = critical.filter(k => !i18n.exists(k, { lng: 'pt' }));
        return { pass: missing.length === 0, message: missing.length ? `Missing: ${missing.join(', ')}` : 'All critical keys present' };
      },
    },
  ];

  const flowTests: TestDef[] = [
    {
      name: 'Programs exist',
      test: async () => {
        const { data, error } = await supabase.from('programs').select('id, name').limit(1);
        return { pass: !error && (data?.length || 0) > 0, message: error?.message || data?.[0]?.name || 'No programs!' };
      },
    },
    {
      name: 'Playbook templates exist',
      test: async () => {
        const { data, error } = await supabase.from('playbook_items').select('id').limit(1);
        return { pass: !error, message: error?.message || `${data?.length || 0} items` };
      },
    },
    {
      name: 'Current user has roles',
      test: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { pass: false, message: 'Not authenticated' };
        const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        return { pass: !error && (data?.length || 0) > 0, message: error?.message || `Roles: ${data?.map(r => r.role).join(', ')}` };
      },
    },
    {
      name: 'workspace_users readable',
      test: async () => {
        const { error } = await supabase.from('workspace_users').select('id').limit(1);
        return { pass: !error, message: error?.message || 'OK' };
      },
    },
    {
      name: 'signature_proof_json column exists',
      test: async () => {
        const { error } = await supabase.from('startup_contracts').select('signature_proof_json').limit(0);
        return { pass: !error, message: error?.message || 'Column exists' };
      },
    },
  ];

  return [
    { name: 'Database Access', icon: <Database className="h-4 w-4" />, tests: dbTests },
    { name: 'RLS Policies', icon: <Shield className="h-4 w-4" />, tests: rlsTests },
    { name: 'Edge Functions', icon: <Zap className="h-4 w-4" />, tests: edgeFunctionTests },
    { name: 'i18n', icon: <Globe className="h-4 w-4" />, tests: i18nTests },
    { name: 'Business Flows', icon: <BarChart3 className="h-4 w-4" />, tests: flowTests },
  ];
};

export default function AppDiagnostics() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const firstFailRef = useRef<string | null>(null);

  const totalTests = categories.reduce((s, c) => s + c.tests.length, 0);
  const passed = categories.reduce((s, c) => s + c.tests.filter(t => t.status === 'pass').length, 0);
  const failed = categories.reduce((s, c) => s + c.tests.filter(t => t.status === 'fail').length, 0);

  const runAll = useCallback(async () => {
    setIsRunning(true);
    firstFailRef.current = null;
    const defs = buildTests();
    let totalCount = defs.reduce((s, c) => s + c.tests.length, 0);
    let completed = 0;

    const cats: TestCategory[] = defs.map(c => ({
      name: c.name,
      icon: c.icon,
      tests: c.tests.map(t => ({ name: t.name, status: 'pending' as TestStatus, message: '' })),
    }));
    setCategories([...cats]);

    for (let ci = 0; ci < defs.length; ci++) {
      for (let ti = 0; ti < defs[ci].tests.length; ti++) {
        cats[ci].tests[ti].status = 'running';
        setCategories([...cats.map(c => ({ ...c, tests: [...c.tests] }))]);

        try {
          const result = await Promise.race([
            defs[ci].tests[ti].test(),
            new Promise<{ pass: boolean; message: string; details?: string }>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout (15s)')), 15000)
            ),
          ]);
          cats[ci].tests[ti].status = result.pass ? 'pass' : 'fail';
          cats[ci].tests[ti].message = result.message;
          cats[ci].tests[ti].details = result.details;
          if (!result.pass && !firstFailRef.current) {
            firstFailRef.current = `${cats[ci].name}-${ti}`;
          }
        } catch (e: any) {
          cats[ci].tests[ti].status = 'fail';
          cats[ci].tests[ti].message = e.message;
        }

        completed++;
        setProgress(Math.round((completed / totalCount) * 100));
        setCategories([...cats.map(c => ({ ...c, tests: [...c.tests] }))]);
      }
    }

    setIsRunning(false);

    // Scroll to first failure
    if (firstFailRef.current) {
      setTimeout(() => {
        document.getElementById(firstFailRef.current!)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, []);

  const exportResults = () => {
    const data = categories.map(c => ({
      category: c.name,
      tests: c.tests.map(t => ({ name: t.name, status: t.status, message: t.message })),
    }));
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success(t('diagnostics.copied', 'Resultados copiados'));
  };

  const statusIcon = (status: TestStatus) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'fail': return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
      case 'running': return <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />;
      default: return <Clock className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <AppLayout
      title={t('diagnostics.title', 'Diagnósticos da Plataforma')}
      subtitle={t('diagnostics.subtitle', 'Testes automáticos a todas as camadas')}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Summary */}
        <Card className="border-2">
          <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">
                {totalTests > 0
                  ? `${passed}/${totalTests} ${t('diagnostics.testsPassed', 'testes passaram')}`
                  : t('diagnostics.ready', 'Pronto para correr')}
              </h2>
              <p className="text-muted-foreground">
                {failed > 0
                  ? `${failed} ${t('diagnostics.issuesFound', 'problemas encontrados')}`
                  : totalTests > 0
                    ? t('diagnostics.allOperational', 'Tudo operacional')
                    : t('diagnostics.clickToStart', 'Clique para iniciar os testes')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="lg" onClick={runAll} disabled={isRunning}>
                {isRunning ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {isRunning ? t('diagnostics.running', 'A correr...') : t('diagnostics.runAll', 'Correr Todos os Testes')}
              </Button>
              {totalTests > 0 && (
                <Button size="lg" variant="outline" onClick={exportResults}>
                  <Copy className="mr-2 h-4 w-4" />
                  JSON
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {isRunning && <Progress value={progress} className="h-2" />}

        {/* Categories */}
        {categories.map((cat, ci) => {
          const catPassed = cat.tests.filter(t => t.status === 'pass').length;
          const catFailed = cat.tests.filter(t => t.status === 'fail').length;

          return (
            <Collapsible key={cat.name} defaultOpen={catFailed > 0 || isRunning}>
              <Card>
                <CollapsibleTrigger className="w-full text-left">
                  <CardHeader className="flex flex-row items-center justify-between py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      {cat.icon} {cat.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={catFailed > 0 ? 'destructive' : catPassed === cat.tests.length && catPassed > 0 ? 'default' : 'secondary'}>
                        {catPassed}/{cat.tests.length}
                      </Badge>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-1 pt-0">
                    {cat.tests.map((test, ti) => (
                      <div
                        key={test.name}
                        id={`${cat.name}-${ti}`}
                        className="flex items-center justify-between py-2 px-2 border-b last:border-0 rounded hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{test.name}</span>
                          {test.message && (
                            <p className={`text-xs truncate ${test.status === 'fail' ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {test.message}
                            </p>
                          )}
                        </div>
                        {statusIcon(test.status)}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </AppLayout>
  );
}

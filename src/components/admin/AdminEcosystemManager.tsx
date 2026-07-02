import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, Building2, Calendar, Heart, User, Filter, X } from 'lucide-react';
import { StageBadge } from '@/components/ui/StageBadge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface EcosystemItem {
  workspace_id: string;
  startup_name: string;
  program_name: string | null;
  stage: string;
  status: string;
  health_score: string | number | null;
  assigned_consultant_name: string | null;
  assigned_consultant_id: string | null;
  next_session_date: string | null;
  last_checkin_date: string | null;
  created_at: string;
}

export function AdminEcosystemManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [consultantFilter, setConsultantFilter] = useState<string>('all');

  // Fetch unified ecosystem data
  const { data: ecosystemData, isLoading } = useQuery({
    queryKey: ['ecosystem-unified'],
    queryFn: async (): Promise<EcosystemItem[]> => {
      // Fetch workspaces with basic data only to avoid deep type recursion
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, stage, status, health_score, assigned_consultor_id, created_at, startup_id, program_id')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!workspaces || workspaces.length === 0) return [];

      const workspaceIds = workspaces.map(w => w.id);
      const startupIds = workspaces.map(w => w.startup_id).filter(Boolean) as string[];
      const programIds = [...new Set(workspaces.map(w => w.program_id).filter(Boolean))] as string[];
      const consultantIds = [...new Set(workspaces.map(w => w.assigned_consultor_id).filter(Boolean))] as string[];

      // Fetch related data in parallel
      const [startupsRes, programsRes, consultantsRes, sessionsRes, checkinsRes] = await Promise.all([
        startupIds.length > 0
          ? supabase.from('startups').select('id, name').in('id', startupIds)
          : Promise.resolve({ data: [] }),
        programIds.length > 0
          ? supabase.from('programs').select('id, name').in('id', programIds)
          : Promise.resolve({ data: [] }),
        consultantIds.length > 0
          ? supabase.from('profiles_safe').select('id, full_name').in('id', consultantIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('sessions')
          .select('workspace_id, scheduled_at')
          .in('workspace_id', workspaceIds)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('checkin_instances')
          .select('workspace_id, submitted_at')
          .in('workspace_id', workspaceIds)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false }),
      ]);

      const startupMap = new Map((startupsRes.data || []).map(s => [s.id, s.name]));
      const programMap = new Map((programsRes.data || []).map(p => [p.id, p.name]));
      const consultantMap = new Map((consultantsRes.data || []).map(c => [c.id, c.full_name]));

      const sessionMap: Record<string, string> = {};
      (sessionsRes.data || []).forEach(s => {
        if (!sessionMap[s.workspace_id]) {
          sessionMap[s.workspace_id] = s.scheduled_at;
        }
      });

      const checkinMap: Record<string, string> = {};
      (checkinsRes.data || []).forEach(c => {
        if (c.submitted_at && !checkinMap[c.workspace_id]) {
          checkinMap[c.workspace_id] = c.submitted_at;
        }
      });

      return workspaces.map(w => ({
        workspace_id: w.id,
        startup_name: startupMap.get(w.startup_id) || 'Unknown',
        program_name: w.program_id ? programMap.get(w.program_id) || null : null,
        stage: w.stage as string,
        status: w.status,
        health_score: w.health_score,
        assigned_consultant_name: w.assigned_consultor_id ? consultantMap.get(w.assigned_consultor_id) || null : null,
        assigned_consultant_id: w.assigned_consultor_id,
        next_session_date: sessionMap[w.id] || null,
        last_checkin_date: checkinMap[w.id] || null,
        created_at: w.created_at,
      }));
    },
  });

  // Fetch programs and consultants for filters
  const { data: programs } = useQuery({
    queryKey: ['programs-list'],
    queryFn: async () => {
      const { data } = await supabase.from('programs').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: consultants } = useQuery({
    queryKey: ['consultants-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name)')
        .eq('role', 'consultor');
      return (data || []).map(d => ({
        id: (d.profiles as any)?.id,
        name: (d.profiles as any)?.full_name,
      }));
    },
  });

  // Apply filters
  const filteredData = useMemo(() => {
    if (!ecosystemData) return [];
    
    return ecosystemData.filter(item => {
      const matchesSearch = search.trim() === '' ||
        item.startup_name.toLowerCase().includes(search.toLowerCase()) ||
        item.program_name?.toLowerCase().includes(search.toLowerCase());
      
      const matchesStage = stageFilter === 'all' || item.stage === stageFilter;
      const matchesProgram = programFilter === 'all' || item.program_name === programFilter;
      const matchesConsultant = consultantFilter === 'all' || item.assigned_consultant_id === consultantFilter;
      
      return matchesSearch && matchesStage && matchesProgram && matchesConsultant;
    });
  }, [ecosystemData, search, stageFilter, programFilter, consultantFilter]);

  const clearFilters = () => {
    setSearch('');
    setStageFilter('all');
    setProgramFilter('all');
    setConsultantFilter('all');
  };

  const healthScoreNum = (score: string | number | null): number => {
    if (score === null) return 0;
    if (typeof score === 'number') return score;
    return 0;
  };

  const hasActiveFilters = search || stageFilter !== 'all' || programFilter !== 'all' || consultantFilter !== 'all';

  const handleExport = () => {
    const csvContent = [
      ['Startup', 'Program', 'Stage', 'Status', 'Health Score', 'Consultant', 'Next Session', 'Last Check-in'].join(','),
      ...filteredData.map(item => [
        `"${item.startup_name}"`,
        `"${item.program_name || ''}"`,
        item.stage,
        item.status,
        item.health_score?.toString() || '',
        `"${item.assigned_consultant_name || ''}"`,
        item.next_session_date ? format(new Date(item.next_session_date), 'yyyy-MM-dd') : '',
        item.last_checkin_date ? format(new Date(item.last_checkin_date), 'yyyy-MM-dd') : '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosystem-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const stages = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('admin.ecosystem.title', 'Unified Ecosystem View')}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('common.export', 'Export')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search', 'Search...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allStages', 'Todos os Estágios')}</SelectItem>
              {stages.map(s => (
                <SelectItem key={s} value={s}>{t(`stages.${s}`, s.charAt(0).toUpperCase() + s.slice(1))}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allPrograms', 'Todos os Programas')}</SelectItem>
              {programs?.map(p => (
                <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={consultantFilter} onValueChange={setConsultantFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Consultant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allConsultants', 'Todos os Consultores')}</SelectItem>
              {consultants?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
             <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              {t('common.clear', 'Limpar')}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{filteredData.length} startups</span>
          <span>•</span>
          <span>{filteredData.filter(d => d.status === 'active').length} {t('common.active', 'ativos')}</span>
          <span>•</span>
          <span>{filteredData.filter(d => healthScoreNum(d.health_score) < 50 && d.health_score !== null).length} {t('common.needAttention', 'precisam de atenção')}</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('common.startup', 'Startup')}</TableHead>
                  <TableHead>{t('common.program', 'Programa')}</TableHead>
                  <TableHead>{t('common.stage', 'Fase')}</TableHead>
                  <TableHead>{t('common.health', 'Saúde')}</TableHead>
                  <TableHead>{t('common.consultant', 'Consultor')}</TableHead>
                  <TableHead>{t('sessions.nextSession', 'Próxima Sessão')}</TableHead>
                  <TableHead>{t('checkins.lastCheckin', 'Último Check-in')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('common.noStartupsFound', 'Sem startups encontradas')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map(item => (
                    <TableRow 
                      key={item.workspace_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/workspace/${item.workspace_id}`)}
                    >
                      <TableCell className="font-medium">{item.startup_name}</TableCell>
                      <TableCell>
                        {item.program_name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={item.stage as any} />
                      </TableCell>
                      <TableCell>
                        {item.health_score !== null ? (
                          <span className={`text-sm font-medium ${
                            healthScoreNum(item.health_score) >= 70 ? 'text-[hsl(var(--success))]' :
                            healthScoreNum(item.health_score) >= 50 ? 'text-[hsl(var(--warning))]' : 'text-destructive'
                          }`}>
                            {typeof item.health_score === 'number' ? item.health_score : '—'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.assigned_consultant_name ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {item.assigned_consultant_name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('common.unassigned', 'Não atribuído')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.next_session_date ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(item.next_session_date), 'MMM d')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.last_checkin_date ? (
                          format(new Date(item.last_checkin_date), 'MMM d')
                        ) : (
                          <span className="text-muted-foreground">{t('common.never', 'Nunca')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFundingRounds, useInvestors, useCapTable, useCreateFundingRound, useCreateInvestor, useCreateCapTableEntry, useDeleteInvestor, useDeleteCapTableEntry } from '@/hooks/useFunding';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { DollarSign, Users, PieChartIcon, Plus, Trash2, HelpCircle } from 'lucide-react';
import { notify } from "@/lib/notify";
import { useTranslation } from 'react-i18next';
import { QuickHelp } from '@/components/ui/GlossaryTooltip';

const ROUND_TYPES = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'bridge', 'convertible-note'];
const INVESTOR_TYPES = ['angel', 'vc', 'corporate', 'accelerator', 'family-office'];
const INVESTOR_STATUSES = ['prospect', 'contacted', 'interested', 'committed', 'passed'];
const HOLDER_TYPES = ['founder', 'investor', 'employee', 'advisor'];
const SHARE_TYPES = ['common', 'preferred', 'options', 'warrants'];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface FundingTrackerTabProps {
  startupId: string;
}

export function FundingTrackerTab({ startupId }: FundingTrackerTabProps) {
  const { t } = useTranslation();
  const [showRoundDialog, setShowRoundDialog] = useState(false);
  const [showInvestorDialog, setShowInvestorDialog] = useState(false);
  const [showCapTableDialog, setShowCapTableDialog] = useState(false);

  const { data: rounds, isLoading: loadingRounds } = useFundingRounds(startupId);
  const { data: investors, isLoading: loadingInvestors } = useInvestors(startupId);
  const { data: capTable, isLoading: loadingCapTable } = useCapTable(startupId);

  const createRound = useCreateFundingRound();
  const createInvestor = useCreateInvestor();
  const createCapEntry = useCreateCapTableEntry();
  const deleteInvestor = useDeleteInvestor();
  const deleteCapEntry = useDeleteCapTableEntry();

  const totalRaised = rounds?.reduce((sum, r) => sum + (r.raised_amount || 0), 0) || 0;
  const totalShares = capTable?.reduce((sum, e) => sum + e.shares, 0) || 0;
  const capTableData = capTable?.map(e => ({
    name: e.holder_name,
    value: e.shares,
    type: e.holder_type,
  })) || [];

  const handleCreateRound = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createRound.mutateAsync({
        startup_id: startupId,
        round_type: formData.get('round_type') as string,
        target_amount: Number(formData.get('target_amount')) || null,
        raised_amount: Number(formData.get('raised_amount')) || 0,
        valuation: Number(formData.get('valuation')) || null,
        status: formData.get('status') as string,
        notes: formData.get('notes') as string || null,
        announced_at: null,
        closed_at: null,
      });
      notify.success(t('funding.roundCreated'));
      setShowRoundDialog(false);
    } catch {
      notify.error(t('funding.failedToCreate'));
    }
  };

  const handleCreateInvestor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createInvestor.mutateAsync({
        startup_id: startupId,
        name: formData.get('name') as string,
        type: formData.get('type') as string,
        email: formData.get('email') as string || null,
        phone: null,
        website: formData.get('website') as string || null,
        status: formData.get('status') as string,
        notes: formData.get('notes') as string || null,
      });
      notify.success(t('funding.investorAdded'));
      setShowInvestorDialog(false);
    } catch {
      notify.error(t('funding.failedToAddInvestor'));
    }
  };

  const handleCreateCapEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createCapEntry.mutateAsync({
        startup_id: startupId,
        holder_name: formData.get('holder_name') as string,
        holder_type: formData.get('holder_type') as string,
        shares: Number(formData.get('shares')),
        share_type: formData.get('share_type') as string,
        investment_amount: Number(formData.get('investment_amount')) || null,
        funding_round_id: null,
        vesting_start: null,
        vesting_months: null,
        cliff_months: null,
        notes: null,
      });
      notify.success(t('funding.entryAdded'));
      setShowCapTableDialog(false);
    } catch {
      notify.error(t('funding.failedToAddEntry'));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Help bar for funding concepts */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground p-2 rounded-lg bg-muted/30">
        <span className="font-medium">{t('funding.concepts', 'Conceitos:')}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><QuickHelp term="capTable" /> Cap Table</span>
          <span className="inline-flex items-center gap-1"><QuickHelp term="dilution" /> {t('funding.dilution', { defaultValue: 'Diluição' })}</span>
          <span className="inline-flex items-center gap-1"><QuickHelp term="vesting" /> Vesting</span>
          <span className="inline-flex items-center gap-1"><QuickHelp term="preemption" /> Pre-emption</span>
        </div>
        <Link to="/help" className="ml-auto text-primary hover:underline">
          {t('funding.viewGlossary', 'Ver glossário')}
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t('funding.totalRaised')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRaised)}</div>
            <p className="text-xs text-muted-foreground">{t('funding.fundingRoundsCount', { count: rounds?.length || 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('funding.investors')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{investors?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {investors?.filter(i => i.status === 'committed').length || 0} {t('funding.committed')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              {t('funding.shareholders')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{capTable?.length || 0}</div>
            <p className="text-xs text-muted-foreground">{totalShares.toLocaleString()} {t('funding.shares')}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rounds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rounds">{t('funding.rounds')}</TabsTrigger>
          <TabsTrigger value="investors">{t('funding.investors')}</TabsTrigger>
          <TabsTrigger value="captable">{t('funding.capTable')}</TabsTrigger>
        </TabsList>

        {/* Funding Rounds */}
        <TabsContent value="rounds" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{t('funding.rounds')}</h3>
            <Button onClick={() => setShowRoundDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" /> {t('funding.addRound')}
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('funding.roundType')}</TableHead>
                  <TableHead>{t('funding.targetAmount')}</TableHead>
                  <TableHead>{t('funding.raisedAmount')}</TableHead>
                  <TableHead>{t('funding.progress')}</TableHead>
                  <TableHead>{t('funding.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRounds ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">{t('common.loading')}</TableCell></TableRow>
                ) : !rounds?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-sm text-muted-foreground mb-3">{t('funding.noRounds')}</p>
                      <Button size="sm" variant="outline" onClick={() => setShowRoundDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />{t('funding.addRound')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : rounds.map(round => (
                  <TableRow key={round.id}>
                    <TableCell className="font-medium capitalize">{round.round_type.replace('-', ' ')}</TableCell>
                    <TableCell>{round.target_amount ? formatCurrency(round.target_amount) : '-'}</TableCell>
                    <TableCell>{formatCurrency(round.raised_amount || 0)}</TableCell>
                    <TableCell className="w-32">
                      {round.target_amount ? (
                        <Progress value={((round.raised_amount || 0) / round.target_amount) * 100} className="h-2" />
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={round.status === 'closed' ? 'default' : round.status === 'active' ? 'secondary' : 'outline'}>
                        {round.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Investors */}
        <TabsContent value="investors" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{t('funding.investorPipeline')}</h3>
            <Button onClick={() => setShowInvestorDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" /> {t('funding.addInvestor')}
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('funding.name')}</TableHead>
                  <TableHead>{t('funding.type')}</TableHead>
                  <TableHead>{t('funding.status')}</TableHead>
                  <TableHead>{t('funding.contact')}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInvestors ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">{t('common.loading')}</TableCell></TableRow>
                ) : !investors?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-sm text-muted-foreground mb-3">{t('funding.noInvestors')}</p>
                      <Button size="sm" variant="outline" onClick={() => setShowInvestorDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />{t('funding.addInvestor')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : investors.map(investor => (
                  <TableRow key={investor.id}>
                    <TableCell className="font-medium">{investor.name}</TableCell>
                    <TableCell className="capitalize">{investor.type}</TableCell>
                    <TableCell>
                      <Badge variant={
                        investor.status === 'committed' ? 'default' :
                        investor.status === 'interested' ? 'secondary' :
                        investor.status === 'passed' ? 'destructive' : 'outline'
                      }>
                        {investor.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{investor.email || '-'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteInvestor.mutate(investor.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Cap Table */}
        <TabsContent value="captable" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{t('funding.capTable')}</h3>
            <Button onClick={() => setShowCapTableDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" /> {t('funding.addEntry')}
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('funding.holder')}</TableHead>
                    <TableHead>{t('funding.type')}</TableHead>
                    <TableHead>{t('funding.shares')}</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingCapTable ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">{t('common.loading')}</TableCell></TableRow>
                  ) : !capTable?.length ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('funding.noCapTable')}</TableCell></TableRow>
                  ) : capTable.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.holder_name}</TableCell>
                      <TableCell className="capitalize">{entry.holder_type}</TableCell>
                      <TableCell>{entry.shares.toLocaleString()}</TableCell>
                      <TableCell>{totalShares > 0 ? ((entry.shares / totalShares) * 100).toFixed(1) : 0}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteCapEntry.mutate(entry.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            {capTableData.length > 0 && (
              <Card className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={capTableData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {capTableData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => value.toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('funding.addFundingRound')}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateRound} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('funding.roundType')}</Label>
              <Select name="round_type" defaultValue="seed">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUND_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('-', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('funding.targetAmount')} (€)</Label>
                <Input name="target_amount" type="number" placeholder="500000" />
              </div>
              <div className="space-y-2">
                <Label>{t('funding.raisedAmount')} (€)</Label>
                <Input name="raised_amount" type="number" placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('funding.valuation')} (€)</Label>
              <Input name="valuation" type="number" placeholder="2000000" />
            </div>
            <div className="space-y-2">
              <Label>{t('funding.status')}</Label>
              <Select name="status" defaultValue="planning">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">{t('funding.planning')}</SelectItem>
                  <SelectItem value="active">{t('okrs.active')}</SelectItem>
                  <SelectItem value="closed">{t('funding.closed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('funding.notes')}</Label>
              <Textarea name="notes" placeholder={t('documents.descriptionPlaceholder')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowRoundDialog(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createRound.isPending}>{t('common.create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvestorDialog} onOpenChange={setShowInvestorDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('funding.addInvestor')}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateInvestor} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('funding.name')} *</Label>
              <Input name="name" required placeholder="Investor or firm name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('funding.type')}</Label>
                <Select name="type" defaultValue="angel">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVESTOR_TYPES.map(tp => <SelectItem key={tp} value={tp} className="capitalize">{tp.replace('-', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('funding.status')}</Label>
                <Select name="status" defaultValue="prospect">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVESTOR_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('team.email')}</Label>
              <Input name="email" type="email" placeholder="contact@investor.com" />
            </div>
            <div className="space-y-2">
              <Label>{t('funding.website')}</Label>
              <Input name="website" placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>{t('funding.notes')}</Label>
              <Textarea name="notes" placeholder={t('documents.descriptionPlaceholder')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvestorDialog(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createInvestor.isPending}>{t('funding.addInvestor')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCapTableDialog} onOpenChange={setShowCapTableDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('funding.addCapTableEntry')}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateCapEntry} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('funding.holderName')} *</Label>
              <Input name="holder_name" required placeholder="Name of shareholder" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('funding.holderType')}</Label>
                <Select name="holder_type" defaultValue="founder">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOLDER_TYPES.map(tp => <SelectItem key={tp} value={tp} className="capitalize">{tp}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('funding.shareType')}</Label>
                <Select name="share_type" defaultValue="common">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHARE_TYPES.map(tp => <SelectItem key={tp} value={tp} className="capitalize">{tp}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('funding.shares')} *</Label>
                <Input name="shares" type="number" required placeholder="10000" />
              </div>
              <div className="space-y-2">
                <Label>{t('funding.investmentAmount')} (€)</Label>
                <Input name="investment_amount" type="number" placeholder="50000" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCapTableDialog(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createCapEntry.isPending}>{t('funding.addEntry')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

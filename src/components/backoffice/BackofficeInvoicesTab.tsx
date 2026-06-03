import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Receipt, Search, Plus, CreditCard, AlertTriangle } from 'lucide-react';
import { useInvoices, useUpdateInvoice, useRecordPayment, type Invoice } from '@/hooks/useBackoffice';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  refunded: { label: 'Refunded', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

export function BackofficeInvoicesTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { data: invoices, isLoading } = useInvoices(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );
  const updateInvoice = useUpdateInvoice();
  const recordPayment = useRecordPayment();

  const today = new Date();

  const filteredInvoices = invoices?.filter(inv => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    const startupName = (inv.workspace as any)?.startup?.name?.toLowerCase() || '';
    const invoiceNum = inv.invoice_number?.toLowerCase() || '';
    return startupName.includes(search) || invoiceNum.includes(search);
  });

  const handleRecordPayment = async (formData: FormData) => {
    if (!selectedInvoice) return;

    await recordPayment.mutateAsync({
      invoice_id: selectedInvoice.id,
      workspace_id: selectedInvoice.workspace_id,
      amount: parseFloat(formData.get('amount') as string),
      payment_date: formData.get('payment_date') as string,
      payment_method: formData.get('payment_method') as string,
      reference: formData.get('reference') as string || null,
      recorded_by: user?.id,
    });

    // Mark invoice as paid
    await updateInvoice.mutateAsync({
      id: selectedInvoice.id,
      status: 'paid',
      paid_at: new Date().toISOString(),
    });

    setPaymentDialogOpen(false);
    setSelectedInvoice(null);
  };

  // Stats
  const stats = {
    total: invoices?.length || 0,
    pending: invoices?.filter(i => i.status === 'sent').length || 0,
    overdue: invoices?.filter(i => i.status === 'overdue' || (i.status === 'sent' && new Date(i.due_date) < today)).length || 0,
    outstanding: invoices
      ?.filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.total, 0) || 0,
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">{t('admin.backoffice.totalInvoices')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">{t('admin.backoffice.pendingPayment')}</p>
          </CardContent>
        </Card>
        <Card className={cn(stats.overdue > 0 && 'border-amber-500/50')}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600 flex items-center gap-1">
              {stats.overdue}
              {stats.overdue > 0 && <AlertTriangle className="h-4 w-4" />}
            </div>
            <p className="text-xs text-muted-foreground">{t('admin.backoffice.overdueInvoices')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">€{stats.outstanding.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{t('admin.backoffice.totalOutstanding')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.backoffice.searchInvoices')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('admin.backoffice.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.backoffice.allStatuses')}</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t('admin.backoffice.invoices')}
            <Badge variant="secondary" className="ml-2">{filteredInvoices?.length || 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.backoffice.invoiceNumber')}</TableHead>
                  <TableHead>{t('admin.backoffice.startup')}</TableHead>
                  <TableHead>{t('admin.backoffice.issueDate')}</TableHead>
                  <TableHead>{t('admin.backoffice.dueDate')}</TableHead>
                  <TableHead>{t('admin.backoffice.status')}</TableHead>
                  <TableHead className="text-right">{t('admin.backoffice.total')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices?.map(invoice => {
                  const startup = (invoice.workspace as any)?.startup;
                  const dueDate = new Date(invoice.due_date);
                  const isOverdue = invoice.status === 'sent' && dueDate < today;
                  const daysOverdue = isOverdue ? differenceInDays(today, dueDate) : 0;
                  const displayStatus = isOverdue ? 'overdue' : invoice.status;
                  const statusConfig = STATUS_CONFIG[displayStatus];

                  return (
                    <TableRow key={invoice.id} className={cn(isOverdue && 'bg-amber-50/50 dark:bg-amber-900/10')}>
                      <TableCell className="font-medium font-mono">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>{startup?.name || 'Unnamed'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(invoice.issue_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className={cn(isOverdue && 'text-amber-600 font-medium')}>
                          {format(dueDate, 'dd MMM yyyy')}
                          {isOverdue && ` (${daysOverdue}d)`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs', statusConfig?.className)}>
                          {statusConfig?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{invoice.total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {(invoice.status === 'sent' || isOverdue) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <CreditCard className="h-3 w-3 mr-1" />
                            {t('admin.backoffice.recordPayment')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredInvoices?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {t('admin.backoffice.noInvoices')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.backoffice.recordPayment')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRecordPayment(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('admin.backoffice.invoiceNumber')}</Label>
              <Input value={selectedInvoice?.invoice_number || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.amount')}</Label>
              <Input
                type="number"
                step="0.01"
                name="amount"
                defaultValue={selectedInvoice?.total || 0}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.paymentDate')}</Label>
              <Input
                type="date"
                name="payment_date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.paymentMethod')}</Label>
              <Select name="payment_method" defaultValue="bank_transfer">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t('admin.backoffice.bankTransfer')}</SelectItem>
                  <SelectItem value="card">{t('admin.backoffice.card')}</SelectItem>
                  <SelectItem value="cash">{t('admin.backoffice.cash')}</SelectItem>
                  <SelectItem value="other">{t('admin.backoffice.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.reference')}</Label>
              <Input
                name="reference"
                placeholder={t('admin.backoffice.referencePlaceholder')}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={updateInvoice.isPending}>
                {t('admin.backoffice.confirmPayment')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

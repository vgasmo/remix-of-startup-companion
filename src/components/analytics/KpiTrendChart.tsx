import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, subMonths, startOfMonth } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Target, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface KpiTrendChartProps {
  data: Array<{ month: string; value: number | null; label: string }>;
  targetValue?: number | null;
  unit?: string;
  direction?: 'up' | 'down';
  kpiName: string;
}

export function KpiTrendChart({ data, targetValue, unit, direction = 'up', kpiName }: KpiTrendChartProps) {
  const { t } = useTranslation();
  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      displayValue: d.value,
    }));
  }, [data]);

  const { trend, trendPercent, currentValue, previousValue } = useMemo(() => {
    const validValues = data.filter(d => d.value !== null);
    if (validValues.length < 2) {
      return { trend: 'flat' as const, trendPercent: 0, currentValue: null, previousValue: null };
    }
    
    const current = validValues[validValues.length - 1].value!;
    const previous = validValues[validValues.length - 2].value!;
    const percent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
    
    return {
      trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
      trendPercent: Math.abs(percent),
      currentValue: current,
      previousValue: previous,
    };
  }, [data]);

  const isGoodTrend = direction === 'up' ? trend === 'up' : direction === 'down' ? trend === 'down' : true;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const formatValue = (val: number | null) => {
    if (val === null) return '-';
    if (unit === '%') return `${val.toFixed(1)}%`;
    if (unit === '€' || unit === '$') {
      if (val >= 1000000) return `${unit}${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${unit}${(val / 1000).toFixed(0)}k`;
      return `${unit}${val.toFixed(0)}`;
    }
    return val.toLocaleString();
  };

  // Check if below target
  const isBelowTarget = targetValue !== null && targetValue !== undefined && currentValue !== null && (
    direction === 'up' ? currentValue < targetValue : currentValue > targetValue
  );

  return (
    <Card className={isBelowTarget ? 'border-[hsl(var(--warning))]/30' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium truncate">{kpiName}</CardTitle>
          {trend !== 'flat' && (
            <div className={`flex items-center gap-1 text-xs ${isGoodTrend ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{trendPercent.toFixed(0)}%</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-2xl font-bold">{formatValue(currentValue)}</p>
            {targetValue !== null && targetValue !== undefined && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Target className="h-3 w-3" />
                <span>Target: {formatValue(targetValue)}</span>
                {isBelowTarget && <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning))] ml-1" />}
              </div>
            )}
          </div>
          {previousValue !== null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('common.previous', 'Previous')}</p>
              <p className="text-sm font-medium">{formatValue(previousValue)}</p>
            </div>
          )}
        </div>
        
        <div className="h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${kpiName}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isGoodTrend ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isGoodTrend ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0].value as number;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-semibold">{formatValue(value)}</p>
                    </div>
                  );
                }}
              />
              {targetValue !== null && targetValue !== undefined && (
                <ReferenceLine 
                  y={targetValue} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="displayValue"
                stroke={isGoodTrend ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                strokeWidth={2}
                fill={`url(#gradient-${kpiName})`}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

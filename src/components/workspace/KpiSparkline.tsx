import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface KpiSparklineProps {
  data: { value: number | null; label: string }[];
  height?: number;
  width?: number;
  color?: string;
  showTooltip?: boolean;
}

/**
 * Lightweight SVG sparkline for KPI trend visualization.
 * No external chart library needed.
 */
export function KpiSparkline({
  data,
  height = 24,
  width = 80,
  color = 'currentColor',
  showTooltip = true,
}: KpiSparklineProps) {
  const { path, points, hasData, minVal, maxVal } = useMemo(() => {
    const validData = data.filter(d => d.value !== null) as { value: number; label: string }[];
    
    if (validData.length < 2) {
      return { path: '', points: [], hasData: false, minVal: 0, maxVal: 0 };
    }

    const values = validData.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = validData.map((d, i) => ({
      x: padding + (i / (validData.length - 1)) * chartWidth,
      y: padding + chartHeight - ((d.value - minVal) / range) * chartHeight,
      value: d.value,
      label: d.label,
    }));

    const pathData = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    return { path: pathData, points, hasData: true, minVal, maxVal };
  }, [data, height, width]);

  if (!hasData) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground/30"
        style={{ width, height }}
      >
        <svg width={width} height={height} className="opacity-30">
          <line
            x1="4"
            y1={height / 2}
            x2={width - 4}
            y2={height / 2}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        </svg>
      </div>
    );
  }

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const trend = lastPoint && firstPoint ? lastPoint.value - firstPoint.value : 0;
  const trendColor = trend > 0 ? 'text-[hsl(var(--success))]' : trend < 0 ? 'text-destructive' : 'text-muted-foreground';

  const sparkline = (
    <svg
      width={width}
      height={height}
      className={`${trendColor} transition-colors`}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Gradient fill under the line */}
      <defs>
        <linearGradient id={`sparkline-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      {points.length > 1 && (
        <path
          d={`${path} L ${points[points.length - 1].x} ${height - 2} L ${points[0].x} ${height - 2} Z`}
          fill={`url(#sparkline-grad-${color})`}
        />
      )}
      
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* End dot */}
      {lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2"
          fill={color}
        />
      )}
    </svg>
  );

  if (!showTooltip) return sparkline;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{sparkline}</div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-1">
          <div className="font-medium">
            {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'} {trend > 0 ? '+' : ''}{trend.toFixed(1)}
          </div>
          <div className="text-muted-foreground">
            {firstPoint?.label} → {lastPoint?.label}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

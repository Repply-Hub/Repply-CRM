import { TooltipProps } from 'recharts';

interface CustomTooltipProps extends TooltipProps<number, string> {
  valuePrefix?: string;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
}

export function ChartTooltip({ active, payload, label, formatValue }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-popover-foreground mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-popover-foreground">
            {formatValue
              ? formatValue(entry.value as number)
              : (entry.value as number).toLocaleString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  );
}

export const chartColors = {
  primary: 'hsl(var(--primary))',
  primaryLight: 'hsl(var(--primary) / 0.15)',
  success: 'hsl(var(--success))',
  successLight: 'hsl(var(--success) / 0.15)',
  warning: 'hsl(var(--warning))',
  warningLight: 'hsl(var(--warning) / 0.15)',
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
};

export const commonAxisProps = {
  tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
  axisLine: { stroke: 'hsl(var(--border))', strokeWidth: 1 },
  tickLine: false,
};

export const commonGridProps = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border) / 0.6)',
  vertical: false,
};

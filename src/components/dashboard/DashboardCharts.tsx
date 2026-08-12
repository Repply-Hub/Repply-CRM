import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell,
  Tooltip, Area, AreaChart,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { TrendingUp, Factory } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/DashboardChartTooltip';

// Componente carregado via React.lazy a partir de Dashboard.tsx — o recharts (e os
// módulos d3-* que ele traz junto) é de longe o maior pedaço de código dessa
// página, então isolar todo o código que depende dele aqui evita que os cards de
// KPI (que não usam gráfico nenhum) fiquem esperando esse bundle inteiro baixar e
// ser interpretado antes de aparecer na tela.

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Fábricas além desse número entram agrupadas na fatia "Outros" da pizza de
// faturamento — nenhuma fica de fora do gráfico, só sai da lista principal.
const TOP_N_FABRICAS_PIZZA = 5;

interface FabricaPizzaSlice {
  fabrica: string;
  valor: number;
  outrosDetalhe?: { fabrica: string; valor: number }[];
}

function FabricaPizzaTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as FabricaPizzaSlice | undefined;
  if (!data) return null;

  if (data.outrosDetalhe && data.outrosDetalhe.length > 0) {
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[240px]">
        <p className="font-semibold text-popover-foreground mb-1.5">Outros — {formatCurrency(data.valor)}</p>
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {data.outrosDetalhe.map((f) => (
            <div key={f.fabrica} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground truncate">{f.fabrica}</span>
              <span className="font-semibold text-popover-foreground shrink-0">{formatCurrency(f.valor)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-popover-foreground">{data.fabrica}</p>
      <p className="text-muted-foreground">{formatCurrency(data.valor)}</p>
    </div>
  );
}

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 1.35;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
};

// Recharts quebra o texto do tick em várias linhas quando ele não cabe na
// largura reservada pro eixo — usamos um tick em SVG puro (sem a prop
// `width`, que é o que dispara esse word-wrap) e calculamos a largura do
// eixo a partir do nome mais longo (getVendedorNameWidth/vendedorAxisWidth
// abaixo), então o nome completo sempre cabe numa linha só.
const renderVendedorTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
  <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
    {payload?.value ?? ''}
  </text>
);

const VENDEDOR_TICK_FONT = '11px Inter, system-ui, sans-serif';
let vendedorMeasureCtx: CanvasRenderingContext2D | null | undefined;
function getVendedorNameWidth(nome: string) {
  if (vendedorMeasureCtx === undefined) {
    vendedorMeasureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!vendedorMeasureCtx) return nome.length * 6.5; // fallback caso o canvas não esteja disponível
  vendedorMeasureCtx.font = VENDEDOR_TICK_FONT;
  return vendedorMeasureCtx.measureText(nome).width;
}

interface DashboardChartsProps {
  faturamentoData: { mes: string; valor: number }[];
  segmentacao: { name: string; value: number; color: string }[];
  conversaoVendedor: { nome: string; conversao: number; id: string | null }[];
  rendimentoFabrica: { fabrica: string; valor: number }[];
  rendimentoVendedor: { vendedor: string; valor: number }[];
}

export function DashboardCharts({
  faturamentoData,
  segmentacao,
  conversaoVendedor,
  rendimentoFabrica,
  rendimentoVendedor,
}: DashboardChartsProps) {
  const [fabricaSort, setFabricaSort] = useState<'maior' | 'menor'>('maior');

  const rendimentoFabricaSorted = useMemo(() => {
    return [...rendimentoFabrica].sort((a, b) => fabricaSort === 'maior' ? b.valor - a.valor : a.valor - b.valor);
  }, [rendimentoFabrica, fabricaSort]);

  // Largura do eixo calculada a partir do nome mais longo, para o YAxis
  // sempre reservar espaço suficiente e o nome do vendedor nunca quebrar linha.
  const vendedorAxisWidth = useMemo(() => {
    const maxWidth = conversaoVendedor.reduce(
      (max, v) => Math.max(max, getVendedorNameWidth(v.nome ?? '')),
      0,
    );
    return Math.max(80, Math.ceil(maxWidth) + 12);
  }, [conversaoVendedor]);

  // Mostra todas as fábricas na pizza — sem cortar as menores, só agrupa o
  // excedente em "Outros" (com o detalhe de cada uma disponível no hover via
  // FabricaPizzaTooltip) em vez de escondê-las por completo do gráfico.
  const faturamentoPorFabricaPizza = useMemo(() => {
    const sorted = [...rendimentoFabrica].sort((a, b) => b.valor - a.valor);
    if (sorted.length <= TOP_N_FABRICAS_PIZZA) return sorted;
    const top = sorted.slice(0, TOP_N_FABRICAS_PIZZA);
    const outros = sorted.slice(TOP_N_FABRICAS_PIZZA);
    const outrosTotal = outros.reduce((acc, f) => acc + f.valor, 0);
    return [...top, { fabrica: 'Outros', valor: outrosTotal, outrosDetalhe: outros }];
  }, [rendimentoFabrica]);

  return (
    <>
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Faturamento - Area Chart */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Faturamento Mensal</CardTitle>
            <CardDescription className="text-xs">Evolução do faturamento ao longo do período</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={faturamentoData}>
                <defs>
                  <linearGradient id="gradientFaturamento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.primary} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...commonGridProps} />
                <XAxis dataKey="mes" {...commonAxisProps} />
                <YAxis {...commonAxisProps} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip formatValue={formatCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="valor"
                  name="Faturamento"
                  stroke={chartColors.primary}
                  strokeWidth={2.5}
                  fill="url(#gradientFaturamento)"
                  dot={{ fill: chartColors.primary, r: 4, strokeWidth: 2, stroke: chartColors.card }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: chartColors.card, fill: chartColors.primary }}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Segmentação - Donut */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Segmentação por Ticket</CardTitle>
            <CardDescription className="text-xs">Distribuição dos negócios por faixa de valor</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={segmentacao}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  dataKey="value"
                  label={renderCustomLabel}
                  paddingAngle={3}
                  cornerRadius={4}
                  animationDuration={1000}
                  animationEasing="ease-out"
                >
                  {segmentacao.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  content={<ChartTooltip formatValue={(v) => `${v} negócio(s)`} />}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-5">
        {/* Conversão por Vendedor */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Conversão por Vendedor</CardTitle>
            <CardDescription className="text-xs">Taxa de fechamento individual</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conversaoVendedor} layout="vertical" barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradientConversao" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartColors.success} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={chartColors.success} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...commonAxisProps} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="nome" type="category" {...commonAxisProps} width={vendedorAxisWidth} tick={renderVendedorTick} />
                <Tooltip content={<ChartTooltip formatValue={(v) => `${v}%`} />} />
                <Bar
                  dataKey="conversao"
                  name="Conversão"
                  fill="url(#gradientConversao)"
                  radius={[0, 8, 8, 0]}
                  animationDuration={1000}
                  animationEasing="ease-out"
                  background={{ fill: chartColors.primaryLight, radius: 8 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Rendimento Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Faturamento por Fábrica - Donut Chart */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" /> Faturamento por Fábrica
            </CardTitle>
            <CardDescription className="text-xs">Distribuição do faturamento por fabricante — os menores ficam agrupados em "Outros" (passe o mouse para detalhar)</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={faturamentoPorFabricaPizza}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  dataKey="valor"
                  nameKey="fabrica"
                  label={renderCustomLabel}
                  paddingAngle={3}
                  cornerRadius={4}
                  animationDuration={1000}
                  animationEasing="ease-out"
                >
                  {faturamentoPorFabricaPizza.map((slice, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        slice.fabrica === 'Outros'
                          ? chartColors.muted
                          : [
                              chartColors.primary,
                              chartColors.success,
                              chartColors.warning,
                              'hsl(24, 100%, 47%)',
                              'hsl(280, 65%, 60%)'
                            ][idx % 5]
                      }
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<FabricaPizzaTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rendimento por Fábrica - Bar Chart */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" /> Rendimento por Fábrica
                </CardTitle>
                <CardDescription className="text-xs">Faturamento fechado por fabricante</CardDescription>
              </div>
              <Select value={fabricaSort} onValueChange={(v) => setFabricaSort(v as 'maior' | 'menor')}>
                <SelectTrigger className="h-8 w-fit max-w-full shrink-0 whitespace-nowrap text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maior">Maior</SelectItem>
                  <SelectItem value="menor">Menor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rendimentoFabricaSorted} layout="vertical" barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradientRendimento" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartColors.primary} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={chartColors.primary} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                <XAxis type="number" {...commonAxisProps} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="fabrica" type="category" {...commonAxisProps} width={100} />
                <Tooltip content={<ChartTooltip formatValue={formatCurrency} />} />
                <Bar
                  dataKey="valor"
                  name="Rendimento"
                  fill="url(#gradientRendimento)"
                  radius={[0, 8, 8, 0]}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rendimento por Responsável */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Rendimento por Responsável
            </CardTitle>
            <CardDescription className="text-xs">Faturamento fechado por responsável</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rendimentoVendedor} layout="vertical" barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradientRendimentoVendedor" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartColors.success} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={chartColors.success} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                <XAxis type="number" {...commonAxisProps} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="vendedor" type="category" {...commonAxisProps} width={100} />
                <Tooltip content={<ChartTooltip formatValue={formatCurrency} />} />
                <Bar
                  dataKey="valor"
                  name="Rendimento"
                  fill="url(#gradientRendimentoVendedor)"
                  radius={[0, 8, 8, 0]}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default DashboardCharts;

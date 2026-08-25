import { useMemo } from 'react';
import { AlertTriangle, CalendarX, Factory, ShieldAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/DashboardChartTooltip';
import { formatarMoedaBRL } from '@/lib/moeda';
import { useDashboardNegociosRisco } from '@/hooks/use-dashboard';

/**
 * Radar de Risco — negócios ABERTOS parados ou sem próxima ação agendada.
 *
 * 🔴 ESTE BLOCO NASCEU NO DASHBOARD E FOI MOVIDO PARA A TELA "HOJE" em 25/08/2026, por
 * decisão do dono do produto. Não foi copiado: saiu de lá. Manter os dois lugares faria a
 * mesma pergunta ter duas respostas na mesma sessão de trabalho.
 *
 * Os gráficos, as cores, as fórmulas e o comportamento são os MESMOS de antes — a extração
 * foi textual de propósito. A definição de cada condição vive na função de banco
 * `dashboard_negocios_risco` (migration 20260824220000).
 *
 * SEM FILTRO DE PERÍODO, e isso é deliberado: um negócio aberto criado há meses continua
 * sendo risco hoje. Filtrar por data de criação ou de fechamento esconderia justamente os
 * mais antigos parados, que são os que mais importa achar. Ver o comentário de
 * `useDashboardNegociosRisco`.
 */

const RADIAN = Math.PI / 180;

/**
 * O rótulo de fora da pizza. Tipado à mão porque o Recharts não exporta o tipo destas
 * props — no Dashboard isto era `any`, e copiar o `any` junto com o resto seria trazer o
 * defeito de brinde.
 */
interface RotuloDaPizza {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: RotuloDaPizza) => {
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

// Recharts quebra o texto do tick em várias linhas quando ele não cabe na largura reservada
// pro eixo — tick em SVG puro (sem a prop `width`, que é o que dispara o word-wrap) e a
// largura do eixo calculada a partir do nome mais longo.
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

const formatCurrency = formatarMoedaBRL;

interface Props {
  empresaId?: string;
}

export function RadarDeRisco({ empresaId }: Props) {
  const { data: bruto } = useDashboardNegociosRisco(empresaId);

  const risco = useMemo(() => ({
    qtdParados: bruto?.qtd_parados ?? 0,
    valorParados: bruto?.valor_parados ?? 0,
    qtdSemProximaAcao: bruto?.qtd_sem_proxima_acao ?? 0,
    valorSemProximaAcao: bruto?.valor_sem_proxima_acao ?? 0,
    valorRiscoTotal: bruto?.valor_risco_total ?? 0,
    // A RPC já devolve [] pra quem não é gestor — nada a filtrar aqui.
    riscoPorVendedor: bruto?.risco_por_vendedor ?? [],
    riscoPorFabricante: bruto?.risco_por_fabricante ?? [],
  }), [bruto]);

  const riscoVendedorAxisWidth = useMemo(() => {
    const maxWidth = risco.riscoPorVendedor.reduce(
      (max, v) => Math.max(max, getVendedorNameWidth(v.vendedor ?? '')),
      0,
    );
    return Math.max(80, Math.ceil(maxWidth) + 12);
  }, [risco.riscoPorVendedor]);

  return (
    <section className="mt-10 border-t border-border pt-8">
      <header className="mb-1">
        <h2 className="text-lg font-semibold text-card-foreground">No geral</h2>
        <p className="text-sm text-muted-foreground">
          A carteira da empresa inteira. É a foto de agora — não depende de período.
        </p>
      </header>
    {/* Radar de Risco — negócios ABERTOS (nem ganhos nem perdidos) parados ou sem
        próxima ação agendada. Ver useDashboardNegociosRisco e a migration
        20260824220000_dashboard_negocios_risco.sql para a definição exata de cada
        condição. Sem filtro de Período de propósito: um negócio antigo parado
        continua sendo risco hoje mesmo fora da janela de data escolhida no topo. */}
    <div className="mt-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Negócios Parados</p>
                <p className="text-2xl font-extrabold text-card-foreground tracking-tight">{risco.qtdParados}</p>
                <span className="text-xs font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]">
                  {formatCurrency(risco.valorParados)}
                </span>
              </div>
              <div className="h-11 w-11 rounded-xl bg-[hsl(var(--warning)/0.1)] flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sem Próxima Ação</p>
                <p className="text-2xl font-extrabold text-card-foreground tracking-tight">{risco.qtdSemProximaAcao}</p>
                <span className="text-xs font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]">
                  {formatCurrency(risco.valorSemProximaAcao)}
                </span>
              </div>
              <div className="h-11 w-11 rounded-xl bg-[hsl(var(--warning)/0.1)] flex items-center justify-center">
                <CalendarX className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Valor em Risco</p>
                <p className="text-2xl font-extrabold text-card-foreground tracking-tight">{formatCurrency(risco.valorRiscoTotal)}</p>
                <span className="text-xs text-muted-foreground">Parado ou sem próxima ação</span>
              </div>
              <div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Risco por Vendedor — só aparece pra gestor/admin: a RPC já devolve o array
            vazio pra quem não é (ver comentário de risco.riscoPorVendedor). */}
        {risco.riscoPorVendedor.length > 0 && (
          <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" /> Risco por Vendedor
              </CardTitle>
              <CardDescription className="text-xs">Valor em risco entre os negócios de cada responsável</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={risco.riscoPorVendedor} layout="vertical" barCategoryGap="20%">
                  <defs>
                    <linearGradient id="gradientRiscoVendedor" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={chartColors.warning} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={chartColors.warning} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                  <XAxis type="number" {...commonAxisProps} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="vendedor" type="category" {...commonAxisProps} width={riscoVendedorAxisWidth} tick={renderVendedorTick} interval={0} />
                  <Tooltip content={<ChartTooltip formatValue={formatCurrency} />} />
                  <Bar
                    dataKey="valor"
                    name="Valor em risco"
                    fill="url(#gradientRiscoVendedor)"
                    radius={[0, 8, 8, 0]}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className={`shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300 ${risco.riscoPorVendedor.length > 0 ? '' : 'lg:col-span-2'}`}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Factory className="h-4 w-4 text-[hsl(var(--warning))]" /> Risco por Fábrica
            </CardTitle>
            <CardDescription className="text-xs">Valor em risco entre os negócios de cada fabricante</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={risco.riscoPorFabricante}
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
                  {risco.riscoPorFabricante.map((_, idx) => (
                    <Cell
                      key={`cell-risco-${idx}`}
                      fill={[chartColors.warning, 'hsl(24, 100%, 47%)', chartColors.muted, 'hsl(280, 65%, 60%)', chartColors.primary][idx % 5]}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatValue={formatCurrency} />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
    </section>
  );
}

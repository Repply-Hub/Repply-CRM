import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell,
  Tooltip, Area, AreaChart,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { TrendingUp, Factory, MessageCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/DashboardChartTooltip';
import { formatarMoedaBRL } from '@/lib/moeda';

// Componente carregado via React.lazy a partir de Dashboard.tsx — o recharts (e os
// módulos d3-* que ele traz junto) é de longe o maior pedaço de código dessa
// página, então isolar todo o código que depende dele aqui evita que os cards de
// KPI (que não usam gráfico nenhum) fiquem esperando esse bundle inteiro baixar e
// ser interpretado antes de aparecer na tela.

// Uma cópia a menos das 26 espalhadas pelo sistema — mesmo resultado, agora
// vindo de src/lib/moeda.ts.
const formatCurrency = formatarMoedaBRL;

// Eixo mostra só o tick redondo que o recharts já calcula (0/25/50/75/100) —
// sem casas decimais, pra não competir por espaço com os outros ticks. O
// tooltip mostra o valor real por trás da barra (ex.: 70,588235...%), que sem
// arredondar vira uma dízima ilegível — 1 casa decimal com vírgula pt-BR é
// precisão suficiente pra comparar vendedores sem virar ruído visual.
const formatPercentTick = (v: number) => `${Math.round(v)}%`;
const formatPercentTooltip = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Tempo médio de resposta vem em minutos (fracionários) da RPC — acima de 1h vira
// "Xh Ymin" pra não mostrar "87 min" num painel pensado pra leitura rápida pelo gestor.
const formatMinutos = (v: number) => {
  if (v >= 60) {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
};
const formatMinutosTick = (v: number) => (v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}min`);

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
  // O Radar de Risco saiu daqui em 25/08/2026 e virou `components/pauta/RadarDeRisco.tsx`,
  // renderizado na tela "Hoje" — decisão do dono do produto. Não foi copiado: foi movido,
  // para a mesma pergunta não ter duas respostas.
  // null = não-gestor: seção de atendimento WhatsApp inteira fica oculta (métrica
  // pensada pra gestor/admin acompanhar a equipe, não o desempenho individual).
  // Também vem null quando a empresa não contratou a seção WhatsApp. Essa decisão mora
  // inteira em Dashboard.tsx, e de propósito: duplicar a checagem aqui criaria duas fontes
  // de verdade para a mesma pergunta, e um dia elas discordariam.
  whatsappConversas: { abertas: number; fechadas: number } | null;
  whatsappTempoResposta: { atendente: string; minutos: number }[];
  // true quando a busca dessas métricas falhou (pro gestor/admin) — mostra um aviso
  // no lugar dos gráficos em vez de deixá-los sumir sem explicação nenhuma.
  whatsappError?: boolean;
}

export function DashboardCharts({
  faturamentoData,
  segmentacao,
  conversaoVendedor,
  rendimentoFabrica,
  rendimentoVendedor,
  whatsappConversas,
  whatsappTempoResposta,
  whatsappError,
}: DashboardChartsProps) {
  // Largura do eixo calculada a partir do nome mais longo, para o YAxis
  // sempre reservar espaço suficiente e o nome do vendedor nunca quebrar linha.
  const vendedorAxisWidth = useMemo(() => {
    const maxWidth = conversaoVendedor.reduce(
      (max, v) => Math.max(max, getVendedorNameWidth(v.nome ?? '')),
      0,
    );
    return Math.max(80, Math.ceil(maxWidth) + 12);
  }, [conversaoVendedor]);

  const conversasStatusData = useMemo(
    () => whatsappConversas
      ? [
          { status: 'Abertas', quantidade: whatsappConversas.abertas },
          { status: 'Fechadas', quantidade: whatsappConversas.fechadas },
        ]
      : [],
    [whatsappConversas],
  );

  // Mesma técnica de vendedorAxisWidth acima, reaplicada aos nomes dos atendentes.
  const atendenteAxisWidth = useMemo(() => {
    const maxWidth = whatsappTempoResposta.reduce(
      (max, v) => Math.max(max, getVendedorNameWidth(v.atendente ?? '')),
      0,
    );
    return Math.max(80, Math.ceil(maxWidth) + 12);
  }, [whatsappTempoResposta]);

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

        {/* Havia aqui um segundo cartão, "Rendimento por Fábrica", em barras.
            Ele mostrava EXATAMENTE o mesmo array da pizza acima (o
            rendimento_fabricante de dashboard_stats), mudando só o desenho e
            ganhando um seletor Maior/Menor. Dois cartões para o mesmo número
            faziam a tela parecer maior do que a informação que ela tem. Ficou a
            pizza, que já mostra as fábricas pequenas agrupadas em "Outros" com
            o detalhe no hover. */}

        {/* Conversão por Vendedor */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Conversão por Vendedor</CardTitle>
            <CardDescription className="text-xs">Taxa de fechamento individual</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conversaoVendedor} layout="vertical" barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradientConversao" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartColors.success} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={chartColors.success} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...commonAxisProps} tickFormatter={formatPercentTick} />
                <YAxis dataKey="nome" type="category" {...commonAxisProps} width={vendedorAxisWidth} tick={renderVendedorTick} interval={0} />
                <Tooltip content={<ChartTooltip formatValue={formatPercentTooltip} />} />
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

        {/* Rendimento por Responsável — ocupa a linha inteira porque sobraram
            três cartões nesta grade de duas colunas; sem isso o último ficaria
            com metade da linha vazia ao lado, o que na tela parece gráfico que
            não carregou. */}
        <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300 lg:col-span-2">
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
                <YAxis dataKey="vendedor" type="category" {...commonAxisProps} width={100} interval={0} />
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


      {/* Atendimento WhatsApp — só renderizado pra gestor/admin de empresa que tem a seção
          contratada; nos demais casos Dashboard.tsx manda whatsappConversas null e a faixa
          inteira (inclusive o aviso de erro) não aparece. */}
      {whatsappError ? (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>Não foi possível carregar as métricas de atendimento no WhatsApp</AlertTitle>
          <AlertDescription>Tente recarregar a página. Se continuar assim, avise o suporte.</AlertDescription>
        </Alert>
      ) : whatsappConversas && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          {/* Conversas Abertas x Fechadas */}
          <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" /> Conversas Abertas x Fechadas
              </CardTitle>
              <CardDescription className="text-xs">Volume de atendimento no WhatsApp por status</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={conversasStatusData} barCategoryGap="35%">
                  <CartesianGrid {...commonGridProps} />
                  <XAxis dataKey="status" {...commonAxisProps} />
                  <YAxis {...commonAxisProps} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip formatValue={(v) => `${v} conversa(s)`} />} />
                  <Bar
                    dataKey="quantidade"
                    name="Conversas"
                    radius={[8, 8, 0, 0]}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  >
                    {conversasStatusData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.status === 'Abertas' ? chartColors.primary : chartColors.success} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tempo Médio de Resposta por Atendente */}
          <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Tempo Médio de Resposta
              </CardTitle>
              <CardDescription className="text-xs">Tempo até a primeira resposta no WhatsApp, por atendente</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={whatsappTempoResposta} layout="vertical" barCategoryGap="20%">
                  <defs>
                    <linearGradient id="gradientTempoResposta" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={chartColors.warning} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={chartColors.warning} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                  <XAxis type="number" {...commonAxisProps} tickFormatter={formatMinutosTick} />
                  <YAxis dataKey="atendente" type="category" {...commonAxisProps} width={atendenteAxisWidth} tick={renderVendedorTick} interval={0} />
                  <Tooltip content={<ChartTooltip formatValue={formatMinutos} />} />
                  <Bar
                    dataKey="minutos"
                    name="Tempo médio"
                    fill="url(#gradientTempoResposta)"
                    radius={[0, 8, 8, 0]}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default DashboardCharts;

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarX, Factory, ShieldAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/DashboardChartTooltip';
import { formatarMoedaBRL } from '@/lib/moeda';
import { useDashboardNegociosRisco } from '@/hooks/use-dashboard';
import { BarraDeFiltros } from '@/components/pauta/BarraDeFiltros';
import type { FiltrosDoPainel } from '@/lib/filtros-do-painel';

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
  filtros: FiltrosDoPainel;
  onChangeFiltros: (filtros: FiltrosDoPainel) => void;
  podeFiltrarPorResponsavel: boolean;
}

export function RadarDeRisco({ empresaId, filtros, onChangeFiltros, podeFiltrarPorResponsavel }: Props) {
  const navigate = useNavigate();
  const { data: bruto } = useDashboardNegociosRisco(empresaId, {
    etapas: filtros.etapas,
    fabricanteIds: filtros.fabricantes,
    usuarioIds: filtros.responsaveis,
  });

  const risco = useMemo(() => ({
    qtdParados: bruto?.qtd_parados ?? 0,
    valorParados: bruto?.valor_parados ?? 0,
    qtdSemProximaAcao: bruto?.qtd_sem_proxima_acao ?? 0,
    valorSemProximaAcao: bruto?.valor_sem_proxima_acao ?? 0,
    valorRiscoTotal: bruto?.valor_risco_total ?? 0,
    // A RPC já devolve [] pra quem não é gestor — nada a filtrar aqui.
    riscoPorVendedor: bruto?.risco_por_vendedor ?? [],
    riscoPorFabricante: bruto?.risco_por_fabricante ?? [],
    topParados: bruto?.top_parados ?? [],
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

      <BarraDeFiltros
        empresaId={empresaId}
        filtros={filtros}
        onChange={onChangeFiltros}
        podeFiltrarPorResponsavel={podeFiltrarPorResponsavel}
      />

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
                {/* Este cartão mudou de definição no banco: agora conta também retorno
                    marcado, não só ausência de tarefa. Sem esta legenda, o número caindo
                    de 146 para 90 parece defeito. */}
                <span className="block text-xs text-muted-foreground">Sem tarefa aberta e sem retorno marcado</span>
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
                {/* Valor ÚNICO — negócio que é parado E sem próxima ação entra uma vez só.
                    Sem contagem aqui de propósito: qtdParados + qtdSemProximaAcao contaria
                    esse negócio em dobro, e a contagem certa não é uma coluna que a RPC
                    devolve hoje. Ver docs/divida-tecnica.md #67. */}
                <span className="text-xs text-muted-foreground">Parado ou sem próxima ação, sem contar duas vezes</span>
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

        {/* Era gráfico de pizza — virou tabela: é o que o pessoal da MD de fato lê, e
            mostra quantidade e valor juntos, coisa que a pizza não fazia. O gráfico de
            barras por responsável ao lado não mudou nesta etapa. */}
        <Card className={`shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300 ${risco.riscoPorVendedor.length > 0 ? '' : 'lg:col-span-2'}`}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Factory className="h-4 w-4 text-[hsl(var(--warning))]" /> Resumo por fabricante
            </CardTitle>
            <CardDescription className="text-xs">Negócios em risco por marca representada</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {risco.riscoPorFabricante.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nenhum negócio em risco no momento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 text-left font-semibold">Fabricante</th>
                      <th className="py-2 text-right font-semibold">Negócios</th>
                      <th className="py-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risco.riscoPorFabricante.map((f) => (
                      <tr key={f.fabrica} className="border-b border-border/50 last:border-0">
                        <td className="py-2">{f.fabrica}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{f.qtd}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(f.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Título e cabeçalho de coluna: "em risco"/"Sem mexer há", não "parados". O SQL
          seleciona `WHERE parado OR sem_proxima_acao` (migration 20260905120000) — na MD,
          hoje, os 146 negócios da lista são todos "sem próxima ação", não "parado" (o
          corte de parado é 7 dias). Um título que só diz "parados" mentia sobre o que a
          tabela de fato lista.
          Única parte deste painel que gera ação direta: cada linha leva à ficha do
          negócio, pelo mesmo caminho que a pauta de cima usa (/app?negocio=<id>,
          consertado na Etapa 1 deste plano). */}
      <Card className="shadow-card border-border/60 mt-5">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-bold">Os 10 maiores em risco</CardTitle>
          <CardDescription className="text-xs">Clique para abrir o negócio</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {risco.topParados.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhum negócio em risco no momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Negócio</th>
                    <th className="py-2 text-left font-semibold">Fabricante</th>
                    <th className="py-2 text-left font-semibold">Responsável</th>
                    <th className="py-2 text-right font-semibold">Sem mexer há</th>
                    <th className="py-2 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {risco.topParados.map((n) => (
                    <tr
                      key={n.id}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50"
                      onClick={() => navigate(`/app?negocio=${n.id}`)}
                    >
                      <td className="py-2">{n.nome}</td>
                      <td className="py-2 text-muted-foreground">{n.fabrica ?? '—'}</td>
                      <td className="py-2 text-muted-foreground">{n.responsavel ?? '—'}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {n.dias_parado} {n.dias_parado === 1 ? 'dia' : 'dias'}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(n.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </section>
  );
}

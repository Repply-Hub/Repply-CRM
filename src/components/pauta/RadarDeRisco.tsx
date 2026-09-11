import { useMemo } from 'react';
import { AlertTriangle, CalendarX, Factory, ShieldAlert } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/DashboardChartTooltip';
import { formatarMoedaBRL } from '@/lib/moeda';
import { useDashboardNegociosRisco, type NegocioEmRisco } from '@/hooks/use-dashboard';
import { BarraDeFiltros } from '@/components/pauta/BarraDeFiltros';
import { TabelaDoTime } from '@/components/pauta/TabelaDoTime';
import { MOLDURA_DA_PAUTA } from '@/components/pauta/moldura-da-pauta';
import { recorteParaOServidor, type FiltrosDoPainel } from '@/lib/filtros-do-painel';

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
  /**
   * Abre o painel do negócio SOBRE a tela — quem monta o painel é a página "Hoje", uma vez só.
   *
   * Vem por propriedade, e não de um `useNegocioNoEndereco()` daqui de dentro, por
   * REAPROVEITAMENTO: esta é uma tabela de gráfico, e tabela de gráfico não tem por que conhecer
   * rota, endereço nem histórico do navegador. Quem monta o componente decide o que "abrir"
   * significa na tela dela — e, como a propriedade é obrigatória, o TypeScript cobra essa decisão
   * de quem montar o `RadarDeRisco` numa tela nova, em vez de deixar um padrão silencioso.
   *
   * ⚠️ O motivo ANTIGO desta propriedade não existe mais, e não vale citá-lo: até 09/09/2026 a
   * marca de "fui eu que empurrei esta entrada do histórico" morava num `useRef` do hook — um por
   * instância —, então uma segunda instância aqui dentro quebrava o fechamento em silêncio. A
   * revisão da Tarefa 3 (achados A1/A2) mandou a marca para o `state` da própria entrada do
   * histórico, onde ela vale entre instâncias. Montar o hook aqui hoje seria correto; a
   * propriedade fica porque deixa o componente melhor, não porque o hook seja frágil.
   */
  onAbrirNegocio: (pedidoId: string) => void;
  /**
   * Abre o diálogo "Retomar depois" da linha clicada na tabela do time.
   *
   * Vem por propriedade pelo mesmo motivo de `onAbrirNegocio`: o diálogo é UM SÓ na tela, montado
   * pela página "Hoje", e é o MESMO que a fila de cima usa. Montar um segundo aqui dentro daria
   * duas cópias do mesmo formulário e duas verdades sobre o mesmo gesto.
   */
  onRetomarNegocio: (linha: NegocioEmRisco) => void;
}

export function RadarDeRisco({
  empresaId,
  filtros,
  onChangeFiltros,
  podeFiltrarPorResponsavel,
  onAbrirNegocio,
  onRetomarNegocio,
}: Props) {
  // O recorte que vai ao servidor — a MESMA tradução que a tabela do time e a tela "Hoje" usam,
  // para os três não discordarem sobre o que está sendo contado. Inclui a regra de só mandar
  // `responsaveis` para quem tem a chave; ver `recorteParaOServidor`.
  const recorte = useMemo(
    () => recorteParaOServidor(filtros, podeFiltrarPorResponsavel),
    [filtros, podeFiltrarPorResponsavel],
  );
  const { data: bruto } = useDashboardNegociosRisco(empresaId, recorte);

  const risco = useMemo(() => ({
    qtdParados: bruto?.qtd_parados ?? 0,
    valorParados: bruto?.valor_parados ?? 0,
    qtdSemProximaAcao: bruto?.qtd_sem_proxima_acao ?? 0,
    valorSemProximaAcao: bruto?.valor_sem_proxima_acao ?? 0,
    valorRiscoTotal: bruto?.valor_risco_total ?? 0,
    // A RPC já devolve [] pra quem não enxerga a pauta de toda a equipe — nada a filtrar aqui.
    // 🔴 O corte é da chave `pauta_de_todos`, não do papel: desde 07/09/2026 o `CASE` de
    // `dashboard_negocios_risco` pergunta `eu_vejo_pauta_de_todos()`. Gestor com o interruptor
    // desligado à mão recebe [] aqui, e vendedor com a chave ligada recebe a lista.
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
        <Card className={MOLDURA_DA_PAUTA}>
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
        <Card className={MOLDURA_DA_PAUTA}>
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
        <Card className={MOLDURA_DA_PAUTA}>
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

      {/* A TABELA DO TIME, no lugar do bloco "Os 10 maiores em risco" que ficava aqui até
          09/09/2026. Aquele bloco lia `top_parados`, uma coluna de dentro do painel de números:
          dez linhas fixas, sem ação nenhuma, num recorte que na MD tem 159 negócios.

          A lista agora tem função de banco própria e paginada (`negocios_em_risco`), cresce de 10
          em 10 e ganha duas ações por linha. "Abrir negócio" abre o painel SOBRE esta mesma tela,
          pelo mesmo caminho que a pauta de cima usa; "Retomar depois" abre o MESMO diálogo da
          fila. Os dois chegam por propriedade porque quem os monta, uma vez só, é a página
          "Hoje" — ver `onAbrirNegocio` e `onRetomarNegocio` acima. */}
      <TabelaDoTime
        empresaId={empresaId}
        filtros={recorte}
        podeVerDeTodos={podeFiltrarPorResponsavel}
        onAbrir={onAbrirNegocio}
        onRetomar={onRetomarNegocio}
      />

      {/* Os dois gráficos vêm DEPOIS da tabela do time, por pedido do dono do produto em
          10/09/2026: a tabela é onde se age, e ficava embaixo deles. `radar-ordem.test.tsx`
          prende a ordem. */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Risco por Vendedor — só aparece pra quem enxerga a pauta de toda a equipe: a RPC já
            devolve o array vazio pra quem não enxerga (ver comentário de risco.riscoPorVendedor). */}
        {risco.riscoPorVendedor.length > 0 && (
          <Card className={MOLDURA_DA_PAUTA}>
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
        <Card className={`${MOLDURA_DA_PAUTA} ${risco.riscoPorVendedor.length > 0 ? '' : 'lg:col-span-2'}`}>
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
    </div>
    </section>
  );
}

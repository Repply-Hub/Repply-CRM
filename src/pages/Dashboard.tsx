import { useState, useMemo, useRef, lazy, Suspense } from 'react';
import { startOfMonth, endOfMonth, parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, Target, Clock, Loader2, FileDown, X } from 'lucide-react';
import { useFaturamentoMensal, useIndicadoresVendedor, useDashboardStats, useDashboardWhatsappStats } from '@/hooks/use-dashboard';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { marcaDaEmpresa } from '@/lib/marca-da-empresa';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { DateRangePicker, type DateRange } from '@/components/shared/DateRangePicker';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MultiSelectSearch } from '@/components/shared/MultiSelectSearch';
import { PlanoVendasSection } from '@/components/dashboard/PlanoVendasSection';
import { usePodeFazer } from '@/hooks/use-permissoes';
import { formatarMoedaBRL } from '@/lib/moeda';

// recharts (e os módulos d3-* que ele traz) é de longe o maior pedaço de código
// desta página — carregar via lazy() evita que os cards de KPI, que não dependem
// de gráfico nenhum, fiquem esperando esse bundle inteiro baixar/parsear antes de
// aparecer na tela.
const DashboardCharts = lazy(() => import('@/components/dashboard/DashboardCharts'));

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {[260, 260].map((h, i) => (
        <Card key={i} className="shadow-card border-border/60">
          <CardContent className="p-5 flex items-center justify-center" style={{ height: h + 68 }}>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Uma cópia a menos das 26 espalhadas pelo sistema — mesmo resultado, agora
// vindo de src/lib/moeda.ts.
const formatCurrency = formatarMoedaBRL;

const getDefaultDateRange = (): DateRange => ({
  from: startOfMonth(new Date()),
  to: endOfMonth(new Date()),
});

const Dashboard = () => {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  // Array vazio = "Todos" (sem filtro) — os dois filtros aceitam mais de uma
  // seleção, então não dá mais pra usar um sentinela tipo 'todos' como valor.
  const [vendedorIds, setVendedorIds] = useState<string[]>([]);
  const [fabricanteIds, setFabricanteIds] = useState<string[]>([]);

  const dashboardContentRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { profile } = useAuth();
  const isGestor = profile?.role === 'admin' || profile?.role === 'gestor' || profile?.role === 'empresa';
  // `profile` (useAuth) já vem com empresa_id — refazer essa consulta aqui só
  // adicionava um round-trip bloqueante antes das queries de dados do
  // dashboard, todas dependentes de empresaId via `enabled`.
  const empresaId = profile?.empresa_id;

  // Controle de acesso do Plano de Vendas migrou de `isGestor` hardcoded para
  // `permissoes_usuario` (módulo `plano_vendas`) — `isGestor` continua valendo
  // para o resto da página (WhatsApp, indicadores por vendedor etc).
  const podeVerPlanoVendas = usePodeFazer('plano_vendas', 'ver');

  // Empresa que não contratou o WhatsApp não pode ver sobra nenhuma dele aqui. `=== true`
  // (e não `!== false`) de propósito: enquanto a resposta do banco não chega, esconder é
  // melhor do que mostrar a faixa e arrancá-la da frente de quem já começou a ler.
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');

  const { data: faturamento, isLoading: loadFat } = useFaturamentoMensal(empresaId);
  // Mesmos filtros de Período/Fabricante do topo — antes esse card ignorava
  // completamente esses filtros e reagregava o histórico inteiro de pedidos.
  const { data: vendedores } = useIndicadoresVendedor(empresaId, {
    fabricanteIds,
    dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
    dateTo: format(dateRange.to, 'yyyy-MM-dd'),
  });
  const { data: fabricantesRaw } = useQuery({
    queryKey: ['fabricantes_filtro'],
    queryFn: async () => {
      // Removido filtro de empresa_id pois a coluna não existe na tabela fabricantes
      const { data, error } = await (supabase as any)
        .from('fabricantes')
        .select('id, nome, ativo')
        // Marca que a empresa não representa mais desce para o fim do filtro — e do
        // Plano de Vendas inteiro, que recebe esta mesma lista por propriedade abaixo.
        // `ascending: false` porque em Postgres `true > false`: as ativas vêm primeiro.
        .order('ativo', { ascending: false })
        .order('nome');

      if (error) {
        console.error('Erro ao buscar fabricantes:', error);
        return [];
      }
      return data || [];
    },
  });
  const fabricantes = useMemo(() => (fabricantesRaw || []) as { id: string; nome: string; ativo?: boolean }[], [fabricantesRaw]);


  // KPIs, segmentação e rendimento por fábrica/vendedor vêm agregados do servidor
  // (RPC dashboard_stats) em vez de puxar centenas de linhas de `pedidos` com joins
  // pro cliente só pra somar — ver supabase/migrations/20260722100000_dashboard_stats_rpc.sql.
  const { data: stats, isLoading: loadStats, isFetching: fetchingStats } = useDashboardStats(empresaId, {
    usuarioIds: vendedorIds,
    fabricanteIds,
    dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
    dateTo: format(dateRange.to, 'yyyy-MM-dd'),
  });

  // Métricas de atendimento WhatsApp (conversas abertas/fechadas, tempo médio de
  // resposta por atendente) — só interessam ao gestor/admin acompanhando a equipe;
  // pra não-gestor nem dispara a query (RLS de whatsapp_conversas já restringiria
  // ao próprio usuário, mas o gráfico fica oculto de qualquer forma — ver DashboardCharts).
  // Sem a seção contratada a consulta também não sai: cortar aqui, na origem, poupa a
  // chamada à RPC dashboard_whatsapp_stats de uma empresa que não tem o módulo.
  const { data: whatsappStats, isError: whatsappIsError } = useDashboardWhatsappStats(isGestor && temWhatsapp === true ? empresaId : undefined, {
    dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
    dateTo: format(dateRange.to, 'yyyy-MM-dd'),
  });

  // loadStats só fica true na primeira carga (sem dado nenhum ainda pra mostrar) —
  // trocas de filtro reaproveitam os dados anteriores (placeholderData: keepPreviousData
  // em use-dashboard.ts) e só acendem fetchingStats, sem derrubar a tela pro spinner full-page.
  const isLoading = loadFat || loadStats;

  // Um mês entra no gráfico quando SE SOBREPÕE ao período escolhido. Antes o
  // teste era se o DIA 1 do mês caía dentro do intervalo, e isso apagava mês
  // inteiro do gráfico: escolher "15/jan a 20/ago" fazia janeiro sumir, sem
  // aviso nenhum, porque o dia 1 de janeiro estava fora do filtro.
  const filteredFaturamento = useMemo(() => {
    if (!faturamento) return [];
    const inicio = startOfDay(dateRange.from);
    const fim = endOfDay(dateRange.to);
    return faturamento.filter(f => {
      if (!f.mes_ano) return false;
      const primeiroDia = parseISO(`${f.mes_ano}-01`);
      return primeiroDia <= fim && endOfMonth(primeiroDia) >= inicio;
    });
  }, [faturamento, dateRange.from, dateRange.to]);

  // O selo "+X% últ. mês" compara o último mês do período com o mês anterior a
  // ele na lista COMPLETA, não na lista filtrada. Com o período padrão (só o mês
  // corrente) a lista filtrada tem um único item, então não existia mês anterior
  // e o selo ficava travado num "+0%" verde para sempre — número que nunca foi
  // verdade. Agora, sem mês anterior no histórico, o selo simplesmente não é
  // desenhado, em vez de mentir zero.
  const lastMonth = filteredFaturamento[filteredFaturamento.length - 1];
  const prevMonth = useMemo(() => {
    if (!lastMonth || !faturamento) return undefined;
    const idx = faturamento.findIndex(f => f.mes_ano === lastMonth.mes_ano);
    return idx > 0 ? faturamento[idx - 1] : undefined;
  }, [faturamento, lastMonth]);
  const temComparativo = !!lastMonth && !!prevMonth && !!prevMonth.faturamento_total;
  const faturamentoChange = temComparativo
    ? (((lastMonth.faturamento_total ?? 0) - prevMonth.faturamento_total) / prevMonth.faturamento_total * 100).toFixed(0)
    : '0';


  const totalPedidos = stats?.total_pedidos ?? 0;
  // ATENÇÃO — são DOIS números diferentes e cada cartão lê o seu (ver
  // DashboardStats em use-dashboard.ts e a migration 20260821120000):
  //   pedidos_fechados         = criados no período que já ganharam (safra).
  //                              Só serve para a Taxa de Conversão.
  //   pedidos_fechados_periodo = fecharam DENTRO do período. É o cartão
  //                              "Negócios Fechados" e o divisor do Ticket Médio.
  // Trocar um pelo outro é o erro mais fácil de cometer aqui: os dois nomes são
  // parecidos, os dois números são plausíveis e ninguém percebe pela tela.
  const fechadosDaSafra = stats?.pedidos_fechados ?? 0;
  const negociosFechadosNoPeriodo = stats?.pedidos_fechados_periodo ?? 0;
  const taxaConversao = totalPedidos > 0 ? ((fechadosDaSafra / totalPedidos) * 100).toFixed(0) : '0';

  const totalFaturamento = stats?.total_faturamento ?? 0;
  // Dinheiro fechado no período dividido pelos negócios fechados no período —
  // os dois lados da divisão precisam sair da mesma janela de tempo, senão o
  // ticket médio vira a razão entre dois conjuntos diferentes de negócios.
  const ticketMedioGeral = negociosFechadosNoPeriodo > 0 ? totalFaturamento / negociosFechadosNoPeriodo : 0;

  const kpis = [
    { label: 'Faturamento Total', value: formatCurrency(totalFaturamento), icon: DollarSign, change: temComparativo ? `${Number(faturamentoChange) >= 0 ? '+' : ''}${faturamentoChange}% últ. mês` : '', positive: Number(faturamentoChange) >= 0, accent: true },
    { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Target, change: `${totalPedidos} negócios`, positive: true },
    { label: 'Ticket Médio', value: formatCurrency(ticketMedioGeral), icon: TrendingUp, change: '', positive: true },
    { label: 'Negócios Fechados', value: String(negociosFechadosNoPeriodo), icon: Clock, change: '', positive: true },
  ];

  const faturamentoData = filteredFaturamento.map(f => ({
    mes: f.mes_ano ?? '',
    valor: f.faturamento_total ?? 0,
  }));

  // Opções do seletor "Responsável": só vendedores com pelo menos uma
  // conversão (negócio fechado) no período/fabricante filtrado — vendedor sem
  // nenhum negócio fechado ali não ajuda a filtrar nada e só engrossa a lista
  // (empresas com muitos cadastros inativos/novatos chegam a ter dezenas).
  // `vendedores` (lista completa, sem esse corte) continua sendo usado em
  // todo o resto da página — Plano de Vendas precisa listar todo mundo pra
  // permitir definir meta de quem ainda não converteu nada.
  const vendedoresComConversao = useMemo(
    () => (vendedores ?? []).filter(v => Number(v.qtd_fechado ?? 0) > 0),
    [vendedores],
  );

  const conversaoVendedor = useMemo(() => {
    const toRow = (v: { usuario_nome?: string; total_pedidos?: number; qtd_fechado?: number; usuario_id?: string }) => ({
      nome: v.usuario_nome ?? '',
      conversao: v.total_pedidos ? (Number(v.qtd_fechado ?? 0) / Number(v.total_pedidos)) * 100 : 0,
      id: v.usuario_id,
    });

    // Não-gestor só vê a própria conversão nesse gráfico, nunca a dos colegas —
    // a RPC por trás (dashboard_indicadores_vendedor) traz a empresa toda sem
    // filtro de usuário, então a restrição precisa ser aplicada aqui, ignorando
    // o filtro "Responsável" do topo (que continua livre pro gestor). Sempre a
    // própria barra, mesmo em 0% — é o indicador individual dele, diferente da
    // comparação entre vendedores abaixo, onde 0% é só ruído.
    if (!isGestor) {
      return (vendedores ?? []).filter(v => v.usuario_id === profile?.id).map(toRow);
    }

    // Parte da mesma lista sem vendedor de conversão zero usada no seletor
    // "Responsável" (vendedoresComConversao) — o mesmo ruído que não ajuda a
    // filtrar nada ali também não ajuda a comparar taxas de fechamento aqui.
    const data = vendedoresComConversao.map(toRow);
    if (vendedorIds.length > 0) {
      return data.filter(v => vendedorIds.includes(v.id));
    }
    return data;
  }, [vendedores, vendedoresComConversao, vendedorIds, isGestor, profile?.id]);

  // Já vem agregado e ordenado (desc) da RPC — a ordenação por maior/menor e o
  // agrupamento "Outros" da pizza são só de exibição, calculados dentro de
  // DashboardCharts (que também guarda o estado do seletor de ordenação).
  const rendimentoFabrica = useMemo(
    () => stats?.rendimento_fabricante ?? [],
    [stats],
  );

  // rendimento_vendedor vem da mesma RPC dashboard_stats agregada pra empresa
  // toda (KPIs, segmentação, etc.) — não dá pra restringir a query sem também
  // reduzir os KPIs gerais a "só meu", que não foi pedido. Filtra aqui, pelo
  // nome (é como a RPC já agrupa esse array), pra não-gestor não ver o
  // faturamento nominal dos colegas nesse gráfico específico.
  const rendimentoVendedor = useMemo(() => {
    const raw = stats?.rendimento_vendedor ?? [];
    if (isGestor) return raw;
    return raw.filter(v => v.vendedor === profile?.nome);
  }, [stats, isGestor, profile?.nome]);

  const segmentacao = [
    { name: 'Alto (>100k)', value: stats?.segmentacao_alto ?? 0, color: 'hsl(24, 100%, 47%)' },
    { name: 'Médio (30-100k)', value: stats?.segmentacao_medio ?? 0, color: 'hsl(42, 95%, 52%)' },
    { name: 'Baixo (<30k)', value: stats?.segmentacao_baixo ?? 0, color: 'hsl(152, 60%, 38%)' },
  ];

  const hasActiveFilters = useMemo(() => {
    const defaultRange = getDefaultDateRange();
    return (
      fabricanteIds.length > 0 ||
      vendedorIds.length > 0 ||
      format(dateRange.from, 'yyyy-MM-dd') !== format(defaultRange.from, 'yyyy-MM-dd') ||
      format(dateRange.to, 'yyyy-MM-dd') !== format(defaultRange.to, 'yyyy-MM-dd')
    );
  }, [fabricanteIds, vendedorIds, dateRange]);

  const handleClearFilters = () => {
    setFabricanteIds([]);
    setVendedorIds([]);
    setDateRange(getDefaultDateRange());
  };

  const handleExportPdf = async () => {
    if (!dashboardContentRef.current) return;
    setExportingPdf(true);
    try {
      const { generateDashboardPdf } = await import('@/lib/generate-dashboard-pdf');
      const periodoLabel = `${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}`;
      const fabricanteLabel = fabricanteIds.length > 0
        ? fabricantes.filter(f => fabricanteIds.includes(f.id)).map(f => f.nome).join(', ')
        : 'Todos';
      const responsavelLabel = vendedorIds.length > 0
        ? (vendedores ?? []).filter(v => vendedorIds.includes(v.usuario_id ?? '')).map(v => v.usuario_nome).join(', ')
        : 'Todos';
      await generateDashboardPdf(
        dashboardContentRef.current,
        marcaDaEmpresa(profile),
        `Período: ${periodoLabel}  ·  Fabricante: ${fabricanteLabel}  ·  Responsável: ${responsavelLabel}`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard" subtitle="Visão analítica do desempenho comercial">
      <ErrorBoundary>
      <div className={`px-6 pb-6 w-full transition-opacity duration-200 ${fetchingStats && !isLoading ? 'opacity-60' : 'opacity-100'}`}>
        {/* Filtros — fixos ao rolar a página, como o header, MAS só a partir de
            xl. Abaixo de ~1200px eles não cabem numa linha só e quebram em duas;
            fixos, essa segunda linha soma ~150px que somem da altura útil para
            sempre e espremem o Plano de Vendas logo abaixo (é um dos motivos de
            precisar diminuir o zoom para usar a tela). */}
        <div className="static xl:sticky xl:top-0 xl:z-20 -mx-6 px-6 py-4 mb-8 border-b border-border/60 bg-background/95 backdrop-blur-sm flex flex-col sm:flex-row flex-wrap gap-4 justify-start items-end">
          <div className="w-full sm:w-44 xl:w-56">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Fabricante</p>
            {/* A lista já chega ordenada com as inativas por último (ver a consulta
                `fabricantes_filtro`). O sufixo "(Inativa)" no rótulo é o que explica POR QUE
                elas estão lá embaixo — sem ele, a marca só está no fim e ninguém sabe o
                motivo. Vai no texto e não num selo porque o MultiSelectSearch é peça
                compartilhada (src/components/shared) e não tem casa para selo.
                Marca inativa continua SELECIONÁVEL: filtro salvo que aponte para ela
                precisa seguir funcionando. */}
            <MultiSelectSearch
              options={fabricantes.map((f) => ({
                value: f.id,
                label: f.ativo === false ? `${f.nome} (Inativa)` : f.nome,
              }))}
              value={fabricanteIds}
              onValueChange={setFabricanteIds}
              placeholder="Todos"
              className="h-10 bg-card border-border/60 shadow-sm"
            />
          </div>
          <div className="w-full sm:w-44 xl:w-56">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Responsável</p>
            <MultiSelectSearch
              options={vendedoresComConversao.map((v) => ({ value: v.usuario_id ?? '', label: v.usuario_nome ?? '' }))}
              value={vendedorIds}
              onValueChange={setVendedorIds}
              placeholder="Todos"
              className="h-10 bg-card border-border/60 shadow-sm"
            />
          </div>
          <div className="w-full sm:w-auto">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Período</p>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          {fetchingStats && !isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Atualizando...
            </div>
          )}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              className="h-10 gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleClearFilters}
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          )}
          <Button
            className="h-10 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm sm:ml-auto"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Exportar PDF
          </Button>
        </div>

        <div ref={dashboardContentRef}>
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="shadow-card hover:shadow-card-hover transition-all duration-300 border-border/60 overflow-hidden relative group hover:-translate-y-0.5">
              {kpi.accent && <div className="absolute inset-0 gradient-brand-subtle opacity-60" />}
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <p className="text-2xl font-extrabold text-card-foreground tracking-tight">{kpi.value}</p>
                    {kpi.change && (
                      <span className={`text-xs font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${kpi.positive ? 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' : 'text-destructive bg-destructive/10'}`}>
                        {kpi.change}
                      </span>
                    )}
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-105 transition-all duration-300">
                    <kpi.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Plano de Vendas — gate de nível 1 (visão geral) é `podeVerPlanoVendas`,
            módulo `plano_vendas` em `permissoes_usuario`; sem linha na tabela, o
            padrão libera 'ver' (mesmo COALESCE de `has_permission` no banco), então
            isto não regride ninguém que já usava o sistema antes deste controle
            existir. */}
        {empresaId && podeVerPlanoVendas && (
          <PlanoVendasSection
            empresaId={empresaId}
            currentUsuarioId={profile?.id}
            // Gestor e vendedor comum seguem o MESMO filtro "Responsável" do
            // topo (array vazio = "Todos"). Antes o vendedor comum era travado
            // nele mesmo aqui, então o Plano de Vendas dele mostrava só o que
            // ele tinha vendido — e o plano é da empresa: meta de equipe contra
            // o vendido da empresa. Sem filtro escolhido, ele agora abre no
            // geral, igual ao gestor.
            //
            // Filtrar um vendedor de propósito continua funcionando: escolher
            // alguém em "Responsável" recorta esta seção como já recortava os
            // KPIs e os gráficos da página. O que mudou é só o PADRÃO.
            //
            // A quebra "Por vendedor" (a lista de baixo) segue controlada por
            // permissão — ela é decidida dentro da seção por
            // `usePodeFazer('plano_vendas', 'ver', 'ver_metas_vendedor')`, não por
            // aqui.
            vendedorIds={vendedorIds}
            fabricanteIds={fabricanteIds}
            vendedores={(vendedores ?? []).map(v => ({ usuario_id: v.usuario_id ?? '', usuario_nome: v.usuario_nome ?? '' }))}
            fabricantes={fabricantes}
            // O período INTEIRO, não só o mês da data inicial. Antes daqui saíam
            // `ano` e `mes` de dateRange.from, então um filtro de "01/jan a
            // 31/dez" mostrava só janeiro no Plano de Vendas — e não avisava.
            dateFrom={format(dateRange.from, 'yyyy-MM-dd')}
            dateTo={format(dateRange.to, 'yyyy-MM-dd')}
            // As setas de mês da seção comandam o filtro "Período" do topo: elas
            // não têm data própria, escrevem NESTE estado. Por isso o
            // DateRangePicker acima e a página inteira (KPIs, gráficos) mudam
            // junto com a seta — é o mesmo `dateRange` para todo mundo.
            onPeriodoChange={setDateRange}
          />
        )}

        {/* Gráficos */}
        <Suspense fallback={<ChartsSkeleton />}>
          <DashboardCharts
            faturamentoData={faturamentoData}
            segmentacao={segmentacao}
            conversaoVendedor={conversaoVendedor}
            rendimentoFabrica={rendimentoFabrica}
            rendimentoVendedor={rendimentoVendedor}
            // A seção entra nas duas condições além do papel: quem mexer amanhã no `enabled`
            // da consulta acima não teria como adivinhar que a faixa dependia dele.
            whatsappConversas={isGestor && temWhatsapp === true && whatsappStats ? { abertas: whatsappStats.conversas_abertas, fechadas: whatsappStats.conversas_fechadas } : null}
            whatsappTempoResposta={whatsappStats?.tempo_resposta_atendente ?? []}
            whatsappError={isGestor && temWhatsapp === true && whatsappIsError}
          />
        </Suspense>
        </div>
      </div>
      </ErrorBoundary>
    </AppLayout>
  );
};


export default Dashboard;

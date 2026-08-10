import { useState, useMemo, lazy, Suspense } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, DollarSign, Target, Clock, Loader2 } from 'lucide-react';
import { useFaturamentoMensal, useIndicadoresVendedor, useVelocidadeFabricante, useDashboardStats } from '@/hooks/use-dashboard';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { DateRangePicker, type DateRange } from '@/components/shared/DateRangePicker';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MultiSelectSearch } from '@/components/shared/MultiSelectSearch';
import { PlanoVendasSection } from '@/components/dashboard/PlanoVendasSection';

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

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Dashboard = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  // Array vazio = "Todos" (sem filtro) — os dois filtros aceitam mais de uma
  // seleção, então não dá mais pra usar um sentinela tipo 'todos' como valor.
  const [vendedorIds, setVendedorIds] = useState<string[]>([]);
  const [fabricanteIds, setFabricanteIds] = useState<string[]>([]);

  const { profile } = useAuth();
  const isGestor = profile?.role === 'admin' || profile?.role === 'gestor' || profile?.role === 'empresa';
  // `profile` (useAuth) já vem com empresa_id — refazer essa consulta aqui só
  // adicionava um round-trip bloqueante antes das queries de dados do
  // dashboard, todas dependentes de empresaId via `enabled`.
  const empresaId = profile?.empresa_id;

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
        .select('id, nome')
        .order('nome');
      
      if (error) {
        console.error('Erro ao buscar fabricantes:', error);
        return [];
      }
      return data || [];
    },
  });
  const fabricantes = useMemo(() => (fabricantesRaw || []) as { id: string; nome: string }[], [fabricantesRaw]);


  // KPIs, segmentação e rendimento por fábrica/vendedor vêm agregados do servidor
  // (RPC dashboard_stats) em vez de puxar centenas de linhas de `pedidos` com joins
  // pro cliente só pra somar — ver supabase/migrations/20260722100000_dashboard_stats_rpc.sql.
  const { data: stats, isLoading: loadStats, isFetching: fetchingStats } = useDashboardStats(empresaId, {
    usuarioIds: vendedorIds,
    fabricanteIds,
    dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
    dateTo: format(dateRange.to, 'yyyy-MM-dd'),
  });

  // Mesmos filtros de Período/Responsável/Fabricante do topo — antes esse card
  // vinha só por empresaId e ignorava completamente esses filtros.
  const { data: velocidade } = useVelocidadeFabricante(empresaId, {
    usuarioIds: vendedorIds,
    fabricanteIds,
    dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
    dateTo: format(dateRange.to, 'yyyy-MM-dd'),
  });

  // loadStats só fica true na primeira carga (sem dado nenhum ainda pra mostrar) —
  // trocas de filtro reaproveitam os dados anteriores (placeholderData: keepPreviousData
  // em use-dashboard.ts) e só acendem fetchingStats, sem derrubar a tela pro spinner full-page.
  const isLoading = loadFat || loadStats;

  const filteredFaturamento = useMemo(() => {
    if (!faturamento) return [];
    return faturamento.filter(f => {
      if (!f.mes_ano) return false;
      const d = parseISO(`${f.mes_ano}-01`);
      return isWithinInterval(d, { 
        start: startOfDay(dateRange.from), 
        end: endOfDay(dateRange.to) 
      });
    });
  }, [faturamento, dateRange.from, dateRange.to]);

  const lastMonth = filteredFaturamento[filteredFaturamento.length - 1];
  const prevMonth = filteredFaturamento[filteredFaturamento.length - 2];
  const faturamentoChange = lastMonth && prevMonth && prevMonth.faturamento_total && prevMonth.faturamento_total !== 0
    ? (((lastMonth.faturamento_total ?? 0) - prevMonth.faturamento_total) / prevMonth.faturamento_total * 100).toFixed(0)
    : '0';


  const totalPedidos = stats?.total_pedidos ?? 0;
  const totalPedidosFechados = stats?.pedidos_fechados ?? 0;
  const taxaConversao = totalPedidos > 0 ? ((totalPedidosFechados / totalPedidos) * 100).toFixed(0) : '0';

  const totalFaturamento = stats?.total_faturamento ?? 0;
  const ticketMedioGeral = totalPedidosFechados > 0 ? totalFaturamento / totalPedidosFechados : 0;

  const kpis = [
    { label: 'Faturamento Total', value: formatCurrency(totalFaturamento), icon: DollarSign, change: lastMonth ? `${Number(faturamentoChange) >= 0 ? '+' : ''}${faturamentoChange}% últ. mês` : '', positive: Number(faturamentoChange) >= 0, accent: true },
    { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Target, change: `${totalPedidos} negócios`, positive: true },
    { label: 'Ticket Médio', value: formatCurrency(ticketMedioGeral), icon: TrendingUp, change: '', positive: true },
    { label: 'Negócios Fechados', value: String(totalPedidosFechados), icon: Clock, change: '', positive: true },
  ];

  const faturamentoData = filteredFaturamento.map(f => ({
    mes: f.mes_ano ?? '',
    valor: f.faturamento_total ?? 0,
  }));

  const conversaoVendedor = useMemo(() => {
    const data = (vendedores ?? []).map(v => ({
      nome: v.usuario_nome ?? '',
      conversao: v.total_pedidos ? (Number(v.qtd_fechado ?? 0) / Number(v.total_pedidos)) * 100 : 0,
      id: v.usuario_id
    }));

    if (vendedorIds.length > 0) {
      return data.filter(v => vendedorIds.includes(v.id));
    }
    return data;
  }, [vendedores, vendedorIds]);

  // dias_medio_resposta vem null quando nenhum pedido do fabricante tem envio de
  // orçamento registrado ainda (não é "0 dias" — é "sem dado"); plota 0 pra não
  // quebrar a área do gráfico, mas o tooltip (VelocidadeTooltip) diferencia os dois casos.
  const velocidadeData = (velocidade ?? []).map(v => ({
    fabrica: v.fabricante_nome ?? '',
    dias: v.dias_medio_resposta ?? 0,
    semDados: v.dias_medio_resposta === null,
  }));

  // Já vem agregado e ordenado (desc) da RPC — a ordenação por maior/menor e o
  // agrupamento "Outros" da pizza são só de exibição, calculados dentro de
  // DashboardCharts (que também guarda o estado do seletor de ordenação).
  const rendimentoFabrica = useMemo(
    () => stats?.rendimento_fabricante ?? [],
    [stats],
  );

  const rendimentoVendedor = stats?.rendimento_vendedor ?? [];

  const segmentacao = [
    { name: 'Alto (>100k)', value: stats?.segmentacao_alto ?? 0, color: 'hsl(24, 100%, 47%)' },
    { name: 'Médio (30-100k)', value: stats?.segmentacao_medio ?? 0, color: 'hsl(42, 95%, 52%)' },
    { name: 'Baixo (<30k)', value: stats?.segmentacao_baixo ?? 0, color: 'hsl(152, 60%, 38%)' },
  ];

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
      <div className={`p-6 w-full transition-opacity duration-200 ${fetchingStats && !isLoading ? 'opacity-60' : 'opacity-100'}`}>
        {/* Filtros */}
        <div className="mb-8 flex flex-col sm:flex-row flex-wrap gap-4 justify-end items-end">
          <div className="w-full sm:w-56">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Fabricante</p>
            <MultiSelectSearch
              options={fabricantes.map((f) => ({ value: f.id, label: f.nome }))}
              value={fabricanteIds}
              onValueChange={setFabricanteIds}
              placeholder="Todos"
              className="h-10 bg-card border-border/60 shadow-sm"
            />
          </div>
          <div className="w-full sm:w-56">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Responsável</p>
            <MultiSelectSearch
              options={(vendedores ?? []).map((v) => ({ value: v.usuario_id ?? '', label: v.usuario_nome ?? '' }))}
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
        </div>

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

        {/* Plano de Vendas */}
        {empresaId && (
          <PlanoVendasSection
            empresaId={empresaId}
            isGestor={isGestor}
            currentUsuarioId={profile?.id}
            // Não-gestor sempre vê o próprio plano; gestor segue o filtro
            // "Responsável" do topo (array vazio = "Todos").
            vendedorIds={isGestor ? vendedorIds : profile?.id ? [profile.id] : []}
            fabricanteIds={fabricanteIds}
            vendedores={(vendedores ?? []).map(v => ({ usuario_id: v.usuario_id ?? '', usuario_nome: v.usuario_nome ?? '' }))}
            fabricantes={fabricantes}
            ano={dateRange.from.getFullYear()}
            mes={dateRange.from.getMonth() + 1}
          />
        )}

        {/* Gráficos */}
        <Suspense fallback={<ChartsSkeleton />}>
          <DashboardCharts
            faturamentoData={faturamentoData}
            segmentacao={segmentacao}
            conversaoVendedor={conversaoVendedor}
            velocidadeData={velocidadeData}
            rendimentoFabrica={rendimentoFabrica}
            rendimentoVendedor={rendimentoVendedor}
          />
        </Suspense>
      </div>
      </ErrorBoundary>
    </AppLayout>
  );
};


export default Dashboard;

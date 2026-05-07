import { useState, useMemo } from 'react';
import { subMonths, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell,
  Tooltip, Area, AreaChart,
} from 'recharts';
import { TrendingUp, DollarSign, Target, Clock, Loader2, Factory } from 'lucide-react';
import { useFaturamentoMensal, useIndicadoresVendedor, useVelocidadeFabricante } from '@/hooks/use-dashboard';
import { usePedidos } from '@/hooks/use-pedidos';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import { ChartTooltip, chartColors, commonAxisProps, commonGridProps } from '@/components/charts/ChartTooltip';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

const Dashboard = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [fabricaSort, setFabricaSort] = useState<'maior' | 'menor'>('maior');
  const [vendedorId, setVendedorId] = useState<string>('todos');
  const [fabricanteId, setFabricanteId] = useState<string>('todos');

  const { user } = useAuth();
  const { data: userData } = useQuery({
    queryKey: ['usuario_perfil', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const empresaId = userData?.empresa_id;

  const { data: faturamento, isLoading: loadFat } = useFaturamentoMensal(empresaId);
  const { data: vendedores } = useIndicadoresVendedor(empresaId);
  const { data: velocidade } = useVelocidadeFabricante(empresaId);
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


  const { data: pedidos } = usePedidos(empresaId);

  const isLoading = loadFat;

  const filteredPedidos = useMemo(() => {
    const list = pedidos || [];
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    
    return list.filter(p => {
      const d = parseISO(p.data_pedido);
      const isWithinRange = isWithinInterval(d, { start: from, end: to });
      const matchesVendedor = vendedorId === 'todos' || p.usuario_id === vendedorId;
      const matchesFabricante = fabricanteId === 'todos' || p.fabricante_id === fabricanteId;
      return isWithinRange && matchesVendedor && matchesFabricante;
    });
  }, [pedidos, dateRange.from, dateRange.to, vendedorId, fabricanteId]);


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


  const totalPedidos = filteredPedidos.length;
  const fechados = filteredPedidos.filter(p => p.status === 'fechamento').length;
  const taxaConversao = totalPedidos > 0 ? ((fechados / totalPedidos) * 100).toFixed(0) : '0';

  const totalFaturamento = filteredPedidos
    .filter(p => p.status === 'fechamento')
    .reduce((sum, p) => sum + (p.valor_total ?? 0), 0);
    
  const totalPedidosFechados = filteredPedidos.filter(p => p.status === 'fechamento').length;
  const ticketMedioGeral = totalPedidosFechados > 0 ? totalFaturamento / totalPedidosFechados : 0;

  const kpis = [
    { label: 'Faturamento Total', value: formatCurrency(totalFaturamento), icon: DollarSign, change: lastMonth ? `${Number(faturamentoChange) >= 0 ? '+' : ''}${faturamentoChange}% últ. mês` : '', positive: Number(faturamentoChange) >= 0, accent: true },
    { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Target, change: `${totalPedidos} pedidos`, positive: true },
    { label: 'Ticket Médio', value: formatCurrency(ticketMedioGeral), icon: TrendingUp, change: '', positive: true },
    { label: 'Pedidos Fechados', value: String(totalPedidosFechados), icon: Clock, change: '', positive: true },
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

    if (vendedorId !== 'todos') {
      return data.filter(v => v.id === vendedorId);
    }
    return data;
  }, [vendedores, vendedorId]);

  const velocidadeData = (velocidade ?? []).map(v => ({
    fabrica: v.fabricante_nome ?? '',
    dias: 0, // A coluna tempo_medio_ate_orcamento_dias não existe na view atual
  }));

  const rendimentoFabrica = useMemo(() => {
    const map = new Map<string, number>();
    filteredPedidos.forEach(p => {
      if (p.fabricante?.nome && p.status === 'fechamento') {
        map.set(p.fabricante.nome, (map.get(p.fabricante.nome) ?? 0) + (p.valor_total ?? 0));
      }
    });
    const arr = Array.from(map.entries()).map(([fabrica, valor]) => ({ fabrica, valor }));
    // No sorting here anymore, we do it in useMemo
    return arr;
  }, [filteredPedidos]);

  const rendimentoFabricaSorted = useMemo(() => {
    return [...rendimentoFabrica].sort((a, b) => fabricaSort === 'maior' ? b.valor - a.valor : a.valor - b.valor);
  }, [rendimentoFabrica, fabricaSort]);

  const faturamentoPorFabricaPizza = useMemo(() => {
    return rendimentoFabrica
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [rendimentoFabrica]);

  const rendimentoVendedor = useMemo(() => {
    const map = new Map<string, number>();
    filteredPedidos.forEach(p => {
      if (p.vendedor?.nome && p.status === 'fechamento') {
        map.set(p.vendedor.nome, (map.get(p.vendedor.nome) ?? 0) + (p.valor_total ?? 0));
      }
    });
    const arr = Array.from(map.entries()).map(([vendedor, valor]) => ({ vendedor, valor }));
    arr.sort((a, b) => b.valor - a.valor);
    return arr;
  }, [filteredPedidos]);



  const segmentacao = [
    { name: 'Alto (>100k)', value: filteredPedidos.filter(p => (p.valor_total ?? 0) > 100000).length, color: 'hsl(24, 100%, 47%)' },
    { name: 'Médio (30-100k)', value: filteredPedidos.filter(p => (p.valor_total ?? 0) >= 30000 && (p.valor_total ?? 0) <= 100000).length, color: 'hsl(42, 95%, 52%)' },
    { name: 'Baixo (<30k)', value: filteredPedidos.filter(p => (p.valor_total ?? 0) < 30000).length, color: 'hsl(152, 60%, 38%)' },
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
      <div className="p-6 w-full">
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

        {/* Filtros */}
        <div className="mb-8 flex flex-col sm:flex-row flex-wrap gap-4 justify-end items-end">
          <div className="w-full sm:w-48">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Fabricante</p>
            <Select value={fabricanteId} onValueChange={setFabricanteId}>
              <SelectTrigger className="h-10 bg-card border-border/60 shadow-sm">
                <SelectValue placeholder="Fabricante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {fabricantes.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Responsável</p>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger className="h-10 bg-card border-border/60 shadow-sm">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(vendedores ?? []).map((v) => (
                  <SelectItem key={v.usuario_id} value={v.usuario_id || ''}>
                    {v.usuario_nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Período</p>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>



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
              <CardDescription className="text-xs">Distribuição dos pedidos por faixa de valor</CardDescription>
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
                    content={<ChartTooltip formatValue={(v) => `${v} pedido(s)`} />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  <YAxis dataKey="nome" type="category" {...commonAxisProps} width={80} />
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

          {/* Velocidade por Fábrica */}
          <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold">Velocidade de Resposta por Fábrica</CardTitle>
              <CardDescription className="text-xs">Tempo médio até o orçamento (dias)</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={velocidadeData}>
                  <defs>
                    <linearGradient id="gradientVelocidade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.warning} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.warning} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...commonGridProps} />
                  <XAxis dataKey="fabrica" {...commonAxisProps} />
                  <YAxis {...commonAxisProps} tickFormatter={v => `${v}d`} />
                  <Tooltip content={<ChartTooltip formatValue={(v) => `${v} dias`} />} />
                  <Area
                    type="monotone"
                    dataKey="dias"
                    name="Dias"
                    stroke={chartColors.warning}
                    strokeWidth={2.5}
                    fill="url(#gradientVelocidade)"
                    dot={{ fill: chartColors.warning, r: 5, strokeWidth: 2.5, stroke: chartColors.card }}
                    activeDot={{ r: 7, strokeWidth: 2, stroke: chartColors.card, fill: chartColors.warning }}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </AreaChart>
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
              <CardDescription className="text-xs">Distribuição do faturamento entre os principais fabricantes</CardDescription>
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
                    {faturamentoPorFabricaPizza.map((_, idx) => (
                      <Cell 
                        key={`cell-${idx}`} 
                        fill={[
                          chartColors.primary,
                          chartColors.success,
                          chartColors.warning,
                          'hsl(24, 100%, 47%)',
                          'hsl(280, 65%, 60%)'
                        ][idx % 5]} 
                        stroke="hsl(var(--card))" 
                        strokeWidth={2} 
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip formatValue={formatCurrency} />}
                  />
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
      </div>
      </ErrorBoundary>
    </AppLayout>
  );
};


export default Dashboard;

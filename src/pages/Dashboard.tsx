import { useState, useMemo } from 'react';
import { subMonths, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, Target, Clock, Loader2 } from 'lucide-react';
import { useFaturamentoMensal, useIndicadoresVendedor, useVelocidadeFabricante } from '@/hooks/use-dashboard';
import { usePedidos } from '@/hooks/use-pedidos';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';

const Dashboard = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });

  const { data: faturamento, isLoading: loadFat } = useFaturamentoMensal();
  const { data: vendedores } = useIndicadoresVendedor();
  const { data: velocidade } = useVelocidadeFabricante();
  const { data: pedidos } = usePedidos();

  const isLoading = loadFat;

  // Filter pedidos by date range
  const filteredPedidos = useMemo(() => {
    if (!pedidos) return [];
    return pedidos.filter(p => {
      const d = parseISO(p.data_pedido);
      return isWithinInterval(d, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) });
    });
  }, [pedidos, dateRange]);

  // Filter faturamento by date range
  const filteredFaturamento = useMemo(() => {
    if (!faturamento) return [];
    return faturamento.filter(f => {
      if (!f.mes) return false;
      const d = parseISO(f.mes);
      return isWithinInterval(d, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) });
    });
  }, [faturamento, dateRange]);

  const lastMonth = filteredFaturamento.slice(-1)[0];
  const prevMonth = filteredFaturamento.slice(-2, -1)[0];
  const faturamentoChange = lastMonth && prevMonth && prevMonth.faturamento_total
    ? (((lastMonth.faturamento_total ?? 0) - (prevMonth.faturamento_total ?? 0)) / (prevMonth.faturamento_total ?? 1) * 100).toFixed(0)
    : '0';

  const totalPedidos = filteredPedidos.length;
  const fechados = filteredPedidos.filter(p => p.status === 'fechamento').length;
  const taxaConversao = totalPedidos > 0 ? ((fechados / totalPedidos) * 100).toFixed(0) : '0';

  const totalFaturamento = filteredFaturamento.reduce((sum, f) => sum + (f.faturamento_total ?? 0), 0);
  const totalPedidosFechados = filteredFaturamento.reduce((sum, f) => sum + (f.qtd_pedidos_fechados ?? 0), 0);
  const ticketMedioGeral = totalPedidosFechados > 0 ? totalFaturamento / totalPedidosFechados : 0;

  const kpis = [
    { label: 'Faturamento Total', value: totalFaturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: DollarSign, change: lastMonth ? `${Number(faturamentoChange) >= 0 ? '+' : ''}${faturamentoChange}% últ. mês` : '', positive: Number(faturamentoChange) >= 0 },
    { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Target, change: `${totalPedidos} pedidos`, positive: true },
    { label: 'Ticket Médio', value: ticketMedioGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: TrendingUp, change: '', positive: true },
    { label: 'Pedidos Fechados', value: String(totalPedidosFechados), icon: Clock, change: '', positive: true },
  ];

  const faturamentoData = filteredFaturamento.map(f => ({
    mes: f.mes_ano ?? '',
    valor: f.faturamento_total ?? 0,
  }));

  const conversaoVendedor = (vendedores ?? []).map(v => ({
    nome: v.vendedor_nome ?? '',
    conversao: Number(v.taxa_fechamento ?? 0),
  }));

  const velocidadeData = (velocidade ?? []).map(v => ({
    fabrica: v.fabricante_nome ?? '',
    dias: Number(v.tempo_medio_ate_orcamento_dias ?? 0),
  }));

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
    <AppLayout>
      <div className="p-6 max-w-[1400px]">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão analítica do desempenho comercial</p>
          </div>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi, i) => (
            <Card key={kpi.label} className="shadow-card hover:shadow-card-hover transition-all duration-200 border-border/60 overflow-hidden relative group">
              {i === 0 && <div className="absolute inset-0 gradient-brand-subtle opacity-60" />}
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-2xl font-extrabold text-card-foreground tracking-tight">{kpi.value}</p>
                    {kpi.change && (
                      <span className={`text-xs font-semibold ${kpi.positive ? 'text-success' : 'text-destructive'}`}>
                        {kpi.change}
                      </span>
                    )}
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <kpi.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Card className="shadow-card border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Faturamento Mensal</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={faturamentoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-card border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Segmentação por Ticket</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={segmentacao} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {segmentacao.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="shadow-card border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Conversão por Vendedor</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={conversaoVendedor} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="conversao" fill="hsl(var(--success))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-card border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Velocidade de Resposta por Fábrica</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={velocidadeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="fabrica" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${v}d`} />
                  <Tooltip formatter={(v: number) => `${v} dias`} />
                  <Line type="monotone" dataKey="dias" stroke="hsl(var(--warning))" strokeWidth={2.5} dot={{ fill: 'hsl(var(--warning))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;

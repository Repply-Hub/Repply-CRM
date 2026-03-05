import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, Target, Clock, Loader2 } from 'lucide-react';
import { useFaturamentoMensal, useIndicadoresVendedor, useVelocidadeFabricante } from '@/hooks/use-dashboard';
import { usePedidos } from '@/hooks/use-pedidos';

const Dashboard = () => {
  const { data: faturamento, isLoading: loadFat } = useFaturamentoMensal();
  const { data: vendedores } = useIndicadoresVendedor();
  const { data: velocidade } = useVelocidadeFabricante();
  const { data: pedidos } = usePedidos();

  const isLoading = loadFat;

  // Derive KPIs from real data
  const lastMonth = faturamento?.slice(-1)[0];
  const prevMonth = faturamento?.slice(-2, -1)[0];
  const faturamentoChange = lastMonth && prevMonth && prevMonth.faturamento_total
    ? (((lastMonth.faturamento_total ?? 0) - (prevMonth.faturamento_total ?? 0)) / (prevMonth.faturamento_total ?? 1) * 100).toFixed(0)
    : '0';

  const totalPedidos = pedidos?.length ?? 0;
  const fechados = pedidos?.filter(p => p.status === 'fechamento').length ?? 0;
  const taxaConversao = totalPedidos > 0 ? ((fechados / totalPedidos) * 100).toFixed(0) : '0';

  const kpis = [
    { label: 'Faturamento Mês', value: (lastMonth?.faturamento_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: DollarSign, change: `${Number(faturamentoChange) >= 0 ? '+' : ''}${faturamentoChange}%` },
    { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Target, change: '' },
    { label: 'Ticket Médio', value: (lastMonth?.ticket_medio ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: TrendingUp, change: '' },
    { label: 'Pedidos no Mês', value: String(lastMonth?.qtd_pedidos_fechados ?? 0), icon: Clock, change: '' },
  ];

  const faturamentoData = (faturamento ?? []).map(f => ({
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

  // Segment by ticket
  const segmentacao = [
    { name: 'Alto (>100k)', value: pedidos?.filter(p => (p.valor_total ?? 0) > 100000).length ?? 0, color: 'hsl(220, 70%, 50%)' },
    { name: 'Médio (30-100k)', value: pedidos?.filter(p => (p.valor_total ?? 0) >= 30000 && (p.valor_total ?? 0) <= 100000).length ?? 0, color: 'hsl(36, 95%, 55%)' },
    { name: 'Baixo (<30k)', value: pedidos?.filter(p => (p.valor_total ?? 0) < 30000).length ?? 0, color: 'hsl(152, 60%, 42%)' },
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
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão analítica do desempenho comercial</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {kpis.map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold text-card-foreground mt-1">{kpi.value}</p>
                    {kpi.change && (
                      <span className={`text-xs font-medium ${kpi.change.startsWith('+') ? 'text-success' : 'text-destructive'}`}>
                        {kpi.change}
                      </span>
                    )}
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <kpi.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento Mensal</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={faturamentoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                  <Bar dataKey="valor" fill="hsl(220, 70%, 50%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Segmentação por Ticket</CardTitle></CardHeader>
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

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Conversão por Vendedor</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={conversaoVendedor} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="conversao" fill="hsl(152, 60%, 42%)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Velocidade de Resposta por Fábrica</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={velocidadeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis dataKey="fabrica" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}d`} />
                  <Tooltip formatter={(v: number) => `${v} dias`} />
                  <Line type="monotone" dataKey="dias" stroke="hsl(36, 95%, 55%)" strokeWidth={2} dot={{ fill: 'hsl(36, 95%, 55%)', r: 4 }} />
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

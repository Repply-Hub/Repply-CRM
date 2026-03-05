import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, Target, Clock } from 'lucide-react';

const faturamentoData = [
  { mes: 'Out', valor: 180000 },
  { mes: 'Nov', valor: 220000 },
  { mes: 'Dez', valor: 195000 },
  { mes: 'Jan', valor: 260000 },
  { mes: 'Fev', valor: 310000 },
  { mes: 'Mar', valor: 275000 },
];

const conversaoVendedor = [
  { nome: 'Carlos', conversao: 68 },
  { nome: 'Ana', conversao: 55 },
  { nome: 'Maria', conversao: 72 },
];

const segmentacao = [
  { name: 'Alto Ticket', value: 35, color: 'hsl(220, 70%, 50%)' },
  { name: 'Médio Ticket', value: 45, color: 'hsl(36, 95%, 55%)' },
  { name: 'Baixo Ticket', value: 20, color: 'hsl(152, 60%, 42%)' },
];

const velocidadeFabrica = [
  { fabrica: 'Portobello', dias: 3.2 },
  { fabrica: 'Eliane', dias: 4.5 },
  { fabrica: 'Deca', dias: 2.8 },
  { fabrica: 'Roca', dias: 5.1 },
  { fabrica: 'Incepa', dias: 3.9 },
];

const kpis = [
  { label: 'Faturamento Mês', value: 'R$ 275.000', icon: DollarSign, change: '+12%' },
  { label: 'Taxa Conversão', value: '65%', icon: Target, change: '+3%' },
  { label: 'Ticket Médio', value: 'R$ 109.250', icon: TrendingUp, change: '+8%' },
  { label: 'Tempo Médio Resp.', value: '3,1 dias', icon: Clock, change: '-15%' },
];

const Dashboard = () => {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão analítica do desempenho comercial</p>
          </div>
          <div className="flex gap-2">
            <Select defaultValue="mes">
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
                <SelectItem value="trimestre">Trimestre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {kpis.map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold text-card-foreground mt-1">{kpi.value}</p>
                    <span className={`text-xs font-medium ${kpi.change.startsWith('+') ? 'text-success' : 'text-destructive'}`}>
                      {kpi.change}
                    </span>
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Faturamento Mensal</CardTitle>
            </CardHeader>
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Segmentação por Ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={segmentacao} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {segmentacao.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Conversão por Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={conversaoVendedor} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={60} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="conversao" fill="hsl(152, 60%, 42%)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Velocidade de Resposta por Fábrica</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={velocidadeFabrica}>
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

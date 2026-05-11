import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CreditCard, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format, addMonths, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const AdminDashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin_stats'],
    queryFn: async () => {
      // Em um sistema real, teríamos uma tabela de assinaturas.
      // Como não existe, vamos simular baseado na data de criação das empresas
      // considerando que cada empresa tem um "vencimento" mensal.
      
      const { data: empresas, error: empError } = await supabase
        .from('empresas')
        .select('id, nome, created_at');
        
      if (empError) throw empError;

      const { data: usuarios, error: userError } = await supabase
        .from('usuarios')
        .select('id, empresa_id');
        
      if (userError) throw userError;

      const now = new Date();
      
      const empresasStatus = (empresas || []).map(emp => {
        const createdAt = emp.created_at ? new Date(emp.created_at) : now;
        // Simulação: o vencimento é no mesmo dia do mês seguinte
        let vencimento = addMonths(createdAt, 1);
        while (isBefore(vencimento, now)) {
          vencimento = addMonths(vencimento, 1);
        }

        const diasParaVencer = Math.ceil((vencimento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const proximoDeVencer = diasParaVencer <= 7;
        const usuariosCount = (usuarios || []).filter(u => u.empresa_id === emp.id).length;

        return {
          ...emp,
          vencimento,
          proximoDeVencer,
          usuariosCount,
          status: 'Ativo' // Simulado
        };
      });

      return {
        totalEmpresas: empresasStatus.length,
        totalUsuarios: usuarios?.length || 0,
        proximosVencimento: empresasStatus.filter(e => e.proximoDeVencer),
        empresasStatus
      };
    }
  });

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
    <AppLayout title="Painel Administrativo" subtitle="Gerenciamento global do sistema e assinaturas">
      <div className="p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Empresas</CardTitle>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEmpresas}</div>
              <p className="text-xs text-muted-foreground mt-1">Empresas cadastradas no sistema</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Usuários Totais</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsuarios}</div>
              <p className="text-xs text-muted-foreground mt-1">Colaboradores ativos em todas as empresas</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Próximos do Vencimento</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.proximosVencimento.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Empresas com vencimento nos próximos 7 dias</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Status das Empresas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold text-center">Usuários</th>
                    <th className="px-4 py-3 font-semibold">Próximo Vencimento</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stats?.empresasStatus.map((emp) => (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 font-medium text-foreground">{emp.nome}</td>
                      <td className="px-4 py-4 text-center">{emp.usuariosCount}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={emp.proximoDeVencer ? 'text-orange-600 font-semibold' : ''}>
                            {format(emp.vencimento, "dd 'de' MMMM", { locale: ptBR })}
                          </span>
                          {emp.proximoDeVencer && <AlertCircle className="h-4 w-4 text-orange-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminDashboard;

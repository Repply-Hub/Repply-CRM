import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useClientes } from '@/hooks/use-clientes';
import { usePedidos } from '@/hooks/use-pedidos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Building2, Store, User, MapPin, Mail, Phone, Plus, Loader2 } from 'lucide-react';
import { KANBAN_STAGES } from '@/data/mockData';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

const stageColors: Record<string, string> = {
  novo_lead: 'bg-kanban-new text-white',
  elaboracao: 'bg-kanban-budget text-white',
  enviado: 'bg-kanban-sent text-white',
  negociacao: 'bg-kanban-negotiation text-white',
  fechamento: 'bg-kanban-closed text-white',
};

const ClienteDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: clientes, isLoading: loadingClientes } = useClientes();
  const { data: pedidos, isLoading: loadingPedidos } = usePedidos();

  const cliente = clientes?.find(c => c.id === id);
  const pedidosCliente = (pedidos ?? []).filter(p => p.cliente_id === id);

  if (loadingClientes) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!cliente) {
    return (
      <AppLayout>
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <p className="text-muted-foreground mt-8 text-center">Cliente não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  const Icon = tipoIcons[cliente.tipo] ?? Building2;
  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{cliente.empresa}</h1>
            <Badge variant="secondary" className="mt-1">{tipoLabels[cliente.tipo] ?? cliente.tipo}</Badge>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {cliente.cnpj && (
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="text-sm font-medium text-foreground">{cliente.cnpj}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {cliente.email && (
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground">{cliente.email}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {cliente.telefone && (
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="text-sm font-medium text-foreground">{cliente.telefone}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {cliente.endereco && (
            <Card className="md:col-span-3">
              <CardContent className="pt-4 flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Endereço</p>
                  <p className="text-sm font-medium text-foreground">{cliente.endereco}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Obras */}
        {cliente.obras && cliente.obras.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Obras Vinculadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {cliente.obras.map((obra: any) => (
                  <div key={obra.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{obra.nome_obra}</p>
                    {obra.endereco_entrega && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {obra.endereco_entrega}
                      </p>
                    )}
                    <Badge variant="outline" className="mt-2 text-[10px]">{obra.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pedidos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Pedidos</CardTitle>
            <Button size="sm" onClick={() => navigate('/pedidos')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Pedido
            </Button>
          </CardHeader>
          <CardContent>
            {loadingPedidos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pedidosCliente.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido encontrado para este cliente.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Fabricante</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidosCliente.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{(p as any).fabricante?.nome ?? '-'}</TableCell>
                        <TableCell>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                        <TableCell>
                          <Badge className={stageColors[p.status] ?? ''}>{stageLabel(p.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(p.data_pedido).toLocaleDateString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ClienteDetalhe;

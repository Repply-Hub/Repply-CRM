import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useClientes } from '@/hooks/use-clientes';
import { usePedidos } from '@/hooks/use-pedidos';
import { useUpdateCliente, useDeleteCliente } from '@/hooks/use-mutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Building2, Store, User, MapPin, Mail, Phone, Plus, Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { KANBAN_STAGES } from '@/data/mockData';
import { toast } from 'sonner';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, stringToEndereco, type EnderecoFields } from '@/lib/cep';

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
  const updateCliente = useUpdateCliente();
  const deleteCliente = useDeleteCliente();
  const [editOpen, setEditOpen] = useState(false);
  const [enderecoOpen, setEnderecoOpen] = useState(true);

  const cliente = clientes?.find(c => c.id === id);
  const pedidosCliente = (pedidos ?? []).filter(p => p.cliente_id === id);

  // Edit form state
  const [editData, setEditData] = useState({
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '', telefone: '', nome_contato: '',
  });
  const [editEndereco, setEditEndereco] = useState<EnderecoFields>(emptyEndereco);

  const openEdit = () => {
    if (!cliente) return;
    setEditData({
      empresa: cliente.empresa ?? '',
      razao_social: (cliente as any).razao_social ?? '',
      tipo: cliente.tipo ?? 'construtora',
      cnpj: cliente.cnpj ?? '',
      email: cliente.email ?? '',
      telefone: cliente.telefone ?? '',
      nome_contato: cliente.nome_contato ?? '',
    });
    setEditEndereco(cliente.endereco ? stringToEndereco(cliente.endereco) : emptyEndereco);
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const enderecoStr = enderecoToString(editEndereco);
    try {
      await updateCliente.mutateAsync({
        id,
        empresa: editData.empresa,
        razao_social: editData.razao_social || undefined,
        tipo: editData.tipo,
        cnpj: editData.cnpj || undefined,
        email: editData.email || undefined,
        telefone: editData.telefone || undefined,
        endereco: enderecoStr || undefined,
        nome_contato: editData.nome_contato || undefined,
      });
      toast.success('Cliente atualizado com sucesso!');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/clientes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{cliente.empresa}</h1>
              <Badge variant="secondary" className="mt-1">{tipoLabels[cliente.tipo] ?? cliente.tipo}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 pl-14 sm:pl-0">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
              <div>
                <Label>Tipo</Label>
                <Select value={editData.tipo} onValueChange={v => setEditData(d => ({ ...d, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="construtora">Construtora</SelectItem>
                    <SelectItem value="loja">Loja</SelectItem>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editData.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                <Input value={editData.cnpj} onChange={e => setEditData(d => ({ ...d, cnpj: e.target.value }))} placeholder={editData.tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={editData.empresa} onChange={e => setEditData(d => ({ ...d, empresa: e.target.value }))} required placeholder="Nome fantasia ou nome" />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input value={editData.razao_social} onChange={e => setEditData(d => ({ ...d, razao_social: e.target.value }))} placeholder="Razão social da empresa" />
              </div>
              <div>
                <Label>Nome do Contato</Label>
                <Input value={editData.nome_contato} onChange={e => setEditData(d => ({ ...d, nome_contato: e.target.value }))} placeholder="Nome da pessoa de contato" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={editData.telefone} onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} />
                </div>
              </div>
              <EnderecoForm value={editEndereco} onChange={setEditEndereco} />
              <Button type="submit" className="w-full" disabled={updateCliente.isPending}>
                {updateCliente.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {cliente.cnpj && (
            <Card className="border-border/40">
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">CNPJ</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.cnpj}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          <Card className="border-border/40">
             <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
               <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
               <div className="min-w-0">
                 <p className="text-xs text-muted-foreground">Email</p>
                 <p className={`text-sm font-medium ${cliente.email ? 'text-foreground' : 'text-muted-foreground italic'} truncate`}>
                   {cliente.email || 'Não informado'}
                 </p>
               </div>
            </CardContent>
          </Card>
          {cliente.telefone && (
            <Card className="border-border/40">
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Telefone</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.telefone}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {cliente.endereco && (() => {
            // Parse "logradouro, numero, complemento, bairro, cidade - UF, CEP" format
            const parts = cliente.endereco.split(',').map(s => s.trim());
            const logradouro = parts[0] || '';
            const numero = parts[1] || '';
            const bairro = parts.length > 3 ? parts[2] : '';
            const cidadeUfRaw = parts.length > 3 ? parts[3] : parts[2] || '';
            const cep = parts.length > 4 ? parts[4] : '';
            const cidadeUfMatch = cidadeUfRaw.match(/^(.+?)\s*-\s*(.+)$/);
            const cidade = cidadeUfMatch ? cidadeUfMatch[1].trim() : cidadeUfRaw;
            const uf = cidadeUfMatch ? cidadeUfMatch[2].trim() : '';
            
            const fields = [
              { label: 'Logradouro', value: logradouro },
              { label: 'Número', value: numero },
              { label: 'Bairro', value: bairro },
              { label: 'Cidade', value: cidade },
              { label: 'UF', value: uf },
              { label: 'CEP', value: cep },
            ].filter(f => f.value);

            return (
              <Card className="md:col-span-3 border-border/40">
                <CardContent className="pt-4">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full gap-2 mb-0 cursor-pointer"
                    onClick={() => setEnderecoOpen(o => !o)}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${enderecoOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {enderecoOpen && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                      {fields.map(f => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className="text-sm font-medium text-foreground">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Obras */}
        {cliente.obras && cliente.obras.length > 0 && (
          <Card className="border-border/40">
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
        <Card className="border-border/40">
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

        {/* Excluir cliente */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Cliente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O cliente "{cliente.empresa}" será removido permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await deleteCliente.mutateAsync(id!);
                      toast.success('Cliente excluído com sucesso!');
                      navigate('/clientes');
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppLayout>
  );
};

export default ClienteDetalhe;

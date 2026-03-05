import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useHistoricoContatos } from '@/hooks/use-pedidos';
import { useFabricantes, useClientes } from '@/hooks/use-clientes';
import { useCreatePedido } from '@/hooks/use-mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const stageColors: Record<string, string> = {
  novo_lead: 'bg-kanban-new text-white',
  elaboracao: 'bg-kanban-budget text-white',
  enviado: 'bg-kanban-sent text-white',
  negociacao: 'bg-kanban-negotiation text-white',
  fechamento: 'bg-kanban-closed text-white',
};

const contactIcons: Record<string, typeof Mail> = { email: Mail, telefone: Phone, whatsapp: MessageSquare, visita: Eye };

const Pedidos = () => {
  const { data: pedidos, isLoading } = usePedidos();
  const { data: fabricantes } = useFabricantes();
  const { data: clientes } = useClientes();
  const createPedido = useCreatePedido();
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: contatos } = useHistoricoContatos(selectedOrder);

  const filtered = (pedidos ?? []).filter(p =>
    (p.cliente?.empresa ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.fabricante?.nome ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clienteId = form.get('cliente_id') as string;
    const fabricanteId = form.get('fabricante_id') as string;
    const valor = parseFloat(form.get('valor') as string) || 0;

    if (!clienteId || !fabricanteId) {
      toast.error('Selecione cliente e fabricante');
      return;
    }

    try {
      await createPedido.mutateAsync({
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        valor_total: valor,
        observacoes: (form.get('observacoes') as string) || undefined,
      });
      toast.success('Pedido criado com sucesso!');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pedidos & Orçamentos</h1>
            <p className="text-sm text-muted-foreground mt-1">{pedidos?.length ?? 0} pedidos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info('Importação XLSX em breve!')}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Pedido</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Novo Pedido</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                  <div>
                    <Label>Cliente</Label>
                    <Select name="cliente_id">
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>
                        {(clientes ?? []).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fabricante</Label>
                    <Select name="fabricante_id">
                      <SelectTrigger><SelectValue placeholder="Selecionar fabricante" /></SelectTrigger>
                      <SelectContent>
                        {(fabricantes ?? []).map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Valor Total</Label><Input name="valor" type="number" step="0.01" placeholder="0,00" /></div>
                  <div><Label>Observações</Label><Input name="observacoes" placeholder="Observações (opcional)" /></div>
                  <Button type="submit" className="w-full" disabled={createPedido.isPending}>
                    {createPedido.isPending ? 'Criando...' : 'Criar Pedido'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedidos..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Cliente</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead>Fabricante</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedOrder(p.id)}>
                        <TableCell className="font-medium">{p.cliente?.empresa ?? '-'}</TableCell>
                        <TableCell>{p.obra?.nome_obra ?? '-'}</TableCell>
                        <TableCell>{p.fabricante?.nome ?? '-'}</TableCell>
                        <TableCell>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                        <TableCell>
                          <Badge className={stageColors[p.status] ?? ''}>{stageLabel(p.status)}</Badge>
                        </TableCell>
                        <TableCell>{p.vendedor?.nome ?? '-'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedOrder(p.id); }}>
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {selectedOrder && (
              <div className="w-80 shrink-0">
                <Card className="sticky top-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Histórico de Contatos</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {pedidos?.find(p => p.id === selectedOrder)?.cliente?.empresa}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-80">
                      <div className="space-y-4">
                        {!contatos?.length ? (
                          <p className="text-xs text-muted-foreground text-center py-8">Nenhum contato registrado</p>
                        ) : (
                          contatos.map(contact => {
                            const Icon = contactIcons[contact.tipo] ?? MessageSquare;
                            return (
                              <div key={contact.id} className="flex gap-3">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Icon className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <div>
                                  <p className="text-xs text-card-foreground">{contact.descricao}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {new Date(contact.data_contato).toLocaleDateString('pt-BR')} · {(contact.vendedor as any)?.nome}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Pedidos;

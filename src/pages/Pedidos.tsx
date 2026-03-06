import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useHistoricoContatos } from '@/hooks/use-pedidos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, Loader2, Pencil, FileDown } from 'lucide-react';
import { generatePedidosPdf } from '@/lib/generate-pdf';
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
  const navigate = useNavigate();
  const { data: pedidos, isLoading } = usePedidos();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('todos');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const { data: contatos } = useHistoricoContatos(selectedOrder);

  const filtered = (pedidos ?? []).filter(p =>
    ((p.cliente?.empresa ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.fabricante?.nome ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (stageFilter === 'todos' || p.status === stageFilter)
  );

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  return (
    <AppLayout title="Pedidos & Orçamentos" subtitle={`${pedidos?.length ?? 0} pedidos`}>
      <div className="p-6">
        <div className="flex items-center justify-end mb-6">
           <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;
              await generatePedidosPdf(
                filtered.map(p => ({
                  cliente: p.cliente?.empresa ?? '-',
                  obra: p.obra?.nome_obra ?? '-',
                  fabricante: p.fabricante?.nome ?? '-',
                  vendedor: p.vendedor?.nome ?? '-',
                  valor: p.valor_total ?? 0,
                  etapa: stageLabel(p.status),
                  data: p.data_pedido,
                })),
                stageFilter !== 'todos' ? `Orçamentos - ${stageLabel(stageFilter)}` : 'Orçamentos - Todos'
              );
            }}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Importação XLSX em breve!')}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX
            </Button>
            <Button size="sm" onClick={() => navigate('/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Pedido
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row gap-3 mb-4 w-full">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Buscar pedidos..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-full sm:w-48 shrink-0">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as etapas</SelectItem>
                    {KANBAN_STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${p.id}/editar`); }} title="Editar pedido">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
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

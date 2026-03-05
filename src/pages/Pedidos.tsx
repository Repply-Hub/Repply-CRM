import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockOrders, mockContacts, KANBAN_STAGES, mockFabricantes } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Upload, MessageSquare, Phone, Mail, Eye } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const stageColors: Record<string, string> = {
  novo_lead: 'bg-kanban-new text-white',
  elaboracao: 'bg-kanban-budget text-white',
  enviado: 'bg-kanban-sent text-white',
  negociacao: 'bg-kanban-negotiation text-white',
  fechamento: 'bg-kanban-closed text-white',
};

const contactIcons = { email: Mail, telefone: Phone, whatsapp: MessageSquare, visita: Eye };

const Pedidos = () => {
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  const filtered = mockOrders.filter(o =>
    o.clientName.toLowerCase().includes(search.toLowerCase()) ||
    o.fabricante.toLowerCase().includes(search.toLowerCase())
  );

  const orderContacts = mockContacts.filter(c => c.orderId === selectedOrder);
  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pedidos & Orçamentos</h1>
            <p className="text-sm text-muted-foreground mt-1">{mockOrders.length} pedidos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1" /> Importar XLSX</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Pedido</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Novo Pedido</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div><Label>Cliente</Label><Input placeholder="Nome do cliente" /></div>
                  <div><Label>Obra</Label><Input placeholder="Nome da obra" /></div>
                  <div>
                    <Label>Fabricante</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Selecionar fabricante" /></SelectTrigger>
                      <SelectContent>
                        {mockFabricantes.map(f => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome} — {f.tabela}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Valor</Label><Input type="number" placeholder="0,00" /></div>
                  <div><Label>Vendedor</Label><Input placeholder="Nome do vendedor" /></div>
                  <Button className="w-full">Criar Pedido</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedidos..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

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
                  {filtered.map(order => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedOrder(order.id)}>
                      <TableCell className="font-medium">{order.clientName}</TableCell>
                      <TableCell>{order.obra}</TableCell>
                      <TableCell>{order.fabricante}</TableCell>
                      <TableCell>{order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                      <TableCell>
                        <Badge className={stageColors[order.stage]}>{stageLabel(order.stage)}</Badge>
                      </TableCell>
                      <TableCell>{order.vendedor}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedOrder(order.id); }}>
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
                    {mockOrders.find(o => o.id === selectedOrder)?.clientName}
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-80">
                    <div className="space-y-4">
                      {orderContacts.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">Nenhum contato registrado</p>
                      ) : (
                        orderContacts.map(contact => {
                          const Icon = contactIcons[contact.type];
                          return (
                            <div key={contact.id} className="flex gap-3">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Icon className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-card-foreground">{contact.description}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{contact.date} · {contact.user}</p>
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
      </div>
    </AppLayout>
  );
};

export default Pedidos;

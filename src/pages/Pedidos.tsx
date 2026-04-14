import { useEffect, useState } from 'react';
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
import { Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, Loader2, Pencil, FileDown, Settings2, Columns3 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { generatePedidosPdf } from '@/lib/generate-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type ColumnDefinition } from '@/components/ColumnSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ImportPedidosDialog } from '@/components/ImportPedidosDialog';
import { ListPagination } from '@/components/ListPagination';

const PEDIDOS_COLUMNS: ColumnDefinition[] = [
  { id: 'cliente', label: 'Cliente', locked: true },
  { id: 'obra', label: 'Obra' },
  { id: 'fabricante', label: 'Fabricante' },
  { id: 'valor', label: 'Valor' },
  { id: 'etapa', label: 'Etapa' },
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'acoes', label: 'Ações' },
];

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('todos');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const { data: contatos } = useHistoricoContatos(selectedOrder);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('pedidos_columns');
    return saved ? JSON.parse(saved) : PEDIDOS_COLUMNS.map(c => c.id);
  });

  const handleColumnChange = (newColumns: string[]) => {
    setVisibleColumns(newColumns);
    localStorage.setItem('pedidos_columns', JSON.stringify(newColumns));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStageFilterChange = (value: string) => {
    setStageFilter(value);
    setPage(1);
  };

  const filtered = (pedidos ?? []).filter(p =>
    ((p.cliente?.empresa ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.fabricante?.nome ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (stageFilter === 'todos' || p.status === stageFilter)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleColumnCount = Math.max(
    1,
    visibleColumns.filter(id => id !== 'acoes').length + (visibleColumns.includes('acoes') ? 2 : 0)
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  return (
    <AppLayout title="Negócios" subtitle={`${pedidos?.length ?? 0} pedidos`}>
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Configurações</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => setColumnsOpen(true)}>
                  <Columns3 className="h-4 w-4 mr-2" /> Colunas
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => {
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
                  <FileDown className="h-4 w-4 mr-2" /> Exportar PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Importar XLSX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle className="text-sm">Exibir Colunas</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 pt-2">
                  {PEDIDOS_COLUMNS.map((column) => (
                    <div
                      key={column.id}
                      className={`flex items-center space-x-2 rounded-md p-1 transition-colors hover:bg-muted/50 ${column.locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <Checkbox
                        id={`col-ped-${column.id}`}
                        checked={visibleColumns.includes(column.id)}
                        onCheckedChange={() => {
                          if (column.locked) return;
                          if (visibleColumns.includes(column.id)) {
                            if (visibleColumns.length > 1) {
                              handleColumnChange(visibleColumns.filter(id => id !== column.id));
                            }
                          } else {
                            const newVisible = PEDIDOS_COLUMNS
                              .filter(c => visibleColumns.includes(c.id) || c.id === column.id)
                              .map(c => c.id);
                            handleColumnChange(newVisible);
                          }
                        }}
                        disabled={column.locked}
                      />
                      <Label htmlFor={`col-ped-${column.id}`} className="text-xs font-normal flex-1 cursor-pointer select-none">
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary mt-1"
                  onClick={() => handleColumnChange(PEDIDOS_COLUMNS.map(c => c.id))}
                >
                  Resetar todas
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          <Button size="sm" className="w-full sm:w-auto" onClick={() => navigate('/pedidos/novo')}>
            <Plus className="h-4 w-4 mr-1" /> Novo Pedido
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-row items-center gap-3">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar pedidos..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
                <Select value={stageFilter} onValueChange={handleStageFilterChange}>
                  <SelectTrigger className="w-48 shrink-0">
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

              <div className="w-full rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {visibleColumns.includes('cliente') && <TableHead>Cliente</TableHead>}
                      {visibleColumns.includes('obra') && <TableHead>Obra</TableHead>}
                      {visibleColumns.includes('fabricante') && <TableHead>Fabricante</TableHead>}
                      {visibleColumns.includes('valor') && <TableHead>Valor</TableHead>}
                      {visibleColumns.includes('etapa') && <TableHead>Etapa</TableHead>}
                      {visibleColumns.includes('vendedor') && <TableHead>Vendedor</TableHead>}
                      {visibleColumns.includes('acoes') && (
                        <>
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleColumnCount} className="py-12 text-center text-muted-foreground">
                          Nenhum negócio encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(p => (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedOrder(p.id)}>
                          {visibleColumns.includes('cliente') && <TableCell className="font-medium">{p.cliente?.empresa ?? '-'}</TableCell>}
                          {visibleColumns.includes('obra') && <TableCell>{p.obra?.nome_obra ?? '-'}</TableCell>}
                          {visibleColumns.includes('fabricante') && <TableCell>{p.fabricante?.nome ?? '-'}</TableCell>}
                          {visibleColumns.includes('valor') && <TableCell>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>}
                          {visibleColumns.includes('etapa') && (
                            <TableCell>
                              <Badge className={stageColors[p.status] ?? ''}>{stageLabel(p.status)}</Badge>
                            </TableCell>
                          )}
                          {visibleColumns.includes('vendedor') && <TableCell>{p.vendedor?.nome ?? '-'}</TableCell>}
                          {visibleColumns.includes('acoes') && (
                            <>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/pedidos/${p.id}/editar`);
                                  }}
                                  title="Editar pedido"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrder(p.id);
                                  }}
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <ListPagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="negócio"
                  itemLabelPlural="negócios"
                  className="border-t border-border/60 bg-card px-3 py-3 sm:px-4"
                />
              </div>
            </div>

            {selectedOrder && (
              <div className="w-full xl:w-80 xl:shrink-0">
                <Card className="xl:sticky xl:top-6">
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
      <ImportPedidosDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppLayout>
  );
};

export default Pedidos;

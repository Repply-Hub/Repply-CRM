import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useHistoricoContatos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, Loader2, Pencil, FileDown,
  Settings2, Columns3, Trash2, Filter, X, ChevronDown, AlertTriangle, CalendarIcon,
  LayoutGrid, List as ListIcon,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { generatePedidosPdf } from '@/lib/generate-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type ColumnDefinition } from '@/components/ColumnSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ImportPedidosDialog } from '@/components/ImportPedidosDialog';
import { ListPagination } from '@/components/ListPagination';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

type PageMode = 'pipeline' | 'negocios';
type PipelineView = 'kanban' | 'lista';
// Mantido para compatibilidade com a prop existente (rotas antigas)
type LegacyView = 'pipeline' | 'lista';

interface NegociosProps {
  /** Modo inicial da página: 'pipeline' (kanban) ou 'lista' (negócios em lista). */
  defaultView?: LegacyView;
}

const Negocios = ({ defaultView = 'pipeline' }: NegociosProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: pedidos, isLoading } = usePedidos();
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  // ===== View toggles =====
  // Toggle principal (sempre visível): Pipeline x Negócios.
  const [mode, setMode] = useState<PageMode>(() => {
    const saved = localStorage.getItem('negocios_mode') as PageMode | null;
    if (saved === 'pipeline' || saved === 'negocios') return saved;
    return defaultView === 'lista' ? 'negocios' : 'pipeline';
  });
  const handleModeChange = (next: PageMode) => {
    setMode(next);
    localStorage.setItem('negocios_mode', next);
  };

  // Sub-toggle (apenas quando mode === 'pipeline'): Kanban x Lista.
  const [pipelineView, setPipelineView] = useState<PipelineView>(() => {
    const saved = localStorage.getItem('negocios_pipeline_view') as PipelineView | null;
    return saved === 'kanban' || saved === 'lista' ? saved : 'kanban';
  });
  const handlePipelineViewChange = (next: PipelineView) => {
    setPipelineView(next);
    localStorage.setItem('negocios_pipeline_view', next);
  };

  // Renderização: kanban só quando estamos em Pipeline + Kanban.
  // Em Negócios, ou em Pipeline+Lista, exibimos a lista (com filtros do pipeline quando aplicável).
  const showKanban = mode === 'pipeline' && pipelineView === 'kanban';
  const isPipelineMode = mode === 'pipeline';

  // List state
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('todos');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const { data: contatos } = useHistoricoContatos(selectedOrder);

  // Pipeline filters
  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Bulk selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  // ===== LIST data =====
  const filtered = (pedidos ?? []).filter(p =>
    ((p.cliente?.empresa ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.fabricante?.nome ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (stageFilter === 'todos' || p.status === stageFilter)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visibleColumnCount = Math.max(
    1,
    visibleColumns.filter(id => id !== 'acoes').length + (visibleColumns.includes('acoes') ? 2 : 0) + 1
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // ===== PIPELINE data =====
  const allOrders = (pedidos ?? []).map(p => ({
    id: p.id,
    clientName: p.cliente?.empresa ?? 'Sem cliente',
    obra: p.obra?.nome_obra ?? '-',
    fabricante: p.fabricante?.nome ?? '-',
    fabricanteId: p.fabricante_id,
    valor: p.valor_total ?? 0,
    stage: p.status as any,
    daysInStage: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000),
    alertDays: 7,
    vendedor: p.vendedor?.nome ?? '-',
    vendedorId: p.usuario_id,
    createdAt: p.data_pedido,
  }));

  const pipelineOrders = useMemo(() => {
    return allOrders.filter(o => {
      if (selectedVendedores.length > 0 && !selectedVendedores.includes(o.vendedorId)) return false;
      if (selectedFabricantes.length > 0 && !selectedFabricantes.includes(o.fabricanteId)) return false;
      if (showOnlyAttention && o.daysInStage < o.alertDays) return false;
      if (dateFrom && new Date(o.createdAt) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt) > end) return false;
      }
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo]);

  const totalPipeline = pipelineOrders.reduce((acc, o) => acc + o.valor, 0);
  const hasPipelineFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || showOnlyAttention || !!dateFrom || !!dateTo;
  const activeFilterCount = (selectedVendedores.length > 0 ? 1 : 0) + (selectedFabricantes.length > 0 ? 1 : 0) + (showOnlyAttention ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearPipelineFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setShowOnlyAttention(false);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    const label = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;
    updateStatus.mutate({ id: draggableId, status: destination.droppableId });
    toast.success(`Pedido movido para "${label}"`);
  }, [updateStatus]);

  // ===== Bulk selection =====
  const currentPageIds = paginated.map(p => p.id);
  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selected);
      const BATCH_SIZE = 500;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await supabase.from('itens_pedido').delete().in('pedido_id', batch);
        await supabase.from('historico_contatos').delete().in('pedido_id', batch);
        const { error } = await supabase.from('pedidos').delete().in('id', batch);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success(`${ids.length} negócio(s) removido(s)!`);
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover');
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  // ===== Subtitle =====
  const subtitle = isPipelineMode
    ? `${pipelineOrders.length} pedidos · Total: ${totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : `${pedidos?.length ?? 0} pedidos`;

  return (
    <AppLayout title="Negócios" subtitle={subtitle}>
      <div className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
        {/* Top bar: view toggle + actions */}
        <div className="mb-4 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle principal: Pipeline x Negócios (sempre visível) */}
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
              <Button
                variant={mode === 'pipeline' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('pipeline')}
                className="h-8 px-3"
              >
                Pipeline
              </Button>
              <Button
                variant={mode === 'negocios' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('negocios')}
                className="h-8 px-3"
              >
                Negócios
              </Button>
            </div>

            {/* Sub-toggle: Kanban x Lista — apenas no modo Pipeline */}
            {isPipelineMode && (
              <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
                <Button
                  variant={pipelineView === 'kanban' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePipelineViewChange('kanban')}
                  className="h-8 gap-1.5 px-3"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </Button>
                <Button
                  variant={pipelineView === 'lista' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePipelineViewChange('lista')}
                  className="h-8 gap-1.5 px-3"
                >
                  <ListIcon className="h-4 w-4" />
                  Lista
                </Button>
              </div>
            )}

            {isPipelineMode && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={hasPipelineFilters ? 'border-primary' : ''}>
                      <Filter className="h-3.5 w-3.5 mr-1.5" />
                      Filtros
                      {hasPipelineFilters && (
                        <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{activeFilterCount}</Badge>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto min-w-[680px] max-w-[860px] p-4" align="start">
                    <div className="flex gap-4">
                      <div className="flex-1 min-w-[130px]">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vendedor</p>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {(vendedores ?? []).map(v => (
                            <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                              <Checkbox checked={selectedVendedores.includes(v.id)} onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)} />
                              {v.nome}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 min-w-[130px]">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fabricante</p>
                        <ScrollArea className="h-60">
                          <div className="space-y-1 pr-3">
                            {(fabricantes ?? []).map(f => (
                              <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                                <Checkbox checked={selectedFabricantes.includes(f.id)} onCheckedChange={() => toggleFilter(selectedFabricantes, setSelectedFabricantes, f.id)} />
                                {f.nome}
                              </label>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                      <div className="min-w-[140px]">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Período</p>
                        <div className="space-y-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs h-8", !dateFrom && "text-muted-foreground")}>
                                <CalendarIcon className="h-3 w-3 mr-1.5" />
                                {dateFrom ? format(dateFrom, 'dd/MM/yy', { locale: ptBR }) : 'De'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs h-8", !dateTo && "text-muted-foreground")}>
                                <CalendarIcon className="h-3 w-3 mr-1.5" />
                                {dateTo ? format(dateTo, 'dd/MM/yy', { locale: ptBR }) : 'Até'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between min-w-[120px]">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                          <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                            <Checkbox checked={showOnlyAttention} onCheckedChange={() => setShowOnlyAttention(prev => !prev)} />
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            Atenção
                          </label>
                        </div>
                        {hasPipelineFilters && (
                          <Button variant="ghost" size="sm" onClick={clearPipelineFilters} className="w-full text-muted-foreground mt-2">
                            <X className="h-3.5 w-3.5 mr-1" /> Limpar
                          </Button>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {hasPipelineFilters && (
                  <Button variant="ghost" size="icon" onClick={clearPipelineFilters} className="h-8 w-8 text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}

                <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={async () => {
                  await generatePedidosPdf(
                    pipelineOrders.map(o => ({
                      cliente: o.clientName,
                      obra: o.obra,
                      fabricante: o.fabricante,
                      vendedor: o.vendedor,
                      valor: o.valor,
                      etapa: stageLabel(o.stage),
                      data: o.createdAt,
                    })),
                    hasPipelineFilters ? 'Orçamentos (Filtrado)' : 'Orçamentos - Pipeline Completo'
                  );
                }}>
                  <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
                </Button>
              </>
            )}

            {!showKanban && (
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
            )}
          </div>

          <Button size="sm" className="w-full sm:w-auto" onClick={() => navigate('/pedidos/novo')}>
            <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Pedido</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showKanban ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
              {KANBAN_STAGES.map(stage => (
                <KanbanColumn
                  key={stage.key}
                  stageKey={stage.key}
                  label={stage.label}
                  colorClass={stage.color}
                  orders={pipelineOrders.filter(o => o.stage === stage.key)}
                />
              ))}
            </div>
          </DragDropContext>
        ) : (
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-row flex-wrap items-center gap-3">
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
                  <SelectTrigger className="w-fit max-w-full shrink-0">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as etapas</SelectItem>
                    {KANBAN_STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                  {someSelected && (
                    <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                      Excluir {selected.size}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Settings2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Opções</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
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
                </div>
              </div>

              <div className="w-full rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                      </TableHead>
                      {visibleColumns.includes('cliente') && <TableHead>Cliente</TableHead>}
                      {visibleColumns.includes('obra') && <TableHead>Obra</TableHead>}
                      {visibleColumns.includes('fabricante') && <TableHead>Fabricante</TableHead>}
                      {visibleColumns.includes('valor') && <TableHead>Valor</TableHead>}
                      {visibleColumns.includes('etapa') && <TableHead>Etapa</TableHead>}
                      {visibleColumns.includes('vendedor') && <TableHead>Vendedor</TableHead>}
                      {visibleColumns.includes('acoes') && (<><TableHead></TableHead><TableHead></TableHead></>)}
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
                        <TableRow key={p.id} className={`cursor-pointer hover:bg-muted/30 ${selected.has(p.id) ? 'bg-primary/5' : ''}`} onClick={() => setSelectedOrder(p.id)}>
                          <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} aria-label={`Selecionar ${p.cliente?.empresa}`} />
                          </TableCell>
                          {visibleColumns.includes('cliente') && <TableCell className="font-medium">{p.cliente?.empresa ?? '-'}</TableCell>}
                          {visibleColumns.includes('obra') && <TableCell>{p.obra?.nome_obra ?? '-'}</TableCell>}
                          {visibleColumns.includes('fabricante') && <TableCell>{p.fabricante?.nome ?? '-'}</TableCell>}
                          {visibleColumns.includes('valor') && <TableCell>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>}
                          {visibleColumns.includes('etapa') && (
                            <TableCell><Badge className={stageColors[p.status] ?? ''}>{stageLabel(p.status)}</Badge></TableCell>
                          )}
                          {visibleColumns.includes('vendedor') && <TableCell>{p.vendedor?.nome ?? '-'}</TableCell>}
                          {visibleColumns.includes('acoes') && (
                            <>
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
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
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

      {/* Confirm bulk delete */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} negócio(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os itens e histórico de contatos vinculados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportPedidosDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppLayout>
  );
};

export default Negocios;

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { KanbanColunasDialog } from '@/components/kanban/KanbanColunasDialog';
import { usePedidos, useHistoricoContatos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, Loader2, Pencil, FileDown,
  Settings2, Columns3, Trash2, Filter, X, ChevronDown, AlertTriangle, CalendarIcon,
  LayoutGrid, List as ListIcon, Building2, Factory, DollarSign, Clock, User, FileText,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { generatePedidosPdf } from '@/lib/generate-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ImportPedidosDialog } from '@/components/ImportPedidosDialog';
import { ListPagination } from '@/components/ListPagination';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const PEDIDOS_COLUMNS: ColumnDefinition[] = [
  { id: 'negocio', label: 'Negócio', locked: false },
  { id: 'etapa', label: 'Etapa', locked: false },
  { id: 'vendedor', label: 'Vendedor', locked: false },
  { id: 'acoes', label: 'Ações', locked: false },
];

const PAGE_SIZE = 10;
const LEGACY_CARD_FIELDS = ['cliente', 'obra', 'fabricante', 'valor'];

const getStageBadgeClass = (corToken: string) => `bg-${corToken} text-white`;

const contactIcons: Record<string, typeof Mail> = { email: Mail, telefone: Phone, whatsapp: MessageSquare, visita: Eye };

type PageMode = 'pipeline' | 'negocios';
type PipelineView = 'kanban' | 'lista';
type LegacyView = 'pipeline' | 'lista';

interface NegociosProps {
  defaultView?: LegacyView;
}

const Negocios = ({ defaultView = 'pipeline' }: NegociosProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  
  const { data: userData } = useQuery({
    queryKey: ['usuario_perfil_negocios', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const empresaId = userData?.empresa_id;
  const { data: pedidos, isLoading } = usePedidos(empresaId);
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();
  const { data: kanbanColunas } = useKanbanColunas();
  
  const KANBAN_STAGES = useMemo(
    () => (kanbanColunas ?? []).map(c => ({ key: c.slug, label: c.nome, color: c.cor })),
    [kanbanColunas]
  );

  const [colunasDialogOpen, setColunasDialogOpen] = useState(false);
  const {
    columns,
    visibleColumns,
    setVisibleColumns,
    pageSize,
    setPageSize,
    handleRename,
    handleTypeChange,
    handleAddColumn,
    handleRemoveColumn,
    handleReorder,
    getLabel,
    presets,
    savePreset,
    loadPreset,
    deletePreset
  } = useTableSettings({
    key: 'pedidos',
    defaultColumns: PEDIDOS_COLUMNS,
  });

  const mode: PageMode = defaultView === 'lista' ? 'negocios' : 'pipeline';
  const [pipelineView, setPipelineView] = useState<PipelineView>(() => {
    const saved = localStorage.getItem('negocios_pipeline_view') as PipelineView | null;
    return saved === 'kanban' || saved === 'lista' ? saved : 'kanban';
  });

  const handlePipelineViewChange = (next: PipelineView) => {
    setPipelineView(next);
    localStorage.setItem('negocios_pipeline_view', next);
  };

  const showKanban = mode === 'pipeline' && pipelineView === 'kanban';
  const isPipelineMode = mode === 'pipeline';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('todos');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const { data: contatos } = useHistoricoContatos(selectedOrder || viewOrderId);

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);

  // Column settings are now managed by useTableSettings hook


  const [visibleKanbanStages, setVisibleKanbanStages] = useState<string[]>(() => {
    const saved = localStorage.getItem('pedidos_kanban_stages');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (!kanbanColunas) return;
    const allKeys = kanbanColunas.map(c => c.slug);
    setVisibleKanbanStages(prev => {
      const filtered = prev.filter(k => allKeys.includes(k));
      const novas = allKeys.filter(k => !prev.includes(k));
      if (prev.length === 0) {
        localStorage.setItem('pedidos_kanban_stages', JSON.stringify(allKeys));
        return allKeys;
      }
      const next = [...filtered, ...novas];
      if (next.length !== prev.length || next.some((k, i) => k !== prev[i])) {
        localStorage.setItem('pedidos_kanban_stages', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [kanbanColunas]);

  const handleKanbanStagesChange = (next: string[]) => {
    setVisibleKanbanStages(next);
    localStorage.setItem('pedidos_kanban_stages', JSON.stringify(next));
  };

  const toggleKanbanStage = (key: string) => {
    if (visibleKanbanStages.includes(key)) {
      if (visibleKanbanStages.length > 1) {
        handleKanbanStagesChange(visibleKanbanStages.filter(k => k !== key));
      }
    } else {
      const next = KANBAN_STAGES.filter(s => visibleKanbanStages.includes(s.key) || s.key === key).map(s => s.key);
      handleKanbanStagesChange(next);
    }
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

  useEffect(() => {
    if (!visibleColumns.some(id => LEGACY_CARD_FIELDS.includes(id))) return;
    setVisibleColumns(prev => {
      const firstLegacyIndex = prev.findIndex(id => LEGACY_CARD_FIELDS.includes(id));
      const withoutLegacy = prev.filter(id => !LEGACY_CARD_FIELDS.includes(id) && id !== 'negocio');
      const next = [...withoutLegacy];
      next.splice(Math.max(firstLegacyIndex, 0), 0, 'negocio');
      return next;
    });
  }, [visibleColumns, setVisibleColumns]);

  const baseListPedidos = useMemo(() => {
    const all = pedidos ?? [];
    if (!isPipelineMode) return all;
    return all.filter(p => {
      if (selectedVendedores.length > 0 && !selectedVendedores.includes(p.usuario_id)) return false;
      if (selectedFabricantes.length > 0 && !selectedFabricantes.includes(p.fabricante_id)) return false;
      if (showOnlyAttention) {
        const days = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
        if (days < 7) return false;
      }
      if (dateFrom && new Date(p.data_pedido) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(p.data_pedido) > end) return false;
      }
      return true;
    });
  }, [pedidos, isPipelineMode, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseListPedidos.filter(p => {
      if (stageFilter !== 'todos' && p.status !== stageFilter) return false;
      if (!q) return true;
      const empresa = (p.cliente?.empresa ?? '').toLowerCase();
      const fab = (p.fabricante?.nome ?? '').toLowerCase();
      return empresa.includes(q) || fab.includes(q);
    });
  }, [baseListPedidos, search, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );
  const tableVisibleColumns = useMemo(() => {
    const withoutLegacy = visibleColumns.filter(id => !LEGACY_CARD_FIELDS.includes(id));
    return withoutLegacy.includes('negocio') ? withoutLegacy : ['negocio', ...withoutLegacy];
  }, [visibleColumns]);
  const visibleColumnCount = Math.max(
    1,
    tableVisibleColumns.filter(id => id !== 'acoes').length + (tableVisibleColumns.includes('acoes') ? 2 : 0) + 1
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const allOrders = useMemo(() => (pedidos ?? []).map(p => ({
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
  })), [pedidos]);

  const pipelineOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
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
      if (q) {
        const clientName = o.clientName.toLowerCase();
        const obra = o.obra.toLowerCase();
        const fabricante = o.fabricante.toLowerCase();
        if (!clientName.includes(q) && !obra.includes(q) && !fabricante.includes(q)) return false;
      }
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo, search]);

  const ordersByStage = useMemo(() => {
    const map: Record<string, typeof pipelineOrders> = {};
    for (const stage of KANBAN_STAGES) map[stage.key] = [];
    for (const o of pipelineOrders) {
      if (map[o.stage]) map[o.stage].push(o);
    }
    return map;
  }, [pipelineOrders, KANBAN_STAGES]);

  const totalPipeline = pipelineOrders.reduce((acc, o) => acc + o.valor, 0);
  const hasPipelineFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || showOnlyAttention || !!dateFrom || !!dateTo || stageFilter !== 'todos';
  const activeFilterCount = (selectedVendedores.length > 0 ? 1 : 0) + (selectedFabricantes.length > 0 ? 1 : 0) + (showOnlyAttention ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (stageFilter !== 'todos' ? 1 : 0);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearPipelineFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setShowOnlyAttention(false);
    setDateFrom(undefined);
    setDateTo(undefined);
    handleStageFilterChange('todos');
  };

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    const label = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;
    await updateStatus.mutateAsync({ id: draggableId, status: destination.droppableId });
    toast.success(`Pedido movido para "${label}"`);
  }, [updateStatus, KANBAN_STAGES]);

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
    } else if (filtered.length > currentPageIds.length) {
      setSelectAllDialogOpen(true);
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const selectPageOnly = () => {
    setSelected(prev => {
      const next = new Set(prev);
      currentPageIds.forEach(id => next.add(id));
      return next;
    });
    setSelectAllDialogOpen(false);
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map(p => p.id)));
    setSelectAllDialogOpen(false);
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
        await supabase.from('pedidos').delete().in('id', batch);
      }
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success(`${ids.length} negócio(s) removido(s)!`);
      setSelected(new Set());
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('[bulk-delete pedidos]', err);
      toast.error(err?.message || 'Erro ao remover negócios');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    if (showKanban) {
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
    } else {
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
    }
  };

  const optionsPopover = (
    <ColumnSettings
      columns={columns}
      visibleColumns={visibleColumns}
      onChange={setVisibleColumns}
      onRename={handleRename}
      onTypeChange={handleTypeChange}
      onReorder={handleReorder}
      onAdd={handleAddColumn}
      onRemove={handleRemoveColumn}
      hideColumns={showKanban}
      label="Colunas"
    >
      <div className={cn("p-1", !showKanban && "border-t border-border/50")}>
        <div className="px-4 py-2.5 flex items-center justify-between bg-muted/30 border-b border-border/50 mb-1">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            {showKanban ? 'Personalizar Etapas Kanban' : 'Ações'}
          </span>
        </div>
        
        <div className="px-1.5 py-0.5 space-y-1">
          {showKanban ? (
            <div className="space-y-1">
              {KANBAN_STAGES.map((stage) => {
                const checked = visibleKanbanStages.includes(stage.key);
                const disabled = visibleKanbanStages.length === 1 && checked;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleKanbanStage(stage.key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all text-left',
                      'hover:bg-muted/80 disabled:cursor-not-allowed',
                      !checked && 'opacity-40'
                    )}
                  >
                    <span className={cn('h-3.5 w-3.5 rounded-md shrink-0 border border-border/40', `bg-${stage.color}`)} />
                    <span className="flex-1 truncate">{stage.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleKanbanStagesChange(KANBAN_STAGES.map(s => s.key))}
                className="w-full text-center text-[11px] text-primary font-bold px-2 py-2 mt-1 rounded-md hover:bg-primary/5 transition-colors uppercase tracking-wider"
              >
                Resetar etapas
              </button>
            </div>
          ) : null}
          
          {showKanban && (
            <button
              type="button"
              onClick={() => setColunasDialogOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium hover:bg-muted/80 transition-all text-left"
            >
              <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Gerenciar colunas kanban...</span>
            </button>
          )}
          {!showKanban && (
            <>
              <button
                type="button"
                onClick={handleExportPdf}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium hover:bg-muted/80 transition-all text-left"
              >
                <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Exportar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium hover:bg-muted/80 transition-all text-left"
              >
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Importar</span>
              </button>
            </>
          )}
        </div>
      </div>
    </ColumnSettings>
  );

  const filtrosPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", hasPipelineFilters && 'border-primary')}>
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Filtros
          {hasPipelineFilters && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{activeFilterCount}</Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[820px] max-w-[980px] p-4" align="start">
        <div className="flex gap-0 divide-x divide-border">
          <div className="flex-1 min-w-[140px] pr-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Etapa</p>
            <div className="space-y-1">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                <Checkbox checked={stageFilter === 'todos'} onCheckedChange={() => handleStageFilterChange('todos')} />
                Todas as etapas
              </label>
              {KANBAN_STAGES.map(s => (
                <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                  <Checkbox checked={stageFilter === s.key} onCheckedChange={() => handleStageFilterChange(stageFilter === s.key ? 'todos' : s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[130px] px-4">
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
          <div className="flex-1 min-w-[130px] px-4">
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
          <div className="min-w-[140px] px-4">
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
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="p-3 pointer-events-auto" />
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
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-col justify-between min-w-[120px] pl-4">
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
  );
  const selectedViewOrder = useMemo(() => 
    (pedidos ?? []).find(p => p.id === viewOrderId),
  [pedidos, viewOrderId]);

  const viewOrderSheet = (
    <Sheet open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-6 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <SheetTitle className="text-xl font-bold">
                {selectedViewOrder?.cliente?.empresa ?? 'Detalhes do Negócio'}
              </SheetTitle>
              <SheetDescription>
                {selectedViewOrder?.obra?.nome_obra ?? 'Sem obra vinculada'}
              </SheetDescription>
            </div>
            {selectedViewOrder && (
              <Badge className={getStageBadgeClass(KANBAN_STAGES.find(s => s.key === selectedViewOrder.status)?.color ?? 'muted-foreground')}>
                {stageLabel(selectedViewOrder.status)}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {selectedViewOrder ? (
          <div className="py-6 space-y-8">
            {/* Grid de Dados */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Factory className="h-3 w-3" /> Fabricante
                </p>
                <p className="text-sm font-medium">{selectedViewOrder.fabricante?.nome ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Valor Total
                </p>
                <p className="text-sm font-bold text-primary">
                  {(selectedViewOrder.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Vendedor Responsável
                </p>
                <p className="text-sm font-medium">{selectedViewOrder.vendedor?.nome ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Data do Pedido
                </p>
                <p className="text-sm font-medium">
                  {format(new Date(selectedViewOrder.data_pedido), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Endereço */}
            {selectedViewOrder.endereco_entrega && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Endereço de Entrega</p>
                <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedViewOrder.endereco_entrega}</p>
                </div>
              </div>
            )}

            {/* Observações */}
            {selectedViewOrder.observacoes && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Observações</p>
                <div className="p-4 rounded-lg border bg-muted/20">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">"{selectedViewOrder.observacoes}"</p>
                </div>
              </div>
            )}

            {/* Histórico Recente */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Últimos Contatos</p>
              <div className="space-y-3">
                {!contatos?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">Nenhum registro de contato</p>
                ) : (
                  contatos.slice(0, 3).map(contact => {
                    const Icon = contactIcons[contact.tipo] ?? MessageSquare;
                    return (
                      <div key={contact.id} className="flex gap-3 p-3 rounded-lg border hover:bg-muted/10 transition-colors">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground leading-snug">{contact.descricao}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(contact.data_contato), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
          <div className="flex flex-1 gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => handleExportPdf()}>
              <FileDown className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
            <Button variant="destructive" onClick={() => { setViewOrderId(null); setConfirmDeleteOpen(true); setSelected(new Set([viewOrderId!])); }}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );


  const subtitle = isPipelineMode
    ? `${pipelineOrders.length} pedidos · Total: ${totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : `${pedidos?.length ?? 0} pedidos`;

  return (
    <AppLayout title="Negócios" subtitle={subtitle}>
      <div className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
        <div className="mb-4 md:mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
            {isPipelineMode && (
              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
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
            
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Buscar por cliente, obra ou fabricante..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            
            {filtrosPopover}
            {optionsPopover}
            
            {isPipelineMode && hasPipelineFilters && (
              <Button variant="ghost" size="icon" onClick={clearPipelineFilters} className="h-8 w-8 text-muted-foreground" title="Limpar filtros">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <Button size="sm" className="w-full sm:w-auto" onClick={() => navigate('/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Pedido</span><span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showKanban ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
              {KANBAN_STAGES.filter(stage => visibleKanbanStages.includes(stage.key)).map(stage => (
                <KanbanColumn
                  key={stage.key}
                  stageKey={stage.key as any}
                  label={stage.label}
                  colorClass={stage.color}
                  orders={ordersByStage[stage.key] ?? []}
                  onCardClick={setViewOrderId}
                />
              ))}
              <button
                type="button"
                onClick={() => setColunasDialogOpen(true)}
                className="flex flex-col items-center justify-center w-64 sm:w-72 min-w-[256px] sm:min-w-[288px] shrink-0 h-[200px] mt-[52px] rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary gap-2 group"
              >
                <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="font-medium text-sm">Adicionar Etapa</span>
              </button>
            </div>
          </DragDropContext>
        ) : (
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-4">
                {someSelected && (
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    Excluir {selected.size}
                  </Button>
                )}
              </div>

              <div className="w-full rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                      </TableHead>
                      {tableVisibleColumns.map(colId => (
                        <TableHead key={colId} className={cn(colId === 'acoes' && "w-[100px]")}>
                          {getLabel(colId)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tableVisibleColumns.length + 1} className="py-12 text-center text-muted-foreground">
                          Nenhum negócio encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(p => {
                        const camposExtras = (p as any).campos_extras || {};
                        return (
                          <TableRow key={p.id} className={`cursor-pointer hover:bg-muted/30 ${selected.has(p.id) ? 'bg-primary/5' : ''}`} onClick={() => setViewOrderId(p.id)}>
                            <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                              <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} aria-label={`Selecionar ${p.cliente?.empresa}`} />
                            </TableCell>
                            {tableVisibleColumns.map(colId => {
                              const isCustom = colId.startsWith('custom_');
                              const daysInStage = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
                              const isAlert = daysInStage >= 7;
                              if (isCustom) {
                                return (
                                  <TableCell key={colId} className="text-xs text-muted-foreground">
                                    {camposExtras[colId] || '—'}
                                  </TableCell>
                                );
                              }

                              switch (colId) {
                                case 'negocio':
                                  return (
                                    <TableCell key={colId} className="min-w-[300px]">
                                      <div className="space-y-2">
                                        {isAlert && (
                                          <div className="flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                                            <AlertTriangle className="h-3 w-3" />
                                            {daysInStage} dias nesta etapa
                                          </div>
                                        )}
                                        <p className="pr-4 text-sm font-semibold leading-snug text-card-foreground">
                                          {p.cliente?.empresa ?? 'Sem cliente'}
                                        </p>
                                        <div className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                            <span className="truncate">{p.obra?.nome_obra ?? '-'}</span>
                                          </div>
                                          <div className="flex min-w-0 items-center gap-2">
                                            <Factory className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                            <span className="truncate">{p.fabricante?.nome ?? '-'}</span>
                                          </div>
                                          <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                                            <DollarSign className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                                            {(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </div>
                                        </div>
                                      </div>
                                    </TableCell>
                                  );
                                case 'cliente':
                                  return <TableCell key={colId} className="font-medium">{p.cliente?.empresa ?? '-'}</TableCell>;
                                case 'obra':
                                  return <TableCell key={colId}>{p.obra?.nome_obra ?? '-'}</TableCell>;
                                case 'fabricante':
                                  return <TableCell key={colId}>{p.fabricante?.nome ?? '-'}</TableCell>;
                                case 'valor':
                                  return <TableCell key={colId}>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>;
                                case 'etapa':
                                  return (
                                    <TableCell key={colId}>
                                      <Badge className={getStageBadgeClass(KANBAN_STAGES.find(s => s.key === p.status)?.color ?? 'muted-foreground')}>
                                        {stageLabel(p.status)}
                                      </Badge>
                                    </TableCell>
                                  );
                                case 'vendedor':
                                  return <TableCell key={colId}>{p.vendedor?.nome ?? '-'}</TableCell>;
                                case 'acoes':
                                  return (
                                    <TableCell key={colId}>
                                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewOrderId(p.id)} title="Visualizar e Editar">
                                          <Eye className="h-4 w-4 text-primary" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  );
                                default:
                                  return <TableCell key={colId}>—</TableCell>;
                              }
                            })}
                          </TableRow>
                        );
                      })
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

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} negócio(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os itens e histórico de contatos vinculados também serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={selectAllDialogOpen} onOpenChange={setSelectAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja selecionar apenas os {currentPageIds.length} negócio(s) desta página ou todos os {filtered.length} negócio(s) filtrados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={selectPageOnly}>Apenas esta página ({currentPageIds.length})</Button>
            <Button variant="default" onClick={selectAllFiltered}>Todos ({filtered.length})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportPedidosDialog open={importOpen} onOpenChange={setImportOpen} />
      <KanbanColunasDialog open={colunasDialogOpen} onOpenChange={setColunasDialogOpen} />
      {viewOrderSheet}
    </AppLayout>
  );
};

export default Negocios;

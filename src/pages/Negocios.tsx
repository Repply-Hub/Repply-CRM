import { useEffect, useMemo, useState, useCallback, useDeferredValue, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { parse, isValid, startOfDay, endOfDay, parseISO } from 'date-fns';
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
  Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, EyeOff, Loader2, Pencil, FileDown,
  Settings2, Columns3, Trash2, Filter, X, ChevronDown, AlertTriangle, CalendarIcon,
  LayoutGrid, List as ListIcon, Building2, Factory, DollarSign, Clock, User, FileText,
  ChevronRight
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
import { FilterButton } from '@/components/FilterButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SearchWithRecent } from '@/components/SearchWithRecent';

const PEDIDOS_COLUMNS: ColumnDefinition[] = [
  { id: 'negocio', label: 'Negócio', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'contato', label: 'Contato', locked: false },
  { id: 'obra', label: 'Obra', locked: false },
  { id: 'fabricante', label: 'Fabricante', locked: false },
  { id: 'valor', label: 'Valor', locked: false },
  { id: 'etapa', label: 'Etapa', locked: false },
  { id: 'vendedor', label: 'Responsável/Vendedor', locked: false },
  { id: 'data_pedido', label: 'Criação', locked: false },
  { id: 'prazo_resposta', label: 'Fechamento', locked: false },
  { id: 'observacoes', label: 'Observações', locked: false },
  { id: 'acoes', label: 'Ações', locked: false },
];

const PAGE_SIZE = 10;
// Constante LEGACY_CARD_FIELDS removida pois as colunas agora são independentes.

const getStageBadgeClass = (corToken: string) => `bg-${corToken} text-white`;

const contactIcons: Record<string, typeof Mail> = { email: Mail, telefone: Phone, whatsapp: MessageSquare, visita: Eye };

type PageMode = 'pipeline' | 'negocios';
type PipelineView = 'kanban' | 'lista';
type LegacyView = 'pipeline' | 'lista';

interface NegociosProps {
  defaultView?: LegacyView;
}

const PedidoRow = memo(({ 
  pedido, 
  selected, 
  onToggle, 
  onClick, 
  visibleColumns, 
  KANBAN_STAGES, 
  getLabel, 
  stageLabel 
}: { 
  pedido: any, 
  selected: boolean, 
  onToggle: () => void, 
  onClick: () => void, 
  visibleColumns: string[],
  KANBAN_STAGES: any[],
  getLabel: (id: string) => string,
  stageLabel: (status: string) => string
}) => {
  const camposExtras = pedido.campos_extras || {};
  const daysInStage = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 86400000);
  const isAlert = daysInStage >= 7;

  return (
    <TableRow className={`cursor-pointer hover:bg-muted/30 ${selected ? 'bg-primary/5' : ''}`} onClick={onClick}>
      <TableCell className="w-10" onClick={e => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Selecionar ${pedido.cliente?.empresa}`} />
      </TableCell>
      {visibleColumns.map(colId => {
        // Colunas padrão do sistema
        const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);
        
        if (!isDefault) {
          // Busca o valor em camposExtras usando o ID da coluna ou o label (fallback)
          const value = camposExtras[colId] ?? camposExtras[getLabel(colId)];
          return (
            <TableCell key={colId} className="text-xs text-muted-foreground whitespace-nowrap px-4">
              {value || '—'}
            </TableCell>
          );
        }

        switch (colId) {
          case 'negocio':
            return (
              <TableCell key={colId} className="min-w-[250px] px-4">
                <div className="space-y-1">
                  {isAlert && (
                    <div className="flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {daysInStage} dias nesta etapa
                    </div>
                  )}
                  <p className="text-sm font-semibold leading-snug text-card-foreground">
                    {camposExtras['Negócio'] || pedido.cliente?.empresa || 'Sem nome'}
                  </p>
                </div>
              </TableCell>
            );
          case 'cliente':
            return <TableCell key={colId} className="font-medium whitespace-nowrap px-4">{pedido.cliente?.empresa ?? '-'}</TableCell>;
          case 'contato':
            return (
              <TableCell key={colId} className="whitespace-nowrap px-4">
                {camposExtras['Contato'] || '—'}
              </TableCell>
            );
          case 'obra':
            return <TableCell key={colId} className="whitespace-nowrap px-4">{pedido.obra?.nome_obra ?? pedido.endereco_entrega ?? '-'}</TableCell>;
          case 'fabricante':
            return <TableCell key={colId} className="whitespace-nowrap px-4">{pedido.fabricante?.nome ?? '-'}</TableCell>;
          case 'valor':
            return <TableCell key={colId} className="whitespace-nowrap px-4">{(pedido.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>;
          case 'etapa':
            const stage = KANBAN_STAGES.find(s => s.key === pedido.status);
            return (
              <TableCell key={colId} className="whitespace-nowrap px-4">
                <Badge className={`bg-${stage?.color || 'muted-foreground'} text-white`}>
                  {stageLabel(pedido.status)}
                </Badge>
              </TableCell>
            );
          case 'vendedor':
            return <TableCell key={colId} className="whitespace-nowrap px-4">{pedido.vendedor?.nome ?? '-'}</TableCell>;
          case 'data_pedido':
            return (
              <TableCell key={colId} className="whitespace-nowrap px-4">
                {pedido.data_pedido 
                  ? (() => {
                    const dateParts = pedido.data_pedido.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })()
                  : '—'}
              </TableCell>
            );
          case 'prazo_resposta':
            return (
              <TableCell key={colId} className="whitespace-nowrap px-4">
                {pedido.prazo_resposta 
                  ? (() => {
                    const dateParts = pedido.prazo_resposta.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })()
                  : '—'}
              </TableCell>
            );
          case 'observacoes':
            return <TableCell key={colId} className="max-w-[300px] truncate px-4" title={pedido.observacoes}>{pedido.observacoes || '—'}</TableCell>;
          case 'acoes':
            return (
              <TableCell key={colId} className="px-4 text-center">
                <div className="flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClick} title="Visualizar e Editar">
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
});

PedidoRow.displayName = 'PedidoRow';


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
  
  // O efeito de limpeza total foi removido para permitir que novas colunas importadas apareçam nas opções.
  // No entanto, vamos garantir que colunas duplicadas sejam limpas se detectadas.
  useEffect(() => {
    const savedAll = localStorage.getItem('pedidos_all_columns');
    if (savedAll) {
      try {
        const parsed = JSON.parse(savedAll);
        const unique = Array.from(new Map(parsed.map((c: any) => [c.id, c])).values());
        if (unique.length !== parsed.length) {
          localStorage.setItem('pedidos_all_columns', JSON.stringify(unique));
          window.dispatchEvent(new Event('storage'));
        }
      } catch (e) {}
    }
  }, []);


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
    deletePreset,
    resetToDefaults
  } = useTableSettings({
    key: 'pedidos',
    defaultColumns: PEDIDOS_COLUMNS,
  });

  // Reage a mudanças no localStorage (ex.: importação adicionou novas colunas extras)
  useEffect(() => {
    const handler = () => {
      const savedVisible = localStorage.getItem('pedidos_visible_columns');
      if (savedVisible) {
        try { setVisibleColumns(JSON.parse(savedVisible)); } catch {}
      }
      
      const savedAll = localStorage.getItem('pedidos_all_columns');
      if (savedAll) {
        // O hook useTableSettings já deve estar atualizando o estado 'columns' 
        // mas este handler ajuda a manter a sincronia em diferentes abas ou disparos de eventos.
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [setVisibleColumns]);

  const tableVisibleColumns = visibleColumns;
  
  // Filtrar colunas duplicadas que podem ter vindo de importações antigas
  // Prioriza as colunas padrão do sistema se houver conflito de label
  const allAvailableColumns = useMemo(() => {
    const seen = new Set<string>();
    return columns.filter(col => {
      const label = (getLabel(col.id) || '').toLowerCase().trim();
      const isDefault = PEDIDOS_COLUMNS.some(d => d.id === col.id);
      
      if (isDefault) {
        seen.add(label);
        return true;
      }
      
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  }, [columns, getLabel]);

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

  const [search, setSearch] = useState(() => localStorage.getItem('negocios_search') || '');
  const deferredSearch = useDeferredValue(search);
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
    
    if (value.trim() && showKanban) {
      const query = value.trim().toLowerCase();
      const firstMatch = pipelineOrders.find(o => 
        (o.clientName || '').toLowerCase().includes(query) || 
        (o.obra || '').toLowerCase().includes(query) || 
        (o.fabricante || '').toLowerCase().includes(query)
      );
      
      if (firstMatch) {
        setTimeout(() => {
          const element = document.getElementById(`kanban-card-${firstMatch.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
            }, 3000);
          }
        }, 100);
      }
    }
  };

  const handleStageFilterChange = (value: string) => {
    setStageFilter(value);
    setPage(1);
  };

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || (key || '');

  // Removido useEffect que forçava a substituição das colunas individuais pela coluna "negocio"
  // para permitir que o usuário escolha ver as colunas separadamente.

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
      if (p.data_pedido) {
        const pedidoDate = parseISO(p.data_pedido);
        if (dateFrom && startOfDay(pedidoDate) < startOfDay(dateFrom)) return false;
        if (dateTo && startOfDay(pedidoDate) > endOfDay(dateTo)) return false;
      } else if (dateFrom || dateTo) {
        // Se tem filtro de data mas o pedido não tem data, oculta
        return false;
      }
      return true;
    });
  }, [pedidos, isPipelineMode, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return baseListPedidos.filter(p => {
      if (stageFilter !== 'todos' && p.status !== stageFilter) return false;
      if (!q) return true;
      const empresa = (p.cliente?.empresa ?? '').toLowerCase();
      const fab = (p.fabricante?.nome ?? '').toLowerCase();
      return empresa.includes(q) || fab.includes(q);
    });
  }, [baseListPedidos, deferredSearch, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );
  const visibleColumnCount = Math.max(
    1,
    tableVisibleColumns.filter(id => id !== 'acoes').length + (tableVisibleColumns.includes('acoes') ? 2 : 0) + 1
  );

  useEffect(() => {
    localStorage.setItem('negocios_search', search);
  }, [search]);

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
    campos_extras: p.campos_extras || {},
  })), [pedidos]);

  const pipelineOrders = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return allOrders.filter(o => {
      if (selectedVendedores.length > 0 && !selectedVendedores.includes(o.vendedorId)) return false;
      if (selectedFabricantes.length > 0 && !selectedFabricantes.includes(o.fabricanteId)) return false;
      if (showOnlyAttention && o.daysInStage < o.alertDays) return false;
      if (o.createdAt) {
        const pedidoDate = parseISO(o.createdAt);
        if (dateFrom && startOfDay(pedidoDate) < startOfDay(dateFrom)) return false;
        if (dateTo && startOfDay(pedidoDate) > endOfDay(dateTo)) return false;
      } else if (dateFrom || dateTo) {
        return false;
      }
      if (q) {
        const clientName = (o.clientName || '').toLowerCase();
        const obra = (o.obra || '').toLowerCase();
        const fabricante = (o.fabricante || '').toLowerCase();
        if (!clientName.includes(q) && !obra.includes(q) && !fabricante.includes(q)) return false;
      }
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo, deferredSearch]);

  const ordersByStage = useMemo(() => {
    const map: Record<string, typeof pipelineOrders> = {};
    for (const stage of KANBAN_STAGES) map[stage.key] = [];
    for (const o of pipelineOrders) {
      if (map[o.stage]) map[o.stage].push(o);
    }
    return map;
  }, [pipelineOrders, KANBAN_STAGES]);

  const totalPipeline = useMemo(() => pipelineOrders.reduce((acc, o) => acc + (Number(o.valor) || 0), 0), [pipelineOrders]);
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
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setConfirmDeleteOpen(false);
      return;
    }

    setIsDeleting(true);
    let successCount = 0;
    
    try {
      // Para acelerar a exclusão, processamos lotes maiores se possível,
      // mas mantemos a segurança deletando apenas a tabela principal 'pedidos'.
      // As tabelas vinculadas (itens_pedido, historico_contatos, etc.) já possuem CASCADE no banco,
      // então deletar o pedido removerá automaticamente seus vínculos de forma muito mais rápida.
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        
        // Deleta os pedidos em massa diretamente. O banco de dados cuida dos itens vinculados (CASCADE).
        const { error } = await supabase.from('pedidos').delete().in('id', batch);
        
        if (error) {
          console.error('[bulk-delete error]', error);
          toast.error(`Erro ao remover lote: ${error.message}`);
          break; // Para em caso de erro crítico de permissão
        } else {
          successCount += batch.length;
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      
      if (successCount > 0) {
        toast.success(`${successCount} negócio(s) removido(s) com sucesso!`);
      }
      
      setSelected(new Set());
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('[bulk-delete pedidos]', err);
      toast.error(err?.message || 'Erro inesperado ao remover negócios');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async (specificPedidoId?: string) => {
    if (specificPedidoId) {
      const p = pedidos?.find(p => p.id === specificPedidoId);
      if (!p) return;
      await generatePedidosPdf(
        [{
          cliente: p.cliente?.empresa ?? '-',
          obra: p.obra?.nome_obra ?? '-',
          fabricante: p.fabricante?.nome ?? '-',
          vendedor: p.vendedor?.nome ?? '-',
          valor: p.valor_total ?? 0,
          etapa: stageLabel(p.status),
          data: p.data_pedido,
        }],
        `Negócio - ${p.cliente?.empresa ?? p.id}`
      );
      return;
    }

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

  const optionsPopover = useMemo(() => (
    <ColumnSettings
      columns={columns}
      visibleColumns={visibleColumns}
      onChange={setVisibleColumns}
      onRename={handleRename}
      onTypeChange={handleTypeChange}
      onAdd={handleAddColumn}
      onRemove={handleRemoveColumn}
      onReorder={handleReorder}
      presets={presets}
      onSavePreset={savePreset}
      onLoadPreset={loadPreset}
      onDeletePreset={deletePreset}
      label="Colunas"
    >
      <div className="flex flex-col gap-1 p-1">
        <div className="px-3 py-2 border-b border-border/50 mb-1">
          <h4 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Menu de Opções</h4>
        </div>

        {showKanban && (
          <div className="space-y-1 mb-2">
            <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 rounded mx-1">
              Etapas Kanban
            </div>
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
                    'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-all text-left mx-0',
                    'hover:bg-muted/80 disabled:cursor-not-allowed',
                    !checked && 'opacity-40'
                  )}
                >
                  <span className={cn('h-3 w-3 rounded-sm shrink-0 border border-border/40', `bg-${stage.color}`)} />
                  <span className="flex-1 truncate">{stage.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleKanbanStagesChange(KANBAN_STAGES.map(s => s.key))}
              className="w-full text-center text-[10px] text-primary font-bold px-2 py-1.5 mt-1 rounded-md hover:bg-primary/5 transition-colors uppercase tracking-wider"
            >
              Resetar etapas
            </button>
            <div className="h-px bg-border/50 my-1 mx-2" />
          </div>
        )}

        <button
          onClick={() => setImportOpen(true)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 transition-colors group"
        >
          <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          <span>Importar Excel</span>
        </button>

        <button
          onClick={() => handleExportPdf()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 transition-colors group"
        >
          <FileDown className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          <span>Exportar PDF</span>
        </button>

        {showKanban && (
          <button
            type="button"
            onClick={() => setColunasDialogOpen(true)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 transition-all group"
          >
            <Columns3 className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            <span>Gerenciar colunas Kanban</span>
          </button>
        )}

        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={selected.size === 0}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-destructive/10 text-destructive disabled:opacity-50 disabled:hover:bg-transparent transition-colors group"
        >
          <Trash2 className="h-4 w-4 opacity-70 group-hover:opacity-100" />
          <span>Excluir Selecionados ({selected.size})</span>
        </button>

        <div className="h-px bg-border/50 my-1 mx-2" />
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Isso irá remover todas as colunas personalizadas e restaurar a visualização padrão. Deseja continuar?')) {
              resetToDefaults();
            }
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Resetar todas as configurações</span>
        </button>
      </div>
    </ColumnSettings>
  ), [
    columns,
    visibleColumns,
    setVisibleColumns,
    handleRename,
    handleTypeChange,
    handleAddColumn,
    handleRemoveColumn,
    handleReorder,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    resetToDefaults,
    selected.size,
    showKanban,
    KANBAN_STAGES,
    visibleKanbanStages,
    toggleKanbanStage,
    handleKanbanStagesChange
  ]);

  const filtrosPopover = useMemo(() => (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-10 gap-2.5 rounded-lg border-border/60 bg-background px-4 font-medium transition-all hover:border-primary/50 hover:bg-primary/[0.02] data-[state=open]:bg-primary/10 data-[state=open]:text-primary data-[state=open]:border-primary/50 shadow-sm active:scale-[0.98]",
            hasPipelineFilters && "data-[state=closed]:border-primary/50 data-[state=closed]:bg-primary/[0.02] data-[state=closed]:text-primary data-[state=open]:border-primary/50 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
          )}
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 bg-primary text-primary-foreground">
              {activeFilterCount}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-64 p-2 shadow-2xl border-border/40 z-[50] bg-background">
        <div className="flex flex-col gap-1">
          <div className="px-3 py-2 border-b border-border/50 mb-1">
            <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Filtros</h4>
          </div>

          {/* Submenu Etapa */}
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 data-[state=open]:bg-primary/10 data-[state=open]:text-primary transition-colors group">
                <div className="flex items-center gap-3">
                  <LayoutGrid className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span>Etapa</span>
                </div>
                <div className="flex items-center gap-2">
                  {stageFilter !== 'todos' && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-primary/10 text-primary border-none">1</Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" sideOffset={10} className="w-60 p-3 shadow-xl border-border/40 bg-background z-[60]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Selecionar Etapa</p>
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
            </PopoverContent>
          </Popover>

          {/* Submenu Vendedor */}
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 data-[state=open]:bg-primary/10 data-[state=open]:text-primary transition-colors group">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span>Vendedor</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedVendedores.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-primary/10 text-primary border-none">
                      {selectedVendedores.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" sideOffset={10} className="w-60 p-3 shadow-xl border-border/40 bg-background z-[60]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Filtrar por Vendedor</p>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {(vendedores ?? []).map(v => (
                  <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={selectedVendedores.includes(v.id)} onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)} />
                    {v.nome}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Submenu Fabricante */}
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 data-[state=open]:bg-primary/10 data-[state=open]:text-primary transition-colors group">
                <div className="flex items-center gap-3">
                  <Factory className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span>Fabricante</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFabricantes.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-primary/10 text-primary border-none">
                      {selectedFabricantes.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" sideOffset={10} className="w-60 p-3 shadow-xl border-border/40 bg-background z-[60]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Filtrar por Fabricante</p>
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
            </PopoverContent>
          </Popover>

          {/* Submenu Período */}
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/80 data-[state=open]:bg-primary/10 data-[state=open]:text-primary transition-colors group">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span>Período</span>
                </div>
                <div className="flex items-center gap-2">
                  {(dateFrom || dateTo) && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-primary/10 text-primary border-none">Ativo</Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" sideOffset={10} className="w-64 p-4 shadow-xl border-border/40 bg-background z-[60]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <CalendarIcon className="h-3 w-3" /> Data Início
                  </p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-left font-normal h-9",
                          !dateFrom && "text-muted-foreground"
                        )}
                      >
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecione..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <CalendarIcon className="h-3 w-3" /> Data Final
                  </p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-left font-normal h-9",
                          !dateTo && "text-muted-foreground"
                        )}
                      >
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecione..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="h-px bg-border/50 my-1" />

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros de Atenção</p>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={showOnlyAttention} onCheckedChange={() => setShowOnlyAttention(prev => !prev)} />
                    Atenção (7+ dias)
                  </label>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {(hasPipelineFilters || search.trim() !== '') && (
            <>
              <div className="h-px bg-border/50 my-1" />
              <button
                onClick={clearPipelineFilters}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Limpar Filtros</span>
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  ), [hasPipelineFilters, activeFilterCount, clearPipelineFilters, KANBAN_STAGES, stageFilter, handleStageFilterChange, vendedores, selectedVendedores, toggleFilter, fabricantes, selectedFabricantes, dateFrom, setDateFrom, dateTo, setDateTo, showOnlyAttention, setShowOnlyAttention, search]);
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
                  <User className="h-3 w-3" /> Negócio
                </p>
                <p className="text-sm font-medium">
                  {selectedViewOrder.campos_extras?.['Negócio'] || selectedViewOrder.cliente?.empresa || 'Sem nome'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Cliente
                </p>
                {selectedViewOrder.cliente ? (
                  <button 
                    onClick={() => navigate(`/clientes/${selectedViewOrder.cliente?.id}`)}
                    className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                  >
                    {selectedViewOrder.cliente.empresa}
                    <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Obra
                </p>
                {selectedViewOrder.obra ? (
                  <button 
                    onClick={() => navigate(`/obras/${selectedViewOrder.obra?.id}`)}
                    className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                  >
                    {selectedViewOrder.obra.nome_obra}
                    <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <p className="text-sm font-medium">{selectedViewOrder.obra?.nome_obra ?? '-'}</p>
                )}
              </div>
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
                {selectedViewOrder.vendedor ? (
                  <button 
                    onClick={() => navigate(`/usuarios/${selectedViewOrder.vendedor?.id}`)}
                    className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                  >
                    {selectedViewOrder.vendedor.nome}
                    <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Data de Criação
                </p>
                <p className="text-sm font-medium">
                  {selectedViewOrder.data_pedido ? (() => {
                    const dateParts = selectedViewOrder.data_pedido.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })() : '-'}
                </p>
              </div>
              {selectedViewOrder.prazo_resposta && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarIcon className="h-3 w-3" /> Data de Fechamento
                  </p>
                  <p className="text-sm font-medium">
                    {(() => {
                      const dateParts = selectedViewOrder.prazo_resposta.split('-');
                      return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    })()}
                  </p>
                </div>
              )}
              {/* Renderização de Campos Extras dinâmicos */}
              {tableVisibleColumns.map(colId => {
                const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);
                if (isDefault || colId === 'acoes') return null;
                
                const value = selectedViewOrder.campos_extras?.[colId] ?? selectedViewOrder.campos_extras?.[getLabel(colId)];
                if (!value) return null;

                return (
                  <div key={colId} className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> {getLabel(colId)}
                    </p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                );
              })}
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
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => handleExportPdf(viewOrderId || undefined)}>
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


  const isFiltered = hasPipelineFilters || deferredSearch.trim() !== '';

  const subtitle = isPipelineMode
    ? `${pipelineOrders.length} negócios${isFiltered ? ' (filtrados)' : ''} · Total: ${(totalPipeline || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : `${filtered.length} negócios${isFiltered ? ' (filtrados)' : ''} · Total: ${(filtered.reduce((acc, p) => acc + (Number(p.valor_total) || 0), 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

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
            
            <SearchWithRecent
              placeholder="Buscar por cliente, obra ou fabricante..."
              value={search}
              onValueChange={handleSearchChange}
              storageKey="negocios_recent_searches"
              className="min-w-[240px]"
            />
            
            {filtrosPopover}
            {optionsPopover}
            
            {isPipelineMode && hasPipelineFilters && (
              <Button variant="ghost" size="icon" onClick={clearPipelineFilters} className="h-8 w-8 text-muted-foreground" title="Limpar filtros">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <Button size="sm" className="w-full sm:w-auto h-10" onClick={() => navigate('/pedidos/novo')}>
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
                  visibleColumns={visibleColumns}
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

              <div className="w-full rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                      </TableHead>
                      {tableVisibleColumns.map(colId => (
                        <TableHead key={colId} className={cn(
                          "whitespace-nowrap px-4 py-3 text-xs font-semibold",
                          colId === 'acoes' ? "w-[80px] text-center" : "min-w-[150px]"
                        )}>
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
                      paginated.map(p => (
                        <PedidoRow
                          key={p.id}
                          pedido={p}
                          selected={selected.has(p.id)}
                          onToggle={() => toggleOne(p.id)}
                          onClick={() => setViewOrderId(p.id)}
                          visibleColumns={tableVisibleColumns}
                          KANBAN_STAGES={KANBAN_STAGES}
                          getLabel={getLabel}
                          stageLabel={stageLabel}
                        />
                      ))

                    )}
                  </TableBody>
                  </Table>
                </div>
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

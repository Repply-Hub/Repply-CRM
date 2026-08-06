import { useEffect, useMemo, useState, useCallback, useDeferredValue, useRef, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { parse, isValid, startOfMonth, endOfMonth } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { KanbanColunasDialog } from '@/components/pedidos/kanban/KanbanColunasDialog';
import { useMarcadores } from '@/hooks/use-marcadores';
import { MarcadoresDialog } from '@/components/pedidos/MarcadoresDialog';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { useFunis } from '@/hooks/use-funis';
import { useConfiguracoesCampos, isCampoObrigatorioNaEtapa, resolveFieldLabel } from '@/hooks/use-configuracoes-campos';
import { usePedidos, usePedidosStats, useHistoricoContatos, usePedidoHistoricoStatus, useUpdatePedidoStatus, useBulkDeletePedidos, useBulkUpdatePedidos, type PedidosFilters, type PedidoWithRelations } from '@/hooks/use-pedidos';
import { useTarefasPorPedido, type Tarefa } from '@/hooks/use-tarefas';
import { UserProfilePopover } from '@/components/layout/UserProfilePopover';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { mapPedidoToOrder } from '@/lib/pedido-to-order';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StandardPopoverMenu, StandardMenuItem } from '@/components/ui/standard-popover-menu';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, EyeOff, Loader2, Pencil, FileDown,
  Settings2, Columns3, Trash2, Filter, X, ChevronDown, AlertTriangle, CalendarIcon,
  LayoutGrid, List as ListIcon, Building2, Factory, DollarSign, Clock, User, FileText,
  ChevronRight, FileWarning, FileSpreadsheet, FolderKanban, Rows3, History, Tag, ArrowRightLeft
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { PedidoRow } from '@/lib/generate-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColumnSettings, type ColumnDefinition, ColumnSettingsItem, ColumnSettingsHeader, ColumnSettingsPopover } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImportDialog } from '@/components/ImportDialog';
import { ListPagination } from '@/components/shared/ListPagination';
import { ResizableTh } from '@/components/shared/ResizableTh';
import { KanbanColumn } from '@/components/pedidos/kanban/KanbanColumn';
import { FilterButton } from '@/components/shared/FilterButton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { filenameFromUrl } from '@/lib/download-file';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';

const ImportPedidosDialog = lazy(() =>
  import('@/components/pedidos/ImportPedidosDialog').then(m => ({ default: m.ImportPedidosDialog }))
);

const PEDIDOS_COLUMNS: ColumnDefinition[] = [
  { id: 'negocio', label: 'Negócio', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'contato', label: 'Contato', locked: false },
  { id: 'endereco_entrega', label: 'Obra/Endereço', locked: false },
  { id: 'fabricante', label: 'Fabricante', locked: false },
  { id: 'valor', label: 'Valor', locked: false },
  { id: 'vendedor', label: 'Responsável/Vendedor', locked: false },
  { id: 'etapa', label: 'Etapa', locked: false },
  { id: 'marcador', label: 'Marcador', locked: false },
  { id: 'data_pedido', label: 'Criação', locked: false },
  { id: 'prazo_resposta', label: 'Fechamento', locked: false },
  { id: 'observacoes', label: 'Observações', locked: false },
  { id: 'anexo', label: 'Anexo', locked: false },
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
  columns,
  KANBAN_STAGES, 
  getLabel, 
  stageLabel 
}: { 
  pedido: any, 
  selected: boolean, 
  onToggle: () => void, 
  onClick: () => void, 
  visibleColumns: string[],
  columns: any[],
  KANBAN_STAGES: any[],
  getLabel: (id: string) => string,
  stageLabel: (status: string) => string
}) => {
  const camposExtras = pedido.campos_extras || {};
  const daysInStage = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 86400000);
  // "Fechamento" (ganho) e "Perdido" são etapas finais — negócio parado nelas não é um
  // alerta de estagnação, é o resultado esperado do funil.
  const isEtapaFinal = pedido.status === 'fechamento' || pedido.status === 'perdido';
  const isAlert = !isEtapaFinal && daysInStage >= 7;

  return (
    <TableRow className={`cursor-pointer hover:bg-muted/30 ${selected ? 'bg-primary/5' : ''}`} onClick={onClick}>
      <TableCell className="w-10 py-2 px-2.5" onClick={e => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Selecionar ${pedido.cliente?.empresa}`} />
      </TableCell>
      {columns.filter(col => visibleColumns.includes(col.id)).map(col => {
        const colId = col.id;
        // Colunas padrão do sistema
        const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);

        // Coluna legada "pdf_url" (renomeada só no label para "Anexo", nunca no id)
        // — trata como alias de "anexo" para nunca ler o valor bruto de campos_extras.
        if (colId === 'pdf_url') {
          return (
            <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5" onClick={e => e.stopPropagation()}>
              {pedido.pdf_url ? (
                <a
                  href={repairCorruptedBitrixUrl(pedido.pdf_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> PDF
                </a>
              ) : '—'}
            </TableCell>
          );
        }

        if (!isDefault) {
          // Busca o valor em camposExtras usando o ID da coluna ou o label (fallback)
          const value = camposExtras[colId] ?? camposExtras[getLabel(colId)];
          return (
            <TableCell key={colId} className="text-xs text-muted-foreground whitespace-nowrap py-2 px-2.5">
              {value || '—'}
            </TableCell>
          );
        }

        switch (colId) {
          case 'negocio':
            return (
              <TableCell key={colId} className="min-w-[200px] font-medium py-2 px-2.5 whitespace-nowrap">
                {[pedido.cliente?.empresa, pedido.fabricante?.nome].filter(Boolean).join(' | ') || '—'}
              </TableCell>
            );
          case 'cliente':
            return (
              <TableCell key={colId} className="min-w-[200px] font-medium py-2 px-2.5">
                <div className="space-y-1">
                  {isAlert && (
                    <div className="flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {daysInStage} dias nesta etapa
                    </div>
                  )}
                  <p className="whitespace-nowrap">{pedido.cliente?.empresa ?? '-'}</p>
                </div>
              </TableCell>
            );
          case 'contato':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {camposExtras['Contato'] || '—'}
              </TableCell>
            );
          case 'anexo':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5" onClick={e => e.stopPropagation()}>
                {pedido.pdf_url ? (
                  <a
                    href={repairCorruptedBitrixUrl(pedido.pdf_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </a>
                ) : '—'}
              </TableCell>
            );
          case 'endereco_entrega':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{pedido.endereco_entrega ?? pedido.obra?.nome_obra ?? '-'}</TableCell>;
          case 'fabricante':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{pedido.fabricante?.nome ?? '-'}</TableCell>;
          case 'valor':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{(pedido.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>;
          case 'etapa':
            const stage = KANBAN_STAGES.find(s => s.key === pedido.status);
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                <Badge className={`bg-${stage?.color || 'muted-foreground'} text-white`}>
                  {stageLabel(pedido.status)}
                </Badge>
              </TableCell>
            );
          case 'marcador':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.marcador ? (
                  <Badge className={`bg-${pedido.marcador.cor} text-white`}>{pedido.marcador.nome}</Badge>
                ) : '—'}
              </TableCell>
            );
          case 'vendedor':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{pedido.vendedor?.nome ?? '-'}</TableCell>;
          case 'data_pedido':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
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
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.prazo_resposta
                  ? (() => {
                    const dateParts = pedido.prazo_resposta.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })()
                  : '—'}
              </TableCell>
            );
          case 'observacoes':
            return <TableCell key={colId} className="max-w-[300px] truncate py-2 px-2.5" title={pedido.observacoes}>{pedido.observacoes || '—'}</TableCell>;
          case 'acoes':
            return (
              <TableCell key={colId} className="py-2 px-2.5 text-center">
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
  const { profile, loading: isUserLoading } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  // Funil ativo do Kanban/Lista — persistido, com fallback pro funil padrão da empresa
  // assim que a lista de funis carrega (ou se o funil salvo não existir mais).
  const { data: funis } = useFunis(empresaId);
  const [funilId, setFunilId] = useState<string | undefined>(
    () => localStorage.getItem('negocios_funil_id') || undefined
  );
  useEffect(() => {
    if (!funis || funis.length === 0) return;
    if (funilId && funis.some(f => f.id === funilId)) return;
    const padrao = funis.find(f => f.is_padrao) ?? funis[0];
    setFunilId(padrao.id);
  }, [funis, funilId]);
  useEffect(() => {
    if (funilId) localStorage.setItem('negocios_funil_id', funilId);
  }, [funilId]);

  const { data: kanbanColunas } = useKanbanColunas(empresaId, funilId);
  const { data: camposConfigPedidos } = useConfiguracoesCampos('pedidos', empresaId);

  const KANBAN_STAGES = useMemo(
    () => (kanbanColunas ?? []).map(c => ({ key: c.slug, label: c.nome, color: c.cor })),
    [kanbanColunas]
  );

  const [colunasDialogOpen, setColunasDialogOpen] = useState(false);
  const [marcadoresDialogOpen, setMarcadoresDialogOpen] = useState(false);
  const { data: marcadores } = useMarcadores(empresaId);

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
    resetToDefaults,
    columnWidths,
    setColumnWidth,
  } = useTableSettings({
    key: 'pedidos',
    defaultColumns: PEDIDOS_COLUMNS,
  });

  // Corrige o rótulo legado da coluna de anexo ("Pdf da cotação" e variações), criada por
  // importações antigas antes do campo virar genérico — o padrão atual passou a ser "Anexo".
  useEffect(() => {
    if (columns.some(c => c.id === 'pdf_url') && getLabel('pdf_url') !== 'Anexo') {
      handleRename('pdf_url', 'Anexo');
    }
  }, [columns, getLabel, handleRename]);

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
  const [importDialogMounted, setImportDialogMounted] = useState(false);
  const [importAiOpen, setImportAiOpen] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const { data: contatos } = useHistoricoContatos(selectedOrder || viewOrderId);
  const { data: tarefasNegocio } = useTarefasPorPedido(viewOrderId);
  const { data: historicoStatusNegocio } = usePedidoHistoricoStatus(viewOrderId);
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = useMemo(
    () => tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome })),
    [tarefasKanbanColunas]
  );
  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [editingTarefaNegocio, setEditingTarefaNegocio] = useState<Tarefa | null>(null);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTargetId, setExportTargetId] = useState<string | undefined>(undefined);

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);
  const [selectedMarcadores, setSelectedMarcadores] = useState<string[]>([]);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [hideImportados, setHideImportados] = useState(false);
  // Por padrão, o filtro de Período já entra selecionado no mês atual — "Limpar filtros"
  // continua zerando pra nenhum período (ver clearPipelineFilters), esse default e' só o
  // estado inicial ao abrir a aba.
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => endOfMonth(new Date()));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Move de kanban bloqueado por campo obrigatório na etapa de destino ainda não preenchido.
  const [blockedMove, setBlockedMove] = useState<{ pedidoId: string; targetLabel: string; missingLabels: string[] } | null>(null);
  const [deleteAllFilteredMode, setDeleteAllFilteredMode] = useState(false);
  // Ids excluídos manualmente enquanto deleteAllFilteredMode está ativo — sem isso, desmarcar
  // um único item (numa página que não carrega os N ids filtrados no cliente) derrubava o modo
  // "todos" inteiro e caía pra seleção da página atual, mostrando "excluir 9" em vez de "excluir 99".
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);
  const bulkDeleteMutation = useBulkDeletePedidos();
  const isDeleting = bulkDeleteMutation.isPending;

  // Ação em massa (etapa + marcador num só bloco) opera sobre os MESMOS filtros usados pela
  // tela (selectedStages, selectedVendedores, ... — ver pedidosFilters/activeStages logo abaixo),
  // não sobre uma seleção manual de linhas — por isso funciona tanto no Kanban quanto na Lista.
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkApplyStatus, setBulkApplyStatus] = useState(false);
  const [bulkApplyMarcador, setBulkApplyMarcador] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');
  const [bulkNewMarcadorId, setBulkNewMarcadorId] = useState('');
  const bulkUpdateMutation = useBulkUpdatePedidos();
  const isBulkUpdating = bulkUpdateMutation.isPending;

  // Column settings are now managed by useTableSettings hook


  const [visibleKanbanStages, setVisibleKanbanStages] = useState<string[]>(() => {
    if (!funilId) return [];
    const saved = localStorage.getItem(`pedidos_kanban_stages_${funilId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Ao trocar de funil, as etapas visíveis/filtradas do funil anterior não existem mais
  // neste board — reseta em vez de herdar (o efeito de sincronia com kanbanColunas, logo
  // abaixo, repopula a partir do localStorage específico deste funil).
  useEffect(() => {
    if (!funilId) return;
    const saved = localStorage.getItem(`pedidos_kanban_stages_${funilId}`);
    setVisibleKanbanStages(saved ? JSON.parse(saved) : []);
    setSelectedStages([]);
  }, [funilId]);

  // Todos os useState declarados — agora seguro referenciar selectedStages no hook
  // Kanban: cada coluna busca só o seu status, com seu próprio limit (ver KanbanColumn.tsx).
  // "Exibir" só define o limit INICIAL/por-clique de cada coluna — não existe mais um
  // fetch único compartilhado para o board inteiro.
  const KANBAN_PAGE_SIZE_OPTIONS = [10, 50, 100];
  const [kanbanPageSize, setKanbanPageSize] = useState(50);

  const activeStages = selectedStages.length > 0 ? selectedStages : undefined;
  const pedidosFilters: PedidosFilters = useMemo(() => ({
    vendedorIds: selectedVendedores.length > 0 ? selectedVendedores : undefined,
    fabricanteIds: selectedFabricantes.length > 0 ? selectedFabricantes : undefined,
    marcadorIds: selectedMarcadores.length > 0 ? selectedMarcadores : undefined,
    dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
    dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
    onlyAttention: showOnlyAttention || undefined,
    // Usada tanto pela query de stats (header) quanto pelo fetch paginado da lista/kanban —
    // ambos aplicam o mesmo filtro no servidor, então total/páginas e linhas exibidas ficam consistentes.
    search: deferredSearch.trim() || undefined,
    // Também enviado pra usePedidosStats — sem isso, o total/paginação do cabeçalho continuava
    // contando negócios importados mesmo com a lista escondendo-os, podendo mostrar "N negócios"
    // com a tabela vazia quando todos os resultados eram importados.
    hideImportados: hideImportados || undefined,
    funilId,
  }), [selectedVendedores, selectedFabricantes, selectedMarcadores, dateFrom, dateTo, showOnlyAttention, deferredSearch, hideImportados, funilId]);

  // Essa query só serve a view Lista agora — desabilitada no Kanban, já que cada coluna
  // busca seus próprios dados de forma independente.
  const { data: pedidosData, isLoading: isPedidosLoading, isFetching: isPedidosFetching } = usePedidos(
    empresaId,
    page - 1,
    pageSize,
    activeStages,
    pedidosFilters,
    !showKanban,
  );
  const { data: pedidosStats, isFetching: isStatsFetching } = usePedidosStats(empresaId, activeStages, pedidosFilters);
  const isLoading = isUserLoading || (!showKanban && isPedidosLoading);
  // Com `placeholderData: keepPreviousData`, trocar de página/filtro/busca mantém o conteúdo
  // anterior visível sem acionar `isLoading` de novo — sem isso o usuário não tinha nenhum
  // sinal de que uma nova busca já estava em andamento no servidor.
  const isRefetching = !isLoading && (isPedidosFetching || isStatsFetching);
  const pedidos = useMemo(() => pedidosData?.data ?? [], [pedidosData]);
  const totalCount = pedidosStats?.count ?? 0;
  const totalValor = pedidosStats?.valor ?? 0;

  useEffect(() => {
    if (!kanbanColunas || !funilId) return;
    const storageKey = `pedidos_kanban_stages_${funilId}`;
    const allKeys = kanbanColunas.map(c => c.slug);
    setVisibleKanbanStages(prev => {
      const filtered = prev.filter(k => allKeys.includes(k));
      const novas = allKeys.filter(k => !prev.includes(k));
      if (prev.length === 0) {
        localStorage.setItem(storageKey, JSON.stringify(allKeys));
        return allKeys;
      }
      const next = [...filtered, ...novas];
      if (next.length !== prev.length || next.some((k, i) => k !== prev[i])) {
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [kanbanColunas, funilId]);

  const handleKanbanStagesChange = (next: string[]) => {
    setVisibleKanbanStages(next);
    if (funilId) localStorage.setItem(`pedidos_kanban_stages_${funilId}`, JSON.stringify(next));
  };

  const toggleAllKanbanStages = () => {
    if (visibleKanbanStages.length >= KANBAN_STAGES.length && KANBAN_STAGES.length > 0) {
      handleKanbanStagesChange([KANBAN_STAGES[0].key]);
    } else {
      handleKanbanStagesChange(KANBAN_STAGES.map(s => s.key));
    }
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

  // Função substituída pela seleção múltipla de etapas, o reset de página é gerenciado pelo useEffect ou quando clica.

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || (key || '');

  // Removido useEffect que forçava a substituição das colunas individuais pela coluna "negocio"
  // para permitir que o usuário escolha ver as colunas separadamente.

  // `pedidos` já vem do servidor paginado e filtrado por TODOS os critérios (vendedor,
  // fabricante, marcador, etapa, atenção, data, busca, importados) através dos mesmos
  // `pedidosFilters`/`activeStages` usados por usePedidosStats — reaplicar esses filtros aqui
  // no cliente é redundante e, pior, arriscava divergir do total/paginação do rodapé (o próprio
  // bug reportado: rodapé contando N negócios com a tabela mostrando outra coisa). O rodapé
  // (totalCount/totalPages) e as linhas exibidas (`filtered`) agora vêm sempre da mesma fonte.
  const filtered = pedidos;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginated = filtered;
  const visibleColumnCount = Math.max(
    1,
    tableVisibleColumns.filter(id => id !== 'acoes').length + (tableVisibleColumns.includes('acoes') ? 2 : 0) + 1
  );

  // Larguras resolvidas (persistida ou padrão) na MESMA ordem das colunas visíveis — usadas
  // tanto no <colgroup> quanto nos cabeçalhos, pra nunca ficarem dessincronizadas. A tabela
  // precisa de uma largura própria explícita (não w-full/auto) + colgroup: sem isso o navegador
  // redistribui/ajusta as larguras de coluna proporcionalmente ao redimensionar, ignorando o
  // valor exato escolhido pelo usuário (comportamento de table-layout:fixed com largura automática).
  const CHECKBOX_COL_WIDTH = 40;
  const visibleColumnDefs = columns.filter(col => tableVisibleColumns.includes(col.id));
  const resolvedColWidths = visibleColumnDefs.map(col => columnWidths[col.id] ?? (col.id === 'acoes' ? 80 : 150));
  const tableTotalWidth = CHECKBOX_COL_WIDTH + resolvedColWidths.reduce((a, b) => a + b, 0);

  // Largura visível (viewport) da área da tabela — usada pra manter o texto de "nenhum
  // resultado" centralizado na parte visível quando a tabela é mais larga que o container
  // e tem scroll horizontal (senão o texto centraliza na largura total da tabela, não na tela).
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  useEffect(() => {
    const el = tableViewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTableViewportWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem('negocios_search', search);
  }, [search]);

  // Volta para a primeira página da Lista quando filtros mudam (o Kanban reseta o próprio
  // lote de cada coluna sozinho, dentro do KanbanColumn, ao ver os filtros mudarem).
  useEffect(() => {
    setPage(1);
  }, [empresaId, deferredSearch, selectedStages, selectedVendedores, selectedFabricantes, selectedMarcadores, showOnlyAttention, hideImportados, dateFrom, dateTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Cada KanbanColumn busca só o seu próprio status (ver KanbanColumn.tsx) — os filtros de
  // vendedor/fabricante/período/atenção/busca já são aplicados lá (server-side, exceto a busca
  // livre que é client-side). Este estado só agrega o que cada coluna já buscou, para as
  // funções que precisam do pipeline inteiro: rolar até um card ao buscar e exportar PDF.
  const [kanbanPedidosByStage, setKanbanPedidosByStage] = useState<Record<string, PedidoWithRelations[]>>({});
  const handleKanbanColumnData = useCallback((stageKey: string, rows: PedidoWithRelations[]) => {
    setKanbanPedidosByStage(prev => (prev[stageKey] === rows ? prev : { ...prev, [stageKey]: rows }));
  }, []);
  const kanbanPedidosFlat = useMemo(
    () => Object.values(kanbanPedidosByStage).flat(),
    [kanbanPedidosByStage]
  );
  const pipelineOrders = useMemo(
    () => kanbanPedidosFlat.map(mapPedidoToOrder),
    [kanbanPedidosFlat]
  );

  const hasPipelineFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || selectedMarcadores.length > 0 || showOnlyAttention || hideImportados || !!dateFrom || !!dateTo || selectedStages.length > 0;
  const activeFilterCount = (selectedVendedores.length > 0 ? 1 : 0) + (selectedFabricantes.length > 0 ? 1 : 0) + (selectedMarcadores.length > 0 ? 1 : 0) + (showOnlyAttention ? 1 : 0) + (hideImportados ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (selectedStages.length > 0 ? 1 : 0);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearPipelineFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setSelectedMarcadores([]);
    setShowOnlyAttention(false);
    setHideImportados(false);
    setDateFrom(undefined);
    setDateTo(undefined);
    setSelectedStages([]);
  };

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    const label = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;

    // Bloqueia o move se algum campo obrigatório-nesta-etapa ainda não está preenchido.
    // Só checa campos cujo valor já está em memória (PedidoWithRelations) — campos como
    // origem_lead/itens/proximo_contato vivem em outras tabelas e não são checados aqui
    // (continuam validados normalmente ao criar/editar o negócio).
    const targetColunaId = kanbanColunas?.find(c => c.slug === destination.droppableId)?.id;
    const pedido = kanbanPedidosFlat.find(p => p.id === draggableId);
    if (pedido && targetColunaId) {
      const valoresPadrao: Record<string, string | number | null | undefined> = {
        cliente_id: pedido.cliente_id,
        fabricante_id: pedido.fabricante_id,
        vendedor_id: pedido.usuario_id,
        obra_id: pedido.obra_id,
        endereco_entrega: pedido.endereco_entrega,
        prazo_resposta: pedido.prazo_resposta,
        anexo_pdf: pedido.pdf_url,
        data_pedido: pedido.data_pedido,
        observacoes: pedido.observacoes,
        valor_manual: pedido.valor_total,
      };
      const missingLabels = (camposConfigPedidos ?? [])
        .filter(campo => isCampoObrigatorioNaEtapa(campo, targetColunaId))
        // origem_lead/itens/proximo_contato vivem fora de PedidoWithRelations, e "status" é
        // o próprio campo sendo alterado — nenhum dos quatro é checável aqui.
        .filter(campo => campo.origem !== 'padrao' || campo.campo_key in valoresPadrao)
        .filter(campo => {
          const valor = campo.origem === 'padrao' ? valoresPadrao[campo.campo_key] : pedido.campos_extras?.[campo.campo_key];
          return valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim());
        })
        .map(campo => resolveFieldLabel(campo));

      if (missingLabels.length > 0) {
        setBlockedMove({ pedidoId: draggableId, targetLabel: label, missingLabels });
        return;
      }
    }

    try {
      await updateStatus.mutateAsync({ id: draggableId, status: destination.droppableId });
      toast.success(`Negócio movido para "${label}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao mover o negócio');
    }
  }, [updateStatus, KANBAN_STAGES, kanbanColunas, kanbanPedidosFlat, camposConfigPedidos]);

  const currentPageIds = paginated.map(p => p.id);
  // No modo "todos os filtrados", uma linha está selecionada por padrão, a menos que tenha
  // sido explicitamente excluída — por isso o cálculo de "página inteira selecionada" e a
  // contagem exibida precisam descontar excludedIds em vez de olhar só pro `selected` local.
  const allPageSelected = currentPageIds.length > 0 && (
    deleteAllFilteredMode
      ? currentPageIds.every(id => !excludedIds.has(id))
      : currentPageIds.every(id => selected.has(id))
  );
  const selectedCount = deleteAllFilteredMode ? Math.max(0, totalCount - excludedIds.size) : selected.size;
  const someSelected = selectedCount > 0;

  const toggleOne = (id: string) => {
    if (deleteAllFilteredMode) {
      // Continua no modo "todos os filtrados": só acumula/desfaz a exclusão desse item
      // específico, sem descartar a seleção dos outros N-1 itens.
      setExcludedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (deleteAllFilteredMode) {
      setExcludedIds(prev => {
        const next = new Set(prev);
        if (allPageSelected) {
          currentPageIds.forEach(id => next.add(id));
        } else {
          currentPageIds.forEach(id => next.delete(id));
        }
        return next;
      });
      return;
    }
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else if (totalCount > currentPageIds.length) {
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
    setDeleteAllFilteredMode(false);
    setExcludedIds(new Set());
    setSelected(prev => {
      const next = new Set(prev);
      currentPageIds.forEach(id => next.add(id));
      return next;
    });
    setSelectAllDialogOpen(false);
  };

  const selectAllFiltered = () => {
    // Não carregamos milhares de ids no cliente: a exclusão em massa, nesse modo,
    // roda uma única query no servidor com os mesmos filtros ativos (empresa/funil/etapa),
    // descontando excludedIds quando o usuário desmarcar itens individualmente.
    setSelected(new Set());
    setExcludedIds(new Set());
    setDeleteAllFilteredMode(true);
    setSelectAllDialogOpen(false);
  };

  const handleBulkDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'APAGAR' || !empresaId) return;

    try {
      const removed = deleteAllFilteredMode
        ? await bulkDeleteMutation.mutateAsync({
            empresaId,
            stages: activeStages,
            filters: pedidosFilters,
            excludeIds: excludedIds.size > 0 ? Array.from(excludedIds) : undefined,
          })
        : await bulkDeleteMutation.mutateAsync({ ids: Array.from(selected) });

      if (removed > 0) {
        toast.success(`${removed} negócio(s) removido(s) com sucesso!`);
      }

      setSelected(new Set());
      setDeleteAllFilteredMode(false);
      setExcludedIds(new Set());
      setDeleteConfirmText('');
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('[bulk-delete pedidos]', err);
      toast.error(err?.message || 'Erro inesperado ao remover negócios');
    }
  };

  // Alvo é sempre "os negócios que batem com os filtros atuais da tela" (pedidosFilters/
  // activeStages, os mesmos usados pelo Kanban/Lista) — o modal edita esse MESMO estado de
  // filtro em vez de duplicar uma cópia própria, então a contagem exibida (totalCount/totalValor)
  // já reflete exatamente o que será alterado.
  const handleBulkApply = async () => {
    if (!empresaId) return;
    const updates: { status?: string; marcador_id?: string | null } = {};
    if (bulkApplyStatus && bulkNewStatus) updates.status = bulkNewStatus;
    if (bulkApplyMarcador && bulkNewMarcadorId) updates.marcador_id = bulkNewMarcadorId === 'nenhum' ? null : bulkNewMarcadorId;
    if (Object.keys(updates).length === 0) return;

    try {
      const updated = await bulkUpdateMutation.mutateAsync({
        target: { empresaId, stages: activeStages, filters: pedidosFilters },
        updates,
      });
      if (updated > 0) {
        toast.success(`${updated} negócio(s) atualizado(s) com sucesso!`);
      }
      setBulkEditOpen(false);
      setBulkApplyStatus(false);
      setBulkApplyMarcador(false);
      setBulkNewStatus('');
      setBulkNewMarcadorId('');
    } catch (err: any) {
      console.error('[bulk-update pedidos]', err);
      toast.error(err?.message || 'Erro inesperado ao aplicar a alteração em massa');
    }
  };

  const buildExportRows = (specificPedidoId?: string): { rows: PedidoRow[]; titulo: string } => {
    if (specificPedidoId) {
      const p = (showKanban ? kanbanPedidosFlat : pedidos).find(p => p.id === specificPedidoId);
      if (!p) return { rows: [], titulo: '' };
      return {
        rows: [{
          cliente: p.cliente?.empresa ?? '-',
          obra: p.obra?.nome_obra ?? '-',
          fabricante: p.fabricante?.nome ?? '-',
          vendedor: p.vendedor?.nome ?? '-',
          valor: p.valor_total ?? 0,
          etapa: stageLabel(p.status),
          data: p.data_pedido,
        }],
        titulo: `Negócio - ${p.cliente?.empresa ?? p.id}`,
      };
    }

    if (showKanban) {
      return {
        rows: pipelineOrders.map(o => ({
          cliente: o.clientName,
          obra: o.obra,
          fabricante: o.fabricante,
          vendedor: o.vendedor,
          valor: o.valor,
          etapa: stageLabel(o.stage),
          data: o.createdAt,
        })),
        titulo: hasPipelineFilters ? 'Orçamentos (Filtrado)' : 'Orçamentos - Pipeline Completo',
      };
    }

    return {
      rows: filtered.map(p => ({
        cliente: p.cliente?.empresa ?? '-',
        obra: p.obra?.nome_obra ?? '-',
        fabricante: p.fabricante?.nome ?? '-',
        vendedor: p.vendedor?.nome ?? '-',
        valor: p.valor_total ?? 0,
        etapa: stageLabel(p.status),
        data: p.data_pedido,
      })),
      titulo: selectedStages.length > 0 ? `Orçamentos - Filtrado` : 'Orçamentos - Todos',
    };
  };

  const handleExportPdf = async (specificPedidoId?: string) => {
    const { rows, titulo } = buildExportRows(specificPedidoId);
    if (rows.length === 0) return;
    const { generatePedidosPdf } = await import('@/lib/generate-pdf');
    await generatePedidosPdf(rows, titulo);
  };

  const handleExportExcel = async (specificPedidoId?: string) => {
    const { rows, titulo } = buildExportRows(specificPedidoId);
    if (rows.length === 0) return;
    const { generatePedidosExcel } = await import('@/lib/generate-excel');
    generatePedidosExcel(rows, titulo);
  };

  const openExportDialog = (specificPedidoId?: string) => {
    setExportTargetId(specificPedidoId);
    setExportDialogOpen(true);
  };

  const handleExportFormatChoice = async (formatoEscolhido: 'pdf' | 'xlsx') => {
    setExportDialogOpen(false);
    if (formatoEscolhido === 'pdf') {
      await handleExportPdf(exportTargetId);
    } else {
      await handleExportExcel(exportTargetId);
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
      onReset={resetToDefaults}
      label={showKanban ? 'Itens do card' : 'Colunas'}
    >
      <div className="flex flex-col border-t border-border/50">
        {showKanban && (
          <ColumnSettingsItem
            label="Gerenciar colunas Kanban"
            icon={Columns3}
            onClick={() => setColunasDialogOpen(true)}
          />
        )}

        <ColumnSettingsItem
          label="Gerenciar marcadores"
          icon={Tag}
          onClick={() => setMarcadoresDialogOpen(true)}
        />

        <ColumnSettingsPopover label="Ações" icon={Plus}>
          <ColumnSettingsItem
            label="Importar"
            icon={Upload}
            onClick={() => {
              setImportDialogMounted(true);
              setImportOpen(true);
            }}
          />

          <ColumnSettingsItem
            label="Linhas Ignoradas"
            icon={FileWarning}
            onClick={() => navigate('/importacao/ignoradas')}
          />

          <ColumnSettingsItem
            label="Exportar"
            icon={FileDown}
            onClick={() => openExportDialog()}
          />

          <ColumnSettingsItem
            label="Ação em Massa"
            icon={ArrowRightLeft}
            disabled={totalCount === 0}
            onClick={() => setBulkEditOpen(true)}
            badge={totalCount > 0 ? totalCount : undefined}
          />

          <ColumnSettingsItem
            label="Excluir Selecionados"
            icon={Trash2}
            variant="destructive"
            disabled={!someSelected}
            onClick={() => setConfirmDeleteOpen(true)}
            badge={someSelected ? selectedCount : undefined}
          />
        </ColumnSettingsPopover>
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
    showKanban,
    KANBAN_STAGES,
    visibleKanbanStages,
    toggleKanbanStage,
    handleKanbanStagesChange,
    selected.size,
    deleteAllFilteredMode,
    excludedIds.size,
    totalCount,
    someSelected,
    selectedCount,
    setImportOpen,
    setImportDialogMounted,
    setColunasDialogOpen,
    setMarcadoresDialogOpen,
    isPipelineMode,
    setConfirmDeleteOpen,
    setBulkEditOpen
  ]);

    const filtrosPopover = useMemo(() => (
    <FilterButton
      hasFilters={activeFilterCount > 0}
      activeFilterCount={activeFilterCount}
      onClear={clearPipelineFilters}
      className={cn(
        hasPipelineFilters && "data-[state=closed]:border-primary/50 data-[state=closed]:bg-primary/[0.02] data-[state=closed]:text-primary data-[state=open]:border-primary/50 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
      )}
      align="start"
      popoverClassName="w-64"
    >
      <div className="flex flex-col gap-1">
        {/* Submenu Etapa */}
        <StandardPopoverMenu
          label="Etapa"
          icon={LayoutGrid}
          badge={selectedStages.length > 0 ? selectedStages.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <div className="space-y-1">
            {KANBAN_STAGES.map(s => (
              <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                <Checkbox 
                  checked={selectedStages.includes(s.key)} 
                  onCheckedChange={() => {
                    toggleFilter(selectedStages, setSelectedStages, s.key);
                    setPage(1);
                  }} 
                />
                {s.label}
              </label>
            ))}
          </div>
        </StandardPopoverMenu>

        {/* Submenu Vendedor */}
        <StandardPopoverMenu
          label="Vendedor"
          icon={User}
          badge={selectedVendedores.length > 0 ? selectedVendedores.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <ScrollArea className="h-60">
            <div className="space-y-1 pr-3">
              {(vendedores ?? []).map(v => (
                <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                  <Checkbox checked={selectedVendedores.includes(v.id)} onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)} />
                  {v.nome}
                </label>
              ))}
            </div>
          </ScrollArea>
        </StandardPopoverMenu>

        {/* Submenu Fabricante */}
        <StandardPopoverMenu
          label="Fabricante"
          icon={Factory}
          badge={selectedFabricantes.length > 0 ? selectedFabricantes.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
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
        </StandardPopoverMenu>

        {/* Submenu Marcador */}
        <StandardPopoverMenu
          label="Marcador"
          icon={Tag}
          badge={selectedMarcadores.length > 0 ? selectedMarcadores.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <ScrollArea className="h-60">
            <div className="space-y-1 pr-3">
              {(marcadores ?? []).map(m => (
                <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                  <Checkbox checked={selectedMarcadores.includes(m.id)} onCheckedChange={() => toggleFilter(selectedMarcadores, setSelectedMarcadores, m.id)} />
                  {m.nome}
                </label>
              ))}
            </div>
          </ScrollArea>
        </StandardPopoverMenu>

        {/* Submenu Período */}
        <StandardPopoverMenu
          label="Período"
          icon={CalendarIcon}
          badge={(dateFrom || dateTo) ? 'Ativo' : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-64"
        >
          <div className="space-y-4 p-2">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Data Início
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
                    locale={ptBR}
                    captionLayout="dropdown-buttons"
                    fromYear={1950}
                    toYear={new Date().getFullYear()}
                    className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Data Fim
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
                    captionLayout="dropdown-buttons"
                    fromYear={1950}
                    toYear={new Date().getFullYear()}
                    className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </StandardPopoverMenu>

        <div className="h-px bg-border/50 my-1" />

        <div className="space-y-2 py-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3">Atenção</p>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
            <Checkbox checked={showOnlyAttention} onCheckedChange={() => setShowOnlyAttention(prev => !prev)} />
            Atenção (7+ dias)
          </label>
        </div>

        <div className="h-px bg-border/50 my-1" />

        <div className="space-y-2 py-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3">Importação</p>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
            <Checkbox checked={hideImportados} onCheckedChange={() => setHideImportados(prev => !prev)} />
            Ocultar negócios importados
          </label>
        </div>
      </div>
    </FilterButton>
  ), [activeFilterCount, clearPipelineFilters, hasPipelineFilters, selectedStages, setSelectedStages, vendedores, selectedVendedores, toggleFilter, fabricantes, selectedFabricantes, marcadores, selectedMarcadores, dateFrom, setDateFrom, dateTo, setDateTo, showOnlyAttention, setShowOnlyAttention, hideImportados, setHideImportados]);
  const selectedViewOrder = useMemo(
    () => (showKanban ? kanbanPedidosFlat : pedidos).find(p => p.id === viewOrderId),
    [showKanban, kanbanPedidosFlat, pedidos, viewOrderId]
  );

  const viewOrderSheet = (
    <Sheet open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-6 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <SheetTitle className="text-foreground font-bold text-lg">
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
              {selectedViewOrder.campos_extras?.['Negócio'] && selectedViewOrder.campos_extras['Negócio'] !== selectedViewOrder.cliente?.empresa && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Negócio
                  </p>
                  <p className="text-sm font-medium">
                    {selectedViewOrder.campos_extras['Negócio']}
                  </p>
                </div>
              )}
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
                  <Tag className="h-3 w-3" /> Marcador
                </p>
                {selectedViewOrder.marcador ? (
                  <Badge className={getStageBadgeClass(selectedViewOrder.marcador.cor)}>
                    {selectedViewOrder.marcador.nome}
                  </Badge>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
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
              {columns.filter(col => tableVisibleColumns.includes(col.id)).map(col => {
                const colId = col.id;
                const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);
                if (isDefault || colId === 'acoes') return null;
                
                if (colId === 'pdf_url') return null; // já exibido acima em "Anexo", com correção de link corrompido
                const value = selectedViewOrder.campos_extras?.[colId] ?? selectedViewOrder.campos_extras?.[getLabel(colId)];
                if (!value) return null;

                // Evita duplicar a exibição quando o mesmo link já aparece na seção "Anexo"
                // estruturada abaixo (importações antigas guardavam o PDF só como campo extra).
                // Compara após reparo, pois o valor bruto em campos_extras pode ter a corrupção
                // de locale (pontos trocados por vírgulas) que o pdf_url estruturado já corrige.
                if (
                  selectedViewOrder.pdf_url &&
                  typeof value === 'string' &&
                  repairCorruptedBitrixUrl(value.trim()) === repairCorruptedBitrixUrl(selectedViewOrder.pdf_url.trim())
                ) return null;

                const isUrl = typeof value === 'string' && /^https?:\/\//i.test(value.trim());

                return (
                  <div key={colId} className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> {getLabel(colId)}
                    </p>
                    {isUrl ? (
                      <a
                        href={value.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                      >
                        <FileText className="h-4 w-4" /> Abrir {getLabel(colId)}
                      </a>
                    ) : (
                      <p className="text-sm font-medium">{value}</p>
                    )}
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

            {/* Anexo */}
            {selectedViewOrder.pdf_url && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Anexo</p>
                <button
                  type="button"
                  onClick={() => {
                    const url = repairCorruptedBitrixUrl(selectedViewOrder.pdf_url);
                    setPdfPreview({ url, nome: filenameFromUrl(url, 'anexo.pdf') });
                  }}
                  className="inline-flex items-center gap-2 p-3 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                >
                  <FileText className="h-4 w-4" /> Ver PDF anexado
                </button>
              </div>
            )}

            {/* Tarefas / Observações do negócio */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tarefas</p>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddTarefaOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Nova Tarefa
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Tarefa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Prazo Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!tarefasNegocio?.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          Nenhuma tarefa vinculada a este negócio
                        </TableCell>
                      </TableRow>
                    ) : (
                      tarefasNegocio.map(tarefa => (
                        <TableRow key={tarefa.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setEditingTarefaNegocio(tarefa)}>
                          <TableCell className="font-medium text-sm">{tarefa.titulo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-[10px]">{tarefa.status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-sm" onClick={(e) => tarefa.responsavel && e.stopPropagation()}>
                            {tarefa.responsavel ? <UserProfilePopover name={tarefa.responsavel} /> : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {tarefa.prazo_final
                              ? format(new Date(tarefa.prazo_final), 'dd/MM/yyyy', { locale: ptBR })
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Histórico de Movimentação no Kanban */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <History className="h-3 w-3" /> Histórico de Movimentação
              </p>
              <HistoricoMovimentacaoNegocio historico={historicoStatusNegocio} stageLabel={stageLabel} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
          <div className="flex flex-1 gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => openExportDialog(viewOrderId || undefined)}>
              <FileDown className="h-4 w-4 mr-2" /> Exportar
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
            <Button variant="destructive" onClick={() => { setViewOrderId(null); setDeleteAllFilteredMode(false); setSelected(new Set([viewOrderId!])); setConfirmDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );

  const addTarefaDialog = (
    <TarefaFormDialog
      open={addTarefaOpen}
      onOpenChange={setAddTarefaOpen}
      editingTarefa={null}
      kanbanStages={tarefaKanbanStages}
      extraFields={{ pedido_id: viewOrderId!, cliente_id: selectedViewOrder?.cliente_id }}
    />
  );

  const editTarefaDialog = (
    <TarefaFormDialog
      open={!!editingTarefaNegocio}
      onOpenChange={(open) => { if (!open) setEditingTarefaNegocio(null); }}
      editingTarefa={editingTarefaNegocio}
      kanbanStages={tarefaKanbanStages}
      extraFields={{ pedido_id: viewOrderId!, cliente_id: selectedViewOrder?.cliente_id }}
    />
  );

  const isFiltered = hasPipelineFilters || deferredSearch.trim() !== '';

  // Contagem e soma vêm de usePedidosStats (query dedicada no servidor), refletindo
  // TODOS os registros que atendem ao filtro atual — não apenas o lote carregado localmente.
  const subtitle = `${totalCount} negócios${isFiltered ? ' (filtrados)' : ''} · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

  return (
    <AppLayout title="Negócios" subtitle={subtitle} mainClassName="flex-1 overflow-hidden flex flex-col">
      <div className={cn('flex flex-col flex-1 min-h-0 px-4 sm:px-6 pt-4 sm:pt-6', !showKanban && 'pb-4 sm:pb-6')}>
        <div className={cn('mb-3 flex items-center gap-3', showKanban ? 'shrink-0' : 'mb-4 md:mb-6')}>
          <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0 sm:overflow-x-auto custom-scrollbar sm:pb-1">
            {isPipelineMode && funis && funis.length > 1 && (
              <Select value={funilId} onValueChange={setFunilId}>
                <SelectTrigger className="h-8 w-fit min-w-[140px] shrink-0 text-sm gap-1.5">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funis.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isPipelineMode && (
              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5 shrink-0">
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

            {showKanban && (
              <Select
                value={String(kanbanPageSize)}
                onValueChange={(value) => setKanbanPageSize(Number(value))}
              >
                <SelectTrigger className="h-10 w-fit min-w-[70px] shrink-0 text-sm gap-1.5">
                  <Rows3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground whitespace-nowrap">Exibir</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_PAGE_SIZE_OPTIONS.map(option => (
                    <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <SearchWithRecent
              placeholder="Buscar por cliente, obra ou fabricante..."
              value={search}
              onValueChange={handleSearchChange}
              storageKey="negocios_recent_searches"
              className="order-last w-full sm:order-none sm:w-auto sm:min-w-[240px] sm:shrink-0"
              loading={isRefetching}
            />

            <div className="shrink-0">{filtrosPopover}</div>
            <div className="shrink-0">{optionsPopover}</div>

            {isPipelineMode && hasPipelineFilters && (
              <Button variant="ghost" size="icon" onClick={clearPipelineFilters} className="h-8 w-8 text-muted-foreground shrink-0" title="Limpar filtros">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-10" onClick={() => navigate(funilId ? `/pedidos/novo?funilId=${encodeURIComponent(funilId)}` : '/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Negócio</span><span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showKanban ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 pb-4 flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto items-stretch">
              {KANBAN_STAGES.filter(stage => visibleKanbanStages.includes(stage.key)).map(stage => (
                <KanbanColumn
                  key={stage.key}
                  stageKey={stage.key as any}
                  label={stage.label}
                  colorClass={stage.color}
                  onCardClick={setViewOrderId}
                  visibleColumns={visibleColumns}
                  columns={columns}
                  pageSize={kanbanPageSize}
                  empresaId={empresaId}
                  filters={pedidosFilters}
                  etapaFilter={activeStages}
                  onOrdersChange={handleKanbanColumnData}
                />
              ))}
              <div className="self-start mt-[52px] shrink-0">
                <button
                  type="button"
                  onClick={() => setColunasDialogOpen(true)}
                  className="flex flex-col items-center justify-center w-52 sm:w-64 lg:w-72 min-w-[208px] sm:min-w-[256px] lg:min-w-[288px] h-[180px] rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary gap-2 group"
                >
                  <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <Plus className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm">Adicionar Etapa</span>
                </button>
              </div>
            </div>
          </DragDropContext>
        ) : null}
        {!isLoading && !showKanban && (
          <div className="flex min-w-0 flex-1 min-h-0 flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1 flex flex-col min-h-0">
              <div className="mb-4 shrink-0">
                {someSelected && (
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    Excluir {selectedCount}
                  </Button>
                )}
              </div>

              <div ref={tableViewportRef} className="w-full rounded-xl border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
                <Table wrapperClassName="flex-1 min-h-0" className="table-fixed" style={{ width: tableTotalWidth }}>
                  <colgroup>
                    <col style={{ width: CHECKBOX_COL_WIDTH }} />
                    {visibleColumnDefs.map((col, i) => (
                      <col key={col.id} style={{ width: resolvedColWidths[i] }} />
                    ))}
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 h-14 px-2.5">
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                      </TableHead>
                      {visibleColumnDefs.map((col, i) => (
                        <ResizableTh
                          key={col.id}
                          width={resolvedColWidths[i]}
                          onResize={(w) => setColumnWidth(col.id, w)}
                          className={cn(
                            "whitespace-nowrap h-14 px-2.5 text-xs font-semibold",
                            col.id === 'acoes' && "text-center"
                          )}
                        >
                          {getLabel(col.id)}
                        </ResizableTh>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tableVisibleColumns.length + 1} className="p-0 overflow-visible">
                          <div
                            className="sticky left-0 flex items-center justify-center py-12 text-muted-foreground"
                            style={{ width: tableViewportWidth || '100%' }}
                          >
                            Nenhum negócio encontrado
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(p => (
                        <PedidoRow
                          key={p.id}
                          pedido={p}
                          selected={deleteAllFilteredMode ? !excludedIds.has(p.id) : selected.has(p.id)}
                          onToggle={() => toggleOne(p.id)}
                          onClick={() => setViewOrderId(p.id)}
                          visibleColumns={tableVisibleColumns}
                          columns={columns}
                          KANBAN_STAGES={KANBAN_STAGES}
                          getLabel={getLabel}
                          stageLabel={stageLabel}
                        />
                      ))

                    )}
                  </TableBody>
                </Table>
                <ListPagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
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

      <AlertDialog open={confirmDeleteOpen} onOpenChange={(open) => { setConfirmDeleteOpen(open); if (!open) setDeleteConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedCount} negócio(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os itens e histórico de contatos vinculados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAllFilteredMode && (
            <p className="text-sm font-medium text-foreground -mt-2">
              {selectedCount} negócios{excludedIds.size === 0 ? ` · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm-input" className="text-xs text-muted-foreground">
              Para confirmar, digite <strong className="text-foreground">APAGAR</strong>
            </Label>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="APAGAR"
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeleting || deleteConfirmText.trim().toUpperCase() !== 'APAGAR'}
            >
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
              Deseja selecionar apenas os {currentPageIds.length} negócio(s) desta página ou todos os {totalCount} negócio(s) filtrados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={selectPageOnly}>Apenas esta página ({currentPageIds.length})</Button>
            <Button variant="default" onClick={selectAllFiltered}>Todos ({totalCount})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockedMove} onOpenChange={(open) => { if (!open) setBlockedMove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível mover para "{blockedMove?.targetLabel}"</AlertDialogTitle>
            <AlertDialogDescription>
              Preencha os campos obrigatórios desta etapa antes de mover o negócio: {blockedMove?.missingLabels.join(', ')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={() => { if (blockedMove) navigate(`/pedidos/${blockedMove.pedidoId}/editar`); setBlockedMove(null); }}>
              Editar negócio
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ação em massa</DialogTitle>
            <DialogDescription>
              Altera a etapa e/ou o marcador de todos os negócios que atendem aos filtros abaixo — os mesmos filtros usados na tela.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quais negócios</p>
              {hasPipelineFilters && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearPipelineFilters}>
                  Limpar filtros
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Etapa</Label>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1 pr-2">
                    {KANBAN_STAGES.map(s => (
                      <label key={s.key} className="flex items-center gap-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-sm">
                        <Checkbox checked={selectedStages.includes(s.key)} onCheckedChange={() => toggleFilter(selectedStages, setSelectedStages, s.key)} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Marcador</Label>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1 pr-2">
                    {(marcadores ?? []).map(m => (
                      <label key={m.id} className="flex items-center gap-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-sm">
                        <Checkbox checked={selectedMarcadores.includes(m.id)} onCheckedChange={() => toggleFilter(selectedMarcadores, setSelectedMarcadores, m.id)} />
                        {m.nome}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Vendedor</Label>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1 pr-2">
                    {(vendedores ?? []).map(v => (
                      <label key={v.id} className="flex items-center gap-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-sm">
                        <Checkbox checked={selectedVendedores.includes(v.id)} onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)} />
                        {v.nome}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Fabricante</Label>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1 pr-2">
                    {(fabricantes ?? []).map(f => (
                      <label key={f.id} className="flex items-center gap-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-sm">
                        <Checkbox checked={selectedFabricantes.includes(f.id)} onCheckedChange={() => toggleFilter(selectedFabricantes, setSelectedFabricantes, f.id)} />
                        {f.nome}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-9", !dateFrom && "text-muted-foreground")}>
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecione..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear()} className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-9", !dateTo && "text-muted-foreground")}>
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecione..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear()} className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={showOnlyAttention} onCheckedChange={() => setShowOnlyAttention(prev => !prev)} />
                Atenção (7+ dias)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={hideImportados} onCheckedChange={() => setHideImportados(prev => !prev)} />
                Ocultar negócios importados
              </label>
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
              {totalCount} negócio(s) encontrado(s){totalCount > 0 ? ` · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
            </div>
          </div>

          <div className="h-px bg-border/50" />

          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Alterar para</p>

            <div className="flex items-center gap-3">
              <Checkbox checked={bulkApplyStatus} onCheckedChange={(v) => setBulkApplyStatus(!!v)} id="bulk-apply-status" />
              <Label htmlFor="bulk-apply-status" className="w-28 shrink-0 cursor-pointer font-normal">Nova etapa</Label>
              <Select value={bulkNewStatus} onValueChange={setBulkNewStatus} disabled={!bulkApplyStatus}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar etapa" />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_STAGES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox checked={bulkApplyMarcador} onCheckedChange={(v) => setBulkApplyMarcador(!!v)} id="bulk-apply-marcador" />
              <Label htmlFor="bulk-apply-marcador" className="w-28 shrink-0 cursor-pointer font-normal">Novo marcador</Label>
              <Select value={bulkNewMarcadorId} onValueChange={setBulkNewMarcadorId} disabled={!bulkApplyMarcador}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar marcador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {(marcadores ?? []).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} disabled={isBulkUpdating}>Cancelar</Button>
            <Button
              onClick={handleBulkApply}
              disabled={
                isBulkUpdating ||
                totalCount === 0 ||
                (!bulkApplyStatus && !bulkApplyMarcador) ||
                (bulkApplyStatus && !bulkNewStatus) ||
                (bulkApplyMarcador && !bulkNewMarcadorId)
              }
            >
              {isBulkUpdating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Aplicando...</> : `Aplicar a ${totalCount} negócio(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importDialogMounted && (
        <Suspense fallback={null}>
          <ImportPedidosDialog open={importOpen} onOpenChange={setImportOpen} />
        </Suspense>
      )}
      <ImportDialog
        open={importAiOpen}
        importType="negocios"
        onOpenChange={(v) => {
          setImportAiOpen(v);
          if (!v) queryClient.invalidateQueries({ queryKey: ['pedidos'] });
        }}
      />
      
      <KanbanColunasDialog
        open={colunasDialogOpen}
        onOpenChange={setColunasDialogOpen}
        empresaId={empresaId}
        funilId={funilId}
        funilNome={funis?.find(f => f.id === funilId)?.nome}
        funis={funis}
        visibleSlugs={visibleKanbanStages}
        onToggleVisibility={toggleKanbanStage}
        onResetVisibility={toggleAllKanbanStages}
      />

      <MarcadoresDialog
        open={marcadoresDialogOpen}
        onOpenChange={setMarcadoresDialogOpen}
        empresaId={empresaId}
      />

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar negócios</DialogTitle>
            <DialogDescription>Escolha o formato do arquivo a ser gerado.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleExportFormatChoice('pdf')}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all"
            >
              <FileDown className="h-6 w-6 text-muted-foreground" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => handleExportFormatChoice('xlsx')}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all"
            >
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              Excel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {viewOrderSheet}
      {addTarefaDialog}
      {editTarefaDialog}
      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
    </AppLayout>
  );
};

export default Negocios;

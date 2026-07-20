import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTarefas, useCreateTarefa, useUpdateTarefa, useDeleteTarefa, Tarefa } from '@/hooks/use-tarefas';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { UserProfilePopover } from '@/components/layout/UserProfilePopover';
import { useVendedores } from '@/hooks/use-clientes';
import { useObras } from '@/hooks/use-obras';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarRangePicker } from '@/components/ui/calendar';
import { Plus, Search, Trash2, Pencil, Loader2, Calendar, Check, User, LayoutGrid, List as ListIcon, Settings2, ChevronDown, ClipboardList, Tag, FolderKanban } from 'lucide-react';
import { format, subDays, subMonths, subYears, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ListPagination } from '@/components/shared/ListPagination';
import { supabase } from '@/integrations/supabase/client';
import { MarcadoresMultiSelect } from '@/components/tarefas/MarcadoresMultiSelect';
import { ParticipantesMultiSelect } from '@/components/tarefas/ParticipantesMultiSelect';
import { ProjetoSelect } from '@/components/tarefas/ProjetoSelect';
import { TarefaKanbanColumn } from '@/components/tarefas/TarefaKanbanColumn';
import { TarefaKanbanColunasDialog } from '@/components/tarefas/TarefaKanbanColunasDialog';
import { ColumnSettings, type ColumnDefinition } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { FilterButton } from '@/components/shared/FilterButton';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { MultiSelectSearch } from '@/components/shared/MultiSelectSearch';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';

const TAREFA_COLUMNS: ColumnDefinition[] = [
  { id: 'titulo', label: 'Tarefa', locked: false },
  { id: 'responsavel', label: 'Responsável', locked: false },
  { id: 'prazo_final', label: 'Prazo', locked: false },
  { id: 'status', label: 'Status', locked: false },
  { id: 'projeto', label: 'Projeto', locked: false },
];

const statusConfig: Record<string, { label: string; className: string }> = {
  pendente: { label: 'A fazer', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  'em andamento': { label: 'Em andamento', className: 'bg-warning/15 text-warning border-warning/30' },
  concluida: { label: 'Concluído', className: 'bg-success/15 text-success border-success/30' },
};

// Badge equivalente às cores usadas nas colunas do Kanban (mesma paleta de use-tarefas-kanban-colunas.ts).
const KANBAN_COLOR_BADGE: Record<string, string> = {
  'kanban-new': 'bg-kanban-new/15 text-kanban-new border-kanban-new/30',
  'kanban-budget': 'bg-kanban-budget/15 text-kanban-budget border-kanban-budget/30',
  'kanban-sent': 'bg-kanban-sent/15 text-kanban-sent border-kanban-sent/30',
  'kanban-negotiation': 'bg-kanban-negotiation/15 text-kanban-negotiation border-kanban-negotiation/30',
  'kanban-closed': 'bg-kanban-closed/15 text-kanban-closed border-kanban-closed/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  'muted-foreground': 'bg-muted text-muted-foreground border-border',
};

type TarefasView = 'kanban' | 'lista';

export default function Tarefas() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: tarefas = [], isLoading } = useTarefas();
  const { data: kanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const { data: vendedores = [] } = useVendedores();
  const { data: obras = [] } = useObras();
  const queryClient = useQueryClient();
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const deleteTarefa = useDeleteTarefa();

  const KANBAN_STAGES = useMemo(
    () => kanbanColunas.map(c => ({ key: c.slug, label: c.nome, color: c.cor })),
    [kanbanColunas]
  );

  const getStatusInfo = (s: string) => {
    const stage = KANBAN_STAGES.find(k => k.key === s);
    if (stage) {
      return { label: stage.label, className: KANBAN_COLOR_BADGE[stage.color] ?? 'bg-muted text-muted-foreground border-border' };
    }
    return statusConfig[s] ?? { label: s, className: 'bg-muted text-muted-foreground border-border' };
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [responsavelFilter, setResponsavelFilter] = useState<string[]>([]);
  const [prazoFiltro, setPrazoFiltro] = useState<'todos' | 'semana' | 'mes' | 'ano' | 'personalizado'>('todos');
  const [prazoCustom, setPrazoCustom] = useState<{ from?: Date; to?: Date }>({});
  const [page, setPage] = useState(1);

  const [view, setView] = useState<TarefasView>(() => {
    const saved = localStorage.getItem('tarefas_view') as TarefasView | null;
    return saved === 'kanban' || saved === 'lista' ? saved : 'lista';
  });
  const handleViewChange = (next: TarefasView) => {
    setView(next);
    localStorage.setItem('tarefas_view', next);
  };
  const [colunasDialogOpen, setColunasDialogOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);
  const [deleteTarefaTarget, setDeleteTarefaTarget] = useState<Tarefa | null>(null);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);

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
    key: 'tarefas',
    defaultColumns: TAREFA_COLUMNS,
  });

  const [form, setForm] = useState({
    titulo: '', descricao: '', status: 'pendente', prazo_final: '',
    responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '',
  });

  const filtered = useMemo(() => {
    let list = tarefas;
    if (statusFilter !== 'todos') list = list.filter(t => t.status === statusFilter);
    if (responsavelFilter.length > 0) list = list.filter(t => responsavelFilter.includes(t.responsavel));
    if (prazoFiltro !== 'todos') {
      list = list.filter(t => {
        if (!t.prazo_final) return false;
        const dataRef = new Date(t.prazo_final);
        if (prazoFiltro === 'semana' && dataRef < subDays(new Date(), 7)) return false;
        if (prazoFiltro === 'mes' && dataRef < subMonths(new Date(), 1)) return false;
        if (prazoFiltro === 'ano' && dataRef < subYears(new Date(), 1)) return false;
        if (prazoFiltro === 'personalizado') {
          if (prazoCustom.from && dataRef < startOfDay(prazoCustom.from)) return false;
          if (prazoCustom.to && dataRef > endOfDay(prazoCustom.to)) return false;
        }
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.titulo || '').toLowerCase().includes(q) ||
        (t.responsavel || '').toLowerCase().includes(q) ||
        (t.projeto || '').toLowerCase().includes(q) ||
        (t.marcadores || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [tarefas, statusFilter, responsavelFilter, prazoFiltro, prazoCustom, search]);

  const hasFilters = statusFilter !== 'todos' || responsavelFilter.length > 0 || prazoFiltro !== 'todos' || search !== '';
  const activeFilterCount = (statusFilter !== 'todos' ? 1 : 0) + (responsavelFilter.length > 0 ? 1 : 0) + (prazoFiltro !== 'todos' ? 1 : 0);


  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openNew(initialStatus?: string) {
    setEditingTarefa(null);
    setForm({ titulo: '', descricao: '', status: initialStatus || KANBAN_STAGES[0]?.key || 'pendente', prazo_final: '', responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '' });
    setDialogOpen(true);
  }

  function openEdit(t: Tarefa) {
    setEditingTarefa(t);
    setForm({
      titulo: t.titulo, descricao: t.descricao || '', status: t.status,
      prazo_final: t.prazo_final ? t.prazo_final.slice(0, 16) : '',
      responsavel: t.responsavel || '', participantes: t.participantes || '',
      observadores: t.observadores || '', projeto: t.projeto || '', marcadores: t.marcadores || '',
    });
    setDialogOpen(true);
  }

  function openDetails(t: Tarefa) {
    setSelectedTarefa(t);
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    try {
      const payload = { ...form, prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : null };
      if (editingTarefa) {
        await updateTarefa.mutateAsync({ id: editingTarefa.id, ...payload });
        toast.success('Tarefa atualizada');
      } else {
        await createTarefa.mutateAsync(payload);
        toast.success('Tarefa criada');
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error('[tarefas] erro ao salvar:', err);
      toast.error(err?.message || 'Erro ao salvar tarefa');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTarefa.mutateAsync(id);
      toast.success('Tarefa excluída');
    } catch { toast.error('Erro ao excluir'); }
  }

  async function confirmDeleteTarefaSingle() {
    if (!deleteTarefaTarget) return;
    await handleDelete(deleteTarefaTarget.id);
    setDeleteTarefaTarget(null);
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    try {
      await updateTarefa.mutateAsync({ id: draggableId, status: destination.droppableId });
      const label = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;
      toast.success(`Tarefa movida para "${label}"`);
    } catch {
      toast.error('Erro ao mover tarefa');
    }
  }

  // Bulk selection helpers
  const currentPageIds = paginated.map(t => t.id);
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
    setSelected(new Set(filtered.map(t => t.id)));
    setSelectAllDialogOpen(false);
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selected);
      const BATCH_SIZE = 500;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('tarefas').delete().in('id', batch);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success(`${ids.length} tarefa(s) removida(s)!`);
      setSelected(new Set());
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('[bulk-delete tarefas]', err);
      toast.error(err?.message || 'Erro ao remover tarefas');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout
      title="Tarefas"
      subtitle={`${filtered.length} tarefa(s)`}
      mainClassName={view === 'kanban' ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 overflow-auto'}
    >
      <div className={view === 'kanban' ? 'flex flex-col flex-1 min-h-0 p-3 sm:p-4 md:p-6' : 'p-3 sm:p-4 md:p-6 w-full space-y-4 md:space-y-6'}>
        {/* Filters & Actions */}
        <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3', view === 'kanban' && 'mb-3 shrink-0')}>
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            <Button
              variant={view === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewChange('kanban')}
              className="h-8 gap-1.5 px-3"
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </Button>
            <Button
              variant={view === 'lista' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewChange('lista')}
              className="h-8 gap-1.5 px-3"
            >
              <ListIcon className="h-4 w-4" />
              Lista
            </Button>
          </div>

          <SearchWithRecent
            placeholder="Buscar tarefas..."
            value={search}
            onValueChange={(val) => { setSearch(val); setPage(1); }}
            storageKey="tarefas_recent_searches"
            className="min-w-[200px]"
          />

          <FilterButton
            hasFilters={hasFilters}
            activeFilterCount={activeFilterCount}
            popoverClassName="w-auto"
            onClear={() => {
              setStatusFilter('todos');
              setResponsavelFilter([]);
              setPrazoFiltro('todos');
              setPrazoCustom({});
              setSearch('');
            }}
          >
            <div className="flex">
              <div className="flex flex-col gap-3 w-64 p-1">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">Status</Label>
                  <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      {KANBAN_STAGES.map(stage => (
                        <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">Responsável</Label>
                  <MultiSelectSearch
                    options={vendedores.map(v => ({ value: v.nome, label: v.nome }))}
                    value={responsavelFilter}
                    onValueChange={v => { setResponsavelFilter(v); setPage(1); }}
                    placeholder="Todos os responsáveis"
                    emptyMessage="Nenhum responsável encontrado."
                  />
                </div>

                <div className="space-y-0.5">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold px-0.5">Prazo</Label>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {(
                      [
                        ['semana', 'Última semana'],
                        ['mes', 'Último mês'],
                        ['ano', 'Último ano'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setPrazoFiltro(prazoFiltro === val ? 'todos' : val); setPage(1); }}
                        className={cn(
                          'flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-muted/80',
                          prazoFiltro === val && 'bg-primary/10 text-primary',
                        )}
                      >
                        {label}
                        {prazoFiltro === val && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-l border-border/50 p-2">
                <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Personalizado
                </p>
                <CalendarRangePicker
                  mode="range"
                  selected={{ from: prazoCustom.from, to: prazoCustom.to }}
                  onSelect={(range) => {
                    setPrazoCustom({ from: range?.from, to: range?.to });
                    setPrazoFiltro('personalizado');
                    setPage(1);
                  }}
                  numberOfMonths={1}
                  locale={ptBR}
                  captionLayout="dropdown-buttons"
                  fromYear={1950}
                  toYear={new Date().getFullYear()}
                  className="pointer-events-auto"
                />
              </div>
            </div>
          </FilterButton>

          {someSelected && view === 'lista' && (
            <Button variant="destructive" size="sm" className="gap-2 shrink-0" onClick={() => setConfirmDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir {selected.size}
            </Button>
          )}
          {view === 'kanban' && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2.5 rounded-lg border-border/60 bg-background px-4 font-medium transition-all hover:border-primary/50 hover:bg-primary/[0.02] active:scale-[0.98] shadow-sm group"
              title="Gerenciar colunas do Kanban"
              onClick={() => setColunasDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              <span>Opções</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          )}
          {view === 'lista' && (
            <ColumnSettings
              columns={columns}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
              onRename={handleRename}
              onTypeChange={handleTypeChange}
              onReorder={handleReorder}
              onAdd={handleAddColumn}
              onRemove={handleRemoveColumn}
              presets={presets}
              onSavePreset={savePreset}
              onLoadPreset={loadPreset}
              onDeletePreset={deletePreset}
              onReset={resetToDefaults}
            />
          )}
          <Button onClick={() => openNew()} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />Nova Tarefa
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : view === 'kanban' ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 pb-4 flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto items-stretch">
              {KANBAN_STAGES.map(stage => (
                <TarefaKanbanColumn
                  key={stage.key}
                  stageKey={stage.key}
                  label={stage.label}
                  colorClass={stage.color}
                  tarefas={filtered.filter(t => t.status === stage.key)}
                  onCardClick={openDetails}
                  onAddTarefa={openNew}
                />
              ))}
              <div className="self-start mt-[38px] w-40 sm:w-48 min-w-[160px] shrink-0">
                <button
                  type="button"
                  onClick={() => setColunasDialogOpen(true)}
                  className="flex flex-col items-center justify-center w-full h-[180px] rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary gap-2 group"
                >
                  <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <Plus className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm">Adicionar Etapa</span>
                </button>
              </div>
            </div>
          </DragDropContext>
        ) : (
          <div className="space-y-3 md:space-y-0">
            {/* Mobile: card layout */}
            <div className="block md:hidden space-y-3">
              {paginated.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma tarefa encontrada</div>
              ) : paginated.map(t => {
                const si = getStatusInfo(t.status);
                const isOverdue = t.prazo_final && new Date(t.prazo_final) < new Date() && t.status !== 'concluida';
                return (
                  <div key={t.id} onClick={() => openDetails(t)} className={`rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 cursor-pointer ${selected.has(t.id) ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} onClick={(e) => e.stopPropagation()} className="mt-0.5" aria-label={`Selecionar ${t.titulo}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-card-foreground line-clamp-2">{t.titulo}</p>
                          {visibleColumns.includes('projeto') && t.projeto && <p className="text-xs text-muted-foreground mt-1">{t.projeto}</p>}
                        </div>
                      </div>
                      {visibleColumns.includes('status') && <Badge className={`shrink-0 text-[10px] border ${si.className}`}>{si.label}</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {visibleColumns.includes('responsavel') && t.responsavel && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /><span onClick={(e) => e.stopPropagation()}><UserProfilePopover name={t.responsavel} className="text-xs" /></span>
                        </span>
                      )}
                      {visibleColumns.includes('prazo_final') && t.prazo_final && (
                        <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          {format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 pt-2 border-t border-border/40">
                      <Button variant="ghost" size="sm" className="h-8 text-xs flex-1 hover:bg-primary/5" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table layout */}
            <div className="hidden md:block rounded-xl border border-border/60 border-b-0 rounded-b-none overflow-x-auto shadow-[var(--shadow-card)]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-b border-border/60">
                    <TableHead className="w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </TableHead>
                    {visibleColumns.map(colId => (
                      <TableHead key={colId} className={cn("text-xs font-semibold whitespace-nowrap px-4 py-3", (colId === 'responsavel' || colId === 'prazo_final') && "hidden lg:table-cell", colId === 'projeto' && "hidden xl:table-cell")}>
                        {getLabel(colId)}
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px] text-xs font-semibold whitespace-nowrap px-4 py-3">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhuma tarefa encontrada</TableCell></TableRow>
                  ) : paginated.map(t => {
                    const si = getStatusInfo(t.status);
                    const isOverdue = t.prazo_final && new Date(t.prazo_final) < new Date() && t.status !== 'concluida';
                    return (
                      <TableRow key={t.id} onClick={() => openDetails(t)} className={`hover:bg-muted/30 transition-colors cursor-pointer ${selected.has(t.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Selecionar ${t.titulo}`} />
                        </TableCell>
                        {visibleColumns.map(colId => {
                          if (colId === 'titulo') {
                            return (
                              <TableCell key={colId} className="max-w-[300px]">
                                <p className="font-semibold text-sm text-card-foreground">{t.titulo}</p>
                                {visibleColumns.includes('projeto') && t.projeto && <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">{t.projeto}</p>}
                                {visibleColumns.includes('responsavel') && t.responsavel && <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">{t.responsavel}</p>}
                              </TableCell>
                            );
                          }

                          if (colId === 'responsavel') {
                            return (
                              <TableCell key={colId} className="hidden lg:table-cell text-sm whitespace-nowrap" onClick={(e) => t.responsavel && e.stopPropagation()}>{t.responsavel ? <UserProfilePopover name={t.responsavel} /> : '—'}</TableCell>
                            );
                          }

                          if (colId === 'prazo_final') {
                            return (
                              <TableCell key={colId} className={`hidden lg:table-cell text-sm whitespace-nowrap ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                                {t.prazo_final ? format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                              </TableCell>
                            );
                          }

                          if (colId === 'status') {
                            return (
                              <TableCell key={colId}>
                                <Badge className={`whitespace-nowrap text-[11px] border ${si.className}`}>{si.label}</Badge>
                              </TableCell>
                            );
                          }

                          if (colId === 'projeto') {
                            return (
                              <TableCell key={colId} className="hidden xl:table-cell text-sm text-muted-foreground truncate max-w-[180px]">{t.projeto || '—'}</TableCell>
                            );
                          }

                          return null;
                        })}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5" onClick={() => openEdit(t)}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
              itemLabel="tarefa"
              itemLabelPlural="tarefas"
              className="rounded-xl border border-border/60 bg-card px-3 py-3 shadow-[var(--shadow-card)] md:rounded-t-none md:border-t-0 md:shadow-none"
            />
          </div>
        )}
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KANBAN_STAGES.map(stage => (
                      <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo Final</Label>
                <Input type="datetime-local" value={form.prazo_final} onChange={e => setForm(f => ({ ...f, prazo_final: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <SearchableSelect
                  options={vendedores.map(v => ({ value: v.nome, label: v.nome }))}
                  value={form.responsavel}
                  onValueChange={v => setForm(f => ({ ...f, responsavel: v }))}
                  placeholder="Selecione o responsável"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Projeto / Obra</Label>
                <ProjetoSelect value={form.projeto} onChange={v => setForm(f => ({ ...f, projeto: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <ParticipantesMultiSelect value={form.participantes} onChange={v => setForm(f => ({ ...f, participantes: v }))} usuarios={vendedores} />
            </div>
            <div className="space-y-1.5">
              <Label>Marcadores</Label>
              <MarcadoresMultiSelect value={form.marcadores} onChange={v => setForm(f => ({ ...f, marcadores: v }))} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending}>
              {(createTarefa.isPending || updateTarefa.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTarefa ? 'Salvar Alterações' : 'Criar Tarefa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet de detalhes da tarefa (lateral) */}
      <Sheet open={!!selectedTarefa} onOpenChange={(open) => !open && setSelectedTarefa(null)}>
        {selectedTarefa && (() => {
          const si = getStatusInfo(selectedTarefa.status);
          const isOverdue = selectedTarefa.prazo_final && new Date(selectedTarefa.prazo_final) < new Date() && selectedTarefa.status !== 'concluida';
          return (
            <SheetContent className="sm:max-w-xl overflow-y-auto">
              <SheetHeader className="pb-6 border-b">
                <div className="space-y-1">
                  <SheetTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{selectedTarefa.titulo}</span>
                  </SheetTitle>
                  <SheetDescription>Detalhes da tarefa.</SheetDescription>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</Label>
                    <div className="pt-1">
                      <Badge className={`border ${si.className}`}>{si.label}</Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Prazo Final
                    </Label>
                    <p className={`text-sm font-medium ${isOverdue ? 'text-destructive' : ''}`}>
                      {selectedTarefa.prazo_final ? format(new Date(selectedTarefa.prazo_final), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Responsável
                    </Label>
                    <p className="text-sm font-medium">
                      {selectedTarefa.responsavel ? <UserProfilePopover name={selectedTarefa.responsavel} /> : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FolderKanban className="h-3 w-3" /> Projeto / Obra
                    </Label>
                    <p className="text-sm font-medium">{selectedTarefa.projeto || '—'}</p>
                  </div>
                  {selectedTarefa.participantes && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Participantes</Label>
                      <p className="text-sm font-medium">{selectedTarefa.participantes}</p>
                    </div>
                  )}
                  {selectedTarefa.marcadores && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Marcadores
                      </Label>
                      <p className="text-sm font-medium">{selectedTarefa.marcadores}</p>
                    </div>
                  )}
                  {selectedTarefa.descricao && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descrição</Label>
                      <p className="text-sm whitespace-pre-wrap">{selectedTarefa.descricao}</p>
                    </div>
                  )}
                </div>
              </div>

              <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
                <div className="flex w-full justify-between items-center">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                    onClick={() => {
                      setDeleteTarefaTarget(selectedTarefa);
                      setSelectedTarefa(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedTarefa(null)}>Fechar</Button>
                    <Button
                      className="gap-2"
                      onClick={() => {
                        openEdit(selectedTarefa);
                        setSelectedTarefa(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </SheetContent>
          );
        })()}
      </Sheet>

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteTarefaTarget} onOpenChange={(o) => !o && setDeleteTarefaTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa "{deleteTarefaTarget?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os dados da tarefa serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTarefa.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDeleteTarefaSingle} disabled={deleteTarefa.isPending}>
              {deleteTarefa.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} tarefa(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os dados das tarefas selecionadas serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Select all dialog */}
      <AlertDialog open={selectAllDialogOpen} onOpenChange={setSelectAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar tarefas</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja selecionar apenas as {currentPageIds.length} tarefa(s) desta página ou todas as {filtered.length} tarefa(s) filtradas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={selectPageOnly}>Apenas esta página ({currentPageIds.length})</Button>
            <Button variant="default" onClick={selectAllFiltered}>Todas ({filtered.length})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TarefaKanbanColunasDialog open={colunasDialogOpen} onOpenChange={setColunasDialogOpen} empresaId={empresaId} />
    </AppLayout>
  );
}

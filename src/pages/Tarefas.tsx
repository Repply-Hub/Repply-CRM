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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Plus, Search, Trash2, Pencil, Loader2, Calendar, User, LayoutGrid, List as ListIcon, Settings2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
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
  const [responsavelFilter, setResponsavelFilter] = useState('todos');
  const [prazoDe, setPrazoDe] = useState('');
  const [prazoAte, setPrazoAte] = useState('');
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
    if (responsavelFilter !== 'todos') list = list.filter(t => t.responsavel === responsavelFilter);
    if (prazoDe) list = list.filter(t => t.prazo_final && t.prazo_final.slice(0, 10) >= prazoDe);
    if (prazoAte) list = list.filter(t => t.prazo_final && t.prazo_final.slice(0, 10) <= prazoAte);
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
  }, [tarefas, statusFilter, responsavelFilter, prazoDe, prazoAte, search]);

  const hasFilters = statusFilter !== 'todos' || responsavelFilter !== 'todos' || prazoDe !== '' || prazoAte !== '' || search !== '';
  const activeFilterCount = (statusFilter !== 'todos' ? 1 : 0) + (responsavelFilter !== 'todos' ? 1 : 0) + (prazoDe || prazoAte ? 1 : 0);


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
            popoverClassName="min-w-[260px]"
            onClear={() => {
              setStatusFilter('todos');
              setResponsavelFilter('todos');
              setPrazoDe('');
              setPrazoAte('');
              setSearch('');
            }}
          >
            <div className="space-y-3">
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
                <Select value={responsavelFilter} onValueChange={v => { setResponsavelFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Todos os responsáveis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os responsáveis</SelectItem>
                    {vendedores.map(v => (
                      <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-semibold">Prazo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-9"
                    value={prazoDe}
                    onChange={e => { setPrazoDe(e.target.value); setPage(1); }}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">até</span>
                  <Input
                    type="date"
                    className="h-9"
                    value={prazoAte}
                    onChange={e => { setPrazoAte(e.target.value); setPage(1); }}
                  />
                </div>
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
                  onCardClick={openEdit}
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
                  <div key={t.id} onClick={() => openEdit(t)} className={`rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 cursor-pointer ${selected.has(t.id) ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}>
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
                      <TableRow key={t.id} onClick={() => openEdit(t)} className={`hover:bg-muted/30 transition-colors cursor-pointer ${selected.has(t.id) ? 'bg-primary/5' : ''}`}>
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

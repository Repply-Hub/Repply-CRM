import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useTarefas, useCreateTarefa, useUpdateTarefa, useDeleteTarefa, Tarefa } from '@/hooks/use-tarefas';
import { UserProfilePopover } from '@/components/UserProfilePopover';
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
import { Plus, Search, Trash2, Pencil, Eye, Loader2, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ListPagination } from '@/components/ListPagination';
import { supabase } from '@/integrations/supabase/client';
import { MarcadoresMultiSelect } from '@/components/tarefas/MarcadoresMultiSelect';
import { ParticipantesMultiSelect } from '@/components/tarefas/ParticipantesMultiSelect';
import { ProjetoSelect } from '@/components/tarefas/ProjetoSelect';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';

const TAREFA_COLUMNS: ColumnDefinition[] = [
  { id: 'titulo', label: 'Tarefa', locked: true },
  { id: 'responsavel', label: 'Responsável' },
  { id: 'prazo_final', label: 'Prazo' },
  { id: 'status', label: 'Status' },
  { id: 'projeto', label: 'Projeto' },
];

const DEFAULT_PAGE_SIZE = 10;

const statusConfig: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  em_andamento: { label: 'Em andamento', className: 'bg-warning/15 text-warning border-warning/30' },
  concluida: { label: 'Concluída', className: 'bg-success/15 text-success border-success/30' },
};

function getStatusInfo(s: string) {
  return statusConfig[s] ?? { label: s, className: 'bg-muted text-muted-foreground' };
}

export default function Tarefas() {
  const { data: tarefas = [], isLoading } = useTarefas();
  const { data: vendedores = [] } = useVendedores();
  const { data: obras = [] } = useObras();
  const queryClient = useQueryClient();
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const deleteTarefa = useDeleteTarefa();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTarefa, setViewTarefa] = useState<Tarefa | null>(null);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);

  const [form, setForm] = useState({
    titulo: '', descricao: '', status: 'pendente', prazo_final: '',
    responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '',
  });

  const filtered = useMemo(() => {
    let list = tarefas;
    if (statusFilter !== 'todos') list = list.filter(t => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.titulo.toLowerCase().includes(q) ||
        t.responsavel?.toLowerCase().includes(q) ||
        t.projeto?.toLowerCase().includes(q) ||
        t.marcadores?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tarefas, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openNew() {
    setEditingTarefa(null);
    setForm({ titulo: '', descricao: '', status: 'pendente', prazo_final: '', responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '' });
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
    <AppLayout title="Tarefas" subtitle={`${filtered.length} tarefa(s)`}>
      <div className="p-3 sm:p-4 md:p-6 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tarefas..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-fit max-w-full shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
          {someSelected && (
            <Button variant="destructive" size="sm" className="gap-2 shrink-0" onClick={() => setConfirmDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir {selected.size}
            </Button>
          )}
          <Button onClick={openNew} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />Nova Tarefa
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
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
                  <div key={t.id} className={`rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 ${selected.has(t.id) ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} className="mt-0.5" aria-label={`Selecionar ${t.titulo}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-card-foreground line-clamp-2">{t.titulo}</p>
                          {t.projeto && <p className="text-xs text-muted-foreground mt-1">{t.projeto}</p>}
                        </div>
                      </div>
                      <Badge className={`shrink-0 text-[10px] border ${si.className}`}>{si.label}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {t.responsavel && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /><UserProfilePopover name={t.responsavel} className="text-xs" />
                        </span>
                      )}
                      {t.prazo_final && (
                        <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          {format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 pt-2 border-t border-border/40">
                      <Button variant="ghost" size="sm" className="h-8 text-xs flex-1 hover:bg-primary/5" onClick={() => { setViewTarefa(t); setViewOpen(true); }}>
                        <Eye className="h-3.5 w-3.5 mr-1" />Ver
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table layout */}
            <div className="hidden md:block rounded-xl border border-border/60 border-b-0 rounded-b-none overflow-hidden shadow-[var(--shadow-card)]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </TableHead>
                    <TableHead>Tarefa</TableHead>
                    <TableHead className="hidden lg:table-cell">Responsável</TableHead>
                    <TableHead className="hidden lg:table-cell">Prazo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Projeto</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhuma tarefa encontrada</TableCell></TableRow>
                  ) : paginated.map(t => {
                    const si = getStatusInfo(t.status);
                    const isOverdue = t.prazo_final && new Date(t.prazo_final) < new Date() && t.status !== 'concluida';
                    return (
                      <TableRow key={t.id} className={`hover:bg-muted/30 transition-colors ${selected.has(t.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell className="w-10">
                          <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Selecionar ${t.titulo}`} />
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="font-medium text-sm text-card-foreground">{t.titulo}</p>
                          {t.projeto && <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">{t.projeto}</p>}
                          {t.responsavel && <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">{t.responsavel}</p>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">{t.responsavel ? <UserProfilePopover name={t.responsavel} /> : '—'}</TableCell>
                        <TableCell className={`hidden lg:table-cell text-sm whitespace-nowrap ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                          {t.prazo_final ? format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`whitespace-nowrap text-[11px] border ${si.className}`}>{si.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground truncate max-w-[180px]">{t.projeto || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5" onClick={() => { setViewTarefa(t); setViewOpen(true); }}>
                              <Eye className="h-4 w-4 text-muted-foreground" />
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
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Prazo</Label><Input type="datetime-local" value={form.prazo_final} onChange={e => setForm(f => ({ ...f, prazo_final: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Responsável</Label>
                <Select value={form.responsavel} onValueChange={v => setForm(f => ({ ...f, responsavel: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um responsável" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map((v: any) => (
                      <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projeto</Label>
                <ProjetoSelect
                  value={form.projeto}
                  onChange={(v) => setForm(f => ({ ...f, projeto: v }))}
                />
              </div>
            </div>
            <div>
              <Label>Participantes</Label>
              <ParticipantesMultiSelect
                value={form.participantes}
                onChange={(v) => setForm(f => ({ ...f, participantes: v }))}
                usuarios={vendedores.map((v: any) => ({ id: v.id, nome: v.nome }))}
              />
            </div>
            <div><Label>Observadores</Label><Input value={form.observadores} onChange={e => setForm(f => ({ ...f, observadores: e.target.value }))} placeholder="Separados por vírgula" /></div>
            <div>
              <Label>Marcadores</Label>
              <MarcadoresMultiSelect
                value={form.marcadores}
                onChange={(v) => setForm(f => ({ ...f, marcadores: v }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog visualizar */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da Tarefa</DialogTitle></DialogHeader>
          {viewTarefa && (
            <div className="space-y-4 text-sm mt-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Título</span>
                <p className="mt-1 font-medium text-card-foreground">{viewTarefa.titulo}</p>
              </div>
              {viewTarefa.descricao && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</span>
                  <p className="mt-1 whitespace-pre-wrap text-card-foreground">{viewTarefa.descricao}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
                  <div className="mt-1"><Badge className={`border ${getStatusInfo(viewTarefa.status).className}`}>{getStatusInfo(viewTarefa.status).label}</Badge></div>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prazo</span>
                  <p className="mt-1">{viewTarefa.prazo_final ? format(new Date(viewTarefa.prazo_final), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Responsável</span>
                  <div className="mt-1">{viewTarefa.responsavel ? <UserProfilePopover name={viewTarefa.responsavel} /> : '—'}</div>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Criado por</span>
                  <div className="mt-1">{viewTarefa.criado_por ? <UserProfilePopover name={viewTarefa.criado_por} /> : '—'}</div>
                </div>
              </div>
              {viewTarefa.participantes && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Participantes</span>
                  <p className="mt-1">{viewTarefa.participantes}</p>
                </div>
              )}
              {viewTarefa.observadores && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Observadores</span>
                  <p className="mt-1">{viewTarefa.observadores}</p>
                </div>
              )}
              {viewTarefa.projeto && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projeto</span>
                  <p className="mt-1">{viewTarefa.projeto}</p>
                </div>
              )}
              {viewTarefa.marcadores && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Marcadores</span>
                  <p className="mt-1">{viewTarefa.marcadores}</p>
                </div>
              )}
              <div className="flex gap-2 pt-4 border-t border-border/40">
                <Button variant="outline" className="flex-1" onClick={() => { setViewOpen(false); openEdit(viewTarefa); }}>
                  <Pencil className="h-4 w-4 mr-1" />Editar
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { handleDelete(viewTarefa.id); setViewOpen(false); }}>
                  <Trash2 className="h-4 w-4 mr-1" />Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm bulk delete */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} tarefa(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As tarefas selecionadas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={isDeleting}
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: selecionar página atual ou todos os filtrados */}
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
    </AppLayout>
  );
}

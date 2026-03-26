import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useTarefas, useCreateTarefa, useUpdateTarefa, useDeleteTarefa, Tarefa } from '@/hooks/use-tarefas';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Trash2, Pencil, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const PER_PAGE = 10;

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente: { label: 'Pendente', variant: 'secondary' },
  em_andamento: { label: 'Em andamento', variant: 'default' },
  concluida: { label: 'Concluída', variant: 'outline' },
};

function getStatusInfo(s: string) {
  return statusConfig[s] ?? { label: s, variant: 'secondary' as const };
}

export default function Tarefas() {
  const { data: tarefas = [], isLoading } = useTarefas();
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const deleteTarefa = useDeleteTarefa();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTarefa, setViewTarefa] = useState<Tarefa | null>(null);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    status: 'pendente',
    prazo_final: '',
    responsavel: '',
    participantes: '',
    observadores: '',
    projeto: '',
    marcadores: '',
  });

  const filtered = useMemo(() => {
    let list = tarefas;
    if (statusFilter !== 'todos') list = list.filter(t => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.titulo.toLowerCase().includes(q) ||
        t.responsavel?.toLowerCase().includes(q) ||
        t.marcadores?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tarefas, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function openNew() {
    setEditingTarefa(null);
    setForm({ titulo: '', descricao: '', status: 'pendente', prazo_final: '', responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '' });
    setDialogOpen(true);
  }

  function openEdit(t: Tarefa) {
    setEditingTarefa(t);
    setForm({
      titulo: t.titulo,
      descricao: t.descricao || '',
      status: t.status,
      prazo_final: t.prazo_final ? t.prazo_final.slice(0, 16) : '',
      responsavel: t.responsavel || '',
      participantes: t.participantes || '',
      observadores: t.observadores || '',
      projeto: t.projeto || '',
      marcadores: t.marcadores || '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    try {
      const payload = {
        ...form,
        prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : null,
      };
      if (editingTarefa) {
        await updateTarefa.mutateAsync({ id: editingTarefa.id, ...payload });
        toast.success('Tarefa atualizada');
      } else {
        await createTarefa.mutateAsync(payload);
        toast.success('Tarefa criada');
      }
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar tarefa'); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTarefa.mutateAsync(id);
      toast.success('Tarefa excluída');
    } catch { toast.error('Erro ao excluir'); }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} tarefa(s)</p>
          </div>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Nova Tarefa</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tarefas..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarefa</TableHead>
                <TableHead className="hidden md:table-cell">Responsável</TableHead>
                <TableHead className="hidden lg:table-cell">Prazo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Marcadores</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : paginated.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma tarefa encontrada</TableCell></TableRow>
              ) : paginated.map(t => {
                const si = getStatusInfo(t.status);
                const isOverdue = t.prazo_final && new Date(t.prazo_final) < new Date() && t.status !== 'concluida';
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <p className="font-medium text-sm line-clamp-2">{t.titulo}</p>
                      {t.projeto && <p className="text-xs text-muted-foreground mt-0.5">{t.projeto}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{t.responsavel || '—'}</TableCell>
                    <TableCell className={`hidden lg:table-cell text-sm ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                      {t.prazo_final ? format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{t.marcadores || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setViewTarefa(t); setViewOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} /></div>
              <div><Label>Projeto</Label><Input value={form.projeto} onChange={e => setForm(f => ({ ...f, projeto: e.target.value }))} /></div>
            </div>
            <div><Label>Participantes</Label><Input value={form.participantes} onChange={e => setForm(f => ({ ...f, participantes: e.target.value }))} placeholder="Separados por vírgula" /></div>
            <div><Label>Observadores</Label><Input value={form.observadores} onChange={e => setForm(f => ({ ...f, observadores: e.target.value }))} placeholder="Separados por vírgula" /></div>
            <div><Label>Marcadores</Label><Input value={form.marcadores} onChange={e => setForm(f => ({ ...f, marcadores: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog visualizar */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes da Tarefa</DialogTitle></DialogHeader>
          {viewTarefa && (
            <div className="space-y-3 text-sm">
              <div><span className="font-medium text-muted-foreground">Título:</span> <span>{viewTarefa.titulo}</span></div>
              {viewTarefa.descricao && <div><span className="font-medium text-muted-foreground">Descrição:</span> <p className="mt-1 whitespace-pre-wrap">{viewTarefa.descricao}</p></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium text-muted-foreground">Status:</span> <Badge variant={getStatusInfo(viewTarefa.status).variant} className="ml-1">{getStatusInfo(viewTarefa.status).label}</Badge></div>
                <div><span className="font-medium text-muted-foreground">Prazo:</span> {viewTarefa.prazo_final ? format(new Date(viewTarefa.prazo_final), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium text-muted-foreground">Responsável:</span> {viewTarefa.responsavel || '—'}</div>
                <div><span className="font-medium text-muted-foreground">Criado por:</span> {viewTarefa.criado_por || '—'}</div>
              </div>
              {viewTarefa.participantes && <div><span className="font-medium text-muted-foreground">Participantes:</span> {viewTarefa.participantes}</div>}
              {viewTarefa.observadores && <div><span className="font-medium text-muted-foreground">Observadores:</span> {viewTarefa.observadores}</div>}
              {viewTarefa.projeto && <div><span className="font-medium text-muted-foreground">Projeto:</span> {viewTarefa.projeto}</div>}
              {viewTarefa.marcadores && <div><span className="font-medium text-muted-foreground">Marcadores:</span> {viewTarefa.marcadores}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

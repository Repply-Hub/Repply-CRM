import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateTarefa, useUpdateTarefa, Tarefa } from '@/hooks/use-tarefas';
import { useVendedores, useClientes } from '@/hooks/use-clientes';
import { usePedidosOptions } from '@/hooks/use-pedidos';
import { useAuth } from '@/hooks/use-auth';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { ParticipantesMultiSelect } from '@/components/tarefas/ParticipantesMultiSelect';
import { MarcadoresMultiSelect } from '@/components/tarefas/MarcadoresMultiSelect';
import { ProjetoSelect } from '@/components/tarefas/ProjetoSelect';

interface KanbanStage {
  key: string;
  label: string;
}

interface TarefaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTarefa: Tarefa | null;
  kanbanStages: KanbanStage[];
  defaultStatus?: string;
  /** Campos fixos aplicados na criação (ex.: cliente_id ao abrir a partir da página de detalhes do cliente). */
  extraFields?: Partial<Tarefa>;
}

const emptyForm = {
  titulo: '', descricao: '', status: '', prazo_final: '',
  responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '',
  pedido_id: '', cliente_id: '',
};

export function TarefaFormDialog({ open, onOpenChange, editingTarefa, kanbanStages, defaultStatus, extraFields }: TarefaFormDialogProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: vendedores = [] } = useVendedores();
  const { data: clientes = [] } = useClientes();
  const { data: pedidosOptions = [] } = usePedidosOptions(empresaId);
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const [form, setForm] = useState(emptyForm);

  // Quando a tarefa já nasce vinculada a um cadastro fixo (ex.: aberta a partir da página do
  // cliente ou do negócio via extraFields), o campo correspondente fica travado e não deve
  // aparecer pra seleção manual.
  const negocioTravado = extraFields?.pedido_id !== undefined;
  const clienteTravado = extraFields?.cliente_id !== undefined;

  useEffect(() => {
    if (!open) return;
    if (editingTarefa) {
      setForm({
        titulo: editingTarefa.titulo, descricao: editingTarefa.descricao || '', status: editingTarefa.status,
        prazo_final: editingTarefa.prazo_final ? editingTarefa.prazo_final.slice(0, 16) : '',
        responsavel: editingTarefa.responsavel || '', participantes: editingTarefa.participantes || '',
        observadores: editingTarefa.observadores || '', projeto: editingTarefa.projeto || '', marcadores: editingTarefa.marcadores || '',
        pedido_id: editingTarefa.pedido_id || '', cliente_id: editingTarefa.cliente_id || '',
      });
    } else {
      setForm({ ...emptyForm, status: defaultStatus || kanbanStages[0]?.key || 'pendente' });
    }
  }, [open, editingTarefa, kanbanStages, defaultStatus]);

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    try {
      const { pedido_id, cliente_id, ...rest } = form;
      const payload = {
        ...rest,
        pedido_id: pedido_id || null,
        cliente_id: cliente_id || null,
        ...extraFields,
        prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : null,
      };
      if (editingTarefa) {
        await updateTarefa.mutateAsync({ id: editingTarefa.id, ...payload });
        toast.success('Tarefa atualizada');
      } else {
        await createTarefa.mutateAsync(payload);
        toast.success('Tarefa criada');
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error('[tarefas] erro ao salvar:', err);
      toast.error(err?.message || 'Erro ao salvar tarefa');
    }
  }

  return (
    // modal={false}: com o Dialog em modo modal (padrão), o lock de scroll do Radix bloqueia o
    // wheel/touch mesmo dentro dos dropdowns internos (Popover/Command de Responsável, Projeto,
    // Empresa, Negócio etc.), que são renderizados num portal fora do DialogContent.
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
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
                  {kanbanStages.map(stage => (
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
          {(!clienteTravado || !negocioTravado) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!clienteTravado && (
                <div className="space-y-1.5">
                  <Label>Empresa (cliente)</Label>
                  <SearchableSelect
                    options={clientes.map(c => ({ value: c.id, label: c.empresa }))}
                    value={form.cliente_id}
                    onValueChange={v => setForm(f => ({ ...f, cliente_id: v }))}
                    placeholder="Vincular a uma empresa"
                  />
                </div>
              )}
              {!negocioTravado && (
                <div className="space-y-1.5">
                  <Label>Negócio</Label>
                  <SearchableSelect
                    options={pedidosOptions.map(p => ({
                      value: p.id,
                      label: [p.cliente?.empresa, p.fabricante?.nome].filter(Boolean).join(' — ') || 'Negócio sem cliente',
                    }))}
                    value={form.pedido_id}
                    onValueChange={v => setForm(f => ({ ...f, pedido_id: v }))}
                    placeholder="Vincular a um negócio"
                  />
                </div>
              )}
            </div>
          )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending}>
            {(createTarefa.isPending || updateTarefa.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingTarefa ? 'Salvar Alterações' : 'Criar Tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { DialogPortal } from '@/components/ui/dialog';
import {
  Dialog,
  DialogTitle,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateTarefa, useUpdateTarefa, Tarefa } from '@/hooks/use-tarefas';
import { useVendedores, useClientes } from '@/hooks/use-clientes';
import {
  usePedidosOptions,
  usePedidoOptionPorId,
  PEDIDOS_OPTIONS_LIMITE_LISTA,
  PEDIDOS_OPTIONS_LIMITE_BUSCA,
  PEDIDOS_OPTIONS_MIN_BUSCA,
} from '@/hooks/use-pedidos';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { useAuth } from '@/hooks/use-auth';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { SeletorComBusca } from '@/components/tarefas/SeletorComBusca';
import { ParticipantesMultiSelect } from '@/components/tarefas/ParticipantesMultiSelect';
import { MarcadoresMultiSelect } from '@/components/tarefas/MarcadoresMultiSelect';
import { EventDateTimeField } from '@/components/calendar/EventDateTimeField';

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
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const [form, setForm] = useState(emptyForm);

  // Busca de negócio: represada por 300ms porque cada mudança de termo custa uma
  // consulta ao servidor — a lista tem 11.907 negócios e não cabe no navegador.
  const [buscaNegocio, setBuscaNegocio] = useState('');
  const buscaNegocioRepresada = useDebouncedValue(buscaNegocio, 300);
  const { data: pedidosEncontrados = [], isFetching: buscandoNegocios } =
    usePedidosOptions(empresaId, buscaNegocioRepresada);
  // O negócio já vinculado à tarefa pode não estar entre os que a busca devolveu.
  // Sem isso o campo mostraria "Vincular a um negócio", como se o vínculo tivesse sumido.
  const { data: pedidoVinculado } = usePedidoOptionPorId(form.pedido_id || null);

  // Quando a tarefa já nasce vinculada a um cadastro fixo (ex.: aberta a partir da página do
  // cliente ou do negócio via extraFields), o campo correspondente fica travado e não deve
  // aparecer pra seleção manual.
  const negocioTravado = extraFields?.pedido_id !== undefined;
  const clienteTravado = extraFields?.cliente_id !== undefined;

  // Junta o negócio já vinculado à fatia que a consulta trouxe, para os dois usos:
  // desenhar o rótulo do campo e responder à troca de empresa logo abaixo.
  const pedidosOptions = useMemo(() => {
    if (!pedidoVinculado || pedidosEncontrados.some(p => p.id === pedidoVinculado.id)) return pedidosEncontrados;
    return [pedidoVinculado, ...pedidosEncontrados];
  }, [pedidosEncontrados, pedidoVinculado]);

  // Um negócio só pode estar vinculado à sua própria empresa: selecionar o negócio primeiro
  // puxa a empresa automaticamente, e selecionar a empresa primeiro restringe a lista de
  // negócios aos que pertencem a ela.
  const pedidosOptionsFiltradas = useMemo(() => {
    if (!form.cliente_id) return pedidosOptions;
    return pedidosOptions.filter(p => p.cliente?.id === form.cliente_id);
  }, [pedidosOptions, form.cliente_id]);

  // Aviso honesto de lista cortada: sem ele a pessoa digita o nome certo, não acha
  // nada e conclui que o negócio não existe.
  const buscandoNoServidor = buscaNegocioRepresada.trim().length >= PEDIDOS_OPTIONS_MIN_BUSCA;
  const avisoNegocios = buscandoNoServidor
    ? (pedidosEncontrados.length >= PEDIDOS_OPTIONS_LIMITE_BUSCA
        ? `Mostrando os ${PEDIDOS_OPTIONS_LIMITE_BUSCA} primeiros resultados — escreva mais para afinar a busca.`
        // Aviso mesmo com poucos resultados: a busca casa o termo contra o nome do
        // cliente e do fabricante por lista de ids, e essa lista tem teto
        // (PEDIDOS_OPTIONS_TETO_IDS). Com termo comum — "co" casa 1.066 clientes — a
        // busca responde sem ter visto todos. Dizer "nada encontrado" seria mentira.
        : 'A busca cobre a base inteira, mas pode não ver tudo quando o termo é muito curto. Se faltar algum, escreva mais letras.')
    : (pedidosEncontrados.length >= PEDIDOS_OPTIONS_LIMITE_LISTA
        ? `Mostrando os ${PEDIDOS_OPTIONS_LIMITE_LISTA} negócios mais recentes. Digite ao menos ${PEDIDOS_OPTIONS_MIN_BUSCA} letras para procurar em todos.`
        : undefined);

  // Empresa: nome, razão social e CNPJ juntos na busca, e o CNPJ visível embaixo do
  // nome — a MD tem 70 clientes com nome repetido, e sem isso os dois cadastros
  // "Construtora Silva" ficam idênticos na tela e a escolha vira chute.
  const opcoesClientes = useMemo(
    () => clientes.map((c) => ({
      value: c.id,
      label: c.empresa,
      descricao: [c.razao_social, c.cnpj].filter(Boolean).join(' · ') || undefined,
    })),
    [clientes],
  );

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
      setForm({
        ...emptyForm,
        status: defaultStatus || kanbanStages[0]?.key || 'pendente',
        responsavel: profile?.nome ?? '',
      });
    }
  }, [open, editingTarefa, kanbanStages, defaultStatus, profile]);

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
    // Empresa, Negócio etc.), que são renderizados num portal fora do DialogContent. Como isso
    // desliga o overlay nativo do Radix, o blur de fundo é recriado manualmente abaixo.
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      {/* Portal sempre montado (não condicionado a `open`) para garantir que fique antes do
          portal do DialogContent no DOM — senão pinta por cima do conteúdo do modal. */}
      <DialogPortal>
        <div
          className={cn(
            'fixed inset-0 z-[1050] bg-black/80 backdrop-blur-sm pointer-events-none',
            !open && 'hidden',
          )}
        />
      </DialogPortal>

      <ConteudoDialogo className="max-w-lg">
        <CabecalhoDialogo><DialogTitle>{editingTarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle></CabecalhoDialogo>
        {/* Título e botões ficam parados; só os campos rolam. Em zoom alto o formulário
            passa da altura da janela, e antes o "Criar Tarefa" ia junto para fora da tela. */}
        <CorpoDialogo className="space-y-4 mt-2">
          <div><Label>Título *</Label><Input placeholder="Ex: Ligar para o cliente" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
          <div><Label>Descrição</Label><Textarea placeholder="Detalhes da tarefa (opcional)" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
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
            <EventDateTimeField
              label="Prazo Final"
              type="datetime-local"
              value={form.prazo_final}
              onChange={v => setForm(f => ({ ...f, prazo_final: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <SearchableSelect
              options={vendedores.map(v => ({ value: v.nome, label: v.nome }))}
              value={form.responsavel}
              onValueChange={v => setForm(f => ({ ...f, responsavel: v }))}
              placeholder="Selecione o responsável"
            />
          </div>
          {(!clienteTravado || !negocioTravado) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!clienteTravado && (
                <div className="space-y-1.5">
                  <Label>Empresa (cliente)</Label>
                  <SeletorComBusca
                    options={opcoesClientes}
                    value={form.cliente_id}
                    onValueChange={v => setForm(f => {
                      // Troca de empresa: se o negócio selecionado não pertence a ela, desvincula.
                      const pedidoAtual = pedidosOptions.find(p => p.id === f.pedido_id);
                      const pedidoAindaValido = pedidoAtual && pedidoAtual.cliente?.id === v;
                      return { ...f, cliente_id: v, pedido_id: pedidoAindaValido ? f.pedido_id : '' };
                    })}
                    placeholder="Vincular a uma empresa"
                    searchPlaceholder="Nome, razão social ou CNPJ..."
                    emptyMessage="Nenhuma empresa encontrada."
                    contentClassName="w-[min(28rem,90vw)]"
                  />
                </div>
              )}
              {!negocioTravado && (
                <div className="space-y-1.5">
                  <Label>Negócio</Label>
                  <SeletorComBusca
                    options={pedidosOptionsFiltradas.map(p => ({
                      value: p.id,
                      label: getNomeNegocio(p),
                      descricao: [p.cliente?.empresa, p.fabricante?.nome].filter(Boolean).join(' · ') || undefined,
                    }))}
                    value={form.pedido_id}
                    onValueChange={v => setForm(f => {
                      const pedido = pedidosOptions.find(p => p.id === v);
                      return { ...f, pedido_id: v, cliente_id: pedido?.cliente?.id ?? f.cliente_id };
                    })}
                    aoBuscar={setBuscaNegocio}
                    carregando={buscandoNegocios && pedidosEncontrados.length === 0}
                    aviso={avisoNegocios}
                    placeholder="Vincular a um negócio"
                    searchPlaceholder="Nome do negócio, cliente ou fabricante..."
                    emptyMessage="Nenhum negócio encontrado."
                    contentClassName="w-[min(28rem,90vw)]"
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
        </CorpoDialogo>
        <RodapeDialogo className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending}>
            {(createTarefa.isPending || updateTarefa.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingTarefa ? 'Salvar Alterações' : 'Criar Tarefa'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useVendedores, useClientes } from '@/hooks/use-clientes';
import { useObras } from '@/hooks/use-obras';
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
import { paraCampoDataHora } from '@/lib/campo-de-data-hora';
import { CampoDeAnexosDaTarefa } from '@/components/tarefas/CampoDeAnexosDaTarefa';
import { useAnexosDaTarefa, useAdicionarAnexoDaTarefa, useRemoverAnexoDaTarefa, enviarAnexoDeTarefa } from '@/hooks/use-tarefa-anexos';

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
  /**
   * Obra sugerida ao CRIAR (ex.: a obra do negócio que abriu este formulário). Diferente de
   * `extraFields`, este campo NÃO trava o seletor — a pessoa pode trocar a obra à vontade, e o
   * `handleSave` grava o que estiver em `form.obra_id` na hora de salvar, não este valor.
   */
  obraPadrao?: string | null;
}

const emptyForm = {
  titulo: '', descricao: '', status: '', prazo_final: '',
  responsavel: '', participantes: '', observadores: '', projeto: '', marcadores: '',
  pedido_id: '', cliente_id: '', obra_id: '',
};

export function TarefaFormDialog({ open, onOpenChange, editingTarefa, kanbanStages, defaultStatus, extraFields, obraPadrao }: TarefaFormDialogProps) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: vendedores = [] } = useVendedores();
  const { data: clientes = [] } = useClientes();
  const { data: obras = [] } = useObras();
  const createTarefa = useCreateTarefa();
  const updateTarefa = useUpdateTarefa();
  const [form, setForm] = useState(emptyForm);
  // Cobre o `handleSave` inteiro, inclusive o upload dos anexos: sem isto, um duplo clique no
  // botão dispara duas gravações (a mutação em si já tem `isPending`, mas o laço de upload que
  // vem depois dela, no ramo CRIAR, não é coberto por nenhum `isPending`).
  const [salvando, setSalvando] = useState(false);

  // EDITAR: anexos vêm do banco; cada gesto grava na hora.
  const anexosSalvos = useAnexosDaTarefa(editingTarefa?.id);
  const adicionarAnexo = useAdicionarAnexoDaTarefa(editingTarefa?.id ?? '');
  const removerAnexo = useRemoverAnexoDaTarefa(editingTarefa?.id ?? '');
  // CRIAR: a tarefa ainda não existe — arquivos ficam em memória até ela nascer. Cada um carrega
  // um id estável (não o índice do array) para sobreviver à remoção de um anexo do meio da lista.
  const [anexosPendentes, setAnexosPendentes] = useState<{ id: string; file: File }[]>([]);

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
  // Primitivos (não o objeto `extraFields`, que é novo a cada render): o efeito de abertura semeia
  // os campos travados a partir daqui e ainda satisfaz o exhaustive-deps sem re-disparar a cada
  // render — só quando o vínculo muda de verdade.
  const extraClienteId = extraFields?.cliente_id;
  const extraPedidoId = extraFields?.pedido_id;

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

  // Obra: quando a empresa já está escolhida, a lista se restringe às obras DELA — igual ao
  // negócio logo abaixo. Sem empresa escolhida, mostra todas (a `descricao` deixa claro de qual
  // cliente é cada uma).
  const opcoesObras = useMemo(
    () => obras
      .filter((o) => !form.cliente_id || o.cliente_id === form.cliente_id)
      .map((o) => ({
        value: o.id,
        label: o.nome_obra ?? '(sem nome)',
        descricao: o.clientes?.empresa ?? undefined,
      })),
    [obras, form.cliente_id],
  );

  useEffect(() => {
    if (!open) return;
    // Arquivo escolhido antes de a tarefa existir não pode sobreviver a uma abertura seguinte —
    // senão o anexo de uma tarefa nova aparece grudado na próxima.
    setAnexosPendentes([]);
    if (editingTarefa) {
      setForm({
        titulo: editingTarefa.titulo, descricao: editingTarefa.descricao || '', status: editingTarefa.status,
        // 🔴 `.slice(0, 16)` cortava o texto em UTC direto do banco (`timestamptz`) e o jogava
        // no campo como se já fosse hora local — um prazo das 17h de Brasília aparecia como
        // 20h, e salvar sem mudar nada empurrava o prazo 3 horas (mesma família do CLAUDE.md
        // §7.12). `new Date(...)` lê o carimbo certo (UTC) e `paraCampoDataHora` escreve no
        // fuso local, igual ao padrão de `campo-de-data-hora.ts`.
        prazo_final: editingTarefa.prazo_final ? paraCampoDataHora(new Date(editingTarefa.prazo_final)) : '',
        responsavel: editingTarefa.responsavel || '', participantes: editingTarefa.participantes || '',
        observadores: editingTarefa.observadores || '', projeto: editingTarefa.projeto || '', marcadores: editingTarefa.marcadores || '',
        pedido_id: editingTarefa.pedido_id || '', cliente_id: editingTarefa.cliente_id || '',
        obra_id: editingTarefa.obra_id || '',
      });
    } else {
      setForm({
        ...emptyForm,
        status: defaultStatus || kanbanStages[0]?.key || 'pendente',
        responsavel: profile?.nome ?? '',
        // Sugestão, não trava: a pessoa continua livre para trocar a obra (ver `obraPadrao` em
        // `TarefaFormDialogProps`).
        obra_id: obraPadrao ?? '',
        // Campos TRAVADOS (aberto de um negócio/cliente) precisam MOSTRAR o vínculo: o
        // SeletorComBusca desabilitado lê o valor daqui, e semear `pedido_id` faz o
        // `usePedidoOptionPorId` buscar o negócio para o rótulo aparecer (sem isto, em produção
        // o campo do negócio ficaria vazio). O `handleSave` reaplica `...extraFields`, então o
        // valor gravado continua o do negócio.
        cliente_id: (extraClienteId as string) ?? '',
        pedido_id: (extraPedidoId as string) ?? '',
      });
    }
  }, [open, editingTarefa, kanbanStages, defaultStatus, profile, obraPadrao, extraClienteId, extraPedidoId]);

  async function handleSave() {
    // Reentrada: um segundo clique enquanto o primeiro ainda está salvando (upload de anexo
    // incluído) não dispara uma segunda gravação — sem isto, duplo clique cria duas tarefas.
    if (salvando) return;
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    setSalvando(true);
    try {
      const { pedido_id, cliente_id, obra_id, ...rest } = form;
      const payload = {
        ...rest,
        pedido_id: pedido_id || null,
        cliente_id: cliente_id || null,
        obra_id: obra_id || null,
        ...extraFields,
        prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : null,
      };
      if (editingTarefa) {
        await updateTarefa.mutateAsync({ id: editingTarefa.id, ...payload });
        toast.success('Tarefa atualizada');
      } else {
        const { id } = await createTarefa.mutateAsync(payload);
        if (anexosPendentes.length > 0) {
          if (!profile?.empresa_id || !profile?.id) {
            toast.error('Tarefa criada, mas os anexos não subiram: seu usuário/empresa não foi identificado.');
          } else {
            const falhas: string[] = [];
            for (const { file } of anexosPendentes) {
              try {
                await enviarAnexoDeTarefa(id, file, { id: profile.id, empresa_id: profile.empresa_id });
              } catch {
                falhas.push(file.name);
              }
            }
            if (falhas.length > 0) {
              toast.error(`Tarefa criada, mas ${falhas.length} anexo(s) não subiram: ${falhas.join(', ')}.`);
            } else {
              toast.success('Tarefa criada');
            }
            // Ao menos um anexo subiu: o clipe de contagem do card lê da lista de tarefas, não da
            // de anexos — sem isto ele fica parado até o próximo refetch.
            qc.invalidateQueries({ queryKey: ['tarefas'] });
          }
        } else {
          toast.success('Tarefa criada');
        }
      }
      onOpenChange(false);
    } catch (err) {
      console.error('[tarefas] erro ao salvar:', err);
      // `err?.message` sozinho jogava fora `details` e `hint` do banco — e, quando a recusa é
      // MUDA (zero linhas alteradas), a frase acionável vem inteira dentro da mensagem que
      // `useUpdateTarefa` monta. Ver `CLAUDE.md` §4.6.
      toast.error(mensagemDeErro(err, 'Não foi possível salvar a tarefa.'));
      // O formulário fica aberto de propósito: fechá-lo depois de uma recusa apagaria o que a
      // pessoa digitou, e ela não teria como tentar de novo nem copiar o que escreveu.
    } finally {
      setSalvando(false);
    }
  }

  // 🔴 Roda do mouse PRESA quando este formulário abre POR CIMA do painel do negócio.
  // O painel (PainelDoNegocio) é um `Sheet` MODAL do Radix, que usa `react-remove-scroll`:
  // ele registra um listener de `wheel`/`touchmove` no `document` (fase de BOLHA, {passive:false},
  // conferido em react-remove-scroll@2.7.1/SideEffect.js) e dá `preventDefault` em tudo que não
  // esteja DENTRO do conteúdo do Sheet. Este diálogo é `modal={false}` de propósito (o comentário
  // do return explica) e vive noutro portal, FORA do Sheet — então a roda do mouse sobre ele era
  // barrada e o miolo não rolava.
  //
  // Conserto (determinístico): um CALLBACK REF anexa, no instante em que o diálogo monta, um
  // listener NATIVO de `wheel` que ROLA O MIOLO NA MÃO (`scrollTop += delta` no `CorpoDialogo`,
  // marcado com `data-corpo-rolavel`) e só então consome o evento. Rolar na mão não depende de
  // vencer o `preventDefault` do react-remove-scroll — a barra anda de qualquer jeito.
  // (A 1ª tentativa, só `stopPropagation` por `useEffect`, NÃO pegou: corrida entre o efeito e a
  // montagem do conteúdo do Radix deixava o nó ainda nulo; o callback ref elimina essa corrida.)
  //
  // Não mexe nos casos que o plano pediu para preservar: (a) formulário aberto sozinho pela tela
  // de Tarefas — sem Sheet, o mesmo gesto rola igual; (b) o painel depois de fechar o formulário —
  // o listener sai junto com o diálogo; (c) os seletores internos (Responsável, Empresa…), portais
  // FORA deste nó. Na borda (topo/fim) NÃO consome o evento, então não prende a roda.
  const limparRolagemRef = useRef<(() => void) | null>(null);
  const refDoConteudo = useCallback((node: HTMLDivElement | null) => {
    limparRolagemRef.current?.();
    limparRolagemRef.current = null;
    if (!node) return;
    const rolarNaMao = (e: WheelEvent) => {
      const alvo = e.target as Element | null;
      const rolavel = (alvo?.closest('[data-corpo-rolavel]')
        ?? node.querySelector('[data-corpo-rolavel]')) as HTMLElement | null;
      if (!rolavel) return;
      // deltaMode 1 = linhas, 2 = páginas; a maioria dos mouses/trackpads usa 0 = pixels.
      const passo = e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * rolavel.clientHeight
        : e.deltaY;
      const antes = rolavel.scrollTop;
      rolavel.scrollTop += passo;
      // Só consome quando REALMENTE rolou; na borda deixa o evento seguir (sem prender a roda).
      if (rolavel.scrollTop !== antes) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const soltarToque = (e: Event) => e.stopPropagation();
    node.addEventListener('wheel', rolarNaMao, { passive: false });
    node.addEventListener('touchmove', soltarToque, { passive: false });
    limparRolagemRef.current = () => {
      node.removeEventListener('wheel', rolarNaMao);
      node.removeEventListener('touchmove', soltarToque);
    };
  }, []);

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

      <ConteudoDialogo ref={refDoConteudo} className="max-w-lg">
        <CabecalhoDialogo><DialogTitle>{editingTarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle></CabecalhoDialogo>
        {/* Título e botões ficam parados; só os campos rolam. Em zoom alto o formulário
            passa da altura da janela, e antes o "Criar Tarefa" ia junto para fora da tela. */}
        <CorpoDialogo data-corpo-rolavel className="space-y-4 mt-2">
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
          {/* Item 5a: os dois campos aparecem SEMPRE, mesmo quando a tarefa nasce vinculada a um
              cadastro fixo (aberta a partir do cliente ou do negócio, via `extraFields`) — antes
              o bloco inteiro sumia nesse caso, e a pessoa não tinha como VER o vínculo. Travado,
              o `SeletorComBusca` fica `disabled` mas mostra o valor (que veio de `extraFields`/
              `pedidoVinculado`); o `handleSave` já aplica `...extraFields` por cima, então o que
              é gravado continua sendo o do negócio, nunca o que aparece desabilitado na tela. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                disabled={clienteTravado}
              />
            </div>
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
                disabled={negocioTravado}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Obra</Label>
            <SeletorComBusca
              options={opcoesObras}
              value={form.obra_id}
              onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}
              placeholder="Vincular a uma obra"
              searchPlaceholder="Nome da obra..."
              emptyMessage="Nenhuma obra encontrada."
              contentClassName="w-[min(28rem,90vw)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Participantes</Label>
            <ParticipantesMultiSelect value={form.participantes} onChange={v => setForm(f => ({ ...f, participantes: v }))} usuarios={vendedores} />
          </div>
          <div className="space-y-1.5">
            <Label>Marcadores</Label>
            <MarcadoresMultiSelect value={form.marcadores} onChange={v => setForm(f => ({ ...f, marcadores: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Anexos</Label>
            {editingTarefa ? (
              <CampoDeAnexosDaTarefa
                anexos={anexosSalvos.data ?? []}
                onAdicionar={(f) => adicionarAnexo.mutate(f)}
                onRemover={(id) => removerAnexo.mutate(id)}
                enviando={adicionarAnexo.isPending}
              />
            ) : (
              <CampoDeAnexosDaTarefa
                anexos={anexosPendentes.map((p, i) => ({
                  id: p.id,
                  url: '',
                  nome: p.file.name,
                  tipo: p.file.type || null,
                  tamanhoBytes: p.file.size,
                  criadoEm: new Date(Date.now() + i).toISOString(),
                }))}
                onAdicionar={(f) => setAnexosPendentes((xs) => [...xs, { id: crypto.randomUUID(), file: f }])}
                onRemover={(id) => setAnexosPendentes((xs) => xs.filter((p) => p.id !== id))}
              />
            )}
          </div>
        </CorpoDialogo>
        <RodapeDialogo className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={createTarefa.isPending || updateTarefa.isPending || salvando}>
            {(createTarefa.isPending || updateTarefa.isPending || salvando) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingTarefa ? 'Salvar Alterações' : 'Criar Tarefa'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

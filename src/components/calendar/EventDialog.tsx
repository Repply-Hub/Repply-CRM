import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarDays, Trash2, Users, Check, ChevronDown, HardHat } from 'lucide-react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useVendedores } from '@/hooks/use-clientes';
import { useAuth } from '@/hooks/use-auth';
import { useEventoParticipantes, buscarConflitosDeVisita, type ConflitoVisita } from '@/hooks/use-eventos';
import type { CalendarEvent, EventoForm, CalendarType } from './types';
import { EVENT_PRESET_COLORS, CALENDAR_COLORS } from './types';
import { EventDateTimeField } from './EventDateTimeField';
import { LembretesField } from './LembretesField';
import { LEMBRETES_PADRAO, normalizarLembretes } from '@/lib/lembretes-do-evento';

interface EventDialogProps {
  open: boolean;
  initialData?: Partial<EventoForm>;
  editingEvent?: CalendarEvent | null;
  onClose: () => void;
  onSave: (form: EventoForm) => void;
  /**
   * 🔴 Recebe o EVENTO, não o id. Um compromisso com participantes é uma linha por pessoa, e
   * quem exclui precisa saber se organizou (cancela para todos) ou só participa (sai dele) —
   * decisão que mora em `useDeleteEvento` e depende de `grupoId` e `criadoPor`.
   */
  onDelete?: (evento: CalendarEvent) => void;
  /**
   * Aba "Visita a obra" do tablist não cria a visita aqui dentro — entrega
   * para o mesmo diálogo de rota de visita usado em Obras/Calendário, que já
   * suporta várias paradas. Um evento comum (obra_id nulo) não vira rota; só
   * a rota de visita cria linha em `eventos` com obra_id.
   */
  onAbrirRotaVisita?: (dataInicial?: Date) => void;
  /**
   * Está reabrindo DEPOIS de uma ida ao diálogo de rota de visita — o que já estava
   * preenchido tem de voltar como estava.
   *
   * 🔴 O `form` deste componente SOBREVIVE à ida: a página Calendário mantém o EventDialog
   * montado o tempo todo, só fecha. Quem apaga o rascunho é o efeito de abertura logo abaixo,
   * que reescreve o formulário toda vez que `open` vira verdadeiro. Sem esta bandeira,
   * "Voltar" devolveria um formulário em branco — exatamente o mesmo que Cancelar.
   *
   * Quem abre um evento novo, ou clica num evento existente, passa falso, e a limpeza volta a
   * acontecer normalmente.
   */
  retomandoRascunho?: boolean;
}

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

const defaultForm = (): EventoForm => {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    titulo: '',
    descricao: '',
    inicio: format(now, "yyyy-MM-dd'T'HH:mm"),
    fim: format(later, "yyyy-MM-dd'T'HH:mm"),
    diaInteiro: false,
    tipoCalendario: 'empresa',
    cor: CALENDAR_COLORS.empresa,
    participantes: [],
    lembretes: [...LEMBRETES_PADRAO],
    avisarParticipantes: true,
    obraId: null,
    visitaRealizada: false,
    visitaObservacao: '',
  };
};

export function EventDialog({
  open,
  initialData,
  editingEvent,
  onClose,
  onSave,
  onDelete,
  onAbrirRotaVisita,
  retomandoRascunho = false,
}: EventDialogProps) {
  const [form, setForm] = useState<EventoForm>(defaultForm());
  const [participantesOpen, setParticipantesOpen] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoVisita[]>([]);
  const [verificandoConflito, setVerificandoConflito] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: usuarios, refetch: refetchUsuarios } = useVendedores();
  const {
    data: participantesExistentes,
    // 🔴 Bloco 3, item A (revisão da revisão). `isFetching`, NÃO `isLoading`. Em React
    // Query v5, `isLoading = isPending && isFetching`, e `isPending` já nasce falso
    // assim que existe QUALQUER dado em cache para a chave — inclusive o de uma
    // abertura anterior deste MESMO evento. Reabrir com o cache quente disparava o
    // refetch forçado (efeito abaixo) com `isLoading` já falso o tempo todo: a trava
    // de Salvar nunca via "carregando" nenhum. `isFetching` continua `true` durante
    // QUALQUER busca, inclusive esse refetch em segundo plano.
    isFetching: carregandoParticipantes,
    isSuccess: participantesCarregaramComSucesso,
    isError: participantesComErro,
    // Quando esta consulta atualizou pela última vez COM SUCESSO — usado para provar que
    // um resultado é de uma busca mais nova que o pedido de invalidação que este diálogo
    // disparou ao abrir (ver os dois efeitos abaixo). `isFetching` sozinho não bastava:
    // ele só reflete a busca já em andamento NUM RENDER SEGUINTE ao `invalidateQueries`,
    // não no mesmo lote de efeitos em que ele é chamado — e é exatamente nesse intervalo
    // que uma lista velha do cache podia ser copiada para o formulário.
    dataUpdatedAt: participantesAtualizadoEm,
    refetch: refetchParticipantes,
  } = useEventoParticipantes(open && editingEvent ? editingEvent.grupoId : null);

  // Ref, e não estado: o valor precisa ficar visível para o efeito de baixo (que copia
  // participantes para o formulário) DENTRO DO MESMO LOTE de efeitos em que é gravado —
  // um `useState` só refletiria a mudança no PRÓXIMO render, tarde demais para fechar a
  // brecha descrita acima.
  const marcaAntesDeBuscarDeNovoRef = useRef(0);
  // Espelha `participantesAtualizadoEm` a CADA render (não só em efeito), para o efeito de
  // abertura poder ler o valor atual sem entrar na lista de dependências dele — se entrasse,
  // esse efeito (que também reseta o formulário) rodaria de novo toda vez que uma busca de
  // participantes terminasse, apagando o que a pessoa estivesse digitando.
  const participantesAtualizadoEmRef = useRef(participantesAtualizadoEm);
  participantesAtualizadoEmRef.current = participantesAtualizadoEm;

  // Funcionários da empresa, incluindo o próprio usuário logado (aparece como "Você", no topo)
  const funcionariosDisponiveis = useMemo(() => {
    const lista = (usuarios ?? []).filter((u: { user_id: string | null }) => u.user_id);
    return [...lista].sort((a: { user_id: string }, b: { user_id: string }) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      return 0;
    });
  }, [usuarios, user?.id]);

  useEffect(() => {
    if (!open) return;

    // Garante a lista de funcionários atualizada toda vez que o modal é aberto,
    // já que a página de calendário fica montada e o cache pode estar desatualizado
    // (ex.: usuário novo criado em outra sessão/aba).
    refetchUsuarios();

    // 🔴 Bloco 3, item A — "variante" do bug: `useEventoParticipantes` usa `staleTime:
    // Infinity` de propósito (evita sobrescrever seleção em foco de janela), mas isso também
    // significa que reabrir o MESMO evento poderia reaproveitar uma lista velha do cache —
    // convidando de novo quem já tinha saído entre uma abertura e outra. Invalidar aqui, ao
    // abrir, força ir ao banco de novo sem mudar o `staleTime` da consulta (que outra tela,
    // `NovaRotaVisitaDialog`, também usa e não deve ser afetada).
    //
    // 🔴 O CARIMBO VEM ANTES DO INVALIDATE, de propósito. Guardamos aqui o `dataUpdatedAt`
    // de ANTES de pedir a busca de novo; os dois efeitos abaixo (trava de Salvar e cópia
    // para o formulário) só aceitam um resultado com `dataUpdatedAt` MAIOR que este
    // carimbo — nunca um igual, que é exatamente o que o cache quente ainda mostra no
    // instante em que este efeito roda.
    if (editingEvent?.grupoId) {
      marcaAntesDeBuscarDeNovoRef.current = participantesAtualizadoEmRef.current;
      qc.invalidateQueries({ queryKey: ['evento-participantes', editingEvent.grupoId] });
    }

    // Voltando da rota de visita: o que a pessoa já tinha preenchido continua na tela.
    // Este efeito é o ÚNICO lugar que apaga o rascunho, então sair aqui é o que faz o
    // "Voltar" valer alguma coisa. A releitura de funcionários acima acontece de qualquer
    // jeito — ela não mexe no formulário.
    if (retomandoRascunho) return;

    if (editingEvent) {
      const ini = editingEvent.diaInteiro
        ? toDateInput(editingEvent.inicio.toISOString())
        : toDatetimeLocal(editingEvent.inicio.toISOString());
      const fim = editingEvent.diaInteiro
        ? toDateInput(editingEvent.fim.toISOString())
        : toDatetimeLocal(editingEvent.fim.toISOString());
      setForm({
        titulo: editingEvent.titulo,
        descricao: editingEvent.descricao ?? '',
        inicio: ini,
        fim: fim,
        diaInteiro: editingEvent.diaInteiro,
        tipoCalendario: editingEvent.tipoCalendario,
        cor: editingEvent.cor,
        // 🔴 `undefined`, e não `[]`. A lista real chega depois, pela consulta de
        // participantes existentes (useEventoParticipantes) — ver efeito abaixo. Até lá,
        // "ainda não sei quem são os participantes" (undefined) tem de ficar visualmente
        // distinto de "a pessoa esvaziou a seleção de propósito" ([]) — é essa distinção que
        // `useUpdateEvento` usa para recusar salvar em cima de uma lista que não carregou
        // (Bloco 3, item A). Os dois casos SE PARECEM na tela (nenhum badge aparece), mas o
        // botão Salvar fica desabilitado enquanto for o primeiro (ver `aguardandoParticipantes`
        // abaixo), então a diferença nunca chega a ser salva por engano.
        participantes: undefined,
        // `normalizarLembretes` de novo aqui, e não só na gravação: o `LembretesField` confia
        // que `value` chega ordenado e sem repetição (ver seu comentário), e este é o único
        // ponto em que um dado vindo do banco alimenta esse `value` diretamente.
        lembretes: normalizarLembretes(editingEvent.lembretes ?? []),
        avisarParticipantes: editingEvent.avisarParticipantes ?? false,
        obraId: editingEvent.obraId ?? null,
        visitaRealizada: editingEvent.visitaRealizada ?? false,
        visitaObservacao: editingEvent.visitaObservacao ?? '',
      });
    } else {
      setForm({
        ...defaultForm(),
        participantes: user?.id ? [user.id] : [],
        ...initialData,
      });
    }
  }, [open, editingEvent, initialData, retomandoRascunho, user?.id, qc]);

  // Preenche os participantes do evento assim que a busca resolve (chega depois da
  // abertura do modal, por isso é um efeito separado do de cima).
  //
  // 🔴 Bloco 3, item A (revisão da revisão) — NÃO BASTA `participantesExistentes` existir.
  // Com o cache quente (reabrir o MESMO evento), `data` já vem preenchido com a lista
  // VELHA desde o primeiro render depois de abrir — antes mesmo do refetch forçado (efeito
  // acima) aparecer como "buscando" para este hook. Copiar direto daria exatamente o bug
  // que este bloco existe para consertar: a tela mostraria (e salvaria, se o usuário fosse
  // rápido) uma lista que já pode estar desatualizada.
  //
  // A condição agora exige TODAS estas coisas ao mesmo tempo:
  //   - sucesso (nunca copia em cima de erro, mesmo com dado velho ainda em cache);
  //   - não estar buscando agora (nem a busca inicial, nem um refetch em segundo plano);
  //   - `dataUpdatedAt` MAIOR que o carimbo guardado no momento em que pedimos a busca de
  //     novo — prova que ESTE resultado é de uma busca mais nova que aquele pedido, e não
  //     apenas o dado que já estava no cache antes dele.
  // Até essas três coisas serem verdade, `form.participantes` continua `undefined` — o que
  // mantém a defesa de `useUpdateEvento` significativa mesmo neste caminho.
  useEffect(() => {
    if (
      open &&
      editingEvent &&
      participantesCarregaramComSucesso &&
      !carregandoParticipantes &&
      participantesAtualizadoEm > marcaAntesDeBuscarDeNovoRef.current &&
      participantesExistentes
    ) {
      setForm((prev) => ({ ...prev, participantes: participantesExistentes }));
    }
  }, [
    open,
    editingEvent,
    participantesExistentes,
    participantesCarregaramComSucesso,
    carregandoParticipantes,
    participantesAtualizadoEm,
  ]);

  const set = <K extends keyof EventoForm>(key: K, value: EventoForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCalendarTypeChange = (type: CalendarType) => {
    setForm((prev) => ({ ...prev, tipoCalendario: type, cor: CALENDAR_COLORS[type] }));
  };

  const toggleParticipante = (userId: string) => {
    const current = form.participantes ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    set('participantes', next);
  };

  const todosParticipantesSelecionados =
    funcionariosDisponiveis.length > 0 &&
    funcionariosDisponiveis.every((u: { user_id: string }) => (form.participantes ?? []).includes(u.user_id));

  const toggleTodosParticipantes = () => {
    set(
      'participantes',
      todosParticipantesSelecionados ? [] : funcionariosDisponiveis.map((u: { user_id: string }) => u.user_id),
    );
  };

  const isEditing = !!editingEvent;
  // Visita a obra: obra_id só existe em evento criado pela rota de visita
  // (ver `onAbrirRotaVisita`). Editar aqui muda data/participantes/status,
  // nunca desvincula a obra.
  const isVisita = isEditing && !!form.obraId;
  const participantesSelecionados = form.participantes ?? [];
  // Ao criar, quem está preenchendo o formulário é sempre o organizador. Ao
  // editar, só o organizador original pode adicionar/remover participantes —
  // um convidado só enxerga a lista, sem poder alterá-la.
  const podeGerenciarParticipantes = !isEditing || editingEvent?.criadoPor === user?.id;
  // Evento "empresa" visível pra empresa inteira, mas cujo usuário logado não
  // é participante nem organizador: pode abrir e ler, não pode salvar/excluir.
  const somenteLeitura = isEditing && editingEvent?.podeEditar === false;

  // 🔴 Bloco 3, item A (CRÍTICO, revisado). Salvar antes de a lista de participantes voltar
  // do banco fazia `useUpdateEvento` tratar "ainda não chegou" como "esvaziei de propósito"
  // — e ele apaga quem não está na lista, disparando "Evento cancelado para você" por chat e
  // e-mail para todo mundo. Só se aplica a QUEM PODE GERENCIAR participantes de um evento JÁ
  // existente: criar evento novo não consulta participantes existentes, e quem só participa
  // nunca atualiza o grupo inteiro (ver `useUpdateEvento`).
  //
  // "Pronto" usa o MESMO carimbo do efeito de cópia acima — não basta ter sucesso e não
  // estar buscando: com cache quente, isso já era verdade no instante em que pedimos o
  // refetch (ver comentário no efeito de abertura). Só conta como pronto um sucesso mais
  // novo que aquele pedido.
  const participantesProntos =
    participantesCarregaramComSucesso &&
    !carregandoParticipantes &&
    participantesAtualizadoEm > marcaAntesDeBuscarDeNovoRef.current;
  const aguardandoParticipantes = isEditing && podeGerenciarParticipantes && !participantesProntos;

  const salvarDeFato = () => {
    onSave(form);
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.titulo.trim()) return;

    if (isVisita && participantesSelecionados.length > 0) {
      const inicio = form.diaInteiro
        ? new Date(form.inicio + 'T00:00:00').toISOString()
        : new Date(form.inicio).toISOString();
      const fim = form.diaInteiro
        ? new Date(form.fim + 'T23:59:59').toISOString()
        : new Date(form.fim).toISOString();

      setVerificandoConflito(true);
      try {
        const encontrados = await buscarConflitosDeVisita({
          participantes: participantesSelecionados,
          janelas: [{ inicio, fim }],
          // Aqui é uma parada só (o evento aberto), então a lista tem um item. O parâmetro é
          // lista por causa da rota inteira — ver `buscarConflitosDeVisita`.
          excluirGrupoIds: editingEvent?.grupoId ? [editingEvent.grupoId] : undefined,
        });
        if (encontrados.length > 0) {
          setConflitos(encontrados);
          setVerificandoConflito(false);
          return;
        }
      } catch {
        // Se a checagem falhar (ex.: rede), não trava o salvamento — só deixa de avisar.
      }
      setVerificandoConflito(false);
    }

    salvarDeFato();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* 🔴 `ConteudoDialogo` e não `DialogContent` cru — CLAUDE.md §7.11. A moldura da casa
          traz teto de altura em `dvh` (no celular `vh` mede a tela com a barra de endereço
          escondida) e a corrente de flex que prende cabeçalho e rodapé. */}
      <ConteudoDialogo className="sm:max-w-[560px] p-0 gap-0">
        <CabecalhoDialogo className="px-6 pt-6 pb-2">
          <DialogTitle>{isEditing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          {somenteLeitura && (
            <p className="text-xs text-muted-foreground">
              Evento visível para toda a empresa. Somente o organizador pode editá-lo ou excluí-lo.
            </p>
          )}
        </CabecalhoDialogo>

        {/* Tablist só na criação: ao editar, o tipo (evento comum ou visita a
            obra) já foi decidido na criação e não muda mais por aqui.
            "Visita a obra" não abre um formulário aqui dentro — entrega para o
            diálogo de rota de visita, que suporta várias paradas. Fazer a
            visita nascer aqui de novo reintroduziria o mesmo bug: só criava
            uma visita avulsa, nunca a rota. */}
        {!isEditing && onAbrirRotaVisita && (
          <div className="px-6 pb-2 shrink-0">
            <Tabs
              value="evento"
              onValueChange={(v) => {
                if (v !== 'visita') return;
                const dataBase = form.diaInteiro
                  ? new Date(form.inicio + 'T00:00:00')
                  : new Date(form.inicio);
                onClose();
                onAbrirRotaVisita(isNaN(dataBase.getTime()) ? undefined : dataBase);
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="evento" className="gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Evento
                </TabsTrigger>
                <TabsTrigger value="visita" className="gap-1.5">
                  <HardHat className="h-3.5 w-3.5" /> Visita a obra
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* 🔴 QUEM ROLA É O `<div>` DO `CorpoDialogo`, NUNCA O `<fieldset>`.
            Até 27/08/2026 as classes de rolagem (`overflow-y-auto flex-1 min-h-0`) estavam no
            próprio `<fieldset>`, e ele NÃO as respeita. Medido no site publicado, no navegador
            do Lucas:

              mandei rolar ....... scrollTop 0 -> 0      não rola
              conteúdo 664px / altura visível 433px      sem barra de rolagem
              último campo ("Descrição") ................ 222px FORA da caixa do fieldset,
                                                          e fora do modal

            Ou seja: o fieldset ANUNCIA rolagem (`overflow: auto`, `scrollHeight > clientHeight`)
            e não rola nem recorta — o conteúdo vaza por baixo e os botões do rodapé aparecem
            por cima dos campos. Era este o "calendário bugado" do print.

            Provado que a tag é a culpada, e não o `disabled`: no mesmo modal, tirar o `disabled`
            NÃO fez rolar; trocar a tag por `<div>` fez rolar 231px na hora, e nada mais vazou.

            O `<fieldset>` continua aqui — é ele que desativa todos os campos de uma vez quando
            a pessoa não é a organizadora —, só que agora por dentro, sem papel de layout. */}
        {/* 🔴 `mx-0` NÃO É ENFEITE — é o que cancela o `-mx-6` do `CorpoDialogo`.
            Aquele recuo negativo existe para a barra de rolagem nascer na borda do modal
            QUANDO O PAI TEM `p-6`. Aqui o pai é `p-0` (linha 249), então o recuo não tem
            respiro para comer e o miolo fica mais largo que o próprio modal.

            Medido no navegador, com o CSS compilado do projeto, em 28/08/2026:

              modal ......... 560px
              miolo ......... 606px      -> 23px para FORA de cada lado
              com `mx-0` .... 558px      -> dentro, como deve ser

            Era esta a "largura bugada": os campos passavam por baixo das bordas do modal.
            `NovoNegocioDialog.tsx:491` — o outro `ConteudoDialogo` com `p-0` — já passa
            `mx-0` pelo mesmo motivo. */}
        <CorpoDialogo className="mx-0 px-6 py-2">
        <fieldset disabled={somenteLeitura} className="space-y-4 border-0 m-0 p-0 min-w-0">
          {isEditing && isVisita && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <HardHat className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-medium">Visita: {editingEvent?.obraNome || 'obra'}</span>
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              placeholder="Título do evento"
              value={form.titulo}
              onChange={(e) => set('titulo', e.target.value)}
              autoFocus
            />
          </div>

          {/* Dia inteiro */}
          <div className="flex items-center justify-between">
            <Label htmlFor="dia-inteiro" className="cursor-pointer">Dia inteiro</Label>
            <Switch
              id="dia-inteiro"
              checked={form.diaInteiro}
              onCheckedChange={(v) => set('diaInteiro', v)}
            />
          </div>

          {/* Início / Fim */}
          <div className="grid grid-cols-2 gap-3">
            <EventDateTimeField
              label="Início"
              type={form.diaInteiro ? 'date' : 'datetime-local'}
              value={form.inicio}
              onChange={(value) => set('inicio', value)}
            />
            <EventDateTimeField
              label="Fim"
              type={form.diaInteiro ? 'date' : 'datetime-local'}
              value={form.fim}
              onChange={(value) => set('fim', value)}
            />
          </div>

          {/* Tipo de calendário — visita a obra é sempre visível para a empresa toda,
              nunca fica "pessoal" escondida de quem também acessa a obra. */}
          {isVisita ? (
            <p className="text-xs text-muted-foreground">
              Visível para toda a empresa, como todo registro de visita.
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <Label htmlFor="disponivel-empresa" className="cursor-pointer">
                Disponibilizar este evento para toda a empresa
              </Label>
              <Switch
                id="disponivel-empresa"
                checked={form.tipoCalendario === 'empresa'}
                onCheckedChange={(v) => handleCalendarTypeChange(v ? 'empresa' : 'pessoal')}
              />
            </div>
          )}

          {/* Status da visita — marcação manual, não deduzida pela data (uma visita
              agendada pode não acontecer, e pode ser registrada depois de ocorrer). */}
          {isVisita && (
            <div className="space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="visita-realizada" className="cursor-pointer">Visita realizada</Label>
                <Switch
                  id="visita-realizada"
                  checked={!!form.visitaRealizada}
                  onCheckedChange={(v) => set('visitaRealizada', v)}
                />
              </div>
              {form.visitaRealizada && (
                <Textarea
                  placeholder="O que você viu na obra?"
                  rows={2}
                  value={form.visitaObservacao ?? ''}
                  onChange={(e) => set('visitaObservacao', e.target.value)}
                />
              )}
            </div>
          )}

          {/* Participantes */}
          {funcionariosDisponiveis.length > 0 && (
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <Popover open={participantesOpen} onOpenChange={setParticipantesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    // 🔴 Bloco 3, item A (revisão). Também trava enquanto a lista está sendo
                    // (re)buscada — sem isso, o organizador podia editar uma seleção que está
                    // prestes a ser substituída pelo resultado do refetch em andamento.
                    disabled={!podeGerenciarParticipantes || aguardandoParticipantes}
                    className="w-full justify-between font-normal h-10"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {participantesSelecionados.length === 0
                        ? <span className="text-muted-foreground truncate">Selecionar funcionários…</span>
                        : <span className="truncate">{participantesSelecionados.length} selecionado(s)</span>}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                  <Command
                    filter={(value, search) => {
                      if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                      return 0;
                    }}
                  >
                    <CommandInput placeholder="Buscar funcionário..." />
                    <div className="flex items-center justify-between px-3 py-1.5 border-b">
                      <span className="text-xs text-muted-foreground">
                        {participantesSelecionados.length} de {funcionariosDisponiveis.length} selecionado(s)
                      </span>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={toggleTodosParticipantes}
                      >
                        {todosParticipantesSelecionados ? 'Limpar seleção' : 'Selecionar todos'}
                      </button>
                    </div>
                    <CommandList className="max-h-[min(240px,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))] overflow-y-auto overflow-x-hidden">
                      <CommandEmpty className="py-6 text-center text-sm">
                        Nenhum funcionário encontrado.
                      </CommandEmpty>
                      <CommandGroup>
                        {funcionariosDisponiveis.map((u: { id: string; user_id: string; nome: string; email: string }) => {
                          const isSelf = u.user_id === user?.id;
                          const checked = participantesSelecionados.includes(u.user_id);
                          return (
                            <CommandItem
                              key={u.id}
                              value={isSelf ? `Você ${u.nome} ${u.email}` : `${u.nome} ${u.email}`}
                              onSelect={() => toggleParticipante(u.user_id)}
                              className="gap-2"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{isSelf ? 'Você' : u.nome}</div>
                                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                              </div>
                              {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {participantesSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {participantesSelecionados.map((uid) => {
                    const u = funcionariosDisponiveis.find((x: { user_id: string }) => x.user_id === uid) as { nome: string } | undefined;
                    if (!u) return null;
                    const isSelf = uid === user?.id;
                    return (
                      <Badge key={uid} variant="secondary" className="gap-1">
                        {isSelf ? 'Você' : u.nome}
                        {/* 🔴 Bloco 3, item A (revisão): também trava enquanto busca/refetch —
                            este "×" fica fora do popover, então travar só o gatilho principal
                            não bastaria para impedir remover alguém da lista que já está prestes
                            a ser substituída. */}
                        {podeGerenciarParticipantes && !aguardandoParticipantes && (
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => toggleParticipante(uid)}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {podeGerenciarParticipantes
                  ? 'O evento será adicionado ao calendário de cada participante.'
                  : 'Somente quem organizou o evento pode alterar os participantes.'}
              </p>
            </div>
          )}

          {/* Aviso aos participantes — só em evento comum. Rota de visita não avisa ninguém
              (decisão de 11/09/2026). Só quem organizou muda: a chave vale para o grupo inteiro. */}
          {!isVisita && (
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="avisar-participantes" className="text-sm">
                  Avisar participantes por chat e e-mail
                </Label>
                <p className="text-xs text-muted-foreground">
                  No convite, na mudança de horário, no cancelamento e em cada lembrete.
                </p>
              </div>
              <Switch
                id="avisar-participantes"
                checked={form.avisarParticipantes ?? false}
                onCheckedChange={(v) => set('avisarParticipantes', v)}
                disabled={somenteLeitura || !podeGerenciarParticipantes}
              />
            </div>
          )}

          <LembretesField
            value={form.lembretes}
            onChange={(v) => set('lembretes', v)}
            disabled={somenteLeitura}
          />

          {/* Cor */}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => set('cor', color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    form.cor === color ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              placeholder="Adicionar descrição..."
              rows={2}
              value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
            />
          </div>
        </fieldset>
        </CorpoDialogo>

        <RodapeDialogo className="gap-2 px-6 py-4 border-t">
          {somenteLeitura ? (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              {isEditing && onDelete && editingEvent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => { onDelete(editingEvent); onClose(); }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Excluir
                </Button>
              )}
              {/* Perto do botão Salvar, de propósito — é ele quem fica desabilitado enquanto
                  isto aparece. Ver `aguardandoParticipantes` acima. */}
              {carregandoParticipantes && podeGerenciarParticipantes && (
                <span className="text-xs text-muted-foreground">Carregando participantes…</span>
              )}
              {participantesComErro && podeGerenciarParticipantes && (
                <>
                  <span className="text-xs text-destructive">
                    Não foi possível carregar os participantes.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetchParticipantes()}
                  >
                    Tentar de novo
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!form.titulo.trim() || verificandoConflito || aguardandoParticipantes}
              >
                {verificandoConflito ? 'Verificando agenda...' : isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </>
          )}
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>

    <AlertDialog open={conflitos.length > 0} onOpenChange={(o) => !o && setConflitos([])}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alguém deste evento já tem visita nesse horário
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>
                A mesma pessoa ficaria marcada em dois lugares ao mesmo tempo. Vendedores
                diferentes, em obras diferentes, no mesmo horário não caem aqui — isso é
                permitido e não avisa nada. O choque é este:
              </p>
              <ul className="space-y-1 rounded-md border bg-muted/40 p-2.5 text-xs">
                {conflitos.map((c, i) => {
                  const nome =
                    funcionariosDisponiveis.find((u: { user_id: string }) => u.user_id === c.userId)?.nome ??
                    'Alguém da equipe';
                  return (
                    <li key={i} className="flex flex-col">
                      <span className="font-medium text-foreground">{nome}</span>
                      <span>
                        {c.obraNome} — {format(new Date(c.inicio), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p>Quer salvar mesmo assim?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConflitos([]);
              salvarDeFato();
            }}
          >
            Salvar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

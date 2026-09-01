import { useEffect, useMemo, useState } from 'react';
import { format, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, CalendarIcon, ChevronDown, GripVertical, HardHat, Users, X, Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { diferencaDaRota } from '@/lib/rota-em-edicao';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import type { RotaDoDia } from '@/lib/rota-do-dia';
import {
  ordenarPorHorario,
  moverParadaMantendoHorarios,
  ultimoHorarioUtilizavel,
} from '@/lib/ordem-das-paradas';
import {
  Dialog, DialogTitle, DialogDescription,
  ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useObras } from '@/hooks/use-obras';
import { useCreateRotaVisita, useEditarRotaDeVisita, useEventoParticipantes, buscarConflitosDeVisita, type ConflitoVisita } from '@/hooks/use-eventos';

interface ObraOpcao {
  id: string;
  nome_obra: string | null;
  clientes: { empresa: string | null } | null;
}

interface Parada {
  /**
   * O `grupo_id` desta parada no banco. Só existe quando a parada VEIO de uma rota já gravada.
   *
   * 🔴 É o que separa "mudar esta parada" de "criar outra": sem ele, salvar uma edição
   * inseriria tudo de novo e a rota apareceria em dobro. E como cada parada tem um grupo
   * próprio, é por ele que a alteração alcança as cópias de todos os participantes.
   */
  grupoId?: string | null;
  obraId: string;
  nomeObra: string;
  observacao: string;
  horario: string; // HH:mm
}

interface NovaRotaVisitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-popula a lista de paradas — usado ao abrir a partir da seleção em massa da tela de Obras. */
  obrasIniciais?: ObraOpcao[];
  /** Pré-popula a data — usado ao abrir a partir de um slot já escolhido no Calendário. */
  dataInicial?: Date;
  /**
   * A moldura em volta do MESMO formulário.
   *
   * `'modal'` (padrão) é a janela no meio da tela — é como o **Calendário** abre, e ali é o
   * certo: quem está no calendário não tem uma lista de obras para consultar enquanto monta
   * a rota.
   *
   * `'painel'` encosta o formulário na lateral e NÃO escurece o resto. É como a tela de
   * **Obras** abre, para a pessoa ver ao lado as obras que acabou de filtrar enquanto escolhe
   * as paradas. Pedido do Lucas em 27/08/2026.
   *
   * 🔴 Não use o `Sheet` deste projeto para isso: ele vem com véu preto e desfoque
   * (`sheet.tsx:22`), que esconde exatamente a lista que a pessoa precisa ver.
   */
  apresentacao?: 'modal' | 'painel';
  /**
   * A rota que está sendo EDITADA. Ausente = está criando uma nova.
   *
   * Quando presente, o formulário abre preenchido com as paradas dela, e salvar aplica a
   * DIFERENÇA em vez de inserir tudo de novo — ver `useEditarRotaDeVisita`.
   */
  rotaParaEditar?: RotaDoDia | null;
  /**
   * Volta para a tela de onde este diálogo foi aberto, em vez de simplesmente fechar.
   *
   * Só o Calendário passa: lá a pessoa chega aqui de DENTRO do "Novo evento", pela aba
   * "Visita a obra", e sem isto a única saída é Cancelar — que joga fora o evento que ela
   * estava preenchendo. Quem abre pela tela de Obras não veio de lugar nenhum, não passa a
   * propriedade, e o rodapé continua com os mesmos dois botões de sempre.
   *
   * 🔴 NÃO é "fechar": quem passa é que decide o que reabrir, e este diálogo NÃO chama
   * `onOpenChange(false)` junto. Chamar os dois faria o rascunho do evento reaparecer
   * enquanto esta janela ainda está no ar.
   */
  onVoltar?: () => void;
}

const DURACAO_PADRAO_MINUTOS = 60;

/**
 * Trava o arrasto no eixo vertical: sem isso o `@hello-pangea/dnd` segue o
 * cursor livremente nos dois eixos, e qualquer movimento lateral do mouse
 * empurra a linha para fora da largura estreita do modal (`sm:max-w-lg`).
 * Zera a translação em X, mantendo só a em Y.
 */
function travarEixoVertical(
  style: React.CSSProperties | undefined,
): React.CSSProperties | undefined {
  if (!style?.transform) return style;
  const eixoY = /translate\([^,]+,\s*([^)]+)\)/.exec(style.transform)?.[1];
  if (!eixoY) return style;
  return { ...style, transform: `translate(0px, ${eixoY})` };
}

/** Soma minutos a um horário "HH:mm" e devolve outro "HH:mm". */
function somarMinutos(horario: string, minutos: number): string {
  const [h, m] = horario.split(':').map(Number);
  const base = new Date(2000, 0, 1, h || 0, m || 0, 0, 0);
  return format(addMinutes(base, minutos), 'HH:mm');
}

/**
 * "Rota de visita": criar, de uma vez, um evento de visita por obra
 * selecionada. Não desenha trajeto no mapa (decisão de produto de
 * 25/08/2026) — é só uma lista de paradas do mesmo dia. Cada parada tem
 * horário próprio, editável, sugerido automaticamente a partir da anterior
 * (+ `DURACAO_PADRAO_MINUTOS`) só como ponto de partida.
 *
 * Cada parada vira uma linha independente em `eventos` (ver
 * `useCreateRotaVisita`) — depois de criada, cada visita é editada
 * separadamente pelo Calendário ou pelo histórico da obra, não em conjunto.
 */
export function NovaRotaVisitaDialog({
  open,
  onOpenChange,
  obrasIniciais,
  dataInicial,
  apresentacao = 'modal',
  rotaParaEditar = null,
  onVoltar,
}: NovaRotaVisitaDialogProps) {
  const ehPainel = apresentacao === 'painel';
  const editando = !!rotaParaEditar;
  const { user } = useAuth();
  const { data: obras = [] } = useObras();
  const { data: usuarios, refetch: refetchUsuarios } = useVendedores();
  const criarRota = useCreateRotaVisita();
  const editarRota = useEditarRotaDeVisita();

  // Os participantes da rota vêm da PRIMEIRA parada: a rota inteira é criada de uma vez, com a
  // mesma gente em todas. Ler de uma só evita uma consulta por parada para chegar à mesma lista.
  const { data: participantesDaRota } = useEventoParticipantes(
    rotaParaEditar?.paradas[0]?.grupoId ?? null,
  );

  /**
   * Título livre da rota. Pedido do Lucas em 28/08/2026.
   *
   * OPCIONAL de propósito: sem título o cartão continua mostrando só a data, exatamente como
   * antes. Quem monta uma rota por dia não ganha um campo obrigatório a preencher; quem monta
   * duas ("Zona Norte" de manhã, "Zona Sul" à tarde) ganha como distingui-las.
   */
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState<Date>(new Date());
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [jaRealizada, setJaRealizada] = useState(false);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [buscaOpen, setBuscaOpen] = useState(false);
  const [participantesOpen, setParticipantesOpen] = useState(false);
  const [dataPopoverOpen, setDataPopoverOpen] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoVisita[]>([]);
  const [verificandoConflito, setVerificandoConflito] = useState(false);

  // Funcionários da empresa, com o próprio usuário logado primeiro (mesmo
  // critério do seletor de participantes do Calendário).
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
    refetchUsuarios();

    if (rotaParaEditar) {
      // Editando: o formulário abre com o que está gravado. `jaRealizada` fica FALSO de
      // propósito — ele é o atalho de "essas visitas já aconteceram", e ligá-lo sozinho ao
      // abrir marcaria como realizada, de uma vez só, uma rota que talvez não seja.
      //
      // 🔴 Ficar falso aqui é o que PRESERVA o que já está gravado: com a chave desligada a
      // edição não manda registro de campo nenhum, e o banco mantém o que tem. Ligar a chave é
      // um gesto deliberado de quem está dizendo "essas visitas aconteceram".
      setData(rotaParaEditar.data);
      setTitulo(rotaParaEditar.titulo ?? '');
      setJaRealizada(false);
      // Ordena ao ABRIR: rota criada antes desta correção pode estar gravada torta (11h, 09h,
      // 14h). Aqui ela já aparece arrumada, e salvar conserta de vez.
      setParadas(
        ordenarPorHorario(
          rotaParaEditar.paradas.map((p) => ({
            grupoId: p.grupoId,
            obraId: p.obraId,
            nomeObra: p.obraNome || 'Obra sem nome',
            // A anotação que já está no banco vem junto: se a pessoa ligar a chave, ela EDITA
            // o que está escrito em vez de começar do zero e apagar sem perceber.
            observacao: p.visitaObservacao ?? '',
            horario: format(p.inicio, 'HH:mm'),
          })),
        ),
      );
      return;
    }

    setData(dataInicial ?? new Date());
    setTitulo('');
    setJaRealizada(false);
    setParticipantes(user?.id ? [user.id] : []);
    setParadas(
      (obrasIniciais ?? []).map((o, idx) => ({
        obraId: o.id,
        nomeObra: o.nome_obra || 'Obra sem nome',
        observacao: '',
        horario: somarMinutos('09:00', idx * DURACAO_PADRAO_MINUTOS),
      })),
    );
  }, [open, obrasIniciais, dataInicial, user?.id, refetchUsuarios, rotaParaEditar]);

  // Os participantes chegam depois da rota (é outra consulta), então entram num efeito próprio.
  useEffect(() => {
    if (!open || !editando || !participantesDaRota) return;
    setParticipantes(participantesDaRota);
  }, [open, editando, participantesDaRota]);

  const toggleParticipante = (userId: string) => {
    setParticipantes((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const obrasDisponiveis = ((obras as ObraOpcao[]) ?? []).filter(
    (o) => !paradas.some((p) => p.obraId === o.id),
  );

  const adicionarParada = (obra: ObraOpcao) => {
    setParadas((prev) => {
      // A parada nova entra DEPOIS da mais tarde do dia — que é a última da lista ORDENADA, e
      // não a última do array (a pessoa pode estar no meio de uma digitação).
      //
      // 🔴 `ultimoHorarioUtilizavel` ignora as paradas SEM horário. Sem esse filtro, a parada
      // que a pessoa esvaziou para redigitar viraria a referência — e a obra nova nasceria à
      // 1 DA MANHÃ, porque `somarMinutos('')` conta a partir da meia-noite sem reclamar.
      const ultima = ultimoHorarioUtilizavel(prev);
      const horario = ultima ? somarMinutos(ultima, DURACAO_PADRAO_MINUTOS) : '09:00';
      return [...prev, { obraId: obra.id, nomeObra: obra.nome_obra || 'Obra sem nome', observacao: '', horario }];
    });
    setBuscaOpen(false);
  };

  const removerParada = (obraId: string) => {
    setParadas((prev) => prev.filter((p) => p.obraId !== obraId));
  };

  /**
   * Arrastar muda QUEM ocupa cada faixa de horário, e não leva o horário junto.
   *
   * 🔴 Antes, arrastar mexia só na posição da linha: puxar a parada das 11h para o topo
   * deixava a lista `11h, 09h, 14h` — um roteiro que ninguém dirige. E a rota GRAVADA é
   * remontada por horário, então o que a pessoa via ao montar não era o que ela via depois
   * de salvar. O porquê da escolha está em `ordem-das-paradas.ts`.
   */
  const reordenarParadas = (result: DropResult) => {
    if (!result.destination) return;
    setParadas((prev) =>
      moverParadaMantendoHorarios(prev, result.source.index, result.destination!.index),
    );
  };

  const atualizarObservacao = (obraId: string, observacao: string) => {
    setParadas((prev) => prev.map((p) => (p.obraId === obraId ? { ...p, observacao } : p)));
  };

  const atualizarHorario = (obraId: string, horario: string) => {
    setParadas((prev) => prev.map((p) => (p.obraId === obraId ? { ...p, horario } : p)));
  };

  /**
   * Recoloca a parada no lugar dela depois que a pessoa TERMINA de digitar o horário.
   *
   * 🔴 REORDENAR A CADA TECLA SERIA HOSTIL, e é por isso que isto está no `onBlur` e não no
   * `onChange`. O campo é `type="time"`: quem troca 11:00 por 07:30 digita a HORA primeiro, e
   * o navegador já dispara a mudança com `07:00` — a linha saltaria para o topo antes da
   * pessoa chegar nos minutos, com o cursor indo junto. Ela terminaria de digitar noutro
   * lugar da lista, ou noutra parada.
   *
   * Assim a lista fica fora de ordem só enquanto o campo está sendo mexido, e se acerta no
   * instante em que ele é largado.
   */
  const reordenarPorHorario = () => setParadas((prev) => ordenarPorHorario(prev));

  /**
   * A lista como ela vai ser GRAVADA — cronológica, sempre.
   *
   * 🔴 Não é o mesmo que `paradas`. Entre digitar o horário e largar o campo existe uma
   * fresta em que a lista está fora de ordem de propósito (ver `reordenarPorHorario`), e
   * clicar em "Salvar" durante essa fresta é perfeitamente possível — o Safari, por exemplo,
   * não põe o foco em botão ao clicar, então o `onBlur` pode nem chegar a acontecer.
   *
   * Isto é o que garante a promessa em qualquer caminho: a rota grava na ordem do relógio.
   */
  const paradasEmOrdem = useMemo(() => ordenarPorHorario(paradas), [paradas]);

  const janelaDaParada = (parada: Parada) => {
    const inicio = new Date(`${format(data, 'yyyy-MM-dd')}T${parada.horario}:00`);
    const fim = new Date(inicio.getTime() + DURACAO_PADRAO_MINUTOS * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  };

  const salvarEdicao = () => {
    if (!rotaParaEditar) return;

    const diferenca = diferencaDaRota(
      rotaParaEditar.paradas
        .filter((p) => p.grupoId)
        .map((p) => ({
          grupoId: p.grupoId!,
          obraId: p.obraId,
          inicio: p.inicio,
          visitaRealizada: !!p.visitaRealizada,
          visitaObservacao: p.visitaObservacao ?? null,
        })),
      // 🔴 O registro de campo SÓ VIAJA COM A CHAVE LIGADA. Com ela desligada os dois campos
      // ficam ausentes, e ausente significa "não mexa" — é assim que editar o horário de uma
      // parada não apaga a anotação escrita em outra (ver `ParadaEditada` em rota-em-edicao.ts).
      paradasEmOrdem.map((p) => ({
        grupoId: p.grupoId,
        obraId: p.obraId,
        horario: p.horario,
        ...(jaRealizada
          ? { visitaRealizada: true, visitaObservacao: p.observacao || null }
          : {}),
      })),
      format(data, 'yyyy-MM-dd'),
      DURACAO_PADRAO_MINUTOS,
    );

    // 🔴 O TÍTULO ENTRA NA CONTA DE "MUDOU". `calcularDiferencaDaRota` só compara obra e
    // horário — ela não conhece o título, e nem deve. Sem esta linha, quem abrisse a rota só
    // para dar um nome a ela veria "Nada mudou nesta rota", o diálogo fecharia, e o título
    // seria descartado sem aviso nenhum.
    const tituloMudou = titulo.trim() !== (rotaParaEditar?.titulo ?? '').trim();

    if (diferenca.semMudanca && !tituloMudou) {
      // Nada mudou: fechar em silêncio seria pior que dizer, porque a pessoa ficaria sem saber
      // se salvou ou se a tela ignorou o clique.
      toast.info('Nada mudou nesta rota.');
      onOpenChange(false);
      return;
    }

    editarRota.mutate(
      {
        diferenca,
        participantes,
        nomeDaObraPorId: (obraId) =>
          paradas.find((p) => p.obraId === obraId)?.nomeObra ?? 'Obra sem nome',
        rotaId: rotaParaEditar?.rotaId ?? null,
        titulo,
        tituloOriginal: rotaParaEditar?.titulo ?? null,
        // 🔴 Os grupos vêm da ROTA GRAVADA, não das paradas do formulário. O título tem de
        // alcançar todas as paradas que ficaram, inclusive as que a pessoa não tocou — e
        // `diferenca` só conhece o que mudou.
        gruposDaRota: (rotaParaEditar?.paradas ?? [])
          .map((p) => p.grupoId)
          .filter((g): g is string => !!g),
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.mudou
              ? `Rota atualizada: ${[
                  r.alteradas ? `${r.alteradas} ${r.alteradas === 1 ? 'parada alterada' : 'paradas alteradas'}` : null,
                  r.inseridas ? `${r.inseridas} ${r.inseridas === 1 ? 'acrescentada' : 'acrescentadas'}` : null,
                  r.removidas ? `${r.removidas} ${r.removidas === 1 ? 'removida' : 'removidas'}` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}.`
              : 'Rota atualizada.',
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível salvar a rota.')),
      },
    );
  };

  const criarRotaDeFato = () => {
    if (editando) {
      salvarEdicao();
      return;
    }

    criarRota.mutate(
      {
        data: format(data, 'yyyy-MM-dd'),
        duracaoMinutos: DURACAO_PADRAO_MINUTOS,
        jaRealizada,
        participantes,
        titulo,
        paradas: paradasEmOrdem.map((p) => ({
          obraId: p.obraId,
          nomeObra: p.nomeObra,
          horario: p.horario,
          observacao: jaRealizada ? p.observacao : undefined,
        })),
      },
      {
        onSuccess: () => {
          toast.success(
            paradas.length === 1
              ? 'Visita registrada no calendário.'
              : `Rota criada com ${paradas.length} visitas no calendário.`,
          );
          onOpenChange(false);
        },
        onError: () => toast.error('Não foi possível criar a rota de visita.'),
      },
    );
  };

  const handleSalvar = async () => {
    if (paradas.length === 0) {
      toast.error('Adicione ao menos uma obra à rota.');
      return;
    }

    if (participantes.length > 0) {
      setVerificandoConflito(true);
      try {
        const encontrados = await buscarConflitosDeVisita({
          participantes,
          janelas: paradasEmOrdem.map(janelaDaParada),
          // 🔴 EDITANDO, A ROTA NÃO PODE CHOCAR COM ELA MESMA. As paradas já gravadas continuam
          // no banco no horário antigo; sem excluí-las, salvar QUALQUER edição — até só dar um
          // título à rota — acusava conflito com as próprias paradas abertas na tela.
          // Paradas acrescentadas agora não têm `grupoId` e ficam de fora da exclusão de
          // propósito: essas ainda precisam ser conferidas.
          excluirGrupoIds: (rotaParaEditar?.paradas ?? [])
            .map((p) => p.grupoId)
            .filter((g): g is string => !!g),
        });
        if (encontrados.length > 0) {
          setConflitos(encontrados);
          setVerificandoConflito(false);
          return;
        }
      } catch {
        // Se a checagem falhar (ex.: rede), não trava a criação — só deixa de avisar.
      }
      setVerificandoConflito(false);
    }

    criarRotaDeFato();
  };

  // O MESMO formulário para as duas molduras. Só o título e a descrição trocam de tag:
  // `DialogTitle`/`DialogDescription` são primitivas do Radix e exigem estar dentro de um
  // Dialog — fora dele, avisam no console e não anunciam nada para o leitor de tela.
  const conteudo = (
    <>
        <CabecalhoDialogo>
          {ehPainel ? (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
                <HardHat className="h-4 w-4 text-primary" />
                {editando ? 'Editar rota de visita' : 'Nova rota de visita'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editando
                  ? 'Altere as obras, os horários e a data desta rota. A alteração vale para o calendário de todos os participantes.'
                  : 'Escolha as obras que farão parte da visita e a data. Cada obra vira um evento no calendário e entra no histórico de visitas dela.'}
              </p>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-primary" />
                {editando ? 'Editar rota de visita' : 'Nova rota de visita'}
              </DialogTitle>
              <DialogDescription>
                {editando
                  ? 'Altere as obras, os horários e a data desta rota. A alteração vale para o calendário de todos os participantes.'
                  : 'Escolha as obras que farão parte da visita e a data. Cada obra vira um evento no calendário e entra no histórico de visitas dela.'}
              </DialogDescription>
            </>
          )}
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {/* O título vem ANTES da data porque é o que a pessoa tem na cabeça ao começar
              ("a rota da Zona Norte"), e porque deixá-lo depois das obras faria com que só
              quem rolasse até o fim descobrisse que ele existe. */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo-da-rota">
              Título <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="titulo-da-rota"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Zona Norte, Obras da Construtora Alfa..."
              maxLength={80}
              // Este campo vive dentro do formulário do diálogo; Enter aqui salvaria a rota
              // no meio da digitação do nome.
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Sem título, o cartão mostra só a data. Com título, fica “{titulo.trim() || 'Título'}
              , {format(data, 'dd/MM/yyyy')}”.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Popover open={dataPopoverOpen} onOpenChange={setDataPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(data, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data}
                  defaultMonth={data}
                  onSelect={(d) => {
                    if (d) {
                      setData(d);
                      setDataPopoverOpen(false);
                    }
                  }}
                  locale={ptBR}
                  initialFocus
                  captionLayout="dropdown-buttons"
                  fromYear={2020}
                  toYear={new Date().getFullYear() + 1}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ja-realizada" className="cursor-pointer">Essas visitas já aconteceram</Label>
              <p className="text-xs text-muted-foreground">
                Registra a rota como realizada, com espaço para anotar o que foi visto.
              </p>
            </div>
            <Switch id="ja-realizada" checked={jaRealizada} onCheckedChange={setJaRealizada} />
          </div>

          {funcionariosDisponiveis.length > 0 && (
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <Popover open={participantesOpen} onOpenChange={setParticipantesOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between font-normal">
                    <span className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {participantes.length === 0 ? (
                        <span className="text-muted-foreground truncate">Selecionar funcionários…</span>
                      ) : (
                        <span className="truncate">{participantes.length} selecionado(s)</span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                  <Command
                    filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
                  >
                    <CommandInput placeholder="Buscar funcionário..." />
                    <CommandList className="max-h-[240px] overflow-y-auto overflow-x-hidden">
                      <CommandEmpty className="py-6 text-center text-sm">Nenhum funcionário encontrado.</CommandEmpty>
                      <CommandGroup>
                        {funcionariosDisponiveis.map((u: { id: string; user_id: string; nome: string; email: string }) => {
                          const isSelf = u.user_id === user?.id;
                          const checked = participantes.includes(u.user_id);
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

              {participantes.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {participantes.map((uid) => {
                    const u = funcionariosDisponiveis.find((x: { user_id: string }) => x.user_id === uid) as
                      | { nome: string }
                      | undefined;
                    if (!u) return null;
                    const isSelf = uid === user?.id;
                    return (
                      <Badge key={uid} variant="secondary" className="gap-1">
                        {isSelf ? 'Você' : u.nome}
                        <button type="button" className="ml-1 hover:text-destructive" onClick={() => toggleParticipante(uid)}>
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Vale para todas as paradas da rota — a visita entra no calendário de cada participante.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Obras da rota</Label>
            <Popover open={buscaOpen} onOpenChange={setBuscaOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="text-muted-foreground">Adicionar obra…</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                <Command
                  filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
                >
                  <CommandInput placeholder="Buscar obra..." />
                  <CommandList className="max-h-[240px] overflow-y-auto overflow-x-hidden">
                    <CommandEmpty className="py-6 text-center text-sm">Nenhuma obra encontrada.</CommandEmpty>
                    <CommandGroup>
                      {obrasDisponiveis.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={`${o.nome_obra ?? ''} ${o.clientes?.empresa ?? ''}`}
                          onSelect={() => adicionarParada(o)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{o.nome_obra || 'Obra sem nome'}</div>
                            {o.clientes?.empresa && (
                              <div className="truncate text-xs text-muted-foreground">{o.clientes.empresa}</div>
                            )}
                          </div>
                          <Check className="h-4 w-4 shrink-0 opacity-0" />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {paradas.length === 0 ? (
              <p className="pt-1 text-xs text-muted-foreground">Nenhuma obra adicionada ainda.</p>
            ) : (
              <DragDropContext onDragEnd={reordenarParadas}>
                <Droppable droppableId="paradas-rota">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="max-w-full space-y-2 overflow-x-hidden pt-1"
                    >
                      {paradas.map((parada, index) => (
                        <Draggable key={parada.obraId} draggableId={parada.obraId} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={
                                snapshot.isDragging
                                  ? travarEixoVertical(provided.draggableProps.style)
                                  : provided.draggableProps.style
                              }
                              className={cn(
                                'rounded-md border bg-card p-2.5 transition-shadow max-w-full overflow-hidden',
                                snapshot.isDragging && 'shadow-lg border-primary z-50 bg-accent',
                              )}
                            >
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <div
                                  {...provided.dragHandleProps}
                                  className="shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                                  title="Arraste para reordenar"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <p className="min-w-0 flex-1 truncate text-sm font-medium">{parada.nomeObra}</p>
                                <Input
                                  type="time"
                                  value={parada.horario}
                                  onChange={(e) => atualizarHorario(parada.obraId, e.target.value)}
                                  onBlur={reordenarPorHorario}
                                  className="h-8 w-[92px] shrink-0 px-1.5 font-mono text-xs sm:w-[110px] sm:px-3"
                                />
                                <button
                                  type="button"
                                  className="shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removerParada(parada.obraId)}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              {jaRealizada && (
                                <Textarea
                                  className="mt-2 text-sm"
                                  rows={2}
                                  placeholder="O que você viu nesta obra?"
                                  value={parada.observacao}
                                  onChange={(e) => atualizarObservacao(parada.obraId, e.target.value)}
                                />
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          {/* "Voltar" só aparece quando alguém abriu esta janela de dentro de outra (hoje, o
              "Novo evento" do Calendário). Fica à ESQUERDA, longe de Cancelar, porque as duas
              saídas têm consequências opostas: uma devolve o rascunho do evento, a outra o
              descarta. Mesmo lugar e mesmo motivo do "Excluir" em `EventDialog.tsx:557`.

              `sm:mr-auto` e não `mr-auto`: no celular o `DialogFooter` é `flex-col-reverse`, e
              a margem automática ali faria este botão encolher e desalinhar dos outros dois. */}
          {onVoltar && (
            <Button variant="ghost" className="sm:mr-auto" onClick={onVoltar}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Voltar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {/* O MESMO botão serve para criar e para editar (`rotaParaEditar`). Em edição ele diz
              "Salvar", e `editarRota.isPending` tem de entrar no `disabled` junto com
              `criarRota.isPending`: sem isso, gravar uma edição deixa o botão vivo, clicável e
              ainda escrito "Criar rota" — dá para mandar a mesma alteração duas vezes. */}
          <Button
            onClick={handleSalvar}
            disabled={
              criarRota.isPending ||
              editarRota.isPending ||
              verificandoConflito ||
              paradas.length === 0
            }
          >
            {verificandoConflito
              ? 'Verificando agenda...'
              : criarRota.isPending || editarRota.isPending
                ? editando
                  ? 'Salvando...'
                  : 'Criando...'
                : editando
                  ? 'Salvar'
                  : paradas.length > 1
                    ? 'Criar rota'
                    : 'Criar visita'}
          </Button>
        </RodapeDialogo>
    </>
  );

  return (
    <>
    {ehPainel ? (
      // 🔴 PAINEL LATERAL, sem véu. É por isso que não é `Sheet`: o do projeto escurece e
      // desfoca a tela atrás, escondendo a lista de obras que a pessoa acabou de filtrar —
      // que é justamente o motivo de o painel existir.
      //
      // Fica ao lado do conteúdo, não por cima: quem renderiza (Obras.tsx) o põe como irmão
      // da lista, e o `flex` divide a largura entre os dois.
      open && (
        <aside className="flex w-full max-w-md flex-none flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-6 lg:w-[26rem]">
          {conteudo}
        </aside>
      )
    ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ConteudoDialogo className="sm:max-w-lg">
          {conteudo}
        </ConteudoDialogo>
      </Dialog>
    )}

    <AlertDialog open={conflitos.length > 0} onOpenChange={(o) => !o && setConflitos([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alguém desta rota já tem visita nesse horário
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
                <p>{editando ? 'Quer salvar a rota mesmo assim?' : 'Quer criar a rota mesmo assim?'}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflitos([]);
                criarRotaDeFato();
              }}
            >
              {editando ? 'Salvar mesmo assim' : 'Criar mesmo assim'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

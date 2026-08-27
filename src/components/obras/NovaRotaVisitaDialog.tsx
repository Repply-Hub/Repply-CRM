import { useEffect, useMemo, useState } from 'react';
import { format, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarIcon, ChevronDown, GripVertical, HardHat, Users, X, Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
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
import { useCreateRotaVisita, buscarConflitosDeVisita, type ConflitoVisita } from '@/hooks/use-eventos';

interface ObraOpcao {
  id: string;
  nome_obra: string | null;
  clientes: { empresa: string | null } | null;
}

interface Parada {
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
}: NovaRotaVisitaDialogProps) {
  const ehPainel = apresentacao === 'painel';
  const { user } = useAuth();
  const { data: obras = [] } = useObras();
  const { data: usuarios, refetch: refetchUsuarios } = useVendedores();
  const criarRota = useCreateRotaVisita();

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
    setData(dataInicial ?? new Date());
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
  }, [open, obrasIniciais, dataInicial, user?.id, refetchUsuarios]);

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
      const ultima = prev[prev.length - 1];
      const horario = ultima ? somarMinutos(ultima.horario, DURACAO_PADRAO_MINUTOS) : '09:00';
      return [...prev, { obraId: obra.id, nomeObra: obra.nome_obra || 'Obra sem nome', observacao: '', horario }];
    });
    setBuscaOpen(false);
  };

  const removerParada = (obraId: string) => {
    setParadas((prev) => prev.filter((p) => p.obraId !== obraId));
  };

  const reordenarParadas = (result: DropResult) => {
    if (!result.destination) return;
    setParadas((prev) => {
      const copia = Array.from(prev);
      const [movida] = copia.splice(result.source.index, 1);
      copia.splice(result.destination!.index, 0, movida);
      return copia;
    });
  };

  const atualizarObservacao = (obraId: string, observacao: string) => {
    setParadas((prev) => prev.map((p) => (p.obraId === obraId ? { ...p, observacao } : p)));
  };

  const atualizarHorario = (obraId: string, horario: string) => {
    setParadas((prev) => prev.map((p) => (p.obraId === obraId ? { ...p, horario } : p)));
  };

  const janelaDaParada = (parada: Parada) => {
    const inicio = new Date(`${format(data, 'yyyy-MM-dd')}T${parada.horario}:00`);
    const fim = new Date(inicio.getTime() + DURACAO_PADRAO_MINUTOS * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  };

  const criarRotaDeFato = () => {
    criarRota.mutate(
      {
        data: format(data, 'yyyy-MM-dd'),
        duracaoMinutos: DURACAO_PADRAO_MINUTOS,
        jaRealizada,
        participantes,
        paradas: paradas.map((p) => ({
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
          janelas: paradas.map(janelaDaParada),
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
                Nova rota de visita
              </h2>
              <p className="text-sm text-muted-foreground">
                Escolha as obras que farão parte da visita e a data. Cada obra vira um evento no
                calendário e entra no histórico de visitas dela.
              </p>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-primary" />
                Nova rota de visita
              </DialogTitle>
              <DialogDescription>
                Escolha as obras que farão parte da visita e a data. Cada obra vira um evento no
                calendário e entra no histórico de visitas dela.
              </DialogDescription>
            </>
          )}
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={criarRota.isPending || verificandoConflito || paradas.length === 0}
          >
            {verificandoConflito
              ? 'Verificando agenda...'
              : criarRota.isPending
                ? 'Criando...'
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
              Já existe visita marcada nesse horário
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>Pelo menos um participante já tem outra visita que colide com esta rota:</p>
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
                <p>Quer criar a rota mesmo assim?</p>
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
              Criar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

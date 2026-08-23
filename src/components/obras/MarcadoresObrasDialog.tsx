import { useEffect, useRef, useState } from 'react';
import { GripVertical, Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useMarcadoresObras,
  useCriarMarcadorObra,
  useAtualizarMarcadorObra,
  useExcluirMarcadorObra,
  useReordenarMarcadoresObras,
  type MarcadorObra,
} from '@/hooks/use-marcadores-obras';
import { KANBAN_COR_OPCOES } from '@/hooks/use-kanban-colunas';

/**
 * Gerenciar marcadores de obra — a etiqueta livre que substituiu o "Status Inicial".
 *
 * Molde copiado de `src/components/pedidos/MarcadoresDialog.tsx` (marcador de negócio), de
 * propósito: quem já mexeu num dos dois não precisa reaprender nada no outro.
 *
 * TRÊS DIFERENÇAS EM RELAÇÃO AO MOLDE, todas deliberadas:
 *
 * 1. NÃO EXISTE MARCADOR DE SISTEMA. Nada é semeado — nenhuma empresa nasce com marcador
 *    pronto —, então todo marcador é excluível e não há cadeado nenhum na lista. Copiar o
 *    cadeado do molde só criaria um ícone que nunca aparece.
 *
 * 2. EXCLUIR NÃO OFERECE REALOCAÇÃO. O molde deixa escolher outro marcador para herdar os
 *    negócios; aqui as obras simplesmente ficam SEM marcador, porque `obras.marcador_id` tem
 *    `on delete set null` no banco. Marcador é opcional — obra sem marcador é estado válido,
 *    diferente da etapa do funil, que exige destino.
 *
 * 3. A LISTA NASCE VAZIA PARA TODO MUNDO, e por isso o estado vazio aqui não é um rodapé
 *    discreto, é a tela inteira convidando a criar o primeiro. Foi exatamente a falta disso
 *    que deixou o "Status Inicial" intransponível: um campo com a lista em branco, sem uma
 *    linha explicando que ninguém tinha cadastrado nada ainda.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarcadoresObrasDialog({ open, onOpenChange }: Props) {
  const { data: marcadores, isLoading } = useMarcadoresObras();
  const criarMut = useCriarMarcadorObra();
  const atualizarMut = useAtualizarMarcadorObra();
  const excluirMut = useExcluirMarcadorObra();
  const reordenarMut = useReordenarMarcadoresObras();

  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(KANBAN_COR_OPCOES[0].value);
  const campoNovoNome = useRef<HTMLInputElement>(null);

  const [editando, setEditando] = useState<MarcadorObra | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('');

  const [excluindo, setExcluindo] = useState<MarcadorObra | null>(null);

  // Cópia local só para o arrastar-e-soltar responder na hora. A lista de verdade continua
  // sendo a do servidor: toda gravação invalida a consulta e este efeito ressincroniza.
  const [listaLocal, setListaLocal] = useState<MarcadorObra[]>([]);

  useEffect(() => {
    if (marcadores) setListaLocal(marcadores);
  }, [marcadores]);

  const criar = async () => {
    if (!novoNome.trim()) return;
    try {
      await criarMut.mutateAsync({ nome: novoNome, cor: novaCor });
      setNovoNome('');
      setNovaCor(KANBAN_COR_OPCOES[0].value);
      campoNovoNome.current?.focus();
    } catch {
      // O hook já mostrou o aviso na tela. O que foi digitado fica no campo de propósito —
      // apagar o nome depois de uma falha obrigaria a pessoa a digitar tudo de novo.
    }
  };

  const salvarEdicao = async () => {
    if (!editando || !editNome.trim()) return;
    try {
      await atualizarMut.mutateAsync({ id: editando.id, nome: editNome, cor: editCor });
      setEditando(null);
    } catch {
      // Aviso já dado pelo hook; a janela de edição continua aberta com o que foi digitado.
    }
  };

  const abrirEdicao = (m: MarcadorObra) => {
    setEditando(m);
    setEditNome(m.nome);
    setEditCor(m.cor);
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    try {
      await excluirMut.mutateAsync(excluindo.id);
      setExcluindo(null);
    } catch {
      // Aviso já dado pelo hook; a confirmação segue aberta para tentar de novo.
    }
  };

  const aoSoltar = async (resultado: DropResult) => {
    if (!resultado.destination) return;
    if (resultado.destination.index === resultado.source.index) return;

    const anterior = listaLocal;
    const itens = Array.from(listaLocal);
    const [movido] = itens.splice(resultado.source.index, 1);
    itens.splice(resultado.destination.index, 0, movido);

    setListaLocal(itens);

    try {
      // A gravação da ordem é do hook, não daqui: ele numera a partir de 1 e é o único lugar
      // que sabe quais consultas precisam ser recarregadas depois (marcadores E obras).
      await reordenarMut.mutateAsync(itens.map((m) => m.id));
    } catch {
      // Sem isto a tela mostraria uma ordem que o banco não tem — e a próxima recarga
      // "desfaria" o arrasto sozinha, sem explicação nenhuma.
      setListaLocal(anterior);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* ConteudoDialogo em vez de DialogContent: com a lista cheia o modal passa da altura
            de um notebook 1366x768 e transborda para os dois lados ao mesmo tempo — o
            "Fechar" some por baixo e o "X" por cima, e este projeto desligou Esc e
            clique-fora, então a pessoa só sairia recarregando a página. */}
        <ConteudoDialogo className="max-w-2xl">
          <CabecalhoDialogo>
            <DialogTitle>Gerenciar Marcadores de Obra</DialogTitle>
            <DialogDescription>
              Marcadores são as etiquetas que a sua empresa usa para separar as obras. Defina o
              nome, a cor e a ordem de cada um.
            </DialogDescription>
          </CabecalhoDialogo>

          <CorpoDialogo className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Adicionar novo marcador
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  ref={campoNovoNome}
                  placeholder="Nome do marcador (ex: Fundação)"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') criar();
                  }}
                />
                <Select value={novaCor} onValueChange={setNovaCor}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_COR_OPCOES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <span className={cn('h-3 w-3 rounded-full', c.class)} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={criar} disabled={!novoNome.trim() || criarMut.isPending}>
                  {criarMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="ml-1">Adicionar</span>
                </Button>
              </div>
            </div>

            {/* Sem altura fixa: quem rola é o corpo do modal inteiro, então a lista usa a
                altura que sobrar na janela em vez de reservar 400px que a tela pode não ter. */}
            <div className="-mx-1 px-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : listaLocal.length === 0 ? (
                /* ESTADO VAZIO: aqui ele é a regra, não a exceção — nenhuma empresa nasce com
                   marcador cadastrado. Precisa explicar que está vazio porque ninguém criou
                   nada ainda, e não porque alguma coisa deixou de carregar. */
                <div className="rounded-lg border border-dashed py-8 px-6 text-center space-y-3">
                  <Tags className="h-8 w-8 mx-auto text-muted-foreground" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Nenhum marcador criado ainda</p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      A lista começa vazia de propósito: cada empresa monta a sua. Crie os
                      marcadores que fazem sentido para as suas obras — por exemplo Fundação,
                      Acabamento ou Parada — e depois marque cada obra com um deles.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => campoNovoNome.current?.focus()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Criar o primeiro marcador
                  </Button>
                </div>
              ) : (
                <DragDropContext onDragEnd={aoSoltar}>
                  <Droppable droppableId="marcadores-obras-list">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-1.5 pb-4"
                      >
                        {listaLocal.map((m, idx) => {
                          const corClass =
                            KANBAN_COR_OPCOES.find((x) => x.value === m.cor)?.class ??
                            'bg-muted-foreground';
                          return (
                            <Draggable key={m.id} draggableId={m.id} index={idx}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={cn(
                                    'flex items-center gap-2 rounded-md border bg-card p-2 transition-shadow',
                                    snapshot.isDragging && 'shadow-lg border-primary z-50 bg-accent',
                                  )}
                                >
                                  <div
                                    {...provided.dragHandleProps}
                                    className="text-muted-foreground hover:text-foreground p-1 cursor-grab active:cursor-grabbing"
                                    title="Arraste para mudar a ordem"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <span className={cn('h-3 w-3 rounded-full shrink-0', corClass)} />
                                  <span className="flex-1 text-sm font-medium">{m.nome}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => abrirEdicao(m)}
                                    title={`Editar o marcador "${m.nome}"`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  {/* Sem cadeado: não há marcador de sistema aqui, todo
                                      marcador pode ser excluído. */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => setExcluindo(m)}
                                    title={`Excluir o marcador "${m.nome}"`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
          </CorpoDialogo>

          <RodapeDialogo>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>

      {/* O molde usa `DialogContent` cru nesta janela de edição; aqui não, porque é modal com
          formulário e CLAUDE.md §7.11 proíbe — é o mesmo beco sem saída da janela principal. */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <ConteudoDialogo className="sm:max-w-md">
          <CabecalhoDialogo>
            <DialogTitle>Editar marcador</DialogTitle>
            <DialogDescription>
              A mudança vale para todas as obras que já usam este marcador.
            </DialogDescription>
          </CabecalhoDialogo>

          <CorpoDialogo className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvarEdicao();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Select value={editCor} onValueChange={setEditCor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_COR_OPCOES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-3 w-3 rounded-full', c.class)} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CorpoDialogo>

          <RodapeDialogo>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={!editNome.trim() || atualizarMut.isPending}>
              {atualizarMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o marcador "{excluindo?.nome}"?</AlertDialogTitle>
            {/* Sem escolha de destino: aqui não há para onde mover. As obras ficam sem
                marcador, que é um estado válido — diferente da etapa do funil. */}
            <AlertDialogDescription>
              As obras que usam este marcador continuam existindo, apenas ficam sem marcador
              nenhum. Nenhuma obra é apagada. Você pode marcá-las de novo depois, uma a uma.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // O AlertDialog fecha sozinho no clique; segurar o fechamento é o que mantém
                // o "Excluindo..." visível e a janela aberta se a gravação falhar.
                e.preventDefault();
                confirmarExclusao();
              }}
              disabled={excluirMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluirMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

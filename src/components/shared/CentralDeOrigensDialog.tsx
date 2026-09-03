import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Lock } from 'lucide-react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
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
import { cn } from '@/lib/utils';
import {
  useOrigensPedido,
  useCriarOrigemPedido,
  useRenomearOrigemPedido,
  useExcluirOrigemPedido,
  useReordenarOrigensPedido,
  OrigemPedido,
} from '@/hooks/use-origens-pedido';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId?: string | null;
}

/**
 * Central de Origens: o gestor cria, renomeia, reordena (arrastando pela alça) e
 * remove as origens do negócio da empresa. As 4 origens padrão (`is_sistema`) podem
 * ser reordenadas, mas não renomeadas nem excluídas — travado na UI e no banco
 * (trigger `protege_origem_pedido_sistema`).
 *
 * Abre a partir do OrigemLeadSelect e só para gestor/admin — quem não é gestor nem vê a
 * opção, e a RLS recusaria a escrita de qualquer jeito.
 */
export function CentralDeOrigensDialog({ open, onOpenChange, empresaId }: Props) {
  const { data: origens, isLoading } = useOrigensPedido(empresaId);
  const criarMut = useCriarOrigemPedido();
  const renomearMut = useRenomearOrigemPedido();
  const excluirMut = useExcluirOrigemPedido();
  const reordenarMut = useReordenarOrigensPedido();

  const [novoNome, setNovoNome] = useState('');

  const [editando, setEditando] = useState<OrigemPedido | null>(null);
  const [editNome, setEditNome] = useState('');

  const [excluindo, setExcluindo] = useState<OrigemPedido | null>(null);

  // Lista local para o arraste responder na hora; ressincroniza quando a consulta volta.
  const [localList, setLocalList] = useState<OrigemPedido[]>([]);
  useEffect(() => {
    if (origens) setLocalList(origens);
  }, [origens]);

  const handleCriar = async () => {
    if (!novoNome.trim()) return;
    await criarMut.mutateAsync(novoNome);
    setNovoNome('');
  };

  const startEdit = (o: OrigemPedido) => {
    setEditando(o);
    setEditNome(o.nome);
  };

  const handleSalvarEdit = async () => {
    if (!editando || !editNome.trim()) return;
    await renomearMut.mutateAsync({ id: editando.id, nome: editNome });
    setEditando(null);
  };

  const confirmarExcluir = async () => {
    if (!excluindo) return;
    await excluirMut.mutateAsync(excluindo.id);
    setExcluindo(null);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const items = Array.from(localList);
    const [movido] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, movido);
    setLocalList(items);
    try {
      await reordenarMut.mutateAsync(items.map((o) => o.id));
    } catch {
      // O hook já avisa o erro; aqui só desfaz o palpite otimista.
      setLocalList(origens ?? []);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ConteudoDialogo className="max-w-lg">
          <CabecalhoDialogo>
            <DialogTitle>Central de Origens</DialogTitle>
            <DialogDescription>
              Crie, renomeie, reordene (arrastando pela alça) e remova as origens que
              aparecem ao cadastrar um negócio. As origens marcadas como PADRÃO só podem
              ser reordenadas.
            </DialogDescription>
          </CabecalhoDialogo>

          {/* Adicionar nova origem — fixo, junto do cabeçalho; não rola com a lista. */}
          <div className="shrink-0 mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Adicionar nova origem
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Ex: Evento de Construção"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCriar();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleCriar}
                disabled={!novoNome.trim() || criarMut.isPending}
              >
                {criarMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="ml-1">Adicionar</span>
              </Button>
            </div>
          </div>

          {/* Só a lista rola. Teto de ~6 origens (≈19rem) — o resto vai para o scroll,
              que passa a funcionar justamente por causa desse teto. */}
          <CorpoDialogo className="flex-none max-h-[19rem] mt-3">
            <div className="-mx-1 px-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : localList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma origem cadastrada
                </p>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="origens-list">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-1.5 pb-1"
                      >
                        {localList.map((o, idx) => (
                          <Draggable key={o.id} draggableId={o.id} index={idx}>
                            {(dragProvided, snapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={cn(
                                  'flex items-center gap-2 rounded-md border bg-card p-2 transition-shadow',
                                  snapshot.isDragging &&
                                    'z-50 border-primary bg-accent shadow-lg',
                                )}
                              >
                                <div
                                  {...dragProvided.dragHandleProps}
                                  className="cursor-grab p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                                  aria-label="Arrastar para reordenar"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <span className="flex-1 text-sm font-medium">
                                  {o.nome}
                                </span>
                                {o.is_sistema && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    PADRÃO
                                  </span>
                                )}
                                {o.is_sistema ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground"
                                    disabled
                                    title="Origem padrão do sistema — só pode ser reordenada"
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => startEdit(o)}
                                      title="Renomear"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => setExcluindo(o)}
                                      title="Excluir"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>

      {/* Renomear */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Renomear origem</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da origem</Label>
            <Input
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSalvarEdit();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarEdit}
              disabled={!editNome.trim() || renomearMut.isPending}
            >
              {renomearMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog
        open={!!excluindo}
        onOpenChange={(o) => !o && setExcluindo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir origem "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A origem sai da lista de opções. Negócios que já estão com essa origem
              continuam mostrando o texto — nada neles é alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExcluir}
              disabled={excluirMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluirMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

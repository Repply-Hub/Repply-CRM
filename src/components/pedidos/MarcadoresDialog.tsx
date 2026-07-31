import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Lock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useMarcadores,
  useCreateMarcador,
  useUpdateMarcador,
  useDeleteMarcador,
  type Marcador,
} from '@/hooks/use-marcadores';
import { KANBAN_COR_OPCOES } from '@/hooks/use-kanban-colunas';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const SEM_MARCADOR = '__nenhum__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId?: string | null;
}

export function MarcadoresDialog({ open, onOpenChange, empresaId }: Props) {
  const { data: marcadores, isLoading } = useMarcadores(empresaId);
  const createMut = useCreateMarcador();
  const updateMut = useUpdateMarcador();
  const deleteMut = useDeleteMarcador();
  const qc = useQueryClient();

  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(KANBAN_COR_OPCOES[0].value);

  const [editando, setEditando] = useState<Marcador | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('');

  const [excluindo, setExcluindo] = useState<Marcador | null>(null);
  const [targetId, setTargetId] = useState<string>(SEM_MARCADOR);

  const [localList, setLocalList] = useState<Marcador[]>([]);

  useEffect(() => {
    if (marcadores) setLocalList(marcadores);
  }, [marcadores]);

  const handleCreate = async () => {
    if (!novoNome.trim()) return;
    await createMut.mutateAsync({ nome: novoNome, cor: novaCor });
    setNovoNome('');
    setNovaCor(KANBAN_COR_OPCOES[0].value);
  };

  const handleSaveEdit = async () => {
    if (!editando) return;
    await updateMut.mutateAsync({ id: editando.id, nome: editNome, cor: editCor });
    setEditando(null);
  };

  const startEdit = (m: Marcador) => {
    setEditando(m);
    setEditNome(m.nome);
    setEditCor(m.cor);
  };

  const startDelete = (m: Marcador) => {
    setExcluindo(m);
    setTargetId(SEM_MARCADOR);
  };

  const confirmDelete = async () => {
    if (!excluindo) return;
    await deleteMut.mutateAsync({ id: excluindo.id, targetId: targetId === SEM_MARCADOR ? null : targetId });
    setExcluindo(null);
    setTargetId(SEM_MARCADOR);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(localList);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setLocalList(items);

    try {
      await Promise.all(
        items.map((item, index) =>
          supabase.from('marcadores').update({ ordem: index }).eq('id', item.id)
        )
      );
      qc.invalidateQueries({ queryKey: ['marcadores'] });
    } catch (err) {
      toast.error('Erro ao reordenar marcadores');
      setLocalList(marcadores ?? []);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerenciar Marcadores</DialogTitle>
            <DialogDescription>
              Personalize os marcadores dos seus negócios. Defina a ordem e as cores de cada um.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar novo marcador</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Nome do marcador (ex: Urgente)"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <Select value={novaCor} onValueChange={setNovaCor}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_COR_OPCOES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-3 w-3 rounded-full', c.class)} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={!novoNome.trim() || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-1">Adicionar</span>
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[400px] -mx-1 px-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (localList.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum marcador cadastrado</p>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="marcadores-list">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-1.5 pb-4"
                    >
                      {localList.map((m, idx) => {
                        const corClass = KANBAN_COR_OPCOES.find(x => x.value === m.cor)?.class ?? 'bg-muted-foreground';
                        return (
                          <Draggable key={m.id} draggableId={m.id} index={idx}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "flex items-center gap-2 rounded-md border bg-card p-2 transition-shadow",
                                  snapshot.isDragging && "shadow-lg border-primary z-50 bg-accent"
                                )}
                              >
                                <div
                                  {...provided.dragHandleProps}
                                  className="text-muted-foreground hover:text-foreground p-1 cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <span className={cn('h-3 w-3 rounded-full shrink-0', corClass)} />
                                <span className="flex-1 text-sm font-medium">{m.nome}</span>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {m.is_sistema ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground"
                                    disabled
                                    title={`O marcador "${m.nome}" é padrão do sistema e não pode ser excluído`}
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => startDelete(m)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
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
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar marcador</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Select value={editCor} onValueChange={setEditCor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KANBAN_COR_OPCOES.map(c => (
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={!editNome.trim() || updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir marcador "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os negócios que têm este marcador ficarão sem marcador, a menos que você escolha outro abaixo para substituí-lo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Mover negócios para (opcional):</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_MARCADOR}>Nenhum (remover marcador)</SelectItem>
                {(marcadores ?? []).filter(m => m.id !== excluindo?.id).map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

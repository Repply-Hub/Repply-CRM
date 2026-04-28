import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, GripVertical } from 'lucide-react';
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
    useStatusObras,
    useCreateStatusObra,
    useUpdateStatusObra,
    useDeleteStatusObra,
    StatusObra,
} from '@/hooks/use-status-obras';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const STATUS_COR_OPCOES = [
  { value: 'primary', label: 'Padrão', class: 'bg-primary' },
  { value: 'orange', label: 'Laranja', class: 'bg-orange-500' },
  { value: 'yellow', label: 'Amarelo', class: 'bg-yellow-500' },
  { value: 'purple', label: 'Roxo', class: 'bg-purple-500' },
  { value: 'blue', label: 'Azul', class: 'bg-blue-500' },
  { value: 'green', label: 'Verde', class: 'bg-green-500' },
  { value: 'red', label: 'Vermelho', class: 'bg-red-500' },
  { value: 'gray', label: 'Cinza', class: 'bg-slate-500' },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function StatusObrasDialog({ open, onOpenChange }: Props) {
    const { data: statusList, isLoading } = useStatusObras();
    const createMut = useCreateStatusObra();
    const updateMut = useUpdateStatusObra();
    const deleteMut = useDeleteStatusObra();
    const qc = useQueryClient();

    const [novoNome, setNovoNome] = useState('');
    const [novaCor, setNovaCor] = useState(STATUS_COR_OPCOES[0].value);

    const [editando, setEditando] = useState<StatusObra | null>(null);
    const [editNome, setEditNome] = useState('');
    const [editCor, setEditCor] = useState('');

    const [excluindo, setExcluindo] = useState<StatusObra | null>(null);
    const [targetSlug, setTargetSlug] = useState<string>('');

    const [localList, setLocalList] = useState<StatusObra[]>([]);

    useEffect(() => {
        if (statusList) {
            setLocalList(statusList);
        }
    }, [statusList]);

    const handleCreate = async () => {
        if (!novoNome.trim()) return;
        await createMut.mutateAsync({ nome: novoNome, cor: novaCor });
        setNovoNome('');
        setNovaCor(STATUS_COR_OPCOES[0].value);
    };

    const handleSaveEdit = async () => {
        if (!editando) return;
        await updateMut.mutateAsync({ id: editando.id, nome: editNome, cor: editCor });
        setEditando(null);
    };

    const startEdit = (c: StatusObra) => {
        setEditando(c);
        setEditNome(c.nome);
        setEditCor(c.cor);
    };

    const startDelete = (c: StatusObra) => {
        const outras = (statusList ?? []).filter(x => x.id !== c.id);
        setExcluindo(c);
        setTargetSlug(outras[0]?.slug ?? '');
    };

    const confirmDelete = async () => {
        if (!excluindo || !targetSlug) return;
        await deleteMut.mutateAsync({ id: excluindo.id, slug: excluindo.slug, targetSlug });
        setExcluindo(null);
        setTargetSlug('');
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
                    supabase.from('status_obras').update({ ordem: index }).eq('id', item.id)
                )
            );
            qc.invalidateQueries({ queryKey: ['status_obras'] });
        } catch (err) {
            toast.error('Erro ao reordenar status');
            setLocalList(statusList ?? []);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Status de Obras</DialogTitle>
                        <DialogDescription>
                            Personalize as etapas das suas obras. Defina a ordem e as cores de cada status.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar novo status</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                placeholder="Nome do status (ex: Fundação)"
                                value={novoNome}
                                onChange={(e) => setNovoNome(e.target.value)}
                                className="flex-1"
                            />
                            <Select value={novaCor} onValueChange={setNovaCor}>
                                <SelectTrigger className="w-full sm:w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_COR_OPCOES.map(c => (
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
                            <p className="text-sm text-muted-foreground text-center py-6">Nenhum status cadastrado</p>
                        ) : (
                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="status-list">
                                    {(provided) => (
                                        <div 
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-1.5 pb-4"
                                        >
                                            {localList.map((c, idx) => {
                                                const corClass = STATUS_COR_OPCOES.find(x => x.value === c.cor)?.class ?? 'bg-primary';
                                                return (
                                                    <Draggable key={c.id} draggableId={c.id} index={idx}>
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
                                                                <span className="flex-1 text-sm font-medium">{c.nome}</span>
                                                                {c.is_sistema && (
                                                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">PADRÃO</span>
                                                                )}
                                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                                                    onClick={() => startDelete(c)}
                                                                    disabled={localList.length <= 1}
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
                    </ScrollArea>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar status</DialogTitle>
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
                                    {STATUS_COR_OPCOES.map(c => (
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
                        <AlertDialogTitle>Excluir status "{excluindo?.nome}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            As obras atualmente neste status serão movidas para o status escolhido abaixo. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-1.5">
                        <Label>Mover obras para:</Label>
                        <Select value={targetSlug} onValueChange={setTargetSlug}>
                            <SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger>
                            <SelectContent>
                                {(statusList ?? []).filter(c => c.id !== excluindo?.id).map(c => (
                                    <SelectItem key={c.id} value={c.slug}>{c.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={!targetSlug || deleteMut.isPending}
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

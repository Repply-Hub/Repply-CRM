import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    useFunis,
    useCreateFunil,
    useRenameFunil,
    useDeleteFunil,
    Funil,
} from '@/hooks/use-funis';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    empresaId?: string | null;
    /** Chamado quando um funil novo é criado, para já trocar o funil ativo pra ele. */
    onFunilCreated?: (funilId: string) => void;
}

export function FunisDialog({ open, onOpenChange, empresaId, onFunilCreated }: Props) {
    const { data: funis, isLoading } = useFunis(empresaId);
    const createMut = useCreateFunil();
    const renameMut = useRenameFunil();
    const deleteMut = useDeleteFunil();

    const [novoNome, setNovoNome] = useState('');

    const [editando, setEditando] = useState<Funil | null>(null);
    const [editNome, setEditNome] = useState('');

    const [excluindo, setExcluindo] = useState<Funil | null>(null);

    const handleCreate = async () => {
        if (!novoNome.trim()) return;
        const novoId = await createMut.mutateAsync(novoNome);
        setNovoNome('');
        if (novoId) onFunilCreated?.(novoId);
    };

    const startEdit = (f: Funil) => {
        setEditando(f);
        setEditNome(f.nome);
    };

    const handleSaveEdit = async () => {
        if (!editando) return;
        await renameMut.mutateAsync({ id: editando.id, nome: editNome });
        setEditando(null);
    };

    const confirmDelete = async () => {
        if (!excluindo) return;
        await deleteMut.mutateAsync(excluindo.id);
        setExcluindo(null);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                {/* ConteudoDialogo em vez de DialogContent: a altura desta janela cresce a cada
                    funil criado e, sem teto, ela transborda para cima e para baixo ao mesmo tempo —
                    o "Fechar" e o "X" somem juntos e só recarregar a página resolve. */}
                <ConteudoDialogo className="max-w-lg">
                    <CabecalhoDialogo>
                        <DialogTitle>Gerenciar Funis</DialogTitle>
                        <DialogDescription>
                            Crie, renomeie ou exclua funis (pipelines) de vendas. Cada funil nasce com as
                            mesmas etapas padrão e pode ser customizado depois. Apenas gestores e
                            administradores podem fazer alterações.
                        </DialogDescription>
                    </CabecalhoDialogo>

                    <CorpoDialogo className="space-y-4">
                    {/* Adicionar novo */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criar novo funil</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                placeholder="Nome do funil (ex: Locação, Pós-venda)"
                                value={novoNome}
                                onChange={(e) => setNovoNome(e.target.value)}
                                className="flex-1"
                                autoFocus
                            />
                            <Button onClick={handleCreate} disabled={!novoNome.trim() || createMut.isPending}>
                                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                <span className="ml-1">Criar</span>
                            </Button>
                        </div>
                    </div>

                    {/* Lista */}
                    {/* Sem altura fixa: quem rola é o corpo do modal, então a lista aproveita a
                        altura que a janela tiver em vez de reservar 350px. */}
                    <div className="-mx-1 px-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (funis?.length ?? 0) === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Nenhum funil cadastrado</p>
                        ) : (
                            <div className="space-y-1.5">
                                {funis!.map((f) => (
                                    <div key={f.id} className="flex items-center gap-2 rounded-md border bg-card p-2">
                                        <span className="flex-1 text-sm font-medium">{f.nome}</span>
                                        {f.is_padrao && (
                                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">PADRÃO</span>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(f)} title="Renomear">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        {f.is_padrao ? (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground"
                                                disabled
                                                title={`O funil "${f.nome}" é padrão do sistema e não pode ser excluído`}
                                            >
                                                <Lock className="h-3.5 w-3.5" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={() => setExcluindo(f)}
                                                title="Excluir"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    </CorpoDialogo>

                    <RodapeDialogo>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                    </RodapeDialogo>
                </ConteudoDialogo>
            </Dialog>

            {/* Renomear funil */}
            <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renomear funil</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label>Nome</Label>
                        <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                        <Button onClick={handleSaveEdit} disabled={!editNome.trim() || renameMut.isPending}>
                            {renameMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Excluir funil */}
            <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funil "{excluindo?.nome}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Isso exclui também todas as etapas (colunas) desse funil. Só é possível excluir
                            um funil que não tenha nenhum negócio vinculado — mova ou exclua os negócios
                            dele antes, se houver. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
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

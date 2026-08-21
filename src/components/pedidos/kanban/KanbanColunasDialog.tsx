import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, GripVertical, Loader2, Lock, Eye, EyeOff, FolderKanban, FolderPlus, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
    useKanbanColunas,
    useCreateKanbanColuna,
    useUpdateKanbanColuna,
    useDeleteKanbanColuna,
    useReorderKanbanColunas,
    KANBAN_COR_OPCOES,
} from '@/hooks/use-kanban-colunas';
import { useDeleteFunil, type Funil } from '@/hooks/use-funis';
import { FunisDialog } from '@/components/pedidos/kanban/FunisDialog';
import { useConfiguracoesCampos, resolveFieldLabel } from '@/hooks/use-configuracoes-campos';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    empresaId?: string | null;
    /** Funil atualmente ativo na tela (usado como seleção inicial e para escopar a visibilidade). */
    funilId?: string | null;
    funilNome?: string | null;
    /** Lista completa de funis da empresa, para permitir trocar qual funil está sendo gerenciado. */
    funis?: Funil[];
    /** Slugs das colunas visíveis no board/lista (independente da existência da coluna). */
    visibleSlugs?: string[];
    onToggleVisibility?: (slug: string) => void;
    onResetVisibility?: () => void;
}

interface DraftColuna {
    id: string;
    nome: string;
    cor: string;
    slug: string;
    is_sistema: boolean;
    isNew?: boolean;
}

interface PendingDelete {
    id: string;
    slug: string;
    targetSlug: string;
}

export function KanbanColunasDialog({
    open,
    onOpenChange,
    empresaId,
    funilId,
    funilNome,
    funis,
    visibleSlugs,
    onToggleVisibility,
    onResetVisibility,
}: Props) {
    const [selectedFunilId, setSelectedFunilId] = useState<string | undefined>(funilId ?? undefined);

    // Sempre que o diálogo é reaberto, volta a gerenciar o funil que está ativo na tela.
    useEffect(() => {
        if (open) setSelectedFunilId(funilId ?? undefined);
    }, [open, funilId]);

    const { data: colunas, isLoading } = useKanbanColunas(empresaId, selectedFunilId);
    const createMut = useCreateKanbanColuna();
    const updateMut = useUpdateKanbanColuna();
    const deleteMut = useDeleteKanbanColuna();
    const reorderMut = useReorderKanbanColunas();
    const deleteFunilMut = useDeleteFunil();
    const saving = createMut.isPending || updateMut.isPending || deleteMut.isPending || reorderMut.isPending;

    const selectedFunil = funis?.find(f => f.id === selectedFunilId);
    const [excluindoFunil, setExcluindoFunil] = useState(false);

    const confirmDeleteFunil = async () => {
        if (!selectedFunilId) return;
        await deleteFunilMut.mutateAsync(selectedFunilId, {
            onSuccess: () => {
                const proximo = funis?.find(f => f.is_padrao && f.id !== selectedFunilId) ?? funis?.find(f => f.id !== selectedFunilId);
                if (proximo) setSelectedFunilId(proximo.id);
            },
        });
        setExcluindoFunil(false);
    };

    const [draft, setDraft] = useState<DraftColuna[]>([]);
    const [pendingDeletions, setPendingDeletions] = useState<PendingDelete[]>([]);

    // Rascunho local: só reflete o servidor quando o diálogo abre ou o funil gerenciado muda —
    // edições feitas na sessão não são perdidas por re-renders, só descartadas ao cancelar/fechar.
    useEffect(() => {
        if (open && colunas) {
            setDraft(colunas.map(c => ({ id: c.id, nome: c.nome, cor: c.cor, slug: c.slug, is_sistema: c.is_sistema })));
            setPendingDeletions([]);
            setAddingOpen(false);
            setNovoNome('');
        }
    }, [open, colunas]);

    const [novoNome, setNovoNome] = useState('');
    const [novaCor, setNovaCor] = useState(KANBAN_COR_OPCOES[0].value);

    const [editando, setEditando] = useState<DraftColuna | null>(null);
    const [editNome, setEditNome] = useState('');
    const [editCor, setEditCor] = useState('');

    const [excluindo, setExcluindo] = useState<DraftColuna | null>(null);
    const [targetSlug, setTargetSlug] = useState<string>('');

    // Campos de Negócios que ficariam sem NENHUMA etapa vinculada se esta coluna for
    // excluída — nesse estado eles passam a não ser exigidos em etapa alguma (ver
    // isCampoObrigatorioNaEtapa). Vale avisar o gestor antes de excluir.
    const { data: camposConfig } = useConfiguracoesCampos('pedidos', empresaId);
    const camposQueFicariamSemEtapa = useMemo(() => {
        if (!excluindo) return [];
        return (camposConfig ?? []).filter(c =>
            c.obrigatorio && c.obrigatorio_escopo === 'etapas' &&
            c.etapasObrigatorias.length === 1 && c.etapasObrigatorias[0] === excluindo.id
        );
    }, [camposConfig, excluindo]);

    const [funisManagerOpen, setFunisManagerOpen] = useState(false);
    const [addingOpen, setAddingOpen] = useState(false);

    const isDirty = useMemo(() => {
        if (pendingDeletions.length > 0) return true;
        if (!colunas) return draft.length > 0;
        if (draft.length !== colunas.length) return true;
        return draft.some((d, idx) => {
            const orig = colunas[idx];
            return !orig || orig.id !== d.id || orig.nome !== d.nome || orig.cor !== d.cor;
        });
    }, [draft, colunas, pendingDeletions]);

    const handleAddDraft = () => {
        if (!novoNome.trim()) return;
        setDraft(prev => [
            ...prev,
            { id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nome: novoNome.trim(), cor: novaCor, slug: '', is_sistema: false, isNew: true },
        ]);
        setNovoNome('');
        setNovaCor(KANBAN_COR_OPCOES[0].value);
    };

    const handleSaveEdit = () => {
        if (!editando || !editNome.trim()) return;
        setDraft(prev => prev.map(c => (c.id === editando.id ? { ...c, nome: editNome.trim(), cor: editCor } : c)));
        setEditando(null);
    };

    const startEdit = (c: DraftColuna) => {
        setEditando(c);
        setEditNome(c.nome);
        setEditCor(c.cor);
    };

    // "Fechamento"/"Perdido" são fixas em todo funil e não podem ser excluídas/renomeadas.
    const isProtegida = (c: DraftColuna) =>
        (c.slug === 'perdido' || c.slug === 'fechamento') && c.is_sistema;

    const startDelete = (c: DraftColuna) => {
        const outras = draft.filter(x => x.id !== c.id && !x.isNew);
        setExcluindo(c);
        setTargetSlug(outras[0]?.slug ?? '');
    };

    const confirmDelete = () => {
        if (!excluindo) return;
        if (!excluindo.isNew) {
            if (!targetSlug) return;
            setPendingDeletions(prev => [...prev, { id: excluindo.id, slug: excluindo.slug, targetSlug }]);
        }
        setDraft(prev => prev.filter(c => c.id !== excluindo.id));
        setExcluindo(null);
        setTargetSlug('');
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        setDraft(prev => {
            const list = [...prev];
            const [moved] = list.splice(result.source.index, 1);
            list.splice(result.destination.index, 0, moved);
            return list;
        });
    };

    const handleSaveChanges = async () => {
        if (!selectedFunilId) return;
        try {
            for (const del of pendingDeletions) {
                await deleteMut.mutateAsync({ id: del.id, slug: del.slug, targetSlug: del.targetSlug, funilId: selectedFunilId });
            }
            for (const d of draft) {
                if (d.isNew) continue;
                const original = colunas?.find(c => c.id === d.id);
                if (original && (original.nome !== d.nome || original.cor !== d.cor)) {
                    await updateMut.mutateAsync({ id: d.id, nome: d.nome, cor: d.cor });
                }
            }
            const idMap = new Map<string, string>();
            for (const d of draft) {
                if (!d.isNew) continue;
                const newId = await createMut.mutateAsync({ nome: d.nome, cor: d.cor, funilId: selectedFunilId });
                idMap.set(d.id, newId);
            }
            const finalOrder = draft.map(d => idMap.get(d.id) ?? d.id);
            await reorderMut.mutateAsync(finalOrder);

            setPendingDeletions([]);
            toast.success('Alterações do kanban salvas');
            onOpenChange(false);
        } catch {
            // Erros específicos de cada mutação já disparam seu próprio toast.
        }
    };

    const requestClose = (o: boolean) => {
        if (!o && isDirty && !saving) {
            if (!window.confirm('Você tem alterações não salvas nas colunas. Deseja descartar e fechar?')) return;
        }
        if (!o && !saving) {
            // Descarta o rascunho para a próxima abertura refletir o servidor.
            setPendingDeletions([]);
        }
        onOpenChange(o);
    };

    const showVisibilidade = !!onToggleVisibility && selectedFunilId === funilId;

    return (
        <>
            <Dialog open={open} onOpenChange={requestClose}>
                {/* ConteudoDialogo em vez de DialogContent: com as 6 etapas de hoje esta janela já
                    mede ~670px e, num notebook 1366x768, transbordava para cima e para baixo ao
                    mesmo tempo — "Salvar alterações" sumia por baixo e o "X" por cima. Como Esc e
                    clique-fora estão desligados (ui/dialog.tsx:42), a única saída era recarregar a
                    página e perder tudo que tinha sido reordenado. */}
                <ConteudoDialogo className="max-w-2xl">
                    <CabecalhoDialogo>
                        <DialogTitle className="flex items-center gap-2 flex-wrap">
                            Gerenciar Colunas do Kanban
                            {funilNome && selectedFunilId === funilId && (
                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {funilNome}
                                </span>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Crie, edite, reordene e remova as colunas (etapas) do funil selecionado. Apenas gestores e administradores podem fazer alterações.
                            As alterações só têm efeito depois de clicar em "Salvar alterações".
                        </DialogDescription>
                    </CabecalhoDialogo>

                    <CorpoDialogo className="space-y-4">
                    {funis && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <FolderKanban className="h-3.5 w-3.5" /> Funil
                            </Label>
                            <div className="flex gap-2">
                                {funis.length > 1 ? (
                                    <Select
                                        value={selectedFunilId}
                                        onValueChange={(v) => {
                                            if (isDirty && !window.confirm('Você tem alterações não salvas neste funil. Deseja descartá-las e trocar de funil?')) return;
                                            setSelectedFunilId(v);
                                        }}
                                    >
                                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {funis.map(f => (
                                                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="flex-1 flex items-center px-3 h-9 rounded-md border text-sm text-muted-foreground">
                                        {funis[0]?.nome ?? 'Funil Padrão'}
                                    </div>
                                )}
                                <Button variant="outline" onClick={() => setFunisManagerOpen(true)} title="Criar ou gerenciar funis">
                                    <FolderPlus className="h-4 w-4" />
                                    <span className="ml-1.5 hidden sm:inline">Novo funil</span>
                                </Button>
                            </div>
                        </div>
                    )}


                    {/* Lista */}
                    {showVisibilidade && (
                        <div className="flex items-center justify-between px-0.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visibilidade no board/lista</p>
                            {onResetVisibility && (
                                <button
                                    type="button"
                                    onClick={onResetVisibility}
                                    className="text-[11px] text-primary font-bold hover:underline uppercase tracking-wider"
                                >
                                    {(colunas?.length ?? 0) > 0 && visibleSlugs?.length === colunas?.length ? 'Ocultar todas' : 'Mostrar todas'}
                                </button>
                            )}
                        </div>
                    )}
                    {/* Sem altura fixa: quem rola é o corpo do modal inteiro, então a lista de
                        etapas usa a altura que sobra na janela em vez de reservar 400px que a tela
                        pode não ter. */}
                    <div className="-mx-1 px-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                            {draft.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma coluna cadastrada</p>
                            ) : (
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId="kanban-colunas">
                                    {(provided) => (
                                        <div className="space-y-1.5" ref={provided.innerRef} {...provided.droppableProps}>
                                            {draft.map((c, idx) => {
                                                const corClass = KANBAN_COR_OPCOES.find(x => x.value === c.cor)?.class ?? 'bg-muted-foreground';
                                                return (
                                                    <Draggable key={c.id} draggableId={c.id} index={idx}>
                                                        {(dragProvided, dragSnapshot) => {
                                                            const row = (
                                                            <div
                                                                ref={dragProvided.innerRef}
                                                                {...dragProvided.draggableProps}
                                                                className={cn(
                                                                    'flex items-center gap-2 rounded-md border bg-card p-2',
                                                                    dragSnapshot.isDragging && 'shadow-xl bg-background',
                                                                    c.isNew && 'border-primary/40 bg-primary/[0.03]'
                                                                )}
                                                            >
                                                                <div
                                                                    {...dragProvided.dragHandleProps}
                                                                    className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                                                                    aria-label="Arrastar para reordenar"
                                                                >
                                                                    <GripVertical className="h-4 w-4" />
                                                                </div>
                                                                <span className={cn('h-3 w-3 rounded-full shrink-0', corClass)} />
                                                                <span className="flex-1 text-sm font-medium">{c.nome}</span>
                                                                {isProtegida(c) && (
                                                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">PADRÃO</span>
                                                                )}
                                                                {c.isNew && (
                                                                    <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">NOVA</span>
                                                                )}
                                                                {showVisibilidade && !c.isNew && (() => {
                                                                    const visivel = visibleSlugs?.includes(c.slug) ?? true;
                                                                    const disabled = visivel && (visibleSlugs?.length ?? 0) <= 1;
                                                                    return (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className={cn('h-7 w-7', !visivel && 'text-muted-foreground/50')}
                                                                            onClick={() => onToggleVisibility?.(c.slug)}
                                                                            disabled={disabled}
                                                                            title={visivel ? 'Ocultar do board/lista' : 'Exibir no board/lista'}
                                                                        >
                                                                            {visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                                                        </Button>
                                                                    );
                                                                })()}
                                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)} title="Editar">
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                                {isProtegida(c) ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-muted-foreground"
                                                                        disabled
                                                                        title={`A coluna "${c.nome}" é padrão do sistema e não pode ser excluída`}
                                                                    >
                                                                        <Lock className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                                        onClick={() => startDelete(c)}
                                                                        disabled={draft.length <= 1}
                                                                        title={draft.length <= 1 ? 'Não é possível excluir a última coluna' : 'Excluir'}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            );
                                                            return dragSnapshot.isDragging ? createPortal(row, document.body) : row;
                                                        }}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                            )}

                            {addingOpen ? (
                                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar nova coluna</p>
                                        <button
                                            type="button"
                                            onClick={() => { setAddingOpen(false); setNovoNome(''); }}
                                            className="text-muted-foreground hover:text-foreground"
                                            aria-label="Fechar"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Input
                                            placeholder="Nome da coluna (ex: Pós-venda)"
                                            value={novoNome}
                                            onChange={(e) => setNovoNome(e.target.value)}
                                            className="flex-1"
                                            autoFocus
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddDraft(); if (e.key === 'Escape') { setAddingOpen(false); setNovoNome(''); } }}
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
                                        <Button onClick={handleAddDraft} disabled={!novoNome.trim() || !selectedFunilId}>
                                            <Plus className="h-4 w-4" />
                                            <span className="ml-1">Adicionar</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setAddingOpen(true)}
                                    disabled={!selectedFunilId}
                                    className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Plus className="h-4 w-4" />
                                    Adicionar coluna
                                </button>
                            )}
                            </div>
                        )}
                    </div>
                    </CorpoDialogo>

                    <RodapeDialogo className="sm:justify-between">
                        {selectedFunil && !selectedFunil.is_padrao ? (
                            <Button
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setExcluindoFunil(true)}
                                disabled={saving}
                            >
                                <Trash2 className="h-4 w-4 mr-1.5" />
                                Excluir funil
                            </Button>
                        ) : <div />}
                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2">
                            <Button variant="outline" onClick={() => requestClose(false)} disabled={saving}>Cancelar</Button>
                            <Button onClick={handleSaveChanges} disabled={!isDirty || saving || !selectedFunilId}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Salvar alterações
                            </Button>
                        </div>
                    </RodapeDialogo>
                </ConteudoDialogo>
            </Dialog>

            {/* Editar coluna (rascunho, aplicado só ao salvar) */}
            <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar coluna</DialogTitle>
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
                        <Button onClick={handleSaveEdit} disabled={!editNome.trim()}>
                            Aplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Excluir coluna (rascunho, aplicado só ao salvar) */}
            <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir coluna "{excluindo?.nome}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {excluindo?.isNew
                                ? 'Esta coluna ainda não foi salva — ela será apenas removida do rascunho.'
                                : 'Ao salvar as alterações, os negócios atualmente nesta coluna serão movidos para a coluna escolhida abaixo. Esta ação não poderá ser desfeita.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {camposQueFicariamSemEtapa.length > 0 && (
                        <p className="text-sm text-destructive">
                            {camposQueFicariamSemEtapa.length === 1
                                ? `O campo "${resolveFieldLabel(camposQueFicariamSemEtapa[0])}" está configurado como obrigatório só nesta etapa e ficará sem nenhuma etapa vinculada (deixará de ser exigido) — revise em Configurações → Campos.`
                                : `Os campos ${camposQueFicariamSemEtapa.map(c => `"${resolveFieldLabel(c)}"`).join(', ')} estão configurados como obrigatórios só nesta etapa e ficarão sem nenhuma etapa vinculada (deixarão de ser exigidos) — revise em Configurações → Campos.`}
                        </p>
                    )}
                    {!excluindo?.isNew && (
                        <div className="space-y-1.5">
                            <Label>Mover negócios para:</Label>
                            <Select value={targetSlug} onValueChange={setTargetSlug}>
                                <SelectTrigger><SelectValue placeholder="Selecione uma coluna" /></SelectTrigger>
                                <SelectContent>
                                    {draft.filter(c => c.id !== excluindo?.id && !c.isNew).map(c => (
                                        <SelectItem key={c.id} value={c.slug}>{c.nome}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={!excluindo?.isNew && !targetSlug}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Criar/gerenciar funis, acessível direto da tela de gerenciamento de colunas */}
            <FunisDialog
                open={funisManagerOpen}
                onOpenChange={setFunisManagerOpen}
                empresaId={empresaId}
                onFunilCreated={(novoId) => setSelectedFunilId(novoId)}
            />

            {/* Excluir funil */}
            <AlertDialog open={excluindoFunil} onOpenChange={setExcluindoFunil}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funil "{selectedFunil?.nome}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Isso exclui também todas as etapas (colunas) desse funil. Só é possível excluir
                            um funil que não tenha nenhum negócio vinculado — mova ou exclua os negócios
                            dele antes, se houver. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteFunil}
                            disabled={deleteFunilMut.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteFunilMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

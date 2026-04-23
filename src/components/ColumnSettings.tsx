import React from 'react';
import { Settings2, Edit2, Check, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useColunasCustomizadas, useCreateColunaCustomizada, useDeleteColunaCustomizada } from '@/hooks/use-colunas-customizadas';

export interface ColumnDefinition {
    id: string;
    label: string;
    customLabel?: string;
    locked?: boolean;
    isCustom?: boolean;
}

interface ColumnSettingsProps {
    columns: ColumnDefinition[];
    visibleColumns: string[];
    onChange: (visibleColumns: string[]) => void;
    onRename?: (columnId: string, newLabel: string) => void;
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
    /** Nome da tabela para colunas customizadas (ex: 'pedidos', 'clientes') */
    tabela?: string;
    /** Texto exibido no trigger e no título da seção. Default: "Colunas" */
    label?: string;
    children?: React.ReactNode;
}

export function ColumnSettings({
    columns: initialColumns,
    visibleColumns,
    onChange,
    onRename,
    className,
    open,
    onOpenChange,
    hideTrigger,
    tabela,
    label = 'Colunas',
    children,
}: ColumnSettingsProps) {
    const { data: customColumns = [], isLoading: loadingCustom } = useColunasCustomizadas(tabela || '');
    const createCol = useCreateColunaCustomizada();
    const deleteCol = useDeleteColunaCustomizada();

    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [isAdding, setIsAdding] = React.useState(false);
    const [newName, setNewName] = React.useState('');

    const columns = React.useMemo(() => {
        const customMapped: ColumnDefinition[] = customColumns.map(c => ({
            id: c.slug,
            label: c.nome,
            isCustom: true
        }));
        return [...initialColumns, ...customMapped];
    }, [initialColumns, customColumns]);

    const toggleColumn = (columnId: string) => {
        if (visibleColumns.includes(columnId)) {
            if (visibleColumns.length > 1) {
                onChange(visibleColumns.filter(id => id !== columnId));
            }
        } else {
            const newVisible = columns
                .filter(c => visibleColumns.includes(c.id) || c.id === columnId)
                .map(c => c.id);
            onChange(newVisible);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !tabela) return;
        await createCol.mutateAsync({ tabela, nome: newName });
        setNewName('');
        setIsAdding(false);
    };

    const handleDelete = async (id: string, slug: string) => {
        if (!tabela) return;
        const customId = customColumns.find(c => c.slug === slug)?.id;
        if (!customId) return;
        await deleteCol.mutateAsync({ id: customId, tabela });
        if (visibleColumns.includes(slug)) {
            onChange(visibleColumns.filter(s => s !== slug));
        }
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-9 gap-2', hideTrigger && 'hidden', className)}
                >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Opções</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-auto p-0 max-h-[80vh] overflow-y-auto">
                <div className="p-2 min-w-[240px]">
                    <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {label}
                        </span>
                        {tabela && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5" 
                                onClick={() => setIsAdding(true)}
                                title="Nova coluna customizada"
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        )}
                    </div>

                    {isAdding && (
                        <div className="px-2 pb-2 space-y-2 animate-in fade-in slide-in-from-top-1">
                            <Input 
                                placeholder="Nome da nova coluna..." 
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="h-7 text-xs"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') setIsAdding(false);
                                }}
                            />
                            <div className="flex gap-1">
                                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleCreate} disabled={createCol.isPending}>
                                    {createCol.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Criar'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] flex-1" onClick={() => setIsAdding(false)}>
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-0.5">
                        {columns.map((column) => {
                            const checked = visibleColumns.includes(column.id);
                            const disabled = column.locked || (checked && visibleColumns.length === 1);
                            const isEditing = editingId === column.id;

                            return (
                                <div key={column.id} className="group flex items-center gap-1 pr-1">
                                    <button
                                        type="button"
                                        disabled={disabled || isEditing}
                                        onClick={() => !column.locked && toggleColumn(column.id)}
                                        className={cn(
                                            'flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal transition-colors text-left',
                                            'hover:bg-muted/60 disabled:cursor-not-allowed',
                                            !checked && !isEditing && 'opacity-40'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'h-2.5 w-2.5 rounded-full shrink-0',
                                                checked ? 'bg-primary' : 'bg-muted-foreground/40'
                                            )}
                                        />
                                        {isEditing ? (
                                            <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                <Input
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    className="h-6 text-[10px] py-0 px-1.5"
                                                    autoFocus
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            onRename?.(column.id, editValue);
                                                            setEditingId(null);
                                                        }
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <span className="flex-1 truncate">
                                                {column.customLabel || column.label}
                                                {column.isCustom && <span className="ml-1 opacity-50 text-[9px]">(Custom)</span>}
                                            </span>
                                        )}
                                    </button>
                                    
                                    {!isEditing && column.isCustom && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(column.id, column.id)}
                                            className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 flex items-center justify-center text-destructive transition-all"
                                            title="Excluir coluna"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}

                                    {!isEditing && onRename && !column.isCustom && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingId(column.id);
                                                setEditValue(column.customLabel || column.label);
                                            }}
                                            className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 hover:bg-muted flex items-center justify-center text-muted-foreground transition-all"
                                        >
                                            <Edit2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => onChange(columns.map(c => c.id))}
                        className="w-full text-center text-xs text-primary font-medium px-2 py-2 mt-1 rounded-md hover:bg-muted/60 transition-colors"
                    >
                        Resetar todas
                    </button>
                </div>
                {children}
            </PopoverContent>
        </Popover>
    );
}

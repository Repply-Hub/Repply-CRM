import React from 'react';
import { Settings2, Edit2, Check, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
    onAdd?: (label: string) => void;
    onRemove?: (columnId: string) => void;
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
    /** Se true, oculta a lista de colunas */
    hideColumns?: boolean;
    /** Texto exibido no trigger e no título da seção. Default: "Colunas" */
    label?: string;
    children?: React.ReactNode;
}

export function ColumnSettings({
    columns,
    visibleColumns,
    onChange,
    onRename,
    onAdd,
    onRemove,
    className,
    open,
    onOpenChange,
    hideTrigger,
    label = 'Colunas',
    hideColumns = false,
    children,
}: ColumnSettingsProps) {
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [newColumnLabel, setNewColumnLabel] = React.useState('');
    const [isAdding, setIsAdding] = React.useState(false);

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

    const startEditing = (column: ColumnDefinition) => {
        setEditingId(column.id);
        setEditValue(column.customLabel || column.label);
    };

    const handleRename = () => {
        if (editingId && onRename) {
            onRename(editingId, editValue);
            setEditingId(null);
        }
    };

    const handleAdd = () => {
        if (newColumnLabel.trim() && onAdd) {
            onAdd(newColumnLabel.trim());
            setNewColumnLabel('');
            setIsAdding(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-9 gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:border-primary', hideTrigger && 'hidden', className)}
                >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Opções</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-[260px] p-0">
                {!hideColumns && (
                    <div className="p-2">
                        <div className="px-2 py-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <span>{label}</span>
                            {onAdd && (
                                <button
                                    onClick={() => setIsAdding(!isAdding)}
                                    className="flex items-center gap-1 h-6 px-2 rounded-md hover:bg-muted text-primary transition-colors"
                                    title="Criar nova coluna"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-medium">Nova Coluna</span>
                                </button>
                            )}
                        </div>

                    {isAdding && onAdd && (
                        <div className="px-2 py-2 mb-2 bg-muted/40 rounded-md space-y-2">
                            <Input
                                placeholder="Nome da coluna..."
                                value={newColumnLabel}
                                onChange={e => setNewColumnLabel(e.target.value)}
                                className="h-7 text-xs"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleAdd();
                                    if (e.key === 'Escape') setIsAdding(false);
                                }}
                            />
                            <div className="flex gap-1.5">
                                <Button size="sm" className="h-6 flex-1 text-[10px]" onClick={handleAdd}>Adicionar</Button>
                                <Button size="sm" variant="ghost" className="h-6 flex-1 text-[10px]" onClick={() => setIsAdding(false)}>Cancelar</Button>
                            </div>
                        </div>
                    )}

                    <ScrollArea className="max-h-[300px] overflow-y-auto">
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
                                                            if (e.key === 'Enter') handleRename();
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                    />
                                                    <button 
                                                        onClick={handleRename}
                                                        className="h-5 w-5 rounded hover:bg-primary/20 flex items-center justify-center text-primary"
                                                    >
                                                        <Check className="h-3 w-3" />
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingId(null)}
                                                        className="h-5 w-5 rounded hover:bg-destructive/20 flex items-center justify-center text-destructive"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="flex-1 truncate">{column.customLabel || column.label}</span>
                                            )}
                                        </button>
                                        
                                        {!isEditing && (
                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                {onRename && (
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditing(column)}
                                                        className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
                                                        title="Renomear"
                                                    >
                                                        <Edit2 className="h-3 w-3" />
                                                    </button>
                                                )}
                                                {column.isCustom && onRemove && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onRemove(column.id)}
                                                        className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center text-destructive/70 hover:text-destructive"
                                                        title="Excluir"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <div className="pt-1 border-t border-border mt-1">
                        <button
                            type="button"
                            onClick={() => onChange(columns.map(c => c.id))}
                            className="w-full text-center text-[10px] text-primary font-medium px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                        >
                            Resetar todas
                        </button>
                    </div>
                </div>
                )}
                {children}
            </PopoverContent>
        </Popover>
    );
}

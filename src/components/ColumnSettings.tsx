import React from 'react';
import { Settings2, Edit2, Check, X, Plus, ChevronDown, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

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
    onReorder?: (startIndex: number, endIndex: number) => void;
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
    onReorder,
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

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        
        onReorder?.(result.source.index, result.destination.index);
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-9 gap-2.5 rounded-lg border-border/60 bg-background px-4 font-medium transition-all hover:border-primary/50 hover:bg-primary/[0.02] data-[state=open]:bg-primary/[0.04] data-[state=open]:text-primary data-[state=open]:border-primary/60 shadow-sm active:scale-[0.98]',
                        hideTrigger && 'hidden',
                        className
                    )}
                >
                    <Settings2 className="h-4 w-4 text-muted-foreground group-data-[state=open]:text-primary" />
                    <span className="hidden sm:inline">Opções</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[280px] p-0 shadow-2xl border-border/40 overflow-hidden">
                {!hideColumns && (
                    <div className="p-2">
                        <div className="px-4 py-3 flex items-center justify-between bg-muted/30 border-b border-border/50">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                            {onAdd && (
                                <button
                                    onClick={() => setIsAdding(!isAdding)}
                                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-full hover:bg-primary/10 text-primary transition-all active:scale-95 group"
                                    title="Criar nova coluna"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold">Nova Coluna</span>
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

                    <ScrollArea className="max-h-[320px] overflow-y-auto px-1.5 py-2">
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="columns">
                                {(provided) => (
                                    <div 
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-1"
                                    >
                                        {columns.map((column, index) => {
                                            const checked = visibleColumns.includes(column.id);
                                            const disabled = column.locked || (checked && visibleColumns.length === 1);
                                            const isEditing = editingId === column.id;

                                            return (
                                                <Draggable 
                                                    key={column.id} 
                                                    draggableId={column.id} 
                                                    index={index}
                                                >
                                                    {(provided, snapshot) => (
                                                        <div 
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            className={cn(
                                                                "group flex items-center gap-1 pr-1",
                                                                snapshot.isDragging && "z-50"
                                                            )}
                                                        >
                                                            <div 
                                                                {...provided.dragHandleProps}
                                                                className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                                            >
                                                                <GripVertical className="h-3.5 w-3.5" />
                                                            </div>

                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={() => !disabled && !isEditing && toggleColumn(column.id)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        if (!disabled && !isEditing) toggleColumn(column.id);
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    'flex-1 flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all text-left group/btn',
                                                                    snapshot.isDragging ? 'bg-accent' : 'hover:bg-muted/80',
                                                                    isEditing ? 'cursor-default' : 'cursor-pointer',
                                                                    disabled && 'cursor-not-allowed',
                                                                    !checked && !isEditing && 'opacity-50 grayscale-[0.5]'
                                                                )}
                                                            >
                                                                <div
                                                                    className={cn(
                                                                        'h-3.5 w-3.5 rounded-md shrink-0 flex items-center justify-center border transition-all duration-200',
                                                                        checked 
                                                                            ? 'bg-primary border-primary shadow-[0_2px_4px_rgba(var(--primary),0.3)]' 
                                                                            : 'bg-background border-border/60 group-hover/btn:border-primary/40'
                                                                    )}
                                                                >
                                                                    {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                                                                </div>
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
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleRename();
                                                                            }}
                                                                            className="h-5 w-5 rounded hover:bg-primary/20 flex items-center justify-center text-primary"
                                                                        >
                                                                            <Check className="h-3 w-3" />
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setEditingId(null);
                                                                            }}
                                                                            className="h-5 w-5 rounded hover:bg-destructive/20 flex items-center justify-center text-destructive"
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <span className="flex-1 truncate">{column.customLabel || column.label}</span>
                                                                )}
                                                            </div>
                                                            
                                                            {!isEditing && (
                                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {onRename && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                startEditing(column);
                                                                            }}
                                                                            className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
                                                                            title="Renomear"
                                                                        >
                                                                            <Edit2 className="h-3 w-3" />
                                                                        </button>
                                                                    )}
                                                                    {column.isCustom && onRemove && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                onRemove(column.id);
                                                                            }}
                                                                            className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center text-destructive/70 hover:text-destructive"
                                                                            title="Excluir"
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    )}
                                                                </div>
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
                    </ScrollArea>
                    <div className="p-1.5 bg-muted/20 border-t border-border/50">
                        <button
                            type="button"
                            onClick={() => onChange(columns.map(c => c.id))}
                            className="w-full text-center text-[11px] text-primary font-bold px-3 py-2 rounded-lg hover:bg-primary/10 transition-all active:scale-[0.98] uppercase tracking-wider"
                        >
                            Restaurar padrão
                        </button>
                    </div>
                </div>
                )}
                {children}
            </PopoverContent>
        </Popover>
    );
}

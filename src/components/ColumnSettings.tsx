import React, { memo, useEffect } from 'react';
import { Settings2, Edit2, Check, X, Plus, ChevronDown, GripVertical, Save, Trash2, FolderOpen, Type, Hash, Calendar, ToggleLeft, DollarSign, Filter, Eye, EyeOff, Columns3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


export type ColumnDataType = 'text' | 'number' | 'date' | 'boolean' | 'currency';

export interface ColumnDefinition {
    id: string;
    label: string;
    customLabel?: string;
    locked?: boolean;
    isCustom?: boolean;
    type?: ColumnDataType;
}

interface ColumnPreset {
    id: string;
    name: string;
}

interface ColumnSettingsProps {
    columns: ColumnDefinition[];
    visibleColumns: string[];
    onChange: (visibleColumns: string[]) => void;
    onRename?: (columnId: string, newLabel: string) => void;
    onTypeChange?: (columnId: string, type: ColumnDataType) => void;
    onAdd?: (label: string, type: ColumnDataType) => void;
    onRemove?: (columnId: string) => void;
    onReorder?: (startIndex: number, endIndex: number) => void;
    presets?: ColumnPreset[];
    onSavePreset?: (name: string) => void;
    onLoadPreset?: (id: string) => void;
    onDeletePreset?: (id: string) => void;
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

const DATA_TYPES: { value: ColumnDataType; label: string; icon: any }[] = [
    { value: 'text', label: 'Texto', icon: Type },
    { value: 'number', label: 'Número', icon: Hash },
    { value: 'date', label: 'Data', icon: Calendar },
    { value: 'boolean', label: 'Booleano', icon: ToggleLeft },
    { value: 'currency', label: 'Moeda', icon: DollarSign },
];

export const ColumnSettings = memo(function ColumnSettings({
    columns,
    visibleColumns,
    onChange,
    onRename,
    onTypeChange,
    onAdd,
    onRemove,
    onReorder,
    presets = [],
    onSavePreset,
    onLoadPreset,
    onDeletePreset,
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
    const [newColumnType, setNewColumnType] = React.useState<ColumnDataType>('text');
    const [isAdding, setIsAdding] = React.useState(false);
    const [newPresetName, setNewPresetName] = React.useState('');
    const [isSavingPreset, setIsSavingPreset] = React.useState(false);

    // Corrigir possíveis problemas de interação do dnd dentro de Popovers/ScrollAreas
    useEffect(() => {
        if (open) {
            const handleTouchMove = (e: TouchEvent) => {
                if (document.querySelector('[data-rbd-drag-handle-context-id]')) {
                    // Previne scroll durante o drag em mobile se necessário
                }
            };
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            return () => window.removeEventListener('touchmove', handleTouchMove);
        }
    }, [open]);

    const toggleColumn = (columnId: string) => {
        const column = columns.find(c => c.id === columnId);
        if (column?.locked) return;

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
            onAdd(newColumnLabel.trim(), newColumnType);
            setNewColumnLabel('');
            setNewColumnType('text');
            setIsAdding(false);
        }
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        
        // Passar os índices para a função de reordenação do hook
        onReorder?.(result.source.index, result.destination.index);
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-10 gap-2.5 rounded-lg border-border/60 bg-background px-4 font-medium transition-all hover:border-primary/50 hover:bg-primary/[0.02] data-[state=open]:bg-primary/[0.04] data-[state=open]:text-primary data-[state=open]:border-primary/60 shadow-sm active:scale-[0.98]',
                        hideTrigger && 'hidden',
                        className
                    )}
                >
                    <Settings2 className="h-4 w-4 text-muted-foreground group-data-[state=open]:text-primary" />
                    <span className="hidden sm:inline">Opções</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[200px] p-0 shadow-2xl border-border/40 z-[50] overflow-hidden">
                <div className="flex flex-col divide-y divide-border/50 overflow-hidden max-h-[min(calc(100vh-120px),700px)]">
                    {!hideColumns && (
                        <div className="w-full flex flex-col">
                            <Popover modal={false}>
                                <PopoverTrigger asChild>
                                    <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors group">
                                        <div className="flex items-center gap-2">
                                            <Columns3 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                                        </div>
                                        <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent side="left" align="start" sideOffset={5} className="w-[320px] p-0 shadow-2xl border-border/40 z-[60]">
                                    <div className="flex flex-col h-full max-h-[500px]">
                                        <div className="px-4 py-3 flex items-center justify-between bg-muted/30 border-b border-border/50 rounded-t-md">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                                            {onAdd && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsAdding(!isAdding);
                                                    }}
                                                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-full hover:bg-primary/10 text-primary transition-all active:scale-95 group"
                                                    title="Criar nova coluna"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    <span className="text-[10px] font-bold">Nova Coluna</span>
                                                </button>
                                            )}
                                        </div>

                                        {isAdding && onAdd && (
                                            <div className="px-2 py-2 mb-2 bg-muted/40 rounded-md space-y-2 m-2">
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
                                                <Select value={newColumnType} onValueChange={(val: ColumnDataType) => setNewColumnType(val)}>
                                                    <SelectTrigger className="h-7 text-xs">
                                                        <SelectValue placeholder="Tipo de dado" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {DATA_TYPES.map(type => (
                                                            <SelectItem key={type.value} value={type.value} className="text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <type.icon className="h-3 w-3" />
                                                                    {type.label}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <div className="flex gap-1.5">
                                                    <Button size="sm" className="h-6 flex-1 text-[10px]" onClick={handleAdd}>Adicionar</Button>
                                                    <Button size="sm" variant="ghost" className="h-6 flex-1 text-[10px]" onClick={() => setIsAdding(false)}>Cancelar</Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-1 overflow-y-auto px-1.5 py-2 custom-scrollbar min-h-0">
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
                                                                                    "group flex items-center gap-1 pr-1 outline-none",
                                                                                    snapshot.isDragging && "z-[9999]"
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
                                                                                        if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
                                                                                            e.preventDefault();
                                                                                            if (!disabled) toggleColumn(column.id);
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
                                                                                            'h-7 w-7 rounded-md shrink-0 flex items-center justify-center border transition-all duration-200',
                                                                                            checked 
                                                                                                ? 'bg-primary/10 border-primary/20 text-primary shadow-sm' 
                                                                                                : 'bg-background border-border/60 group-hover/btn:border-primary/40 text-muted-foreground'
                                                                                        )}
                                                                                    >
                                                                                        {checked ? (
                                                                                            <Eye className={cn("h-4 w-4", disabled && "opacity-50")} />
                                                                                        ) : (
                                                                                            <EyeOff className="h-4 w-4 opacity-40" />
                                                                                        )}
                                                                                    </div>
                                                                                    {isEditing ? (
                                                                                        <div className="flex-1 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                                                                                            <Input
                                                                                                value={editValue}
                                                                                                onChange={e => setEditValue(e.target.value)}
                                                                                                className="h-7 text-xs py-0 px-2"
                                                                                                autoFocus
                                                                                                onKeyDown={e => {
                                                                                                    if (e.key === 'Enter') handleRename();
                                                                                                    if (e.key === 'Escape') setEditingId(null);
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="flex-1 truncate">{column.customLabel || column.label}</span>
                                                                                    )}
                                                                                    {!column.locked && onRename && !isEditing && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                startEditing(column);
                                                                                            }}
                                                                                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors opacity-0 group-hover/btn:opacity-100"
                                                                                        >
                                                                                            <Edit2 className="h-3 w-3" />
                                                                                        </button>
                                                                                    )}
                                                                                    {column.isCustom && onRemove && !isEditing && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                onRemove(column.id);
                                                                                            }}
                                                                                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors opacity-0 group-hover/btn:opacity-100"
                                                                                        >
                                                                                            <Trash2 className="h-3 w-3" />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
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
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    {(onSavePreset || presets.length > 0) && (
                        <div className="w-full flex flex-col">
                            <Popover modal={false}>
                                <PopoverTrigger asChild>
                                    <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors group border-t border-border/50">
                                        <div className="flex items-center gap-2">
                                            <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Modelos</span>
                                        </div>
                                        <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent side="left" align="start" sideOffset={5} className="w-[280px] p-0 shadow-2xl border-border/40 z-[60] bg-background">
                                    <div className="flex flex-col h-full">
                                        <div className="px-4 py-3 flex items-center justify-between bg-muted/30 border-b border-border/50 rounded-t-md">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Modelos</span>
                                            {onSavePreset && !isSavingPreset && (
                                                <button
                                                    onClick={() => setIsSavingPreset(true)}
                                                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                                >
                                                    <Save className="h-3 w-3" /> Salvar atual
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-2 flex-1 overflow-hidden flex flex-col space-y-3">
                                            {isSavingPreset && (
                                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <Input
                                                        placeholder="Nome do modelo..."
                                                        value={newPresetName}
                                                        onChange={e => setNewPresetName(e.target.value)}
                                                        className="h-8 text-xs bg-background"
                                                        autoFocus
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && newPresetName.trim()) {
                                                                onSavePreset?.(newPresetName);
                                                                setNewPresetName('');
                                                                setIsSavingPreset(false);
                                                            }
                                                            if (e.key === 'Escape') setIsSavingPreset(false);
                                                        }}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button 
                                                            size="sm" 
                                                            className="h-7 flex-1 text-[10px]" 
                                                            onClick={() => {
                                                                if (newPresetName.trim()) {
                                                                    onSavePreset?.(newPresetName);
                                                                    setNewPresetName('');
                                                                    setIsSavingPreset(false);
                                                                }
                                                            }}
                                                        >
                                                            Confirmar
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="h-7 flex-1 text-[10px]" 
                                                            onClick={() => setIsSavingPreset(false)}
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {presets.length > 0 && (
                                                <ScrollArea className="flex-1 max-h-[250px] pr-2">
                                                    <div className="space-y-1">
                                                        {presets.map(preset => (
                                                            <div key={preset.id} className="group flex items-center gap-1">
                                                                <button
                                                                    onClick={() => onLoadPreset?.(preset.id)}
                                                                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs font-medium rounded-md hover:bg-primary/5 hover:text-primary transition-colors text-left"
                                                                >
                                                                    <FolderOpen className="h-3 w-3 opacity-50" />
                                                                    <span className="truncate">{preset.name}</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => onDeletePreset?.(preset.id)}
                                                                    className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 flex items-center justify-center text-destructive/70 transition-all"
                                                                    title="Excluir modelo"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            )}
                                        </div>

                                        <div className="mt-auto p-1.5 bg-muted/20 border-t border-border/50 rounded-b-md">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="w-full text-center text-[11px] text-primary font-bold px-3 py-2 rounded-lg hover:bg-primary/10 transition-all active:scale-[0.98] uppercase tracking-wider"
                                                    >
                                                        Restaurar padrão
                                                    </button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Restaurar padrão?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Isso irá reexibir todas as colunas disponíveis para esta tabela.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => onChange(columns.map(c => c.id))}>
                                                            Confirmar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                    {children && (
                        <div className="w-full flex flex-col">
                            <Popover modal={false}>
                                <PopoverTrigger asChild>
                                    <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors group border-t border-border/50">
                                        <div className="flex items-center gap-2">
                                            <Settings2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Menu de Opções</span>
                                        </div>
                                        <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent side="left" align="start" sideOffset={5} className="w-[300px] p-0 shadow-2xl border-border/40 z-[60] bg-background">
                                    <div className="flex flex-col h-full max-h-[500px]">
                                        <div className="px-4 py-3 bg-muted/30 border-b border-border/50">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Menu de Opções</span>
                                        </div>
                                        <div className="overflow-y-auto custom-scrollbar p-1">
                                            {children}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});

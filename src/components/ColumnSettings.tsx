import React from 'react';
import { Settings2, Edit2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ColumnDefinition {
    id: string;
    label: string;
    customLabel?: string;
    locked?: boolean;
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
    /** Texto exibido no trigger e no título da seção. Default: "Colunas" */
    label?: string;
    children?: React.ReactNode;
}

export function ColumnSettings({
    columns,
    visibleColumns,
    onChange,
    onRename,
    className,
    open,
    onOpenChange,
    hideTrigger,
    label = 'Colunas',
}: ColumnSettingsProps) {
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

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
            <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
                <div className="p-2 min-w-[220px]">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {label}
                    </div>
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
                                    
                                    {!isEditing && onRename && (
                                        <button
                                            type="button"
                                            onClick={() => startEditing(column)}
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
            </PopoverContent>
        </Popover>
    );
}

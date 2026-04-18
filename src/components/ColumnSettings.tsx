import React from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ColumnDefinition {
    id: string;
    label: string;
    locked?: boolean;
}

interface ColumnSettingsProps {
    columns: ColumnDefinition[];
    visibleColumns: string[];
    onChange: (visibleColumns: string[]) => void;
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
    /** Texto exibido no trigger e no título da seção. Default: "Colunas" */
    label?: string;
}

export function ColumnSettings({
    columns,
    visibleColumns,
    onChange,
    className,
    open,
    onOpenChange,
    hideTrigger,
    label = 'Colunas',
}: ColumnSettingsProps) {
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
                            return (
                                <button
                                    key={column.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => !column.locked && toggleColumn(column.id)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal transition-colors text-left',
                                        'hover:bg-muted/60 disabled:cursor-not-allowed',
                                        !checked && 'opacity-40'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'h-2.5 w-2.5 rounded-full shrink-0',
                                            checked ? 'bg-primary' : 'bg-muted-foreground/40'
                                        )}
                                    />
                                    <span className="flex-1 truncate">{column.label}</span>
                                </button>
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

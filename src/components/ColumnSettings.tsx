import React from 'react';
import { Settings2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ColumnDefinition {
    id: string;
    label: string;
    locked?: boolean; // Se verdadeiro, não pode ser ocultada
}

interface ColumnSettingsProps {
    columns: ColumnDefinition[];
    visibleColumns: string[];
    onChange: (visibleColumns: string[]) => void;
    className?: string;
}

export function ColumnSettings({ columns, visibleColumns, onChange, className }: ColumnSettingsProps) {
    const toggleColumn = (columnId: string) => {
        if (visibleColumns.includes(columnId)) {
            // Evitar que todas as colunas sejam removidas (opcional, mas bom)
            if (visibleColumns.length > 1) {
                onChange(visibleColumns.filter(id => id !== columnId));
            }
        } else {
            // Manter a ordem original conforme definido em 'columns'
            const newVisible = columns
                .filter(c => visibleColumns.includes(c.id) || c.id === columnId)
                .map(c => c.id);
            onChange(newVisible);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 gap-2", className)}>
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Colunas</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="font-medium text-sm leading-none">Exibir Colunas</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 text-[10px] text-primary hover:bg-transparent"
                            onClick={() => onChange(columns.map(c => c.id))}
                        >
                            Resetar
                        </Button>
                    </div>
                    <div className="grid gap-2">
                        {columns.map((column) => (
                            <div
                                key={column.id}
                                className={cn(
                                    "flex items-center space-x-2 rounded-md p-1 transition-colors hover:bg-muted/50",
                                    column.locked && "opacity-60 cursor-not-allowed"
                                )}
                            >
                                <Checkbox
                                    id={`col-${column.id}`}
                                    checked={visibleColumns.includes(column.id)}
                                    onCheckedChange={() => !column.locked && toggleColumn(column.id)}
                                    disabled={column.locked}
                                />
                                <Label
                                    htmlFor={`col-${column.id}`}
                                    className="text-xs font-normal flex-1 cursor-pointer select-none"
                                >
                                    {column.label}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

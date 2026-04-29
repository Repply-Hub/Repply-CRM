import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterButtonProps {
  hasFilters: boolean;
  activeFilterCount?: number;
  onClear?: () => void;
  children: React.ReactNode;
  className?: string;
  popoverClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function FilterButton({
  hasFilters,
  activeFilterCount,
  onClear,
  children,
  className,
  popoverClassName,
  align = 'end',
}: FilterButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={cn("h-10 gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", hasFilters && "border-primary", className)}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {hasFilters && activeFilterCount !== undefined && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4">
              {activeFilterCount}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-auto shadow-2xl border-border/40 overflow-hidden", popoverClassName)} align={align}>
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm leading-none">Filtros</h4>
            </div>
            {hasFilters && onClear && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClear}
                className="h-7 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 transition-all uppercase tracking-wider"
              >
                Limpar
                <X className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="p-4">
            {children}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

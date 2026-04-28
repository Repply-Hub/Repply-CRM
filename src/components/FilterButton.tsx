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
          className={cn("h-10 gap-2", hasFilters && "border-primary", className)}
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
      <PopoverContent className={cn("p-4", popoverClassName)} align={align}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium leading-none">Filtros</h4>
            {hasFilters && onClear && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClear}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
              >
                Limpar
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

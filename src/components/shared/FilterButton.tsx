import React, { memo } from 'react';
import { Filter, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StandardPopoverMenu, StandardMenuItem } from '@/components/ui/standard-popover-menu';

interface FilterButtonProps {
  hasFilters: boolean;
  activeFilterCount?: number;
  onClear?: () => void;
  children: React.ReactNode;
  className?: string;
  popoverClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export const FilterButton = memo(function FilterButton({
  hasFilters,
  activeFilterCount,
  onClear,
  children,
  className,
  popoverClassName,
  align = 'end',
}: FilterButtonProps) {
  return (
    <StandardPopoverMenu
      label="Filtros"
      icon={Filter}
      variant="trigger"
      align={align}
      side="bottom"
      sideOffset={8}
      badge={hasFilters ? activeFilterCount : undefined}
      className={cn(hasFilters && "border-primary/50", className)}
      popoverClassName={cn("w-auto", popoverClassName)}
    >
      <div className="flex flex-col">
        {children}
        
        {hasFilters && onClear && (
          <div className="px-1 pt-1 border-t border-border/50">
            <StandardMenuItem
              label="Limpar filtros"
              icon={Trash2}
              variant="destructive"
              onClick={onClear}
            />
          </div>
        )}
      </div>
    </StandardPopoverMenu>
  );
});

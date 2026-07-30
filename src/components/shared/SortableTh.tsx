import { memo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

interface SortableThProps {
  label: React.ReactNode;
  sortKey: string;
  currentSortKey: string | null;
  currentDirection: SortDirection;
  onSort: (key: string, direction: SortDirection) => void;
  ascLabel?: string;
  descLabel?: string;
  className?: string;
}

// Cabeçalho de coluna clicável (ícone chevron-down) que abre um dropdown para
// escolher critério de ordenação daquela coluna — substitui o antigo filtro
// global de "Ordenação" em Clientes (empresas/contatos) e Obras.
export const SortableTh = memo(function SortableTh({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  ascLabel = 'Ordenar A-Z',
  descLabel = 'Ordenar Z-A',
  className,
}: SortableThProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <th className={cn('text-left py-3 px-4 font-semibold text-muted-foreground text-xs whitespace-nowrap', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-foreground hover:bg-muted/60 transition-colors',
              isActive && 'text-foreground',
            )}
          >
            {label}
            <ChevronDown className={cn('h-3 w-3 shrink-0', isActive && 'text-primary')} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem className="gap-2" onClick={() => onSort(sortKey, 'asc')}>
            <Check className={cn('h-3.5 w-3.5 shrink-0', !(isActive && currentDirection === 'asc') && 'opacity-0')} />
            {ascLabel}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => onSort(sortKey, 'desc')}>
            <Check className={cn('h-3.5 w-3.5 shrink-0', !(isActive && currentDirection === 'desc') && 'opacity-0')} />
            {descLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  );
});

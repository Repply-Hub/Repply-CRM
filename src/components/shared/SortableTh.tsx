import { memo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useColumnResize } from '@/hooks/use-column-resize';

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
  /** Largura atual em pixels (redimensionável, estilo Excel) — ausente = largura automática.
   *  A tabela em volta precisa de `table-layout: fixed` pra largura do <th> valer nas linhas. */
  width?: number;
  onResize?: (width: number) => void;
  minWidth?: number;
}

// Cabeçalho de coluna clicável (ícone chevron-down) que abre um dropdown para
// escolher critério de ordenação daquela coluna — substitui o antigo filtro
// global de "Ordenação" em Clientes (empresas/contatos) e Obras. Opcionalmente também
// redimensionável (arrastando a borda direita), quando `onResize` é passado.
export const SortableTh = memo(function SortableTh({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  ascLabel = 'Ordenar A-Z',
  descLabel = 'Ordenar Z-A',
  className,
  width,
  onResize,
  minWidth = 60,
}: SortableThProps) {
  const isActive = currentSortKey === sortKey;
  const { dragging, handlePointerDown } = useColumnResize(width, onResize ?? (() => {}), minWidth);

  return (
    <th
      className={cn('relative text-left h-14 px-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap', className)}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-foreground hover:bg-muted/60 transition-colors max-w-full',
              isActive && 'text-foreground',
            )}
          >
            <span className="truncate">{label}</span>
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
      {onResize && (
        <span
          onPointerDown={handlePointerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar coluna"
          className={cn(
            'absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none',
            'hover:bg-primary/50 active:bg-primary/70',
            dragging && 'bg-primary/70',
          )}
        />
      )}
    </th>
  );
});

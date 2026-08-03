import { cn } from '@/lib/utils';
import { useColumnResize } from '@/hooks/use-column-resize';

interface ResizableThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Largura atual em pixels. Ausente/undefined = largura automática (padrão do navegador). */
  width?: number;
  /** Chamado continuamente durante o arraste, já com o valor final em pixels (clampado ao mínimo). */
  onResize: (width: number) => void;
  minWidth?: number;
}

// Cabeçalho de coluna com uma alça de redimensionamento na borda direita, estilo
// Excel/Planilhas. Renderiza um <th> com as mesmas classes base do TableHead (src/components/ui/
// table.tsx) pra ficar visualmente identico nas tabelas que usam o componente shadcn e nas que
// usam <table>/<th> puro (Clientes.tsx, Obras.tsx).
//
// Importante: a tabela em volta precisa de `table-layout: fixed` (classe `table-fixed`) — em
// layout automático (padrão do HTML) o navegador redimensiona colunas com base no conteúdo de
// TODAS as linhas, ignorando a largura do <th>.
export function ResizableTh({ width, onResize, minWidth = 60, className, style, children, ...props }: ResizableThProps) {
  const { dragging, handlePointerDown } = useColumnResize(width, onResize, minWidth);

  return (
    <th
      className={cn(
        'relative h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      style={width ? { ...style, width, minWidth: width, maxWidth: width } : style}
      {...props}
    >
      <div className="truncate">{children}</div>
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
    </th>
  );
}

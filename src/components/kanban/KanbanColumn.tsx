import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droppable } from '@hello-pangea/dnd';
import { Plus, ChevronDown } from 'lucide-react';
import { KanbanCard } from './KanbanCard';
import { Order, KanbanStage } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface KanbanColumnProps {
  stageKey: KanbanStage;
  label: string;
  colorClass: string;
  orders: Order[];
  onCardClick?: (id: string) => void;
  visibleColumns?: string[];
  columns?: any[];
}

const ITEMS_PER_PAGE = 4;

export const KanbanColumn = memo(function KanbanColumn({ stageKey, label, colorClass, orders = [], onCardClick, visibleColumns, columns }: KanbanColumnProps) {
  const safeColor = typeof colorClass === 'string' ? colorClass : 'muted';
  const safeLabel = typeof label === 'string' ? label : String(label ?? '');
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const total = orders.reduce((acc, o) => acc + o.valor, 0);

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = orders.length > visibleCount;

  const loadMore = () => {
    setVisibleCount(prev => prev + ITEMS_PER_PAGE);
  };

  return (
    <div className="flex flex-col h-full w-52 sm:w-64 lg:w-72 min-w-[208px] sm:min-w-[256px] lg:min-w-[288px] shrink-0">
      <div className="flex items-center gap-2.5 mb-1 px-1 shrink-0">
        <div className={cn('h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-background', `bg-${safeColor}`, `ring-${safeColor}/30`)} />
        <h3 className="text-sm font-bold text-foreground tracking-tight">{safeLabel}</h3>
        <span className="ml-auto text-[11px] font-semibold bg-secondary text-secondary-foreground px-2.5 py-0.5 rounded-full tabular-nums">
          {orders.length}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground mb-2 px-1 tabular-nums shrink-0">
        {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            role="list"
            aria-label={`Coluna ${safeLabel}`}
            className={cn(
              'flex-1 min-h-0 overflow-y-auto rounded-xl p-2 transition-all duration-300 ease-out',
              snapshot.isDraggingOver
                ? 'bg-primary/[0.08] ring-2 ring-primary/20 ring-dashed shadow-inner'
                : 'bg-muted/40',
            )}
          >
            {snapshot.isDraggingOver && orders.length === 0 && (
              <div className="flex items-center justify-center h-20 text-xs text-primary/60 font-medium animate-fade-in">
                Solte aqui para mover
              </div>
            )}
            {visibleOrders.map((order, idx) => (
              <KanbanCard key={order.id} order={order} index={idx} onClick={onCardClick} visibleColumns={visibleColumns} columns={columns} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={loadMore}
          className="mt-2 shrink-0 w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:bg-primary/5 border-primary/20"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Ver mais ({orders.length - visibleCount})
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/pedidos/novo?status=${encodeURIComponent(stageKey)}`)}
        className="mt-2 shrink-0 w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 border border-dashed border-border/60 hover:border-border"
      >
        <Plus className="h-3.5 w-3.5" />
        Novo Pedido
      </Button>
    </div>
  );
});

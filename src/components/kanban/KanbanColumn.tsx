import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { KanbanCard } from './KanbanCard';
import { Order, KanbanStage } from '@/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
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

export const KanbanColumn = memo(function KanbanColumn({ stageKey, label, colorClass, orders, onCardClick, visibleColumns, columns }: KanbanColumnProps) {
  const navigate = useNavigate();
  const total = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <div className="flex flex-col w-64 sm:w-72 min-w-[256px] sm:min-w-[288px] shrink-0 max-h-[calc(100vh-180px)] sm:max-h-[calc(100vh-220px)]">
      <div className="flex items-center gap-2.5 mb-1 px-1">
        <div className={cn('h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-background', `bg-${colorClass}`, `ring-${colorClass}/30`)} />
        <h3 className="text-sm font-bold text-foreground tracking-tight">{label}</h3>
        <span className="ml-auto text-[11px] font-semibold bg-secondary text-secondary-foreground px-2.5 py-0.5 rounded-full tabular-nums">
          {orders.length}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground mb-3 px-1 tabular-nums">
        {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <ScrollArea className="flex-1 min-h-0">
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              role="list"
              aria-label={`Coluna ${label}`}
              className={cn(
                'rounded-xl p-2 min-h-[200px] transition-all duration-300 ease-out',
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
              {orders.map((order, idx) => (
                <KanbanCard key={order.id} order={order} index={idx} onClick={onCardClick} visibleColumns={visibleColumns} columns={columns} />
              ))}
              {provided.placeholder}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/pedidos/novo?status=${encodeURIComponent(stageKey)}`)}
                className="mt-2 w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 border border-dashed border-border/60 hover:border-border"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Pedido
              </Button>
            </div>
          </ScrollArea>
        )}
      </Droppable>
    </div>
  );
});

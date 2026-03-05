import { Droppable } from '@hello-pangea/dnd';
import { KanbanCard } from './KanbanCard';
import { Order, KanbanStage } from '@/types';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  stageKey: KanbanStage;
  label: string;
  colorClass: string;
  orders: Order[];
}

export function KanbanColumn({ stageKey, label, colorClass, orders }: KanbanColumnProps) {
  const total = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <div className="flex flex-col w-72 min-w-[288px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn('h-2.5 w-2.5 rounded-full', `bg-${colorClass}`)} />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="ml-auto text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
          {orders.length}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-3 px-1">
        {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 rounded-xl p-2 min-h-[200px] transition-colors',
              snapshot.isDraggingOver ? 'bg-primary/5' : 'bg-muted/50'
            )}
          >
            {orders.map((order, idx) => (
              <KanbanCard key={order.id} order={order} index={idx} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

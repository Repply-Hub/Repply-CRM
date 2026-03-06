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
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 rounded-xl p-2 min-h-[200px] transition-all duration-200',
              snapshot.isDraggingOver ? 'bg-primary/[0.06] ring-1 ring-primary/15' : 'bg-muted/40'
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

import { Draggable } from '@hello-pangea/dnd';
import { AlertTriangle, Building2, Factory, DollarSign } from 'lucide-react';
import { Order } from '@/types';
import { cn } from '@/lib/utils';

interface KanbanCardProps {
  order: Order;
  index: number;
}

export function KanbanCard({ order, index }: KanbanCardProps) {
  const isAlert = order.daysInStage >= order.alertDays;

  return (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            'bg-card rounded-lg p-4 shadow-sm border border-border mb-3 transition-shadow',
            snapshot.isDragging && 'shadow-lg ring-2 ring-primary/30',
            isAlert && 'border-destructive/50'
          )}
        >
          {isAlert && (
            <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mb-2">
              <AlertTriangle className="h-3 w-3" />
              {order.daysInStage} dias nesta etapa
            </div>
          )}
          <h4 className="font-semibold text-sm text-card-foreground">{order.clientName}</h4>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {order.obra}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Factory className="h-3 w-3" />
              {order.fabricante}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
              <DollarSign className="h-3 w-3" />
              {order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {order.vendedor}
            </span>
            {!isAlert && (
              <span className="text-[10px] text-muted-foreground">{order.daysInStage}d</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

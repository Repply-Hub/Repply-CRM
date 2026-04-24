import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Factory, DollarSign, GripVertical } from 'lucide-react';
import { Order } from '@/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface KanbanCardProps {
  order: Order;
  index: number;
}

export const KanbanCard = memo(function KanbanCard({ order, index, onClick }: KanbanCardProps & { onClick?: (id: string) => void }) {
  const navigate = useNavigate();
  const isAlert = order.daysInStage >= order.alertDays;

  return (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <TooltipProvider delayDuration={600}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                role="listitem"
                aria-roledescription="item arrastável"
                aria-label={`Pedido de ${order.clientName}, ${order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                className={cn(
                  'bg-card rounded-xl p-4 shadow-card border border-border/60 mb-3 group relative',
                  'transition-all duration-200 ease-out',
                  'cursor-pointer',
                  snapshot.isDragging && 'shadow-brand ring-2 ring-primary/30 rotate-[1.5deg] scale-[1.03] z-50 opacity-95 cursor-grabbing',
                  isAlert && 'border-destructive/40 bg-destructive/[0.02]',
                  !snapshot.isDragging && 'hover:shadow-card-hover hover:border-border hover:-translate-y-0.5'
                )}
                style={{
                  ...provided.draggableProps.style,
                  transition: snapshot.isDragging
                    ? provided.draggableProps.style?.transition
                    : 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
                onClick={() => navigate(`/pedidos/${order.id}/editar`)}
              >
                {/* Drag grip indicator - this is the drag handle */}
                <div
                  {...provided.dragHandleProps}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'absolute top-3 right-2 text-muted-foreground/30 transition-opacity duration-150 cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-muted/60',
                    'group-hover:text-muted-foreground/60',
                    snapshot.isDragging && 'text-primary/50'
                  )}
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                {isAlert && (
                  <div className="flex items-center gap-1.5 text-destructive text-[11px] font-semibold mb-2.5 bg-destructive/10 rounded-md px-2 py-1 w-fit">
                    <AlertTriangle className="h-3 w-3" />
                    {order.daysInStage} dias nesta etapa
                  </div>
                )}
                <h4 className="font-semibold text-sm text-card-foreground leading-snug pr-5">{order.clientName}</h4>
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{order.obra}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Factory className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{order.fabricante}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                    <DollarSign className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    {order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {order.vendedor}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isAlert && (
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">{order.daysInStage}d</span>
                    )}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Arraste para mover entre etapas
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Draggable>
  );
});

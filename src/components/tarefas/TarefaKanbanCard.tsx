import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { AlertTriangle, Calendar, GripVertical, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tarefa } from '@/hooks/use-tarefas';

interface TarefaKanbanCardProps {
  tarefa: Tarefa;
  index: number;
  onClick?: (tarefa: Tarefa) => void;
}

export const TarefaKanbanCard = memo(function TarefaKanbanCard({ tarefa, index, onClick }: TarefaKanbanCardProps) {
  const isOverdue = !!tarefa.prazo_final && new Date(tarefa.prazo_final) < new Date() && tarefa.status !== 'concluida';

  return (
    <Draggable draggableId={tarefa.id} index={index}>
      {(provided, snapshot) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              role="listitem"
              aria-roledescription="item arrastável"
              aria-label={`Tarefa ${tarefa.titulo}`}
              className={cn(
                'bg-card rounded-xl p-3 shadow-card border border-border/60 mb-2 group relative',
                'transition-all duration-200 ease-out cursor-pointer',
                snapshot.isDragging && 'shadow-brand ring-2 ring-primary/30 rotate-[1.5deg] scale-[1.03] z-50 opacity-95 cursor-grabbing',
                isOverdue && 'border-destructive/40 bg-destructive/[0.02]',
                !snapshot.isDragging && 'hover:shadow-card-hover hover:border-border hover:-translate-y-0.5'
              )}
              style={{
                ...provided.draggableProps.style,
                transition: snapshot.isDragging
                  ? provided.draggableProps.style?.transition
                  : 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
              onClick={() => onClick?.(tarefa)}
            >
              <div
                {...provided.dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute top-2.5 right-1.5 text-muted-foreground/30 transition-opacity duration-150 cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-muted/60',
                  'group-hover:text-muted-foreground/60',
                  snapshot.isDragging && 'text-primary/50'
                )}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </div>

              {isOverdue && (
                <div className="flex items-center gap-1 text-destructive text-[10px] font-semibold mb-2 bg-destructive/10 rounded-md px-1.5 py-0.5 w-fit">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Atrasada
                </div>
              )}

              <h4 className="font-semibold text-xs sm:text-sm text-card-foreground leading-snug pr-5">{tarefa.titulo}</h4>

              <div className="mt-2 space-y-1">
                {tarefa.projeto && (
                  <div className="text-[11px] text-muted-foreground truncate">{tarefa.projeto}</div>
                )}
                {tarefa.prazo_final && (
                  <div className={cn('flex items-center gap-1.5 text-[11px]', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    <Calendar className="h-3 w-3 shrink-0" />
                    {format(new Date(tarefa.prazo_final), 'dd/MM/yyyy', { locale: ptBR })}
                  </div>
                )}
              </div>

              {tarefa.responsavel && (
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-1.5">
                  <User className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground truncate">
                    {tarefa.responsavel}
                  </span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Arraste para mover entre status
          </TooltipContent>
        </Tooltip>
      )}
    </Draggable>
  );
});

import { memo } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TarefaKanbanCard } from './TarefaKanbanCard';
import { Tarefa } from '@/hooks/use-tarefas';

interface TarefaKanbanColumnProps {
  stageKey: string;
  label: string;
  colorClass: string;
  tarefas: Tarefa[];
  onCardClick?: (tarefa: Tarefa) => void;
  onAddTarefa?: (stageKey: string) => void;
}

export const TarefaKanbanColumn = memo(function TarefaKanbanColumn({ stageKey, label, colorClass, tarefas, onCardClick, onAddTarefa }: TarefaKanbanColumnProps) {
  return (
    <div className="flex flex-col h-full flex-1 min-w-[240px] sm:min-w-[260px] max-w-sm shrink-0">
      <div className="flex items-center gap-2.5 mb-2 px-1 shrink-0">
        <div className={cn('h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-background', `bg-${colorClass}`, `ring-${colorClass}/30`)} />
        <h3 className="text-sm font-bold text-foreground tracking-tight">{label}</h3>
        <span className="ml-auto text-[11px] font-semibold bg-secondary text-secondary-foreground px-2.5 py-0.5 rounded-full tabular-nums">
          {tarefas.length}
        </span>
      </div>
      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            role="list"
            aria-label={`Coluna ${label}`}
            className={cn(
              'flex-1 min-h-0 overflow-y-auto rounded-xl p-2 transition-all duration-300 ease-out',
              snapshot.isDraggingOver
                ? 'bg-primary/[0.08] ring-2 ring-primary/20 ring-dashed shadow-inner'
                : 'bg-muted/40',
            )}
          >
            {snapshot.isDraggingOver && tarefas.length === 0 && (
              <div className="flex items-center justify-center h-20 text-xs text-primary/60 font-medium animate-fade-in">
                Solte aqui para mover
              </div>
            )}
            {tarefas.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/60">
                Nenhuma tarefa
              </div>
            )}
            {tarefas.map((tarefa, idx) => (
              <TarefaKanbanCard key={tarefa.id} tarefa={tarefa} index={idx} onClick={onCardClick} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddTarefa?.(stageKey)}
        className="mt-2 shrink-0 w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 border border-dashed border-border/60 hover:border-border"
      >
        <Plus className="h-3.5 w-3.5" />
        Nova Tarefa
      </Button>
    </div>
  );
});

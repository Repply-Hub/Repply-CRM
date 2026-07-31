import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Factory, DollarSign, GripVertical, User, CalendarIcon, FileText, StickyNote } from 'lucide-react';
import { Order } from '@/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface KanbanCardProps {
  order: Order;
  index: number;
  visibleColumns?: string[];
  columns?: any[];
  stageLabel?: string;
  stageColorClass?: string;
}

const formatDate = (value: string) => {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
};

export const KanbanCard = memo(function KanbanCard({ order, index, onClick, visibleColumns, columns, stageLabel, stageColorClass }: KanbanCardProps & { onClick?: (id: string) => void }) {
  const navigate = useNavigate();
  const isAlert = order.daysInStage >= order.alertDays;

  return (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                id={`kanban-card-${order.id}`}
                ref={provided.innerRef}
                {...provided.draggableProps}
                role="listitem"
                aria-roledescription="item arrastável"
                aria-label={`Negócio de ${order.clientName}, ${order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                className={cn(
                  'bg-card rounded-xl p-3 shadow-card border border-border/60 mb-2 group relative',
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
                onClick={() => onClick ? onClick(order.id) : navigate(`/pedidos/${order.id}/editar`)}
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

                {isAlert && (
                  <div className="flex items-center gap-1 text-destructive text-[10px] font-semibold mb-2 bg-destructive/10 rounded-md px-1.5 py-0.5 w-fit">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {order.daysInStage} dias nesta etapa
                  </div>
                )}

                {(!visibleColumns || visibleColumns.includes('negocio') || visibleColumns.includes('cliente')) && (
                  <h4 className="font-semibold text-xs sm:text-sm text-card-foreground leading-snug pr-5">{order.clientName}</h4>
                )}

                {(!visibleColumns || visibleColumns.includes('marcador') || visibleColumns.includes('etapa')) && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {order.marcador && (!visibleColumns || visibleColumns.includes('marcador')) && (
                      <span className={cn('inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white', `bg-${order.marcador.cor}`)}>
                        {order.marcador.nome}
                      </span>
                    )}
                    {stageLabel && (!visibleColumns || visibleColumns.includes('etapa')) && (
                      <span className={cn('inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white', `bg-${stageColorClass || 'muted-foreground'}`)}>
                        {stageLabel}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-2 space-y-1">
                  {(!visibleColumns || visibleColumns.includes('endereco_entrega')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">{order.obra}</span>
                    </div>
                  )}
                  {(!visibleColumns || visibleColumns.includes('fabricante')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Factory className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">{order.fabricante}</span>
                    </div>
                  )}
                  {order.contato && (!visibleColumns || visibleColumns.includes('contato')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <User className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">{order.contato}</span>
                    </div>
                  )}
                  {(!visibleColumns || visibleColumns.includes('valor')) && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                      <DollarSign className="h-3 w-3 shrink-0 text-primary/70" />
                      {order.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  )}
                  {(!visibleColumns || visibleColumns.includes('data_pedido')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">Criado em {formatDate(order.createdAt)}</span>
                    </div>
                  )}
                  {order.prazoResposta && (!visibleColumns || visibleColumns.includes('prazo_resposta')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">Fechamento {formatDate(order.prazoResposta)}</span>
                    </div>
                  )}
                  {order.observacoes && (!visibleColumns || visibleColumns.includes('observacoes')) && (
                    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/70" />
                      <span className="line-clamp-2">{order.observacoes}</span>
                    </div>
                  )}
                  {order.pdfUrl && (!visibleColumns || visibleColumns.includes('anexo')) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">Anexo disponível</span>
                    </div>
                  )}

                  {columns?.filter(col =>
                    visibleColumns?.includes(col.id) &&
                    !['negocio', 'cliente', 'obra', 'endereco_entrega', 'contato', 'fabricante', 'valor', 'vendedor', 'data_pedido', 'etapa', 'marcador', 'observacoes', 'acoes', 'anexo', 'pdf_url'].includes(col.id)
                  ).map(col => {
                    const value = order.campos_extras?.[col.id] || order.campos_extras?.[col.label];
                    if (!value) return null;
                    return (
                      <div key={col.id} className="text-[10px] text-muted-foreground/80 flex gap-1.5 items-center">
                        <span className="font-medium truncate max-w-[70px]">{col.customLabel || col.label}:</span>
                        <span className="truncate">{value}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
                  {(!visibleColumns || visibleColumns.includes('vendedor')) && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {order.vendedor}
                    </span>
                  )}
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
        </>
      )}
    </Draggable>
  );
});

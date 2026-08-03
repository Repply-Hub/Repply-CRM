import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droppable } from '@hello-pangea/dnd';
import { Plus, ChevronDown, Loader2 } from 'lucide-react';
import { KanbanCard } from './KanbanCard';
import { KanbanStage } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePedidos, type PedidosFilters, type PedidoWithRelations } from '@/hooks/use-pedidos';
import { mapPedidoToOrder } from '@/lib/pedido-to-order';

// Referência estável (não uma array literal nova a cada render) — evita recomputar
// useMemo/useEffect à toa quando a coluna está sem dados (desabilitada ou ainda carregando).
const EMPTY_ROWS: PedidoWithRelations[] = [];

interface KanbanColumnProps {
  stageKey: KanbanStage;
  label: string;
  colorClass: string;
  onCardClick?: (id: string) => void;
  visibleColumns?: string[];
  columns?: any[];
  /** Quantidade de cards buscados inicialmente e por clique em "Ver mais" — vem do seletor "Exibir". */
  pageSize: number;
  empresaId?: string;
  /** Filtros de empresa/vendedor/fabricante/período/atenção/busca — cada coluna busca só o seu status. */
  filters?: PedidosFilters;
  /** Etapas ativas no filtro "Etapa" (undefined = todas). Se o status desta coluna não estiver
   *  incluído, ela não busca nada e fica vazia — igual ao comportamento antigo do filtro. */
  etapaFilter?: string[];
  /** Reporta ao pai os pedidos crus (pós-busca) desta coluna, para funções que precisam do
   *  conjunto completo do board (rolar até um card ao buscar, exportar PDF do pipeline). */
  onOrdersChange?: (stageKey: string, rows: PedidoWithRelations[]) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  stageKey, label, colorClass, onCardClick, visibleColumns, columns,
  pageSize, empresaId, filters, etapaFilter, onOrdersChange,
}: KanbanColumnProps) {
  const safeColor = typeof colorClass === 'string' ? colorClass : 'muted';
  const safeLabel = typeof label === 'string' ? label : String(label ?? '');
  const navigate = useNavigate();
  const stageEnabled = !etapaFilter || etapaFilter.includes(stageKey);

  // Cada coluna busca SÓ o seu próprio status — queryKey/cache/fetch totalmente
  // independentes entre colunas. "Ver mais" aumenta apenas o limit desta coluna.
  const [loadedBatches, setLoadedBatches] = useState(1);
  useEffect(() => {
    setLoadedBatches(1);
  }, [pageSize, filters, etapaFilter]);

  const limit = pageSize * loadedBatches;
  const stageFilter = useMemo(() => [stageKey], [stageKey]);
  const { data: pedidosData, isLoading, isFetching } = usePedidos(empresaId, 0, limit, stageFilter, filters, stageEnabled);

  const rawRows = pedidosData?.data ?? EMPTY_ROWS;
  // Total real desta etapa (count exato do Postgres, ignora o limit) — permite saber com
  // certeza se ainda há mais para buscar, sem depender de heurística.
  const stageTotal = pedidosData?.count ?? 0;

  const q = (filters?.search ?? '').trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!q) return rawRows;
    return rawRows.filter(p => {
      const cliente = (p.cliente?.empresa ?? '').toLowerCase();
      const obra = (p.obra?.nome_obra ?? '').toLowerCase();
      const fabricante = (p.fabricante?.nome ?? '').toLowerCase();
      return cliente.includes(q) || obra.includes(q) || fabricante.includes(q);
    });
  }, [rawRows, q]);

  const orders = useMemo(() => filteredRows.map(mapPedidoToOrder), [filteredRows]);
  const total = orders.reduce((acc, o) => acc + o.valor, 0);

  // Reporta ao pai os pedidos crus desta coluna (agregados por outras funções do board).
  const onOrdersChangeRef = useRef(onOrdersChange);
  onOrdersChangeRef.current = onOrdersChange;
  useEffect(() => {
    onOrdersChangeRef.current?.(stageKey, filteredRows);
  }, [stageKey, filteredRows]);
  useEffect(() => {
    return () => { onOrdersChangeRef.current?.(stageKey, []); };
  }, [stageKey]);

  const hasMore = rawRows.length < stageTotal;
  const loadMore = () => setLoadedBatches(prev => prev + 1);

  return (
    <div className="flex flex-col h-full w-52 sm:w-64 lg:w-72 min-w-[208px] sm:min-w-[256px] lg:min-w-[288px] shrink-0">
      <div className="flex items-center gap-2.5 mb-1 px-1 shrink-0">
        <div className={cn('h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-background', `bg-${safeColor}`, `ring-${safeColor}/30`)} />
        <h3 className="text-sm font-bold text-foreground tracking-tight">{safeLabel}</h3>
        {isFetching && !isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
        )}
        <span className={cn('text-[11px] font-semibold bg-secondary text-secondary-foreground px-2.5 py-0.5 rounded-full tabular-nums', (!isFetching || isLoading) && 'ml-auto')}>
          {stageTotal}
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
            {isLoading && orders.length === 0 && (
              <div className="flex items-center justify-center h-20 text-muted-foreground/60">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {snapshot.isDraggingOver && orders.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-20 text-xs text-primary/60 font-medium animate-fade-in">
                Solte aqui para mover
              </div>
            )}
            {orders.map((order, idx) => (
              <KanbanCard
                key={order.id}
                order={order}
                index={idx}
                onClick={onCardClick}
                visibleColumns={visibleColumns}
                columns={columns}
                stageLabel={safeLabel}
                stageColorClass={safeColor}
              />
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
          disabled={isFetching}
          className="mt-2 shrink-0 w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:bg-primary/5 border-primary/20"
        >
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {/* Com busca ativa, o total do servidor não reflete o filtro (aplicado só no
           *  cliente sobre as linhas já carregadas) — mostra só "Ver mais" sem contagem. */}
          {q ? 'Ver mais' : `Ver mais (${stageTotal - rawRows.length})`}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/pedidos/novo?status=${encodeURIComponent(stageKey)}${filters?.funilId ? `&funilId=${encodeURIComponent(filters.funilId)}` : ''}`)}
        className="mt-2 shrink-0 w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 border border-dashed border-border/60 hover:border-border"
      >
        <Plus className="h-3.5 w-3.5" />
        Novo Negócio
      </Button>
    </div>
  );
});

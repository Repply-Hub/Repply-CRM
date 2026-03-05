import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/AppLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { Plus, Filter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { data: pedidos, isLoading } = usePedidos();
  const updateStatus = useUpdatePedidoStatus();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    updateStatus.mutate({ id: draggableId, status: destination.droppableId });
  };

  const orders = (pedidos ?? []).map(p => ({
    id: p.id,
    clientName: p.cliente?.empresa ?? 'Sem cliente',
    obra: p.obra?.nome_obra ?? '-',
    fabricante: p.fabricante?.nome ?? '-',
    valor: p.valor_total ?? 0,
    stage: p.status as any,
    daysInStage: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000),
    alertDays: 7,
    vendedor: p.vendedor?.nome ?? '-',
    createdAt: p.data_pedido,
  }));

  const totalPipeline = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pipeline de Vendas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {orders.length} pedidos · Total:{' '}
              {totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filtrar</Button>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Pedido</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {KANBAN_STAGES.map(stage => (
                <KanbanColumn
                  key={stage.key}
                  stageKey={stage.key}
                  label={stage.label}
                  colorClass={stage.color}
                  orders={orders.filter(o => o.stage === stage.key)}
                />
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </AppLayout>
  );
};

export default Index;

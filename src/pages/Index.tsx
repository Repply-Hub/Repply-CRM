import { useState } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/AppLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { mockOrders, KANBAN_STAGES } from '@/data/mockData';
import { Order, KanbanStage } from '@/types';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    setOrders(prev =>
      prev.map(o =>
        o.id === draggableId
          ? { ...o, stage: destination.droppableId as KanbanStage, daysInStage: 0 }
          : o
      )
    );
  };

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
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" /> Filtrar
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Pedido
            </Button>
          </div>
        </div>

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
      </div>
    </AppLayout>
  );
};

export default Index;

import { useState, useMemo } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Plus, Filter, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

const Index = () => {
  const navigate = useNavigate();
  const { data: pedidos, isLoading } = usePedidos();
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
  };

  const hasFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0;

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    updateStatus.mutate({ id: draggableId, status: destination.droppableId });
  };

  const allOrders = (pedidos ?? []).map(p => ({
    id: p.id,
    clientName: p.cliente?.empresa ?? 'Sem cliente',
    obra: p.obra?.nome_obra ?? '-',
    fabricante: p.fabricante?.nome ?? '-',
    fabricanteId: p.fabricante_id,
    valor: p.valor_total ?? 0,
    stage: p.status as any,
    daysInStage: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000),
    alertDays: 7,
    vendedor: p.vendedor?.nome ?? '-',
    vendedorId: p.vendedor_id,
    createdAt: p.data_pedido,
  }));

  const orders = useMemo(() => {
    return allOrders.filter(o => {
      if (selectedVendedores.length > 0 && !selectedVendedores.includes(o.vendedorId)) return false;
      if (selectedFabricantes.length > 0 && !selectedFabricantes.includes(o.fabricanteId)) return false;
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes]);

  const totalPipeline = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pipeline de Vendas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {orders.length} pedidos · Total:{' '}
              {totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/pedidos')}>
              <Filter className="h-4 w-4 mr-1" /> Ver Pedidos
            </Button>
            <Button size="sm" onClick={() => navigate('/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Pedido
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={selectedVendedores.length > 0 ? 'border-primary' : ''}>
                Vendedor
                {selectedVendedores.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{selectedVendedores.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {(vendedores ?? []).map(v => (
                  <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedVendedores.includes(v.id)}
                      onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)}
                    />
                    {v.nome}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={selectedFabricantes.length > 0 ? 'border-primary' : ''}>
                Fabricante
                {selectedFabricantes.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{selectedFabricantes.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {(fabricantes ?? []).map(f => (
                  <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedFabricantes.includes(f.id)}
                      onCheckedChange={() => toggleFilter(selectedFabricantes, setSelectedFabricantes, f.id)}
                    />
                    {f.nome}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
            </Button>
          )}
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

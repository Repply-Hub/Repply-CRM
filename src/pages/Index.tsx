import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Plus, Filter, Loader2, X, ChevronDown, FileDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { generatePedidosPdf } from '@/lib/generate-pdf';
import { toast } from 'sonner';

const Index = () => {
  const navigate = useNavigate();
  const { data: pedidos, isLoading } = usePedidos();
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setShowOnlyAttention(false);
  };

  const hasFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || showOnlyAttention;

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (source.droppableId === destination.droppableId) return;

    const stageLabel = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;
    updateStatus.mutate({ id: draggableId, status: destination.droppableId });
    toast.success(`Pedido movido para "${stageLabel}"`);
  }, [updateStatus]);

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
      if (showOnlyAttention && o.daysInStage < o.alertDays) return false;
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes, showOnlyAttention]);

  const totalPipeline = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <AppLayout title="Pipeline de Vendas" subtitle={`${orders.length} pedidos · Total: ${totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
      <div className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
        {/* Filters & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 md:mb-6">
          {/* Filters - left side */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1 min-w-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={selectedVendedores.length > 0 ? 'border-primary' : ''}>
                  Vendedor <ChevronDown className="h-3.5 w-3.5 ml-1" />
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
                  Fabricante <ChevronDown className="h-3.5 w-3.5 ml-1" />
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

            <Button
              variant={showOnlyAttention ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOnlyAttention(prev => !prev)}
              className={showOnlyAttention ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">Precisa de atenção</span><span className="sm:hidden">Atenção</span>
            </Button>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {/* Actions - right side, never wrap */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={async () => {
              const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;
              await generatePedidosPdf(
                orders.map(o => ({
                  cliente: o.clientName,
                  obra: o.obra,
                  fabricante: o.fabricante,
                  vendedor: o.vendedor,
                  valor: o.valor,
                  etapa: stageLabel(o.stage),
                  data: o.createdAt,
                })),
                hasFilters ? 'Orçamentos (Filtrado)' : 'Orçamentos - Pipeline Completo'
              );
            }}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
            <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate('/pedidos')}>
              <Filter className="h-4 w-4 mr-1" /> Ver Pedidos
            </Button>
            <Button size="sm" onClick={() => navigate('/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Pedido</span><span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
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

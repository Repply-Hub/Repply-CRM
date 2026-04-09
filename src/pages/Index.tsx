import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { KANBAN_STAGES } from '@/data/mockData';
import { usePedidos, useUpdatePedidoStatus } from '@/hooks/use-pedidos';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { Plus, Filter, Loader2, X, ChevronDown, FileDown, AlertTriangle, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { generatePedidosPdf } from '@/lib/generate-pdf';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const Index = () => {
  const navigate = useNavigate();
  const { data: pedidos, isLoading } = usePedidos();
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>([]);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setShowOnlyAttention(false);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || showOnlyAttention || !!dateFrom || !!dateTo;
  const activeFilterCount = (selectedVendedores.length > 0 ? 1 : 0) + (selectedFabricantes.length > 0 ? 1 : 0) + (showOnlyAttention ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

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
      if (dateFrom && new Date(o.createdAt) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt) > end) return false;
      }
      return true;
    });
  }, [allOrders, selectedVendedores, selectedFabricantes, showOnlyAttention, dateFrom, dateTo]);

  const totalPipeline = orders.reduce((acc, o) => acc + o.valor, 0);

  return (
    <AppLayout title="Pipeline de Vendas" subtitle={`${orders.length} pedidos · Total: ${totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
      <div className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
        {/* Filters & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 md:mb-6">
          {/* Advanced filter - single button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={hasFilters ? 'border-primary' : ''}>
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                Filtros
                {hasFilters && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-[680px] max-w-[860px] p-4" align="start">
              <div className="flex gap-4">
                {/* Vendedor section */}
                <div className="flex-1 min-w-[130px]">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vendedor</p>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
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
                </div>

                {/* Fabricante section */}
                <div className="flex-1 min-w-[130px]">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fabricante</p>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
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
                </div>

                {/* Data section */}
                <div className="min-w-[140px]">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Período</p>
                  <div className="space-y-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs h-8", !dateFrom && "text-muted-foreground")}>
                          <CalendarIcon className="h-3 w-3 mr-1.5" />
                          {dateFrom ? format(dateFrom, 'dd/MM/yy', { locale: ptBR }) : 'De'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs h-8", !dateTo && "text-muted-foreground")}>
                          <CalendarIcon className="h-3 w-3 mr-1.5" />
                          {dateTo ? format(dateTo, 'dd/MM/yy', { locale: ptBR }) : 'Até'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Atenção + Limpar */}
                <div className="flex flex-col justify-between min-w-[120px]">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                      <Checkbox
                        checked={showOnlyAttention}
                        onCheckedChange={() => setShowOnlyAttention(prev => !prev)}
                      />
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Atenção
                    </label>
                  </div>
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full text-muted-foreground mt-2">
                      <X className="h-3.5 w-3.5 mr-1" /> Limpar
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} className="h-8 w-8 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="flex-1" />

          {/* Actions */}
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
          <Button size="sm" onClick={() => navigate('/pedidos/novo')}>
            <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Pedido</span><span className="sm:hidden">Novo</span>
          </Button>
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

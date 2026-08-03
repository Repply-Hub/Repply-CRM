import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useObras } from '@/hooks/use-obras';
import { useStatusObras } from '@/hooks/use-status-obras';
import { useClientes } from '@/hooks/use-clientes';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { Checkbox } from '@/components/ui/checkbox';
import { StandardPopoverMenu, StandardMenuItem } from '@/components/ui/standard-popover-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import {
  Building2, MapPin, Search, Loader2, HardHat, Calendar, List, Map as MapIcon,
  LayoutGrid, Table as TableIcon, Plus, Settings2, Filter, ChevronDown, X, Trash2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCreateObra, useUpdateObra, useDeleteObra, useDeleteObrasBulk } from '@/hooks/use-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatCnpj, isValidCnpj } from '@/utils/cnpj';
import { ColumnSettings, type ColumnDefinition } from '@/components/shared/ColumnSettings';
import { ListPagination } from '@/components/shared/ListPagination';
import { useTableSettings } from '@/hooks/use-table-settings';
import { MapaObras } from '@/components/obras/MapaObras';
import { StatusObrasDialog } from '@/components/obras/StatusObrasDialog';
import { cn, hasTextSelection } from '@/lib/utils';
import { FilterButton } from '@/components/shared/FilterButton';
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { ResizableTh } from '@/components/shared/ResizableTh';
import { supabase } from '@/integrations/supabase/client';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { EnderecoAutocomplete } from '@/components/obras/EnderecoAutocomplete';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const OBRA_FIELDS: ColumnDefinition[] = [
  { id: 'nome_obra', label: 'Nome da Obra', locked: false },
  { id: 'status', label: 'Status', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'endereco', label: 'Endereço', locked: false },
  { id: 'spe_cnpj', label: 'CNPJ/SPE', locked: false },
  { id: 'created_at', label: 'Data de Criação', locked: false },
  { id: 'actions', label: 'Ações', locked: false },
];

export default function Obras() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { data: obras, isLoading } = useObras();
  const { data: clientes } = useClientes();
  const { data: camposConfigObras } = useConfiguracoesCampos('obras', profile?.empresa_id);
  const createObra = useCreateObra();
  const updateObra = useUpdateObra();
  const deleteObra = useDeleteObra();
  const deleteObrasBulk = useDeleteObrasBulk();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [selectedObra, setSelectedObra] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('lista');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState(false);

  const [newObra, setNewObra] = useState({
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    status: '',
    spe_cnpj: '',
  });
  const [camposExtrasObra, setCamposExtrasObra] = useState<Record<string, string>>({});

  // Helper de leitura da config: campos que ainda não têm linha na config
  // (empresas antigas antes desta migration) caem no `fallback`, que reflete o
  // comportamento hardcoded que esses campos tinham antes de virarem configuráveis.
  const obraObrigatorio = (key: string, fallback: boolean) =>
    camposConfigObras?.find(c => c.campo_key === key)?.obrigatorio ?? fallback;
  const [editObra, setEditObra] = useState({
    id: '',
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    status: '',
    spe_cnpj: '',
  });

  const [newObraCnpjError, setNewObraCnpjError] = useState('');
  const [editObraCnpjError, setEditObraCnpjError] = useState('');

  const cnpjSchema = z.string().min(18, "CNPJ obrigatório").refine(isValidCnpj, { message: "CNPJ inválido" });

  const { data: statusObras } = useStatusObras();

  useEffect(() => {
    if (statusObras?.length && !newObra.status) {
      setNewObra(prev => ({ ...prev, status: statusObras[0].slug }));
    }
  }, [statusObras, newObra.status]);

  useEffect(() => {
    const state = location.state as { selectedObraId?: string, activeTab?: string } | null;
    if (state?.selectedObraId && obras) {
      const obra = obras.find(o => o.id === state.selectedObraId);
      if (obra) {
        if (state.activeTab === 'mapa') {
          setActiveTab('mapa');
        } else {
          setSelectedObra(obra);
          // Limpa o estado apenas se não for mapa, pois o mapa precisa dele para centralizar
          navigate(location.pathname, { replace: true, state: {} });
        }
      }
    }
  }, [location.state, obras, navigate, location.pathname]);

  const {
    columns,
    visibleColumns,
    setVisibleColumns,
    pageSize,
    setPageSize,
    handleRename,
    handleTypeChange,
    handleAddColumn,
    handleRemoveColumn,
    handleReorder,
    getLabel,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    columnWidths,
    setColumnWidth,
  } = useTableSettings({
    key: 'obras',
    defaultColumns: OBRA_FIELDS,
  });

  const getStatusInfo = (slug: string) => {
    const status = statusObras?.find(s => s.slug === slug);
    if (!status) {
      const label = slug === 'em_andamento' ? 'Em Andamento' : slug.replace(/_/g, ' ');
      return { 
        label: label.charAt(0).toUpperCase() + label.slice(1), 
        variant: 'outline' as const 
      };
    }
    return { 
      label: status.nome, 
      variant: 'default' as const 
    };
  };

  useEffect(() => {
    localStorage.setItem('obras_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleSelectAddress = () => {
      setActiveTab('mapa');
    };
    window.addEventListener('select-address-map', handleSelectAddress);
    return () => window.removeEventListener('select-address-map', handleSelectAddress);
  }, []);

  const filtered = useMemo(() => {
    if (!obras) return [];
    let list = [...obras];

    const pageSizeNumber = Number(pageSize);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.nome_obra || '').toLowerCase().includes(q) ||
          (o.endereco_entrega || '').toLowerCase().includes(q) ||
          ((o.clientes as any)?.empresa || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'todos') {
      list = list.filter((o) => o.status === statusFilter);
    }

    const getSortValue = (o: any) => {
      switch (sortColumn) {
        case 'status': return getStatusInfo(o.status).label;
        case 'cliente': return (o.clientes as any)?.empresa;
        case 'endereco': return o.endereco_entrega || o.nome_obra;
        case 'spe_cnpj': return o.spe_cnpj;
        case 'created_at': return o.created_at;
        case 'nome_obra': return o.nome_obra;
        default: return o.nome_obra;
      }
    };

    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (sortColumn === 'created_at') {
        const at = av ? new Date(av).getTime() : 0;
        const bt = bv ? new Date(bv).getTime() : 0;
        return (at - bt) * dir;
      }
      const as = (av ?? '').toString().toLowerCase();
      const bs = (bv ?? '').toString().toLowerCase();
      return as.localeCompare(bs, 'pt-BR') * dir;
    });

    return list;
  }, [obras, search, statusFilter, sortColumn, sortDirection, statusObras]);

  const obrasParaMapa = useMemo(
    () =>
      filtered.map((o: any) => ({
        id: o.id,
        nome_obra: o.nome_obra,
        endereco_entrega: o.endereco_entrega,
        status: o.status,
        spe_cnpj: o.spe_cnpj,
        latitude: o.latitude ?? null,
        longitude: o.longitude ?? null,
        geocoded_at: o.geocoded_at ?? null,
        cliente_empresa: o.clientes?.empresa ?? null,
        cliente_id: o.clientes?.id ?? null,
      })),
    [filtered]
  );

  const isDefaultSort = sortColumn === 'created_at' && sortDirection === 'desc';
  const hasFilters = statusFilter !== 'todos' || !isDefaultSort;
  const activeFilterCount = (statusFilter !== 'todos' ? 1 : 0) + (!isDefaultSort ? 1 : 0);

  const paginatedObras = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, page, pageSize]);

  // Larguras resolvidas na mesma ordem das colunas visíveis, usadas no <colgroup> e nos
  // cabeçalhos — a tabela precisa de largura própria explícita (não w-full/auto) + colgroup,
  // senão o navegador redistribui as larguras proporcionalmente ao redimensionar uma coluna.
  const OBRAS_CHECKBOX_COL_WIDTH = 40;
  const resolvedObraColWidths = visibleColumns.map((colId) => columnWidths[colId] ?? (colId === 'actions' ? 80 : 150));
  const obrasTableTotalWidth = OBRAS_CHECKBOX_COL_WIDTH + resolvedObraColWidths.reduce((a, b) => a + b, 0);

  const toggleSelectAllPage = () => {
    if (selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedObras.map(o => o.id));
    }
  };

  const toggleSelectAllGeneral = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(o => o.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <AppLayout 
      title="Obras" 
      subtitle="Gerencie e acompanhe todas as obras cadastradas."
      headerContent={
        <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
          <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">Obras</h1>
          <p className="text-[10px] sm:text-sm text-muted-foreground truncate">Gerencie e acompanhe todas as obras cadastradas.</p>
        </div>
      }
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      <div className="p-4 md:p-6 space-y-6 flex-1 flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 flex-1 flex flex-col min-h-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <TabsList className={cn(TOGGLE_LIST_CLASS, 'shrink-0')}>
                <TabsTrigger value="lista" className={TOGGLE_TRIGGER_CLASS}>
                  <List className="h-4 w-4" /> Lista
                </TabsTrigger>
                <TabsTrigger value="mapa" className={TOGGLE_TRIGGER_CLASS}>
                  <MapIcon className="h-4 w-4" /> Mapa
                </TabsTrigger>
              </TabsList>

              <SearchWithRecent
                placeholder="Buscar obras..."
                value={search}
                onValueChange={setSearch}
                storageKey="obras_recent_searches"
                showAddressSuggestions={true}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ColumnSettings
                columns={columns}
                visibleColumns={visibleColumns}
                onChange={setVisibleColumns}
                onRename={handleRename}
                onTypeChange={handleTypeChange}
                onReorder={handleReorder}
                onAdd={handleAddColumn}
                onRemove={handleRemoveColumn}
                presets={presets}
                onSavePreset={savePreset}
                onLoadPreset={loadPreset}
                onDeletePreset={deletePreset}
                className="h-10"
              />

              <FilterButton
                hasFilters={hasFilters}
                activeFilterCount={activeFilterCount}
                onClear={() => {
                  setStatusFilter('todos');
                  setSortColumn('created_at');
                  setSortDirection('desc');
                }}
                popoverClassName="w-64"
                align="end"
              >
                <div className="flex flex-col gap-1">
                  {/* Submenu Status */}
                  <StandardPopoverMenu
                    label="Status"
                    icon={LayoutGrid}
                    badge={statusFilter !== 'todos' ? 1 : undefined}
                    side="left"
                    align="start"
                    sideOffset={10}
                    popoverClassName="w-64"
                  >
                    <div className="flex flex-col h-full">
                      <div className="p-1 space-y-1">
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm",
                            statusFilter === 'todos' && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => setStatusFilter('todos')}
                        >
                          <Checkbox checked={statusFilter === 'todos'} onCheckedChange={() => setStatusFilter('todos')} />
                          Todos os status
                        </div>
                        {statusObras?.map(status => (
                          <div
                            key={status.slug}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm",
                              statusFilter === status.slug && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => setStatusFilter(status.slug)}
                          >
                            <Checkbox checked={statusFilter === status.slug} onCheckedChange={() => setStatusFilter(status.slug)} />
                            {status.nome}
                          </div>
                        ))}
                      </div>
                      <div className="px-1 py-1 mt-1 border-t border-border/50">
                        <StandardMenuItem
                          label="Gerenciar Status"
                          icon={Settings2}
                          onClick={() => setStatusDialogOpen(true)}
                        />
                      </div>
                    </div>
                  </StandardPopoverMenu>
                </div>
              </FilterButton>

              <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0 h-10 bg-[#F06A00] hover:bg-[#F06A00]/90">
                <Plus className="h-4 w-4" />
                Nova Obra
              </Button>
            </div>
          </div>

          <TabsContent value="lista" className="space-y-6 mt-0 flex-1 flex flex-col min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <HardHat className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Nenhuma obra encontrada</p>
                <p className="text-sm mt-1">Ajuste os filtros ou cadastre uma nova obra.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">{filtered.length} obra(s) encontrada(s)</p>
                    {selectedIds.length > 0 && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => setConfirmDeleteBulk(true)}
                        className="gap-2 h-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover Selecionados ({selectedIds.length})
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="rounded-lg border border-border/60 overflow-auto bg-card flex-1 min-h-0">
                  <table className="w-full text-sm table-fixed" style={{ width: obrasTableTotalWidth }}>
                    <colgroup>
                      <col style={{ width: OBRAS_CHECKBOX_COL_WIDTH }} />
                      {visibleColumns.map((colId, i) => (
                        <col key={colId} style={{ width: resolvedObraColWidths[i] }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="border-b bg-muted/50">
                        <th className="h-14 px-2.5 w-10 text-center">
                          <Checkbox
                            checked={selectedIds.length > 0 && selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id))}
                            onCheckedChange={toggleSelectAllPage}
                          />
                        </th>
                        {visibleColumns.map((colId, i) => (
                          colId === 'actions' ? (
                            <ResizableTh
                              key={colId}
                              width={resolvedObraColWidths[i]}
                              onResize={(w) => setColumnWidth(colId, w)}
                              className="text-left h-14 px-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap"
                            >
                              {getLabel(colId)}
                            </ResizableTh>
                          ) : (
                            <SortableTh
                              key={colId}
                              label={getLabel(colId)}
                              sortKey={colId}
                              currentSortKey={sortColumn}
                              currentDirection={sortDirection}
                              onSort={(key, direction) => { setSortColumn(key); setSortDirection(direction); }}
                              ascLabel={colId === 'created_at' ? 'Mais antigas primeiro' : 'Ordenar A-Z'}
                              descLabel={colId === 'created_at' ? 'Mais recentes primeiro' : 'Ordenar Z-A'}
                              width={resolvedObraColWidths[i]}
                              onResize={(w) => setColumnWidth(colId, w)}
                            />
                          )
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedObras.map(obra => {
                        const status = getStatusInfo(obra.status);
                        const cliente = obra.clientes as any;
                        const camposExtras = (obra as any).campos_extras || {};
                        // Se o clique foi o fim de uma seleção de texto (usuário copiando
                        // um valor da célula), não abre o painel — o resto da linha
                        // continua clicável normalmente.
                        const openDetail = () => {
                          if (hasTextSelection()) return;
                          setSelectedObra(obra);
                        };

                        return (
                          <tr
                            key={obra.id}
                            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={openDetail}
                          >
                            <td className="py-1.5 px-2.5 w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.includes(obra.id)}
                                onCheckedChange={() => toggleSelect(obra.id)}
                              />
                            </td>
                            {visibleColumns.map(colId => (
                              <td key={colId} className="py-1.5 px-2.5 truncate max-w-[200px]">
                                {colId === 'nome_obra' && (
                                  <span className="font-semibold text-sm text-foreground">
                                    {obra.nome_obra}
                                  </span>
                                )}
                                {colId === 'status' && <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>}
                                {colId === 'cliente' && (
                                  <span className="font-medium">
                                    {cliente?.empresa || '—'}
                                  </span>
                                )}
                                {colId === 'endereco' && (
                                  <span>
                                    {obra.endereco_entrega || obra.nome_obra}
                                  </span>
                                )}
                                {colId === 'spe_cnpj' && (obra.spe_cnpj || '—')}
                                {colId === 'created_at' && format(new Date(obra.created_at), "dd/MM/yyyy")}
                                {colId === 'actions' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(obra.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {colId.startsWith('custom_') && (camposExtras[colId] || '—')}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 border-t">
                  <ListPagination
                    page={page}
                    totalPages={Math.ceil(filtered.length / pageSize)}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="mapa" className="mt-0">
            <Card className="h-[calc(100vh-280px)] min-h-[500px]">
              <MapaObras 
                obras={obrasParaMapa} 
                isLoading={isLoading} 
                searchTerm={search}
                selectedObraId={(location.state as any)?.selectedObraId}
              />
            </Card>
          </TabsContent>
        </Tabs>

        {/* Status Settings Dialog */}
        <StatusObrasDialog 
          open={statusDialogOpen} 
          onOpenChange={setStatusDialogOpen} 
        />

        {/* Obra Details Sheet (Lateral) */}
        <Sheet open={!!selectedObra} onOpenChange={(open) => !open && setSelectedObra(null)}>
          {selectedObra && (
            <SheetContent className="sm:max-w-xl overflow-y-auto">
              <SheetHeader className="pb-6 border-b">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <SheetTitle className="flex items-center gap-2">
                      <HardHat className="h-5 w-5 text-primary" />
                      <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{selectedObra.nome_obra}</span>
                    </SheetTitle>
                    <SheetDescription>
                      Detalhes da obra vinculada ao cliente.
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" /> Cliente
                    </Label>
                    <p 
                      className="text-sm font-medium hover:text-primary transition-colors cursor-pointer"
                      onClick={() => navigate(`/clientes/${selectedObra.cliente_id}`)}
                    >
                      {selectedObra.clientes?.empresa || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> Localização
                    </Label>
                    <div className="pt-1">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-2 text-xs"
                        onClick={() => {
                          const address = selectedObra.endereco_entrega || selectedObra.nome_obra;
                          if (address) {
                            setSearch(address);
                            setActiveTab('mapa');
                            setSelectedObra(null); // Fecha o painel lateral
                          }
                        }}
                        disabled={!selectedObra.endereco_entrega && !selectedObra.nome_obra}
                      >
                        <MapIcon className="h-3.5 w-3.5 text-primary" />
                        Visualizar no mapa
                      </Button>
                      {!selectedObra.endereco_entrega && !selectedObra.nome_obra && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">Endereço não informado</p>
                      )}
                    </div>
                      <div className="mt-3">
                        <Badge variant={getStatusInfo(selectedObra.status).variant}>
                          {getStatusInfo(selectedObra.status).label}
                        </Badge>
                      </div>
                    </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Data de Cadastro
                    </Label>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedObra.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                </div>

                {/* Você pode adicionar mais seções aqui futuramente, como histórico ou pedidos vinculados */}
              </div>

              <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
                <div className="flex w-full justify-between items-center">
                  <Button 
                    variant="ghost" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                    onClick={() => {
                      setConfirmDeleteId(selectedObra.id);
                      setSelectedObra(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedObra(null)}>Fechar</Button>
                    <Button onClick={() => {
                      setEditObra({
                        id: selectedObra.id,
                        nome_obra: selectedObra.nome_obra,
                        cliente_id: selectedObra.cliente_id,
                        endereco_entrega: selectedObra.endereco_entrega || '',
                        status: selectedObra.status,
                        spe_cnpj: selectedObra.spe_cnpj || '',
                      });
                      setEditDialogOpen(true);
                      setSelectedObra(null);
                    }}>Editar</Button>
                  </div>
                </div>
              </SheetFooter>
            </SheetContent>
          )}
        </Sheet>

        {/* Edit Obra Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const result = cnpjSchema.safeParse(editObra.spe_cnpj);
              if (!result.success) {
                setEditObraCnpjError(result.error.errors[0].message);
                return;
              }
              const payload = {
                ...editObra,
                spe_cnpj: editObra.spe_cnpj.replace(/\D/g, "")
              };
              updateObra.mutate(payload, {
                onSuccess: () => {
                  setEditDialogOpen(false);
                  toast.success("Obra atualizada com sucesso!");
                  setEditObraCnpjError('');
                }
              });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Obra</Label>
                <Input 
                  required
                  placeholder="Ex: Edifício Horizonte"
                  value={editObra.nome_obra}
                  onChange={(e) => setEditObra(prev => ({ ...prev, nome_obra: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Cliente Responsável</Label>
                <EmpresaSelector
                  value={editObra.cliente_id}
                  onValueChange={(v) => setEditObra(prev => ({ ...prev, cliente_id: v }))}
                  placeholder="Selecione o cliente"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editObra.status} 
                  onValueChange={(v) => setEditObra(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusObras?.map(s => (
                      <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Endereço de Entrega</Label>
                <EnderecoAutocomplete
                  value={editObra.endereco_entrega}
                  onChange={(v) => setEditObra(prev => ({ ...prev, endereco_entrega: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label>SPE / CNPJ</Label>
                <Input 
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  value={editObra.spe_cnpj}
                  onChange={(e) => {
                    setEditObra(prev => ({ ...prev, spe_cnpj: formatCnpj(e.target.value) }));
                    setEditObraCnpjError('');
                  }}
                />
                {editObraCnpjError && <p className="text-[0.8rem] font-medium text-destructive">{editObraCnpjError}</p>}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={updateObra.isPending}>
                  {updateObra.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Obra Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const nomeObraObrigatorio = obraObrigatorio('nome_obra', true);
              const clienteObrigatorio = obraObrigatorio('cliente_id', true);
              if ((nomeObraObrigatorio && !newObra.nome_obra) || (clienteObrigatorio && !newObra.cliente_id)) {
                toast.error("Preencha ao menos o nome e o cliente.");
                return;
              }
              const speCnpjObrigatorio = obraObrigatorio('spe_cnpj', false);
              if (speCnpjObrigatorio || newObra.spe_cnpj.trim()) {
                const result = cnpjSchema.safeParse(newObra.spe_cnpj);
                if (!result.success) {
                  setNewObraCnpjError(result.error.errors[0].message);
                  return;
                }
              }
              for (const c of (camposConfigObras ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
                if (!camposExtrasObra[c.campo_key]?.trim()) {
                  toast.error(`Preencha o campo obrigatório: ${c.label}`);
                  return;
                }
              }
              const payload = {
                ...newObra,
                spe_cnpj: newObra.spe_cnpj.replace(/\D/g, ""),
                campos_extras: camposExtrasObra,
              };
              createObra.mutate(payload, {
                onSuccess: () => {
                  setDialogOpen(false);
                  setNewObra({ nome_obra: '', cliente_id: '', endereco_entrega: '', status: statusObras?.[0]?.slug || '', spe_cnpj: '' });
                  setCamposExtrasObra({});
                  setNewObraCnpjError('');
                }
              });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Obra{obraObrigatorio('nome_obra', true) && ' *'}</Label>
                <Input
                  required={obraObrigatorio('nome_obra', true)}
                  placeholder="Ex: Edifício Central"
                  value={newObra.nome_obra}
                  onChange={(e) => setNewObra(prev => ({ ...prev, nome_obra: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Cliente Responsável{obraObrigatorio('cliente_id', true) && ' *'}</Label>
                <EmpresaSelector
                  value={newObra.cliente_id}
                  onValueChange={(v) => setNewObra(prev => ({ ...prev, cliente_id: v }))}
                  placeholder="Selecione um cliente"
                />
              </div>

              <div className="space-y-2">
                <Label>Status Inicial{obraObrigatorio('status', false) && ' *'}</Label>
                <Select
                  value={newObra.status}
                  onValueChange={(v) => setNewObra(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusObras?.map(s => (
                      <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Endereço de Entrega{obraObrigatorio('endereco_entrega', false) && ' *'}</Label>
                <EnderecoAutocomplete
                  value={newObra.endereco_entrega}
                  onChange={(v) => setNewObra(prev => ({ ...prev, endereco_entrega: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label>SPE / CNPJ{obraObrigatorio('spe_cnpj', false) && ' *'}</Label>
                <Input
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  value={newObra.spe_cnpj}
                  onChange={(e) => {
                    setNewObra(prev => ({ ...prev, spe_cnpj: formatCnpj(e.target.value) }));
                    setNewObraCnpjError('');
                  }}
                />
                {newObraCnpjError && <p className="text-[0.8rem] font-medium text-destructive">{newObraCnpjError}</p>}
              </div>

              {(camposConfigObras ?? []).filter(c => c.origem === 'customizado').map(campo => (
                <div key={campo.id} className="space-y-2">
                  <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                  <Input
                    value={camposExtrasObra[campo.campo_key] ?? ''}
                    onChange={(e) => setCamposExtrasObra(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                    placeholder={campo.label ?? ''}
                  />
                </div>
              ))}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createObra.isPending}>
                  {createObra.isPending ? "Salvando..." : "Criar Obra"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDeleteBulk} onOpenChange={setConfirmDeleteBulk}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Obras</AlertDialogTitle>
              <AlertDialogDescription>
                Selecione quais obras deseja remover. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex flex-col gap-3">
                <Button 
                  variant="outline" 
                  className={cn(
                    "justify-start h-auto py-3 px-4",
                    selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id)) && "border-primary bg-primary/5"
                  )}
                  onClick={toggleSelectAllPage}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-semibold">Selecionar Página Atual</span>
                    <span className="text-xs text-muted-foreground">Remover apenas as {paginatedObras.length} obras que aparecem nesta página</span>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className={cn(
                    "justify-start h-auto py-3 px-4",
                    selectedIds.length === filtered.length && filtered.length > 0 && "border-primary bg-primary/5"
                  )}
                  onClick={toggleSelectAllGeneral}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-semibold">Selecionar Todas</span>
                    <span className="text-xs text-muted-foreground">Remover todas as {filtered.length} obras encontradas (incluindo outras páginas)</span>
                  </div>
                </Button>
              </div>
              {selectedIds.length > 0 && (
                <p className="text-sm font-medium text-destructive">
                  {selectedIds.length} obra(s) selecionada(s) para exclusão.
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={selectedIds.length === 0 || deleteObrasBulk.isPending}
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    console.log('Botão excluir clicado no modal. IDs selecionados:', selectedIds);
                    const result = await deleteObrasBulk.mutateAsync(selectedIds);
                    console.log('Resultado da exclusão:', result);
                    toast.success(`${selectedIds.length} obras excluídas com sucesso!`);
                    setSelectedIds([]);
                    setConfirmDeleteBulk(false);
                  } catch (error: any) {
                    console.error('Erro detalhado capturado no modal:', error);
                    let errorMessage = "Erro desconhecido";
                    
                    if (error.message) {
                      errorMessage = error.message;
                    } else if (typeof error === 'string') {
                      errorMessage = error;
                    }
                    
                    toast.error("Erro ao excluir obras: " + errorMessage);
                  }
                }}
              >
                {deleteObrasBulk.isPending ? "Excluindo..." : "Excluir Selecionadas"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Obra</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta obra? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (confirmDeleteId) {
                    try {
                      await deleteObra.mutateAsync(confirmDeleteId);
                      toast.success("Obra excluída com sucesso!");
                    } catch (error: any) {
                      toast.error("Erro ao excluir obra: " + error.message);
                    }
                    setConfirmDeleteId(null);
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

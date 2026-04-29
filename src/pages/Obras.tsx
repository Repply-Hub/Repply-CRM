import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useObras } from '@/hooks/use-obras';
import { useStatusObras } from '@/hooks/use-status-obras';
import { useClientes } from '@/hooks/use-clientes';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Building2, MapPin, Search, Loader2, HardHat, Calendar, List, Map as MapIcon, 
  LayoutGrid, Table as TableIcon, Plus, Settings2, Filter, ChevronDown, X, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCreateObra, useUpdateObra, useDeleteObra } from '@/hooks/use-mutations';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { ListPagination } from '@/components/ListPagination';
import { useTableSettings } from '@/hooks/use-table-settings';
import { MapaObras } from '@/components/obras/MapaObras';
import { StatusObrasDialog } from '@/components/obras/StatusObrasDialog';
import { cn } from '@/lib/utils';
import { FilterButton } from '@/components/FilterButton';
import { supabase } from '@/integrations/supabase/client';
import { EmpresaSelector } from '@/components/EmpresaSelector';
import { EnderecoAutocomplete } from '@/components/EnderecoAutocomplete';
import { SearchWithRecent } from '@/components/SearchWithRecent';
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

type SortOption = 'recent' | 'oldest' | 'name_asc' | 'name_desc';

export default function Obras() {
  const { data: obras, isLoading } = useObras();
  const { data: clientes } = useClientes();
  const createObra = useCreateObra();
  const updateObra = useUpdateObra();
  const deleteObra = useDeleteObra();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sort, setSort] = useState<SortOption>('recent');
  const [page, setPage] = useState(1);
  const [selectedObra, setSelectedObra] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('obras_view_mode');
    return (saved as any) || 'cards';
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [newObra, setNewObra] = useState({
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    status: '',
    spe_cnpj: '',
  });
  const [editObra, setEditObra] = useState({
    id: '',
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    status: '',
    spe_cnpj: '',
  });

  const { data: statusObras } = useStatusObras();

  useEffect(() => {
    if (statusObras?.length && !newObra.status) {
      setNewObra(prev => ({ ...prev, status: statusObras[0].slug }));
    }
  }, [statusObras, newObra.status]);

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
    deletePreset
  } = useTableSettings({
    key: 'obras',
    defaultColumns: OBRA_FIELDS,
  });

  const getStatusInfo = (slug: string) => {
    const status = statusObras?.find(s => s.slug === slug);
    if (!status) return { label: slug, variant: 'outline' as const };
    return { 
      label: status.nome, 
      variant: 'default' as const 
    };
  };

  useEffect(() => {
    localStorage.setItem('obras_view_mode', viewMode);
  }, [viewMode]);

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

    switch (sort) {
      case 'oldest':
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'name_asc':
        list.sort((a, b) => a.nome_obra.localeCompare(b.nome_obra));
        break;
      case 'name_desc':
        list.sort((a, b) => b.nome_obra.localeCompare(a.nome_obra));
        break;
      default:
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return list;
  }, [obras, search, statusFilter, sort]);

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
        cliente_empresa: o.clientes?.empresa ?? null,
      })),
    [filtered]
  );

  const hasFilters = statusFilter !== 'todos' || sort !== 'recent';
  const activeFilterCount = (statusFilter !== 'todos' ? 1 : 0) + (sort !== 'recent' ? 1 : 0);

  return (
    <AppLayout 
      title="Obras" 
      subtitle="Gerencie e acompanhe todas as obras cadastradas."
      headerContent={
        <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
          <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight truncate">Obras</h1>
          <p className="text-[10px] sm:text-sm text-muted-foreground truncate">Gerencie e acompanhe todas as obras cadastradas.</p>
        </div>
      }
    >
      <div className="p-4 md:p-6 space-y-6">
        <Tabs defaultValue="lista" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <TabsList className="shrink-0">
                <TabsTrigger value="lista" className="gap-2">
                  <List className="h-4 w-4" /> Lista
                </TabsTrigger>
                <TabsTrigger value="mapa" className="gap-2">
                  <MapIcon className="h-4 w-4" /> Mapa
                </TabsTrigger>
              </TabsList>

              <SearchWithRecent
                placeholder="Buscar obras..."
                value={search}
                onValueChange={setSearch}
                storageKey="obras_recent_searches"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-muted p-1 rounded-md">
                <button
                  onClick={() => setViewMode('cards')}
                  className={cn("p-1.5 rounded-sm transition-all", viewMode === 'cards' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                  title="Visualização em Cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={cn("p-1.5 rounded-sm transition-all", viewMode === 'table' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                  title="Visualização em Tabela"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
              </div>

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
                  setSort('recent');
                }}
                popoverClassName="w-auto p-0"
                align="end"
              >
                <div className="flex divide-x divide-border/50">
                  <div className="w-[280px] p-4 space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Status</Label>
                    <div className="space-y-1">
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
                    <div className="pt-2 border-t mt-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start gap-2 h-8 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setStatusDialogOpen(true)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Gerenciar Status
                      </Button>
                    </div>
                  </div>

                  <div className="w-[200px] p-4 space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Ordenação</Label>
                    <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Ordenar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent">Mais recentes</SelectItem>
                        <SelectItem value="oldest">Mais antigas</SelectItem>
                        <SelectItem value="name_asc">Nome A-Z</SelectItem>
                        <SelectItem value="name_desc">Nome Z-A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FilterButton>

              <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0 h-10 bg-[#F06A00] hover:bg-[#F06A00]/90">
                <Plus className="h-4 w-4" />
                Nova Obra
              </Button>
            </div>
          </div>

          <TabsContent value="lista" className="space-y-6 mt-0">
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
                <p className="text-sm text-muted-foreground">{filtered.length} obra(s) encontrada(s)</p>
                
                {viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map((obra) => {
                      const status = getStatusInfo(obra.status);
                      const cliente = obra.clientes as any;
                      const camposExtras = (obra as any).campos_extras || {};
                      
                      return (
                        <Card 
                          key={obra.id} 
                          className="flex flex-col cursor-pointer hover:border-primary/50 transition-colors group relative"
                          onClick={() => setSelectedObra(obra)}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive transition-opacity z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(obra.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-base font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                {obra.nome_obra}
                              </CardTitle>
                              <Badge variant={status.variant} className="shrink-0 text-xs">
                                {status.label}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                            {visibleColumns.includes('cliente') && cliente?.empresa && (
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{cliente.empresa}</span>
                              </div>
                            )}
                            {visibleColumns.includes('endereco') && obra.endereco_entrega && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{obra.endereco_entrega}</span>
                              </div>
                            )}
                            {visibleColumns.includes('spe_cnpj') && obra.spe_cnpj && (
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs">SPE: {obra.spe_cnpj}</span>
                              </div>
                            )}
                            {visibleColumns.includes('created_at') && (
                              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs">
                                  Criada em {format(new Date(obra.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                                </span>
                              </div>
                            )}
                            {visibleColumns.filter(id => id.startsWith('custom_')).map(colId => (
                              <div key={colId} className="flex items-center gap-2 text-xs">
                                <span className="font-medium">{getLabel(colId)}:</span>
                                <span>{camposExtras[colId] || '—'}</span>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/60 overflow-x-auto bg-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {visibleColumns.map(colId => (
                            <th key={colId} className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs whitespace-nowrap">
                              {getLabel(colId)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice((page - 1) * pageSize, page * pageSize).map(obra => {
                          const status = getStatusInfo(obra.status);
                          const cliente = obra.clientes as any;
                          const camposExtras = (obra as any).campos_extras || {};

                          return (
                            <tr 
                              key={obra.id} 
                              className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => setSelectedObra(obra)}
                            >
                              {visibleColumns.map(colId => (
                                <td key={colId} className="py-3 px-4 truncate max-w-[200px]">
                                  {colId === 'nome_obra' && <span className="font-medium text-foreground">{obra.nome_obra}</span>}
                                  {colId === 'status' && <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>}
                                  {colId === 'cliente' && (cliente?.empresa || '—')}
                                  {colId === 'endereco' && (obra.endereco_entrega || '—')}
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
                )}

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
              />
            </Card>
          </TabsContent>
        </Tabs>

        {/* Status Settings Dialog */}
        <StatusObrasDialog 
          open={statusDialogOpen} 
          onOpenChange={setStatusDialogOpen} 
        />

        {/* Obra Details/Edit Dialog */}
        <Dialog open={!!selectedObra} onOpenChange={(open) => !open && setSelectedObra(null)}>
          {selectedObra && (
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HardHat className="h-5 w-5 text-primary" />
                  {selectedObra.nome_obra}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Cliente</Label>
                    <p className="font-medium">{selectedObra.clientes?.empresa || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Endereço de Entrega</Label>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      {selectedObra.endereco_entrega || '—'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">CNPJ / SPE</Label>
                    <p className="font-medium">{selectedObra.spe_cnpj || '—'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Status Atual</Label>
                    <div className="pt-1">
                      <Badge variant={getStatusInfo(selectedObra.status).variant}>
                        {getStatusInfo(selectedObra.status).label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Data de Cadastro</Label>
                    <p className="font-medium flex items-center gap-1 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      {format(new Date(selectedObra.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
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
                    Excluir Obra
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
                    }}>Editar Informações</Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>

        {/* Edit Obra Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              updateObra.mutate(editObra, {
                onSuccess: () => {
                  setEditDialogOpen(false);
                  toast.success("Obra atualizada com sucesso!");
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
                  value={editObra.spe_cnpj}
                  onChange={(e) => setEditObra(prev => ({ ...prev, spe_cnpj: e.target.value }))}
                />
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
              if (!newObra.nome_obra || !newObra.cliente_id) {
                toast.error("Preencha ao menos o nome e o cliente.");
                return;
              }
              createObra.mutate(newObra, {
                onSuccess: () => {
                  setDialogOpen(false);
                  setNewObra({ nome_obra: '', cliente_id: '', endereco_entrega: '', status: statusObras?.[0]?.slug || '', spe_cnpj: '' });
                }
              });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Obra</Label>
                <Input 
                  required
                  placeholder="Ex: Edifício Central"
                  value={newObra.nome_obra}
                  onChange={(e) => setNewObra(prev => ({ ...prev, nome_obra: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Cliente Responsável</Label>
                <EmpresaSelector
                  value={newObra.cliente_id}
                  onValueChange={(v) => setNewObra(prev => ({ ...prev, cliente_id: v }))}
                  placeholder="Selecione um cliente"
                />
              </div>

              <div className="space-y-2">
                <Label>Status Inicial</Label>
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
                <Label>Endereço de Entrega</Label>
                <EnderecoAutocomplete
                  value={newObra.endereco_entrega}
                  onChange={(v) => setNewObra(prev => ({ ...prev, endereco_entrega: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label>SPE / CNPJ (Opcional)</Label>
                <Input 
                  placeholder="00.000.000/0000-00"
                  value={newObra.spe_cnpj}
                  onChange={(e) => setNewObra(prev => ({ ...prev, spe_cnpj: e.target.value }))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createObra.isPending}>
                  {createObra.isPending ? "Salvando..." : "Criar Obra"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

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

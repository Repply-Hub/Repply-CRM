import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useObras } from '@/hooks/use-obras';
import { useStatusObras } from '@/hooks/use-status-obras';
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
  LayoutGrid, Table as TableIcon, Plus, Settings2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmpresaSelector } from '@/components/EmpresaSelector';
import { useCreateObra } from '@/hooks/use-mutations';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { ListPagination } from '@/components/ListPagination';
import { useTableSettings } from '@/hooks/use-table-settings';
import { MapaObras } from '@/components/obras/MapaObras';
import { StatusObrasDialog } from '@/components/obras/StatusObrasDialog';
import { cn } from '@/lib/utils';

const OBRA_FIELDS: ColumnDefinition[] = [
  { id: 'nome_obra', label: 'Nome da Obra', locked: false },
  { id: 'status', label: 'Status', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'endereco', label: 'Endereço', locked: false },
  { id: 'spe_cnpj', label: 'CNPJ/SPE', locked: false },
  { id: 'created_at', label: 'Data de Criação', locked: false },
];

type SortOption = 'recent' | 'oldest' | 'name_asc' | 'name_desc';

export default function Obras() {
  const { data: obras, isLoading } = useObras();
  const createObra = useCreateObra();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sort, setSort] = useState<SortOption>('recent');
  const [page, setPage] = useState(1);
  const [selectedObra, setSelectedObra] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('obras_view_mode');
    return (saved as any) || 'cards';
  });

  // Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newObra, setNewObra] = useState({
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

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.nome_obra.toLowerCase().includes(q) ||
          o.endereco_entrega?.toLowerCase().includes(q) ||
          (o.clientes as any)?.empresa?.toLowerCase().includes(q)
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

  // currentColumns replaced by hook's columns


  const obrasParaMapa = useMemo(
    () =>
      (obras ?? []).map((o: any) => ({
        id: o.id,
        nome_obra: o.nome_obra,
        endereco_entrega: o.endereco_entrega,
        status: o.status,
        spe_cnpj: o.spe_cnpj,
        latitude: o.latitude ?? null,
        longitude: o.longitude ?? null,
        cliente_empresa: o.clientes?.empresa ?? null,
      })),
    [obras]
  );

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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <TabsList>
                <TabsTrigger value="lista" className="gap-2">
                  <List className="h-4 w-4" /> Lista
                </TabsTrigger>
                <TabsTrigger value="mapa" className="gap-2">
                  <MapIcon className="h-4 w-4" /> Mapa
                </TabsTrigger>
              </TabsList>

              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setStatusDialogOpen(true)}
                title="Configurar Status"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>

            <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nova Obra
            </Button>
          </div>

          <TabsContent value="lista" className="space-y-6 mt-0">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, endereço ou cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-fit max-w-full shrink-0 whitespace-nowrap">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="parada">Parada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                <SelectTrigger className="w-fit max-w-full shrink-0 whitespace-nowrap">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigas</SelectItem>
                  <SelectItem value="name_asc">Nome A-Z</SelectItem>
                  <SelectItem value="name_desc">Nome Z-A</SelectItem>
                </SelectContent>
              </Select>
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
              />
            </div>

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
                      const status = STATUS_MAP[obra.status] || { label: obra.status, variant: 'outline' as const };
                      const cliente = obra.clientes as any;
                      const camposExtras = (obra as any).campos_extras || {};
                      
                      return (
                        <Card 
                          key={obra.id} 
                          className="flex flex-col cursor-pointer hover:border-primary/50 transition-colors group"
                          onClick={() => setSelectedObra(obra)}
                        >
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
                            {/* Renderizar campos extras nos cards também? Ocuparia muito espaço. Talvez só se estiverem selecionados. */}
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
                          const status = STATUS_MAP[obra.status] || { label: obra.status, variant: 'outline' as const };
                          const cliente = obra.clientes as any;
                          const camposExtras = (obra as any).campos_extras || {};

                          return (
                            <tr 
                              key={obra.id} 
                              className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => setSelectedObra(obra)}
                            >
                              {visibleColumns.map(colId => {
                                const isCustom = colId.startsWith('custom_');
                                let value: any = isCustom ? camposExtras[colId] : (obra as any)[colId];
                                
                                if (colId === 'nome_obra') {
                                  return <td key={colId} className="py-2.5 px-4 font-medium">{obra.nome_obra}</td>;
                                }

                                if (colId === 'status') {
                                  return (
                                    <td key={colId} className="py-2.5 px-4">
                                      <Badge variant={status.variant} className="text-[10px] font-medium">{status.label}</Badge>
                                    </td>
                                  );
                                }
                                
                                if (colId === 'cliente') {
                                  return (
                                    <td key={colId} className="py-2.5 px-4 text-xs">{cliente?.empresa || '—'}</td>
                                  );
                                }

                                if (colId === 'created_at') {
                                  return (
                                    <td key={colId} className="py-2.5 px-4 text-xs whitespace-nowrap">
                                      {format(new Date(obra.created_at), "dd/MM/yy", { locale: ptBR })}
                                    </td>
                                  );
                                }

                                return (
                                  <td key={colId} className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[200px]">
                                    {value || '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <ListPagination
                  page={page}
                  totalPages={Math.ceil(filtered.length / pageSize)}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="obra"
                  className="mt-4"
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="mapa" className="mt-0">
            <MapaObras obras={obrasParaMapa} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Obra</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome_obra">Nome da Obra *</Label>
              <Input
                id="nome_obra"
                value={newObra.nome_obra}
                onChange={(e) => setNewObra({ ...newObra, nome_obra: e.target.value })}
                placeholder="Ex: Edifício Horizonte"
              />
            </div>
            <div className="grid gap-2">
              <Label>Cliente *</Label>
              <EmpresaSelector 
                value={newObra.cliente_id} 
                onValueChange={(id) => setNewObra({ ...newObra, cliente_id: id })} 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endereco">Endereço de Entrega</Label>
              <Input
                id="endereco"
                value={newObra.endereco_entrega}
                onChange={(e) => setNewObra({ ...newObra, endereco_entrega: e.target.value })}
                placeholder="Rua, número, bairro..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={newObra.status} 
                  onValueChange={(v) => setNewObra({ ...newObra, status: v })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="parada">Parada</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="spe_cnpj">CNPJ / SPE</Label>
                <Input
                  id="spe_cnpj"
                  value={newObra.spe_cnpj}
                  onChange={(e) => setNewObra({ ...newObra, spe_cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button 
              disabled={createObra.isPending}
              onClick={async () => {
                if (!newObra.nome_obra || !newObra.cliente_id) {
                  toast.error('Nome da obra e Cliente são obrigatórios');
                  return;
                }
                try {
                  await createObra.mutateAsync(newObra);
                  toast.success('Obra cadastrada com sucesso!');
                  setDialogOpen(false);
                  setNewObra({
                    nome_obra: '',
                    cliente_id: '',
                    endereco_entrega: '',
                    status: 'ativa',
                    spe_cnpj: '',
                  });
                } catch (error: any) {
                  toast.error('Erro ao cadastrar obra: ' + error.message);
                }
              }}
            >
              {createObra.isPending ? 'Salvando...' : 'Cadastrar Obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedObra} onOpenChange={(open) => !open && setSelectedObra(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-primary" />
              Detalhes da Obra
            </DialogTitle>
          </DialogHeader>
          
          {selectedObra && (
            <div className="space-y-6 py-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{selectedObra.nome_obra}</h3>
                  <p className="text-sm text-muted-foreground">ID: {selectedObra.id}</p>
                </div>
                <Badge variant={STATUS_MAP[selectedObra.status]?.variant || 'outline'}>
                  {STATUS_MAP[selectedObra.status]?.label || selectedObra.status}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Cliente</Label>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span>{selectedObra.clientes?.empresa || 'Não informado'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Endereço de Entrega</Label>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span>{selectedObra.endereco_entrega || 'Não informado'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">CNPJ / SPE</Label>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span>{selectedObra.spe_cnpj || 'Não informado'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Data de Cadastro</Label>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>{format(new Date(selectedObra.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>

                  {selectedObra.campos_extras && Object.keys(selectedObra.campos_extras).length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Campos Personalizados</Label>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(selectedObra.campos_extras).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm py-1 border-b border-border/50">
                            <span className="text-muted-foreground">{getLabel(key)}:</span>
                            <span className="font-medium">{(value as any) || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedObra(null)}>Fechar</Button>
            <Button onClick={() => toast.info("Edição de obras em breve")}>Editar Obra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

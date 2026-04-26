import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useObras } from '@/hooks/use-obras';
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
  LayoutGrid, Table as TableIcon, Plus 
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
import { cn } from '@/lib/utils';

const OBRA_FIELDS: ColumnDefinition[] = [
  { id: 'nome_obra', label: 'Nome da Obra', locked: false },
  { id: 'status', label: 'Status', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'endereco', label: 'Endereço', locked: false },
  { id: 'spe_cnpj', label: 'CNPJ/SPE', locked: false },
  { id: 'created_at', label: 'Data de Criação', locked: false },
];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  em_andamento: { label: 'Em andamento', variant: 'default' },
  ativa: { label: 'Ativa', variant: 'default' },
  concluida: { label: 'Concluída', variant: 'secondary' },
  parada: { label: 'Parada', variant: 'destructive' },
};

type SortOption = 'recent' | 'oldest' | 'name_asc' | 'name_desc';

export default function Obras() {
  const { data: obras, isLoading } = useObras();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sort, setSort] = useState<SortOption>('recent');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('obras_view_mode');
    return (saved as any) || 'cards';
  });

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
    <AppLayout title="Obras" subtitle="Gerencie e acompanhe todas as obras cadastradas.">
      <div className="p-4 md:p-6 space-y-6">
        <Tabs defaultValue="lista" className="space-y-6">
          <TabsList>
            <TabsTrigger value="lista" className="gap-2">
              <List className="h-4 w-4" /> Lista
            </TabsTrigger>
            <TabsTrigger value="mapa" className="gap-2">
              <MapIcon className="h-4 w-4" /> Mapa
            </TabsTrigger>
          </TabsList>

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
                        <Card key={obra.id} className="flex flex-col">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
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
                            <tr key={obra.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
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
    </AppLayout>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFabricantes } from '@/hooks/use-clientes';
import { useCreateFabricante } from '@/hooks/use-mutations';
import { useTabelaPrecos, useCreatePreco, useUpdatePreco, useDeletePreco, useUpdateFabricante, useDeleteFabricante, useCategorias } from '@/hooks/use-fabricantes';
import { Plus, Loader2, CheckCircle2, Search, Pencil, Trash2, Factory, Package, Phone, Mail, User, ArrowLeft, Hash, Upload, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ListPagination } from '@/components/ListPagination';
import { ProductImageUpload } from '@/components/catalogo/ProductImageUpload';
import { ImportCatalogoDialog } from '@/components/catalogo/ImportCatalogoDialog';
import { GlobalImportCatalogoDialog } from '@/components/catalogo/GlobalImportCatalogoDialog';
import { cn } from '@/lib/utils';
import { FilterButton } from '@/components/FilterButton';
import { Filter } from 'lucide-react';
import { SearchableSelect } from '@/components/SearchableSelect';
import { SearchWithRecent } from '@/components/SearchWithRecent';

const PRECOS_COLUMNS: ColumnDefinition[] = [
  { id: 'imagem', label: 'Imagem', locked: false },
  { id: 'descricao', label: 'Descrição', locked: false },
  { id: 'categoria', label: 'Categoria', locked: false },
  { id: 'referencia', label: 'Referência', locked: false },
  { id: 'preco', label: 'Preço Unit.', locked: false },
  { id: 'unidade', label: 'Unidade', locked: false },
  { id: 'status', label: 'Status', locked: false },
  { id: 'acoes', label: 'Ações', locked: false },
];

// ─── Fabricante Form Dialog ─────────────────────────────────────────
function FabricanteForm({ open, onOpenChange, editData }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editData?: { id: string; nome: string; cnpj?: string | null; nome_contato?: string | null; telefone?: string | null };
}) {
  const createFabricante = useCreateFabricante();
  const updateFabricante = useUpdateFabricante();
  const [cnpj, setCnpj] = useState(editData?.cnpj ?? '');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [nome, setNome] = useState(editData?.nome ?? '');
  const [contato, setContato] = useState(editData?.nome_contato ?? '');
  const [telefone, setTelefone] = useState(editData?.telefone ?? '');

  const reset = () => { setCnpj(''); setCnpjStatus('idle'); setNome(''); setContato(''); setTelefone(''); };

  const handleCnpjBlur = async () => {
    const digits = unmaskCnpj(cnpj);
    if (digits.length !== 14) return;
    if (!isValidCnpjDigits(digits)) { setCnpjStatus('invalid'); toast.error('CNPJ inválido'); return; }
    setCnpjStatus('loading');
    try {
      const data = await fetchCnpjData(digits);
      setCnpjStatus('valid');
      if (data.razao_social && !nome) setNome(data.razao_social);
      if (data.ddd_telefone_1 && !telefone) setTelefone(data.ddd_telefone_1);
      toast.success('CNPJ validado!');
    } catch { setCnpjStatus('invalid'); toast.error('CNPJ não encontrado'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unmaskCnpj(cnpj).length === 14 && !isValidCnpjDigits(unmaskCnpj(cnpj))) { toast.error('CNPJ inválido'); return; }
    try {
      if (editData) {
        await updateFabricante.mutateAsync({ id: editData.id, nome, cnpj: cnpj || undefined, nome_contato: contato || undefined, telefone: telefone || undefined });
        toast.success('Fabricante atualizado!');
      } else {
        await createFabricante.mutateAsync({ nome, cnpj: cnpj || undefined, nome_contato: contato || undefined, telefone: telefone || undefined });
        toast.success('Fabricante cadastrado!');
      }
      reset();
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const isPending = createFabricante.isPending || updateFabricante.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editData ? 'Editar' : 'Cadastrar'} Fabricante</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>CNPJ</Label>
            <div className="relative">
              <Input value={cnpj} onChange={e => { setCnpj(maskCnpj(e.target.value)); setCnpjStatus('idle'); }} onBlur={handleCnpjBlur} placeholder="00.000.000/0000-00"
                className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''} />
              {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
            </div>
          </div>
          <div><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do fabricante" /></div>
          <div><Label>Contato</Label><Input value={contato} onChange={e => setContato(e.target.value)} placeholder="Nome do contato" /></div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
          <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preco Form Dialog ──────────────────────────────────────────────
function PrecoForm({ open, onOpenChange, fabricanteId, editData }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId: string;
  editData?: { id: string; descricao_material: string; referencia?: string | null; preco_unitario: number; unidade?: string | null; vigente: boolean; categoria?: string | null; imagem_url?: string | null };
}) {
  const createPreco = useCreatePreco();
  const updatePreco = useUpdatePreco();
  const { data: categorias } = useCategorias();
  const [desc, setDesc] = useState(editData?.descricao_material ?? '');
  const [ref, setRef] = useState(editData?.referencia ?? '');
  const [preco, setPreco] = useState(editData?.preco_unitario?.toString() ?? '');
  const [unidade, setUnidade] = useState(editData?.unidade ?? 'un');
  const [vigente, setVigente] = useState(editData?.vigente ?? true);
  const [categoria, setCategoria] = useState(editData?.categoria ?? '');
  const [imagemUrl, setImagemUrl] = useState<string | null>(editData?.imagem_url ?? null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      descricao_material: desc,
      referencia: ref || undefined,
      preco_unitario: parseFloat(preco),
      unidade,
      vigente,
      categoria: categoria.trim() || null,
      imagem_url: imagemUrl,
    };
    try {
      if (editData) {
        await updatePreco.mutateAsync({ id: editData.id, ...payload });
        toast.success('Produto atualizado!');
      } else {
        await createPreco.mutateAsync({ fabricante_id: fabricanteId, ...payload });
        toast.success('Produto cadastrado!');
      }
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const isPending = createPreco.isPending || updatePreco.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editData ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="mb-2 block">Imagem</Label>
            <ProductImageUpload value={imagemUrl} onChange={setImagemUrl} fabricanteId={fabricanteId} />
          </div>
          <div><Label>Descrição do Material</Label><Input value={desc} onChange={e => setDesc(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Referência</Label><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="Código" /></div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                list="categorias-list"
                placeholder="Ex: Pisos, Louças"
              />
              <datalist id="categorias-list">
                {(categorias ?? []).map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço Unitário (R$)</Label><Input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} required /></div>
            <div>
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">un</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                  <SelectItem value="m²">m²</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="cx">cx</SelectItem>
                  <SelectItem value="pç">pç</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="vigente" checked={vigente} onChange={e => setVigente(e.target.checked)} className="rounded border-input" />
            <Label htmlFor="vigente">Produto vigente (disponível)</Label>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fabricante Card Component ──────────────────────────────────────
function FabricanteCard({ fab, isSelected, onClick }: {
  fab: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group
        ${isSelected
          ? 'border-primary bg-primary/8 shadow-[var(--shadow-card-hover)] ring-1 ring-primary/20'
          : 'border-border/60 hover:border-primary/30 hover:bg-muted/40 hover:shadow-[var(--shadow-card)]'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-colors duration-200
          ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
          <Factory className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{fab.nome}</p>
          <div className="flex items-center gap-2 mt-1">
            {fab.cnpj && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <Hash className="h-3 w-3 flex-shrink-0" />
                {fab.cnpj}
              </span>
            )}
          </div>
          {fab.nome_contato && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />
              {fab.nome_contato}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Detail Header Component ────────────────────────────────────────
function FabricanteDetailHeader({ fab, onEdit, onDelete }: {
  fab: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="rounded-xl border-border/60 overflow-hidden">
      <div className="h-1.5 w-full bg-[image:var(--gradient-brand)]" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Factory className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{fab.nome}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {fab.cnpj && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    {fab.cnpj}
                  </span>
                )}
                {fab.nome_contato && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {fab.nome_contato}
                  </span>
                )}
                {fab.telefone && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {fab.telefone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
const Fabricantes = () => {
  const { data: fabricantes, isLoading } = useFabricantes();
  const [selectedFabId, setSelectedFabId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fabDialog, setFabDialog] = useState(false);
  const [editFab, setEditFab] = useState<any>(null);
  const [precoDialog, setPrecoDialog] = useState(false);
  const [editPreco, setEditPreco] = useState<any>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [globalImportOpen, setGlobalImportOpen] = useState(false);
  const [deleteAlert, setDeleteAlert] = useState<{ type: 'fab' | 'preco'; id: string } | null>(null);

  const {
    columns: precoColumns,
    visibleColumns: visiblePrecoColumns,
    setVisibleColumns: setVisiblePrecoColumns,
    pageSize: precoPageSize,
    setPageSize: setPrecoPageSize,
    handleRename: handlePrecoRename,
    handleTypeChange: handlePrecoTypeChange,
    handleAddColumn: handleAddPrecoColumn,
    handleRemoveColumn: handleRemovePrecoColumn,
    handleReorder: handlePrecoReorder,
    getLabel: getPrecoLabel,
    presets: precoPresets,
    savePreset: savePrecoPreset,
    loadPreset: loadPrecoPreset,
    deletePreset: deletePrecoPreset
  } = useTableSettings({
    key: 'fabricantes_precos',
    defaultColumns: PRECOS_COLUMNS,
  });

  const deleteFabricante = useDeleteFabricante();
  const deletePreco = useDeletePreco();
  const { data: precos, isLoading: loadingPrecos } = useTabelaPrecos(selectedFabId);

  const [fabPage, setFabPage] = useState(1);
  const [fabPageSize, setFabPageSize] = useState(10);

  const selectedFab = fabricantes?.find(f => f.id === selectedFabId);
  const filtered = fabricantes?.filter(f => (f.nome || '').toLowerCase().includes(search.toLowerCase())) ?? [];
  const totalFabPages = Math.max(1, Math.ceil(filtered.length / fabPageSize));
  const paginatedFabs = filtered.slice((fabPage - 1) * fabPageSize, fabPage * fabPageSize);

  const categoriasPreco = Array.from(new Set((precos ?? []).map((p: any) => p.categoria).filter(Boolean))) as string[];
  const precosFiltrados = (precos ?? []).filter((p: any) => filtroCategoria === 'todas' || p.categoria === filtroCategoria);

  const hasFilters = filtroCategoria !== 'todas';
  const activeFilterCount = (filtroCategoria !== 'todas' ? 1 : 0);


  // precoColumns is now handled by the hook


  useEffect(() => {
    if (fabPage > totalFabPages) setFabPage(totalFabPages);
  }, [fabPage, totalFabPages]);

  const handleSearchChange = (val: string) => { setSearch(val); setFabPage(1); };

  const handleDelete = async () => {
    if (!deleteAlert) return;
    try {
      if (deleteAlert.type === 'fab') {
        const { error: precosError } = await supabase
          .from('tabela_precos')
          .delete()
          .eq('fabricante_id', deleteAlert.id);
        if (precosError) throw precosError;
        await deleteFabricante.mutateAsync(deleteAlert.id);
        if (selectedFabId === deleteAlert.id) setSelectedFabId(null);
        toast.success('Fabricante excluído!');
      } else {
        await deletePreco.mutateAsync(deleteAlert.id);
        toast.success('Item excluído!');
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('violates foreign key') || msg.includes('referenced')) {
        toast.error('Este fabricante possui pedidos vinculados e não pode ser excluído.');
      } else {
        toast.error(msg);
      }
    }
    setDeleteAlert(null);
  };

  // Mobile: show detail view when a fabricante is selected
  const showingDetail = !!selectedFab;

  return (
    <AppLayout title="Fabricantes & Tabelas de Preço" subtitle={`${fabricantes?.length ?? 0} fabricantes cadastrados`}>
      <div className="p-4 md:p-6 w-full">

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left Panel: Fabricantes List ─────────────────────── */}
          <div className={`lg:col-span-4 xl:col-span-3 ${showingDetail ? 'hidden lg:block' : ''}`}>
            <Card className="rounded-xl border-border/60 sticky top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Factory className="h-4 w-4 text-primary" /> Fabricantes
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {filtered.length} cadastrado{filtered.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setGlobalImportOpen(true)} className="gap-1.5 h-8">
                      <Upload className="h-3.5 w-3.5" /> Importar
                    </Button>
                    <Button size="sm" onClick={() => { setEditFab(null); setFabDialog(true); }} className="gap-1.5 h-8">
                      <Plus className="h-3.5 w-3.5" /> Novo
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <SearchWithRecent
                  placeholder="Buscar fabricante..."
                  value={search}
                  onValueChange={handleSearchChange}
                  storageKey="fabricantes_recent_searches"
                />

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <Factory className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhum fabricante encontrado</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Tente outro termo de busca</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {paginatedFabs.map(f => (
                        <FabricanteCard
                          key={f.id}
                          fab={f}
                          isSelected={selectedFabId === f.id}
                          onClick={() => setSelectedFabId(f.id)}
                        />
                      ))}
                    </div>
                    <ListPagination
                      page={fabPage}
                      totalPages={totalFabPages}
                      totalItems={filtered.length}
                      pageSize={fabPageSize}
                      onPageChange={setFabPage}
                      onPageSizeChange={(nextPageSize) => {
                        setFabPageSize(nextPageSize);
                        setFabPage(1);
                      }}
                      itemLabel="fabricante"
                      itemLabelPlural="fabricantes"
                      className="border-t border-border/50 pt-3"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right Panel: Details + Price Table ───────────────── */}
          <div className={`lg:col-span-8 xl:col-span-9 space-y-4 ${!showingDetail ? 'hidden lg:block' : ''}`}>
            {selectedFab ? (
              <>
                {/* Mobile back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden gap-1.5 mb-2 -ml-1 text-muted-foreground"
                  onClick={() => setSelectedFabId(null)}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>

                <FabricanteDetailHeader
                  fab={selectedFab}
                  onEdit={() => { setEditFab(selectedFab); setFabDialog(true); }}
                  onDelete={() => setDeleteAlert({ type: 'fab', id: selectedFab.id })}
                />

                {/* Price Table */}
                <Card className="rounded-xl border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" /> Catálogo de Produtos
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {precos?.length ?? 0} produto{(precos?.length ?? 0) !== 1 ? 's' : ''} cadastrado{(precos?.length ?? 0) !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <FilterButton
                          hasFilters={hasFilters}
                          activeFilterCount={activeFilterCount}
                          onClear={() => setFiltroCategoria('todas')}
                        >
                          <div className="space-y-2">
                            <Label className="text-xs uppercase text-muted-foreground font-semibold">Categoria</Label>
                            <SearchableSelect
                              options={[
                                { value: "todas", label: "Todas categorias" },
                                ...categoriasPreco.map(c => ({ value: c, label: c }))
                              ]}
                              value={filtroCategoria}
                              onValueChange={setFiltroCategoria}
                              placeholder="Filtrar por categoria"
                            />
                          </div>
                        </FilterButton>

                        <ColumnSettings
                          columns={precoColumns}
                          visibleColumns={visiblePrecoColumns}
                          onChange={setVisiblePrecoColumns}
                          onRename={handlePrecoRename}
                          onTypeChange={handlePrecoTypeChange}
                          onReorder={handlePrecoReorder}
                          onAdd={handleAddPrecoColumn}
                          onRemove={handleRemovePrecoColumn}
                          presets={precoPresets}
                          onSavePreset={savePrecoPreset}
                          onLoadPreset={loadPrecoPreset}
                          onDeletePreset={deletePrecoPreset}
                          className="h-8"
                        />
                        <Button size="sm" variant="outline" onClick={() => setImportDialog(true)} className="gap-1.5 h-8">
                          <Upload className="h-3.5 w-3.5" /> Importar
                        </Button>
                        <Button size="sm" onClick={() => { setEditPreco(null); setPrecoDialog(true); }} className="gap-1.5 h-8">
                          <Plus className="h-3.5 w-3.5" /> Novo Produto
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingPrecos ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : precosFiltrados.length > 0 ? (
                      <div className="rounded-lg border border-border/50 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              {visiblePrecoColumns.map(colId => (
                                <TableHead key={colId} className={cn("text-xs font-semibold whitespace-nowrap px-4 py-3", colId === 'imagem' && "w-16", colId === 'acoes' && "w-20")}>
                                  {getPrecoLabel(colId)}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {precosFiltrados.map((p: any) => {
                              const camposExtras = p.campos_extras || {};
                              return (
                                <TableRow key={p.id} className="group">
                                  {visiblePrecoColumns.map(colId => {
                                    const isCustom = colId.startsWith('custom_');
                                    if (isCustom) {
                                      return (
                                        <TableCell key={colId} className="text-xs text-muted-foreground">
                                          {camposExtras[colId] || '—'}
                                        </TableCell>
                                      );
                                    }

                                    switch (colId) {
                                      case 'imagem':
                                        return (
                                          <TableCell key={colId}>
                                            <div className="h-10 w-10 rounded-md bg-muted/40 border border-border/40 overflow-hidden flex items-center justify-center">
                                              {p.imagem_url ? (
                                                <img src={p.imagem_url} alt={p.descricao_material} className="h-full w-full object-cover" loading="lazy" />
                                              ) : (
                                                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                                              )}
                                            </div>
                                          </TableCell>
                                        );
                                      case 'descricao':
                                        return <TableCell key={colId} className="font-medium text-sm">{p.descricao_material}</TableCell>;
                                      case 'categoria':
                                        return (
                                          <TableCell key={colId} className="text-xs">
                                            {p.categoria ? <Badge variant="secondary" className="font-normal">{p.categoria}</Badge> : <span className="text-muted-foreground">-</span>}
                                          </TableCell>
                                        );
                                      case 'referencia':
                                        return <TableCell key={colId} className="text-sm text-muted-foreground">{p.referencia ?? '-'}</TableCell>;
                                      case 'preco':
                                        return (
                                          <TableCell key={colId} className="text-sm font-semibold text-foreground">
                                            {Number(p.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </TableCell>
                                        );
                                      case 'unidade':
                                        return <TableCell key={colId} className="text-sm text-muted-foreground">{p.unidade ?? '-'}</TableCell>;
                                      case 'status':
                                        return (
                                          <TableCell key={colId}>
                                            <Badge variant={p.vigente ? 'default' : 'secondary'} className={p.vigente ? 'bg-success/15 text-success border-success/20 hover:bg-success/20' : ''}>
                                              {p.vigente ? 'Vigente' : 'Inativo'}
                                            </Badge>
                                          </TableCell>
                                        );
                                      case 'acoes':
                                        return (
                                          <TableCell key={colId}>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPreco(p); setPrecoDialog(true); }}>
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteAlert({ type: 'preco', id: p.id })}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        );
                                      default:
                                        return <TableCell key={colId}>—</TableCell>;
                                    }
                                  })}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-12 text-center">
                        <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground font-medium">Nenhum produto cadastrado</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Adicione produtos ao catálogo deste fabricante</p>
                        <div className="flex gap-2 mt-4">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportDialog(true)}>
                            <Upload className="h-3.5 w-3.5" /> Importar planilha
                          </Button>
                          <Button size="sm" className="gap-1.5" onClick={() => { setEditPreco(null); setPrecoDialog(true); }}>
                            <Plus className="h-3.5 w-3.5" /> Adicionar produto
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="rounded-xl border-border/60">
                <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                    <Factory className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-base font-medium text-muted-foreground">Selecione um fabricante</p>
                  <p className="text-sm text-muted-foreground/60 mt-1 max-w-sm">
                    Escolha um fabricante na lista ao lado para visualizar seus detalhes e tabela de preços
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <FabricanteForm open={fabDialog} onOpenChange={setFabDialog} editData={editFab} />
      {selectedFabId && <PrecoForm open={precoDialog} onOpenChange={setPrecoDialog} fabricanteId={selectedFabId} editData={editPreco} />}
      {selectedFabId && (
        <ImportCatalogoDialog
          open={importDialog}
          onOpenChange={setImportDialog}
          fabricanteId={selectedFabId}
          fabricanteNome={selectedFab?.nome}
        />
      )}

      <GlobalImportCatalogoDialog 
        open={globalImportOpen} 
        onOpenChange={setGlobalImportOpen} 
        onFabricanteChange={(id) => {
          setSelectedFabId(id);
          setGlobalImportOpen(false);
        }}
      />

      <AlertDialog open={!!deleteAlert} onOpenChange={(o) => !o && setDeleteAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Deseja continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Fabricantes;

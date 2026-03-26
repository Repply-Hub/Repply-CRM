import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFabricantes } from '@/hooks/use-clientes';
import { useCreateFabricante } from '@/hooks/use-mutations';
import { useTabelaPrecos, useCreatePreco, useUpdatePreco, useDeletePreco, useUpdateFabricante, useDeleteFabricante } from '@/hooks/use-fabricantes';
import { Plus, Loader2, CheckCircle2, Search, Pencil, Trash2, Factory, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';

const PRECOS_COLUMNS: ColumnDefinition[] = [
  { id: 'descricao', label: 'Descrição', locked: true },
  { id: 'referencia', label: 'Referência' },
  { id: 'preco', label: 'Preço Unit.' },
  { id: 'unidade', label: 'Unidade' },
  { id: 'status', label: 'Status' },
  { id: 'acoes', label: 'Ações' },
];
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
          <div><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome do fabricante" /></div>
          <div><Label>Contato</Label><Input value={contato} onChange={e => setContato(e.target.value)} placeholder="Nome do contato" /></div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
          <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PrecoForm({ open, onOpenChange, fabricanteId, editData }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId: string;
  editData?: { id: string; descricao_material: string; referencia?: string | null; preco_unitario: number; unidade?: string | null; vigente: boolean };
}) {
  const createPreco = useCreatePreco();
  const updatePreco = useUpdatePreco();
  const [desc, setDesc] = useState(editData?.descricao_material ?? '');
  const [ref, setRef] = useState(editData?.referencia ?? '');
  const [preco, setPreco] = useState(editData?.preco_unitario?.toString() ?? '');
  const [unidade, setUnidade] = useState(editData?.unidade ?? 'un');
  const [vigente, setVigente] = useState(editData?.vigente ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { descricao_material: desc, referencia: ref || undefined, preco_unitario: parseFloat(preco), unidade, vigente };
    try {
      if (editData) {
        await updatePreco.mutateAsync({ id: editData.id, ...payload });
        toast.success('Preço atualizado!');
      } else {
        await createPreco.mutateAsync({ fabricante_id: fabricanteId, ...payload });
        toast.success('Preço cadastrado!');
      }
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const isPending = createPreco.isPending || updatePreco.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editData ? 'Editar' : 'Novo'} Item de Preço</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div><Label>Descrição do Material</Label><Input value={desc} onChange={e => setDesc(e.target.value)} required /></div>
          <div><Label>Referência</Label><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="Código de referência" /></div>
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
            <Label htmlFor="vigente">Preço vigente</Label>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Fabricantes = () => {
  const { data: fabricantes, isLoading } = useFabricantes();
  const [selectedFabId, setSelectedFabId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fabDialog, setFabDialog] = useState(false);
  const [editFab, setEditFab] = useState<any>(null);
  const [precoDialog, setPrecoDialog] = useState(false);
  const [editPreco, setEditPreco] = useState<any>(null);
  const [deleteAlert, setDeleteAlert] = useState<{ type: 'fab' | 'preco'; id: string } | null>(null);

  // Column visibility state for Price Table
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('precos_columns');
    return saved ? JSON.parse(saved) : PRECOS_COLUMNS.map(c => c.id);
  });

  const handleColumnChange = (newColumns: string[]) => {
    setVisibleColumns(newColumns);
    localStorage.setItem('precos_columns', JSON.stringify(newColumns));
  };

  const deleteFabricante = useDeleteFabricante();
  const deletePreco = useDeletePreco();
  const { data: precos, isLoading: loadingPrecos } = useTabelaPrecos(selectedFabId);

  const [fabPage, setFabPage] = useState(1);
  const FAB_PER_PAGE = 10;

  const selectedFab = fabricantes?.find(f => f.id === selectedFabId);
  const filtered = fabricantes?.filter(f => f.nome.toLowerCase().includes(search.toLowerCase())) ?? [];
  const totalFabPages = Math.max(1, Math.ceil(filtered.length / FAB_PER_PAGE));
  const paginatedFabs = filtered.slice((fabPage - 1) * FAB_PER_PAGE, fabPage * FAB_PER_PAGE);

  // Reset page when search changes
  const handleSearchChange = (val: string) => { setSearch(val); setFabPage(1); };

  const handleDelete = async () => {
    if (!deleteAlert) return;
    try {
      if (deleteAlert.type === 'fab') {
        // Delete related precos first
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

  return (
    <AppLayout title="Fabricantes & Tabelas de Preço" subtitle="Gerencie fabricantes e suas tabelas de preço">
      <div className="p-6">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Fabricantes list */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Factory className="h-4 w-4" /> Fabricantes</CardTitle>
                <CardDescription>{filtered.length} cadastrados</CardDescription>
              </div>
              <Button size="sm" onClick={() => { setEditFab(null); setFabDialog(true); }}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar fabricante..." value={search} onChange={e => handleSearchChange(e.target.value)} className="pl-9" />
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filtered.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFabId(f.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${selectedFabId === f.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted/50'
                        }`}
                    >
                      <p className="font-medium text-sm text-foreground">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">{f.cnpj || 'Sem CNPJ'} · {f.nome_contato || 'Sem contato'}</p>
                    </button>
                  ))}
                  {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum fabricante encontrado</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Details + Price table */}
          <div className="lg:col-span-2 space-y-4">
            {selectedFab ? (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedFab.nome}</CardTitle>
                      <CardDescription className="space-x-3">
                        <span>CNPJ: {selectedFab.cnpj ?? '-'}</span>
                        <span>Contato: {selectedFab.nome_contato ?? '-'}</span>
                        <span>Tel: {selectedFab.telefone ?? '-'}</span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditFab(selectedFab); setFabDialog(true); }}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteAlert({ type: 'fab', id: selectedFab.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Tabela de Preços</CardTitle>
                      <CardDescription>{precos?.length ?? 0} itens</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <ColumnSettings
                        columns={PRECOS_COLUMNS}
                        visibleColumns={visibleColumns}
                        onChange={handleColumnChange}
                      />
                      <Button size="sm" onClick={() => { setEditPreco(null); setPrecoDialog(true); }}>
                        <Plus className="h-4 w-4 mr-1" /> Novo Item
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingPrecos ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : precos && precos.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {visibleColumns.includes('descricao') && <TableHead>Descrição</TableHead>}
                            {visibleColumns.includes('referencia') && <TableHead>Referência</TableHead>}
                            {visibleColumns.includes('preco') && <TableHead>Preço Unit.</TableHead>}
                            {visibleColumns.includes('unidade') && <TableHead>Unidade</TableHead>}
                            {visibleColumns.includes('status') && <TableHead>Status</TableHead>}
                            {visibleColumns.includes('acoes') && <TableHead className="w-20">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {precos.map(p => (
                            <TableRow key={p.id}>
                              {visibleColumns.includes('descricao') && <TableCell className="font-medium">{p.descricao_material}</TableCell>}
                              {visibleColumns.includes('referencia') && <TableCell>{p.referencia ?? '-'}</TableCell>}
                              {visibleColumns.includes('preco') && <TableCell>{p.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>}
                              {visibleColumns.includes('unidade') && <TableCell>{p.unidade ?? '-'}</TableCell>}
                              {visibleColumns.includes('status') && <TableCell><Badge variant={p.vigente ? 'default' : 'secondary'}>{p.vigente ? 'Vigente' : 'Inativo'}</Badge></TableCell>}
                              {visibleColumns.includes('acoes') && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPreco(p); setPrecoDialog(true); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteAlert({ type: 'preco', id: p.id })}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum item de preço cadastrado</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Factory className="h-12 w-12 mb-3 opacity-40" />
                  <p className="text-sm">Selecione um fabricante para ver detalhes e tabela de preços</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <FabricanteForm open={fabDialog} onOpenChange={setFabDialog} editData={editFab} />
      {selectedFabId && <PrecoForm open={precoDialog} onOpenChange={setPrecoDialog} fabricanteId={selectedFabId} editData={editPreco} />}

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

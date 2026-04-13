import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { useClientes, useContatos } from '@/hooks/use-clientes';
import { useCreateCliente, useCreateContato, useDeleteCliente, useDeleteContato } from '@/hooks/use-mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2, Users, Phone, Mail, ChevronLeft, ChevronRight, Trash2, Settings2, Upload, FileDown, FileSpreadsheet, FileText, Columns3 } from 'lucide-react';
import { ImportClientesDialog } from '@/components/ImportClientesDialog';
import { ExportClientesButton } from '@/components/ExportClientesButton';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';

const CLIENTE_FIELDS: ColumnDefinition[] = [
  { id: 'empresa', label: 'Nome/Empresa', locked: true },
  { id: 'tipo', label: 'Tipo' },
  { id: 'cnpj', label: 'CPF/CNPJ' },
  { id: 'email', label: 'E-mail' },
  { id: 'endereco', label: 'Endereço' },
  { id: 'obras_count', label: 'Qtd. Obras' },
];

const CONTATO_FIELDS: ColumnDefinition[] = [
  { id: 'nome_contato', label: 'Nome', locked: true },
  { id: 'empresa', label: 'Empresa' },
  { id: 'email', label: 'E-mail' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'cargo', label: 'Cargo' },
];

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User, condominio: Building2, hospital: Building2, distribuidor: Store, hotel: Building2, escola: Building2, instalador: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física', condominio: 'Condomínio', hospital: 'Hospital', distribuidor: 'Distribuidor', hotel: 'Hotel', escola: 'Escola', instalador: 'Instalador' };

type ViewTab = 'empresas' | 'contatos';

const Clientes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients, isLoading: loadingClientes } = useClientes();
  const { data: contatosList, isLoading: loadingContatos } = useContatos();
  const createCliente = useCreateCliente();
  const createContato = useCreateContato();
  const deleteCliente = useDeleteCliente();
  const deleteContato = useDeleteContato();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [activeTab, setActiveTab] = useState<ViewTab>('empresas');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);
  const [typedConfirmOpen, setTypedConfirmOpen] = useState(false);
  const [typedConfirmText, setTypedConfirmText] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [tipo, setTipo] = useState('construtora');
  const [cnpj, setCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [empresa, setEmpresa] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [telefone, setTelefone] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [cargo, setCargo] = useState('');

  const [visibleFields, setVisibleFields] = useState<string[]>(() => {
    const saved = localStorage.getItem('clientes_fields');
    return saved ? JSON.parse(saved) : CLIENTE_FIELDS.map(c => c.id);
  });

  const [visibleContatoFields, setVisibleContatoFields] = useState<string[]>(() => {
    const saved = localStorage.getItem('contatos_fields');
    return saved ? JSON.parse(saved) : CONTATO_FIELDS.map(c => c.id);
  });

  const handleFieldChange = (newFields: string[]) => {
    setVisibleFields(newFields);
    localStorage.setItem('clientes_fields', JSON.stringify(newFields));
  };

  const handleContatoFieldChange = (newFields: string[]) => {
    setVisibleContatoFields(newFields);
    localStorage.setItem('contatos_fields', JSON.stringify(newFields));
  };

  const empresas = clients ?? [];
  const contatos = contatosList ?? [];
  const isLoading = activeTab === 'empresas' ? loadingClientes : loadingContatos;
  const totalCount = (clients?.length ?? 0) + (contatosList?.length ?? 0);

  const filteredEmpresas = empresas.filter(c => {
    const matchSearch = c.empresa.toLowerCase().includes(search.toLowerCase()) ||
      (c.nome_contato && c.nome_contato.toLowerCase().includes(search.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  const filteredContatos = contatos.filter(c => {
    const s = search.toLowerCase();
    return (c.nome_contato && c.nome_contato.toLowerCase().includes(s)) ||
      (c.empresa && c.empresa.toLowerCase().includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s));
  });

  const filtered = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedEmpresas = filteredEmpresas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paginatedContatos = filteredContatos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tipoFilterOptions = [
    { value: 'todos', label: 'Todos os tipos' },
    { value: 'construtora', label: 'Construtora' },
    { value: 'loja', label: 'Loja' },
    { value: 'pessoa_fisica', label: 'Pessoa Física' },
    { value: 'condominio', label: 'Condomínio' },
    { value: 'hospital', label: 'Hospital' },
    { value: 'distribuidor', label: 'Distribuidor' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'escola', label: 'Escola' },
    { value: 'instalador', label: 'Instalador' },
  ];

  const handleCnpjChange = (value: string) => {
    setCnpj(maskCnpj(value));
    setCnpjStatus('idle');
  };

  const handleCnpjBlur = async () => {
    const digits = unmaskCnpj(cnpj);
    if (digits.length !== 14) return;
    if (!isValidCnpjDigits(digits)) {
      setCnpjStatus('invalid');
      toast.error('CNPJ inválido (dígitos verificadores incorretos)');
      return;
    }
    setCnpjStatus('loading');
    try {
      const data = await fetchCnpjData(digits);
      setCnpjStatus('valid');
      if (data.razao_social && !empresa) setEmpresa(data.razao_social);
      if (data.razao_social && !razaoSocial) setRazaoSocial(data.razao_social);
      if (!endereco.logradouro) {
        setEndereco(prev => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          numero: data.numero || prev.numero,
          bairro: data.bairro || prev.bairro,
          cidade: data.municipio || prev.cidade,
          uf: data.uf || prev.uf,
          cep: data.cep || prev.cep,
        }));
      }
      if (data.ddd_telefone_1 && !telefone) setTelefone(data.ddd_telefone_1);
      toast.success('CNPJ validado! Dados preenchidos automaticamente.');
    } catch {
      setCnpjStatus('invalid');
      toast.error('CNPJ não encontrado na Receita Federal');
    }
  };

  const resetForm = () => {
    setCnpj(''); setEmpresa(''); setRazaoSocial(''); setEndereco(emptyEndereco);
    setTelefone(''); setCnpjStatus('idle'); setNomeContato(''); setCargo('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    if (activeTab === 'contatos') {
      try {
        await createContato.mutateAsync({
          empresa: empresa || 'Sem empresa',
          nome_contato: nomeContato || undefined,
          email: (form.get('email') as string) || undefined,
          telefone: telefone || undefined,
          cargo: cargo || undefined,
        });
        toast.success('Contato cadastrado com sucesso!');
        resetForm();
        setDialogOpen(false);
      } catch (err: any) {
        toast.error(err.message);
      }
      return;
    }

    if (unmaskCnpj(cnpj).length === 14 && !isValidCnpjDigits(unmaskCnpj(cnpj))) {
      toast.error('CNPJ inválido');
      return;
    }
    const enderecoStr = enderecoToString(endereco);
    try {
      await createCliente.mutateAsync({
        empresa: empresa || (form.get('empresa') as string),
        razao_social: razaoSocial || undefined,
        tipo,
        cnpj: cnpj || undefined,
        email: (form.get('email') as string) || undefined,
        telefone: telefone || undefined,
        endereco: enderecoStr || undefined,
      });
      toast.success('Empresa cadastrada com sucesso!');
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as ViewTab);
    setTipoFilter('todos');
    setSearch('');
    setPage(1);
    setSelected(new Set());
  };

  const currentPageIds = activeTab === 'empresas'
    ? paginatedEmpresas.map(c => c.id)
    : paginatedContatos.map(c => c.id);

  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectAllDialogOpen(true);
    }
  };

  const selectPageOnly = () => {
    setSelected(prev => {
      const next = new Set(prev);
      currentPageIds.forEach(id => next.add(id));
      return next;
    });
    setSelectAllDialogOpen(false);
  };

  const selectAllFiltered = () => {
    const allIds = filtered.map((item: any) => item.id);
    setSelected(new Set(allIds));
    setSelectAllDialogOpen(false);
  };

  const openTypedConfirm = () => {
    setTypedConfirmText('');
    setTypedConfirmOpen(true);
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selected);
      const table = activeTab === 'empresas' ? 'clientes' : 'contatos';
      const BATCH_SIZE = 500;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from(table).delete().in('id', batch);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: [activeTab === 'empresas' ? 'clientes' : 'contatos'] });
      toast.success(`${ids.length} ${activeTab === 'empresas' ? 'empresa(s)' : 'contato(s)'} removido(s)!`);
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover');
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const exportToFile = (data: any[], type: 'empresas' | 'contatos', format: 'xlsx' | 'csv') => {
    if (data.length === 0) { toast.error('Nenhum dado para exportar'); return; }
    const XLSX_LIB = require('xlsx');
    const rows = type === 'empresas'
      ? data.map((c: any) => ({ Nome: c.empresa || '', Tipo: c.tipo || '', 'CPF/CNPJ': c.cnpj || '', Email: c.email || '', Telefone: c.telefone || '', Endereço: c.endereco || '' }))
      : data.map((c: any) => ({ Nome: c.nome_contato || '', Empresa: c.empresa || '', Email: c.email || '', Telefone: c.telefone || '', Cargo: c.cargo || '' }));
    const ws = XLSX_LIB.utils.json_to_sheet(rows);
    const wb = XLSX_LIB.utils.book_new();
    XLSX_LIB.utils.book_append_sheet(wb, ws, type === 'empresas' ? 'Empresas' : 'Contatos');
    XLSX_LIB.writeFile(wb, `${type}_${new Date().toISOString().slice(0, 10)}.${format}`, format === 'csv' ? { bookType: 'csv' } : undefined);
    toast.success('Arquivo exportado com sucesso!');
  };

  return (
    <AppLayout title="Clientes" subtitle={`${totalCount} cadastrados`}>
      <div className="p-6 max-w-[1400px] mx-auto">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-4">
          <TabsList>
            <TabsTrigger value="empresas" className="gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{empresas.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="contatos" className="gap-2">
              <Users className="h-4 w-4" />
              Contatos
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{contatos.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={activeTab === 'empresas' ? 'Buscar empresas...' : 'Buscar contatos...'}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {activeTab === 'empresas' && (
            <Select value={tipoFilter} onValueChange={(v) => { setTipoFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
              <SelectContent>
                {tipoFilterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Configurações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setColumnsOpen(true)}>
                <Columns3 className="h-4 w-4 mr-2" /> Colunas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                const data = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
                exportToFile(data, activeTab, 'xlsx');
              }}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const data = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
                exportToFile(data, activeTab, 'csv');
              }}>
                <FileText className="h-4 w-4 mr-2" /> Exportar CSV
              </DropdownMenuItem>
              {activeTab === 'empresas' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Importar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column settings popover (controlled) */}
          <ColumnSettings
            columns={activeTab === 'empresas' ? CLIENTE_FIELDS : CONTATO_FIELDS}
            visibleColumns={activeTab === 'empresas' ? visibleFields : visibleContatoFields}
            onChange={activeTab === 'empresas' ? handleFieldChange : handleContatoFieldChange}
            open={columnsOpen}
            onOpenChange={setColumnsOpen}
            hideTrigger
          />
          {/* Import dialog (controlled) */}
          <ImportClientesDialog open={importOpen} onOpenChange={setImportOpen} hideTrigger />
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {activeTab === 'empresas' ? 'Nova Empresa' : 'Novo Contato'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{activeTab === 'empresas' ? 'Cadastrar Empresa' : 'Cadastrar Contato'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {activeTab === 'empresas' ? (
                  <>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={tipo} onValueChange={setTipo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="construtora">Construtora</SelectItem>
                          <SelectItem value="loja">Loja</SelectItem>
                          <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                          <SelectItem value="condominio">Condomínio</SelectItem>
                          <SelectItem value="hospital">Hospital</SelectItem>
                          <SelectItem value="distribuidor">Distribuidor</SelectItem>
                          <SelectItem value="hotel">Hotel</SelectItem>
                          <SelectItem value="escola">Escola</SelectItem>
                          <SelectItem value="instalador">Instalador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>CNPJ</Label>
                      <div className="relative">
                        <Input
                          value={cnpj}
                          onChange={(e) => handleCnpjChange(e.target.value)}
                          onBlur={handleCnpjBlur}
                          placeholder="00.000.000/0000-00"
                          className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''}
                        />
                        {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                        {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Ao sair do campo, o CNPJ será validado e os dados preenchidos automaticamente</p>
                    </div>
                    <div><Label>Nome</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} required placeholder="Nome fantasia ou nome" /></div>
                    <div><Label>Razão Social</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social da empresa" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                      <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
                    </div>
                    <EnderecoForm value={endereco} onChange={setEndereco} />
                  </>
                ) : (
                  <>
                    <div><Label>Nome do contato</Label><Input value={nomeContato} onChange={e => setNomeContato(e.target.value)} required placeholder="Nome completo" /></div>
                    <div><Label>Empresa</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Empresa vinculada" /></div>
                    <div><Label>Cargo</Label><Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Cargo ou função" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                      <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full" disabled={createCliente.isPending || createContato.isPending}>
                  {(createCliente.isPending || createContato.isPending) ? 'Salvando...' : 'Salvar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {someSelected && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <span className="text-sm font-medium text-foreground">{selected.size} selecionado(s)</span>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={openTypedConfirm}>
              <Trash2 className="h-4 w-4" /> Remover selecionados
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </div>
        )}

        {/* Dialog: selecionar página ou todos */}
        <AlertDialog open={selectAllDialogOpen} onOpenChange={setSelectAllDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Selecionar {activeTab === 'empresas' ? 'empresas' : 'contatos'}</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja selecionar apenas os {currentPageIds.length} desta página ou todos os {filtered.length} {activeTab === 'empresas' ? 'empresas' : 'contatos'} filtrados?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button variant="outline" onClick={selectPageOnly}>Apenas esta página ({currentPageIds.length})</Button>
              <Button variant="destructive" onClick={selectAllFiltered}>Todos ({filtered.length})</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog: confirmação por escrito */}
        <Dialog open={typedConfirmOpen} onOpenChange={(o) => { setTypedConfirmOpen(o); if (!o) setTypedConfirmText(''); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Confirmar exclusão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Você está prestes a excluir <strong className="text-foreground">{selected.size}</strong> {activeTab === 'empresas' ? 'empresa(s)' : 'contato(s)'} permanentemente.
              </p>
              <p className="text-sm text-muted-foreground">
                Digite <strong className="text-foreground">CONFIRMAR</strong> para prosseguir:
              </p>
              <Input
                value={typedConfirmText}
                onChange={e => setTypedConfirmText(e.target.value)}
                placeholder="Digite CONFIRMAR"
                className="uppercase"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTypedConfirmOpen(false)} disabled={isDeleting}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={typedConfirmText.toUpperCase() !== 'CONFIRMAR' || isDeleting}
                onClick={async () => {
                  await handleBulkDelete();
                  setTypedConfirmOpen(false);
                  setTypedConfirmText('');
                }}
              >
                {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir permanentemente'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            {activeTab === 'empresas' ? <Building2 className="h-12 w-12 mb-3 opacity-30" /> : <Users className="h-12 w-12 mb-3 opacity-30" />}
            <p className="text-sm font-medium">Nenhum {activeTab === 'empresas' ? 'empresa' : 'contato'} encontrado</p>
            <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre um novo</p>
          </div>
        ) : activeTab === 'empresas' ? (
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-2.5 px-4 w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                  </th>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs">Nome/Empresa</th>
                  {visibleFields.includes('tipo') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs">Tipo</th>}
                  {visibleFields.includes('cnpj') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">CPF/CNPJ</th>}
                  {visibleFields.includes('email') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden lg:table-cell">E-mail</th>}
                  {visibleFields.includes('endereco') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden xl:table-cell">Endereço</th>}
                  {visibleFields.includes('obras_count') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">Obras</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedEmpresas.map(client => {
                  const Icon = tipoIcons[client.tipo] ?? Building2;
                  return (
                    <tr key={client.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${selected.has(client.id) ? 'bg-primary/5' : ''}`}>
                      <td className="py-2.5 px-4 w-10" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(client.id)} onCheckedChange={() => toggleOne(client.id)} aria-label={`Selecionar ${client.empresa}`} />
                      </td>
                      <td className="py-2.5 px-4" onClick={() => navigate(`/clientes/${client.id}`)}>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium truncate max-w-[200px]">{client.empresa}</span>
                        </div>
                      </td>
                      {visibleFields.includes('tipo') && (
                        <td className="py-2.5 px-4" onClick={() => navigate(`/clientes/${client.id}`)}>
                          <Badge variant="secondary" className="text-[10px] font-medium">{tipoLabels[client.tipo] ?? client.tipo}</Badge>
                        </td>
                      )}
                      {visibleFields.includes('cnpj') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden md:table-cell" onClick={() => navigate(`/clientes/${client.id}`)}>{client.cnpj || '—'}</td>}
                      {visibleFields.includes('email') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[200px]" onClick={() => navigate(`/clientes/${client.id}`)}>{client.email || '—'}</td>}
                      {visibleFields.includes('endereco') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden xl:table-cell truncate max-w-[250px]" onClick={() => navigate(`/clientes/${client.id}`)}>{client.endereco || '—'}</td>}
                      {visibleFields.includes('obras_count') && <td className="py-2.5 px-4 text-xs hidden md:table-cell" onClick={() => navigate(`/clientes/${client.id}`)}>{client.obras?.length ? <span className="text-primary font-medium">{client.obras.length}</span> : '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-2.5 px-4 w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                  </th>
                  {visibleContatoFields.includes('nome_contato') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs">Nome</th>}
                  {visibleContatoFields.includes('empresa') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs">Empresa</th>}
                  {visibleContatoFields.includes('cargo') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">Cargo</th>}
                  {visibleContatoFields.includes('email') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden lg:table-cell">E-mail</th>}
                  {visibleContatoFields.includes('telefone') && <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">Telefone</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedContatos.map(contato => (
                  <tr key={contato.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selected.has(contato.id) ? 'bg-primary/5' : ''}`}>
                    <td className="py-2.5 px-4 w-10">
                      <Checkbox checked={selected.has(contato.id)} onCheckedChange={() => toggleOne(contato.id)} aria-label={`Selecionar ${contato.nome_contato}`} />
                    </td>
                    {visibleContatoFields.includes('nome_contato') && (
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium truncate max-w-[200px]">{contato.nome_contato || 'Sem nome'}</span>
                        </div>
                      </td>
                    )}
                    {visibleContatoFields.includes('empresa') && <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[200px]">{contato.empresa || '—'}</td>}
                    {visibleContatoFields.includes('cargo') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden md:table-cell">{contato.cargo || '—'}</td>}
                    {visibleContatoFields.includes('email') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">{contato.email || '—'}</td>}
                    {visibleContatoFields.includes('telefone') && <td className="py-2.5 px-4 text-xs text-muted-foreground hidden md:table-cell">{contato.telefone || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>
              Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <Button key={pageNum} variant={page === pageNum ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setPage(pageNum)}>
                    {pageNum}
                  </Button>
                );
              })}
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Clientes;

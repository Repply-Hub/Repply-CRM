import { useState, useRef, useEffect } from 'react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2, Users, Phone, Mail, Trash2, Settings2, Upload, FileDown, FileSpreadsheet, FileText, Columns3, ListFilter, ArrowUpDown } from 'lucide-react';
import { ImportClientesDialog } from '@/components/ImportClientesDialog';

import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';
import { ListPagination } from '@/components/ListPagination';
import { cn } from '@/lib/utils';

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
const baseTipos = ['construtora', 'loja', 'pessoa_fisica', 'condominio', 'hospital', 'distribuidor', 'hotel', 'escola', 'instalador'];

const getTipoLabel = (value: string, customTipos: { value: string; label: string }[]) =>
  tipoLabels[value] ?? customTipos.find(t => t.value === value)?.label ?? value;
const getTipoIcon = (value: string) => tipoIcons[value] ?? Building2;

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
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<ViewTab>('empresas');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);
  const [typedConfirmOpen, setTypedConfirmOpen] = useState(false);
  const [typedConfirmText, setTypedConfirmText] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  
  const [tipo, setTipo] = useState('construtora');
  const [cnpj, setCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [empresa, setEmpresa] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [telefone, setTelefone] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [cargo, setCargo] = useState('');
  const [customTipos, setCustomTipos] = useState<{ value: string; label: string }[]>(() => {
    const saved = localStorage.getItem('clientes_custom_tipos');
    return saved ? JSON.parse(saved) : [];
  });
  const [hiddenTipos, setHiddenTipos] = useState<string[]>(() => {
    const saved = localStorage.getItem('clientes_hidden_tipos');
    return saved ? JSON.parse(saved) : [];
  });
  const [newTipoOpen, setNewTipoOpen] = useState(false);
  const [newTipoName, setNewTipoName] = useState('');
  const [newTipoTarget, setNewTipoTarget] = useState<'form' | 'filter'>('form');
  const [confirmDeleteTipo, setConfirmDeleteTipo] = useState<{ value: string; label: string } | null>(null);

  const handleDeleteTipo = (value: string) => {
    // Remove de personalizados, se for; senão, oculta o tipo padrão
    const isCustom = customTipos.some(t => t.value === value);
    if (isCustom) {
      const next = customTipos.filter(t => t.value !== value);
      setCustomTipos(next);
      localStorage.setItem('clientes_custom_tipos', JSON.stringify(next));
    } else {
      const next = Array.from(new Set([...hiddenTipos, value]));
      setHiddenTipos(next);
      localStorage.setItem('clientes_hidden_tipos', JSON.stringify(next));
    }
    // Recalcula próxima opção válida para tipo do form
    const remaining = baseTipos.filter(v => v !== value && !(isCustom ? hiddenTipos : [...hiddenTipos, value]).includes(v));
    const fallback = remaining[0] ?? customTipos.find(t => t.value !== value)?.value ?? '';
    if (tipo === value) setTipo(fallback);
    if (tipoFilter === value) setTipoFilter('todos');
    toast.success('Tipo excluído');
    setConfirmDeleteTipo(null);
  };

  const handleCreateTipo = () => {
    const label = newTipoName.trim();
    if (!label) {
      toast.error('Informe um nome para o tipo');
      return;
    }
    const value = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!value) {
      toast.error('Nome inválido');
      return;
    }
    const baseTipos = ['construtora', 'loja', 'pessoa_fisica', 'condominio', 'hospital', 'distribuidor', 'hotel', 'escola', 'instalador'];
    if (baseTipos.includes(value) || customTipos.some(t => t.value === value)) {
      // Se for um padrão oculto, basta reexibi-lo
      if (baseTipos.includes(value) && hiddenTipos.includes(value)) {
        const next = hiddenTipos.filter(v => v !== value);
        setHiddenTipos(next);
        localStorage.setItem('clientes_hidden_tipos', JSON.stringify(next));
        if (newTipoTarget === 'form') setTipo(value);
        else setTipoFilter(value);
        setNewTipoName('');
        setNewTipoOpen(false);
        toast.success(`Tipo "${tipoLabels[value] ?? label}" reativado`);
        return;
      }
      toast.error('Esse tipo já existe');
      return;
    }
    const next = [...customTipos, { value, label }];
    setCustomTipos(next);
    localStorage.setItem('clientes_custom_tipos', JSON.stringify(next));
    if (newTipoTarget === 'form') setTipo(value);
    else setTipoFilter(value);
    setNewTipoName('');
    setNewTipoOpen(false);
    toast.success(`Tipo "${label}" criado`);
  };

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

  const sortByName = <T extends { empresa?: string | null; nome_contato?: string | null }>(arr: T[], key: 'empresa' | 'nome_contato') => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const av = ((a[key] as string | null | undefined) ?? '').toLowerCase();
      const bv = ((b[key] as string | null | undefined) ?? '').toLowerCase();
      return av.localeCompare(bv, 'pt-BR') * dir;
    });
  };

  const filteredEmpresas = sortByName(
    empresas.filter(c => {
      const matchSearch = c.empresa.toLowerCase().includes(search.toLowerCase()) ||
        (c.nome_contato && c.nome_contato.toLowerCase().includes(search.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
      const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter;
      return matchSearch && matchTipo;
    }),
    'empresa',
  );

  const filteredContatos = sortByName(
    contatos.filter(c => {
      const s = search.toLowerCase();
      return (c.nome_contato && c.nome_contato.toLowerCase().includes(s)) ||
        (c.empresa && c.empresa.toLowerCase().includes(s)) ||
        (c.email && c.email.toLowerCase().includes(s));
    }),
    'nome_contato',
  );

  const filtered = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedEmpresas = filteredEmpresas.slice((page - 1) * pageSize, page * pageSize);
  const paginatedContatos = filteredContatos.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const tipoFilterOptions = [
    { value: 'todos', label: 'Todos os tipos' },
    ...baseTipos.filter(v => !hiddenTipos.includes(v)).map(v => ({ value: v, label: tipoLabels[v] })),
    ...customTipos,
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
    import('xlsx').then(XLSX => {
      const rows = type === 'empresas'
        ? data.map((c: any) => ({ Nome: c.empresa || '', Tipo: c.tipo || '', 'CPF/CNPJ': c.cnpj || '', Email: c.email || '', Telefone: c.telefone || '', Endereço: c.endereco || '' }))
        : data.map((c: any) => ({ Nome: c.nome_contato || '', Empresa: c.empresa || '', Email: c.email || '', Telefone: c.telefone || '', Cargo: c.cargo || '' }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type === 'empresas' ? 'Empresas' : 'Contatos');
      XLSX.writeFile(wb, `${type}_${new Date().toISOString().slice(0, 10)}.${format}`, format === 'csv' ? { bookType: 'csv' } : undefined);
      toast.success('Arquivo exportado com sucesso!');
    });
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
              >
                <ListFilter className="h-4 w-4" />
                <span className="hidden sm:inline">Filtros</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className={activeTab === 'empresas' ? 'w-auto min-w-[420px] p-4' : 'w-auto min-w-[220px] p-4'}
            >
              <div className={activeTab === 'empresas' ? 'flex gap-0 divide-x divide-border' : ''}>
                {activeTab === 'empresas' && (
                  <div className="flex-1 min-w-[180px] pr-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo</p>
                    <ScrollArea className="h-60">
                      <div className="space-y-1 pr-3">
                        {tipoFilterOptions.map(opt => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
                          >
                            <input
                              type="radio"
                              name="cliente-tipo"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={tipoFilter === opt.value}
                              onChange={() => { setTipoFilter(opt.value); setPage(1); }}
                            />
                            {opt.label}
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setNewTipoTarget('filter'); setNewTipoOpen(true); }}
                          className="w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground text-primary font-medium"
                        >
                          + Criar novo tipo…
                        </button>
                      </div>
                    </ScrollArea>
                  </div>
                )}
                <div className={activeTab === 'empresas' ? 'flex-1 min-w-[180px] pl-4' : 'min-w-0'}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
                    <ArrowUpDown className="h-3 w-3" /> Ordenação
                  </p>
                  <div className="space-y-1">
                    {[
                      { value: 'asc', label: 'Nome (A → Z)' },
                      { value: 'desc', label: 'Nome (Z → A)' },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
                      >
                        <input
                          type="radio"
                          name="cliente-sort"
                          className="h-3.5 w-3.5 accent-primary"
                          checked={sortOrder === opt.value}
                          onChange={() => { setSortOrder(opt.value as 'asc' | 'desc'); setPage(1); }}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Opções</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
              <div className="flex divide-x divide-border">
                {/* Coluna esquerda: visibilidade das colunas da tabela */}
                <div className="p-2 min-w-[220px]">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colunas</div>
                  <div className="space-y-0.5">
                    {(activeTab === 'empresas' ? CLIENTE_FIELDS : CONTATO_FIELDS).map((column) => {
                      const currentVisible = activeTab === 'empresas' ? visibleFields : visibleContatoFields;
                      const currentOnChange = activeTab === 'empresas' ? handleFieldChange : handleContatoFieldChange;
                      const allCols = activeTab === 'empresas' ? CLIENTE_FIELDS : CONTATO_FIELDS;
                      const checked = currentVisible.includes(column.id);
                      const disabled = column.locked || (checked && currentVisible.length === 1);
                      return (
                        <button
                          key={column.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (column.locked) return;
                            if (checked) {
                              if (currentVisible.length > 1) currentOnChange(currentVisible.filter(id => id !== column.id));
                            } else {
                              const newVisible = allCols.filter(c => currentVisible.includes(c.id) || c.id === column.id).map(c => c.id);
                              currentOnChange(newVisible);
                            }
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal transition-colors text-left',
                            'hover:bg-muted/60 disabled:cursor-not-allowed',
                            !checked && 'opacity-40'
                          )}
                        >
                          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', checked ? 'bg-primary' : 'bg-muted-foreground/40')} />
                          <span className="flex-1 truncate">{column.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allCols = activeTab === 'empresas' ? CLIENTE_FIELDS : CONTATO_FIELDS;
                      const currentOnChange = activeTab === 'empresas' ? handleFieldChange : handleContatoFieldChange;
                      currentOnChange(allCols.map(c => c.id));
                    }}
                    className="w-full text-center text-xs text-primary font-medium px-2 py-2 mt-1 rounded-md hover:bg-muted/60 transition-colors"
                  >
                    Resetar todas
                  </button>
                </div>

                {/* Coluna direita: ações */}
                <div className="p-2 min-w-[200px]">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</div>
                  <button
                    type="button"
                    onClick={() => {
                      const data = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
                      exportToFile(data, activeTab, 'xlsx');
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const data = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
                      exportToFile(data, activeTab, 'csv');
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Exportar CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    Importar
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {/* Import dialog (controlled) */}
          <ImportClientesDialog open={importOpen} onOpenChange={setImportOpen} hideTrigger target={activeTab} />

          {/* Novo tipo dialog — criação + gerenciamento */}
          <Dialog open={newTipoOpen} onOpenChange={(o) => { setNewTipoOpen(o); if (!o) setNewTipoName(''); }}>
            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Gerenciar tipos</DialogTitle>
              </DialogHeader>

              {/* Criação */}
              <div className="space-y-2 pt-2 pb-3 border-b">
                <Label htmlFor="new-tipo-name">Novo tipo</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-tipo-name"
                    value={newTipoName}
                    onChange={(e) => setNewTipoName(e.target.value)}
                    placeholder="Ex: Indústria, Cooperativa…"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTipo(); } }}
                  />
                  <Button size="sm" onClick={handleCreateTipo}>
                    <Plus className="h-4 w-4 mr-1" /> Criar
                  </Button>
                </div>
              </div>

              {/* Lista gerenciável */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipos existentes</p>
                {(() => {
                  const all = [
                    ...baseTipos.filter(v => !hiddenTipos.includes(v)).map(v => ({ value: v, label: tipoLabels[v], custom: false })),
                    ...customTipos.map(t => ({ ...t, custom: true })),
                  ];
                  if (all.length === 0) {
                    return <p className="text-sm text-muted-foreground text-center py-3">Nenhum tipo cadastrado</p>;
                  }
                  return (
                    <div className="space-y-1">
                      {all.map(t => (
                        <div key={t.value} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">{t.label}</span>
                            {!t.custom && (
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">padrão</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDeleteTipo({ value: t.value, label: t.label })}
                            title={`Excluir "${t.label}"`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end pt-3">
                <Button variant="outline" size="sm" onClick={() => setNewTipoOpen(false)}>Fechar</Button>
              </div>
            </DialogContent>
          </Dialog>
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
                      <Select
                        value={tipo}
                        onValueChange={(v) => {
                          if (v === '__new__') {
                            setNewTipoTarget('form');
                            setNewTipoOpen(true);
                            return;
                          }
                          setTipo(v);
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {baseTipos.filter(v => !hiddenTipos.includes(v)).map(v => (
                            <SelectItem key={v} value={v}>{tipoLabels[v]}</SelectItem>
                          ))}
                          {customTipos.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                          <SelectItem value="__new__" className="text-primary font-medium">+ Criar novo tipo…</SelectItem>
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
        ) : activeTab === 'empresas' ? (
          <>
            <div className="rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-hidden">
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
                    const Icon = getTipoIcon(client.tipo);
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
                            <Badge variant="secondary" className="text-[10px] font-medium">{getTipoLabel(client.tipo, customTipos)}</Badge>
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
            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
              itemLabel="empresa"
              className="rounded-lg rounded-t-none border border-border/60 border-t bg-card px-3 py-3"
            />
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-hidden">
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
            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
              itemLabel="contato"
              className="rounded-lg rounded-t-none border border-border/60 border-t bg-card px-3 py-3"
            />
          </>
        )}
      </div>

      <AlertDialog open={!!confirmDeleteTipo} onOpenChange={(o) => !o && setConfirmDeleteTipo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo "{confirmDeleteTipo?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo será removido dos seletores. Empresas já cadastradas com este tipo continuarão existindo, mas o rótulo deixará de aparecer. Tipos padrão podem ser reativados criando um novo tipo com o mesmo nome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteTipo && handleDeleteTipo(confirmDeleteTipo.value)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Clientes;

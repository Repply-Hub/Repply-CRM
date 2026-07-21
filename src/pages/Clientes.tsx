import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
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
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2, Users, Phone, Mail, Trash2, Settings2, Upload, FileDown, FileSpreadsheet, FileText, Columns3, ListFilter, ArrowUpDown, ChevronDown, FileWarning } from 'lucide-react';
import { ImportClientesDialog } from '@/components/clientes/ImportClientesDialog';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';

import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition, ColumnSettingsItem, ColumnSettingsPopover } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/clientes/EnderecoForm';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';
import { ListPagination } from '@/components/shared/ListPagination';
import { cn, slugify } from '@/lib/utils';
import { ExportClientesButton } from '@/components/clientes/ExportClientesButton';
import { FilterButton } from '@/components/shared/FilterButton';
import { StandardPopoverMenu } from '@/components/ui/standard-popover-menu';


const CLIENTE_FIELDS: ColumnDefinition[] = [
  { id: 'empresa', label: 'Empresa', locked: false },
  { id: 'tipo', label: 'Tipo' },
  { id: 'cnpj', label: 'CPF/CNPJ' },
  { id: 'classificacao', label: 'Classificação' },
  { id: 'data_criacao', label: 'Criado' },
  { id: 'email', label: 'E-mail' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'endereco', label: 'Endereço' },
  { id: 'obras_count', label: 'Qtd. Obras' },
];

const CONTATO_FIELDS: ColumnDefinition[] = [
  { id: 'nome_contato', label: 'Nome', locked: false },
  { id: 'empresa', label: 'Empresa' },
  { id: 'classificacao', label: 'Classificação' },
  { id: 'data_criacao', label: 'Criado em' },
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

const normalizeExtraKey = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getExtraValue = (extras: Record<string, any>, column: ColumnDefinition) => {
  if (!extras) return '';
  
  // 1. Tentar por ID exato (mais preciso)
  if (extras[column.id] !== undefined && extras[column.id] !== null && extras[column.id] !== '') {
    return extras[column.id];
  }

  // 2. Tentar por label
  const labels = [column.label, column.customLabel].filter(Boolean) as string[];
  for (const label of labels) {
    if (extras[label] !== undefined && extras[label] !== null && extras[label] !== '') {
      return extras[label];
    }
  }

  // 3. Fallback para busca normalizada (menos preciso, mas evita perda de dados)
  const searchLabels = [column.id, ...labels].map(normalizeExtraKey);
  const entries = Object.entries(extras);
  
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') continue;
    if (searchLabels.includes(normalizeExtraKey(key))) {
      return value;
    }
  }

  return '';
};

const SCHEMA_COLUMN_ALIASES: Record<string, string[]> = {
  empresa: ['empresa', 'nome empresa', 'nome da empresa', 'nome fantasia', 'cliente'],
  tipo: ['tipo', 'segmento', 'segmento atuacao', 'segmento de atuacao', 'categoria', 'segemento', 'segemento de atuacao'],
  cnpj: ['cnpj', 'cpf', 'cpf cnpj', 'cpf/cnpj', 'documento'],
  email: ['email', 'e mail', 'e-mail', 'mail'],
  telefone: ['telefone', 'telefone trabalho', 'telefone de trabalho', 'fone', 'celular', 'whatsapp'],
  classificacao: ['classificacao', 'classificação'],
  data_criacao: ['criado', 'criado em', 'data criacao', 'data de criacao', 'data cadastro'],
  endereco: ['endereco', 'endereço', 'address'],
};

const hasDisplayValue = (value: unknown) => value !== undefined && value !== null && value !== '';

const getSchemaKeyByColumn = (column?: ColumnDefinition) => {
  if (!column) return undefined;
  if (column.id in SCHEMA_COLUMN_ALIASES) return column.id;

  const labels = [column.id, column.label, column.customLabel].filter(Boolean).map(value => normalizeExtraKey(String(value)));
  const match = Object.entries(SCHEMA_COLUMN_ALIASES).find(([, aliases]) =>
    aliases.map(normalizeExtraKey).some(alias => labels.includes(alias))
  );

  return match?.[0];
};

const getColumnValue = (row: Record<string, any>, column?: ColumnDefinition) => {
  if (!column) return undefined;

  const camposExtras = row.campos_extras || {};
  const schemaKey = getSchemaKeyByColumn(column);
  if (schemaKey && hasDisplayValue(row[schemaKey])) return row[schemaKey];

  const extraValue = getExtraValue(camposExtras, column);
  if (hasDisplayValue(extraValue)) return extraValue;

  if (hasDisplayValue(row[column.id])) return row[column.id];
  return undefined;
};

// Formata datas ISO ("aaaa-mm-dd" ou timestamp completo) para o padrão brasileiro
// dd/mm/aaaa, sem passar por conversão de timezone do navegador (o valor já
// representa a data correta em horário de Brasília, salva pelo backend).
const formatDateBR = (value: any) => {
  if (!value || typeof value !== 'string') return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
};

// Concatena todos os campos da linha (colunas fixas da tabela + campos_extras
// dinâmicos do import) num único texto pesquisável, pra busca não ficar restrita
// a empresa/nome/email.
const buildRowSearchText = (row: Record<string, any>, tipoLabel?: string) => {
  const staticFields = [
    row.empresa,
    row.razao_social,
    row.nome_contato,
    row.email,
    row.telefone,
    row.cnpj,
    row.cargo,
    row.classificacao,
    tipoLabel,
    row.tipo,
    row.endereco,
    row.logradouro,
    row.numero,
    row.complemento,
    row.bairro,
    row.cidade,
    row.uf,
    row.cep,
  ];
  const extraValues =
    row.campos_extras && typeof row.campos_extras === 'object'
      ? Object.values(row.campos_extras as Record<string, unknown>)
      : [];
  return [...staticFields, ...extraValues]
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => String(v).toLowerCase())
    .join(' ');
};

type ViewTab = 'empresas' | 'contatos';

const Clientes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  // Espelha a checagem de public.is_gestor() no banco (única role que passa nas
  // policies clientes_delete/contatos_delete além de admin). É só para esconder a
  // ação na UI — a RLS continua sendo a autoridade real, checada de novo no retorno
  // do delete em handleBulkDelete.
  const canDelete = ['gestor', 'admin', 'empresa'].includes(profile?.role);
  const { data: clients, isLoading: loadingClientes } = useClientes();
  const { data: contatosList, isLoading: loadingContatos } = useContatos();
  const createCliente = useCreateCliente();
  const createContato = useCreateContato();
  const deleteCliente = useDeleteCliente();
  const deleteContato = useDeleteContato();
  const [search, setSearch] = useState(() => localStorage.getItem('clientes_search') || '');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    const saved = localStorage.getItem('clientes_active_tab');
    return (saved === 'empresas' || saved === 'contatos') ? saved : 'empresas';
  });
  const [page, setPage] = useState(1);
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

  const empresasSettings = useTableSettings({
    key: 'clientes_empresas',
    defaultColumns: CLIENTE_FIELDS,
  });

  const contatosSettings = useTableSettings({
    key: 'clientes_contatos',
    defaultColumns: CONTATO_FIELDS,
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
    deletePreset,
    resetToDefaults
  } = activeTab === 'empresas' ? empresasSettings : contatosSettings;

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
      const s = search.toLowerCase();
      const matchSearch = !s || buildRowSearchText(c, getTipoLabel(c.tipo, customTipos)).includes(s);
      const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter;
      return matchSearch && matchTipo;
    }),
    'empresa',
  );

  const filteredContatos = sortByName(
    contatos.filter(c => {
      const s = search.toLowerCase();
      return !s || buildRowSearchText(c).includes(s);
    }),
    'nome_contato',
  );

  const filtered = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
  
  const hasFilters = tipoFilter !== 'todos' || search !== '';
  const activeFilterCount = (tipoFilter !== 'todos' ? 1 : 0);

  
  // Hook replaces currentColumns calculation


  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedEmpresas = filteredEmpresas.slice((page - 1) * pageSize, page * pageSize);
  const paginatedContatos = filteredContatos.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    localStorage.setItem('clientes_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('clientes_search', search);
  }, [search]);

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
          empresa: clients?.find(c => c.id === empresa)?.empresa || undefined,
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
      let removedCount = 0;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        // .select('id') é obrigatório aqui: a RLS de DELETE filtra silenciosamente as
        // linhas sem permissão em vez de retornar erro, então sem isso o delete "funciona"
        // (sem error) mesmo removendo 0 linhas.
        const { data: removed, error } = await supabase.from(table).delete().in('id', batch).select('id');
        if (error) throw error;
        removedCount += removed?.length ?? 0;
      }

      queryClient.invalidateQueries({ queryKey: [activeTab === 'empresas' ? 'clientes' : 'contatos'] });
      setSelected(new Set());

      const label = activeTab === 'empresas' ? 'empresa(s)' : 'contato(s)';
      if (removedCount === ids.length) {
        toast.success(`${removedCount} ${label} removido(s)!`);
      } else if (removedCount === 0) {
        toast.error(`Nenhum registro removido — você não tem permissão para excluir ${label}.`);
      } else {
        toast.warning(`${removedCount} de ${ids.length} ${label} removido(s). Os demais não puderam ser excluídos por falta de permissão.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover');
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };


  return (
    <AppLayout title="Clientes" subtitle={`${totalCount} cadastrados`}>
      <div className="p-6 w-full">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <TabsList className={cn(TOGGLE_LIST_CLASS, 'shrink-0')}>
            <TabsTrigger value="empresas" className={TOGGLE_TRIGGER_CLASS}>
              <Building2 className="h-4 w-4" />
              Empresas
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{empresas.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="contatos" className={TOGGLE_TRIGGER_CLASS}>
              <Users className="h-4 w-4" />
              Contatos
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{contatos.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <SearchWithRecent
            placeholder="Buscar..."
            value={search}
            onValueChange={(val) => { setSearch(val); setPage(1); }}
            storageKey="clientes_recent_searches"
          />

          <FilterButton 
            hasFilters={hasFilters}
            activeFilterCount={activeFilterCount}
            onClear={() => {
              setTipoFilter('todos');
              setSortOrder('asc');
            }}
            popoverClassName="w-64"
          >
            <div className="flex flex-col gap-1">
              {/* Submenu Tipo */}
              <StandardPopoverMenu
                label="Tipo"
                icon={Settings2}
                badge={tipoFilter !== 'todos' ? 1 : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-64"
              >
                <div className="flex flex-col h-full">
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Selecionar Tipo</p>
                      <button 
                        className="text-[10px] font-bold text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewTipoTarget('filter');
                          setNewTipoOpen(true);
                        }}
                      >
                        Gerenciar
                      </button>
                    </div>
                    <Select value={tipoFilter} onValueChange={(v) => { setTipoFilter(v); setPage(1); }}>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Todos os tipos" />
                      </SelectTrigger>
                      <SelectContent>
                        {tipoFilterOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </StandardPopoverMenu>

              {/* Submenu Ordenação */}
              <StandardPopoverMenu
                label="Ordenação"
                icon={ArrowUpDown}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-60"
              >
                <div className="p-3 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Critério</p>
                  <Select value={sortOrder} onValueChange={(v: 'asc' | 'desc') => setSortOrder(v)}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Ordenar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Nome (A-Z)</SelectItem>
                      <SelectItem value="desc">Nome (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </StandardPopoverMenu>
            </div>
          </FilterButton>

          <ColumnSettings
            columns={columns}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
            onRename={handleRename}
            onTypeChange={handleTypeChange}
            onAdd={handleAddColumn}
            onRemove={handleRemoveColumn}
            onReorder={handleReorder}
            presets={presets}
            onSavePreset={savePreset}
            onLoadPreset={loadPreset}
            onDeletePreset={deletePreset}
            onReset={resetToDefaults}
            label={activeTab === 'empresas' ? 'Colunas Empresas' : 'Colunas Contatos'}
          >
            <div className="flex flex-col border-t border-border/50">
              <ColumnSettingsPopover label="Ações" icon={Plus}>
                <ExportClientesButton 
                  data={activeTab === 'empresas' ? filteredEmpresas : filteredContatos} 
                  type={activeTab} 
                  renderTrigger={(onClick, exporting) => (
                    <ColumnSettingsItem 
                      label={exporting ? "Exportando..." : "Exportar"} 
                      icon={exporting ? Loader2 : FileDown} 
                      onClick={onClick} 
                      disabled={exporting}
                    />
                  )}
                />

                <ColumnSettingsItem
                  label="Importar"
                  icon={Upload}
                  onClick={() => setImportOpen(true)}
                />

                <ColumnSettingsItem
                  label="Linhas Ignoradas"
                  icon={FileWarning}
                  onClick={() => navigate('/importacao/ignoradas')}
                />

                {selected.size > 0 && canDelete && (
                  <ColumnSettingsItem
                    label="Excluir Selecionados"
                    icon={Trash2}
                    variant="destructive"
                    onClick={openTypedConfirm}
                    badge={selected.size}
                  />
                )}
              </ColumnSettingsPopover>
            </div>
          </ColumnSettings>

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
                        <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
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
                    <div><Label>Nome</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome fantasia ou nome" /></div>
                    <div><Label>Razão Social</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social da empresa" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                      <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" /></div>
                    </div>
                    <EnderecoForm value={endereco} onChange={setEndereco} />
                  </>
                ) : (
                  <>
                    <div><Label>Nome do contato</Label><Input value={nomeContato} onChange={e => setNomeContato(e.target.value)} placeholder="Nome completo" /></div>
                    <div><Label>Empresa</Label><EmpresaSelector value={empresa} onValueChange={setEmpresa} placeholder="Vincular empresa..." /></div>
                    <div><Label>Cargo</Label><Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Cargo ou função" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                      <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" /></div>
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
        </Tabs>

        {someSelected && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <span className="text-sm font-medium text-foreground">{selected.size} selecionado(s)</span>
            {canDelete && (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={openTypedConfirm}>
                <Trash2 className="h-4 w-4" /> Remover selecionados
              </Button>
            )}
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
            <div className="rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="py-2.5 px-4 w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </th>
                    {visibleColumns.map(colId => (
                      <th key={colId} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs whitespace-nowrap">
                        {getLabel(colId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmpresas.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <Building2 className="h-12 w-12 mb-3 opacity-30" />
                          <p className="text-sm font-medium">Nenhuma empresa encontrada</p>
                          <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre uma nova</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedEmpresas.map(client => {
                    const Icon = getTipoIcon(client.tipo);
                    const camposExtras = (client as any).campos_extras || {};

                    return (
                      <tr key={client.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${selected.has(client.id) ? 'bg-primary/5' : ''}`}>
                        <td className="py-2.5 px-4 w-10" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selected.has(client.id)} onCheckedChange={() => toggleOne(client.id)} aria-label={`Selecionar ${client.empresa}`} />
                        </td>
                        {visibleColumns.map(colId => {
                          const isCustom = colId.startsWith('custom_');
                          const column = columns.find(col => col.id === colId);
                          let value: any = getColumnValue(client as any, column);
                          
                          const navigateToDetail = () => {
                            const slug = slugify(client.empresa || 'cliente');
                            navigate(`/clientes/${slug}-${client.id}`);
                          };

                          if (colId === 'empresa') {
                            return (
                              <td key={colId} className="py-2.5 px-4" onClick={navigateToDetail}>
                                <div className="flex items-center gap-2.5">
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="font-semibold text-sm whitespace-nowrap text-foreground">{client.empresa}</span>
                                </div>
                              </td>
                            );
                          }

                          if (colId === 'tipo') {
                            return (
                              <td key={colId} className="py-2.5 px-4" onClick={navigateToDetail}>
                                <Badge variant="secondary" className="text-[10px] font-medium">{getTipoLabel(client.tipo, customTipos)}</Badge>
                              </td>
                            );
                          }
                          
                          if (colId === 'obras_count') {
                            return (
                              <td key={colId} className="py-2.5 px-4 text-xs" onClick={navigateToDetail}>
                                {client.obras?.length ? <span className="text-primary font-medium">{client.obras.length}</span> : '—'}
                              </td>
                            );
                          }

                          if (colId === 'data_criacao') {
                            value = formatDateBR(value);
                          }

                          return (
                            <td key={colId} className={cn("py-2.5 px-4 whitespace-nowrap", isCustom ? "text-xs text-muted-foreground" : "text-sm text-foreground font-normal")} onClick={navigateToDetail}>
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
            <div className="rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="py-2.5 px-4 w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </th>
                    {visibleColumns.map(colId => (
                      <th key={colId} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs whitespace-nowrap">
                        {getLabel(colId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedContatos.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <Users className="h-12 w-12 mb-3 opacity-30" />
                          <p className="text-sm font-medium">Nenhum contato encontrado</p>
                          <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre um novo</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedContatos.map(contato => {
                    const camposExtras = (contato as any).campos_extras || {};

                    return (
                      <tr key={contato.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selected.has(contato.id) ? 'bg-primary/5' : ''}`}>
                        <td className="py-2.5 px-4 w-10">
                          <Checkbox checked={selected.has(contato.id)} onCheckedChange={() => toggleOne(contato.id)} aria-label={`Selecionar ${contato.nome_contato}`} />
                        </td>
                        {visibleColumns.map(colId => {
                          const isCustom = colId.startsWith('custom_');
                          const column = columns.find(col => col.id === colId);
                          let value: any = getColumnValue(contato as any, column);
                          if (colId === 'data_criacao') {
                            value = formatDateBR(value);
                          }

                          if (colId === 'nome_contato') {
                            const navigateToContatoDetail = () => {
                              const slug = slugify(contato.nome_contato || 'contato');
                              navigate(`/contatos/${slug}-${contato.id}`);
                            };
                            return (
                              <td key={colId} className="py-2.5 px-4" onClick={navigateToContatoDetail}>
                                <div className="flex items-center gap-2.5">
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <User className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="font-semibold text-sm whitespace-nowrap text-foreground">{contato.nome_contato || 'Sem nome'}</span>
                                </div>
                              </td>
                            );
                          }

                          if (colId === 'empresa') {
                            return (
                              <td key={colId} className="py-2.5 px-4 text-sm font-medium text-foreground whitespace-nowrap" onClick={() => {
                                const slug = slugify(contato.nome_contato || 'contato');
                                navigate(`/contatos/${slug}-${contato.id}`);
                              }}>
                                {value || '—'}
                              </td>
                            );
                          }

                          return (
                            <td key={colId} className={cn("py-2.5 px-4 whitespace-nowrap", isCustom ? "text-xs text-muted-foreground" : "text-sm text-foreground font-normal")} onClick={() => {
                              const slug = slugify(contato.nome_contato || 'contato');
                              navigate(`/contatos/${slug}-${contato.id}`);
                            }}>
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

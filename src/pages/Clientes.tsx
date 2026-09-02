import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { useClientes, useContatos } from '@/hooks/use-clientes';
import { useCreateCliente, useCreateContato, useUpdateContato, useDeleteCliente, useDeleteContato } from '@/hooks/use-mutations';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoAssistente, CorpoDialogo, RodapeDialogo, RodapeAssistente } from '@/components/shared/DialogoResponsivo';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2, Users, Phone, Mail, Trash2, Settings2, Upload, FileDown, FileSpreadsheet, FileText, Columns3, ListFilter, ChevronDown, FileWarning, Calendar, Briefcase, ExternalLink, IdCard, Tag, UserCheck } from 'lucide-react';
import { ImportClientesDialog } from '@/components/clientes/ImportClientesDialog';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';

import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition, ColumnSettingsItem, ColumnSettingsPopover } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/clientes/EnderecoForm';
import { ContatoSelector } from '@/components/clientes/ContatoSelector';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';
import { ListPagination } from '@/components/shared/ListPagination';
import { ConfirmarEnviarEmailDialog } from '@/components/email/ConfirmarEnviarEmailDialog';
import { cn, slugify, hasTextSelection } from '@/lib/utils';
import { normalizarParaBusca, correspondeBusca } from '@/lib/texto-busca';
import { ExportClientesButton } from '@/components/clientes/ExportClientesButton';
import { FilterButton } from '@/components/shared/FilterButton';
import { StandardPopoverMenu } from '@/components/ui/standard-popover-menu';
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { useClientesTipos, useCriarTipoDeCliente, useExcluirTipoDeCliente } from '@/hooks/use-clientes-tipos';
import { rotuloDoTipo, tipoPadrao, opcoesDeFiltro } from '@/lib/tipos-de-cliente';


const CLIENTE_FIELDS: ColumnDefinition[] = [
  { id: 'tipo', label: 'Tipo / Segmento', locked: false },
  { id: 'cnpj', label: 'CNPJ / CPF' },
  { id: 'empresa', label: 'Empresa/Nome Fantasia' },
  { id: 'razao_social', label: 'Razão social' },
  { id: 'nome_contato', label: 'Contato da empresa' },
  { id: 'email', label: 'E-mail' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'logradouro', label: 'Logradouro / Rua' },
  { id: 'numero', label: 'Número', type: 'number' },
  { id: 'complemento', label: 'Complemento' },
  { id: 'bairro', label: 'Bairro' },
  { id: 'cidade', label: 'Cidade' },
  { id: 'uf', label: 'UF' },
  { id: 'cep', label: 'CEP' },
  { id: 'classificacao', label: 'Classificação' },
  { id: 'data_criacao', label: 'Data de Criação' },
  { id: 'criado_por', label: 'Criado por' },
];

const CONTATO_FIELDS: ColumnDefinition[] = [
  { id: 'nome_contato', label: 'Nome Completo', locked: false },
  { id: 'empresa', label: 'Empresa do contato' },
  { id: 'email', label: 'E-mail do contato' },
  { id: 'telefone', label: 'Telefone do contato' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'data_criacao', label: 'Data de Criação' },
  { id: 'criado_por', label: 'Criado por' },
];

// Colunas ligadas de saída para quem NUNCA mexeu na configuração da tabela. As 17 de
// CLIENTE_FIELDS somavam 2.590px de largura — mais de sete telas de celular só para achar
// o nome. Quem já tem configuração salva (como a MD) continua exatamente com a dela, e
// qualquer um pode religar as demais pelo botão "Colunas".
const CLIENTE_COLUNAS_PADRAO = ['empresa', 'tipo', 'cnpj', 'telefone', 'email', 'cidade'];
const CONTATO_COLUNAS_PADRAO = ['nome_contato', 'empresa', 'telefone', 'email', 'cargo'];

const EMPRESA_STEPS = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Contato' },
  { id: 3, label: 'Endereço' },
  { id: 4, label: 'Vincular Contato' },
];

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User, condominio: Building2, hospital: Building2, distribuidor: Store, hotel: Building2, escola: Building2, instalador: User };
// O rótulo do tipo vem do banco (clientes_tipos), mas o ícone continua no código: ícone
// não é algo que o gestor cadastra, e tipo fora desta lista cai em Building2.
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

  // "Criado por" é uma FK (criado_por_usuario_id -> usuarios.nome) — prioriza o nome
  // vinculado; cai para o texto livre em campos_extras só em registros antigos
  // importados antes da coluna estruturada existir e que não bateram com nenhum usuário.
  if (column.id === 'criado_por' && hasDisplayValue(row.criado_por_usuario?.nome)) {
    return row.criado_por_usuario.nome;
  }

  // "Empresa do contato" (linhas de contatos) é uma FK (cliente_id -> clientes.empresa) —
  // prioriza o nome atual da empresa vinculada; cai para o texto solto legado
  // (contatos.empresa) em registros antigos sem o vínculo.
  if (column.id === 'empresa' && hasDisplayValue(row.cliente?.empresa)) {
    return row.cliente.empresa;
  }

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
    row.criado_por_usuario?.nome,
  ];
  const extraValues =
    row.campos_extras && typeof row.campos_extras === 'object'
      ? Object.values(row.campos_extras as Record<string, unknown>)
      : [];
  return [...staticFields, ...extraValues]
    .filter((v) => v !== null && v !== undefined && v !== '')
    // Sem acento: quem digita "jeronimo" na busca acha "Jerônimo".
    .map((v) => normalizarParaBusca(String(v)))
    .join(' ');
};

type ViewTab = 'empresas' | 'contatos';

// Lista de checkboxes com busca local, usada em todos os submenus de filtro
// (Tipo, UF, Cidade, Classificação, Criado por) — listas como Cidade/Criado por
// crescem demais pra rolar procurando, então cada submenu ganha sua própria caixa
// de busca (estado interno, isolado por instância).
function FilterCheckboxList({
  options,
  selected,
  onToggle,
  emptyMessage = 'Nenhuma opção disponível.',
  searchPlaceholder = 'Buscar...',
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyMessage?: string;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  const term = normalizarParaBusca(search);
  const filteredOptions = term ? options.filter(o => correspondeBusca(o.label, search)) : options;

  return (
    <div className="flex flex-col">
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-4 text-center">{emptyMessage}</p>
      ) : filteredOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-4 text-center">Nenhum resultado para "{search.trim()}".</p>
      ) : (
        <ScrollArea className="h-56">
          <div className="space-y-1 p-2 pt-0 pr-3">
            {filteredOptions.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => onToggle(opt.value)} />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

const Clientes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  // Espelha a checagem de public.is_gestor() no banco (única role que passa nas
  // policies clientes_delete/contatos_delete além de admin). É só para esconder a
  // ação na UI — a RLS continua sendo a autoridade real, checada de novo no retorno
  // do delete em handleBulkDelete.
  const canDelete = ['gestor', 'admin', 'empresa'].includes(profile?.role);
  const empresaIdAtual = profile?.empresa_id ?? profile?.empresas?.id;
  // A lista de tipos passou a ser da EMPRESA, guardada no banco: o que um gestor cria
  // aparece para a equipe toda. Antes vivia no localStorage de cada navegador.
  const { data: tiposDeCliente } = useClientesTipos(empresaIdAtual);
  // useMemo para a lista não trocar de identidade a cada pintura: ela é dependência do
  // efeito que preenche o campo Tipo, e um array novo por render o faria rodar sempre.
  const tipos = useMemo(() => tiposDeCliente ?? [], [tiposDeCliente]);
  const criarTipo = useCriarTipoDeCliente();
  const excluirTipo = useExcluirTipoDeCliente();
  // Mesma regra do canDelete logo acima: espelha public.is_gestor() só para esconder
  // o controle na UI. A RLS continua sendo a autoridade real.
  const podeGerenciarTipos = ['gestor', 'admin', 'empresa'].includes(profile?.role);
  const { data: camposConfigClientes } = useConfiguracoesCampos('clientes', empresaIdAtual);
  const { data: camposConfigContatos } = useConfiguracoesCampos('contatos', empresaIdAtual);
  // Helpers de leitura da config: campos que ainda não têm linha na config
  // (empresas antigas antes desta migration) caem no `fallback`, que reflete o
  // comportamento hardcoded que esses campos tinham antes de virarem configuráveis.
  const empresaObrigatorio = (key: string, fallback: boolean) =>
    camposConfigClientes?.find(c => c.campo_key === key)?.obrigatorio ?? fallback;
  const contatoObrigatorio = (key: string, fallback: boolean) =>
    camposConfigContatos?.find(c => c.campo_key === key)?.obrigatorio ?? fallback;
  const [camposExtrasEmpresa, setCamposExtrasEmpresa] = useState<Record<string, string>>({});
  const [camposExtrasContato, setCamposExtrasContato] = useState<Record<string, string>>({});
  const { data: clients, isLoading: loadingClientes } = useClientes();
  const { data: contatosList, isLoading: loadingContatos } = useContatos();
  const createCliente = useCreateCliente();
  const createContato = useCreateContato();
  const updateContato = useUpdateContato();
  const deleteCliente = useDeleteCliente();
  const deleteContato = useDeleteContato();
  const [search, setSearch] = useState(() => localStorage.getItem('clientes_search') || '');
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);
  const [selectedCidades, setSelectedCidades] = useState<string[]>([]);
  const [selectedClassificacoes, setSelectedClassificacoes] = useState<string[]>([]);
  const [selectedCriadores, setSelectedCriadores] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('empresa');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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
  const [panelEmpresa, setPanelEmpresa] = useState<any | null>(null);
  const [panelContato, setPanelContato] = useState<any | null>(null);
  const [emailParaConfirmar, setEmailParaConfirmar] = useState<string | null>(null);

  // Cascata das seções: um hook só serve os dois painéis laterais e a tabela, porque tudo
  // isto vive dentro do mesmo componente.
  const { ligada: temEmails } = useSecaoLigada('emails');
  const { ligada: temObras } = useSecaoLigada('obras');

  // Nasce vazio e recebe o primeiro tipo da empresa assim que a lista chega. Não dá
  // para cravar 'construtora': depois que uma empresa personaliza a lista esse slug
  // pode não existir mais lá, e o cadastro gravaria um tipo órfão.
  const [tipo, setTipo] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [empresa, setEmpresa] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [cargo, setCargo] = useState('');
  const [step, setStep] = useState(1);
  const [contatoMode, setContatoMode] = useState<'nenhum' | 'existente' | 'novo'>('nenhum');
  const [selectedContatoId, setSelectedContatoId] = useState('');
  const [contatoEmail, setContatoEmail] = useState('');
  const [contatoTelefone, setContatoTelefone] = useState('');
  const [newTipoOpen, setNewTipoOpen] = useState(false);
  const [newTipoName, setNewTipoName] = useState('');
  const [newTipoTarget, setNewTipoTarget] = useState<'form' | 'filter'>('form');
  // Guarda id (para excluir no banco), slug (para limpar filtro e formulário) e nome
  // (para a pergunta do diálogo).
  const [confirmDeleteTipo, setConfirmDeleteTipo] = useState<{ id: string; slug: string; nome: string } | null>(null);

  const handleCreateTipo = async () => {
    try {
      const slug = await criarTipo.mutateAsync({ nome: newTipoName });
      if (newTipoTarget === 'form') setTipo(slug);
      else setSelectedTipos(prev => (prev.includes(slug) ? prev : [...prev, slug]));
      setNewTipoName('');
      setNewTipoOpen(false);
    } catch {
      // O toast do erro real já sai no onError do hook — inclusive a frase que o banco
      // devolve quando quem tentou não é gestor.
    }
  };

  const handleDeleteTipo = async (id: string, slug: string) => {
    try {
      await excluirTipo.mutateAsync({ id });
      if (tipo === slug) setTipo(tipoPadrao(tipos.filter(t => t.slug !== slug)));
      setSelectedTipos(prev => prev.filter(v => v !== slug));
      setConfirmDeleteTipo(null);
    } catch {
      // idem
    }
  };

  const empresasSettings = useTableSettings({
    key: 'clientes_empresas',
    defaultColumns: CLIENTE_FIELDS,
    defaultVisibleColumns: CLIENTE_COLUNAS_PADRAO,
  });

  const contatosSettings = useTableSettings({
    key: 'clientes_contatos',
    defaultColumns: CONTATO_FIELDS,
    defaultVisibleColumns: CONTATO_COLUNAS_PADRAO,
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
    resetToDefaults,
    columnWidths,
    setColumnWidth,
  } = activeTab === 'empresas' ? empresasSettings : contatosSettings;

  const empresas = clients ?? [];
  const contatos = contatosList ?? [];
  const isLoading = activeTab === 'empresas' ? loadingClientes : loadingContatos;

  // Larguras resolvidas na mesma ordem das colunas visíveis, usadas no <colgroup> e nos
  // cabeçalhos — a tabela precisa de largura própria explícita (não w-full/auto) + colgroup,
  // senão o navegador redistribui as larguras proporcionalmente ao redimensionar uma coluna.
  const CLIENTES_CHECKBOX_COL_WIDTH = 40;
  const resolvedClienteColWidths = visibleColumns.map((colId) => columnWidths[colId] ?? 150);
  const clientesTableTotalWidth = CLIENTES_CHECKBOX_COL_WIDTH + resolvedClienteColWidths.reduce((a, b) => a + b, 0);

  // Ordena por qualquer coluna visível (acionado pelo dropdown no cabeçalho da
  // tabela — ver SortableTh), reaproveitando getColumnValue pra ler o mesmo
  // valor que é exibido na célula (campos_extras, FKs resolvidas, etc).
  const sortRows = <T extends Record<string, any>>(rows: T[], colId: string, direction: SortDirection, columnDefs: ColumnDefinition[]) => {
    const dir = direction === 'asc' ? 1 : -1;
    const column = columnDefs.find(col => col.id === colId);
    return [...rows].sort((a, b) => {
      let av: any = getColumnValue(a, column);
      let bv: any = getColumnValue(b, column);
      if (colId === 'tipo') {
        av = rotuloDoTipo(a.tipo, tipos);
        bv = rotuloDoTipo(b.tipo, tipos);
      }
      if (colId === 'data_criacao' || column?.type === 'date') {
        const at = av ? new Date(av as string).getTime() : 0;
        const bt = bv ? new Date(bv as string).getTime() : 0;
        return (at - bt) * dir;
      }
      if (column?.type === 'number' || column?.type === 'currency') {
        const an = Number(String(av ?? '').replace(',', '.'));
        const bn = Number(String(bv ?? '').replace(',', '.'));
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
      }
      const as = (av ?? '').toString().toLowerCase();
      const bs = (bv ?? '').toString().toLowerCase();
      return as.localeCompare(bs, 'pt-BR') * dir;
    });
  };

  // Rótulos do menu de ordenação por coluna: numérico/moeda usa "0-9" em vez de "A-Z",
  // já que a coluna não tem alfabeto.
  const getSortLabels = (colId: string, columnDefs: ColumnDefinition[]) => {
    if (colId === 'data_criacao') return { asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' };
    const column = columnDefs.find(col => col.id === colId);
    if (column?.type === 'date') return { asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' };
    if (colId === 'cnpj' || column?.type === 'number' || column?.type === 'currency') {
      return { asc: 'Ordenar 0-9', desc: 'Ordenar 9-0' };
    }
    return { asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' };
  };

  const handleSort = (colId: string, direction: SortDirection) => {
    setSortColumn(colId);
    setSortDirection(direction);
  };

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  // Opções derivadas dos valores que já existem em empresas — mesma ideia dos filtros
  // de Vendedor/Fabricante/Marcador em Negócios, só que sem hook próprio: aqui os
  // valores já vêm carregados junto com useClientes().
  const ufsDisponiveis = Array.from(new Set(empresas.map((c: any) => c.uf).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  const cidadesDisponiveis = Array.from(new Set(empresas.map((c: any) => c.cidade).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  const classificacoesDisponiveis = Array.from(new Set(empresas.map((c: any) => c.classificacao).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  const criadoresDisponiveis = (() => {
    const mapa = new Map<string, string>();
    empresas.forEach((c: any) => {
      if (c.criado_por_usuario_id && c.criado_por_usuario?.nome) mapa.set(c.criado_por_usuario_id, c.criado_por_usuario.nome);
    });
    return Array.from(mapa, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  })();

  const filteredEmpresas = sortRows(
    empresas.filter((c: any) => {
      const s = normalizarParaBusca(search);
      const matchSearch = !s || buildRowSearchText(c, rotuloDoTipo(c.tipo, tipos)).includes(s);
      const matchTipo = selectedTipos.length === 0 || selectedTipos.includes(c.tipo);
      const matchUf = selectedUfs.length === 0 || (c.uf && selectedUfs.includes(c.uf));
      const matchCidade = selectedCidades.length === 0 || (c.cidade && selectedCidades.includes(c.cidade));
      const matchClassificacao = selectedClassificacoes.length === 0 || (c.classificacao && selectedClassificacoes.includes(c.classificacao));
      const matchCriador = selectedCriadores.length === 0 || (c.criado_por_usuario_id && selectedCriadores.includes(c.criado_por_usuario_id));
      return matchSearch && matchTipo && matchUf && matchCidade && matchClassificacao && matchCriador;
    }),
    sortColumn,
    sortDirection,
    empresasSettings.columns,
  );

  const filteredContatos = sortRows(
    contatos.filter(c => {
      const s = normalizarParaBusca(search);
      return !s || buildRowSearchText(c).includes(s);
    }),
    sortColumn,
    sortDirection,
    contatosSettings.columns,
  );

  const filtered = activeTab === 'empresas' ? filteredEmpresas : filteredContatos;
  
  const hasFilters = selectedTipos.length > 0 || selectedUfs.length > 0 || selectedCidades.length > 0
    || selectedClassificacoes.length > 0 || selectedCriadores.length > 0 || search !== '';
  const activeFilterCount = selectedTipos.length + selectedUfs.length + selectedCidades.length
    + selectedClassificacoes.length + selectedCriadores.length;

  
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

  // A lista vem do banco, então chega depois da primeira pintura da tela. Este efeito
  // é quem dá ao campo Tipo o primeiro item da empresa; sem ele o Select ficaria vazio.
  useEffect(() => {
    if (!tipo && tipos.length > 0) setTipo(tipoPadrao(tipos));
  }, [tipo, tipos]);

  // Muitas empresas (principalmente importadas) têm em `tipo` um valor de texto livre
  // que não está na lista da empresa (ex.: "construtora - 3 níveis", "condomínios").
  // opcoesDeFiltro soma esses valores em uso à lista do banco: sem isso a empresa
  // existe, mas nenhuma opção do filtro a alcança.
  const tipoFilterOptions = opcoesDeFiltro(tipos, empresas.map((c: any) => c.tipo));

  const handleCnpjChange = (value: string) => {
    const masked = maskCnpj(value);
    setCnpj(masked);
    setCnpjStatus('idle');
    if (unmaskCnpj(masked).length === 14) {
      handleCnpjLookup(masked);
    }
  };

  const handleCnpjLookup = async (cnpjValue: string) => {
    const digits = unmaskCnpj(cnpjValue);
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
    setTelefone(''); setEmail(''); setCnpjStatus('idle'); setNomeContato(''); setCargo('');
    setContatoMode('nenhum'); setSelectedContatoId(''); setContatoEmail(''); setContatoTelefone('');
    setCamposExtrasEmpresa({}); setCamposExtrasContato({});
    setStep(1);
  };

  // Valida os campos da etapa atual do wizard de "Nova Empresa"; retorna false
  // e mostra o erro sem avançar quando algo obrigatório estiver faltando.
  const validateEmpresaStep = (targetStep: number) => {
    if (targetStep === 1) {
      const nomeObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'nome')?.obrigatorio ?? true;
      if (nomeObrigatorio && !empresa.trim()) {
        toast.error('Informe o nome da empresa.');
        return false;
      }
      const cnpjObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'cnpj')?.obrigatorio ?? true;
      // Se o CNPJ não for obrigatório e o campo estiver vazio, pula a validação de
      // formato; se foi preenchido (mesmo sem ser obrigatório), o formato ainda é validado.
      if (cnpjObrigatorio || cnpj.trim()) {
        if (unmaskCnpj(cnpj).length !== 14) {
          toast.error('Informe um CNPJ válido.');
          return false;
        }
        if (!isValidCnpjDigits(unmaskCnpj(cnpj))) {
          toast.error('CNPJ inválido');
          return false;
        }
      }
      const razaoSocialObrigatoria = camposConfigClientes?.find(c => c.campo_key === 'razao_social')?.obrigatorio ?? false;
      if (razaoSocialObrigatoria && !razaoSocial.trim()) {
        toast.error('Informe a razão social da empresa.');
        return false;
      }
      const tipoObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'tipo')?.obrigatorio ?? false;
      if (tipoObrigatorio && !tipo.trim()) {
        toast.error('Informe o tipo da empresa.');
        return false;
      }
    }
    if (targetStep === 2) {
      const emailObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'email')?.obrigatorio ?? true;
      const telefoneObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'telefone')?.obrigatorio ?? true;
      if (emailObrigatorio && !email.trim()) {
        toast.error('Informe o email da empresa.');
        return false;
      }
      if (telefoneObrigatorio && !telefone.trim()) {
        toast.error('Informe o telefone da empresa.');
        return false;
      }
    }
    if (targetStep === 3) {
      const enderecoObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'endereco')?.obrigatorio ?? false;
      if (enderecoObrigatorio && (!endereco.numero.trim() || !endereco.logradouro.trim())) {
        toast.error('Informe o logradouro e o número do endereço.');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateEmpresaStep(step)) return;
    setStep(s => Math.min(s + 1, EMPRESA_STEPS.length));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    if (activeTab === 'contatos') {
      const contatoEmailValue = (form.get('email') as string) || '';
      const nomeContatoObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'nome_contato')?.obrigatorio ?? true;
      if (nomeContatoObrigatorio && !nomeContato.trim()) {
        toast.error('Informe o nome do contato.');
        return;
      }
      const contatoEmailObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'email')?.obrigatorio ?? true;
      const contatoTelefoneObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'telefone')?.obrigatorio ?? true;
      const cargoObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'cargo')?.obrigatorio ?? false;
      const empresaVinculoObrigatoria = camposConfigContatos?.find(c => c.campo_key === 'empresa_vinculo')?.obrigatorio ?? false;
      if (contatoEmailObrigatorio && !contatoEmailValue.trim()) {
        toast.error('Informe o email do contato.');
        return;
      }
      if (contatoTelefoneObrigatorio && !telefone.trim()) {
        toast.error('Informe o telefone do contato.');
        return;
      }
      if (cargoObrigatorio && !cargo.trim()) {
        toast.error('Informe o cargo do contato.');
        return;
      }
      if (empresaVinculoObrigatoria && !empresa.trim()) {
        toast.error('Vincule uma empresa ao contato.');
        return;
      }
      for (const c of (camposConfigContatos ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
        if (!camposExtrasContato[c.campo_key]?.trim()) {
          toast.error(`Preencha o campo obrigatório: ${c.label}`);
          return;
        }
      }
      try {
        await createContato.mutateAsync({
          empresa: clients?.find(c => c.id === empresa)?.empresa || undefined,
          cliente_id: empresa || undefined,
          nome_contato: nomeContato || undefined,
          email: contatoEmailValue || undefined,
          telefone: telefone || undefined,
          cargo: cargo || undefined,
          campos_extras: camposExtrasContato,
        });
        toast.success('Contato cadastrado com sucesso!');
        resetForm();
        setDialogOpen(false);
      } catch (err: any) {
        toast.error(err.message);
      }
      return;
    }

    // No wizard de empresa, Enter nos campos apenas avança a etapa — nunca cria diretamente.
    // A criação só acontece via clique explícito no botão "Salvar" (handleSaveEmpresa).
    if (step < EMPRESA_STEPS.length) {
      handleNextStep();
    }
  };

  const handleSaveEmpresa = async () => {
    if (step !== EMPRESA_STEPS.length) return;
    if (!validateEmpresaStep(1) || !validateEmpresaStep(2) || !validateEmpresaStep(3)) {
      return;
    }
    if (contatoMode === 'existente' && !selectedContatoId) {
      toast.error('Selecione um contato existente ou escolha cadastrar um novo.');
      return;
    }
    if (contatoMode === 'novo') {
      const nomeContatoObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'nome_contato')?.obrigatorio ?? true;
      if (nomeContatoObrigatorio && !nomeContato.trim()) {
        toast.error('Informe o nome do novo contato.');
        return;
      }
      const contatoEmailObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'email')?.obrigatorio ?? true;
      const contatoTelefoneObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'telefone')?.obrigatorio ?? true;
      const cargoObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'cargo')?.obrigatorio ?? false;
      if (contatoEmailObrigatorio && !contatoEmail.trim()) {
        toast.error('Informe o email do novo contato.');
        return;
      }
      if (contatoTelefoneObrigatorio && !contatoTelefone.trim()) {
        toast.error('Informe o telefone do novo contato.');
        return;
      }
      if (cargoObrigatorio && !cargo.trim()) {
        toast.error('Informe o cargo do novo contato.');
        return;
      }
      for (const c of (camposConfigContatos ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
        if (!camposExtrasContato[c.campo_key]?.trim()) {
          toast.error(`Preencha o campo obrigatório: ${c.label}`);
          return;
        }
      }
    }
    for (const c of (camposConfigClientes ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
      if (!camposExtrasEmpresa[c.campo_key]?.trim()) {
        toast.error(`Preencha o campo obrigatório: ${c.label}`);
        return;
      }
    }
    const enderecoStr = enderecoToString(endereco);
    try {
      const createdCliente = await createCliente.mutateAsync({
        empresa,
        razao_social: razaoSocial || undefined,
        tipo,
        cnpj: cnpj || undefined,
        email: email || undefined,
        telefone: telefone || undefined,
        endereco: enderecoStr || undefined,
        campos_extras: camposExtrasEmpresa,
      });
      if (contatoMode === 'existente') {
        await updateContato.mutateAsync({ id: selectedContatoId, empresa: empresa.trim(), cliente_id: createdCliente.id });
      } else if (contatoMode === 'novo') {
        await createContato.mutateAsync({
          empresa: empresa.trim(),
          cliente_id: createdCliente.id,
          nome_contato: nomeContato.trim(),
          cargo: cargo.trim() || undefined,
          email: contatoEmail.trim() || undefined,
          telefone: contatoTelefone.trim() || undefined,
          campos_extras: camposExtrasContato,
        });
      }
      toast.success('Empresa cadastrada com sucesso!');
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as ViewTab);
    setSelectedTipos([]);
    setSelectedUfs([]);
    setSelectedCidades([]);
    setSelectedClassificacoes([]);
    setSelectedCriadores([]);
    setSearch('');
    setSortColumn(tab === 'empresas' ? 'empresa' : 'nome_contato');
    setSortDirection('asc');
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


  // Subtítulo descreve a tela, como no resto do sistema. Era a soma de empresas +
  // contatos; essa contagem não se perdeu, continua no selo de cada aba logo abaixo.
  return (
    <AppLayout title="Clientes" subtitle="Carteira de clientes e os contatos de cada empresa" mainClassName="flex-1 overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 md:p-6 w-full flex-1 flex flex-col min-h-0">
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
              setSelectedTipos([]);
              setSelectedUfs([]);
              setSelectedCidades([]);
              setSelectedClassificacoes([]);
              setSelectedCriadores([]);
            }}
            popoverClassName="w-64"
          >
            <div className="flex flex-col gap-1">
              {/* Submenu Tipo */}
              <StandardPopoverMenu
                label="Tipo"
                icon={Settings2}
                badge={selectedTipos.length > 0 ? selectedTipos.length : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-64"
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-3 pt-3 pb-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tipo</p>
                    {/* A lista agora é da empresa inteira: para quem não é gestor o banco
                        recusaria criar e excluir, então o atalho nem aparece. */}
                    {podeGerenciarTipos && (
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
                    )}
                  </div>
                  <FilterCheckboxList
                    options={tipoFilterOptions}
                    selected={selectedTipos}
                    onToggle={(v) => { toggleFilter(selectedTipos, setSelectedTipos, v); setPage(1); }}
                    searchPlaceholder="Buscar tipo..."
                  />
                </div>
              </StandardPopoverMenu>

              {/* Submenu UF */}
              <StandardPopoverMenu
                label="UF"
                icon={MapPin}
                badge={selectedUfs.length > 0 ? selectedUfs.length : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-56"
              >
                <FilterCheckboxList
                  options={ufsDisponiveis.map((uf: string) => ({ value: uf, label: uf }))}
                  selected={selectedUfs}
                  onToggle={(v) => { toggleFilter(selectedUfs, setSelectedUfs, v); setPage(1); }}
                  emptyMessage="Nenhuma UF cadastrada."
                  searchPlaceholder="Buscar UF..."
                />
              </StandardPopoverMenu>

              {/* Submenu Cidade */}
              <StandardPopoverMenu
                label="Cidade"
                icon={Building2}
                badge={selectedCidades.length > 0 ? selectedCidades.length : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-64"
              >
                <FilterCheckboxList
                  options={cidadesDisponiveis.map((cidade: string) => ({ value: cidade, label: cidade }))}
                  selected={selectedCidades}
                  onToggle={(v) => { toggleFilter(selectedCidades, setSelectedCidades, v); setPage(1); }}
                  emptyMessage="Nenhuma cidade cadastrada."
                  searchPlaceholder="Buscar cidade..."
                />
              </StandardPopoverMenu>

              {/* Submenu Classificação */}
              <StandardPopoverMenu
                label="Classificação"
                icon={Tag}
                badge={selectedClassificacoes.length > 0 ? selectedClassificacoes.length : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-56"
              >
                <FilterCheckboxList
                  options={classificacoesDisponiveis.map((c: string) => ({ value: c, label: c }))}
                  selected={selectedClassificacoes}
                  onToggle={(v) => { toggleFilter(selectedClassificacoes, setSelectedClassificacoes, v); setPage(1); }}
                  emptyMessage="Nenhuma classificação cadastrada."
                  searchPlaceholder="Buscar classificação..."
                />
              </StandardPopoverMenu>

              {/* Submenu Criado por */}
              <StandardPopoverMenu
                label="Criado por"
                icon={UserCheck}
                badge={selectedCriadores.length > 0 ? selectedCriadores.length : undefined}
                side="left"
                align="start"
                sideOffset={10}
                popoverClassName="w-64"
              >
                <FilterCheckboxList
                  options={criadoresDisponiveis.map(u => ({ value: u.id, label: u.nome }))}
                  selected={selectedCriadores}
                  onToggle={(v) => { toggleFilter(selectedCriadores, setSelectedCriadores, v); setPage(1); }}
                  emptyMessage="Nenhum criador identificado."
                  searchPlaceholder="Buscar responsável..."
                />
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
            <div className="flex flex-col border-border/50">
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
            <ConteudoDialogo className="sm:max-w-md">
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
                {tipos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Nenhum tipo cadastrado</p>
                ) : (
                  <div className="space-y-1">
                    {tipos.map(t => (
                      <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{t.nome}</span>
                          {t.is_sistema && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">padrão</span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmDeleteTipo({ id: t.id, slug: t.slug, nome: t.nome })}
                          title={`Excluir "${t.nome}"`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3">
                <Button variant="outline" size="sm" onClick={() => setNewTipoOpen(false)}>Fechar</Button>
              </div>
            </ConteudoDialogo>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {activeTab === 'empresas' ? 'Nova Empresa' : 'Novo Contato'}</Button>
            </DialogTrigger>
            <ConteudoDialogo className="max-w-2xl">
              <CabecalhoAssistente
                titulo={activeTab === 'empresas' ? 'Cadastrar Empresa' : 'Cadastrar Contato'}
                etapas={activeTab === 'empresas' ? EMPRESA_STEPS : undefined}
                etapaAtual={activeTab === 'empresas' ? step : undefined}
              />

              {/* className="contents": o <form> some da caixa (display:contents) para o corpo
                  rolar e o rodapé ficar fixo, mas continua sendo o ancestral de formulário —
                  o botão type="submit" da aba Contato dispara handleSubmit normalmente. */}
              <form onSubmit={handleSubmit} className="contents">
              <CorpoDialogo className="space-y-4 mt-2">
                {activeTab === 'empresas' ? (
                  <>
                    {step === 1 && (
                      <>
                        <div>
                          <Label>Tipo{empresaObrigatorio('tipo', false) && ' *'}</Label>
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
                              {tipos.map(t => (
                                <SelectItem key={t.id} value={t.slug}>{t.nome}</SelectItem>
                              ))}
                              {/* Só gestor cria tipo: para os demais a RLS recusaria a gravação. */}
                              {podeGerenciarTipos && (
                                <SelectItem value="__new__" className="text-primary font-medium">+ Criar novo tipo…</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>CNPJ{empresaObrigatorio('cnpj', true) && ' *'}</Label>
                          <div className="relative">
                            <Input
                              value={cnpj}
                              onChange={(e) => handleCnpjChange(e.target.value)}
                              placeholder="00.000.000/0000-00"
                              className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''}
                              required={empresaObrigatorio('cnpj', true)}
                            />
                            {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                            {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">Ao sair do campo, o CNPJ será validado e os dados preenchidos automaticamente</p>
                        </div>
                        <div><Label>Nome{empresaObrigatorio('nome', true) && ' *'}</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome fantasia ou nome" required={empresaObrigatorio('nome', true)} /></div>
                        <div><Label>Razão Social{empresaObrigatorio('razao_social', false) && ' *'}</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social da empresa" required={empresaObrigatorio('razao_social', false)} /></div>
                      </>
                    )}

                    {step === 2 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><Label>Email{empresaObrigatorio('email', true) && ' *'}</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@exemplo.com" required={empresaObrigatorio('email', true)} /></div>
                        <div><Label>Telefone{empresaObrigatorio('telefone', true) && ' *'}</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" required={empresaObrigatorio('telefone', true)} /></div>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="space-y-3">
                        <EnderecoForm value={endereco} onChange={setEndereco} required={empresaObrigatorio('endereco', false)} />
                        {(camposConfigClientes ?? []).filter(c => c.origem === 'customizado').map(campo => (
                          <div key={campo.id}>
                            <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                            <Input
                              value={camposExtrasEmpresa[campo.campo_key] ?? ''}
                              onChange={e => setCamposExtrasEmpresa(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                              placeholder={campo.label ?? ''}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {step === 4 && (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Vincular Contato</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant={contatoMode === 'nenhum' ? 'default' : 'outline'} onClick={() => setContatoMode('nenhum')}>Nenhum</Button>
                          <Button type="button" size="sm" variant={contatoMode === 'existente' ? 'default' : 'outline'} onClick={() => setContatoMode('existente')}>Selecionar existente</Button>
                          <Button type="button" size="sm" variant={contatoMode === 'novo' ? 'default' : 'outline'} onClick={() => setContatoMode('novo')}>Novo contato</Button>
                        </div>
                        {contatoMode === 'existente' && (
                          /* Eram mais de mil contatos numa lista sem busca, e no pior momento
                             possível: o cadastro já está preenchido e o usuário trava no
                             último passo. Agora dá para digitar nome, e-mail ou telefone. */
                          <ContatoSelector
                            contatos={contatosList ?? []}
                            value={selectedContatoId}
                            onValueChange={setSelectedContatoId}
                            placeholder={loadingContatos ? 'Carregando contatos...' : 'Selecione um contato...'}
                          />
                        )}
                        {contatoMode === 'novo' && (
                          <div className="space-y-3">
                            <Input value={nomeContato} onChange={e => setNomeContato(e.target.value)} placeholder={`Nome do contato${contatoObrigatorio('nome_contato', true) ? ' *' : ''}`} required={contatoObrigatorio('nome_contato', true)} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <CargoSelect value={cargo} onValueChange={setCargo} />
                              <Input value={contatoTelefone} onChange={e => setContatoTelefone(e.target.value)} placeholder={`Telefone do contato${contatoObrigatorio('telefone', true) ? ' *' : ''}`} required={contatoObrigatorio('telefone', true)} />
                            </div>
                            <Input value={contatoEmail} onChange={e => setContatoEmail(e.target.value)} type="email" placeholder={`Email do contato${contatoObrigatorio('email', true) ? ' *' : ''}`} required={contatoObrigatorio('email', true)} />
                            {(camposConfigContatos ?? []).filter(c => c.origem === 'customizado').map(campo => (
                              <div key={campo.id}>
                                <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                                <Input
                                  value={camposExtrasContato[campo.campo_key] ?? ''}
                                  onChange={e => setCamposExtrasContato(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                                  placeholder={campo.label ?? ''}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </>
                ) : (
                  <>
                    <div><Label>Nome do contato{contatoObrigatorio('nome_contato', true) && ' *'}</Label><Input value={nomeContato} onChange={e => setNomeContato(e.target.value)} placeholder="Nome completo" required={contatoObrigatorio('nome_contato', true)} /></div>
                    <div><Label>Empresa{contatoObrigatorio('empresa_vinculo', false) && ' *'}</Label><EmpresaSelector value={empresa} onValueChange={setEmpresa} placeholder="Vincular empresa..." /></div>
                    <div><Label>Cargo{contatoObrigatorio('cargo', false) && ' *'}</Label><CargoSelect value={cargo} onValueChange={setCargo} /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>Email{contatoObrigatorio('email', true) && ' *'}</Label><Input name="email" type="email" placeholder="email@exemplo.com" required={contatoObrigatorio('email', true)} /></div>
                      <div><Label>Telefone{contatoObrigatorio('telefone', true) && ' *'}</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" required={contatoObrigatorio('telefone', true)} /></div>
                    </div>
                    {(camposConfigContatos ?? []).filter(c => c.origem === 'customizado').map(campo => (
                      <div key={campo.id}>
                        <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                        <Input
                          value={camposExtrasContato[campo.campo_key] ?? ''}
                          onChange={e => setCamposExtrasContato(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                          placeholder={campo.label ?? ''}
                        />
                      </div>
                    ))}
                  </>
                )}
              </CorpoDialogo>

              {activeTab === 'empresas' ? (
                <RodapeAssistente
                  esquerda={step > 1 ? (
                    <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)}>
                      Voltar
                    </Button>
                  ) : undefined}
                >
                  {step < EMPRESA_STEPS.length ? (
                    <Button type="button" onClick={handleNextStep}>
                      Avançar
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleSaveEmpresa} disabled={createCliente.isPending || createContato.isPending || updateContato.isPending}>
                      {(createCliente.isPending || createContato.isPending || updateContato.isPending) ? 'Salvando...' : 'Salvar'}
                    </Button>
                  )}
                </RodapeAssistente>
              ) : (
                <RodapeDialogo>
                  <Button type="submit" className="w-full" disabled={createContato.isPending}>
                    {createContato.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </RodapeDialogo>
              )}
              </form>
            </ConteudoDialogo>
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
          <ConteudoDialogo className="sm:max-w-md">
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
          </ConteudoDialogo>
        </Dialog>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : activeTab === 'empresas' ? (
          <>
            {/* Tela estreita: a tabela tem largura em pixel somada coluna a coluna e não cabe
                no celular de jeito nenhum. Mesma solução que Tarefas.tsx já usa — os mesmos
                dados em cartão, com os campos que identificam a empresa. Tocar abre o painel
                lateral, igual ao clique na linha no computador. */}
            <div className="block md:hidden space-y-3 flex-1 min-h-0 overflow-y-auto">
              {paginatedEmpresas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma empresa encontrada</p>
                  <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre uma nova</p>
                </div>
              ) : paginatedEmpresas.map(client => {
                const Icon = getTipoIcon(client.tipo);
                const local = [client.cidade, client.uf].filter(Boolean).join(' / ');
                return (
                  <div
                    key={client.id}
                    onClick={() => { if (!hasTextSelection()) setPanelEmpresa(client); }}
                    className={cn(
                      'rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-[var(--shadow-card)] cursor-pointer transition-all',
                      selected.has(client.id) && 'ring-1 ring-primary/30 bg-primary/5'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected.has(client.id)}
                        onCheckedChange={() => toggleOne(client.id)}
                        onClick={e => e.stopPropagation()}
                        className="mt-1 shrink-0"
                        aria-label={`Selecionar ${client.empresa}`}
                      />
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-card-foreground line-clamp-2">{client.empresa || 'Sem nome'}</p>
                        {visibleColumns.includes('tipo') && (
                          <Badge variant="secondary" className="mt-1 text-[10px] font-medium">{rotuloDoTipo(client.tipo, tipos)}</Badge>
                        )}
                      </div>
                    </div>
                    {/* Os mesmos campos que a pessoa escolheu ver na tabela — desligar uma
                        coluna no botão "Colunas" também tira ela do cartão. */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {visibleColumns.includes('telefone') && client.telefone && (
                        <p className="flex items-center gap-1.5 truncate"><Phone className="h-3 w-3 shrink-0" />{client.telefone}</p>
                      )}
                      {visibleColumns.includes('email') && client.email && (
                        <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" />{client.email}</p>
                      )}
                      {(visibleColumns.includes('cidade') || visibleColumns.includes('uf')) && local && (
                        <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3 w-3 shrink-0" />{local}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-auto flex-1 min-h-0">
                {/* 🔴 `minWidth: '100%'` — as colunas repartem o espaço que sobra.
                    A largura em pixels continua sendo a soma das colunas (é ela que faz o
                    redimensionar funcionar), mas o `min-width` obriga a tabela a ocupar a
                    caixa inteira quando essa soma é MENOR que a tela. O navegador então
                    distribui a sobra entre as colunas, na proporção da largura de cada uma.

                    Vale para as DUAS tabelas desta tela, e o efeito é diferente em cada uma:

                    • Contatos tem 7 colunas. Antes de 26/08/2026 elas somavam 1.090px numa
                      caixa de 1.600 e sobravam 509px de branco à direita — era o defeito.
                      Medido no navegador, com a tabela reproduzida isolada.

                    • Empresas tem 17 colunas, que já passam da largura da tela. Ali o
                      `min-width` não faz nada e a tabela rola como sempre rolou. Por isso o
                      vão só aparecia em Contatos. */}
              <table className="text-sm table-fixed" style={{ width: clientesTableTotalWidth, minWidth: '100%' }}>
                <colgroup>
                  <col style={{ width: CLIENTES_CHECKBOX_COL_WIDTH }} />
                  {visibleColumns.map((colId, i) => (
                    <col key={colId} style={{ width: resolvedClienteColWidths[i] }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="border-b bg-muted/50">
                    <th className="h-14 px-2.5 w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </th>
                    {visibleColumns.map((colId, i) => (
                      <SortableTh
                        key={colId}
                        label={getLabel(colId)}
                        sortKey={colId}
                        currentSortKey={sortColumn}
                        currentDirection={sortDirection}
                        onSort={handleSort}
                        ascLabel={getSortLabels(colId, columns).asc}
                        descLabel={getSortLabels(colId, columns).desc}
                        width={resolvedClienteColWidths[i]}
                        onResize={(w) => setColumnWidth(colId, w)}
                      />
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

                    // Clique em cima do texto de qualquer coluna abre a página de detalhe
                    // (stopPropagation evita que o clique também dispare o painel lateral);
                    // clique na linha fora do texto (padding, espaços vazios da célula) abre
                    // o painel. Ambos ignoram o clique se ele foi o fim de uma seleção de
                    // texto (usuário copiando um valor da célula).
                    const openEmpresaDetail = () => {
                      if (hasTextSelection()) return;
                      const slug = slugify(client.empresa || 'cliente');
                      navigate(`/clientes/${slug}-${client.id}`);
                    };
                    const onTextClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      openEmpresaDetail();
                    };
                    const openEmpresaPainel = () => {
                      if (hasTextSelection()) return;
                      setPanelEmpresa(client);
                    };

                    return (
                      <tr key={client.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${selected.has(client.id) ? 'bg-primary/5' : ''}`} onClick={openEmpresaPainel}>
                        <td className="py-1.5 px-2.5 w-10" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selected.has(client.id)} onCheckedChange={() => toggleOne(client.id)} aria-label={`Selecionar ${client.empresa}`} />
                        </td>
                        {visibleColumns.map(colId => {
                          const isCustom = colId.startsWith('custom_');
                          const column = columns.find(col => col.id === colId);
                          let value: any = getColumnValue(client as any, column);

                          if (colId === 'empresa') {
                            return (
                              <td key={colId} className="py-1.5 px-2.5 overflow-hidden">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="font-semibold text-sm truncate text-foreground" onClick={onTextClick}>{client.empresa}</span>
                                </div>
                              </td>
                            );
                          }

                          if (colId === 'tipo') {
                            return (
                              <td key={colId} className="py-1.5 px-2.5">
                                <Badge variant="secondary" className="text-[10px] font-medium" onClick={onTextClick}>{rotuloDoTipo(client.tipo, tipos)}</Badge>
                              </td>
                            );
                          }

                          // Coluna legada (o id não está em CLIENTE_FIELDS): só aparece para
                          // quem tem esse id preso na configuração de tabela salva no
                          // navegador. Sem a seção Obras ela cai no tratamento genérico e
                          // mostra "—", em vez de uma contagem que não leva a lugar nenhum.
                          if (colId === 'obras_count' && temObras === true) {
                            return (
                              <td key={colId} className="py-1.5 px-2.5 text-xs">
                                <span onClick={onTextClick}>
                                  {client.obras?.length ? <span className="text-primary font-medium">{client.obras.length}</span> : '—'}
                                </span>
                              </td>
                            );
                          }

                          if (colId === 'data_criacao') {
                            value = formatDateBR(value);
                          }

                          return (
                            <td key={colId} className={cn("py-1.5 px-2.5 overflow-hidden text-ellipsis whitespace-nowrap", isCustom ? "text-xs text-muted-foreground" : "text-sm text-foreground font-normal")}>
                              <span onClick={onTextClick}>{value || '—'}</span>
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
            {/* Mesma lista em cartões da aba Empresas, para a aba Contatos. */}
            <div className="block md:hidden space-y-3 flex-1 min-h-0 overflow-y-auto">
              {paginatedContatos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhum contato encontrado</p>
                  <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre um novo</p>
                </div>
              ) : paginatedContatos.map(contato => (
                <div
                  key={contato.id}
                  onClick={() => { if (!hasTextSelection()) setPanelContato(contato); }}
                  className={cn(
                    'rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-[var(--shadow-card)] cursor-pointer transition-all',
                    selected.has(contato.id) && 'ring-1 ring-primary/30 bg-primary/5'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(contato.id)}
                      onCheckedChange={() => toggleOne(contato.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-1 shrink-0"
                      aria-label={`Selecionar ${contato.nome_contato}`}
                    />
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-card-foreground line-clamp-2">{contato.nome_contato || 'Sem nome'}</p>
                      {visibleColumns.includes('empresa') && contato.empresa && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{contato.empresa}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {visibleColumns.includes('cargo') && contato.cargo && (
                      <p className="flex items-center gap-1.5 truncate"><Briefcase className="h-3 w-3 shrink-0" />{contato.cargo}</p>
                    )}
                    {visibleColumns.includes('telefone') && contato.telefone && (
                      <p className="flex items-center gap-1.5 truncate"><Phone className="h-3 w-3 shrink-0" />{contato.telefone}</p>
                    )}
                    {visibleColumns.includes('email') && contato.email && (
                      <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" />{contato.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block rounded-lg border border-border/60 border-b-0 rounded-b-none overflow-auto flex-1 min-h-0">
              <table className="text-sm table-fixed" style={{ width: clientesTableTotalWidth, minWidth: '100%' }}>
                <colgroup>
                  <col style={{ width: CLIENTES_CHECKBOX_COL_WIDTH }} />
                  {visibleColumns.map((colId, i) => (
                    <col key={colId} style={{ width: resolvedClienteColWidths[i] }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="border-b bg-muted/50">
                    <th className="h-14 px-2.5 w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </th>
                    {visibleColumns.map((colId, i) => (
                      <SortableTh
                        key={colId}
                        label={getLabel(colId)}
                        sortKey={colId}
                        currentSortKey={sortColumn}
                        currentDirection={sortDirection}
                        onSort={handleSort}
                        ascLabel={getSortLabels(colId, columns).asc}
                        descLabel={getSortLabels(colId, columns).desc}
                        width={resolvedClienteColWidths[i]}
                        onResize={(w) => setColumnWidth(colId, w)}
                      />
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

                    // Mesma lógica de clique-em-texto-vs-fora-do-texto usada na tabela de
                    // Empresas (ver comentário lá).
                    const openContatoDetail = () => {
                      if (hasTextSelection()) return;
                      const slug = slugify(contato.nome_contato || 'contato');
                      navigate(`/contatos/${slug}-${contato.id}`);
                    };
                    const onTextClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      openContatoDetail();
                    };
                    const openContatoPainel = () => {
                      if (hasTextSelection()) return;
                      setPanelContato(contato);
                    };

                    return (
                      <tr key={contato.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${selected.has(contato.id) ? 'bg-primary/5' : ''}`} onClick={openContatoPainel}>
                        <td className="py-1.5 px-2.5 w-10" onClick={e => e.stopPropagation()}>
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
                            return (
                              <td key={colId} className="py-1.5 px-2.5 overflow-hidden">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <User className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="font-semibold text-sm truncate text-foreground" onClick={onTextClick}>{contato.nome_contato || 'Sem nome'}</span>
                                </div>
                              </td>
                            );
                          }

                          if (colId === 'empresa') {
                            return (
                              <td key={colId} className="py-1.5 px-2.5 text-sm font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                                <span onClick={onTextClick}>{value || '—'}</span>
                              </td>
                            );
                          }

                          return (
                            <td key={colId} className={cn("py-1.5 px-2.5 overflow-hidden text-ellipsis whitespace-nowrap", isCustom ? "text-xs text-muted-foreground" : "text-sm text-foreground font-normal")}>
                              <span onClick={onTextClick}>{value || '—'}</span>
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

      {/* Painel lateral de detalhe rápido de Empresa (clique na linha fora do texto) */}
      <Sheet open={!!panelEmpresa} onOpenChange={(open) => !open && setPanelEmpresa(null)}>
        {panelEmpresa && (() => {
          const Icon = getTipoIcon(panelEmpresa.tipo);
          return (
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
              <SheetHeader className="pb-6 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate">{panelEmpresa.empresa}</span>
                </SheetTitle>
                <SheetDescription>{rotuloDoTipo(panelEmpresa.tipo, tipos)}</SheetDescription>
              </SheetHeader>

              <div className="py-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {panelEmpresa.razao_social && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 className="h-3 w-3" /> Razão social
                      </Label>
                      <p className="text-sm font-medium">{panelEmpresa.razao_social}</p>
                    </div>
                  )}
                  {panelEmpresa.cnpj && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <IdCard className="h-3 w-3" /> CNPJ / CPF
                      </Label>
                      <p className="text-sm font-medium">{panelEmpresa.cnpj}</p>
                    </div>
                  )}
                  {panelEmpresa.email && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> E-mail
                      </Label>
                      {/* O endereço é dado cadastral do cliente e continua na tela; o que
                          sai sem o módulo de E-mail é o atalho de envio, que levaria a uma
                          tela que a rota recusa. Vira texto simples, sem cara de link. */}
                      {temEmails === true ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-left hover:underline hover:text-primary"
                          onClick={() => setEmailParaConfirmar(panelEmpresa.email)}
                        >
                          {panelEmpresa.email}
                        </button>
                      ) : (
                        <p className="text-sm font-medium">{panelEmpresa.email}</p>
                      )}
                    </div>
                  )}
                  {panelEmpresa.telefone && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> Telefone
                      </Label>
                      <p className="text-sm font-medium">{panelEmpresa.telefone}</p>
                    </div>
                  )}
                  {panelEmpresa.endereco && (
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> Endereço
                      </Label>
                      <p className="text-sm font-medium">{panelEmpresa.endereco}</p>
                    </div>
                  )}
                  {/* Contagem de obras: sem a seção, é um "0" que nunca sai do lugar. */}
                  {temObras === true && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="h-3 w-3" /> Obras vinculadas
                      </Label>
                      <p className="text-sm font-medium">{panelEmpresa.obras?.length ?? 0}</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Data de cadastro
                    </Label>
                    <p className="text-sm font-medium">{formatDateBR(panelEmpresa.created_at) || '—'}</p>
                  </div>
                </div>
              </div>

              <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
                <div className="flex w-full justify-end gap-2">
                  <Button variant="outline" onClick={() => setPanelEmpresa(null)}>Fechar</Button>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      const slug = slugify(panelEmpresa.empresa || 'cliente');
                      navigate(`/clientes/${slug}-${panelEmpresa.id}`);
                    }}
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir página completa
                  </Button>
                </div>
              </SheetFooter>
            </SheetContent>
          );
        })()}
      </Sheet>

      {/* Painel lateral de detalhe rápido de Contato (clique na linha fora do texto) */}
      <Sheet open={!!panelContato} onOpenChange={(open) => !open && setPanelContato(null)}>
        {panelContato && (
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-6 border-b">
              <SheetTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary shrink-0" />
                <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate">{panelContato.nome_contato || 'Sem nome'}</span>
              </SheetTitle>
              <SheetDescription>Detalhes do contato.</SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {panelContato.cliente?.empresa && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" /> Empresa
                    </Label>
                    <p
                      className="text-sm font-medium hover:text-primary transition-colors cursor-pointer"
                      onClick={() => {
                        const slug = slugify(panelContato.cliente.empresa || 'cliente');
                        navigate(`/clientes/${slug}-${panelContato.cliente.id}`);
                      }}
                    >
                      {panelContato.cliente.empresa}
                    </p>
                  </div>
                )}
                {panelContato.cargo && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Briefcase className="h-3 w-3" /> Cargo
                    </Label>
                    <p className="text-sm font-medium">{panelContato.cargo}</p>
                  </div>
                )}
                {panelContato.email && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> E-mail
                    </Label>
                    {/* Mesmo critério do painel da empresa: o endereço fica, o atalho de
                        envio sai junto com o módulo de E-mail. */}
                    {temEmails === true ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-left hover:underline hover:text-primary"
                        onClick={() => setEmailParaConfirmar(panelContato.email)}
                      >
                        {panelContato.email}
                      </button>
                    ) : (
                      <p className="text-sm font-medium">{panelContato.email}</p>
                    )}
                  </div>
                )}
                {panelContato.telefone && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> Telefone
                    </Label>
                    <p className="text-sm font-medium">{panelContato.telefone}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> Data de cadastro
                  </Label>
                  <p className="text-sm font-medium">{formatDateBR(panelContato.created_at) || '—'}</p>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
              <div className="flex w-full justify-end gap-2">
                <Button variant="outline" onClick={() => setPanelContato(null)}>Fechar</Button>
                <Button
                  className="gap-2"
                  onClick={() => {
                    const slug = slugify(panelContato.nome_contato || 'contato');
                    navigate(`/contatos/${slug}-${panelContato.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4" /> Abrir página completa
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        )}
      </Sheet>

      <AlertDialog open={!!confirmDeleteTipo} onOpenChange={(o) => !o && setConfirmDeleteTipo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo "{confirmDeleteTipo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo sai dos seletores para toda a equipe. Empresas já cadastradas com ele continuam existindo e continuam aparecendo no filtro. Para trazer o tipo de volta, basta criá-lo outra vez com o mesmo nome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteTipo && handleDeleteTipo(confirmDeleteTipo.id, confirmDeleteTipo.slug)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmarEnviarEmailDialog
        endereco={emailParaConfirmar}
        onCancelar={() => setEmailParaConfirmar(null)}
        onConfirmar={(endereco) => navigate(`/emails?to=${encodeURIComponent(endereco)}`)}
      />
    </AppLayout>
  );
};

export default Clientes;

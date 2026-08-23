import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useClientes, useContatos } from '@/hooks/use-clientes';
import { usePedidosPorCliente } from '@/hooks/use-pedidos';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { useTarefas } from '@/hooks/use-tarefas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';
import { useUpdateCliente, useDeleteCliente, useCreateContato, useDeleteContato, useCreateObra, useUpdateContato } from '@/hooks/use-mutations';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConteudoDialogo } from '@/components/shared/DialogoResponsivo';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Building2, Store, User, MapPin, Mail, Phone, Plus, Loader2, Pencil, Trash2, Users, X, HardHat, ListChecks, FileText, Contact, Tag, CalendarDays, UserCheck, Search } from 'lucide-react';
import { useKanbanColunasEmpresa } from '@/hooks/use-kanban-colunas';
import { toast } from 'sonner';
import { EnderecoForm } from '@/components/clientes/EnderecoForm';
import { ContatoSelector } from '@/components/clientes/ContatoSelector';
import { emptyEndereco, enderecoToString, stringToEndereco, type EnderecoFields } from '@/lib/cep';
import { ListPagination } from '@/components/shared/ListPagination';
import { ColumnSettings, type ColumnDefinition } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { ConfirmarEnviarEmailDialog } from '@/components/email/ConfirmarEnviarEmailDialog';
import { slugify } from '@/lib/utils';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User, condominio: Building2, hospital: Building2, distribuidor: Store, hotel: Building2, escola: Building2, instalador: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física', condominio: 'Condomínio', hospital: 'Hospital', distribuidor: 'Distribuidor', hotel: 'Hotel', escola: 'Escola', instalador: 'Instalador' };

// Colunas da tabela de negócios da ficha do cliente. Os ids são os MESMOS de PEDIDOS_COLUMNS
// (Negocios.tsx), pensando no dia em que essa tabela virar um componente compartilhado.
// A CONFIGURAÇÃO, porém, é separada (chave `clientes_negocios`): este painel é um resumo dentro
// da ficha, e compartilhar a chave da tela de Negócios derrubaria as 14 colunas de lá dentro do
// card do cliente — além de fazer uma reordenação aqui mexer na lista principal, e vice-versa.
// Não tem coluna "Cliente" (é sempre o dono da ficha) nem "Ações" (a linha inteira já abre o
// negócio).
const NEGOCIOS_CLIENTE_COLUMNS: ColumnDefinition[] = [
  { id: 'negocio', label: 'Negócio' },
  { id: 'contato', label: 'Contato' },
  { id: 'endereco_entrega', label: 'Obra/Endereço' },
  { id: 'fabricante', label: 'Fabricante' },
  { id: 'valor', label: 'Valor' },
  { id: 'vendedor', label: 'Responsável/Vendedor' },
  { id: 'etapa', label: 'Etapa' },
  { id: 'marcador', label: 'Marcador' },
  { id: 'data_pedido', label: 'Criação' },
  { id: 'prazo_resposta', label: 'Fechamento' },
  { id: 'observacoes', label: 'Observações' },
  { id: 'anexo', label: 'Anexo' },
];

// Exatamente as quatro colunas que a ficha já mostrava: quem nunca mexer na configuração
// continua vendo a mesma tabela de sempre.
const NEGOCIOS_CLIENTE_DEFAULT_VISIBLE = ['fabricante', 'valor', 'etapa', 'data_pedido'];

// Formata datas ISO ("aaaa-mm-dd" ou timestamp completo) para dd/mm/aaaa sem passar
// por conversão de timezone do navegador (o valor já representa a data salva pelo backend).
const formatDateBR = (value?: string | null) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
};


/**
 * Os embeds do negócio (fabricante, vendedor, obra) vêm de um join que o tipo
 * gerado pelo Supabase não descreve. Um tipo com nome, em vez de `as any`
 * espalhado: o compilador ainda ajuda com o que ESTÁ declarado aqui.
 *
 * Fora do componente de propósito: dentro dele a função seria recriada a cada
 * render e cairia como dependência faltante em todo `useMemo` que a usa.
 */
type PedidoComEmbeds = {
  fabricante?: { id?: string; nome?: string } | null;
  vendedor?: { id?: string; nome?: string } | null;
  obra?: { id?: string; nome_obra?: string } | null;
};
const comEmbeds = (p: unknown) => p as PedidoComEmbeds;

const ClienteDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = useMemo(() => {
    if (!slug) return null;
    
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = slug.match(uuidRegex);
    
    if (match) return match[0];
    return slug;
  }, [slug]);

  const navigate = useNavigate();
  const [emailParaConfirmar, setEmailParaConfirmar] = useState<string | null>(null);
  const { data: clientes, isLoading: loadingClientes } = useClientes();
  const { data: pedidos = [], isLoading: loadingPedidos } = usePedidosPorCliente(id);
  const { data: tarefas, isLoading: loadingTarefas } = useTarefas();
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  const { ligada: temEmails } = useSecaoLigada('emails');
  const { ligada: temObras } = useSecaoLigada('obras');
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = useMemo(
    () => tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome })),
    [tarefasKanbanColunas]
  );

  // As etapas vinham de uma lista fixa no código (`@/data/mockData`) com 5 valores, sem
  // "Perdido" — quem abria a ficha do cliente não conseguia filtrar os negócios perdidos
  // dele, e outra empresa assinante veria etapas que não são as dela. Aqui lemos as colunas
  // reais. Pegamos as de TODOS os funis porque a ficha lista os negócios do cliente inteiro,
  // que podem estar em funis diferentes; o `status` do negócio é o slug, então basta um por
  // slug (funis distintos podem repetir "fechamento", e seriam a mesma opção na tela).
  const { data: kanbanColunasEmpresa = [] } = useKanbanColunasEmpresa(empresaId);
  const KANBAN_STAGES = useMemo(() => {
    const porSlug = new Map<string, { key: string; label: string; color: string }>();
    kanbanColunasEmpresa.forEach(c => {
      if (!porSlug.has(c.slug)) porSlug.set(c.slug, { key: c.slug, label: c.nome, color: c.cor });
    });
    return Array.from(porSlug.values());
  }, [kanbanColunasEmpresa]);

  // Debug log
  console.log('ClienteDetalhe - slug:', slug, 'extracted id:', id);
  if (clientes) {
    const found = clientes.find(c => c.id === id);
    console.log('ClienteDetalhe - cliente encontrado:', !!found);
  }
  const updateCliente = useUpdateCliente();
  const deleteCliente = useDeleteCliente();
  const createContato = useCreateContato();
  const deleteContato = useDeleteContato();
  const { data: contatos } = useContatos();
  const [editOpen, setEditOpen] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [addContatoOpen, setAddContatoOpen] = useState(false);
  const [addObraOpen, setAddObraOpen] = useState(false);
  const [vincularContatoOpen, setVincularContatoOpen] = useState(false);
  const [selectedContatoId, setSelectedContatoId] = useState('');
  const updateContato = useUpdateContato();
  const createObra = useCreateObra();
  const [novaObra, setNovaObra] = useState({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
  const [pedidosPage, setPedidosPage] = useState(1);
  const [pedidosPageSize, setPedidosPageSize] = useState(5);
  const [pedidosBusca, setPedidosBusca] = useState('');
  const [pedidosFiltroFabricante, setPedidosFiltroFabricante] = useState('todos');
  const [pedidosFiltroEtapa, setPedidosFiltroEtapa] = useState('todas');
  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [novoNegocioOpen, setNovoNegocioOpen] = useState(false);

  // Mesmo mecanismo de colunas da tela de Clientes e da lista de Negócios (arrastar para
  // reordenar, ligar/desligar, renomear, salvar modelo): o painel de negócios da ficha usa o
  // mesmo hook e o mesmo componente, só com a sua própria chave de configuração.
  const {
    columns: negociosColumns,
    visibleColumns: negociosVisibleColumns,
    setVisibleColumns: setNegociosVisibleColumns,
    handleRename: handleNegociosRename,
    handleTypeChange: handleNegociosTypeChange,
    handleAddColumn: handleNegociosAddColumn,
    handleRemoveColumn: handleNegociosRemoveColumn,
    handleReorder: handleNegociosReorder,
    getLabel: getNegociosLabel,
    presets: negociosPresets,
    savePreset: saveNegociosPreset,
    loadPreset: loadNegociosPreset,
    deletePreset: deleteNegociosPreset,
    resetToDefaults: resetNegociosColumns,
  } = useTableSettings({
    key: 'clientes_negocios',
    defaultColumns: NEGOCIOS_CLIENTE_COLUMNS,
    defaultVisibleColumns: NEGOCIOS_CLIENTE_DEFAULT_VISIBLE,
  });
  // A ordem das colunas visíveis é a ordem da lista `columns` — é ela que o arrasta-e-solta
  // reordena, e é por isso que cabeçalho e células precisam sair sempre desta mesma variável.
  const negociosColunasVisiveis = useMemo(
    () => negociosColumns.filter(col => negociosVisibleColumns.includes(col.id)),
    [negociosColumns, negociosVisibleColumns]
  );
  const [tarefasPage, setTarefasPage] = useState(1);
  const [tarefasPageSize, setTarefasPageSize] = useState(5);

  const copyInfo = async (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Não foi possível copiar a informação.');
    }
  };

  const cliente = clientes?.find(c => c.id === id);

  // O cartão de e-mail continua na tela sem o módulo de E-mail: o endereço é dado
  // cadastral do cliente. O que sai é só o CLIQUE, que levaria a uma tela que a rota
  // recusa — o cartão vira informativo, exatamente como já é hoje para quem não tem
  // e-mail cadastrado.
  const emailClicavel = temEmails === true && !!cliente?.email;

  const selectedViewOrder = useMemo(() =>
    (pedidos ?? []).find(p => p.id === viewOrderId),
  [pedidos, viewOrderId]);
  const pedidosCliente = useMemo(() => (pedidos ?? []).filter(p => p.cliente_id === id), [pedidos, id]);
  const fabricantesDoCliente = useMemo(() => {
    const mapa = new Map<string, string>();
    pedidosCliente.forEach(p => {
      const fab = comEmbeds(p).fabricante;
      if (fab?.id) mapa.set(fab.id, fab.nome);
    });
    return Array.from(mapa, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [pedidosCliente]);
  const pedidosFiltrados = useMemo(() => {
    const termo = pedidosBusca.trim().toLowerCase();
    return pedidosCliente.filter(p => {
      if (pedidosFiltroFabricante !== 'todos' && comEmbeds(p).fabricante?.id !== pedidosFiltroFabricante) return false;
      if (pedidosFiltroEtapa !== 'todas' && p.status !== pedidosFiltroEtapa) return false;
      if (termo) {
        const alvo = [
          comEmbeds(p).fabricante?.nome,
          comEmbeds(p).vendedor?.nome,
          comEmbeds(p).obra?.nome_obra,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [pedidosCliente, pedidosBusca, pedidosFiltroFabricante, pedidosFiltroEtapa]);
  const pedidosFiltrosAtivos = pedidosBusca.trim() !== '' || pedidosFiltroFabricante !== 'todos' || pedidosFiltroEtapa !== 'todas';
  const totalPedidosPages = Math.max(1, Math.ceil(pedidosFiltrados.length / pedidosPageSize));
  const paginatedPedidos = useMemo(() =>
    pedidosFiltrados.slice((pedidosPage - 1) * pedidosPageSize, pedidosPage * pedidosPageSize),
    [pedidosFiltrados, pedidosPage, pedidosPageSize]
  );
  const contatosExtras = (contatos ?? []).filter((c: any) => cliente && c.empresa === cliente.empresa);
  // Candidatos a vincular: todo mundo que ainda não está neste cliente.
  const contatosParaVincular = useMemo(
    () => (contatos ?? []).filter((c: any) => c.empresa !== cliente?.empresa),
    [contatos, cliente?.empresa]
  );
  const tarefasCliente = useMemo(() => (tarefas ?? []).filter(t => t.cliente_id === id), [tarefas, id]);
  const totalTarefasPages = Math.max(1, Math.ceil(tarefasCliente.length / tarefasPageSize));
  const paginatedTarefas = useMemo(() =>
    tarefasCliente.slice((tarefasPage - 1) * tarefasPageSize, tarefasPage * tarefasPageSize),
    [tarefasCliente, tarefasPage, tarefasPageSize]
  );

  // Edit form state
  const [editData, setEditData] = useState({
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '', telefone: '', nome_contato: '',
  });
  const [editEndereco, setEditEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [editCamposExtras, setEditCamposExtras] = useState<Record<string, string>>({});

  const { data: camposConfigClientes } = useConfiguracoesCampos('clientes', empresaId);
  const { data: camposConfigContatos } = useConfiguracoesCampos('contatos', empresaId);

  // Novo contato extra
  const [novoContato, setNovoContato] = useState({ nome_contato: '', cargo: '', email: '', telefone: '' });
  const [novoContatoCamposExtras, setNovoContatoCamposExtras] = useState<Record<string, string>>({});
  const handleAddContato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente) return;
    if (!novoContato.nome_contato.trim()) {
      toast.error('Informe o nome do contato.');
      return;
    }
    const emailObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'email')?.obrigatorio ?? true;
    const telefoneObrigatorio = camposConfigContatos?.find(c => c.campo_key === 'telefone')?.obrigatorio ?? true;
    if (emailObrigatorio && !novoContato.email.trim()) {
      toast.error('Informe o email do contato.');
      return;
    }
    if (telefoneObrigatorio && !novoContato.telefone.trim()) {
      toast.error('Informe o telefone do contato.');
      return;
    }
    for (const c of (camposConfigContatos ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
      if (!novoContatoCamposExtras[c.campo_key]?.trim()) {
        toast.error(`Preencha o campo obrigatório: ${c.label}`);
        return;
      }
    }
    try {
      await createContato.mutateAsync({
        empresa: cliente.empresa,
        nome_contato: novoContato.nome_contato.trim(),
        cargo: novoContato.cargo.trim() || undefined,
        email: novoContato.email.trim() || undefined,
        telefone: novoContato.telefone.trim() || undefined,
        campos_extras: novoContatoCamposExtras,
      });
      toast.success('Contato adicionado!');
      setNovoContato({ nome_contato: '', cargo: '', email: '', telefone: '' });
      setNovoContatoCamposExtras({});
      setAddContatoOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEdit = () => {
    if (!cliente) return;
    setEditData({
      empresa: cliente.empresa ?? '',
      razao_social: (cliente as any).razao_social ?? '',
      tipo: cliente.tipo ?? 'construtora',
      cnpj: cliente.cnpj ?? '',
      email: cliente.email ?? '',
      telefone: cliente.telefone ?? '',
      nome_contato: cliente.nome_contato ?? '',
    });
    setEditEndereco(cliente.endereco ? stringToEndereco(cliente.endereco) : emptyEndereco);
    setEditCamposExtras(((cliente as any).campos_extras as Record<string, string> | null) || {});
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const emailObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'email')?.obrigatorio ?? false;
    const telefoneObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'telefone')?.obrigatorio ?? false;
    const razaoSocialObrigatoria = camposConfigClientes?.find(c => c.campo_key === 'razao_social')?.obrigatorio ?? false;
    if (emailObrigatorio && !editData.email.trim()) {
      toast.error('Informe o email da empresa.');
      return;
    }
    if (telefoneObrigatorio && !editData.telefone.trim()) {
      toast.error('Informe o telefone da empresa.');
      return;
    }
    if (razaoSocialObrigatoria && !editData.razao_social.trim()) {
      toast.error('Informe a razão social da empresa.');
      return;
    }
    for (const c of (camposConfigClientes ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
      if (!editCamposExtras[c.campo_key]?.trim()) {
        toast.error(`Preencha o campo obrigatório: ${c.label}`);
        return;
      }
    }
    const enderecoStr = enderecoToString(editEndereco);
    try {
      await updateCliente.mutateAsync({
        id,
        empresa: editData.empresa,
        razao_social: editData.razao_social || undefined,
        tipo: editData.tipo,
        cnpj: editData.cnpj || undefined,
        email: editData.email || undefined,
        telefone: editData.telefone || undefined,
        endereco: enderecoStr || undefined,
        nome_contato: editData.nome_contato || undefined,
        campos_extras: editCamposExtras,
      });
      toast.success('Cliente atualizado com sucesso!');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loadingClientes) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!cliente) {
    return (
      <AppLayout>
        <div className="p-3 sm:p-4 md:p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <p className="text-muted-foreground mt-8 text-center">Cliente não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  const Icon = tipoIcons[cliente.tipo] ?? Building2;
  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;
  // Mesma construção de classe que Negocios.tsx:97 usa para a etiqueta de etapa.
  const stageBadgeClass = (key: string) =>
    `bg-${KANBAN_STAGES.find(s => s.key === key)?.color || 'muted-foreground'} text-white`;

  // Uma célula da tabela de negócios da ficha. Lê cada campo do mesmo jeito que a lista de
  // Negócios lê (Negocios.tsx, componente PedidoRow), para as duas telas nunca mostrarem coisas
  // diferentes sobre o mesmo negócio.
  const renderNegocioCell = (p: any, colId: string) => {
    const camposExtras = (p.campos_extras ?? {}) as Record<string, any>;
    const isColunaPadrao = NEGOCIOS_CLIENTE_COLUMNS.some(c => c.id === colId);

    if (!isColunaPadrao) {
      // Coluna criada pelo usuário: o valor mora em campos_extras, pelo id ou pelo rótulo.
      const valor = camposExtras[colId] ?? camposExtras[getNegociosLabel(colId)];
      return <TableCell key={colId} className="text-muted-foreground text-sm">{valor || '—'}</TableCell>;
    }

    switch (colId) {
      case 'negocio':
        return <TableCell key={colId} className="font-medium">{getNomeNegocio(p)}</TableCell>;
      case 'contato':
        // O contato veio da importação como campo extra, não como relação própria de `pedidos`.
        return <TableCell key={colId}>{camposExtras['Contato'] || camposExtras['contato'] || '—'}</TableCell>;
      case 'endereco_entrega':
        // A coluna é meio-obra, meio-endereço: o endereço de entrega é texto livre do
        // próprio negócio e continua valendo sem a seção Obras. Some só a reserva pelo
        // nome da obra — esconder a coluna inteira apagaria o endereço junto.
        return <TableCell key={colId}>{p.endereco_entrega ?? (temObras === true ? p.obra?.nome_obra : null) ?? '—'}</TableCell>;
      case 'fabricante':
        return <TableCell key={colId} className="font-medium">{p.fabricante?.nome ?? '—'}</TableCell>;
      case 'valor':
        return <TableCell key={colId}>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>;
      case 'vendedor':
        return <TableCell key={colId}>{p.vendedor?.nome ?? '—'}</TableCell>;
      case 'etapa':
        return (
          <TableCell key={colId}>
            <Badge className={stageBadgeClass(p.status)}>{stageLabel(p.status)}</Badge>
          </TableCell>
        );
      case 'marcador':
        return (
          <TableCell key={colId}>
            {p.marcador ? <Badge className={`bg-${p.marcador.cor} text-white`}>{p.marcador.nome}</Badge> : '—'}
          </TableCell>
        );
      // As duas datas passam por formatDateBR (recorta o texto "aaaa-mm-dd" que veio do banco).
      // O `new Date(...).toLocaleDateString('pt-BR')` que estava aqui lia a data como UTC e a
      // mostrava no fuso local: no Brasil, todo negócio aparecia com o dia ANTERIOR ao gravado
      // (CLAUDE.md §7.12).
      case 'data_pedido':
        return <TableCell key={colId} className="text-muted-foreground">{formatDateBR(p.data_pedido) || '—'}</TableCell>;
      case 'prazo_resposta':
        return <TableCell key={colId} className="text-muted-foreground">{formatDateBR(p.prazo_resposta) || '—'}</TableCell>;
      case 'observacoes':
        return (
          <TableCell key={colId} className="max-w-[280px] truncate" title={p.observacoes ?? ''}>
            {p.observacoes || '—'}
          </TableCell>
        );
      case 'anexo':
        return (
          <TableCell key={colId} onClick={e => e.stopPropagation()}>
            {p.pdf_url ? (
              <a
                href={repairCorruptedBitrixUrl(p.pdf_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <FileText className="h-3.5 w-3.5" /> PDF
              </a>
            ) : '—'}
          </TableCell>
        );
      default:
        return <TableCell key={colId}>—</TableCell>;
    }
  };

  const viewOrderSheet = (
    <Dialog open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
      <ConteudoDialogo className="sm:max-w-xl">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-foreground font-bold text-lg">
                {selectedViewOrder ? getNomeNegocio(selectedViewOrder) : 'Detalhes do Negócio'}
              </DialogTitle>
              {/* Sem a seção Obras a frase de reserva ("Sem obra vinculada") ficaria
                  falando de algo que a empresa não tem — some o subtítulo inteiro. */}
              {temObras === true && (
                <p className="text-sm text-muted-foreground">
                  {selectedViewOrder?.obra?.nome_obra ?? 'Sem obra vinculada'}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {selectedViewOrder ? (
          <div className="py-6 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fabricante</p>
                <p className="text-sm font-medium">{(selectedViewOrder as any).fabricante?.nome ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Valor Total</p>
                <p className="text-sm font-bold text-primary">
                  {(selectedViewOrder.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Data do Negócio</p>
                {/* formatDateBR, e não `new Date(...).toLocaleDateString`: a data vem do banco como
                    "aaaa-mm-dd" e essa leitura a interpretava como UTC, mostrando o dia anterior
                    para quem está no Brasil (CLAUDE.md §7.12). */}
                <p className="text-sm font-medium">
                  {formatDateBR(selectedViewOrder.data_pedido) || '—'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                <Badge className={stageBadgeClass(selectedViewOrder.status)}>
                  {stageLabel(selectedViewOrder.status)}
                </Badge>
              </div>
            </div>
            
            {selectedViewOrder.observacoes && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Observações</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">"{selectedViewOrder.observacoes}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-6 border-t mt-4">
          <Button variant="outline" onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar Negócio
          </Button>
          <Button variant="secondary" onClick={() => setViewOrderId(null)}>Fechar</Button>
        </div>
      </ConteudoDialogo>
    </Dialog>
  );

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{(cliente as any).razao_social || cliente.empresa}</h1>
            <div className="flex items-center gap-2">
              {(cliente as any).razao_social && (cliente as any).razao_social !== cliente.empresa && (
                <span className="text-xs sm:text-sm text-muted-foreground truncate">{cliente.empresa}</span>
              )}
              <Badge variant="secondary" className="text-[10px]">{tipoLabels[cliente.tipo] ?? cliente.tipo}</Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 ml-auto" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
      }
    >
      {viewOrderSheet}
      <div className="p-3 sm:p-4 md:p-6 space-y-6">

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <ConteudoDialogo className="max-w-lg">
            <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
              <div>
                <Label>Tipo</Label>
                <Select value={editData.tipo} onValueChange={v => setEditData(d => ({ ...d, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="construtora">Construtora</SelectItem>
                    <SelectItem value="loja">Loja</SelectItem>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editData.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                <Input value={editData.cnpj} onChange={e => setEditData(d => ({ ...d, cnpj: e.target.value }))} placeholder={editData.tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={editData.empresa} onChange={e => setEditData(d => ({ ...d, empresa: e.target.value }))} required placeholder="Nome fantasia ou nome" />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input value={editData.razao_social} onChange={e => setEditData(d => ({ ...d, razao_social: e.target.value }))} placeholder="Razão social da empresa" />
              </div>
              <div>
                <Label>Nome do Contato</Label>
                <Input value={editData.nome_contato} onChange={e => setEditData(d => ({ ...d, nome_contato: e.target.value }))} placeholder="Nome da pessoa de contato" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={editData.telefone} onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} />
                </div>
              </div>
              <EnderecoForm value={editEndereco} onChange={setEditEndereco} />
              {(camposConfigClientes ?? []).filter(c => c.origem === 'customizado').map(campo => (
                <div key={campo.id}>
                  <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                  <Input
                    value={editCamposExtras[campo.campo_key] ?? ''}
                    onChange={e => setEditCamposExtras(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                    placeholder={campo.label ?? ''}
                  />
                </div>
              ))}
              <Button type="submit" className="w-full" disabled={updateCliente.isPending}>
                {updateCliente.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </ConteudoDialogo>
        </Dialog>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {cliente.cnpj && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo(cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ', cliente.cnpj)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo(cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ', cliente.cnpj);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">{cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.cnpj}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {(cliente as any).razao_social && (cliente as any).razao_social !== cliente.empresa && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo('Razão social', (cliente as any).razao_social)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo('Razão social', (cliente as any).razao_social);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Razão social</p>
                   <p className="text-sm font-medium text-foreground truncate">{(cliente as any).razao_social}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {cliente.nome_contato && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo('Contato da empresa', cliente.nome_contato)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo('Contato da empresa', cliente.nome_contato);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Contact className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Contato da empresa</p>
                   <p className="text-sm font-medium text-foreground truncate">{cliente.nome_contato}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          <Card
            role={emailClicavel ? 'button' : undefined}
            tabIndex={emailClicavel ? 0 : undefined}
            className={`border-border/40 ${emailClicavel ? 'cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`}
            onClick={() => {
              if (emailClicavel) setEmailParaConfirmar(cliente.email);
            }}
            onKeyDown={e => {
              if (emailClicavel && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setEmailParaConfirmar(cliente.email);
              }
            }}
          >
             <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
               <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
               <div className="min-w-0">
                 <p className="text-xs text-muted-foreground">Email</p>
                 <p className={`text-sm font-medium ${cliente.email ? 'text-foreground' : 'text-muted-foreground italic'} truncate`}>
                   {cliente.email || 'Não informado'}
                 </p>
               </div>
            </CardContent>
          </Card>
          {cliente.telefone && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo('Telefone', cliente.telefone)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo('Telefone', cliente.telefone);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Telefone</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.telefone}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {(cliente as any).classificacao && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo('Classificação', (cliente as any).classificacao)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo('Classificação', (cliente as any).classificacao);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Classificação</p>
                   <p className="text-sm font-medium text-foreground truncate">{(cliente as any).classificacao}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {((cliente as any).data_criacao || cliente.created_at) && (
            <Card className="border-border/40">
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Data de criação</p>
                   <p className="text-sm font-medium text-foreground truncate">
                     {formatDateBR((cliente as any).data_criacao || cliente.created_at)}
                   </p>
                 </div>
              </CardContent>
            </Card>
          )}
          {(cliente as any).criado_por_usuario?.nome && (
            <Card className="border-border/40">
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Criado por</p>
                   <p className="text-sm font-medium text-foreground truncate">{(cliente as any).criado_por_usuario.nome}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {(camposConfigClientes ?? []).filter(c => c.origem === 'customizado').map(campo => {
            const valor = ((cliente as any).campos_extras as Record<string, string> | null)?.[campo.campo_key];
            if (!valor) return null;
            return (
              <Card
                key={campo.id}
                role="button"
                tabIndex={0}
                className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => copyInfo(campo.label, valor)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    copyInfo(campo.label, valor);
                  }
                }}
              >
                 <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                   <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                   <div className="min-w-0">
                     <p className="text-xs text-muted-foreground">{campo.label}</p>
                     <p className="text-sm font-medium text-foreground truncate">{valor}</p>
                   </div>
                </CardContent>
              </Card>
            );
          })}
          {(() => {
            const parsed = cliente.endereco ? stringToEndereco(cliente.endereco) : emptyEndereco;
            const c = cliente as any;
            const fields = [
              { label: 'Logradouro', value: c.logradouro || parsed.logradouro },
              { label: 'Número', value: c.numero || parsed.numero },
              { label: 'Complemento', value: c.complemento || parsed.complemento },
              { label: 'Bairro', value: c.bairro || parsed.bairro },
              { label: 'Cidade', value: c.cidade || parsed.cidade },
              { label: 'UF', value: c.uf || parsed.uf },
              { label: 'CEP', value: c.cep || parsed.cep },
            ].filter(f => f.value);

            if (fields.length === 0) return null;

            return (
              <Card className="md:col-span-3 border-border/40">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
                    {fields.map(f => (
                      <div key={f.label} className="shrink-0">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{f.label}</p>
                        <p className="text-sm font-medium text-foreground whitespace-nowrap">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Obras */}
        {/* O painel inteiro (lista, contagem, os dois atalhos de "Nova Obra" e o modal de
            cadastro) só faz sentido para quem contratou a seção. O modal fica dentro do
            bloco de propósito: os únicos jeitos de abri-lo estão aqui dentro. */}
        {temObras === true && (
        <Card className="border-border/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="h-4 w-4 text-primary" />
              Obras Vinculadas
              {cliente.obras && cliente.obras.length > 0 && (
                <Badge variant="secondary" className="ml-1">{cliente.obras.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setAddObraOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nova Obra
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {cliente.obras && cliente.obras.map((obra: any) => (
                <div 
                  key={obra.id} 
                  className="rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all"
                  onClick={() => navigate('/obras', { state: { selectedObraId: obra.id } })}
                >
                  <p className="text-sm font-medium text-foreground">{obra.nome_obra}</p>
                  {obra.endereco_entrega && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {obra.endereco_entrega}
                    </p>
                  )}
                  <Badge variant="outline" className="mt-2 text-[10px]">{obra.status}</Badge>
                </div>
              ))}
              
              <button
                onClick={() => setAddObraOpen(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-primary">Cadastrar Nova Obra</span>
              </button>
            </div>

              <Dialog open={addObraOpen} onOpenChange={setAddObraOpen}>
                <ConteudoDialogo>
                  <DialogHeader>
                    <DialogTitle>Adicionar Nova Obra</DialogTitle>
                  </DialogHeader>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!novaObra.nome_obra.trim()) {
                        toast.error('O nome da obra é obrigatório');
                        return;
                      }
                      try {
                        // Verificar se já existe obra com este nome (evitar duplicados)
                        const normalizedNewName = novaObra.nome_obra.trim().toLowerCase();
                        const existingObra = (cliente.obras || []).find((o: any) => o.nome_obra.trim().toLowerCase() === normalizedNewName);

                        if (existingObra) {
                          toast.info('Esta obra já existe para este cliente.');
                          setAddObraOpen(false);
                          setNovaObra({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
                          return;
                        }

                        await createObra.mutateAsync({
                          ...novaObra,
                          cliente_id: id!
                        });
                        toast.success('Obra cadastrada com sucesso!');
                        setNovaObra({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
                        setAddObraOpen(false);
                      } catch (err: any) {
                        toast.error('Erro ao cadastrar obra: ' + err.message);
                      }
                    }} 
                    className="space-y-4 pt-4"
                  >
                    <div className="space-y-2">
                      <Label>Nome da Obra *</Label>
                      <Input
                        value={novaObra.nome_obra}
                        onChange={e => setNovaObra(o => ({ ...o, nome_obra: e.target.value }))}
                        placeholder="Ex: Edifício Horizonte"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Endereço de Entrega</Label>
                      <Input
                        value={novaObra.endereco_entrega}
                        onChange={e => setNovaObra(o => ({ ...o, endereco_entrega: e.target.value }))}
                        placeholder="Rua, número, bairro..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={novaObra.status} onValueChange={v => setNovaObra(o => ({ ...o, status: v }))}>
                        <SelectTrigger>
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
                    <div className="space-y-2">
                      <Label>CNPJ / SPE</Label>
                      <Input
                        value={novaObra.spe_cnpj}
                        onChange={e => setNovaObra(o => ({ ...o, spe_cnpj: e.target.value }))}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setAddObraOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createObra.isPending}>
                        {createObra.isPending ? 'Cadastrando...' : 'Adicionar Obra'}
                      </Button>
                    </div>
                  </form>
                </ConteudoDialogo>
              </Dialog>
            </CardContent>
          </Card>
        )}
        {/* Removed extra closing brace */}

        {/* Contatos extras (apenas para empresas, não pessoa física) */}
        {cliente.tipo !== 'pessoa_fisica' && (
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Contatos Adicionais
                {contatosExtras.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{contatosExtras.length}</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setVincularContatoOpen(true)} className="gap-1.5">
                  <Users className="h-4 w-4" />
                  Vincular Existente
                </Button>
                <Button size="sm" onClick={() => setAddContatoOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border overflow-hidden mb-4">
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo / Cargo</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contatosExtras.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhum contato adicional cadastrado.
                          </TableCell>
                        </TableRow>
                      ) : contatosExtras.map((c: any) => (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => {
                          const slug = slugify(c.nome_contato || 'contato');
                          navigate(`/contatos/${slug}-${c.id}`);
                        }}>
                          <TableCell className="font-medium">{c.nome_contato || '-'}</TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            {c.cargo ? <Badge variant="outline">{c.cargo}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>{c.email || '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>{c.telefone || '-'}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                try {
                                  await deleteContato.mutateAsync(c.id);
                                  toast.success('Contato removido!');
                                } catch (err: any) {
                                  toast.error(err.message);
                                }
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                </div>

              <Dialog open={addContatoOpen} onOpenChange={setAddContatoOpen}>
                <ConteudoDialogo>
                  <DialogHeader>
                    <DialogTitle>Adicionar Novo Contato</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddContato} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Nome do contato *</Label>
                      <Input
                        value={novoContato.nome_contato}
                        onChange={e => setNovoContato(c => ({ ...c, nome_contato: e.target.value }))}
                        placeholder="Ex: João Silva"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cargo</Label>
                      <CargoSelect
                        value={novoContato.cargo}
                        onValueChange={v => setNovoContato(c => ({ ...c, cargo: v }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={novoContato.email}
                        onChange={e => setNovoContato(c => ({ ...c, email: e.target.value }))}
                        placeholder="email@exemplo.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone *</Label>
                      <Input
                        value={novoContato.telefone}
                        onChange={e => setNovoContato(c => ({ ...c, telefone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        required
                      />
                    </div>
                    {(camposConfigContatos ?? []).filter(c => c.origem === 'customizado').map(campo => (
                      <div key={campo.id} className="space-y-2">
                        <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                        <Input
                          value={novoContatoCamposExtras[campo.campo_key] ?? ''}
                          onChange={e => setNovoContatoCamposExtras(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                          placeholder={campo.label ?? ''}
                        />
                      </div>
                    ))}
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setAddContatoOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createContato.isPending}>
                        {createContato.isPending ? 'Adicionando...' : 'Adicionar Contato'}
                      </Button>
                    </div>
                  </form>
                </ConteudoDialogo>
              </Dialog>

              <Dialog open={vincularContatoOpen} onOpenChange={setVincularContatoOpen}>
                <ConteudoDialogo>
                  <DialogHeader>
                    <DialogTitle>Vincular Contato Existente</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Selecione o Contato</Label>
                      {/* Eram mais de mil contatos num Select sem busca: rolar era a única
                          saída e o usuário acabava recadastrando o contato, duplicando a base. */}
                      <ContatoSelector
                        contatos={contatosParaVincular}
                        value={selectedContatoId}
                        onValueChange={setSelectedContatoId}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setVincularContatoOpen(false)}>Cancelar</Button>
                    <Button 
                      onClick={async () => {
                        const contact = contatos?.find(c => c.id === selectedContatoId);
                        if (contact && id) {
                          try {
                            await updateContato.mutateAsync({
                              id: selectedContatoId,
                              empresa: cliente.empresa
                            });
                            toast.success('Contato vinculado com sucesso!');
                            setVincularContatoOpen(false);
                            setSelectedContatoId('');
                          } catch (err: any) {
                            toast.error('Erro ao vincular: ' + err.message);
                          }
                        }
                      }}
                      disabled={!selectedContatoId || updateContato.isPending}
                    >
                      {updateContato.isPending ? 'Vinculando...' : 'Vincular ao Cliente'}
                    </Button>
                  </DialogFooter>
                </ConteudoDialogo>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* Pedidos */}
        <Card className="border-border/40">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Negócios</CardTitle>
            <div className="flex items-center gap-2">
              {/* Mesmo painel de colunas da tela de Clientes e da lista de Negócios: arrasta pra
                  reordenar, clica pra mostrar/esconder, renomeia e salva modelo. */}
              <ColumnSettings
                columns={negociosColumns}
                visibleColumns={negociosVisibleColumns}
                onChange={setNegociosVisibleColumns}
                onRename={handleNegociosRename}
                onTypeChange={handleNegociosTypeChange}
                onAdd={handleNegociosAddColumn}
                onRemove={handleNegociosRemoveColumn}
                onReorder={handleNegociosReorder}
                presets={negociosPresets}
                onSavePreset={saveNegociosPreset}
                onLoadPreset={loadNegociosPreset}
                onDeletePreset={deleteNegociosPreset}
                onReset={resetNegociosColumns}
                label="Colunas"
              />
              <Button size="sm" onClick={() => setNovoNegocioOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Novo Negócio
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPedidos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {pedidosCliente.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      {/* A busca em si não muda (continua casando pelo nome da obra); o que
                          muda é a dica, para não oferecer uma palavra que a empresa sem a
                          seção Obras não reconhece. */}
                      <Input
                        placeholder={temObras === true ? 'Buscar por fabricante, vendedor ou obra...' : 'Buscar por fabricante ou vendedor...'}
                        value={pedidosBusca}
                        onChange={(e) => { setPedidosBusca(e.target.value); setPedidosPage(1); }}
                        className="pl-9"
                      />
                    </div>
                    <Select
                      value={pedidosFiltroFabricante}
                      onValueChange={(v) => { setPedidosFiltroFabricante(v); setPedidosPage(1); }}
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Fabricante" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os fabricantes</SelectItem>
                        {fabricantesDoCliente.map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={pedidosFiltroEtapa}
                      onValueChange={(v) => { setPedidosFiltroEtapa(v); setPedidosPage(1); }}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as etapas</SelectItem>
                        {KANBAN_STAGES.map(s => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pedidosFiltrosAtivos && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPedidosBusca('');
                          setPedidosFiltroFabricante('todos');
                          setPedidosFiltroEtapa('todas');
                          setPedidosPage(1);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" /> Limpar
                      </Button>
                    )}
                  </div>
                )}
                {/* Cabeçalho e células saem da MESMA lista de colunas visíveis, na mesma ordem —
                    é o que faz o arrasta-e-solta do painel de colunas valer para a tabela. */}
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {negociosColunasVisiveis.map(col => (
                          <TableHead key={col.id} className="whitespace-nowrap">{getNegociosLabel(col.id)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosFiltrados.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={Math.max(1, negociosColunasVisiveis.length)} className="text-center py-8 text-muted-foreground">
                            {pedidosCliente.length === 0
                              ? 'Nenhum negócio encontrado para este cliente.'
                              : 'Nenhum negócio encontrado com os filtros aplicados.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPedidos.map(p => (
                          <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setViewOrderId(p.id)}>
                            {negociosColunasVisiveis.map(col => renderNegocioCell(p, col.id))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {pedidosFiltrados.length > pedidosPageSize && (
              <ListPagination
                page={pedidosPage}
                totalPages={totalPedidosPages}
                totalItems={pedidosFiltrados.length}
                pageSize={pedidosPageSize}
                onPageChange={setPedidosPage}
                onPageSizeChange={(size) => { setPedidosPageSize(size); setPedidosPage(1); }}
                pageSizeOptions={[5, 10, 25, 50]}
                itemLabel="negócio"
                className="mt-4 border-t pt-4"
              />
            )}
          </CardContent>
        </Card>

        {/* Tarefas — some inteiro quando a empresa não contratou a seção.
            `=== true` e não `!== false`: enquanto a resposta não chegou, esconde. Bloco que
            aparece e some é pior de usar que bloco que demora a aparecer. */}
        {temTarefas === true && (
        <Card className="border-border/40">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Tarefas Vinculadas
              {tarefasCliente.length > 0 && (
                <Badge variant="secondary" className="ml-1">{tarefasCliente.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setAddTarefaOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova Tarefa
            </Button>
          </CardHeader>
          <CardContent>
            {loadingTarefas ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Tarefa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prazo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarefasCliente.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhuma tarefa vinculada a este cliente.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedTarefas.map(t => (
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate('/tarefas')}>
                          <TableCell className="font-medium">{t.titulo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{t.status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t.prazo_final ? new Date(t.prazo_final).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            {tarefasCliente.length > tarefasPageSize && (
              <ListPagination
                page={tarefasPage}
                totalPages={totalTarefasPages}
                totalItems={tarefasCliente.length}
                pageSize={tarefasPageSize}
                onPageChange={setTarefasPage}
                onPageSizeChange={(size) => { setTarefasPageSize(size); setTarefasPage(1); }}
                pageSizeOptions={[5, 10, 25, 50]}
                itemLabel="tarefa"
                className="mt-4 border-t pt-4"
              />
            )}
          </CardContent>

          <TarefaFormDialog
            open={addTarefaOpen}
            onOpenChange={setAddTarefaOpen}
            editingTarefa={null}
            kanbanStages={tarefaKanbanStages}
            extraFields={{ cliente_id: id! }}
          />
        </Card>
        )}

        {/* Novo negócio — FORA do card de Tarefas de propósito.
            Ele morava lá dentro, e esconder o card o levaria junto: o botão "Novo Negócio"
            do card de Negócios (bem acima) chama `setNovoNegocioOpen(true)`, e o diálogo
            simplesmente não abriria numa empresa sem a seção Tarefas — sem erro nenhum,
            só um botão que não faz nada. Negócio não tem relação com Tarefas. */}
        <NovoNegocioDialog
          open={novoNegocioOpen}
          onOpenChange={setNovoNegocioOpen}
          clienteId={cliente.id}
          onCreated={() => setNovoNegocioOpen(false)}
        />

        {/* Excluir cliente */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Cliente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O cliente "{cliente.empresa}" será removido permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await deleteCliente.mutateAsync(id!);
                      toast.success('Cliente excluído com sucesso!');
                      navigate('/clientes');
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <ConfirmarEnviarEmailDialog
        endereco={emailParaConfirmar}
        onCancelar={() => setEmailParaConfirmar(null)}
        onConfirmar={(endereco) => navigate(`/emails?to=${encodeURIComponent(endereco)}`)}
      />
    </AppLayout>
  );
};

export default ClienteDetalhe;

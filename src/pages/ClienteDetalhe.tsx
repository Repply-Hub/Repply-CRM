import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useClientes, useContatos, useFabricantes } from '@/hooks/use-clientes';
import { compararFabricantes, fabricanteEstaAtivo } from '@/lib/ordem-de-fabricantes';
import { usePedidosPorCliente } from '@/hooks/use-pedidos';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { useTarefas } from '@/hooks/use-tarefas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { useClientesTipos } from '@/hooks/use-clientes-tipos';
import { GerenciarTiposDialog } from '@/components/clientes/GerenciarTiposDialog';
import { rotuloDoTipo, ehPessoaFisica, slugDeTipo, tipoPadrao } from '@/lib/tipos-de-cliente';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';
import { useUpdateCliente, useDeleteCliente, useCreateContato, useDeleteContato, useCreateObra, useUpdateContato } from '@/hooks/use-mutations';
import { useSalvarObrasDoContato } from '@/hooks/use-obra-contatos';
import { Checkbox } from '@/components/ui/checkbox';
import { SeletorMarcadorObra } from '@/components/obras/SeletorMarcadorObra';
import { CampoCnpj } from '@/components/shared/CampoCnpj';
import { validarCnpjDaObra } from '@/lib/obra-cnpj';
import type { CnpjData } from '@/lib/cnpj';
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
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { parseMoedaBRL } from '@/lib/moeda';
import { useTableSettings } from '@/hooks/use-table-settings';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { ConfirmarEnviarEmailDialog } from '@/components/email/ConfirmarEnviarEmailDialog';
import { slugify } from '@/lib/utils';
import { LinkAnexoPrivado } from '@/components/shared/LinkAnexoPrivado';

// O icone continua vindo do codigo -- so o ROTULO passou a vir da lista de tipos da
// empresa (rotuloDoTipo). Um slug que a empresa criou e não está aqui cai no Building2.
const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User, condominio: Building2, hospital: Building2, distribuidor: Store, hotel: Building2, escola: Building2, instalador: User };

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

// O formulário de obra em branco, escrito uma vez só: ele é reposto em três pontos do
// cadastro rápido (obra duplicada, cadastro concluído e o estado inicial).
const NOVA_OBRA_VAZIA = { nome_obra: '', endereco_entrega: '', marcador_id: '', spe_cnpj: '' };

// Formata datas ISO ("aaaa-mm-dd" ou timestamp completo) para dd/mm/aaaa sem passar
// por conversão de timezone do navegador (o valor já representa a data salva pelo backend).
const formatDateBR = (value?: string | null) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
};

/* -------------------------------------------------------------------------------------------
 * ORDENAÇÃO DA TABELA DE NEGÓCIOS DA FICHA — no navegador, de propósito.
 *
 * A lista de Negócios manda a ordenação para o banco porque ela é paginada NO SERVIDOR:
 * ordenar ali no navegador reordenaria só as 25 linhas que vieram, e a tela mostraria "os
 * maiores valores" de uma página qualquer. Aqui o caso é o oposto — `usePedidosPorCliente`
 * traz TODOS os negócios do cliente de uma vez, e a paginação desta tabela é só um recorte
 * do array que já está na memória. Ordenar o array inteiro antes de recortar dá a ordem
 * certa, sem tocar em consulta nenhuma.
 *
 * É por isso também que aqui TODA coluna sabe se ordenar, inclusive as que a lista principal
 * precisou deixar de fora (Negócio, Fabricante, Responsável, Etapa, Marcador, Contato,
 * Observações e as colunas criadas pela importação). Lá o impedimento era do banco: nome do
 * negócio nulo em toda a base, junção interna que descarta linha sem par, e a coluna `status`
 * guardando o apelido da etapa ("enviado") em vez do nome que aparece na tela ("Orçamento
 * Enviado"). Nada disso existe quando o valor já está na mão: aqui ordenamos exatamente o
 * mesmo valor que a célula mostra, então o que a pessoa lê é o que ordena.
 * ---------------------------------------------------------------------------------------- */

type TipoDeOrdenacao = 'texto' | 'numero' | 'data' | 'presenca';

/** O que ficou escolhido no cabeçalho: a coluna da tabela (não a do banco) e a direção. */
type OrdenacaoNegocios = { colId: string; direction: SortDirection };

const ROTULOS_ORDENACAO_PADRAO: Record<TipoDeOrdenacao, { asc: string; desc: string }> = {
  texto: { asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  numero: { asc: 'Ordenar 0-9', desc: 'Ordenar 9-0' },
  data: { asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' },
  presenca: { asc: 'Preenchidos primeiro', desc: 'Vazios primeiro' },
};

// Como cada coluna PADRÃO se ordena, e como o menu do cabeçalho descreve cada direção.
// Os rótulos de Valor, Criação, Fechamento e Anexo são os MESMOS da lista de Negócios — quem
// aprendeu o menu lá encontra as mesmas palavras aqui.
const ORDENACAO_NEGOCIOS_CLIENTE: Record<string, { tipo: TipoDeOrdenacao; asc?: string; desc?: string }> = {
  negocio: { tipo: 'texto' },
  contato: { tipo: 'texto' },
  endereco_entrega: { tipo: 'texto' },
  fabricante: { tipo: 'texto' },
  valor: { tipo: 'numero', asc: 'Menor valor primeiro', desc: 'Maior valor primeiro' },
  vendedor: { tipo: 'texto' },
  // Ordena pelo NOME da etapa que está na tela, não pelo apelido guardado em `pedidos.status`.
  // Ordem alfabética do que se lê, e não a ordem do funil, porque a ficha lista negócios de
  // funis diferentes: as etapas são agrupadas por apelido e o número de ordem de um funil não
  // quer dizer nada no outro — uma "ordem do funil" aqui seria inventada.
  etapa: { tipo: 'texto' },
  marcador: { tipo: 'texto' },
  data_pedido: { tipo: 'data' },
  prazo_resposta: { tipo: 'data' },
  // "Observações" NÃO ordena, pelo mesmo motivo da lista principal: 11.898 dos
  // 11.911 negócios têm o campo vazio. Medido na ficha: em 704 dos 708 clientes
  // com dois ou mais negócios, as duas direções devolvem a lista IDÊNTICA. Um
  // cabeçalho que responde a mesma coisa nos dois sentidos é pior que nenhum.
  // Anexo é coluna de SIM/NÃO, não de texto: o que ela responde é "quais negócios têm PDF".
  // Por isso não entra na regra do vazio-no-fim — "sem anexo" é uma resposta, não um buraco —
  // e "Sem anexo primeiro" de fato coloca os sem anexo primeiro. Ordenar pelo endereço do
  // arquivo em ordem alfabética não diria nada a ninguém.
  anexo: { tipo: 'presenca', asc: 'Com anexo primeiro', desc: 'Sem anexo primeiro' },
};

// Coluna criada pelo usuário no painel "Colunas": o tipo escolhido lá é que decide como ela
// ordena. Sem tipo declarado, texto — é como a célula a mostra.
const TIPO_DE_ORDENACAO_POR_TIPO_DE_COLUNA: Record<string, TipoDeOrdenacao> = {
  text: 'texto',
  boolean: 'texto',
  number: 'numero',
  currency: 'numero',
  date: 'data',
};

const configDeOrdenacao = (col: ColumnDefinition): { tipo: TipoDeOrdenacao; asc: string; desc: string } => {
  // Mesma checagem que `renderNegocioCell` faz para decidir de onde tira o valor: coluna
  // criada pela importação pode nascer com um id parecido com o de uma padrão, e aí ordenar
  // pela regra da padrão ordenaria por outra coisa que não a que está na célula.
  const padrao = NEGOCIOS_CLIENTE_COLUMNS.some(c => c.id === col.id)
    ? ORDENACAO_NEGOCIOS_CLIENTE[col.id]
    : undefined;
  const tipo = padrao?.tipo ?? TIPO_DE_ORDENACAO_POR_TIPO_DE_COLUNA[col.type ?? 'text'] ?? 'texto';
  return {
    tipo,
    asc: padrao?.asc ?? ROTULOS_ORDENACAO_PADRAO[tipo].asc,
    desc: padrao?.desc ?? ROTULOS_ORDENACAO_PADRAO[tipo].desc,
  };
};

/**
 * Data em texto → "aaaa-mm-dd", que ordena certo comparado como texto puro.
 *
 * De propósito SEM `new Date(...)`: a data vem do banco como "aaaa-mm-dd" e essa leitura a
 * interpreta como UTC, o que no Brasil recua um dia (CLAUDE.md §7.12). Aqui isso trocaria a
 * ordem de dois negócios criados em dias vizinhos. Aceita também o "dd/mm/aaaa" que as
 * colunas de data criadas pela importação costumam guardar.
 */
const chaveDeData = (valor: string): string | null => {
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
};

const estaVazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const compararParaOrdenacao = (a: unknown, b: unknown, tipo: TipoDeOrdenacao, dir: 1 | -1): number => {
  // Presença (Anexo) não tem vazio: os dois lados são 0 ou 1, e a direção manda de verdade.
  if (tipo === 'presenca') return (Number(a) - Number(b)) * dir;

  // Vazio SEMPRE no fim, nos dois sentidos — mesma decisão da lista de Negócios. Sem isso,
  // "Ordenar Z-A" numa coluna pouco preenchida abriria com uma tela inteira de traços.
  if (estaVazio(a) || estaVazio(b)) {
    if (estaVazio(a) && estaVazio(b)) return 0;
    return estaVazio(a) ? 1 : -1;
  }

  if (tipo === 'data') {
    const ca = chaveDeData(String(a));
    const cb = chaveDeData(String(b));
    if (ca && cb) return (ca < cb ? -1 : ca > cb ? 1 : 0) * dir;
  }

  if (tipo === 'numero') {
    // `parseMoedaBRL` e nunca `parseFloat`: "1.234,56" lido por parseFloat vira 1.234
    // (CLAUDE.md §7.10). Valor do negócio já chega número e passa direto.
    const na = typeof a === 'number' ? a : parseMoedaBRL(String(a));
    const nb = typeof b === 'number' ? b : parseMoedaBRL(String(b));
    if (na !== null && nb !== null) return (na - nb) * dir;
  }

  // Texto em pt-BR: o acento entra na conta ("Álvaro" antes de "Amaro"), maiúscula não
  // separa, e `numeric` faz "Obra 2" vir antes de "Obra 10".
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
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

/**
 * O negócio como a ficha do cliente o lê para ORDENAR. Todo campo aqui é um campo que
 * `valorParaOrdenar` de fato consulta — declarar a mais só criaria a ilusão de garantia,
 * porque o tipo gerado pelo Supabase não descreve os embeds do join.
 */
type NegocioDaFicha = PedidoComEmbeds & {
  nome?: string | null;
  status?: string | null;
  valor_total?: number | null;
  data_pedido?: string | null;
  prazo_resposta?: string | null;
  endereco_entrega?: string | null;
  pdf_url?: string | null;
  cliente?: { empresa?: string | null } | null;
  marcador?: { nome?: string | null } | null;
  campos_extras?: Record<string, unknown> | null;
};

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
  // A lista de tipos e da EMPRESA (tabela clientes_tipos), igual Clientes.tsx: sem isso
  // esta tela mostrava so 3 opcoes fixas e, ao salvar, desfazia a classificacao de quem
  // tinha um tipo proprio da empresa (ex.: "Construtora Ativa" virava "construtora").
  const { data: tiposDeCliente } = useClientesTipos(empresaId);
  // useMemo para a lista não trocar de identidade a cada pintura (mesmo motivo de Clientes.tsx).
  const tipos = useMemo(() => tiposDeCliente ?? [], [tiposDeCliente]);
  // Espelha public.is_gestor() só para esconder o controle na UI, igual Clientes.tsx.
  // A RLS continua sendo a autoridade real.
  const podeGerenciarTipos = ['gestor', 'admin', 'empresa'].includes(profile?.role);
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
  // Definido AQUI em cima, e não junto de `stageBadgeClass` lá embaixo, porque a ordenação da
  // tabela de negócios (um useMemo, que precisa rodar antes dos returns de carregamento)
  // ordena a coluna Etapa pelo nome que aparece na tela — e é esta função que o produz.
  const stageLabel = useCallback(
    (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key,
    [KANBAN_STAGES]
  );

  // Debug log
  console.log('ClienteDetalhe - slug:', slug, 'extracted id:', id);
  if (clientes) {
    const found = clientes.find(c => c.id === id);
    console.log('ClienteDetalhe - cliente encontrado:', !!found);
  }
  const updateCliente = useUpdateCliente();
  const deleteCliente = useDeleteCliente();
  const createContato = useCreateContato();
  const salvarObrasDoContato = useSalvarObrasDoContato();
  const deleteContato = useDeleteContato();
  const { data: contatos } = useContatos();
  const [editOpen, setEditOpen] = useState(false);
  const [gerenciarTiposOpen, setGerenciarTiposOpen] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [addContatoOpen, setAddContatoOpen] = useState(false);
  const [addObraOpen, setAddObraOpen] = useState(false);
  const [vincularContatoOpen, setVincularContatoOpen] = useState(false);
  const [selectedContatoId, setSelectedContatoId] = useState('');
  const updateContato = useUpdateContato();
  const createObra = useCreateObra();
  const [novaObra, setNovaObra] = useState(NOVA_OBRA_VAZIA);
  const [erroCnpjObra, setErroCnpjObra] = useState('');
  // Liga a frase que diz de onde veio o endereço. Só aparece quando foi a consulta do CNPJ
  // que preencheu o campo — endereço digitado à mão não precisa de aviso nenhum.
  const [enderecoVeioDoCnpj, setEnderecoVeioDoCnpj] = useState(false);

  // O que fazer com os dados que a Receita devolve. Regra que já vale no cadastro de
  // Clientes: só preenche campo VAZIO. Sem isso, corrigir um dígito do CNPJ dispara a
  // consulta de novo e troca sozinho o nome que a pessoa acabou de escrever.
  const preencherObraComCnpj = (dados: CnpjData) => {
    const nomeVazio = !novaObra.nome_obra.trim();
    const enderecoVazio = !novaObra.endereco_entrega.trim();

    // A razão social é o nome oficial; o fantasia entra só quando ela vem vazia.
    const nomeDaReceita = (dados.razao_social || '').trim() || (dados.nome_fantasia || '').trim();
    // O endereço da Receita é o da SEDE da empresa — muitas vezes o escritório da
    // construtora, não o canteiro. Por isso ele só entra em campo vazio, e a tela avisa
    // de onde veio para a pessoa conferir antes de o pino cair no mapa.
    const enderecoDaReceita = enderecoToString({
      cep: dados.cep || '',
      logradouro: dados.logradouro || '',
      numero: dados.numero || '',
      complemento: dados.complemento || '',
      bairro: dados.bairro || '',
      cidade: dados.municipio || '',
      uf: dados.uf || '',
    });

    setNovaObra(o => ({
      ...o,
      nome_obra: nomeVazio && nomeDaReceita ? nomeDaReceita : o.nome_obra,
      endereco_entrega: enderecoVazio && enderecoDaReceita ? enderecoDaReceita : o.endereco_entrega,
    }));
    if (enderecoVazio && enderecoDaReceita) setEnderecoVeioDoCnpj(true);
  };

  // Volta o formulário ao estado de fábrica, incluindo o erro do CNPJ e o aviso do endereço.
  const limparNovaObra = () => {
    setNovaObra(NOVA_OBRA_VAZIA);
    setErroCnpjObra('');
    setEnderecoVeioDoCnpj(false);
  };
  const [pedidosPage, setPedidosPage] = useState(1);
  const [pedidosPageSize, setPedidosPageSize] = useState(5);
  const [pedidosBusca, setPedidosBusca] = useState('');
  const [pedidosFiltroFabricante, setPedidosFiltroFabricante] = useState('todos');
  const [pedidosFiltroEtapa, setPedidosFiltroEtapa] = useState('todas');
  // `null` = a ordem em que os negócios chegam do banco (os mais recentes primeiro). Quem
  // nunca clicar num cabeçalho vê a tabela exatamente como via antes.
  const [ordenacaoNegocios, setOrdenacaoNegocios] = useState<OrdenacaoNegocios | null>(null);
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
  // O status Ativa/Inativa não vem no negócio: o embed de `pedidos` traz do fabricante só
  // `id, nome`. Quem sabe o status é o cadastro — daí este índice. É a MESMA consulta que
  // o resto do sistema já usa (mesma chave de cache), não uma busca a mais por causa desta
  // tela.
  const { data: fabricantesCadastrados } = useFabricantes();
  const statusDoFabricante = useMemo(
    () => new Map((fabricantesCadastrados ?? []).map(f => [f.id, f.ativo !== false])),
    [fabricantesCadastrados],
  );
  // Esta lista é montada a partir dos NEGÓCIOS do cliente, então ela sempre reordenava no
  // cliente e desfaria qualquer ordem vinda do banco. O status entra como primeiro
  // desempate; marca sem status conhecido conta como ativa (ver ordem-de-fabricantes.ts).
  const fabricantesDoCliente = useMemo(() => {
    const mapa = new Map<string, string>();
    pedidosCliente.forEach(p => {
      const fab = comEmbeds(p).fabricante;
      if (fab?.id) mapa.set(fab.id, fab.nome);
    });
    return Array.from(mapa, ([id, nome]) => ({ id, nome, ativo: statusDoFabricante.get(id) ?? true }))
      .sort(compararFabricantes);
  }, [pedidosCliente, statusDoFabricante]);
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

  /**
   * O valor pelo qual cada coluna ordena — o MESMO que `renderNegocioCell` põe na célula.
   * As duas funções têm a mesma estrutura de propósito (primeiro a coluna criada pelo
   * usuário, depois o `switch` das padrão): se um dia uma célula mudar de fonte de dado, dá
   * para ver na hora que a ordenação precisa mudar junto.
   */
  const valorParaOrdenar = useCallback((p: NegocioDaFicha, colId: string): unknown => {
    const camposExtras = (p.campos_extras ?? {}) as Record<string, unknown>;
    if (!NEGOCIOS_CLIENTE_COLUMNS.some(c => c.id === colId)) {
      return camposExtras[colId] ?? camposExtras[getNegociosLabel(colId)] ?? null;
    }
    switch (colId) {
      case 'negocio': return getNomeNegocio(p);
      case 'contato': return camposExtras['Contato'] || camposExtras['contato'] || null;
      case 'endereco_entrega': return p.endereco_entrega ?? (temObras === true ? comEmbeds(p).obra?.nome_obra : null) ?? null;
      case 'fabricante': return comEmbeds(p).fabricante?.nome ?? null;
      // `?? 0` porque a célula mostra R$ 0,00 quando o valor é nulo: negócio sem valor não
      // aparece em branco na tela, então também não é "vazio" para a ordenação.
      case 'valor': return p.valor_total ?? 0;
      case 'vendedor': return comEmbeds(p).vendedor?.nome ?? null;
      case 'etapa': return stageLabel(p.status);
      case 'marcador': return p.marcador?.nome ?? null;
      case 'data_pedido': return p.data_pedido ?? null;
      case 'prazo_resposta': return p.prazo_resposta ?? null;
      // 0 = tem anexo. Assim "Ordenar crescente" (o `asc` do menu) é literalmente
      // "Com anexo primeiro", que é o rótulo que a pessoa lê.
      case 'anexo': return p.pdf_url ? 0 : 1;
      default: return null;
    }
  }, [getNegociosLabel, stageLabel, temObras]);

  /**
   * A ordenação que de fato vale. Coluna escondida no painel "Colunas" deixa de ordenar: senão
   * a tabela continuaria numa ordem que nenhum cabeçalho da tela explica — ninguém entenderia
   * por que os negócios estão naquela sequência.
   */
  const ordenacaoAtiva = useMemo(() => {
    if (!ordenacaoNegocios) return null;
    const col = negociosColunasVisiveis.find(c => c.id === ordenacaoNegocios.colId);
    if (!col) return null;
    return { colId: col.id, direction: ordenacaoNegocios.direction, ...configDeOrdenacao(col) };
  }, [ordenacaoNegocios, negociosColunasVisiveis]);

  // Ordena a lista JÁ FILTRADA (busca, fabricante, etapa), nunca a lista crua — senão o
  // recorte da página traria negócios que os filtros tinham tirado da tela.
  const pedidosOrdenados = useMemo(() => {
    if (!ordenacaoAtiva) return pedidosFiltrados;
    const dir: 1 | -1 = ordenacaoAtiva.direction === 'asc' ? 1 : -1;
    // Calcula o valor de cada linha UMA vez (e não a cada comparação) e guarda a posição
    // original: o `|| a.i - b.i` no fim é o desempate que mantém empatados na ordem em que
    // vieram do banco, sem depender da ordenação do motor do navegador ser estável.
    return pedidosFiltrados
      .map((p, i) => ({ p, i, v: valorParaOrdenar(p, ordenacaoAtiva.colId) }))
      .sort((a, b) => compararParaOrdenacao(a.v, b.v, ordenacaoAtiva.tipo, dir) || a.i - b.i)
      .map(d => d.p);
  }, [pedidosFiltrados, ordenacaoAtiva, valorParaOrdenar]);

  const handleNegociosSort = useCallback((colId: string, direction: SortDirection) => {
    setOrdenacaoNegocios({ colId, direction });
  }, []);

  // Trocar a ordem volta para a primeira página. "Página 3" passou a apontar para outros
  // negócios: continuar nela depois de pedir "maior valor primeiro" mostraria do 11º ao 15º
  // maior, com cara de erro. Vale também quando a ordenação CAI porque a coluna foi escondida
  // no painel "Colunas" — é a outra porta para o mesmo estado.
  useEffect(() => {
    setPedidosPage(1);
  }, [ordenacaoAtiva?.colId, ordenacaoAtiva?.direction]);

  const totalPedidosPages = Math.max(1, Math.ceil(pedidosFiltrados.length / pedidosPageSize));
  const paginatedPedidos = useMemo(() =>
    pedidosOrdenados.slice((pedidosPage - 1) * pedidosPageSize, pedidosPage * pedidosPageSize),
    [pedidosOrdenados, pedidosPage, pedidosPageSize]
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

  // Opções do Select de edição = a lista da empresa + o tipo atual do cliente, quando ele
  // não estiver nela (gestor excluiu o tipo depois, ou uma importação gravou um valor que a
  // lista não tem). Sem isso o Select abre TOTALMENTE em branco -- nem o placeholder aparece
  // -- e não há como reescolher aquele valor sem antes trocar por outro. Mesma ideia de
  // `opcoesDeFiltro` (soma os valores em uso aos da lista), só que para um único valor.
  const opcoesDeEdicaoDeTipo = useMemo(() => {
    if (!editData.tipo || tipos.some(t => t.slug === editData.tipo)) return tipos;
    return [...tipos, { id: editData.tipo, slug: editData.tipo, nome: rotuloDoTipo(editData.tipo, tipos) }];
  }, [tipos, editData.tipo]);

  const { data: camposConfigClientes } = useConfiguracoesCampos('clientes', empresaId);
  const { data: camposConfigContatos } = useConfiguracoesCampos('contatos', empresaId);

  // Novo contato extra
  const [novoContato, setNovoContato] = useState({ nome_contato: '', cargo: '', email: '', telefone: '', obraIds: [] as string[] });
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
      const criado = await createContato.mutateAsync({
        empresa: cliente.empresa,
        cliente_id: cliente.id,
        nome_contato: novoContato.nome_contato.trim(),
        cargo: novoContato.cargo.trim() || undefined,
        email: novoContato.email.trim() || undefined,
        telefone: novoContato.telefone.trim() || undefined,
        campos_extras: novoContatoCamposExtras,
      });
      // O vínculo com obras é gravado depois, na tabela própria — só existe id agora.
      if (criado?.id && novoContato.obraIds.length > 0) {
        try {
          await salvarObrasDoContato.mutateAsync({ contatoId: criado.id, obraIds: novoContato.obraIds });
        } catch {
          toast.warning('Contato criado, mas não deu para vincular as obras.');
        }
      }
      toast.success('Contato adicionado!');
      setNovoContato({ nome_contato: '', cargo: '', email: '', telefone: '', obraIds: [] });
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
      // Vazio, nunca um slug cravado: 'construtora' pode não existir na lista da empresa
      // (ela é por empresa, tabela clientes_tipos), e o Select de edição lidaria com um
      // valor que nenhuma opção representa.
      tipo: cliente.tipo ?? '',
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

  // slugDeTipo normaliza antes de consultar o dicionário: o valor gravado pode ser
  // 'pessoa fisica' (com espaço, sem acento -- o que a importação de planilha grava, e o
  // que 129 clientes da MD têm hoje), enquanto a chave do dicionário é 'pessoa_fisica'.
  // Sem a normalização, esses clientes caem no Building2 (prédio) em vez do ícone de pessoa.
  const Icon = tipoIcons[slugDeTipo(cliente.tipo)] ?? Building2;
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
              <LinkAnexoPrivado url={p.pdf_url} />
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
              <Badge variant="secondary" className="text-[10px]">{rotuloDoTipo(cliente.tipo, tipos)}</Badge>
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
                <Select
                  value={editData.tipo}
                  onValueChange={v => {
                    if (v === '__new__') {
                      // 🔴 FECHA A EDIÇÃO ANTES DE ABRIR O GERENCIAR, em vez de empilhar os
                      // dois diálogos. Dois modais do Radix abertos ao mesmo tempo disputam o
                      // foco e o `pointer-events: none` que o de cima põe no <body>; quando o
                      // de cima fecha, a tela pode ficar surda a cliques — e aqui não haveria
                      // saída, porque este projeto desligou Esc e clique-fora
                      // (ui/dialog.tsx:42) e só recarregar resolveria. É o mesmo motivo pelo
                      // qual o EmpresaSelector não ganhou este botão.
                      // Nada se perde no caminho: `editData` é estado do componente e não é
                      // limpo ao fechar, e a volta usa `setEditOpen(true)` — nunca
                      // `openEdit()`, que releria o cliente do banco e apagaria o que já
                      // estava digitado.
                      setEditOpen(false);
                      setGerenciarTiposOpen(true);
                      return;
                    }
                    setEditData(d => ({ ...d, tipo: v }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {opcoesDeEdicaoDeTipo.map(t => (
                      <SelectItem key={t.id} value={t.slug}>{t.nome}</SelectItem>
                    ))}
                    {/* Só gestor cria ou renomeia tipo: para os demais a RLS recusaria a gravação. */}
                    {podeGerenciarTipos && (
                      <SelectItem value="__new__" className="text-primary font-medium">+ Criar novo tipo…</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ehPessoaFisica(editData.tipo) ? 'CPF' : 'CNPJ'}</Label>
                <Input value={editData.cnpj} onChange={e => setEditData(d => ({ ...d, cnpj: e.target.value }))} placeholder={ehPessoaFisica(editData.tipo) ? '000.000.000-00' : '00.000.000/0000-00'} />
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

        {/* O MESMO componente que a tela de Clientes usa — nada de uma segunda cópia do
            diálogo. Fica FORA do <Dialog> de edição de propósito: ele precisa continuar
            montado justamente enquanto a edição está fechada. */}
        <GerenciarTiposDialog
          open={gerenciarTiposOpen}
          onOpenChange={(aberto) => {
            setGerenciarTiposOpen(aberto);
            // Fechou o gerenciar: a edição volta exatamente de onde parou.
            if (!aberto) setEditOpen(true);
          }}
          empresaId={empresaId}
          podeGerenciar={podeGerenciarTipos}
          onTipoCriado={(slug) => setEditData(d => ({ ...d, tipo: slug }))}
          onTipoExcluido={(slug) => {
            // Mesma regra de Clientes.tsx: se o tipo excluído era o que estava
            // selecionado no formulário, cai no padrão -- senão o Select mostraria o
            // slug cru e "Salvar Alterações" gravaria um tipo órfão.
            if (editData.tipo === slug) {
              setEditData(d => ({ ...d, tipo: tipoPadrao(tipos.filter(t => t.slug !== slug)) }));
            }
          }}
        />

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {cliente.cnpj && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo(ehPessoaFisica(cliente.tipo) ? 'CPF' : 'CNPJ', cliente.cnpj)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo(ehPessoaFisica(cliente.tipo) ? 'CPF' : 'CNPJ', cliente.cnpj);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">{ehPessoaFisica(cliente.tipo) ? 'CPF' : 'CNPJ'}</p>
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
                  {/* Some quando a obra não tem marcador — que é o estado padrão. Antes,
                      mostrava `obra.status`: o apelido cru do banco ("em_andamento"), sem
                      tradução, para um campo que nunca teve lista de opções que funcionasse. */}
                  {obra.marcador && (
                    <Badge className={`mt-2 text-[10px] bg-${obra.marcador.cor} text-white`}>
                      {obra.marcador.nome}
                    </Badge>
                  )}
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
                      // Aqui o CNPJ é SEMPRE opcional: esta tela não lê a configuração de
                      // campos obrigatórios da empresa, então passa `false`. A validação
                      // deixa passar campo vazio e só barra CNPJ pela metade ou inválido —
                      // antes disso, dava para gravar qualquer texto no campo.
                      const erroCnpj = validarCnpjDaObra(novaObra.spe_cnpj, false);
                      if (erroCnpj) {
                        setErroCnpjObra(erroCnpj);
                        return;
                      }
                      setErroCnpjObra('');
                      try {
                        // Verificar se já existe obra com este nome (evitar duplicados)
                        const normalizedNewName = novaObra.nome_obra.trim().toLowerCase();
                        const existingObra = (cliente.obras || []).find((o: any) => o.nome_obra.trim().toLowerCase() === normalizedNewName);

                        if (existingObra) {
                          toast.info('Esta obra já existe para este cliente.');
                          setAddObraOpen(false);
                          limparNovaObra();
                          return;
                        }

                        await createObra.mutateAsync({
                          ...novaObra,
                          // Campo vazio não é identificador: mandar '' faria o banco recusar.
                          // Obra sem marcador é o estado normal e se escreve como nulo.
                          marcador_id: novaObra.marcador_id || null,
                          // Na tela o CNPJ tem máscara; no banco são só os 14 dígitos.
                          spe_cnpj: novaObra.spe_cnpj.replace(/\D/g, ''),
                          cliente_id: id!
                        });
                        toast.success('Obra cadastrada com sucesso!');
                        limparNovaObra();
                        setAddObraOpen(false);
                      } catch (err: any) {
                        toast.error('Erro ao cadastrar obra: ' + err.message);
                      }
                    }} 
                    className="space-y-4 pt-4"
                  >
                    {/* O CNPJ vem PRIMEIRO de propósito: quando a obra é uma SPE, digitar o
                        CNPJ já traz o nome e o endereço da Receita, e o resto do formulário
                        chega preenchido. Continua opcional — a maioria das obras não tem CNPJ
                        próprio, e o campo em branco é estado normal. */}
                    <CampoCnpj
                      label="CNPJ / SPE"
                      value={novaObra.spe_cnpj}
                      onChange={v => {
                        setErroCnpjObra('');
                        setNovaObra(o => ({ ...o, spe_cnpj: v }));
                      }}
                      onDadosEncontrados={preencherObraComCnpj}
                      erro={erroCnpjObra}
                      descricao="Opcional — só quando a obra tem CNPJ próprio (SPE). Preenchendo, o nome e o endereço vêm da Receita Federal."
                    />
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
                        onChange={e => {
                          // Assim que a pessoa encosta no campo, o aviso de origem sai: o
                          // texto passou a ser dela, não mais o que veio da Receita.
                          setEnderecoVeioDoCnpj(false);
                          setNovaObra(o => ({ ...o, endereco_entrega: e.target.value }));
                        }}
                        placeholder="Rua, número, bairro..."
                      />
                      {enderecoVeioDoCnpj && (
                        <p className="text-xs text-muted-foreground">
                          Endereço da SEDE da empresa, vindo da Receita Federal. Confira antes de
                          salvar — é ele que marca a obra no mapa, e o canteiro costuma ficar
                          longe do escritório.
                        </p>
                      )}
                    </div>
                    {/* Era um Status com quatro opções CRAVADAS NO CÓDIGO, que ignoravam a
                        lista configurável e gravavam 'ativa' por padrão. Foi este formulário —
                        e não o da tela de Obras — que criou as 2.312 obras apagadas em
                        agosto/2026, todas com status 'ativa'. Agora fala a mesma língua da
                        tela de Obras: marcador, opcional, da lista da empresa. Sem
                        `onGerenciar` — a tela de gerenciar marcadores não existe aqui, e o
                        componente já diz onde cadastrá-los. */}
                    <SeletorMarcadorObra
                      value={novaObra.marcador_id}
                      onChange={v => setNovaObra(o => ({ ...o, marcador_id: v }))}
                    />
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
        {!ehPessoaFisica(cliente.tipo) && (
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
                        <TableHead>Obra</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contatosExtras.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                          <TableCell className="text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>
                            {/* Lista: o contato pode responder por mais de uma obra. */}
                            {(c.vinculos_obra as { obra?: { nome_obra?: string | null } }[] | undefined ?? [])
                              .map((v) => v.obra?.nome_obra)
                              .filter(Boolean)
                              .join(', ') || '-'}
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
                    {/* Marcação múltipla: uma pessoa pode responder por vários canteiros
                        (decisão de 27/08/2026). Nenhuma marcada = contato da empresa toda. */}
                    {temObras === true && cliente.obras && cliente.obras.length > 0 && (
                      <div className="space-y-2">
                        <Label>Obras deste contato</Label>
                        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                          {cliente.obras.map((obra) => {
                            const marcada = novoContato.obraIds.includes(obra.id);
                            return (
                              <label
                                key={obra.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-accent/50"
                              >
                                <Checkbox
                                  checked={marcada}
                                  onCheckedChange={() =>
                                    setNovoContato(c => ({
                                      ...c,
                                      obraIds: marcada
                                        ? c.obraIds.filter(x => x !== obra.id)
                                        : [...c.obraIds, obra.id],
                                    }))
                                  }
                                />
                                <span className="min-w-0 truncate">{obra.nome_obra || 'Obra sem nome'}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Opcional. Marque quando este contato falar por obras específicas, não pela empresa toda.
                        </p>
                      </div>
                    )}
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
                              empresa: cliente.empresa,
                              // Grava a CHAVE junto com o nome: vincular só pelo texto
                              // deixava o contato de fora de qualquer consulta que
                              // filtra por `cliente_id` — inclusive o seletor da obra.
                              cliente_id: cliente.id,
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
                        {/* Marca que a empresa não representa mais fica no fim da lista, mas
                            continua aqui: os negócios antigos dela são justamente o que esta
                            ficha guarda. O selo diz por que ela desceu. */}
                        {fabricantesDoCliente.map(f => (
                          <SelectItem key={f.id} value={f.id}>
                            <span className="flex items-center gap-1.5">
                              {f.nome}
                              {!fabricanteEstaAtivo(f) && (
                                <span className="rounded border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Inativa
                                </span>
                              )}
                            </span>
                          </SelectItem>
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
                    é o que faz o arrasta-e-solta do painel de colunas valer para a tabela.
                    Todo cabeçalho é o `SortableTh` de Clientes, Obras e Negócios: mesma setinha,
                    mesmo menuzinho de A-Z / Z-A. Aqui, diferente da lista principal, TODAS as
                    colunas ganham o menu — os negócios do cliente já estão inteiros no
                    navegador, então nenhuma delas depende do banco para saber se ordenar. */}
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {negociosColunasVisiveis.map(col => {
                          const { asc, desc } = configDeOrdenacao(col);
                          return (
                            <SortableTh
                              key={col.id}
                              label={getNegociosLabel(col.id)}
                              sortKey={col.id}
                              currentSortKey={ordenacaoAtiva?.colId ?? null}
                              currentDirection={ordenacaoAtiva?.direction ?? 'desc'}
                              onSort={handleNegociosSort}
                              ascLabel={asc}
                              descLabel={desc}
                            />
                          );
                        })}
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

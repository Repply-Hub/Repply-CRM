import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useObras } from '@/hooks/use-obras';
import { useMarcadoresObras } from '@/hooks/use-marcadores-obras';
import { useClientes } from '@/hooks/use-clientes';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { Checkbox } from '@/components/ui/checkbox';
import { StandardPopoverMenu, StandardMenuItem } from '@/components/ui/standard-popover-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogTitle,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import {
  Building2, MapPin, Search, Loader2, HardHat, Calendar, List, Map as MapIcon,
  Tag, Table as TableIcon, Plus, Settings2, Filter, ChevronDown, X, Trash2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCreateObra, useUpdateObra, useDeleteObra, useDeleteObrasBulk } from '@/hooks/use-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { toast } from 'sonner';
import { formatCnpj } from '@/utils/cnpj';
import { validarCnpjDaObra } from '@/lib/obra-cnpj';
import { CampoCnpj } from '@/components/shared/CampoCnpj';
import type { CnpjData } from '@/lib/cnpj';
import { enderecoToString } from '@/lib/cep';
import { SeletorMarcadorObra } from '@/components/obras/SeletorMarcadorObra';
import { ColumnSettings, type ColumnDefinition } from '@/components/shared/ColumnSettings';
import { ListPagination } from '@/components/shared/ListPagination';
import { useTableSettings } from '@/hooks/use-table-settings';
import { MapaObras } from '@/components/obras/MapaObras';
import { MapaObrasPainel } from '@/components/obras/MapaObrasPainel';
import { MarcadoresObrasDialog } from '@/components/obras/MarcadoresObrasDialog';
import { VendasDaObra } from '@/components/obras/VendasDaObra';
import { cn, hasTextSelection } from '@/lib/utils';
import { FilterButton } from '@/components/shared/FilterButton';
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { ResizableTh } from '@/components/shared/ResizableTh';
import { supabase } from '@/integrations/supabase/client';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { EnderecoAutocomplete } from '@/components/obras/EnderecoAutocomplete';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 🔴 TRÊS LISTAS PRECISAM CONCORDAR e nada no código força isso: esta definição de colunas, o
// bloco de render por `colId` na tabela e o `switch` de `getSortValue`. Coluna que exista aqui
// e falte lá cai no `default` e ordena pela coluna ERRADA, sem erro nenhum. Ao mexer em uma,
// mexa nas três.
const OBRA_FIELDS: ColumnDefinition[] = [
  { id: 'nome_obra', label: 'Nome da Obra', locked: false },
  { id: 'marcador', label: 'Marcador', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'endereco', label: 'Endereço', locked: false },
  { id: 'spe_cnpj', label: 'CNPJ/SPE', locked: false },
  { id: 'created_at', label: 'Data de Criação', locked: false },
  { id: 'actions', label: 'Ações', locked: false },
];

/**
 * A linha de obra como a lista a manipula.
 *
 * `marcador` chega por junção EXTERNA (nunca `!inner`), então é NULO para obra sem marcador
 * — que é o estado padrão, já que a lista de marcadores nasce vazia. Tipar aqui evita
 * espalhar `as any` pela busca, pelo filtro, pela ordenação e pelo render, que são os quatro
 * lugares onde o marcador é lido.
 *
 * A assinatura de índice existe porque o resto do arquivo é herdado e mexe em colunas
 * customizadas por nome montado em tempo de execução.
 */
type ObraNaLista = {
  id: string;
  nome_obra: string | null;
  endereco_entrega: string | null;
  marcador_id: string | null;
  marcador: { id: string; nome: string; cor: string } | null;
  campos_extras: Record<string, string> | null;
  [chave: string]: unknown;
};

/** Os dois campos que a consulta do CNPJ pode preencher. */
type CamposPreenchiveisPeloCnpj = { nome_obra: string; endereco_entrega: string };

/**
 * O endereço que a Receita devolve, montado num texto só — o formato que o campo de endereço
 * da obra usa.
 *
 * ⚠️ **É o endereço da SEDE da empresa, não o do canteiro.** Numa SPE os dois às vezes
 * coincidem, mas o caso comum é a sede ser o escritório da construtora — e é o endereço da
 * obra que vira o pino no mapa. Por isso ele só entra em campo vazio, e a tela diz de onde
 * veio (ver `AvisoEnderecoDaReceita`). Preencher e ficar calado é o que poria obra no lugar
 * errado do mapa sem ninguém notar.
 */
function enderecoDaReceita(dados: CnpjData): string {
  // `enderecoToString` (src/lib/cep.ts:55) espera `cidade`; a Receita chama de `municipio`.
  return enderecoToString({
    cep: dados.cep || '',
    logradouro: dados.logradouro || '',
    numero: dados.numero || '',
    complemento: dados.complemento || '',
    bairro: dados.bairro || '',
    cidade: dados.municipio || '',
    uf: dados.uf || '',
  });
}

/**
 * O que a consulta da Receita preenche nos dois formulários de obra — e o que ela nunca toca.
 *
 * **Só preenche campo vazio.** É a mesma regra que já existe em Clientes (`Clientes.tsx:643`),
 * e é ela que impede o nome da obra ("Torre B — Ponta Negra") de virar sozinho a razão social
 * da construtora depois de já digitado. Corrigir o CNPJ de uma obra meio preenchida não pode
 * reescrever o que a pessoa acabou de escrever.
 *
 * Recebe o estado ANTERIOR e devolve o próximo, para ser usado dentro do `set…(prev => …)`: a
 * consulta pode demorar até 10 segundos, e nesse tempo a pessoa continua digitando. Ler o
 * estado pela closure do momento do clique desfaria justamente o que ela escreveu enquanto
 * esperava.
 */
function aplicarDadosDoCnpj<T extends CamposPreenchiveisPeloCnpj>(anterior: T, dados: CnpjData): T {
  // Nome fantasia é o plano B: há empresa cuja razão social vem em branco da Receita.
  const nomeVindo = (dados.razao_social || dados.nome_fantasia || '').trim();
  const enderecoVindo = enderecoDaReceita(dados);

  return {
    ...anterior,
    nome_obra: nomeVindo && !(anterior.nome_obra || '').trim() ? nomeVindo : anterior.nome_obra,
    endereco_entrega:
      enderecoVindo && !(anterior.endereco_entrega || '').trim()
        ? enderecoVindo
        : anterior.endereco_entrega,
  };
}

/** A frase que conta de onde veio o endereço preenchido sozinho. Ver `enderecoDaReceita`. */
function AvisoEnderecoDaReceita() {
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      Endereço da <span className="font-medium text-foreground">sede</span> da empresa, vindo da
      Receita Federal. Confira se é mesmo o canteiro — é este endereço que marca a obra no mapa.
    </p>
  );
}

export default function Obras() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { data: obras, isLoading } = useObras();
  const { data: clientes } = useClientes();
  const { data: camposConfigObras } = useConfiguracoesCampos('obras', profile?.empresa_id);
  const createObra = useCreateObra();
  const updateObra = useUpdateObra();
  const deleteObra = useDeleteObra();
  const deleteObrasBulk = useDeleteObrasBulk();
  const [search, setSearch] = useState('');
  // 'todos' ou o id de um marcador. Guarda ID, não slug: o nome do marcador pode ser
  // renomeado a qualquer momento sem o filtro deixar de casar.
  const [marcadorFilter, setMarcadorFilter] = useState<string>('todos');
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [selectedObra, setSelectedObra] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('lista');
  // Obra selecionada NA ABA MAPA (cartão flutuante + destaque do pino). Independente do
  // `selectedObra` acima, que abre o Sheet lateral de detalhes. O `focoTick` cresce a cada
  // clique de seleção para o mapa refocar até quando o id clicado é o mesmo (reclicar a
  // obra selecionada depois de arrastar o mapa volta a câmera até ela).
  const [obraSelecionadaMapa, setObraSelecionadaMapa] = useState<string | null>(null);
  const [focoTick, setFocoTick] = useState(0);
  // Pino do ENDEREÇO BUSCADO (não é obra): marca no mapa o lugar que a pessoa procurou.
  // `termo` guarda o texto normalizado da busca que gerou o ponto, para o mapa saber que
  // aquele termo já tem coordenada e não repetir a consulta ao Nominatim.
  const [pontoBusca, setPontoBusca] = useState<{
    lat: number;
    lng: number;
    termo: string;
  } | null>(null);
  const selecionarObraMapa = useCallback((id: string | null) => {
    setObraSelecionadaMapa(id);
    if (id) setFocoTick((t) => t + 1);
  }, []);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [marcadoresDialogOpen, setMarcadoresDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState(false);

  // `marcador_id` vazio = obra sem marcador, que é um estado válido e é o PADRÃO. Não há
  // pré-seleção: a lista de marcadores nasce vazia de propósito e o campo é opcional.
  const [newObra, setNewObra] = useState({
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    marcador_id: '',
    spe_cnpj: '',
  });
  const [camposExtrasObra, setCamposExtrasObra] = useState<Record<string, string>>({});

  // Helper de leitura da config: campos que ainda não têm linha na config
  // (empresas antigas antes desta migration) caem no `fallback`, que reflete o
  // comportamento hardcoded que esses campos tinham antes de virarem configuráveis.
  const obraObrigatorio = (key: string, fallback: boolean) =>
    camposConfigObras?.find(c => c.campo_key === key)?.obrigatorio ?? fallback;
  const [editObra, setEditObra] = useState({
    id: '',
    nome_obra: '',
    cliente_id: '',
    endereco_entrega: '',
    marcador_id: '',
    spe_cnpj: '',
  });

  const [newObraCnpjError, setNewObraCnpjError] = useState('');
  const [editObraCnpjError, setEditObraCnpjError] = useState('');

  // O endereço que a última consulta de CNPJ devolveu. Guarda o TEXTO, e não um "sim/não":
  // assim o aviso "isso é o endereço da sede" aparece só enquanto o campo continuar igual ao
  // que veio da Receita, e some sozinho no instante em que a pessoa corrige o endereço — sem
  // precisar de um segundo estado para desligar.
  const [newObraEnderecoDaReceita, setNewObraEnderecoDaReceita] = useState('');
  const [editObraEnderecoDaReceita, setEditObraEnderecoDaReceita] = useState('');


  const { data: marcadores } = useMarcadoresObras();

  useEffect(() => {
    const state = location.state as { selectedObraId?: string, activeTab?: string } | null;
    if (state?.selectedObraId && obras) {
      const obra = obras.find(o => o.id === state.selectedObraId);
      if (obra) {
        if (state.activeTab === 'mapa') {
          setActiveTab('mapa');
          // Filtros ativos podem esconder a obra pedida — e seleção de obra fora do
          // conjunto filtrado é apagada pelo efeito de limpeza logo abaixo. Selecionar
          // vindo de fora zera busca e chip para a obra estar garantidamente visível.
          setSearch('');
          setMarcadorFilter('todos');
          selecionarObraMapa(obra.id);
        } else {
          setSelectedObra(obra);
        }
        // Quem centraliza o mapa agora é o estado `obraSelecionadaMapa`, então o state da
        // navegação pode (e deve) ser limpo sempre — recarregar a página não re-foca.
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, obras, navigate, location.pathname]);

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
    columnWidths,
    setColumnWidth,
  } = useTableSettings({
    key: 'obras',
    defaultColumns: OBRA_FIELDS,
  });

  // Limpeza da coluna "Status" que ficou salva na configuração de quem já usava a tela.
  //
  // A configuração de colunas é persistida por empresa (localStorage + `configuracoes_tabelas`)
  // e o merge de `useTableSettings` só ACRESCENTA coluna nova — ele nunca tira a que saiu do
  // produto. Sem isto, toda empresa que já tinha configuração salva continuaria com uma coluna
  // "Status" no cabeçalho, com todas as células em branco (nada mais responde por `colId ===
  // 'status'`) e ainda clicável para ordenar, caindo no `default` do `getSortValue`.
  // O booleano é a dependência (e não `columns`) porque `useTableSettings` devolve um array
  // novo a cada render — depender dele faria o efeito rodar sempre, sem nunca mudar nada.
  const temColunaStatusLegada = columns.some(c => c.id === 'status');
  useEffect(() => {
    if (temColunaStatusLegada) handleRemoveColumn('status');
  }, [temColunaStatusLegada, handleRemoveColumn]);

  // Rótulos do menu de ordenação por coluna: numérico/moeda usa "0-9" em vez de "A-Z",
  // já que a coluna não tem alfabeto.
  const getSortLabels = (colId: string) => {
    if (colId === 'created_at') return { asc: 'Mais antigas primeiro', desc: 'Mais recentes primeiro' };
    const column = columns.find(c => c.id === colId);
    if (column?.type === 'date') return { asc: 'Mais antigas primeiro', desc: 'Mais recentes primeiro' };
    if (column?.type === 'number' || column?.type === 'currency') return { asc: 'Ordenar 0-9', desc: 'Ordenar 9-0' };
    return { asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' };
  };

  useEffect(() => {
    localStorage.setItem('obras_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleSelectAddress = (e: Event) => {
      // A sugestão de endereço já vem com a coordenada do Nominatim — o pino é cravado
      // direto, sem gastar outra consulta no serviço.
      const s = (e as CustomEvent<{ display_name?: string; lat?: string; lon?: string }>).detail;
      const lat = parseFloat(s?.lat ?? '');
      const lng = parseFloat(s?.lon ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setPontoBusca({ lat, lng, termo: (s?.display_name ?? '').trim().toLowerCase() });
      }
      setActiveTab('mapa');
    };
    window.addEventListener('select-address-map', handleSelectAddress);
    return () => window.removeEventListener('select-address-map', handleSelectAddress);
  }, []);

  // Separado do `filtered` para os contadores dos chips do mapa: eles devem refletir a
  // BUSCA, mas não o chip ativo — senão escolher um marcador zeraria os números dos outros.
  const filtradasPorBusca = useMemo(() => {
    if (!obras) return [];
    if (!search) return obras;
    const q = search.toLowerCase();
    return obras.filter(
      (o) =>
        (o.nome_obra || '').toLowerCase().includes(q) ||
        (o.endereco_entrega || '').toLowerCase().includes(q) ||
        ((o.clientes as any)?.empresa || '').toLowerCase().includes(q) ||
        ((o as ObraNaLista).marcador?.nome || '').toLowerCase().includes(q)
    );
  }, [obras, search]);

  const contagemPorMarcador = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of filtradasPorBusca) {
      const id = (o as ObraNaLista).marcador_id;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [filtradasPorBusca]);

  const filtered = useMemo(() => {
    let list = [...filtradasPorBusca];

    if (marcadorFilter !== 'todos') {
      list = list.filter((o) => (o as ObraNaLista).marcador_id === marcadorFilter);
    }

    const getSortValue = (o: any) => {
      if (sortColumn?.startsWith('custom_')) return (o.campos_extras || {})[sortColumn];
      switch (sortColumn) {
        // Ordena pelo NOME do marcador (o que está na tela), não pelo id. A junção é externa,
        // então obra sem marcador continua na lista — cai como texto vazio e vai para uma das
        // pontas, em vez de sumir.
        case 'marcador': return o.marcador?.nome ?? '';
        case 'cliente': return (o.clientes as any)?.empresa;
        case 'endereco': return o.endereco_entrega || o.nome_obra;
        case 'spe_cnpj': return o.spe_cnpj;
        case 'created_at': return o.created_at;
        case 'nome_obra': return o.nome_obra;
        default: return o.nome_obra;
      }
    };

    const sortColumnDef = columns.find(c => c.id === sortColumn);
    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (sortColumn === 'created_at' || sortColumnDef?.type === 'date') {
        const at = av ? new Date(av).getTime() : 0;
        const bt = bv ? new Date(bv).getTime() : 0;
        return (at - bt) * dir;
      }
      if (sortColumnDef?.type === 'number' || sortColumnDef?.type === 'currency') {
        const an = Number(String(av ?? '').replace(',', '.'));
        const bn = Number(String(bv ?? '').replace(',', '.'));
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
      }
      const as = (av ?? '').toString().toLowerCase();
      const bs = (bv ?? '').toString().toLowerCase();
      return as.localeCompare(bs, 'pt-BR') * dir;
    });

    return list;
  }, [filtradasPorBusca, marcadorFilter, sortColumn, sortDirection, columns]);

  const obrasParaMapa = useMemo(
    () =>
      filtered.map((o: any) => ({
        id: o.id,
        nome_obra: o.nome_obra,
        endereco_entrega: o.endereco_entrega,
        marcador_nome: o.marcador?.nome ?? null,
        marcador_cor: o.marcador?.cor ?? null,
        spe_cnpj: o.spe_cnpj,
        latitude: o.latitude ?? null,
        longitude: o.longitude ?? null,
        geocoded_at: o.geocoded_at ?? null,
        cliente_empresa: o.clientes?.empresa ?? null,
        // `o.cliente_id`, e não `o.clientes?.id`: a junção só traz `empresa` e `tipo`, então
        // `clientes.id` sempre vinha indefinido e o clique no nome do cliente dentro do balão
        // do mapa não levava a lugar nenhum. A coluna da própria obra está sempre preenchida.
        cliente_id: o.cliente_id ?? null,
      })),
    [filtered]
  );

  // Se a busca ou o chip tirou a obra selecionada do conjunto visível, a seleção morre
  // junto — senão o cartão flutuante mostraria uma obra que não está mais no mapa.
  // (Quem seleciona vindo de fora — Sheet, navegação de outra tela — zera os filtros
  // ANTES de selecionar, justamente para não cair aqui.)
  useEffect(() => {
    if (obraSelecionadaMapa && !filtered.some((o: any) => o.id === obraSelecionadaMapa)) {
      setObraSelecionadaMapa(null);
    }
  }, [filtered, obraSelecionadaMapa]);

  // Filtro/busca novos invalidam a página atual da lista: sem o reset, filtrar para um
  // conjunto menor estando na página 4 deixava a tabela em branco ("página 4 de 1").
  useEffect(() => {
    setPage(1);
  }, [search, marcadorFilter]);

  const isDefaultSort = sortColumn === 'created_at' && sortDirection === 'desc';
  const hasFilters = marcadorFilter !== 'todos' || !isDefaultSort;
  // Se este contador esquecer um filtro, o botão "Limpar" mente sobre o que está filtrado.
  const activeFilterCount = (marcadorFilter !== 'todos' ? 1 : 0) + (!isDefaultSort ? 1 : 0);

  const paginatedObras = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, page, pageSize]);

  // Larguras resolvidas na mesma ordem das colunas visíveis, usadas no <colgroup> e nos
  // cabeçalhos — a tabela precisa de largura própria explícita (não w-full/auto) + colgroup,
  // senão o navegador redistribui as larguras proporcionalmente ao redimensionar uma coluna.
  const OBRAS_CHECKBOX_COL_WIDTH = 40;
  const resolvedObraColWidths = visibleColumns.map((colId) => columnWidths[colId] ?? (colId === 'actions' ? 80 : 150));
  const obrasTableTotalWidth = OBRAS_CHECKBOX_COL_WIDTH + resolvedObraColWidths.reduce((a, b) => a + b, 0);

  const toggleSelectAllPage = () => {
    if (selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedObras.map(o => o.id));
    }
  };

  const toggleSelectAllGeneral = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(o => o.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // O `headerContent` que existia aqui repetia, letra por letra, o mesmo cabeçalho que o
  // AppLayout já monta a partir de `title`/`subtitle`. Como `headerContent` tem prioridade
  // sobre os dois, o `subtitle` desta tela era texto morto: mexer nele não mudava nada na
  // tela. Removido para o cabeçalho vir de um lugar só, como nas demais seções.
  return (
    <AppLayout
      title="Obras"
      subtitle="Gerencie e acompanhe todas as obras cadastradas"
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      <div className="p-4 md:p-6 space-y-6 flex-1 flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 flex-1 flex flex-col min-h-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <TabsList className={cn(TOGGLE_LIST_CLASS, 'shrink-0')}>
                <TabsTrigger value="lista" className={TOGGLE_TRIGGER_CLASS}>
                  <List className="h-4 w-4" /> Lista
                </TabsTrigger>
                <TabsTrigger value="mapa" className={TOGGLE_TRIGGER_CLASS}>
                  <MapIcon className="h-4 w-4" /> Mapa
                </TabsTrigger>
              </TabsList>

              <SearchWithRecent
                placeholder="Buscar obras..."
                value={search}
                onValueChange={setSearch}
                storageKey="obras_recent_searches"
                showAddressSuggestions={true}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                className="h-10"
              />

              <FilterButton
                hasFilters={hasFilters}
                activeFilterCount={activeFilterCount}
                onClear={() => {
                  setMarcadorFilter('todos');
                  setSortColumn('created_at');
                  setSortDirection('desc');
                }}
                popoverClassName="w-64"
                align="end"
              >
                <div className="flex flex-col gap-1">
                  {/* Submenu Marcador */}
                  <StandardPopoverMenu
                    label="Marcador"
                    icon={Tag}
                    badge={marcadorFilter !== 'todos' ? 1 : undefined}
                    side="left"
                    align="start"
                    sideOffset={10}
                    popoverClassName="w-64"
                  >
                    <div className="flex flex-col h-full">
                      <div className="p-1 space-y-1">
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm",
                            marcadorFilter === 'todos' && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => setMarcadorFilter('todos')}
                        >
                          <Checkbox checked={marcadorFilter === 'todos'} onCheckedChange={() => setMarcadorFilter('todos')} />
                          Todos os marcadores
                        </div>
                        {/* Lista vazia é o estado NORMAL de quem ainda não criou marcador — e
                            precisa dizer isso com todas as letras. Um submenu em branco foi o
                            que deixou o antigo "Status" intransponível: ninguém sabia se estava
                            vazio porque não havia nada ou porque a tela tinha quebrado. */}
                        {marcadores?.length === 0 && (
                          <p className="px-2 py-2 text-xs text-muted-foreground leading-relaxed">
                            Nenhum marcador cadastrado ainda. Crie o primeiro em "Gerenciar marcadores".
                          </p>
                        )}
                        {marcadores?.map(marcador => (
                          <div
                            key={marcador.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm",
                              marcadorFilter === marcador.id && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => setMarcadorFilter(marcador.id)}
                          >
                            <Checkbox checked={marcadorFilter === marcador.id} onCheckedChange={() => setMarcadorFilter(marcador.id)} />
                            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', `bg-${marcador.cor}`)} />
                            <span className="truncate">{marcador.nome}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-1 py-1 mt-1 border-t border-border/50">
                        <StandardMenuItem
                          label="Gerenciar marcadores"
                          icon={Settings2}
                          onClick={() => setMarcadoresDialogOpen(true)}
                        />
                      </div>
                    </div>
                  </StandardPopoverMenu>
                </div>
              </FilterButton>

              <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0 h-10 bg-[#F06A00] hover:bg-[#F06A00]/90">
                <Plus className="h-4 w-4" />
                Nova Obra
              </Button>
            </div>
          </div>

          {/* 🔴 `data-[state=active]:flex`, NUNCA `flex` cru, nas duas abas: a aba inativa
              fica no documento com o atributo `hidden`, e uma classe de display crua vence o
              `hidden` na cascata — a aba escondida vira uma caixa vazia esticável que rouba
              metade da altura da aba visível (era o vão gigante acima do mapa). */}
          <TabsContent value="lista" className="space-y-6 mt-0 flex-1 data-[state=active]:flex flex-col min-h-0">
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">{filtered.length} obra(s) encontrada(s)</p>
                    {selectedIds.length > 0 && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => setConfirmDeleteBulk(true)}
                        className="gap-2 h-8"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover Selecionados ({selectedIds.length})
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="rounded-lg border border-border/60 overflow-auto bg-card flex-1 min-h-0">
                  <table className="w-full text-sm table-fixed" style={{ width: obrasTableTotalWidth }}>
                    <colgroup>
                      <col style={{ width: OBRAS_CHECKBOX_COL_WIDTH }} />
                      {visibleColumns.map((colId, i) => (
                        <col key={colId} style={{ width: resolvedObraColWidths[i] }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="border-b bg-muted/50">
                        <th className="h-14 px-2.5 w-10 text-center">
                          <Checkbox
                            checked={selectedIds.length > 0 && selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id))}
                            onCheckedChange={toggleSelectAllPage}
                          />
                        </th>
                        {visibleColumns.map((colId, i) => (
                          colId === 'actions' ? (
                            <ResizableTh
                              key={colId}
                              width={resolvedObraColWidths[i]}
                              onResize={(w) => setColumnWidth(colId, w)}
                              className="text-left h-14 px-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap"
                            >
                              {getLabel(colId)}
                            </ResizableTh>
                          ) : (
                            <SortableTh
                              key={colId}
                              label={getLabel(colId)}
                              sortKey={colId}
                              currentSortKey={sortColumn}
                              currentDirection={sortDirection}
                              onSort={(key, direction) => { setSortColumn(key); setSortDirection(direction); }}
                              ascLabel={getSortLabels(colId).asc}
                              descLabel={getSortLabels(colId).desc}
                              width={resolvedObraColWidths[i]}
                              onResize={(w) => setColumnWidth(colId, w)}
                            />
                          )
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedObras.map(obra => {
                        const marcador = (obra as ObraNaLista).marcador;
                        const cliente = obra.clientes as any;
                        const camposExtras = (obra as any).campos_extras || {};
                        // Se o clique foi o fim de uma seleção de texto (usuário copiando
                        // um valor da célula), não abre o painel — o resto da linha
                        // continua clicável normalmente.
                        const openDetail = () => {
                          if (hasTextSelection()) return;
                          setSelectedObra(obra);
                        };

                        return (
                          <tr
                            key={obra.id}
                            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={openDetail}
                          >
                            <td className="py-1.5 px-2.5 w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.includes(obra.id)}
                                onCheckedChange={() => toggleSelect(obra.id)}
                              />
                            </td>
                            {visibleColumns.map(colId => (
                              <td key={colId} className="py-1.5 px-2.5 truncate max-w-[200px]">
                                {colId === 'nome_obra' && (
                                  <span className="font-semibold text-sm text-foreground">
                                    {obra.nome_obra}
                                  </span>
                                )}
                                {colId === 'marcador' && (
                                  marcador
                                    ? <Badge className={cn('text-[10px] text-white border-none', `bg-${marcador.cor}`)}>{marcador.nome}</Badge>
                                    : <span className="text-muted-foreground">—</span>
                                )}
                                {colId === 'cliente' && (
                                  <span className="font-medium">
                                    {cliente?.empresa || '—'}
                                  </span>
                                )}
                                {colId === 'endereco' && (
                                  <span>
                                    {obra.endereco_entrega || obra.nome_obra}
                                  </span>
                                )}
                                {colId === 'spe_cnpj' && (obra.spe_cnpj || '—')}
                                {colId === 'created_at' && format(new Date(obra.created_at), "dd/MM/yyyy")}
                                {colId === 'actions' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(obra.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {colId.startsWith('custom_') && (camposExtras[colId] || '—')}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 border-t">
                  <ListPagination
                    page={page}
                    totalPages={Math.ceil(filtered.length / pageSize)}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Layout dividido: painel (chips por marcador + lista) à esquerda, mapa à direita
              ocupando a altura restante da aba. Em tela estreita empilha, com o painel
              limitado em altura e rolagem interna. */}
          {/* Mesma corrente de altura da aba Lista: TabsContent vira coluna flex e o miolo
              cresce com flex-1 — nada de h-full percentual, que dentro de item flex sem
              altura explícita resolve para "auto" e deixava o conjunto encolhido no rodapé.
              O lg:grid-rows-1 (linha de 1fr) é o que estica painel e mapa na vertical. */}
          <TabsContent value="mapa" className="mt-0 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col gap-4 lg:grid lg:grid-cols-[360px_1fr] lg:grid-rows-1">
              <Card className="flex flex-col min-h-0 overflow-hidden max-h-[40dvh] lg:max-h-none p-0">
                <MapaObrasPainel
                  obras={obrasParaMapa}
                  isLoading={isLoading}
                  marcadores={marcadores}
                  marcadorFilter={marcadorFilter}
                  onMarcadorFilter={setMarcadorFilter}
                  contagemPorMarcador={contagemPorMarcador}
                  totalBusca={filtradasPorBusca.length}
                  selectedObraId={obraSelecionadaMapa}
                  onSelectObra={selecionarObraMapa}
                />
              </Card>
              <div className="flex-1 min-h-[320px] lg:min-h-0 flex flex-col">
                <MapaObras
                  obras={obrasParaMapa}
                  isLoading={isLoading}
                  searchTerm={search}
                  selectedObraId={obraSelecionadaMapa}
                  focoTick={focoTick}
                  pontoBusca={pontoBusca}
                  onPontoBusca={setPontoBusca}
                  onSelectObra={selecionarObraMapa}
                  onVerDetalhes={(id) => setSelectedObra(obras?.find(o => o.id === id) ?? null)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Diálogo de gerenciar marcadores da obra */}
        <MarcadoresObrasDialog
          open={marcadoresDialogOpen}
          onOpenChange={setMarcadoresDialogOpen}
        />

        {/* Obra Details Sheet (Lateral) */}
        <Sheet open={!!selectedObra} onOpenChange={(open) => !open && setSelectedObra(null)}>
          {selectedObra && (
            <SheetContent className="sm:max-w-xl overflow-y-auto">
              <SheetHeader className="pb-6 border-b">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <SheetTitle className="flex items-center gap-2">
                      <HardHat className="h-5 w-5 text-primary" />
                      <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{selectedObra.nome_obra}</span>
                    </SheetTitle>
                    <SheetDescription>
                      Detalhes da obra vinculada ao cliente.
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" /> Cliente
                    </Label>
                    <p 
                      className="text-sm font-medium hover:text-primary transition-colors cursor-pointer"
                      onClick={() => navigate(`/clientes/${selectedObra.cliente_id}`)}
                    >
                      {selectedObra.clientes?.empresa || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> Localização
                    </Label>
                    <div className="pt-1">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-2 text-xs"
                        onClick={() => {
                          // Seleciona a obra direto no mapa (foco + cartão), sem o hack antigo
                          // de jogar o endereço no campo de busca. Busca e chip são zerados
                          // porque um filtro ativo que esconda a obra apagaria a seleção.
                          setSearch('');
                          setMarcadorFilter('todos');
                          selecionarObraMapa(selectedObra.id);
                          setActiveTab('mapa');
                          setSelectedObra(null); // Fecha o painel lateral
                        }}
                      >
                        <MapIcon className="h-3.5 w-3.5 text-primary" />
                        Visualizar no mapa
                      </Button>
                      {!selectedObra.endereco_entrega && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                          Sem endereço de entrega — o mapa tenta posicionar pelo nome da obra
                        </p>
                      )}
                    </div>
                      {selectedObra.marcador && (
                        <div className="mt-3">
                          <Badge className={cn('text-white border-none', `bg-${selectedObra.marcador.cor}`)}>
                            {selectedObra.marcador.nome}
                          </Badge>
                        </div>
                      )}
                    </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Data de Cadastro
                    </Label>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedObra.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                </div>

                {/* O que foi vendido para esta obra. Era o "futuramente" que estava escrito
                    aqui desde a criação da tela. */}
                <div className="border-t pt-6">
                  <h3 className="mb-3 text-sm font-semibold">Vendas desta obra</h3>
                  <VendasDaObra obraId={selectedObra.id} />
                </div>
              </div>

              <SheetFooter className="border-t pt-6 gap-3 sm:gap-0 mt-8">
                <div className="flex w-full justify-between items-center">
                  <Button 
                    variant="ghost" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                    onClick={() => {
                      setConfirmDeleteId(selectedObra.id);
                      setSelectedObra(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedObra(null)}>Fechar</Button>
                    <Button onClick={() => {
                      setEditObra({
                        id: selectedObra.id,
                        nome_obra: selectedObra.nome_obra,
                        cliente_id: selectedObra.cliente_id,
                        endereco_entrega: selectedObra.endereco_entrega || '',
                        // Vazio = sem marcador. O <SeletorMarcadorObra> traduz isso na tela
                        // para "Sem marcador", e vira `null` de volta na hora de salvar.
                        marcador_id: selectedObra.marcador_id || '',
                        // Com máscara, e não cru. O banco guarda só os 14 dígitos, mas a
                        // validação cobra os 18 caracteres do formato — sem `formatCnpj`
                        // aqui, obra COM CNPJ salvo era reprovada por "CNPJ obrigatório".
                        spe_cnpj: formatCnpj(selectedObra.spe_cnpj || ''),
                      });
                      // O endereço veio do banco, não de uma consulta: nada de aviso de sede.
                      setEditObraEnderecoDaReceita('');
                      setEditObraCnpjError('');
                      setEditDialogOpen(true);
                      setSelectedObra(null);
                    }}>Editar</Button>
                  </div>
                </div>
              </SheetFooter>
            </SheetContent>
          )}
        </Sheet>

        {/* Edit Obra Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          {/* ConteudoDialogo/CorpoDialogo: o formulário tem ~600px e antes crescia
              para fora da janela nas duas pontas, levando junto o "Salvar alterações"
              e o "X" de fechar — e como Esc e clique-fora estão desligados, a única
              saída era recarregar a página e perder o que estava preenchido. */}
          <ConteudoDialogo>
            <CabecalhoDialogo>
              <DialogTitle>Editar Obra</DialogTitle>
            </CabecalhoDialogo>
            <form onSubmit={(e) => {
              e.preventDefault();
              const erroCnpjEdit = validarCnpjDaObra(editObra.spe_cnpj, obraObrigatorio('spe_cnpj', false));
              if (erroCnpjEdit) {
                setEditObraCnpjError(erroCnpjEdit);
                return;
              }
              // Mudou o endereço (ou o nome, quando é o nome que posiciona a obra no mapa por
              // falta de endereço)? Zera coordenada e carimbo de geocodificação — é isso que
              // faz o mapa buscar o ponto novo. Sem zerar, o pino ficava no lugar antigo para
              // sempre, porque a geocodificação só roda em obra sem carimbo.
              const original = obras?.find(o => o.id === editObra.id);
              const localizacaoMudou = original
                ? (original.endereco_entrega || '') !== editObra.endereco_entrega ||
                  (!editObra.endereco_entrega && original.nome_obra !== editObra.nome_obra)
                : false;
              const payload = {
                ...editObra,
                spe_cnpj: editObra.spe_cnpj.replace(/\D/g, ""),
                // String vazia NÃO serve: a coluna é uuid, e `marcador_id = ''` faz o banco
                // recusar a gravação inteira. "Sem marcador" é `null`.
                marcador_id: editObra.marcador_id || null,
                ...(localizacaoMudou
                  ? { latitude: null, longitude: null, geocoded_at: null }
                  : {}),
              };
              updateObra.mutate(payload, {
                onSuccess: () => {
                  setEditDialogOpen(false);
                  toast.success("Obra atualizada com sucesso!");
                  setEditObraCnpjError('');
                }
              });
            }} className="flex min-h-0 flex-1 flex-col gap-4">
              <CorpoDialogo className="space-y-4">
                {/* O CNPJ abre o formulário: é ele que preenche o resto. Continua OPCIONAL —
                    nem toda obra é uma SPE com CNPJ próprio, e a obrigatoriedade é escolha de
                    cada empresa em Configurações → Campos (`obraObrigatorio`, padrão falso). */}
                <CampoCnpj
                  label="SPE / CNPJ"
                  obrigatorio={obraObrigatorio('spe_cnpj', false)}
                  value={editObra.spe_cnpj}
                  onChange={(v) => {
                    setEditObra(prev => ({ ...prev, spe_cnpj: v }));
                    setEditObraCnpjError('');
                  }}
                  onDadosEncontrados={(dados) => {
                    setEditObra(prev => aplicarDadosDoCnpj(prev, dados));
                    setEditObraEnderecoDaReceita(enderecoDaReceita(dados));
                  }}
                  erro={editObraCnpjError}
                  descricao="Opcional. Preenchido, completa o nome e o endereço que ainda estiverem em branco."
                />

                <div className="space-y-2">
                  <Label>Nome da Obra</Label>
                  <Input
                    required
                    placeholder="Ex: Edifício Horizonte"
                    value={editObra.nome_obra}
                    onChange={(e) => setEditObra(prev => ({ ...prev, nome_obra: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cliente Responsável</Label>
                  <EmpresaSelector
                    value={editObra.cliente_id}
                    onValueChange={(v) => setEditObra(prev => ({ ...prev, cliente_id: v }))}
                    placeholder="Selecione o cliente"
                  />
                </div>

                <SeletorMarcadorObra
                  value={editObra.marcador_id}
                  onChange={(v) => setEditObra(prev => ({ ...prev, marcador_id: v }))}
                  onGerenciar={() => setMarcadoresDialogOpen(true)}
                />

                <div className="space-y-2">
                  <Label>Endereço de Entrega</Label>
                  <EnderecoAutocomplete
                    value={editObra.endereco_entrega}
                    onChange={(v) => setEditObra(prev => ({ ...prev, endereco_entrega: v }))}
                  />
                  {!!editObraEnderecoDaReceita &&
                    editObra.endereco_entrega === editObraEnderecoDaReceita && (
                      <AvisoEnderecoDaReceita />
                    )}
                </div>
              </CorpoDialogo>

              <RodapeDialogo>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={updateObra.isPending}>
                  {updateObra.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </RodapeDialogo>
            </form>
          </ConteudoDialogo>
        </Dialog>

        {/* Create Obra Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {/* Mesmo conserto do "Editar Obra" — e aqui a altura ainda cresce com os
              campos personalizados que a empresa cadastrar, então o teto não é opcional. */}
          <ConteudoDialogo>
            <CabecalhoDialogo>
              <DialogTitle>Nova Obra</DialogTitle>
            </CabecalhoDialogo>
            <form onSubmit={(e) => {
              e.preventDefault();
              const nomeObraObrigatorio = obraObrigatorio('nome_obra', true);
              const clienteObrigatorio = obraObrigatorio('cliente_id', true);
              if ((nomeObraObrigatorio && !newObra.nome_obra) || (clienteObrigatorio && !newObra.cliente_id)) {
                toast.error("Preencha ao menos o nome e o cliente.");
                return;
              }
              const erroCnpjNovo = validarCnpjDaObra(newObra.spe_cnpj, obraObrigatorio('spe_cnpj', false));
              if (erroCnpjNovo) {
                setNewObraCnpjError(erroCnpjNovo);
                return;
              }
              for (const c of (camposConfigObras ?? []).filter(c => c.origem === 'customizado' && c.obrigatorio)) {
                if (!camposExtrasObra[c.campo_key]?.trim()) {
                  toast.error(`Preencha o campo obrigatório: ${c.label}`);
                  return;
                }
              }
              const payload = {
                ...newObra,
                spe_cnpj: newObra.spe_cnpj.replace(/\D/g, ""),
                // Ver o mesmo comentário na edição: uuid não aceita string vazia.
                marcador_id: newObra.marcador_id || null,
                campos_extras: camposExtrasObra,
              };
              createObra.mutate(payload, {
                onSuccess: () => {
                  setDialogOpen(false);
                  setNewObra({ nome_obra: '', cliente_id: '', endereco_entrega: '', marcador_id: '', spe_cnpj: '' });
                  setCamposExtrasObra({});
                  setNewObraCnpjError('');
                  setNewObraEnderecoDaReceita('');
                }
              });
            }} className="flex min-h-0 flex-1 flex-col gap-4">
              <CorpoDialogo className="space-y-4">
                {/* O CNPJ vem primeiro de propósito: quem cadastra uma SPE tem o CNPJ em mãos e
                    a consulta traz nome e endereço prontos. Continua OPCIONAL — obra sem CNPJ
                    próprio é o caso comum, e quem quiser exigir marca em Configurações →
                    Campos (`obraObrigatorio('spe_cnpj', false)`). */}
                <CampoCnpj
                  label="SPE / CNPJ"
                  obrigatorio={obraObrigatorio('spe_cnpj', false)}
                  value={newObra.spe_cnpj}
                  onChange={(v) => {
                    setNewObra(prev => ({ ...prev, spe_cnpj: v }));
                    setNewObraCnpjError('');
                  }}
                  onDadosEncontrados={(dados) => {
                    setNewObra(prev => aplicarDadosDoCnpj(prev, dados));
                    setNewObraEnderecoDaReceita(enderecoDaReceita(dados));
                  }}
                  erro={newObraCnpjError}
                  descricao="Opcional. Preenchido, completa o nome e o endereço que ainda estiverem em branco."
                />

                <div className="space-y-2">
                  <Label>Nome da Obra{obraObrigatorio('nome_obra', true) && ' *'}</Label>
                  <Input
                    required={obraObrigatorio('nome_obra', true)}
                    placeholder="Ex: Edifício Central"
                    value={newObra.nome_obra}
                    onChange={(e) => setNewObra(prev => ({ ...prev, nome_obra: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cliente Responsável{obraObrigatorio('cliente_id', true) && ' *'}</Label>
                  <EmpresaSelector
                    value={newObra.cliente_id}
                    onValueChange={(v) => setNewObra(prev => ({ ...prev, cliente_id: v }))}
                    placeholder="Selecione um cliente"
                  />
                </div>

                {/* Marcador é sempre OPCIONAL — não passa por `obraObrigatorio`. Foi campo
                    obrigatório com lista vazia que travou o cadastro no modelo antigo. */}
                <SeletorMarcadorObra
                  value={newObra.marcador_id}
                  onChange={(v) => setNewObra(prev => ({ ...prev, marcador_id: v }))}
                  onGerenciar={() => setMarcadoresDialogOpen(true)}
                />

                <div className="space-y-2">
                  <Label>Endereço de Entrega{obraObrigatorio('endereco_entrega', false) && ' *'}</Label>
                  <EnderecoAutocomplete
                    value={newObra.endereco_entrega}
                    onChange={(v) => setNewObra(prev => ({ ...prev, endereco_entrega: v }))}
                  />
                  {!!newObraEnderecoDaReceita &&
                    newObra.endereco_entrega === newObraEnderecoDaReceita && (
                      <AvisoEnderecoDaReceita />
                    )}
                </div>

                {(camposConfigObras ?? []).filter(c => c.origem === 'customizado').map(campo => (
                  <div key={campo.id} className="space-y-2">
                    <Label>{campo.label}{campo.obrigatorio && ' *'}</Label>
                    <Input
                      value={camposExtrasObra[campo.campo_key] ?? ''}
                      onChange={(e) => setCamposExtrasObra(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                      placeholder={campo.label ?? ''}
                    />
                  </div>
                ))}
              </CorpoDialogo>

              <RodapeDialogo>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createObra.isPending}>
                  {createObra.isPending ? "Salvando..." : "Criar Obra"}
                </Button>
              </RodapeDialogo>
            </form>
          </ConteudoDialogo>
        </Dialog>

        <AlertDialog open={confirmDeleteBulk} onOpenChange={setConfirmDeleteBulk}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Obras</AlertDialogTitle>
              <AlertDialogDescription>
                Selecione quais obras deseja remover. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex flex-col gap-3">
                <Button 
                  variant="outline" 
                  className={cn(
                    "justify-start h-auto py-3 px-4",
                    selectedIds.length === paginatedObras.length && paginatedObras.every(o => selectedIds.includes(o.id)) && "border-primary bg-primary/5"
                  )}
                  onClick={toggleSelectAllPage}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-semibold">Selecionar Página Atual</span>
                    <span className="text-xs text-muted-foreground">Remover apenas as {paginatedObras.length} obras que aparecem nesta página</span>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className={cn(
                    "justify-start h-auto py-3 px-4",
                    selectedIds.length === filtered.length && filtered.length > 0 && "border-primary bg-primary/5"
                  )}
                  onClick={toggleSelectAllGeneral}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-semibold">Selecionar Todas</span>
                    <span className="text-xs text-muted-foreground">Remover todas as {filtered.length} obras encontradas (incluindo outras páginas)</span>
                  </div>
                </Button>
              </div>
              {selectedIds.length > 0 && (
                <p className="text-sm font-medium text-destructive">
                  {selectedIds.length} obra(s) selecionada(s) para exclusão.
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={selectedIds.length === 0 || deleteObrasBulk.isPending}
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    console.log('Botão excluir clicado no modal. IDs selecionados:', selectedIds);
                    const result = await deleteObrasBulk.mutateAsync(selectedIds);
                    console.log('Resultado da exclusão:', result);
                    toast.success(`${selectedIds.length} obras excluídas com sucesso!`);
                    setSelectedIds([]);
                    setConfirmDeleteBulk(false);
                  } catch (error: any) {
                    console.error('Erro detalhado capturado no modal:', error);
                    let errorMessage = "Erro desconhecido";
                    
                    if (error.message) {
                      errorMessage = error.message;
                    } else if (typeof error === 'string') {
                      errorMessage = error;
                    }
                    
                    toast.error("Erro ao excluir obras: " + errorMessage);
                  }
                }}
              >
                {deleteObrasBulk.isPending ? "Excluindo..." : "Excluir Selecionadas"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Obra</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta obra? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (confirmDeleteId) {
                    try {
                      await deleteObra.mutateAsync(confirmDeleteId);
                      toast.success("Obra excluída com sucesso!");
                    } catch (error: any) {
                      toast.error("Erro ao excluir obra: " + error.message);
                    }
                    setConfirmDeleteId(null);
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

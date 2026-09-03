import { useEffect, useMemo, useState, useCallback, useDeferredValue, useRef, memo, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parse, isValid, startOfMonth, endOfMonth } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { marcaDaEmpresa } from '@/lib/marca-da-empresa';
import { useMinhaPermissao } from '@/hooks/use-minha-permissao';
import { PainelDeResponsaveis } from '@/components/pedidos/PainelDeResponsaveis';
import { useParticipantesDosNegocios } from '@/hooks/use-participantes-dos-negocios';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { KanbanColunasDialog } from '@/components/pedidos/kanban/KanbanColunasDialog';
import { useMarcadores } from '@/hooks/use-marcadores';
import { MarcadoresDialog } from '@/components/pedidos/MarcadoresDialog';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { ComentariosNegocio } from '@/components/pedidos/ComentariosNegocio';
import { useFunis } from '@/hooks/use-funis';
import { useConfiguracoesCampos, isCampoObrigatorioNaEtapa, resolveFieldLabel } from '@/hooks/use-configuracoes-campos';
import { usePedidos, usePedidosStats, useSearchMatches, useHistoricoContatos, usePedidoHistoricoStatus, useUpdatePedidoStatus, useBulkDeletePedidos, useBulkUpdatePedidos, buscarNegociosDoRecorte, PEDIDOS_EXPORTACAO_AVISO, PEDIDOS_LOTE_EXPORTACAO, type PedidosFilters, type PedidoWithRelations, type PeriodoDateField, type PedidosSort, type PedidosSortColumn } from '@/hooks/use-pedidos';
import { useTarefasPorPedido, type Tarefa } from '@/hooks/use-tarefas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { UserProfilePopover } from '@/components/layout/UserProfilePopover';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { mapPedidoToOrder } from '@/lib/pedido-to-order';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { fabricanteEstaAtivo } from '@/lib/ordem-de-fabricantes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StandardPopoverMenu, StandardMenuItem } from '@/components/ui/standard-popover-menu';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  Plus, Search, Upload, MessageSquare, Phone, Mail, Eye, EyeOff, Loader2, Pencil, FileDown,
  Settings2, Columns3, Trash2, Filter, X, ChevronDown, AlertTriangle, CalendarIcon,
  LayoutGrid, List as ListIcon, Building2, Factory, DollarSign, Clock, User, FileText,
  ChevronRight, FileWarning, FileSpreadsheet, FolderKanban, Rows3, History, Tag, ArrowRightLeft,
  ListChecks, ArrowRight
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { ConteudoDoPainel, CabecalhoDoPainel, CorpoDoPainel, RodapeDoPainel } from '@/components/shared/PainelDeDetalhes';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { PedidoRow } from '@/lib/generate-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColumnSettings, type ColumnDefinition, ColumnSettingsItem, ColumnSettingsHeader, ColumnSettingsPopover } from '@/components/shared/ColumnSettings';
import { useTableSettings } from '@/hooks/use-table-settings';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TOGGLE_LIST_CLASS, TOGGLE_ITEM_CLASS } from '@/lib/toggle-group-styles';
import { ImportDialog } from '@/components/ImportDialog';
import { ListPagination } from '@/components/shared/ListPagination';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { ResizableTh } from '@/components/shared/ResizableTh';
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { KanbanColumn } from '@/components/pedidos/kanban/KanbanColumn';
import { FilterButton } from '@/components/shared/FilterButton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { acaoDaCaixaDoCabecalho } from '@/lib/selecao-em-massa';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { filenameFromUrl } from '@/lib/download-file';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { SearchWithRecent } from '@/components/shared/SearchWithRecent';
import { LinkAnexoPrivado } from '@/components/shared/LinkAnexoPrivado';
import { enderecoDoArquivo } from '@/lib/arquivo-privado';

const ImportPedidosDialog = lazy(() =>
  import('@/components/pedidos/ImportPedidosDialog').then(m => ({ default: m.ImportPedidosDialog }))
);

const PEDIDOS_COLUMNS: ColumnDefinition[] = [
  { id: 'negocio', label: 'Negócio', locked: false },
  { id: 'cliente', label: 'Cliente', locked: false },
  { id: 'contato', label: 'Contato', locked: false },
  { id: 'endereco_entrega', label: 'Obra/Endereço', locked: false },
  { id: 'fabricante', label: 'Fabricante', locked: false },
  { id: 'valor', label: 'Valor', locked: false },
  { id: 'vendedor', label: 'Responsável/Vendedor', locked: false },
  { id: 'etapa', label: 'Etapa', locked: false },
  { id: 'marcador', label: 'Marcador', locked: false },
  { id: 'data_pedido', label: 'Criação', locked: false },
  { id: 'prazo_resposta', label: 'Fechamento', locked: false },
  { id: 'observacoes', label: 'Observações', locked: false },
  { id: 'anexo', label: 'Anexo', locked: false },
  { id: 'acoes', label: 'Ações', locked: false },
];

// Itens visíveis por padrão (card do Kanban e colunas da lista, mesma configuração pras duas
// visões) — o restante de PEDIDOS_COLUMNS continua disponível pra ativar manualmente em "Itens do
// card"/"Colunas".
const PEDIDOS_DEFAULT_VISIBLE_COLUMNS = ['negocio', 'cliente', 'contato', 'fabricante', 'valor', 'data_pedido', 'prazo_resposta', 'vendedor'];

const PAGE_SIZE = 10;
// Constante LEGACY_CARD_FIELDS removida pois as colunas agora são independentes.

/**
 * Quais colunas da Lista sabem se ordenar, e como o menu do cabeçalho descreve cada direção.
 *
 * A REGRA QUE DECIDE QUEM ENTRA — e que continua valendo mesmo depois do pedido de padronizar
 * o ordenador em todas as colunas: **cabeçalho que promete ordenar e não ordena é pior que
 * cabeçalho que não promete nada, e ordenação que ESCONDE linha é o pior de todos**, porque o
 * rodapé conta por outra consulta e continua somando quem sumiu da lista.
 *
 * Por isso os rótulos aqui descrevem o EFEITO do clique, não o mecanismo: "Maior valor
 * primeiro" em vez de "valor_total desc", "Com anexo primeiro" em vez de "A-Z".
 *
 * Onze das treze colunas de dado ordenam. As duas que faltam, e o motivo exato (medido em
 * 23/08/2026, na base inteira — todas as 8 empresas, não só a MD):
 *
 * - **Etapa** — não é escolha, é impedimento. `pedidos.status` guarda o apelido da etapa em
 *   texto ("enviado") e NÃO tem chave estrangeira para `kanban_colunas`, que é onde vivem o
 *   nome ("Orçamento Enviado") e a ordem do funil. O PostgREST recusa o pedido antes de tocar
 *   no banco: `PGRST200 — Could not find a relationship between 'pedidos' and 'kanban_colunas'`.
 *   Ordenar pelo apelido em texto daria "elaboracao, enviado, fechamento, negociacao,
 *   novo_lead, perdido", que não é nem o que se lê na tela nem a ordem do funil (que é
 *   novo_lead → elaboracao → enviado → negociacao → fechamento → perdido). Enquanto isso, quem
 *   quer ver o funil em ordem tem o Kanban, e quem quer uma etapa só tem o filtro de Etapa.
 * - **Observações** — 11.898 dos 11.911 negócios têm o campo VAZIO e só 4 têm texto. E o truque
 *   do Anexo ("com/sem primeiro") não funciona aqui: o vazio de Observações é texto em branco,
 *   não nulo (11.898 em branco contra 9 nulos), e texto em branco não é separável por
 *   NULLS FIRST/LAST. Qualquer direção entrega páginas de linha vazia.
 *
 * - **Ações** não entra porque não é dado, é botão.
 */
const ORDENACAO_DA_LISTA: Record<string, { coluna: PedidosSortColumn; asc: string; desc: string }> = {
  // "cliente | fabricante" é literalmente o que a célula desenha (getNomeNegocio monta assim
  // quando `pedidos.nome` está vazio, que é o caso dos 11.911). O rótulo diz "pelo cliente"
  // porque é a verdade: um negócio com nome digitado à mão aparece na posição do cliente dele.
  negocio: { coluna: 'negocio', asc: 'Ordenar A-Z (pelo cliente)', desc: 'Ordenar Z-A (pelo cliente)' },
  cliente: { coluna: 'cliente', asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  contato: { coluna: 'contato', asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  fabricante: { coluna: 'fabricante', asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  vendedor: { coluna: 'vendedor', asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  valor: { coluna: 'valor_total', asc: 'Menor valor primeiro', desc: 'Maior valor primeiro' },
  data_pedido: { coluna: 'data_pedido', asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' },
  prazo_resposta: { coluna: 'prazo_resposta', asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' },
  // Vazios sempre por último, nos dois sentidos (ver `vaziosSeguemADirecao` em use-pedidos.ts).
  // Sem isso, "Ordenar Z-A" abriria com 9.512 traços, porque o padrão do Postgres em ordem
  // decrescente é jogar os nulos para o começo.
  endereco_entrega: { coluna: 'endereco_entrega', asc: 'Ordenar A-Z', desc: 'Ordenar Z-A' },
  // MARCADOR: ordena pelo próprio `marcador_id`, não pelo nome do marcador — e o rótulo não
  // promete A-Z justamente por isso. Alfabético exigiria junção interna com `marcadores`, e
  // `marcador_id` é nulo em 8.526 dos 11.911: a lista perderia 72% das linhas em silêncio,
  // enquanto o rodapé continuaria dizendo 11.911. Pelo id, ninguém some e os negócios do mesmo
  // marcador ficam juntos (id igual fica lado a lado), que é o que a coluna serve para ver.
  marcador: { coluna: 'marcador_id', asc: 'Com marcador primeiro', desc: 'Sem marcador primeiro' },
  // Anexo guarda um endereço de arquivo: ordenar por ele alfabeticamente não diz nada a ninguém.
  // O que a coluna responde de útil é "quais negócios têm anexo", e é o que os rótulos dizem.
  anexo: { coluna: 'pdf_url', asc: 'Com anexo primeiro', desc: 'Sem anexo primeiro' },
  // Id legado da mesma coluna, criado por importações antigas (ver o tratamento em PedidoRow).
  pdf_url: { coluna: 'pdf_url', asc: 'Com anexo primeiro', desc: 'Sem anexo primeiro' },
};

const ORDENACAO_STORAGE_KEY = 'negocios_lista_ordenacao';

/** O que ficou guardado do último uso: a coluna do cabeçalho (não a do banco) e a direção. */
type OrdenacaoDaLista = { colId: string; direction: SortDirection };

// Descarta preferência salva que não existe mais (coluna removida, arquivo de outra versão).
// Sem isso, uma escolha antiga viraria um `order=` inválido e derrubaria a lista inteira.
const lerOrdenacaoSalva = (): OrdenacaoDaLista | null => {
  try {
    const salvo = JSON.parse(localStorage.getItem(ORDENACAO_STORAGE_KEY) || 'null');
    if (!salvo || !ORDENACAO_DA_LISTA[salvo.colId]) return null;
    return { colId: salvo.colId, direction: salvo.direction === 'asc' ? 'asc' : 'desc' };
  } catch {
    return null;
  }
};

const getStageBadgeClass = (corToken: string) => `bg-${corToken} text-white`;

// Filtros do pipeline (etapa, vendedor, fabricante, marcador, período, atenção, importados) são
// espelhados na URL — sobrevivem a abrir/editar/fechar um negócio (volta via navigate(-1) restaura
// a mesma URL) e resetam sozinhos ao entrar na tela sem esses parâmetros (ex.: vindo do menu).
const parseListParam = (value: string | null): string[] => (value ? value.split(',').filter(Boolean) : []);

const parseDateParam = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
};

// Lê um array de ids salvo no sessionStorage (seleção de itens pra ação em massa) — nunca
// deixa um sessionStorage corrompido/de outra versão derrubar o mount da página.
const readIdsSessionStorage = (key: string): Set<string> => {
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return new Set();
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
};

// Lista de marcar com busca local, usada nos submenus de filtro que crescem: Fabricante (31
// representadas) e Marcador (16 hoje, e sobe a cada campanha nova). É o mesmo padrão que
// Clientes.tsx já usa nos cinco filtros dele — a caixa de rolagem mostra ~7 linhas por vez, então
// sem busca quem procura uma marca do fim do alfabeto rolava a lista inteira toda vez.
// Estado de busca interno e isolado por instância: o mesmo filtro aparece na tela e no modal de
// Ação em Massa, e digitar num não pode mexer no outro.
function FilterCheckboxList({
  options,
  selected,
  onToggle,
  emptyMessage = 'Nenhuma opção disponível.',
  searchPlaceholder = 'Buscar...',
}: {
  /** `selo`: texto curto mostrado à direita da opção (ex: "Inativa"). Não entra na busca
   *  nem na seleção — é só o aviso de por que aquela opção está no fim da lista. */
  options: { value: string; label: string; selo?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyMessage?: string;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const filteredOptions = term ? options.filter(o => o.label.toLowerCase().includes(term)) : options;

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
                {opt.selo && (
                  <span className="ml-auto shrink-0 rounded border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    {opt.selo}
                  </span>
                )}
              </label>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

const contactIcons: Record<string, typeof Mail> = { email: Mail, telefone: Phone, whatsapp: MessageSquare, visita: Eye };

type PageMode = 'pipeline' | 'negocios';
type PipelineView = 'kanban' | 'lista';
type LegacyView = 'pipeline' | 'lista';

interface NegociosProps {
  defaultView?: LegacyView;
}

const PedidoRow = memo(({
  pedido,
  selected,
  onToggle,
  onClick,
  visibleColumns,
  columns,
  KANBAN_STAGES,
  getLabel,
  stageLabel,
  temObras,
  qtdParticipantes,
  nomesDosParticipantes
}: {
  pedido: any,
  selected: boolean,
  onToggle: () => void,
  onClick: () => void,
  visibleColumns: string[],
  columns: any[],
  KANBAN_STAGES: any[],
  getLabel: (id: string) => string,
  stageLabel: (status: string) => string,
  // Vem por propriedade, e não de `useSecaoLigada` aqui dentro: esta linha é montada uma vez
  // por negócio da tabela, e a resposta é a mesma para todas — perguntar uma vez lá em cima
  // custa menos que espalhar o hook por dezenas de cópias do mesmo componente.
  temObras: boolean | undefined
  /**
   * Quantos responsáveis ALÉM do principal. Número e texto, e não a lista: `PedidoRow` é
   * memoizado, e um array novo a cada render desmontaria essa economia para todas as linhas.
   */
  qtdParticipantes: number,
  nomesDosParticipantes: string,
}) => {
  const camposExtras = pedido.campos_extras || {};
  const daysInStage = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 86400000);
  // "Fechamento" (ganho) e "Perdido" são etapas finais — negócio parado nelas não é um
  // alerta de estagnação, é o resultado esperado do funil.
  const isEtapaFinal = pedido.status === 'fechamento' || pedido.status === 'perdido';
  const isAlert = !isEtapaFinal && daysInStage >= 7;

  return (
    <TableRow className={`cursor-pointer hover:bg-muted/30 ${selected ? 'bg-primary/5' : ''}`} onClick={onClick}>
      <TableCell className="w-10 py-2 px-2.5" onClick={e => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Selecionar ${getNomeNegocio(pedido)}`} />
      </TableCell>
      {columns.filter(col => visibleColumns.includes(col.id)).map(col => {
        const colId = col.id;
        // Colunas padrão do sistema
        const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);

        // Coluna legada "pdf_url" (renomeada só no label para "Anexo", nunca no id)
        // — trata como alias de "anexo" para nunca ler o valor bruto de campos_extras.
        if (colId === 'pdf_url') {
          return (
            <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5" onClick={e => e.stopPropagation()}>
              {pedido.pdf_url ? (
                <LinkAnexoPrivado url={pedido.pdf_url} />
              ) : '—'}
            </TableCell>
          );
        }

        if (!isDefault) {
          // Busca o valor em camposExtras usando o ID da coluna ou o label (fallback)
          const value = camposExtras[colId] ?? camposExtras[getLabel(colId)];
          return (
            <TableCell key={colId} className="text-xs text-muted-foreground whitespace-nowrap py-2 px-2.5">
              {value || '—'}
            </TableCell>
          );
        }

        switch (colId) {
          case 'negocio':
            return (
              <TableCell key={colId} className="min-w-[200px] font-medium py-2 px-2.5 whitespace-nowrap">
                {getNomeNegocio(pedido)}
              </TableCell>
            );
          case 'cliente':
            return (
              <TableCell key={colId} className="min-w-[200px] font-medium py-2 px-2.5">
                <div className="space-y-1">
                  {isAlert && (
                    <div className="flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {daysInStage} dias nesta etapa
                    </div>
                  )}
                  {/* `truncate` + `title`: a coluna é fixada em 150px pelo colgroup (o min-w do
                      TableCell é ignorado em table-fixed), e a mediana dos nomes de cliente tem 33
                      caracteres. Antes o nome era cortado a seco, sem "…" e sem nenhuma forma de
                      ler o resto — dois clientes parecidos ficavam indistinguíveis. */}
                  <p className="truncate" title={pedido.cliente?.empresa ?? ''}>{pedido.cliente?.empresa ?? '-'}</p>
                </div>
              </TableCell>
            );
          case 'contato':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {camposExtras['Contato'] || '—'}
              </TableCell>
            );
          case 'anexo':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5" onClick={e => e.stopPropagation()}>
                {pedido.pdf_url ? (
                  <LinkAnexoPrivado url={pedido.pdf_url} />
                ) : '—'}
              </TableCell>
            );
          case 'endereco_entrega':
            // Esta coluna é meio endereço, meio obra: o endereço de entrega é texto livre do
            // próprio negócio (vem inclusive da importação de planilha) e não pertence à seção
            // Obras. Some só o "ou o nome da obra" — esconder a coluna inteira apagaria o
            // endereço de entrega junto, que é dado que a empresa tem com ou sem a seção.
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{pedido.endereco_entrega ?? (temObras === true ? pedido.obra?.nome_obra : null) ?? '-'}</TableCell>;
          case 'fabricante':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{pedido.fabricante?.nome ?? '-'}</TableCell>;
          case 'valor':
            return <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">{(pedido.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>;
          case 'etapa':
            const stage = KANBAN_STAGES.find(s => s.key === pedido.status);
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                <Badge className={`bg-${stage?.color || 'muted-foreground'} text-white`}>
                  {stageLabel(pedido.status)}
                </Badge>
              </TableCell>
            );
          case 'marcador':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.marcador ? (
                  <Badge className={`bg-${pedido.marcador.cor} text-white`}>{pedido.marcador.nome}</Badge>
                ) : '—'}
              </TableCell>
            );
          case 'vendedor':
            // O principal com "+N" ao lado, nunca uma coluna nova: coluna nova nasce visível
            // para a empresa inteira de uma vez (`mergeMissingDefaultColumns`), mexendo na
            // tela de quem não pediu nada.
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.vendedor?.nome ?? '-'}
                {qtdParticipantes > 0 && (
                  <span
                    className="ml-1.5 text-xs text-muted-foreground"
                    title={`Também responsáveis: ${nomesDosParticipantes}`}
                  >
                    +{qtdParticipantes}
                  </span>
                )}
              </TableCell>
            );
          case 'data_pedido':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.data_pedido
                  ? (() => {
                    const dateParts = pedido.data_pedido.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })()
                  : '—'}
              </TableCell>
            );
          case 'prazo_resposta':
            return (
              <TableCell key={colId} className="whitespace-nowrap py-2 px-2.5">
                {pedido.prazo_resposta
                  ? (() => {
                    const dateParts = pedido.prazo_resposta.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })()
                  : '—'}
              </TableCell>
            );
          case 'observacoes':
            return <TableCell key={colId} className="max-w-[300px] truncate py-2 px-2.5" title={pedido.observacoes}>{pedido.observacoes || '—'}</TableCell>;
          case 'acoes':
            return (
              <TableCell key={colId} className="py-2 px-2.5 text-center">
                <div className="flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClick} title="Visualizar e Editar">
                    <Eye className="h-4 w-4 text-primary" />
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
});

PedidoRow.displayName = 'PedidoRow';


const Negocios = ({ defaultView = 'pipeline' }: NegociosProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile, loading: isUserLoading } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const updateStatus = useUpdatePedidoStatus();
  const { data: vendedores } = useVendedores();
  const { data: fabricantes } = useFabricantes();

  // Funil ativo do Kanban/Lista — persistido, com fallback pro funil padrão da empresa
  // assim que a lista de funis carrega (ou se o funil salvo não existir mais).
  const { data: funis } = useFunis(empresaId);
  const [funilId, setFunilId] = useState<string | undefined>(
    () => localStorage.getItem('negocios_funil_id') || undefined
  );
  useEffect(() => {
    if (!funis || funis.length === 0) return;
    if (funilId && funis.some(f => f.id === funilId)) return;
    const padrao = funis.find(f => f.is_padrao) ?? funis[0];
    setFunilId(padrao.id);
  }, [funis, funilId]);
  useEffect(() => {
    if (funilId) localStorage.setItem('negocios_funil_id', funilId);
  }, [funilId]);

  const { data: kanbanColunas } = useKanbanColunas(empresaId, funilId);
  const { data: camposConfigPedidos } = useConfiguracoesCampos('pedidos', empresaId);

  const KANBAN_STAGES = useMemo(
    () => (kanbanColunas ?? []).map(c => ({ key: c.slug, label: c.nome, color: c.cor })),
    [kanbanColunas]
  );

  const [colunasDialogOpen, setColunasDialogOpen] = useState(false);
  const [marcadoresDialogOpen, setMarcadoresDialogOpen] = useState(false);
  const { data: marcadores } = useMarcadores(empresaId);

  // O efeito de limpeza total foi removido para permitir que novas colunas importadas apareçam nas opções.
  // No entanto, vamos garantir que colunas duplicadas sejam limpas se detectadas.
  useEffect(() => {
    const savedAll = localStorage.getItem('pedidos_all_columns');
    if (savedAll) {
      try {
        const parsed = JSON.parse(savedAll);
        const unique = Array.from(new Map(parsed.map((c: any) => [c.id, c])).values());
        if (unique.length !== parsed.length) {
          localStorage.setItem('pedidos_all_columns', JSON.stringify(unique));
          window.dispatchEvent(new Event('storage'));
        }
      } catch (e) {}
    }
  }, []);


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
  } = useTableSettings({
    key: 'pedidos',
    defaultColumns: PEDIDOS_COLUMNS,
    defaultVisibleColumns: PEDIDOS_DEFAULT_VISIBLE_COLUMNS,
  });

  // Corrige o rótulo legado da coluna de anexo ("Pdf da cotação" e variações), criada por
  // importações antigas antes do campo virar genérico — o padrão atual passou a ser "Anexo".
  useEffect(() => {
    if (columns.some(c => c.id === 'pdf_url') && getLabel('pdf_url') !== 'Anexo') {
      handleRename('pdf_url', 'Anexo');
    }
  }, [columns, getLabel, handleRename]);

  // Remove duas colunas-fantasma que ficam "presas" na configuração salva de qualquer empresa
  // que já tinha personalizado a tabela antes dessas mudanças (mergeMissingDefaultColumns só
  // ADICIONA colunas padrão novas, nunca remove as antigas que saíram da lista):
  // - "obra" (id literal, sem isCustom): era o id/rótulo padrão da coluna de endereço ANTES de
  //   virar "endereco_entrega"/"Obra/Endereço". Confirmado no banco (2026-08-11): nas 228 linhas
  //   onde campos_extras.obra tem valor, é sempre idêntico a endereco_entrega — 0 diferença, ou
  //   seja, é 100% redundante, nunca mostra informação que "Obra/Endereço" já não mostre.
  // - "Pdf da cotação" (isCustom: true): coluna extra criada pelo assistente de importação
  //   quando esse cabeçalho de planilha não batia com o campo canônico pdf_url/"Anexo" — as
  //   regras de reconhecimento atuais já cobrem esse cabeçalho (não deve mais acontecer em
  //   importações novas). Confirmado no banco: nenhum pedido tem valor real nela.
  useEffect(() => {
    if (columns.some(c => c.id === 'obra')) handleRemoveColumn('obra');
    if (columns.some(c => c.id === 'Pdf da cotação')) handleRemoveColumn('Pdf da cotação');
  }, [columns, handleRemoveColumn]);

  // Reage a mudanças no localStorage (ex.: importação adicionou novas colunas extras)
  useEffect(() => {
    const handler = () => {
      const savedVisible = localStorage.getItem('pedidos_visible_columns');
      if (savedVisible) {
        try { setVisibleColumns(JSON.parse(savedVisible)); } catch {}
      }
      
      const savedAll = localStorage.getItem('pedidos_all_columns');
      if (savedAll) {
        // O hook useTableSettings já deve estar atualizando o estado 'columns' 
        // mas este handler ajuda a manter a sincronia em diferentes abas ou disparos de eventos.
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [setVisibleColumns]);

  const tableVisibleColumns = visibleColumns;
  
  // Filtrar colunas duplicadas que podem ter vindo de importações antigas
  // Prioriza as colunas padrão do sistema se houver conflito de label
  const allAvailableColumns = useMemo(() => {
    const seen = new Set<string>();
    return columns.filter(col => {
      const label = (getLabel(col.id) || '').toLowerCase().trim();
      const isDefault = PEDIDOS_COLUMNS.some(d => d.id === col.id);
      
      if (isDefault) {
        seen.add(label);
        return true;
      }
      
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  }, [columns, getLabel]);

  const mode: PageMode = defaultView === 'lista' ? 'negocios' : 'pipeline';

  const [pipelineView, setPipelineView] = useState<PipelineView>(() => {
    const saved = localStorage.getItem('negocios_pipeline_view') as PipelineView | null;
    return saved === 'kanban' || saved === 'lista' ? saved : 'kanban';
  });

  const handlePipelineViewChange = (next: PipelineView) => {
    setPipelineView(next);
    localStorage.setItem('negocios_pipeline_view', next);
  };

  const showKanban = mode === 'pipeline' && pipelineView === 'kanban';
  const isPipelineMode = mode === 'pipeline';

  const [search, setSearch] = useState(() => localStorage.getItem('negocios_search') || '');
  // Debounce real (não só useDeferredValue): cada mudança em `deferredSearch` dispara queries ao
  // Supabase (resolução de busca + listagem + stats) — sem represar por um tempo sem digitar,
  // cada tecla vira uma rodada de requisições.
  const deferredSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);

  // Ordenação da Lista, lembrada entre visitas (do mesmo jeito que a busca e as larguras das
  // colunas já são). `null` = a ordem de sempre, os negócios mais recentes primeiro.
  const [ordenacao, setOrdenacao] = useState<OrdenacaoDaLista | null>(lerOrdenacaoSalva);

  const handleSort = useCallback((colId: string, direction: SortDirection) => {
    setOrdenacao({ colId, direction });
    localStorage.setItem(ORDENACAO_STORAGE_KEY, JSON.stringify({ colId, direction }));
    // Volta para a primeira página: a ordem mudou, então "página 7" passou a apontar para
    // outros negócios. Ficar na 7 depois de pedir "maior valor primeiro" mostraria o 61º ao 70º
    // maior valor, com cara de erro.
    setPage(1);
  }, []);

  // A ordenação que de fato vai ao servidor. Uma coluna escondida em "Colunas" deixa de valer:
  // senão a lista continuaria ordenada por algo que não está mais na tela, sem nenhum cabeçalho
  // marcado explicando o porquê da ordem.
  const sortDaLista: PedidosSort | undefined = useMemo(() => {
    if (!ordenacao) return undefined;
    const alvo = ORDENACAO_DA_LISTA[ordenacao.colId];
    if (!alvo || !tableVisibleColumns.includes(ordenacao.colId)) return undefined;
    return { column: alvo.coluna, ascending: ordenacao.direction === 'asc' };
  }, [ordenacao, tableVisibleColumns]);

  // Esconder em "Colunas" a coluna que está ordenando derruba a ordenação — e a
  // lista inteira se reorganiza. Sem voltar para a primeira página, quem estava
  // na página 7 continua na 7 de uma lista que virou outra, olhando negócios sem
  // relação nenhuma com o que estava na tela. O `handleSort` já reseta quando a
  // troca é pelo cabeçalho; esta é a outra porta para o mesmo estado.
  useEffect(() => {
    setPage(1);
  }, [sortDaLista?.column, sortDaLista?.ascending]);

  const [importOpen, setImportOpen] = useState(false);
  const [importDialogMounted, setImportDialogMounted] = useState(false);
  const [importAiOpen, setImportAiOpen] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>(() => parseListParam(searchParams.get('stages')));
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  // `?negocio=<id>` abre o painel de visualização já na chegada. É como a tela "Hoje"
  // manda a pessoa para um negócio: ela quer VER o negócio, não editá-lo — mandar para
  // /pedidos/:id/editar abre um formulário para quem só queria olhar.
  const [viewOrderId, setViewOrderId] = useState<string | null>(() => searchParams.get('negocio'));
  const { data: contatos } = useHistoricoContatos(selectedOrder || viewOrderId);
  const { data: tarefasNegocio } = useTarefasPorPedido(viewOrderId);
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  // `=== true` em todo uso abaixo, nunca `!== false`: enquanto a resposta não chega, a cascata
  // esconde. Bloco que aparece e some meio segundo depois é pior de usar que bloco que demora.
  const { ligada: temObras } = useSecaoLigada('obras');
  // Só o texto de dica das caixas de busca. A busca em si continua igual, inclusive casando
  // negócio pelo nome da obra — isso é invisível para quem usa (o resultado é sempre um
  // negócio, nunca uma obra), e estreitar a consulta era mexer onde já houve problema de
  // desempenho (CLAUDE.md §7.4). O que muda é só parar de oferecer uma palavra que, sem a
  // seção, não quer dizer nada para a empresa.
  const placeholderBuscaNegocios = temObras === true
    ? 'Buscar por cliente, obra ou fabricante...'
    : 'Buscar por cliente ou fabricante...';
  const { data: historicoStatusNegocio } = usePedidoHistoricoStatus(viewOrderId);
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = useMemo(
    () => tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome })),
    [tarefasKanbanColunas]
  );
  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [editingTarefaNegocio, setEditingTarefaNegocio] = useState<Tarefa | null>(null);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTargetId, setExportTargetId] = useState<string | undefined>(undefined);
  // Exportação em andamento: trava um segundo clique enquanto a varredura do funil roda.
  const [exportando, setExportando] = useState(false);
  // Confirmação que aparece só quando o recorte é grande — ver PEDIDOS_EXPORTACAO_AVISO.
  const [confirmExportOpen, setConfirmExportOpen] = useState(false);

  const [selectedVendedores, setSelectedVendedores] = useState<string[]>(() => parseListParam(searchParams.get('vendedores')));
  const [selectedFabricantes, setSelectedFabricantes] = useState<string[]>(() => parseListParam(searchParams.get('fabricantes')));
  const [selectedMarcadores, setSelectedMarcadores] = useState<string[]>(() => parseListParam(searchParams.get('marcadores')));
  const [showOnlyAttention, setShowOnlyAttention] = useState(() => searchParams.get('atencao') === '1');
  const [hideImportados, setHideImportados] = useState(() => searchParams.get('ocultar_importados') === '1');
  // Por padrão, o filtro de Período já entra selecionado no mês atual — "Limpar filtros"
  // continua zerando pra nenhum período (ver clearPipelineFilters), esse default e' só o
  // estado inicial ao abrir a aba. Se a URL já traz "data_de"/"data_ate" (mesmo vazios, porque
  // o usuário limpou o período antes de editar um negócio), essa escolha explícita prevalece
  // sobre o padrão do mês atual.
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => (
    searchParams.has('data_de') ? parseDateParam(searchParams.get('data_de')) : startOfMonth(new Date())
  ));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => (
    searchParams.has('data_ate') ? parseDateParam(searchParams.get('data_ate')) : endOfMonth(new Date())
  ));
  // Qual data o período acima filtra: criação do negócio (default) ou fechamento —
  // ver PeriodoDateField em use-pedidos.ts.
  //
  // 'fechado_em' é aceito por compatibilidade: era o valor antigo deste parâmetro, e
  // links salvos ou abas abertas antes da mudança ainda o carregam. Cai no mesmo lugar.
  const [dateField, setDateField] = useState<PeriodoDateField>(() => {
    const doUrl = searchParams.get('data_campo');
    return doUrl === 'prazo_resposta' || doUrl === 'fechado_em' ? 'prazo_resposta' : 'data_pedido';
  });

  // Sobrevive a editar um negócio e voltar (navigate(-1) desmonta esta página) — sem isso, a
  // seleção pra ação em massa sempre sumia depois de abrir/editar um item específico. sessionStorage
  // (não localStorage) de propósito: é estado de trabalho da aba atual, não deveria sobreviver
  // a fechar o navegador e reabrir dias depois com esses ids possivelmente já obsoletos.
  const [selected, setSelected] = useState<Set<string>>(() => readIdsSessionStorage('negocios_selected'));
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Move de kanban bloqueado por campo obrigatório na etapa de destino ainda não preenchido.
  const [blockedMove, setBlockedMove] = useState<{ pedidoId: string; targetLabel: string; missingLabels: string[] } | null>(null);
  const [deleteAllFilteredMode, setDeleteAllFilteredMode] = useState(
    () => sessionStorage.getItem('negocios_delete_all_filtered') === '1',
  );
  // Ids excluídos manualmente enquanto deleteAllFilteredMode está ativo — sem isso, desmarcar
  // um único item (numa página que não carrega os N ids filtrados no cliente) derrubava o modo
  // "todos" inteiro e caía pra seleção da página atual, mostrando "excluir 9" em vez de "excluir 99".
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => readIdsSessionStorage('negocios_excluded_ids'));
  // Em QUAL filtro a seleção "todos os filtrados" nasceu. Sem isto, o número do
  // botão e o que o servidor apaga divergiam: o botão subtrai TODAS as exceções
  // (`totalCount - excludedIds.size`), mas o servidor só desconta as que caem
  // dentro do filtro vigente. Medido: com 10 exceções criadas sem filtro e depois
  // um filtro de fabricante, o botão prometia "Excluir 1.574" e o banco apagava
  // 1.584 — sempre para MAIS, nunca para menos.
  const [filtroDaSelecao, setFiltroDaSelecao] = useState<string | null>(
    () => sessionStorage.getItem('negocios_selecao_filtro'),
  );

  useEffect(() => {
    if (selected.size > 0) sessionStorage.setItem('negocios_selected', JSON.stringify(Array.from(selected)));
    else sessionStorage.removeItem('negocios_selected');
  }, [selected]);
  useEffect(() => {
    if (excludedIds.size > 0) sessionStorage.setItem('negocios_excluded_ids', JSON.stringify(Array.from(excludedIds)));
    else sessionStorage.removeItem('negocios_excluded_ids');
  }, [excludedIds]);
  useEffect(() => {
    if (deleteAllFilteredMode) sessionStorage.setItem('negocios_delete_all_filtered', '1');
    else sessionStorage.removeItem('negocios_delete_all_filtered');
  }, [deleteAllFilteredMode]);
  useEffect(() => {
    if (filtroDaSelecao) sessionStorage.setItem('negocios_selecao_filtro', filtroDaSelecao);
    else sessionStorage.removeItem('negocios_selecao_filtro');
  }, [filtroDaSelecao]);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [selectAllDialogOpen, setSelectAllDialogOpen] = useState(false);
  const [desmarcarDialogOpen, setDesmarcarDialogOpen] = useState(false);
  const bulkDeleteMutation = useBulkDeletePedidos();
  // Espelho da política de DELETE do banco (gestor OU `pode_excluir` nas Configurações).
  // Não protege nada — quem recusa é o Postgres. Serve para não oferecer um caminho que
  // termina em nada: sem isto, quem não pode apagar digita APAGAR e a tela fica igual.
  const { permitido: podeExcluir } = useMinhaPermissao('pedidos', 'excluir');
  const { permitido: podeEditar } = useMinhaPermissao('pedidos', 'editar');
  // Os participantes de todos os negócios visíveis, num mapa. Uma consulta só para a tela
  // inteira — o porquê (e os números medidos) está em use-participantes-dos-negocios.ts.
  const { data: participantesPorNegocio } = useParticipantesDosNegocios();
  const isDeleting = bulkDeleteMutation.isPending;

  // Ação em massa (etapa + marcador num só bloco): o alvo é somente o que o usuário marcar no
  // checklist do próprio modal (`bulkSelected`) — os filtros da tela só definem quais negócios
  // aparecem disponíveis para escolha, não quais recebem a alteração. Guarda nome/etapa junto do id
  // (não só o id) para o painel "Selecionados" continuar mostrando o item mesmo depois de o usuário
  // trocar de página no picker (a página anterior não fica mais carregada em memória).
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Map<string, { nome: string; status: string }>>(new Map());
  // Modo "todos os filtrados" DENTRO do modal de Ação em massa: em vez de milhares de ids no
  // navegador, guarda "está tudo marcado" + a lista de EXCEÇÕES, e o UPDATE roda no servidor com
  // o mesmo recorte do picker (mesma mecânica do "Todos (N)" da lista de Negócios). O checkbox do
  // cabeçalho da tabela pergunta qual dos dois o usuário quer.
  const [bulkPickerTodosFiltrados, setBulkPickerTodosFiltrados] = useState(false);
  const [bulkPickerExcluidos, setBulkPickerExcluidos] = useState<Set<string>>(new Set());
  // Referência do `bulkPickerFilters` (useMemo) no instante em que "Todos" foi escolhido —
  // serve pro useEffect abaixo perceber quando o filtro mudou e a seleção ficou órfã.
  const [bulkFiltroDaSelecao, setBulkFiltroDaSelecao] = useState<PedidosFilters | null>(null);
  const [bulkSelectAllDialogOpen, setBulkSelectAllDialogOpen] = useState(false);
  const [bulkDesmarcarDialogOpen, setBulkDesmarcarDialogOpen] = useState(false);
  const [bulkPickerPage, setBulkPickerPage] = useState(1);
  const [bulkPickerPageSize, setBulkPickerPageSize] = useState(10);
  // Busca própria do picker do modal — independente dos filtros ativos na tela (etapa, vendedor,
  // fabricante, marcador, período etc.): o modal parte do funil atual com TODOS os negócios dele,
  // e só a busca digitada aqui restringe a lista.
  const [bulkPickerSearch, setBulkPickerSearch] = useState('');
  const deferredBulkPickerSearch = useDeferredValue(bulkPickerSearch);
  // Filtros próprios do picker (etapa, marcador, responsável, período) — mesma lógica
  // multi-seleção dos filtros da tela (toggleFilter), mas com estado isolado: restringem só a
  // lista de negócios disponíveis para escolha dentro do modal, sem interferir nos filtros
  // ativos da tela.
  const [bulkPickerStages, setBulkPickerStages] = useState<string[]>([]);
  const [bulkPickerVendedorIds, setBulkPickerVendedorIds] = useState<string[]>([]);
  const [bulkPickerMarcadorIds, setBulkPickerMarcadorIds] = useState<string[]>([]);
  const [bulkPickerDateFrom, setBulkPickerDateFrom] = useState<Date | undefined>(undefined);
  const [bulkPickerDateTo, setBulkPickerDateTo] = useState<Date | undefined>(undefined);
  const [bulkPickerDateField, setBulkPickerDateField] = useState<PeriodoDateField>('data_pedido');
  const handleBulkPickerDateFromSelect = (date: Date | undefined) => {
    setBulkPickerDateFrom(date);
    if (date && bulkPickerDateTo && date > bulkPickerDateTo) setBulkPickerDateTo(date);
    setBulkPickerPage(1);
  };
  const handleBulkPickerDateToSelect = (date: Date | undefined) => {
    setBulkPickerDateTo(date);
    if (date && bulkPickerDateFrom && date < bulkPickerDateFrom) setBulkPickerDateFrom(date);
    setBulkPickerPage(1);
  };
  const [bulkApplyStatus, setBulkApplyStatus] = useState(false);
  const [bulkApplyMarcador, setBulkApplyMarcador] = useState(false);
  const [bulkApplyVendedor, setBulkApplyVendedor] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');
  const [bulkNewMarcadorId, setBulkNewMarcadorId] = useState('');
  const [bulkNewVendedorId, setBulkNewVendedorId] = useState('');
  const bulkUpdateMutation = useBulkUpdatePedidos();
  const isBulkUpdating = bulkUpdateMutation.isPending;

  // Column settings are now managed by useTableSettings hook


  const [visibleKanbanStages, setVisibleKanbanStages] = useState<string[]>(() => {
    if (!funilId) return [];
    const saved = localStorage.getItem(`pedidos_kanban_stages_${funilId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Ao trocar de funil, as etapas visíveis/filtradas do funil anterior não existem mais
  // neste board — reseta em vez de herdar (o efeito de sincronia com kanbanColunas, logo
  // abaixo, repopula a partir do localStorage específico deste funil). A etapa filtrada
  // (selectedStages) só é resetada numa troca de funil DE FATO durante a sessão — não na
  // primeira definição do funil ao montar a tela, senão o filtro restaurado da URL (ver
  // useSearchParams acima) seria descartado assim que o funil padrão termina de resolver.
  const previousFunilIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!funilId) return;
    const saved = localStorage.getItem(`pedidos_kanban_stages_${funilId}`);
    setVisibleKanbanStages(saved ? JSON.parse(saved) : []);

    const isRealFunilChange = previousFunilIdRef.current !== undefined && previousFunilIdRef.current !== funilId;
    previousFunilIdRef.current = funilId;
    if (isRealFunilChange) setSelectedStages([]);
  }, [funilId]);

  // Todos os useState declarados — agora seguro referenciar selectedStages no hook
  // Kanban: cada coluna busca só o seu status, com seu próprio limit (ver KanbanColumn.tsx).
  // "Exibir" só define o limit INICIAL/por-clique de cada coluna — não existe mais um
  // fetch único compartilhado para o board inteiro.
  const KANBAN_PAGE_SIZE_OPTIONS = [10, 50, 100];
  const [kanbanPageSize, setKanbanPageSize] = useState(50);

  const activeStages = selectedStages.length > 0 ? selectedStages : undefined;
  const pedidosFilters: PedidosFilters = useMemo(() => ({
    vendedorIds: selectedVendedores.length > 0 ? selectedVendedores : undefined,
    fabricanteIds: selectedFabricantes.length > 0 ? selectedFabricantes : undefined,
    marcadorIds: selectedMarcadores.length > 0 ? selectedMarcadores : undefined,
    dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
    dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
    dateField,
    onlyAttention: showOnlyAttention || undefined,
    // Usada tanto pela query de stats (header) quanto pelo fetch paginado da lista/kanban —
    // ambos aplicam o mesmo filtro no servidor, então total/páginas e linhas exibidas ficam consistentes.
    search: deferredSearch.trim() || undefined,
    // Também enviado pra usePedidosStats — sem isso, o total/paginação do cabeçalho continuava
    // contando negócios importados mesmo com a lista escondendo-os, podendo mostrar "N negócios"
    // com a tabela vazia quando todos os resultados eram importados.
    hideImportados: hideImportados || undefined,
    funilId,
  }), [selectedVendedores, selectedFabricantes, selectedMarcadores, dateFrom, dateTo, dateField, showOnlyAttention, deferredSearch, hideImportados, funilId]);

  // Identidade do recorte atual. É o que a exclusão em massa manda ao servidor
  // (`activeStages` + `pedidosFilters`), então é exatamente isto que precisa ter
  // ficado igual para a seleção "todos os filtrados" continuar significando o que
  // o usuário escolheu.
  const assinaturaDoFiltro = useMemo(
    () => JSON.stringify([empresaId ?? null, activeStages ?? null, pedidosFilters]),
    [empresaId, activeStages, pedidosFilters],
  );

  // Resolve o termo de busca (ids de cliente/fabricante/obra que casam) UMA VEZ aqui, e repassa
  // pronto pra cada KanbanColumn — sem isso, cada coluna do board refaria os mesmos 3 ILIKEs por
  // conta própria (ver useSearchMatches em use-pedidos.ts). Enquanto um termo novo ainda está
  // sendo resolvido, as colunas seguram a busca própria (mantêm as linhas antigas visíveis via
  // placeholderData) em vez de resolver cada uma por si.
  const searchMatchesQuery = useSearchMatches(pedidosFilters.search);
  const kanbanSearchPending = !!pedidosFilters.search && searchMatchesQuery.isLoading;

  // Essa query só serve a view Lista agora — desabilitada no Kanban, já que cada coluna
  // busca seus próprios dados de forma independente.
  const { data: pedidosData, isLoading: isPedidosLoading, isFetching: isPedidosFetching } = usePedidos(
    empresaId,
    page - 1,
    pageSize,
    activeStages,
    pedidosFilters,
    !showKanban,
    // withCount / resolvedSearchMatches ficam no padrão; só existem aqui porque `sort` vem
    // depois deles na assinatura. O Kanban NÃO recebe ordenação: cada coluna do board tem a
    // ordem dela e não tem cabeçalho onde clicar.
    false,
    undefined,
    sortDaLista,
  );
  const { data: pedidosStats, isFetching: isStatsFetching } = usePedidosStats(empresaId, activeStages, pedidosFilters);

  // Picker do modal de Ação em Massa: ignora os filtros ativos na tela (fabricante, período,
  // atenção, importados, busca da página) de propósito — o modal por padrão alcança qualquer
  // negócio do funil atual, não só o recorte filtrado que está sendo visualizado no momento.
  // Etapa/marcador/responsável/período têm filtro próprio (bulkPickerStages/VendedorIds/
  // MarcadorIds/DateFrom/DateTo), isolado dos filtros da tela, só para facilitar achar negócios
  // dentro do picker. Mantém o funil porque "Nova etapa" usa as colunas desse funil específico
  // (`KANBAN_STAGES`), então misturar negócios de outro funil não faria sentido ali.
  const bulkPickerFilters: PedidosFilters = useMemo(() => ({
    funilId,
    search: deferredBulkPickerSearch.trim() || undefined,
    stages: bulkPickerStages.length > 0 ? bulkPickerStages : undefined,
    vendedorIds: bulkPickerVendedorIds.length > 0 ? bulkPickerVendedorIds : undefined,
    marcadorIds: bulkPickerMarcadorIds.length > 0 ? bulkPickerMarcadorIds : undefined,
    dateFrom: bulkPickerDateFrom ? format(bulkPickerDateFrom, 'yyyy-MM-dd') : undefined,
    dateTo: bulkPickerDateTo ? format(bulkPickerDateTo, 'yyyy-MM-dd') : undefined,
    dateField: bulkPickerDateField,
  }), [funilId, deferredBulkPickerSearch, bulkPickerStages, bulkPickerVendedorIds, bulkPickerMarcadorIds, bulkPickerDateFrom, bulkPickerDateTo, bulkPickerDateField]);
  // `isLoading` (não `isFetching`) pro spinner de bloqueio: com `placeholderData: keepPreviousData`
  // (ver usePedidos), trocar de página/busca já mantém a página anterior visível instantaneamente
  // enquanto busca a próxima — usar isFetching aqui apagava a tabela inteira a cada clique de
  // paginação, mesmo com os dados já em cache, dando a impressão de estar lento.
  // A ETAPA entra pelo argumento posicional `stages`, não por `bulkPickerFilters.stages`:
  // `montarQueryDeNegocios` e `usePedidosStats` só leem o parâmetro dedicado e ignoram o campo
  // `stages` de dentro de `filters` — passá-lo só no filtro deixava o recorte por etapa sem efeito
  // nenhum na lista e na contagem do picker.
  const { data: bulkPickerData, isLoading: isBulkPickerLoading, isFetching: isBulkPickerFetching } = usePedidos(
    empresaId,
    bulkPickerPage - 1,
    bulkPickerPageSize,
    bulkPickerFilters.stages,
    bulkPickerFilters,
    bulkEditOpen,
  );
  const { data: bulkPickerStats } = usePedidosStats(empresaId, bulkPickerFilters.stages, bulkPickerFilters, bulkEditOpen);
  const bulkPickerTotalCount = bulkPickerStats?.count ?? 0;
  const isLoading = isUserLoading || (!showKanban && isPedidosLoading);
  // Com `placeholderData: keepPreviousData`, trocar de página/filtro/busca mantém o conteúdo
  // anterior visível sem acionar `isLoading` de novo — sem isso o usuário não tinha nenhum
  // sinal de que uma nova busca já estava em andamento no servidor.
  const isRefetching = !isLoading && (isPedidosFetching || isStatsFetching);
  // A busca ficou rápida o bastante (debounce + índices) pra a maioria das buscas terminar em
  // poucas dezenas/centenas de ms — sem esse atraso, o ícone de carregamento da barra de busca
  // acendia e apagava quase instantaneamente a cada pausa na digitação, parecendo "piscar". Só
  // mostra o ícone se ainda estiver buscando depois de 200ms; assim que termina, some na hora.
  const showSearchLoading = useDelayedLoading(isRefetching, 200);
  const pedidos = useMemo(() => pedidosData?.data ?? [], [pedidosData]);
  const totalCount = pedidosStats?.count ?? 0;
  const totalValor = pedidosStats?.valor ?? 0;
  const bulkPickerTotalPages = Math.max(1, Math.ceil(bulkPickerTotalCount / bulkPickerPageSize));

  // ── Checkbox "selecionar todos" no cabeçalho da tabela de Ação em massa ──────────────────
  // Dois modos, iguais aos da lista de Negócios (ver src/lib/selecao-em-massa.ts):
  //  • normal: cada negócio marcado é um id em `bulkSelected`.
  //  • "todos os filtrados": `bulkPickerTodosFiltrados` + `bulkPickerExcluidos` (exceções).
  const bulkPickerPagina = bulkPickerData?.data ?? [];
  const bulkSelecionadosNaPagina = bulkPickerTodosFiltrados
    ? bulkPickerPagina.filter(p => !bulkPickerExcluidos.has(p.id)).length
    : bulkPickerPagina.filter(p => bulkSelected.has(p.id)).length;
  const bulkPaginaTodaSelecionada =
    bulkPickerPagina.length > 0 && bulkSelecionadosNaPagina === bulkPickerPagina.length;
  // Quantos negócios o "Aplicar" vai atingir: no modo por filtro é o total do recorte menos as
  // exceções; no modo normal é o tamanho da lista marcada.
  const bulkApplyCount = bulkPickerTodosFiltrados
    ? Math.max(0, bulkPickerTotalCount - bulkPickerExcluidos.size)
    : bulkSelected.size;

  // "Todos os filtrados" é DEFINIDO pelo recorte do picker; se o filtro muda depois de escolher
  // "Todos", o conjunto vira outro que ninguém pediu — zera o modo pra não aplicar no alvo errado
  // (mesma proteção do useEffect equivalente da lista). `bulkPickerFilters` é um useMemo, então a
  // referência guardada só difere quando algum filtro do picker realmente mudou.
  useEffect(() => {
    if (!bulkPickerTodosFiltrados) return;
    if (bulkFiltroDaSelecao === bulkPickerFilters) return;
    setBulkPickerTodosFiltrados(false);
    setBulkPickerExcluidos(new Set());
    setBulkFiltroDaSelecao(null);
    toast.info('A seleção "Todos" foi limpa porque o filtro do modal mudou.');
  }, [bulkPickerFilters, bulkPickerTodosFiltrados, bulkFiltroDaSelecao]);

  const bulkLimparSelecao = () => {
    setBulkSelected(new Map());
    setBulkPickerExcluidos(new Set());
    setBulkPickerTodosFiltrados(false);
    setBulkFiltroDaSelecao(null);
  };
  const bulkMarcarPaginaIds = () => {
    if (bulkPickerTodosFiltrados) {
      setBulkPickerExcluidos(prev => {
        const next = new Set(prev);
        bulkPickerPagina.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setBulkSelected(prev => {
        const next = new Map(prev);
        bulkPickerPagina.forEach(p => next.set(p.id, { nome: getNomeNegocio(p), status: p.status }));
        return next;
      });
    }
  };
  const bulkSelecionarPaginaSomente = () => {
    setBulkPickerTodosFiltrados(false);
    setBulkPickerExcluidos(new Set());
    setBulkFiltroDaSelecao(null);
    setBulkSelected(prev => {
      const next = new Map(prev);
      bulkPickerPagina.forEach(p => next.set(p.id, { nome: getNomeNegocio(p), status: p.status }));
      return next;
    });
    setBulkSelectAllDialogOpen(false);
  };
  const bulkSelecionarTodosFiltrados = () => {
    setBulkSelected(new Map());
    setBulkPickerExcluidos(new Set());
    setBulkPickerTodosFiltrados(true);
    setBulkFiltroDaSelecao(bulkPickerFilters);
    setBulkSelectAllDialogOpen(false);
  };
  const bulkDesmarcarPaginaSomente = () => {
    if (bulkPickerTodosFiltrados) {
      setBulkPickerExcluidos(prev => {
        const next = new Set(prev);
        bulkPickerPagina.forEach(p => next.add(p.id));
        return next;
      });
    } else {
      setBulkSelected(prev => {
        const next = new Map(prev);
        bulkPickerPagina.forEach(p => next.delete(p.id));
        return next;
      });
    }
    setBulkDesmarcarDialogOpen(false);
  };
  const bulkLimparSelecaoPeloDialogo = () => {
    bulkLimparSelecao();
    setBulkDesmarcarDialogOpen(false);
  };

  // Mesma decisão de SETE resultados travada por teste em src/lib/selecao-em-massa.ts.
  const bulkToggleTodos = () => {
    const acao = acaoDaCaixaDoCabecalho({
      modoTodosFiltrados: bulkPickerTodosFiltrados,
      paginaInteiraSelecionada: bulkPaginaTodaSelecionada,
      totalConhecido: bulkPickerStats !== undefined,
      totalFiltrado: bulkPickerTotalCount,
      itensNaPagina: bulkPickerPagina.length,
      selecionadosNaPagina: bulkSelecionadosNaPagina,
      selecionadosNoTotal: bulkApplyCount,
    });
    switch (acao) {
      case 'nada':
        return;
      case 'limpar-tudo':
        bulkLimparSelecao();
        return;
      case 'perguntar-desmarcar':
        setBulkDesmarcarDialogOpen(true);
        return;
      case 'reincluir-pagina':
        setBulkPickerExcluidos(prev => {
          const next = new Set(prev);
          bulkPickerPagina.forEach(p => next.delete(p.id));
          return next;
        });
        return;
      case 'desmarcar-pagina':
        setBulkSelected(prev => {
          const next = new Map(prev);
          bulkPickerPagina.forEach(p => next.delete(p.id));
          return next;
        });
        return;
      case 'marcar-pagina':
        setBulkSelected(prev => {
          const next = new Map(prev);
          bulkPickerPagina.forEach(p => next.set(p.id, { nome: getNomeNegocio(p), status: p.status }));
          return next;
        });
        return;
      case 'perguntar-marcar':
        setBulkSelectAllDialogOpen(true);
        return;
    }
  };

  useEffect(() => {
    if (!kanbanColunas || !funilId) return;
    const storageKey = `pedidos_kanban_stages_${funilId}`;
    const allKeys = kanbanColunas.map(c => c.slug);
    setVisibleKanbanStages(prev => {
      const filtered = prev.filter(k => allKeys.includes(k));
      const novas = allKeys.filter(k => !prev.includes(k));
      if (prev.length === 0) {
        localStorage.setItem(storageKey, JSON.stringify(allKeys));
        return allKeys;
      }
      const next = [...filtered, ...novas];
      if (next.length !== prev.length || next.some((k, i) => k !== prev[i])) {
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [kanbanColunas, funilId]);

  const handleKanbanStagesChange = (next: string[]) => {
    setVisibleKanbanStages(next);
    if (funilId) localStorage.setItem(`pedidos_kanban_stages_${funilId}`, JSON.stringify(next));
  };

  const toggleAllKanbanStages = () => {
    if (visibleKanbanStages.length >= KANBAN_STAGES.length && KANBAN_STAGES.length > 0) {
      handleKanbanStagesChange([KANBAN_STAGES[0].key]);
    } else {
      handleKanbanStagesChange(KANBAN_STAGES.map(s => s.key));
    }
  };

  const toggleKanbanStage = (key: string) => {
    if (visibleKanbanStages.includes(key)) {
      if (visibleKanbanStages.length > 1) {
        handleKanbanStagesChange(visibleKanbanStages.filter(k => k !== key));
      }
    } else {
      const next = KANBAN_STAGES.filter(s => visibleKanbanStages.includes(s.key) || s.key === key).map(s => s.key);
      handleKanbanStagesChange(next);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    
    if (value.trim() && showKanban) {
      const query = value.trim().toLowerCase();
      const firstMatch = pipelineOrders.find(o =>
        (o.nomeNegocio || '').toLowerCase().includes(query) ||
        (o.obra || '').toLowerCase().includes(query) ||
        (o.fabricante || '').toLowerCase().includes(query)
      );
      
      if (firstMatch) {
        setTimeout(() => {
          const element = document.getElementById(`kanban-card-${firstMatch.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
            }, 3000);
          }
        }, 100);
      }
    }
  };

  // Função substituída pela seleção múltipla de etapas, o reset de página é gerenciado pelo useEffect ou quando clica.

  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || (key || '');
  const stageColorToken = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.color || 'muted-foreground';

  // Removido useEffect que forçava a substituição das colunas individuais pela coluna "negocio"
  // para permitir que o usuário escolha ver as colunas separadamente.

  // `pedidos` já vem do servidor paginado e filtrado por TODOS os critérios (vendedor,
  // fabricante, marcador, etapa, atenção, data, busca, importados) através dos mesmos
  // `pedidosFilters`/`activeStages` usados por usePedidosStats — reaplicar esses filtros aqui
  // no cliente é redundante e, pior, arriscava divergir do total/paginação do rodapé (o próprio
  // bug reportado: rodapé contando N negócios com a tabela mostrando outra coisa). O rodapé
  // (totalCount/totalPages) e as linhas exibidas (`filtered`) agora vêm sempre da mesma fonte.
  const filtered = pedidos;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginated = filtered;
  const visibleColumnCount = Math.max(
    1,
    tableVisibleColumns.filter(id => id !== 'acoes').length + (tableVisibleColumns.includes('acoes') ? 2 : 0) + 1
  );

  // Larguras resolvidas (persistida ou padrão) na MESMA ordem das colunas visíveis — usadas
  // tanto no <colgroup> quanto nos cabeçalhos, pra nunca ficarem dessincronizadas. A tabela
  // precisa de uma largura própria explícita (não w-full/auto) + colgroup: sem isso o navegador
  // redistribui/ajusta as larguras de coluna proporcionalmente ao redimensionar, ignorando o
  // valor exato escolhido pelo usuário (comportamento de table-layout:fixed com largura automática).
  const CHECKBOX_COL_WIDTH = 40;
  const visibleColumnDefs = columns.filter(col => tableVisibleColumns.includes(col.id));
  const resolvedColWidths = visibleColumnDefs.map(col => columnWidths[col.id] ?? (col.id === 'acoes' ? 80 : 150));
  const tableTotalWidth = CHECKBOX_COL_WIDTH + resolvedColWidths.reduce((a, b) => a + b, 0);

  // Largura visível (viewport) da área da tabela — usada pra manter o texto de "nenhum
  // resultado" centralizado na parte visível quando a tabela é mais larga que o container
  // e tem scroll horizontal (senão o texto centraliza na largura total da tabela, não na tela).
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  useEffect(() => {
    const el = tableViewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTableViewportWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem('negocios_search', search);
  }, [search]);

  // Volta para a primeira página da Lista quando filtros mudam (o Kanban reseta o próprio
  // lote de cada coluna sozinho, dentro do KanbanColumn, ao ver os filtros mudarem).
  useEffect(() => {
    setPage(1);
  }, [empresaId, deferredSearch, selectedStages, selectedVendedores, selectedFabricantes, selectedMarcadores, showOnlyAttention, hideImportados, dateFrom, dateTo, dateField]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Cada KanbanColumn busca só o seu próprio status (ver KanbanColumn.tsx) — os filtros de
  // vendedor/fabricante/período/atenção/busca já são aplicados lá (server-side, exceto a busca
  // livre que é client-side). Este estado só agrega o que cada coluna já buscou, para as
  // funções que precisam do pipeline inteiro: rolar até um card ao buscar e exportar PDF.
  const [kanbanPedidosByStage, setKanbanPedidosByStage] = useState<Record<string, PedidoWithRelations[]>>({});
  const handleKanbanColumnData = useCallback((stageKey: string, rows: PedidoWithRelations[]) => {
    setKanbanPedidosByStage(prev => (prev[stageKey] === rows ? prev : { ...prev, [stageKey]: rows }));
  }, []);
  const kanbanPedidosFlat = useMemo(
    () => Object.values(kanbanPedidosByStage).flat(),
    [kanbanPedidosByStage]
  );
  const pipelineOrders = useMemo(
    () => kanbanPedidosFlat.map(p => {
      const extras = participantesPorNegocio?.get(p.id) ?? [];
      return {
        ...mapPedidoToOrder(p),
        qtdParticipantes: extras.length,
        nomesDosParticipantes: extras.map(r => r.nome).join(', '),
      };
    }),
    [kanbanPedidosFlat, participantesPorNegocio]
  );

  const hasPipelineFilters = selectedVendedores.length > 0 || selectedFabricantes.length > 0 || selectedMarcadores.length > 0 || showOnlyAttention || hideImportados || !!dateFrom || !!dateTo || selectedStages.length > 0;
  const activeFilterCount = (selectedVendedores.length > 0 ? 1 : 0) + (selectedFabricantes.length > 0 ? 1 : 0) + (selectedMarcadores.length > 0 ? 1 : 0) + (showOnlyAttention ? 1 : 0) + (hideImportados ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (selectedStages.length > 0 ? 1 : 0);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const clearPipelineFilters = () => {
    setSelectedVendedores([]);
    setSelectedFabricantes([]);
    setSelectedMarcadores([]);
    setShowOnlyAttention(false);
    setHideImportados(false);
    setDateFrom(undefined);
    setDateTo(undefined);
    setDateField('data_pedido');
    setSelectedStages([]);
  };

  // Evita um intervalo invertido (Data Início > Data Fim), que zeraria os resultados em silêncio
  // (gte/lte incompatíveis) sem nenhum feedback pro usuário — empurra a outra ponta junto.
  const handleDateFromSelect = (date: Date | undefined) => {
    setDateFrom(date);
    if (date && dateTo && date > dateTo) setDateTo(date);
  };
  const handleDateToSelect = (date: Date | undefined) => {
    setDateTo(date);
    if (date && dateFrom && date < dateFrom) setDateFrom(date);
  };

  // Espelha os filtros ativos na URL (replace, sem empilhar histórico) — é o que permite o
  // filtro sobreviver a abrir/editar/fechar um negócio: ao voltar da edição via navigate(-1),
  // a URL restaurada já traz esses parâmetros, e os useState acima são inicializados a partir
  // deles. Não realimenta pedidosFilters/activeStages (que dependem só do state), então não gera
  // refetch extra — é puramente o espelho pra URL.
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const setOrDelete = (key: string, value: string | undefined) => {
        if (value) next.set(key, value); else next.delete(key);
      };
      setOrDelete('stages', selectedStages.length ? selectedStages.join(',') : undefined);
      setOrDelete('vendedores', selectedVendedores.length ? selectedVendedores.join(',') : undefined);
      setOrDelete('fabricantes', selectedFabricantes.length ? selectedFabricantes.join(',') : undefined);
      setOrDelete('marcadores', selectedMarcadores.length ? selectedMarcadores.join(',') : undefined);
      setOrDelete('atencao', showOnlyAttention ? '1' : undefined);
      setOrDelete('ocultar_importados', hideImportados ? '1' : undefined);
      // Período usa `set('', '')` em vez de `setOrDelete` quando limpo: precisa do
      // parâmetro presente-mas-vazio na URL pra `searchParams.has('data_de')` (nos
      // useState de dateFrom/dateTo acima) distinguir "usuário limpou de propósito"
      // de "nunca mexeu" — deletar o parâmetro fazia as duas situações parecerem
      // idênticas, e ao voltar de editar um negócio o período limpo virava mês atual
      // de novo (searchParams.has retornava false).
      next.set('data_de', dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '');
      next.set('data_ate', dateTo ? format(dateTo, 'yyyy-MM-dd') : '');
      setOrDelete('data_campo', dateField !== 'data_pedido' ? dateField : undefined);
      return next;
    }, { replace: true });
  }, [selectedStages, selectedVendedores, selectedFabricantes, selectedMarcadores, showOnlyAttention, hideImportados, dateFrom, dateTo, dateField, setSearchParams]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;
    const label = KANBAN_STAGES.find(s => s.key === destination.droppableId)?.label ?? destination.droppableId;

    // Bloqueia o move se algum campo obrigatório-nesta-etapa ainda não está preenchido.
    // Só checa campos cujo valor já está em memória (PedidoWithRelations) — campos como
    // origem_lead/itens/proximo_contato vivem em outras tabelas e não são checados aqui
    // (continuam validados normalmente ao criar/editar o negócio).
    const targetColunaId = kanbanColunas?.find(c => c.slug === destination.droppableId)?.id;
    const pedido = kanbanPedidosFlat.find(p => p.id === draggableId);
    if (pedido && targetColunaId) {
      const valoresPadrao: Record<string, string | number | null | undefined> = {
        cliente_id: pedido.cliente_id,
        fabricante_id: pedido.fabricante_id,
        vendedor_id: pedido.usuario_id,
        obra_id: pedido.obra_id,
        endereco_entrega: pedido.endereco_entrega,
        prazo_resposta: pedido.prazo_resposta,
        anexo_pdf: pedido.pdf_url,
        data_pedido: pedido.data_pedido,
        observacoes: pedido.observacoes,
        valor_manual: pedido.valor_total,
      };
      const missingLabels = (camposConfigPedidos ?? [])
        .filter(campo => isCampoObrigatorioNaEtapa(campo, targetColunaId))
        // origem_lead/itens/proximo_contato vivem fora de PedidoWithRelations, e "status" é
        // o próprio campo sendo alterado — nenhum dos quatro é checável aqui.
        .filter(campo => campo.origem !== 'padrao' || campo.campo_key in valoresPadrao)
        // Sem a seção Obras, o campo "Obra vinculada" não aparece em formulário nenhum. Se ele
        // continuasse contando como obrigatório, o cartão travaria nesta etapa com um aviso
        // impossível de resolver: "falta preencher Obra vinculada" num campo que ninguém
        // consegue abrir. A configuração do gestor continua gravada no banco — só para de ser
        // cobrada enquanto a seção estiver desligada.
        .filter(campo => temObras === true || campo.campo_key !== 'obra_id')
        .filter(campo => {
          const valor = campo.origem === 'padrao' ? valoresPadrao[campo.campo_key] : pedido.campos_extras?.[campo.campo_key];
          return valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim());
        })
        .map(campo => resolveFieldLabel(campo));

      if (missingLabels.length > 0) {
        setBlockedMove({ pedidoId: draggableId, targetLabel: label, missingLabels });
        return;
      }
    }

    try {
      await updateStatus.mutateAsync({ id: draggableId, status: destination.droppableId });
      toast.success(`Negócio movido para "${label}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao mover o negócio');
    }
  }, [updateStatus, KANBAN_STAGES, kanbanColunas, kanbanPedidosFlat, camposConfigPedidos, temObras]);

  const currentPageIds = paginated.map(p => p.id);
  // No modo "todos os filtrados", uma linha está selecionada por padrão, a menos que tenha
  // sido explicitamente excluída — por isso o cálculo de "página inteira selecionada" e a
  // contagem exibida precisam descontar excludedIds em vez de olhar só pro `selected` local.
  const allPageSelected = currentPageIds.length > 0 && (
    deleteAllFilteredMode
      ? currentPageIds.every(id => !excludedIds.has(id))
      : currentPageIds.every(id => selected.has(id))
  );
  const selecionadosNaPagina = deleteAllFilteredMode
    ? currentPageIds.filter(id => !excludedIds.has(id)).length
    : currentPageIds.filter(id => selected.has(id)).length;
  const selectedCount = deleteAllFilteredMode ? Math.max(0, totalCount - excludedIds.size) : selected.size;
  const someSelected = selectedCount > 0;

  const toggleOne = (id: string) => {
    if (deleteAllFilteredMode) {
      // Continua no modo "todos os filtrados": só acumula/desfaz a exclusão desse item
      // específico, sem descartar a seleção dos outros N-1 itens.
      setExcludedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** Zera a seleção inteira e sai do modo "todos os filtrados". */
  const limparSelecao = () => {
    setSelected(new Set());
    setExcludedIds(new Set());
    setDeleteAllFilteredMode(false);
    setFiltroDaSelecao(null);
  };

  // A seleção "todos os filtrados" é DEFINIDA pelo filtro: trocar o filtro faz o
  // conjunto "todos" virar outro, que ninguém escolheu. Pior, as exceções criadas
  // no filtro antigo continuavam sendo subtraídas do número exibido sem serem
  // descontadas da exclusão — o botão prometia menos do que o banco apagava.
  // Vale também ao ENTRAR na tela: a seleção sobrevive na sessão do navegador, e
  // voltar pelo menu (que zera os filtros da URL) reencontrava "11.909 de 11.909
  // selecionado(s)" sem o usuário ter pedido.
  useEffect(() => {
    if (!deleteAllFilteredMode) return;
    if (filtroDaSelecao === assinaturaDoFiltro) return;
    limparSelecao();
    toast.info('A seleção foi limpa porque o filtro mudou.');
  }, [assinaturaDoFiltro, deleteAllFilteredMode, filtroDaSelecao]);

  // A decisão de SETE resultados vive em src/lib/selecao-em-massa.ts, travada por
  // teste. Aqui ficou só o efeito de cada uma.
  //
  // A caixa é SIMÉTRICA: marcar já perguntava "apenas esta página ou todos os N?",
  // e desmarcar passa a fazer a mesma pergunta. Antes, desmarcar acrescentava a
  // página atual às exceções sem perguntar nada — com 10 por página e 11.906
  // negócios, "desmarcar todos" eram 1.191 cliques, um por página.
  const toggleAll = () => {
    const acao = acaoDaCaixaDoCabecalho({
      modoTodosFiltrados: deleteAllFilteredMode,
      paginaInteiraSelecionada: allPageSelected,
      totalConhecido: pedidosStats !== undefined,
      totalFiltrado: totalCount,
      itensNaPagina: currentPageIds.length,
      selecionadosNaPagina,
      selecionadosNoTotal: selectedCount,
    });

    switch (acao) {
      case 'nada':
        return;

      case 'limpar-tudo':
        limparSelecao();
        return;

      case 'perguntar-desmarcar':
        setDesmarcarDialogOpen(true);
        return;

      case 'reincluir-pagina':
        // Segue em "todos os filtrados": só desfaz as exceções desta página, sem
        // tocar nas que o usuário marcou em outras.
        setExcludedIds(prev => {
          const next = new Set(prev);
          currentPageIds.forEach(id => next.delete(id));
          return next;
        });
        return;

      case 'desmarcar-pagina':
        setSelected(prev => {
          const next = new Set(prev);
          currentPageIds.forEach(id => next.delete(id));
          return next;
        });
        return;

      case 'marcar-pagina':
        setSelected(prev => {
          const next = new Set(prev);
          currentPageIds.forEach(id => next.add(id));
          return next;
        });
        return;

      case 'perguntar-marcar':
        setSelectAllDialogOpen(true);
        return;
    }
  };

  /** Tira da seleção apenas as linhas visíveis, preservando as das outras páginas. */
  const desmarcarPaginaSomente = () => {
    if (deleteAllFilteredMode) {
      // Segue em "todos os filtrados": a página entra na lista de exceções, que é
      // o que a exclusão em massa desconta no servidor.
      setExcludedIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    }
    setDesmarcarDialogOpen(false);
  };

  const limparSelecaoPeloDialogo = () => {
    limparSelecao();
    setDesmarcarDialogOpen(false);
  };

  const selectPageOnly = () => {
    setDeleteAllFilteredMode(false);
    setExcludedIds(new Set());
    setSelected(prev => {
      const next = new Set(prev);
      currentPageIds.forEach(id => next.add(id));
      return next;
    });
    setSelectAllDialogOpen(false);
  };

  const selectAllFiltered = () => {
    // Não carregamos milhares de ids no cliente: a exclusão em massa, nesse modo,
    // roda uma única query no servidor com os mesmos filtros ativos (empresa/funil/etapa),
    // descontando excludedIds quando o usuário desmarcar itens individualmente.
    setSelected(new Set());
    setExcludedIds(new Set());
    setDeleteAllFilteredMode(true);
    setFiltroDaSelecao(assinaturaDoFiltro);
    setSelectAllDialogOpen(false);
  };

  const handleBulkDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'APAGAR' || !empresaId) return;

    try {
      const removed = deleteAllFilteredMode
        ? await bulkDeleteMutation.mutateAsync({
            empresaId,
            stages: activeStages,
            filters: pedidosFilters,
            excludeIds: excludedIds.size > 0 ? Array.from(excludedIds) : undefined,
          })
        : await bulkDeleteMutation.mutateAsync({ ids: Array.from(selected) });

      if (removed > 0) {
        toast.success(`${removed} negócio(s) removido(s) com sucesso!`);
      } else {
        // Recusa de RLS em DELETE **não levanta erro**: o Postgres simplesmente não enxerga
        // as linhas, e o `count` volta zero. Sem este ramo, a pessoa digitava APAGAR,
        // confirmava, e a tela ficava exatamente igual — sem sucesso, sem erro, sem nada.
        toast.error(
          podeExcluir
            ? 'Nenhum negócio foi removido. Eles podem já ter sido apagados por outra pessoa — atualize a lista.'
            : 'Você não tem permissão para excluir negócios. Peça a um gestor para habilitar em Configurações → Usuários.',
        );
        return;
      }

      setSelected(new Set());
      setDeleteAllFilteredMode(false);
      setExcludedIds(new Set());
      setDeleteConfirmText('');
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('[bulk-delete pedidos]', err);
      toast.error(err?.message || 'Erro inesperado ao remover negócios');
    }
  };

  // `bulkApplyCount` é definido lá em cima (junto com bulkPickerTodosFiltrados), porque o
  // checkbox do cabeçalho também precisa dele.
  // Agrupa os selecionados pela etapa atual (De:) — como a seleção pode misturar negócios de
  // etapas diferentes, mostra cada etapa de origem presente (com a contagem) em vez de assumir
  // uma origem única, para deixar claro o que vai mudar antes de aplicar o "Para:".
  const bulkOriginStages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const info of bulkSelected.values()) {
      counts.set(info.status, (counts.get(info.status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [bulkSelected]);
  const handleBulkApply = async () => {
    if (!empresaId || bulkApplyCount === 0) return;
    const updates: { status?: string; marcador_id?: string | null; usuario_id?: string } = {};
    if (bulkApplyStatus && bulkNewStatus) updates.status = bulkNewStatus;
    if (bulkApplyMarcador && bulkNewMarcadorId) updates.marcador_id = bulkNewMarcadorId === 'nenhum' ? null : bulkNewMarcadorId;
    if (bulkApplyVendedor && bulkNewVendedorId) updates.usuario_id = bulkNewVendedorId;
    if (Object.keys(updates).length === 0) return;

    try {
      // Dois formatos de alvo, iguais aos da exclusão em massa: ids explícitos (seleção manual)
      // ou "todos os filtrados" resolvido no servidor com o mesmo recorte do picker.
      const target = bulkPickerTodosFiltrados
        ? {
            empresaId,
            // Etapa vai no campo `stages` do alvo (o mesmo que a lista/contagem usam), não em
            // `filters.stages`, que a mutation também ignora.
            stages: bulkPickerFilters.stages,
            filters: bulkPickerFilters,
            excludeIds: bulkPickerExcluidos.size > 0 ? Array.from(bulkPickerExcluidos) : undefined,
          }
        : { ids: Array.from(bulkSelected.keys()) };
      const updated = await bulkUpdateMutation.mutateAsync({ target, updates });
      if (updated > 0) {
        toast.success(`${updated} negócio(s) atualizado(s) com sucesso!`);
      }
      setBulkEditOpen(false);
      setBulkApplyStatus(false);
      setBulkApplyMarcador(false);
      setBulkApplyVendedor(false);
      setBulkNewStatus('');
      setBulkNewMarcadorId('');
      setBulkNewVendedorId('');
      bulkLimparSelecao();
    } catch (err: any) {
      console.error('[bulk-update pedidos]', err);
      toast.error(err?.message || 'Erro inesperado ao aplicar a alteração em massa');
    }
  };

  // O campo `obra` continua sendo preenchido aqui de propósito, mesmo com a seção desligada:
  // quem decide se a COLUNA "Obra" entra no arquivo é o gerador do PDF, avisado por
  // `comObra` em handleExportPdf. Esvaziar o valor aqui só trocaria a coluna cheia de nomes
  // por uma coluna cheia de traços — que é justamente o que a cascata quer evitar.
  const buildExportRows = (specificPedidoId?: string): { rows: PedidoRow[]; titulo: string } => {
    if (specificPedidoId) {
      const p = (showKanban ? kanbanPedidosFlat : pedidos).find(p => p.id === specificPedidoId);
      if (!p) return { rows: [], titulo: '' };
      return {
        rows: [{
          cliente: p.cliente?.empresa ?? '-',
          obra: p.obra?.nome_obra ?? '-',
          fabricante: p.fabricante?.nome ?? '-',
          vendedor: p.vendedor?.nome ?? '-',
          participantes: (participantesPorNegocio?.get(p.id) ?? []).map(r => r.nome).join(', '),
          valor: p.valor_total ?? 0,
          etapa: stageLabel(p.status),
          data: p.data_pedido,
        }],
        titulo: `Negócio - ${getNomeNegocio(p)}`,
      };
    }

    if (showKanban) {
      return {
        rows: pipelineOrders.map(o => ({
          cliente: o.clientName,
          obra: o.obra,
          fabricante: o.fabricante,
          vendedor: o.vendedor,
          participantes: o.nomesDosParticipantes ?? '',
          valor: o.valor,
          etapa: stageLabel(o.stage),
          data: o.createdAt,
        })),
        titulo: hasPipelineFilters ? 'Orçamentos (Filtrado)' : 'Orçamentos - Pipeline Completo',
      };
    }

    return {
      rows: filtered.map(p => ({
        cliente: p.cliente?.empresa ?? '-',
        obra: p.obra?.nome_obra ?? '-',
        fabricante: p.fabricante?.nome ?? '-',
        vendedor: p.vendedor?.nome ?? '-',
        participantes: (participantesPorNegocio?.get(p.id) ?? []).map(r => r.nome).join(', '),
        valor: p.valor_total ?? 0,
        etapa: stageLabel(p.status),
        data: p.data_pedido,
      })),
      titulo: selectedStages.length > 0 ? `Orçamentos - Filtrado` : 'Orçamentos - Todos',
    };
  };

  const handleExportPdf = async (specificPedidoId?: string) => {
    const { rows, titulo } = buildExportRows(specificPedidoId);
    if (rows.length === 0) return;
    const { generatePedidosPdf } = await import('@/lib/generate-pdf');
    // A coluna "Obra" do relatório sai do arquivo inteira quando a empresa não tem a seção.
    // O gerador é função pura (roda fora do React), então não tem como perguntar sozinho —
    // recebe a resposta por parâmetro de quem chama.
    await generatePedidosPdf(rows, marcaDaEmpresa(profile), titulo, { comObra: temObras === true });
  };

  // Negócios cobertos pela exportação em Excel.
  //
  // MUDOU AQUI: antes a planilha saía com o que já estava carregado na tela — com "Exibir 10",
  // um funil de 11.906 negócios virava um arquivo de 10 linhas, e nada no arquivo dizia isso.
  // Agora a busca vai ao servidor com os MESMOS `activeStages`/`pedidosFilters` que a tela usa,
  // em lotes de PEDIDOS_LOTE_EXPORTACAO (ver buscarNegociosDoRecorte), e o resultado é o recorte
  // filtrado inteiro — o mesmo número que o cabeçalho já mostra.
  //
  // O caso de UM negócio só (o "Exportar" de dentro da linha) continua lendo o que está na tela:
  // o registro já está carregado, ir ao servidor buscar de novo seria uma volta sem ganho.
  const obterNegociosParaExportar = async (
    specificPedidoId: string | undefined,
    onProgresso: (carregados: number) => void,
  ): Promise<{ negocios: PedidoWithRelations[]; titulo: string }> => {
    if (specificPedidoId) {
      const p = (showKanban ? kanbanPedidosFlat : pedidos).find(item => item.id === specificPedidoId);
      return p ? { negocios: [p], titulo: `Negócio - ${getNomeNegocio(p)}` } : { negocios: [], titulo: '' };
    }

    const filtrado = hasPipelineFilters || deferredSearch.trim() !== '';
    const negocios = await buscarNegociosDoRecorte({
      empresaId,
      stages: activeStages,
      filters: pedidosFilters,
      // A planilha sai na mesma ordem que a tela está mostrando — quem ordenou por "maior valor
      // primeiro" e exportou espera abrir o arquivo e ver o maior valor na primeira linha.
      sort: sortDaLista,
      onProgresso,
    });
    return { negocios, titulo: filtrado ? 'Negócios - Filtrado' : 'Negócios' };
  };

  // A planilha sai com os MESMOS cabeçalhos que o assistente de importação reconhece, na mesma
  // ordem — é o que permite exportar, ajustar no Excel e reimportar sem remapear coluna nenhuma.
  // Os rótulos vêm de `FIELDS` (importPedidosUtils), a MESMA lista que a importação lê: assim os
  // dois lados não têm como divergir em silêncio quando alguém acrescentar um campo lá.
  // O import é dinâmico porque esse módulo carrega o xlsx (pesado): fora do clique de exportar
  // ele não deve entrar no pacote da página, que é justamente por que o diálogo de importação
  // também é carregado sob demanda.
  const handleExportExcel = async (specificPedidoId?: string) => {
    // Dois cliques seguidos disparariam duas varreduras completas do funil ao mesmo tempo.
    if (exportando) return;

    const exportandoTudo = !specificPedidoId;
    // Um aviso que se atualiza a cada lote. Sem ele, 12 idas ao servidor em sequência parecem
    // uma tela travada: nada se mexe, nenhum arquivo aparece, e a pessoa clica de novo.
    const avisoId = exportandoTudo
      ? toast.loading(`Buscando os ${totalCount.toLocaleString('pt-BR')} negócios do filtro...`)
      : undefined;

    setExportando(true);
    try {
      const { negocios, titulo } = await obterNegociosParaExportar(specificPedidoId, carregados => {
        if (avisoId !== undefined) {
          toast.loading(
            `Buscando negócios... ${carregados.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')}`,
            { id: avisoId },
          );
        }
      });

      if (negocios.length === 0) {
        toast.error('Nenhum negócio para exportar.', { id: avisoId });
        return;
      }

      // Confere o que veio contra o número que a tela promete. Divergência aqui é notícia, não
      // detalhe: significa que o arquivo saiu incompleto (alguém mexeu nos negócios durante a
      // busca, ou o recorte passou do teto do laço de lotes). Melhor a pessoa saber antes de
      // mandar a planilha para alguém do que descobrir depois que faltava gente.
      if (exportandoTudo && negocios.length < totalCount) {
        toast.warning(
          `O arquivo saiu com ${negocios.length.toLocaleString('pt-BR')} dos ${totalCount.toLocaleString('pt-BR')} negócios do filtro. Vale conferir e exportar de novo.`,
        );
      }

      if (avisoId !== undefined) {
        toast.loading(`Montando a planilha com ${negocios.length.toLocaleString('pt-BR')} negócios...`, { id: avisoId });
      }

      const [{ FIELDS }, { utils: xlsxUtils, writeFile: xlsxWriteFile }] = await Promise.all([
        import('@/components/import-pedidos/importPedidosUtils'),
        import('xlsx'),
      ]);

      // Cada campo da importação e de onde sai o valor dele aqui. As datas saem EXATAMENTE como
      // estão no banco (`AAAA-MM-DD`, as duas colunas são do tipo date) e como texto: nada de
      // `new Date(...)`/`toLocaleDateString`, que é o idioma que fazia a data cair no dia anterior
      // (CLAUDE.md §7.12) — a exportação antiga escrevia 30/01 para um negócio de 31/01. Do outro
      // lado, `sanitizeFieldValue` (MappingStep.tsx) tem um ramo próprio para `AAAA-MM-DD` que
      // devolve a data idêntica sem passar por `Date`, então a ida e a volta fecham no mesmo dia.
      // Lembrando o que os nomes escondem: `data_pedido` é a CRIAÇÃO e `prazo_resposta` é o
      // FECHAMENTO — os rótulos da planilha ("Criação"/"Fechamento") são os que a importação usa.
      const valorDaColuna: Record<string, (p: PedidoWithRelations) => string | number> = {
        negocio: p => getNomeNegocio(p),
        cliente: p => p.cliente?.empresa ?? '',
        // Mesma origem que a coluna "Contato" da lista: o contato veio da importação como campo
        // extra, não como relação própria de `pedidos`.
        contato: p => {
          const extras = (p.campos_extras ?? {}) as Record<string, unknown>;
          return String(extras['Contato'] ?? extras['contato'] ?? '');
        },
        // Mesmo corte da coluna "Obra/Endereço" da lista: o valor principal é o endereço de
        // entrega, texto livre do negócio que existe com ou sem a seção Obras — só o
        // "ou o nome da obra" some. A COLUNA continua na planilha mesmo com a seção
        // desligada, e isso é de propósito: os cabeçalhos daqui são os mesmos que o
        // assistente de importação reconhece, e é isso que deixa exportar, ajustar no Excel e
        // reimportar sem remapear nada. Tirar a coluna quebraria essa ida e volta.
        obra: p => p.endereco_entrega ?? (temObras === true ? p.obra?.nome_obra : null) ?? '',
        fabricante: p => p.fabricante?.nome ?? '',
        valor: p => p.valor_total ?? 0,
        vendedor: p => p.vendedor?.nome ?? '',
        // O nome da etapa, não o slug: a importação casa o texto contra o nome real das colunas do
        // funil (matchPedidoStatusToColuna), então o rótulo volta para a mesma etapa de origem.
        status: p => stageLabel(p.status),
        marcador: p => p.marcador?.nome ?? '',
        data_pedido: p => p.data_pedido ?? '',
        prazo_resposta: p => p.prazo_resposta ?? '',
        observacoes: p => p.observacoes ?? '',
        // 🔴 NÃO ASSINE ESTE ENDEREÇO. Vai o valor gravado, cru, de propósito.
        //
        // Os cabeçalhos desta planilha são os mesmos que o assistente de importação
        // reconhece — é isso que deixa exportar, ajustar no Excel e reimportar. E a
        // importação GRAVA de volta em `pedidos.pdf_url` o que encontrar aqui
        // (`resolve-pedido-pdf.ts`: endereço que não é do Bitrix passa intacto).
        // Exportar um link assinado plantaria no banco, para sempre, um endereço que
        // morre em uma hora — e ninguém veria, porque a importação não reclama.
        //
        // Consequência aceita: quando o balde fechar (Passo 7), este endereço deixa de
        // abrir para quem receber a planilha. É o objetivo, não um efeito colateral —
        // hoje qualquer pessoa com a planilha na mão baixa o orçamento sem estar logada.
        // A ida e volta exportar → editar → reimportar continua funcionando.
        pdf_url: p => p.pdf_url ?? '',
      };

      const larguraPorCampo: Record<string, number> = {
        negocio: 38, cliente: 28, contato: 24, obra: 30, fabricante: 22, valor: 16, vendedor: 22,
        status: 18, marcador: 16, data_pedido: 12, prazo_resposta: 12, observacoes: 40, pdf_url: 40,
      };

      const cabecalhos = FIELDS.map(f => f.label);
      const linhas = negocios.map(p =>
        Object.fromEntries(FIELDS.map(f => [f.label, valorDaColuna[f.key]?.(p) ?? '']))
      );

      // `header` fixa a ordem das colunas na planilha, que é a ordem de FIELDS.
      const ws = xlsxUtils.json_to_sheet(linhas, { header: cabecalhos });
      ws['!cols'] = FIELDS.map(f => ({ wch: larguraPorCampo[f.key] ?? 20 }));

      const wb = xlsxUtils.book_new();
      xlsxUtils.book_append_sheet(wb, ws, 'Negócios');
      // `format` do date-fns (fuso local) em vez de `toISOString()` (UTC): depois das 21h no
      // Brasil o nome do arquivo sairia com a data de amanhã.
      const nomeArquivo = `${titulo.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'negocios'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      xlsxWriteFile(wb, nomeArquivo);

      if (avisoId !== undefined) {
        toast.success(`${negocios.length.toLocaleString('pt-BR')} negócios exportados.`, { id: avisoId });
      }
    } catch (err) {
      console.error('[export negocios]', err);
      toast.error((err as Error)?.message || 'Não foi possível exportar os negócios.', { id: avisoId });
    } finally {
      // Só aqui, e não logo depois da busca: montar a planilha de 11.906 linhas também leva
      // tempo, e liberar o botão antes disso deixaria dois arquivos sendo gerados ao mesmo tempo.
      setExportando(false);
    }
  };

  const openExportDialog = (specificPedidoId?: string) => {
    setExportTargetId(specificPedidoId);
    setExportDialogOpen(true);
  };

  const handleExportFormatChoice = async (formatoEscolhido: 'pdf' | 'xlsx') => {
    setExportDialogOpen(false);
    if (formatoEscolhido === 'pdf') {
      await handleExportPdf(exportTargetId);
      return;
    }
    // Recorte grande: pergunta antes. São várias idas ao servidor seguidas da montagem da
    // planilha, e o único jeito honesto de fazer isso é avisar quanto vai custar em vez de
    // deixar a aba parecendo travada por meio minuto.
    if (!exportTargetId && totalCount > PEDIDOS_EXPORTACAO_AVISO) {
      setConfirmExportOpen(true);
      return;
    }
    await handleExportExcel(exportTargetId);
  };

  const optionsPopover = useMemo(() => (
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
      label={showKanban ? 'Itens do card' : 'Colunas'}
    >
      <div className="flex flex-col">
        {showKanban && (
          <ColumnSettingsItem
            label="Gerenciar colunas Kanban"
            icon={Columns3}
            onClick={() => setColunasDialogOpen(true)}
          />
        )}

        <ColumnSettingsItem
          label="Gerenciar marcadores"
          icon={Tag}
          onClick={() => setMarcadoresDialogOpen(true)}
        />

        <ColumnSettingsPopover label="Ações" icon={Plus}>
          <ColumnSettingsItem
            label="Importar"
            icon={Upload}
            onClick={() => {
              setImportDialogMounted(true);
              setImportOpen(true);
            }}
          />

          <ColumnSettingsItem
            label="Linhas Ignoradas"
            icon={FileWarning}
            onClick={() => navigate('/importacao/ignoradas')}
          />

          <ColumnSettingsItem
            label="Exportar"
            icon={FileDown}
            onClick={() => openExportDialog()}
          />

          <ColumnSettingsItem
            label="Ação em Massa"
            icon={ArrowRightLeft}
            // Não depende de seleção prévia nem dos filtros da lista — abre com nada marcado e
            // mostrando todos os negócios do funil atual; a escolha acontece dentro do modal.
            disabled={!empresaId}
            onClick={() => {
              setBulkSelected(new Map());
              setBulkPickerTodosFiltrados(false);
              setBulkPickerExcluidos(new Set());
              setBulkFiltroDaSelecao(null);
              setBulkPickerPage(1);
              setBulkPickerSearch('');
              setBulkPickerStages([]);
              setBulkPickerVendedorIds([]);
              setBulkPickerMarcadorIds([]);
              setBulkPickerDateFrom(undefined);
              setBulkPickerDateTo(undefined);
              setBulkPickerDateField('data_pedido');
              setBulkApplyStatus(false);
              setBulkApplyMarcador(false);
              setBulkApplyVendedor(false);
              setBulkNewStatus('');
              setBulkNewMarcadorId('');
              setBulkNewVendedorId('');
              setBulkEditOpen(true);
            }}
          />

          {/* Some para quem o banco vai recusar de qualquer jeito. Esconder não é a
              proteção (CLAUDE.md §6.1) — a proteção é a política de RLS; isto só evita
              oferecer um botão que não faz nada. */}
          {podeExcluir && (
            <ColumnSettingsItem
              label="Excluir Selecionados"
              icon={Trash2}
              variant="destructive"
              disabled={!someSelected}
              onClick={() => setConfirmDeleteOpen(true)}
              badge={someSelected ? selectedCount : undefined}
            />
          )}
        </ColumnSettingsPopover>
      </div>
    </ColumnSettings>
  ), [
    columns,
    visibleColumns,
    setVisibleColumns,
    handleRename,
    handleTypeChange,
    handleAddColumn,
    handleRemoveColumn,
    handleReorder,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    showKanban,
    KANBAN_STAGES,
    visibleKanbanStages,
    toggleKanbanStage,
    handleKanbanStagesChange,
    deleteAllFilteredMode,
    excludedIds.size,
    totalCount,
    someSelected,
    selectedCount,
    empresaId,
    setBulkSelected,
    setImportOpen,
    setImportDialogMounted,
    setColunasDialogOpen,
    setMarcadoresDialogOpen,
    isPipelineMode,
    setConfirmDeleteOpen,
    setBulkEditOpen
  ]);

    const filtrosPopover = useMemo(() => (
    <FilterButton
      hasFilters={activeFilterCount > 0}
      activeFilterCount={activeFilterCount}
      onClear={clearPipelineFilters}
      className={cn(
        hasPipelineFilters && "data-[state=closed]:border-primary/50 data-[state=closed]:bg-primary/[0.02] data-[state=closed]:text-primary data-[state=open]:border-primary/50 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
      )}
      align="start"
      popoverClassName="w-64"
    >
      <div className="flex flex-col gap-1">
        {/* Submenu Etapa */}
        <StandardPopoverMenu
          label="Etapa"
          icon={LayoutGrid}
          badge={selectedStages.length > 0 ? selectedStages.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <div className="space-y-1">
            {KANBAN_STAGES.map(s => (
              <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                <Checkbox 
                  checked={selectedStages.includes(s.key)} 
                  onCheckedChange={() => {
                    toggleFilter(selectedStages, setSelectedStages, s.key);
                    setPage(1);
                  }} 
                />
                {s.label}
              </label>
            ))}
          </div>
        </StandardPopoverMenu>

        {/* Submenu Vendedor */}
        <StandardPopoverMenu
          label="Vendedor"
          icon={User}
          badge={selectedVendedores.length > 0 ? selectedVendedores.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <ScrollArea className="h-60">
            <div className="space-y-1 pr-3">
              {(vendedores ?? []).map(v => (
                <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                  <Checkbox checked={selectedVendedores.includes(v.id)} onCheckedChange={() => toggleFilter(selectedVendedores, setSelectedVendedores, v.id)} />
                  {v.nome}
                </label>
              ))}
            </div>
          </ScrollArea>
        </StandardPopoverMenu>

        {/* Submenu Fabricante */}
        <StandardPopoverMenu
          label="Fabricante"
          icon={Factory}
          badge={selectedFabricantes.length > 0 ? selectedFabricantes.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          {/* A lista já chega do hook com as marcas inativas por último (`useFabricantes`
              ordena por `ativo desc, nome`) e o `map` preserva essa ordem. Marca inativa
              continua marcável: filtro salvo na URL apontando para ela tem de seguir
              funcionando — os negócios antigos dela não sumiram. */}
          <FilterCheckboxList
            options={(fabricantes ?? []).map(f => ({
              value: f.id,
              label: f.nome,
              selo: fabricanteEstaAtivo(f) ? undefined : 'Inativa',
            }))}
            selected={selectedFabricantes}
            onToggle={(id) => toggleFilter(selectedFabricantes, setSelectedFabricantes, id)}
            searchPlaceholder="Buscar fabricante..."
            emptyMessage="Nenhum fabricante cadastrado."
          />
        </StandardPopoverMenu>

        {/* Submenu Marcador */}
        <StandardPopoverMenu
          label="Marcador"
          icon={Tag}
          badge={selectedMarcadores.length > 0 ? selectedMarcadores.length : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-60"
        >
          <FilterCheckboxList
            options={(marcadores ?? []).map(m => ({ value: m.id, label: m.nome }))}
            selected={selectedMarcadores}
            onToggle={(id) => toggleFilter(selectedMarcadores, setSelectedMarcadores, id)}
            searchPlaceholder="Buscar marcador..."
            emptyMessage="Nenhum marcador cadastrado."
          />
        </StandardPopoverMenu>

        {/* Submenu Período */}
        <StandardPopoverMenu
          label="Período"
          icon={CalendarIcon}
          badge={(dateFrom || dateTo) ? 'Ativo' : undefined}
          side="left"
          align="start"
          sideOffset={10}
          popoverClassName="w-64"
        >
          <div className="space-y-4 p-2">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Filtrar por
              </p>
              <ToggleGroup
                type="single"
                value={dateField}
                onValueChange={(v) => v && setDateField(v as PeriodoDateField)}
                className={cn(TOGGLE_LIST_CLASS, "w-full")}
              >
                <ToggleGroupItem value="data_pedido" className={cn(TOGGLE_ITEM_CLASS, "flex-1")}>
                  Criação
                </ToggleGroupItem>
                <ToggleGroupItem value="prazo_resposta" className={cn(TOGGLE_ITEM_CLASS, "flex-1")}>
                  Fechamento
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Data Início
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecione..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {/* defaultMonth: sem ele o react-day-picker abre SEMPRE no mês de hoje, mesmo
                      com uma data antiga já selecionada — quem filtrou março/2024, fechou e
                      reabriu o filtro caía em agosto/2026 e tinha que clicar na seta dezenas de
                      vezes pra voltar. Com 4 anos de histórico importado do Bitrix isso é
                      inviável. Aqui o defaultMonth (não controlado) resolve sozinho porque o
                      PopoverContent do Radix desmonta o conteúdo ao fechar: a cada abertura o
                      calendário monta de novo e o mês é recalculado. Se um dia esse popover
                      passar a usar forceMount, aí sim vira month + onMonthChange. */}
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    defaultMonth={dateFrom}
                    onSelect={handleDateFromSelect}
                    locale={ptBR}
                    captionLayout="dropdown-buttons"
                    fromYear={1950}
                    toYear={new Date().getFullYear()}
                    className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Data Fim
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecione..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {/* Abre no mês da própria Data Fim; se ela ainda estiver vazia, abre no mês da
                      Data Início — é onde o intervalo começa, e é de lá que a pessoa está
                      escolhendo o fim. Sem nenhuma das duas, cai no mês atual (comportamento
                      padrão do react-day-picker quando defaultMonth é undefined). */}
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    defaultMonth={dateTo ?? dateFrom}
                    onSelect={handleDateToSelect}
                    initialFocus
                    locale={ptBR}
                    captionLayout="dropdown-buttons"
                    fromYear={1950}
                    toYear={new Date().getFullYear()}
                    className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </StandardPopoverMenu>

        <div className="h-px bg-border/50 my-1" />

        <div className="space-y-2 py-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3">Atenção</p>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
            <Checkbox checked={showOnlyAttention} onCheckedChange={() => setShowOnlyAttention(prev => !prev)} />
            Atenção (7+ dias)
          </label>
        </div>

        <div className="h-px bg-border/50 my-1" />

        <div className="space-y-2 py-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3">Importação</p>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
            <Checkbox checked={hideImportados} onCheckedChange={() => setHideImportados(prev => !prev)} />
            Ocultar negócios importados
          </label>
        </div>
      </div>
    </FilterButton>
  ), [activeFilterCount, clearPipelineFilters, hasPipelineFilters, selectedStages, setSelectedStages, vendedores, selectedVendedores, toggleFilter, fabricantes, selectedFabricantes, marcadores, selectedMarcadores, dateFrom, handleDateFromSelect, dateTo, handleDateToSelect, dateField, showOnlyAttention, setShowOnlyAttention, hideImportados, setHideImportados]);
  const selectedViewOrder = useMemo(
    () => (showKanban ? kanbanPedidosFlat : pedidos).find(p => p.id === viewOrderId)
      ?? bulkPickerData?.data?.find(p => p.id === viewOrderId),
    [showKanban, kanbanPedidosFlat, pedidos, viewOrderId, bulkPickerData]
  );

  const viewOrderSheet = (
    <Sheet
      open={!!viewOrderId}
      onOpenChange={(open) => {
        if (open) return;
        setViewOrderId(null);
        // Sem tirar o parâmetro, recarregar a página reabre o painel que a pessoa acabou
        // de fechar — e o botão "voltar" do navegador vira um laço.
        if (searchParams.get('negocio')) {
          setSearchParams(prev => {
            const p = new URLSearchParams(prev);
            p.delete('negocio');
            return p;
          }, { replace: true });
        }
      }}
    >
      <ConteudoDoPainel className="sm:max-w-xl">
        <CabecalhoDoPainel className="border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <SheetTitle className="text-foreground font-bold text-lg">
                {selectedViewOrder ? getNomeNegocio(selectedViewOrder) : 'Detalhes do Negócio'}
              </SheetTitle>
              {/* O <SheetDescription> continua montado mesmo sem a seção, e só o texto some:
                  é ele que o painel usa como descrição acessível (aria-describedby), e tirar o
                  elemento deixaria o leitor de tela sem referência. Sem Obras, a frase "Sem obra
                  vinculada" seria pior que o silêncio — fala de algo que a empresa não tem. */}
              <SheetDescription>
                {temObras === true && (selectedViewOrder?.obra?.nome_obra ?? 'Sem obra vinculada')}
              </SheetDescription>
            </div>
            {selectedViewOrder && (
              <Badge className={getStageBadgeClass(KANBAN_STAGES.find(s => s.key === selectedViewOrder.status)?.color ?? 'muted-foreground')}>
                {stageLabel(selectedViewOrder.status)}
              </Badge>
            )}
          </div>
        </CabecalhoDoPainel>

        <CorpoDoPainel className="pt-6">
        {selectedViewOrder ? (
          <div className="space-y-8">
            {/* Grid de Dados */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Cliente
                </p>
                {selectedViewOrder.cliente ? (
                  <button 
                    onClick={() => navigate(`/clientes/${selectedViewOrder.cliente?.id}`)}
                    className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                  >
                    {selectedViewOrder.cliente.empresa}
                    <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
              {/* Sem a seção, o quadro de Obra some inteiro — rótulo e valor. O botão levaria
                  para /obras, que a guarda de rota já barra: mostrar um caminho fechado é pior
                  que não mostrar caminho nenhum. A grade é de duas colunas fixas, então os
                  outros quadros só se reacomodam. */}
              {temObras === true && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> Obra
                  </p>
                  {selectedViewOrder.obra ? (
                    <button
                      // `/obras/{id}` NÃO existe como rota (App.tsx só tem `/obras`), então
                      // este clique caía no curinga e abria "página não encontrada". O
                      // caminho certo já existia em ClienteDetalhe.tsx:720: navega para
                      // `/obras` levando o id no estado, e a tela de Obras o lê e abre a
                      // obra (Obras.tsx:138).
                      onClick={() =>
                        navigate('/obras', {
                          state: { selectedObraId: selectedViewOrder.obra?.id },
                        })
                      }
                      className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                    >
                      {selectedViewOrder.obra.nome_obra}
                      <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <p className="text-sm font-medium">{selectedViewOrder.obra?.nome_obra ?? '-'}</p>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Factory className="h-3 w-3" /> Fabricante
                </p>
                <p className="text-sm font-medium">{selectedViewOrder.fabricante?.nome ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-3 w-3" /> Marcador
                </p>
                {selectedViewOrder.marcador ? (
                  <Badge className={getStageBadgeClass(selectedViewOrder.marcador.cor)}>
                    {selectedViewOrder.marcador.nome}
                  </Badge>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Valor Total
                </p>
                <p className="text-sm font-bold text-primary">
                  {(selectedViewOrder.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Responsáveis
                </p>
                {/*
                  Aqui a estrela grava NA HORA: este painel não tem botão de salvar, e um clique
                  que não valesse na hora faria a pessoa fechar o painel achando que mudou algo.
                  Toda troca de estrela entra no histórico de atividades do negócio.

                  🔴 O nome deixou de ser um atalho para a ficha da pessoa. Com vários
                  responsáveis, um link só teria de escolher um deles — e o painel passaria a
                  responder "quem é o titular" em vez de "quem toca este negócio", que é a
                  pergunta que o campo único existe para responder. A ficha da pessoa continua
                  a um clique em Usuários.
                */}
                <PainelDeResponsaveis pedidoId={selectedViewOrder.id} somenteLeitura={!podeEditar} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Data de Criação
                </p>
                <p className="text-sm font-medium">
                  {selectedViewOrder.data_pedido ? (() => {
                    const dateParts = selectedViewOrder.data_pedido.split('-');
                    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                  })() : '-'}
                </p>
              </div>
              {selectedViewOrder.prazo_resposta && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarIcon className="h-3 w-3" /> Data de Fechamento
                  </p>
                  <p className="text-sm font-medium">
                    {(() => {
                      const dateParts = selectedViewOrder.prazo_resposta.split('-');
                      return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    })()}
                  </p>
                </div>
              )}
              {selectedViewOrder.pdf_url && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Anexo
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const original = repairCorruptedBitrixUrl(selectedViewOrder.pdf_url);
                      const nome = filenameFromUrl(original, 'anexo.pdf');
                      // Assina no clique, não ao desenhar a lista: só paga pelo anexo que alguém
                      // de fato abre. O nome sai do endereço ORIGINAL, onde o caminho está limpo.
                      setPdfPreview({ url: (await enderecoDoArquivo(original)) ?? original, nome });
                    }}
                    className="inline-flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                  >
                    <FileText className="h-4 w-4" /> Ver PDF anexado
                  </button>
                </div>
              )}
              {/* Renderização de Campos Extras dinâmicos */}
              {columns.filter(col => tableVisibleColumns.includes(col.id)).map(col => {
                const colId = col.id;
                const isDefault = PEDIDOS_COLUMNS.some(c => c.id === colId);
                if (isDefault || colId === 'acoes') return null;
                
                if (colId === 'pdf_url') return null; // já exibido acima em "Anexo", com correção de link corrompido
                const value = selectedViewOrder.campos_extras?.[colId] ?? selectedViewOrder.campos_extras?.[getLabel(colId)];
                if (!value) return null;

                // Evita duplicar a exibição quando o mesmo link já aparece na seção "Anexo"
                // estruturada abaixo (importações antigas guardavam o PDF só como campo extra).
                // Compara após reparo, pois o valor bruto em campos_extras pode ter a corrupção
                // de locale (pontos trocados por vírgulas) que o pdf_url estruturado já corrige.
                if (
                  selectedViewOrder.pdf_url &&
                  typeof value === 'string' &&
                  repairCorruptedBitrixUrl(value.trim()) === repairCorruptedBitrixUrl(selectedViewOrder.pdf_url.trim())
                ) return null;

                const isUrl = typeof value === 'string' && /^https?:\/\//i.test(value.trim());

                return (
                  <div key={colId} className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> {getLabel(colId)}
                    </p>
                    {isUrl ? (
                      <a
                        href={value.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                      >
                        <FileText className="h-4 w-4" /> Abrir {getLabel(colId)}
                      </a>
                    ) : (
                      <p className="text-sm font-medium">{value}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Endereço */}
            {selectedViewOrder.endereco_entrega && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Endereço de Entrega</p>
                <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedViewOrder.endereco_entrega}</p>
                </div>
              </div>
            )}

            {/* Tarefas / Observações do negócio — some quando a empresa não contratou a
                seção. Os irmãos acima e abaixo são blocos independentes no mesmo
                empilhamento, então o espaçamento se fecha sozinho. */}
            {temTarefas === true && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tarefas</p>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddTarefaOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Nova Tarefa
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Tarefa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Prazo Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!tarefasNegocio?.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          Nenhuma tarefa vinculada a este negócio
                        </TableCell>
                      </TableRow>
                    ) : (
                      tarefasNegocio.map(tarefa => (
                        <TableRow key={tarefa.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setEditingTarefaNegocio(tarefa)}>
                          <TableCell className="font-medium text-sm">{tarefa.titulo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-[10px]">{tarefa.status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-sm" onClick={(e) => tarefa.responsavel && e.stopPropagation()}>
                            {tarefa.responsavel ? <UserProfilePopover name={tarefa.responsavel} /> : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {tarefa.prazo_final
                              ? format(new Date(tarefa.prazo_final), 'dd/MM/yyyy', { locale: ptBR })
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            )}

            {/* Histórico de Movimentação no Kanban */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <History className="h-3 w-3" /> Histórico de Movimentação
              </p>
              <HistoricoMovimentacaoNegocio historico={historicoStatusNegocio} stageLabel={stageLabel} />
            </div>

            {/* Comentários manuais — separado do log automático acima */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" /> Comentários
              </p>
              <ComentariosNegocio pedidoId={viewOrderId} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        </CorpoDoPainel>

        {/* Rodapé CONGELADO e no MESMO padrão do painel de Obras, a pedido do Lucas: à esquerda
            o que se usa todo dia (Editar, Fechar), à direita a exclusão, sozinha.

            O botão "Exportar" saiu. Ele abria a exportação de UM negócio, coisa que a tela de
            Negócios já faz pela seleção da lista — e ficava colado nas duas ações que a pessoa
            de fato usa aqui. */}
        <RodapeDoPainel
          esquerda={
            <>
              <Button onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" onClick={() => setViewOrderId(null)}>
                Fechar
              </Button>
            </>
          }
        >
          <Button
            variant="ghost"
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { setViewOrderId(null); setDeleteAllFilteredMode(false); setSelected(new Set([viewOrderId!])); setConfirmDeleteOpen(true); }}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        </RodapeDoPainel>
      </ConteudoDoPainel>
    </Sheet>
  );

  const addTarefaDialog = (
    <TarefaFormDialog
      open={addTarefaOpen}
      onOpenChange={setAddTarefaOpen}
      editingTarefa={null}
      kanbanStages={tarefaKanbanStages}
      extraFields={{ pedido_id: viewOrderId!, cliente_id: selectedViewOrder?.cliente_id }}
    />
  );

  const editTarefaDialog = (
    <TarefaFormDialog
      open={!!editingTarefaNegocio}
      onOpenChange={(open) => { if (!open) setEditingTarefaNegocio(null); }}
      editingTarefa={editingTarefaNegocio}
      kanbanStages={tarefaKanbanStages}
      extraFields={{ pedido_id: viewOrderId!, cliente_id: selectedViewOrder?.cliente_id }}
    />
  );

  const isFiltered = hasPipelineFilters || deferredSearch.trim() !== '';

  // O subtítulo agora DESCREVE a seção, em vez de contar negócios — mesmo padrão (e mesmo tom,
  // sem ponto final) das outras telas: Clientes, Tarefas, Fabricantes.
  const subtitle = 'Funil de orçamentos, da abertura ao fechamento';

  // A contagem e a soma que ficavam no subtítulo não foram jogadas fora: viraram a linha de
  // resumo logo abaixo da barra de ferramentas. O total em dinheiro do recorte não aparece em
  // nenhum outro lugar da tela (o rodapé mostra só a contagem, e o Kanban só o total por etapa).
  // Contagem e soma vêm de usePedidosStats (query dedicada no servidor), refletindo
  // TODOS os registros que atendem ao filtro atual — não apenas o lote carregado localmente.
  const resumoDoRecorte = `${totalCount.toLocaleString('pt-BR')} ${totalCount === 1 ? 'negócio' : 'negócios'}${isFiltered ? ' (filtrados)' : ''} · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

  return (
    <AppLayout title="Negócios" subtitle={subtitle} mainClassName="flex-1 overflow-hidden flex flex-col">
      <div className={cn('flex flex-col flex-1 min-h-0 px-4 sm:px-6 pt-4 sm:pt-6', !showKanban && 'pb-4 sm:pb-6')}>
        <div className={cn('mb-3 flex items-center gap-3', showKanban ? 'shrink-0' : 'mb-4 md:mb-6')}>
          <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0 sm:overflow-x-auto custom-scrollbar sm:pb-1">
            {isPipelineMode && funis && funis.length > 1 && (
              <Select value={funilId} onValueChange={setFunilId}>
                <SelectTrigger className="h-8 w-fit min-w-[140px] shrink-0 text-sm gap-1.5">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funis.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isPipelineMode && (
              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5 shrink-0">
                <Button
                  variant={pipelineView === 'kanban' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePipelineViewChange('kanban')}
                  className="h-8 gap-1.5 px-3"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </Button>
                <Button
                  variant={pipelineView === 'lista' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePipelineViewChange('lista')}
                  className="h-8 gap-1.5 px-3"
                >
                  <ListIcon className="h-4 w-4" />
                  Lista
                </Button>
              </div>
            )}

            {showKanban && (
              <Select
                value={String(kanbanPageSize)}
                onValueChange={(value) => setKanbanPageSize(Number(value))}
              >
                <SelectTrigger className="h-10 w-fit min-w-[70px] shrink-0 text-sm gap-1.5">
                  <Rows3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground whitespace-nowrap">Exibir</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_PAGE_SIZE_OPTIONS.map(option => (
                    <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <SearchWithRecent
              placeholder={placeholderBuscaNegocios}
              value={search}
              onValueChange={handleSearchChange}
              storageKey="negocios_recent_searches"
              className="order-last w-full sm:order-none sm:w-auto sm:min-w-[240px] sm:shrink-0"
              loading={showSearchLoading}
            />

            <div className="shrink-0">{filtrosPopover}</div>
            <div className="shrink-0">{optionsPopover}</div>

            {isPipelineMode && hasPipelineFilters && (
              <Button variant="ghost" size="icon" onClick={clearPipelineFilters} className="h-8 w-8 text-muted-foreground shrink-0" title="Limpar filtros">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-10" onClick={() => navigate(funilId ? `/pedidos/novo?funilId=${encodeURIComponent(funilId)}` : '/pedidos/novo')}>
              <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Novo Negócio</span><span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {/* Quantos negócios e quanto dinheiro o recorte atual representa — saiu do subtítulo da
            página, que agora descreve a seção. */}
        <p className="mb-3 shrink-0 text-xs text-muted-foreground">{resumoDoRecorte}</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showKanban ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 min-h-0 pb-4 flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto items-stretch">
              {KANBAN_STAGES.filter(stage => visibleKanbanStages.includes(stage.key)).map(stage => (
                <KanbanColumn
                  key={stage.key}
                  stageKey={stage.key as any}
                  label={stage.label}
                  colorClass={stage.color}
                  onCardClick={setViewOrderId}
                  visibleColumns={visibleColumns}
                  columns={columns}
                  pageSize={kanbanPageSize}
                  empresaId={empresaId}
                  filters={pedidosFilters}
                  etapaFilter={activeStages}
                  onOrdersChange={handleKanbanColumnData}
                  resolvedSearchMatches={searchMatchesQuery.data ?? null}
                  searchPending={kanbanSearchPending}
                />
              ))}
              <div className="self-start mt-[52px] shrink-0">
                <button
                  type="button"
                  onClick={() => setColunasDialogOpen(true)}
                  className="flex flex-col items-center justify-center w-52 sm:w-64 lg:w-72 min-w-[208px] sm:min-w-[256px] lg:min-w-[288px] h-[180px] rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary gap-2 group"
                >
                  <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <Plus className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm">Adicionar Etapa</span>
                </button>
              </div>
            </div>
          </DragDropContext>
        ) : null}
        {!isLoading && !showKanban && (
          <div className="flex min-w-0 flex-1 min-h-0 flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1 flex flex-col min-h-0">
              <div className="mb-4 shrink-0">
                {someSelected && (
                  <div className="flex flex-wrap items-center gap-2">
                    {podeExcluir && (
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                        <Trash2 className="h-4 w-4" />
                        Excluir {selectedCount}
                      </Button>
                    )}
                    {/* Sem este botão, a única saída era a caixa do cabeçalho — e ela
                        trabalha por página. Mesmo padrão da tela de Clientes
                        (Clientes.tsx), para as duas listas se comportarem igual. */}
                    <Button variant="ghost" size="sm" onClick={limparSelecao}>
                      Limpar seleção
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {selectedCount} de {totalCount} selecionado(s)
                    </span>
                  </div>
                )}
              </div>

              <div ref={tableViewportRef} className="w-full rounded-xl border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
                <Table wrapperClassName="flex-1 min-h-0" className="table-fixed" style={{ width: tableTotalWidth }}>
                  <colgroup>
                    <col style={{ width: CHECKBOX_COL_WIDTH }} />
                    {visibleColumnDefs.map((col, i) => (
                      <col key={col.id} style={{ width: resolvedColWidths[i] }} />
                    ))}
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 h-14 px-2.5">
                        <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                      </TableHead>
                      {visibleColumnDefs.map((col, i) => {
                        // Só coluna do sistema pode ordenar. Coluna criada pela importação vive
                        // dentro de `campos_extras` e pode até nascer com um id parecido com o de
                        // uma padrão — ordenar por ela mandaria o banco ordenar por outra coisa.
                        // ('pdf_url' é o id legado de "Anexo", tratado como padrão aqui pelo
                        // mesmo motivo que PedidoRow o trata.)
                        const eColunaDoSistema = col.id === 'pdf_url' || PEDIDOS_COLUMNS.some(c => c.id === col.id);
                        const ordenavel = eColunaDoSistema ? ORDENACAO_DA_LISTA[col.id] : undefined;

                        // ORDENAR E REDIMENSIONAR NO MESMO CABEÇALHO, sem um atrapalhar o outro.
                        // O jeito ingênuo — pôr o clique de ordenar no <th> inteiro — quebra na
                        // hora: arrastar a borda para alargar a coluna termina em clique, e a
                        // lista reordena sozinha quando ninguém pediu. Aqui os dois gestos têm
                        // alvos separados: quem ordena é um botão no meio do cabeçalho, e a alça
                        // de arraste é um elemento IRMÃO dele, colado na borda direita, que
                        // ainda interrompe a propagação do evento assim que o ponteiro desce
                        // (SortableTh + use-column-resize). São exatamente os mesmos cabeçalhos
                        // de Clientes e Obras, onde as duas coisas já convivem há tempo.
                        //
                        // A coluna que NÃO sabe se ordenar continua com o cabeçalho de antes,
                        // sem a setinha — é o que deixa visível, sem ninguém explicar, quais
                        // colunas respondem ao clique.
                        if (ordenavel) {
                          return (
                            <SortableTh
                              key={col.id}
                              label={getLabel(col.id)}
                              sortKey={col.id}
                              currentSortKey={ordenacao?.colId ?? null}
                              currentDirection={ordenacao?.direction ?? 'desc'}
                              onSort={handleSort}
                              ascLabel={ordenavel.asc}
                              descLabel={ordenavel.desc}
                              width={resolvedColWidths[i]}
                              onResize={(w) => setColumnWidth(col.id, w)}
                            />
                          );
                        }

                        return (
                          <ResizableTh
                            key={col.id}
                            width={resolvedColWidths[i]}
                            onResize={(w) => setColumnWidth(col.id, w)}
                            className={cn(
                              "whitespace-nowrap h-14 px-2.5 text-xs font-semibold",
                              col.id === 'acoes' && "text-center"
                            )}
                          >
                            {getLabel(col.id)}
                          </ResizableTh>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tableVisibleColumns.length + 1} className="p-0 overflow-visible">
                          <div
                            className="sticky left-0 flex items-center justify-center py-12 text-muted-foreground"
                            style={{ width: tableViewportWidth || '100%' }}
                          >
                            Nenhum negócio encontrado
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(p => (
                        <PedidoRow
                          key={p.id}
                          pedido={p}
                          selected={deleteAllFilteredMode ? !excludedIds.has(p.id) : selected.has(p.id)}
                          onToggle={() => toggleOne(p.id)}
                          onClick={() => setViewOrderId(p.id)}
                          visibleColumns={tableVisibleColumns}
                          columns={columns}
                          KANBAN_STAGES={KANBAN_STAGES}
                          getLabel={getLabel}
                          stageLabel={stageLabel}
                          temObras={temObras}
                          qtdParticipantes={participantesPorNegocio?.get(p.id)?.length ?? 0}
                          nomesDosParticipantes={(participantesPorNegocio?.get(p.id) ?? []).map(r => r.nome).join(', ')}
                        />
                      ))

                    )}
                  </TableBody>
                </Table>
                <ListPagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
                  itemLabel="negócio"
                  itemLabelPlural="negócios"
                  className="border-t border-border/60 bg-card px-3 py-3 sm:px-4"
                />
              </div>
            </div>
            {selectedOrder && (
              <div className="w-full xl:w-80 xl:shrink-0">
                <Card className="xl:sticky xl:top-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Histórico de Contatos</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const p = pedidos?.find(p => p.id === selectedOrder);
                        return p ? getNomeNegocio(p) : '';
                      })()}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-80">
                      <div className="space-y-4">
                        {!contatos?.length ? (
                          <p className="text-xs text-muted-foreground text-center py-8">Nenhum contato registrado</p>
                        ) : (
                          contatos.map(contact => {
                            const Icon = contactIcons[contact.tipo] ?? MessageSquare;
                            return (
                              <div key={contact.id} className="flex gap-3">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Icon className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <div>
                                  <p className="text-xs text-card-foreground">{contact.descricao}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {new Date(contact.data_contato).toLocaleDateString('pt-BR')} · {(contact.vendedor as any)?.nome}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={(open) => { setConfirmDeleteOpen(open); if (!open) setDeleteConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedCount} negócio(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os itens e histórico de contatos vinculados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAllFilteredMode && (
            <p className="text-sm font-medium text-foreground -mt-2">
              {selectedCount} negócios{excludedIds.size === 0 ? ` · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm-input" className="text-xs text-muted-foreground">
              Para confirmar, digite <strong className="text-foreground">APAGAR</strong>
            </Label>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="APAGAR"
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeleting || deleteConfirmText.trim().toUpperCase() !== 'APAGAR'}
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Removendo...</> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Espelho do diálogo de marcar, logo abaixo. As duas pontas fazem a mesma
          pergunta de propósito: perguntar só ao marcar era o que fazia a caixa
          parecer que desmarcava tudo quando desmarcava só a página. */}
      <AlertDialog open={desmarcarDialogOpen} onOpenChange={setDesmarcarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desmarcar negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desmarcar apenas os {selecionadosNaPagina} negócio(s) desta página ou limpar a seleção inteira, com {selectedCount} negócio(s)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={desmarcarPaginaSomente}>Apenas esta página ({selecionadosNaPagina})</Button>
            <Button variant="default" onClick={limparSelecaoPeloDialogo}>Limpar tudo ({selectedCount})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={selectAllDialogOpen} onOpenChange={setSelectAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja selecionar apenas os {currentPageIds.length} negócio(s) desta página ou todos os {totalCount} negócio(s) filtrados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={selectPageOnly}>Apenas esta página ({currentPageIds.length})</Button>
            <Button variant="default" onClick={selectAllFiltered}>Todos ({totalCount})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mesma pergunta, agora para o checkbox do cabeçalho da tabela DENTRO do modal de Ação em massa. */}
      <AlertDialog open={bulkSelectAllDialogOpen} onOpenChange={setBulkSelectAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja selecionar apenas os {bulkPickerPagina.length} negócio(s) desta página ou todos os {bulkPickerTotalCount} negócio(s) do recorte atual?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={bulkSelecionarPaginaSomente}>Apenas esta página ({bulkPickerPagina.length})</Button>
            <Button variant="default" onClick={bulkSelecionarTodosFiltrados}>Todos ({bulkPickerTotalCount})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDesmarcarDialogOpen} onOpenChange={setBulkDesmarcarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desmarcar negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desmarcar apenas os {bulkSelecionadosNaPagina} negócio(s) desta página ou limpar a seleção inteira, com {bulkApplyCount} negócio(s)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={bulkDesmarcarPaginaSomente}>Apenas esta página ({bulkSelecionadosNaPagina})</Button>
            <Button variant="default" onClick={bulkLimparSelecaoPeloDialogo}>Limpar tudo ({bulkApplyCount})</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockedMove} onOpenChange={(open) => { if (!open) setBlockedMove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível mover para "{blockedMove?.targetLabel}"</AlertDialogTitle>
            <AlertDialogDescription>
              Preencha os campos obrigatórios desta etapa antes de mover o negócio: {blockedMove?.missingLabels.join(', ')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={() => { if (blockedMove) navigate(`/pedidos/${blockedMove.pedidoId}/editar`); setBlockedMove(null); }}>
              Editar negócio
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ação em massa</DialogTitle>
            <DialogDescription>
              Altera a etapa e/ou o marcador de vários negócios de uma vez.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
            {/* Picker: mesma lógica de tabela paginada da tela, dentro do modal */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <ListChecks className="h-3.5 w-3.5" />
                  Negócios do funil
                  <Badge variant="secondary" className="font-normal normal-case">{bulkPickerTotalCount}</Badge>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={bulkMarcarPaginaIds}
                >
                  Selecionar página
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={bulkPickerSearch}
                    onChange={(e) => { setBulkPickerSearch(e.target.value); setBulkPickerPage(1); }}
                    placeholder={placeholderBuscaNegocios}
                    className="h-9 pl-8"
                  />
                </div>
                <FilterButton
                  hasFilters={bulkPickerStages.length > 0 || bulkPickerVendedorIds.length > 0 || bulkPickerMarcadorIds.length > 0 || !!bulkPickerDateFrom || !!bulkPickerDateTo}
                  activeFilterCount={(bulkPickerStages.length > 0 ? 1 : 0) + (bulkPickerVendedorIds.length > 0 ? 1 : 0) + (bulkPickerMarcadorIds.length > 0 ? 1 : 0) + ((bulkPickerDateFrom || bulkPickerDateTo) ? 1 : 0)}
                  onClear={() => {
                    setBulkPickerStages([]);
                    setBulkPickerVendedorIds([]);
                    setBulkPickerMarcadorIds([]);
                    setBulkPickerDateFrom(undefined);
                    setBulkPickerDateTo(undefined);
                    setBulkPickerDateField('data_pedido');
                    setBulkPickerPage(1);
                  }}
                  align="end"
                  popoverClassName="w-64"
                >
                  <div className="flex flex-col gap-1">
                    <StandardPopoverMenu
                      label="Etapa"
                      icon={LayoutGrid}
                      badge={bulkPickerStages.length > 0 ? bulkPickerStages.length : undefined}
                      side="left"
                      align="start"
                      sideOffset={10}
                      popoverClassName="w-60"
                    >
                      <div className="space-y-1">
                        {KANBAN_STAGES.map(s => (
                          <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                            <Checkbox
                              checked={bulkPickerStages.includes(s.key)}
                              onCheckedChange={() => {
                                toggleFilter(bulkPickerStages, setBulkPickerStages, s.key);
                                setBulkPickerPage(1);
                              }}
                            />
                            {s.label}
                          </label>
                        ))}
                      </div>
                    </StandardPopoverMenu>

                    <StandardPopoverMenu
                      label="Responsável"
                      icon={User}
                      badge={bulkPickerVendedorIds.length > 0 ? bulkPickerVendedorIds.length : undefined}
                      side="left"
                      align="start"
                      sideOffset={10}
                      popoverClassName="w-60"
                    >
                      <ScrollArea className="h-60">
                        <div className="space-y-1 pr-3">
                          {(vendedores ?? []).map(v => (
                            <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                              <Checkbox
                                checked={bulkPickerVendedorIds.includes(v.id)}
                                onCheckedChange={() => {
                                  toggleFilter(bulkPickerVendedorIds, setBulkPickerVendedorIds, v.id);
                                  setBulkPickerPage(1);
                                }}
                              />
                              {v.nome}
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </StandardPopoverMenu>

                    <StandardPopoverMenu
                      label="Marcador"
                      icon={Tag}
                      badge={bulkPickerMarcadorIds.length > 0 ? bulkPickerMarcadorIds.length : undefined}
                      side="left"
                      align="start"
                      sideOffset={10}
                      popoverClassName="w-60"
                    >
                      <FilterCheckboxList
                        options={(marcadores ?? []).map(m => ({ value: m.id, label: m.nome }))}
                        selected={bulkPickerMarcadorIds}
                        onToggle={(id) => {
                          toggleFilter(bulkPickerMarcadorIds, setBulkPickerMarcadorIds, id);
                          setBulkPickerPage(1);
                        }}
                        searchPlaceholder="Buscar marcador..."
                        emptyMessage="Nenhum marcador cadastrado."
                      />
                    </StandardPopoverMenu>

                    <StandardPopoverMenu
                      label="Período"
                      icon={CalendarIcon}
                      badge={(bulkPickerDateFrom || bulkPickerDateTo) ? 'Ativo' : undefined}
                      side="left"
                      align="start"
                      sideOffset={10}
                      popoverClassName="w-64"
                    >
                      <div className="space-y-4 p-2">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            Filtrar por
                          </p>
                          <ToggleGroup
                            type="single"
                            value={bulkPickerDateField}
                            onValueChange={(v) => { if (v) { setBulkPickerDateField(v as PeriodoDateField); setBulkPickerPage(1); } }}
                            className={cn(TOGGLE_LIST_CLASS, "w-full")}
                          >
                            <ToggleGroupItem value="data_pedido" className={cn(TOGGLE_ITEM_CLASS, "flex-1")}>
                              Criação
                            </ToggleGroupItem>
                            <ToggleGroupItem value="prazo_resposta" className={cn(TOGGLE_ITEM_CLASS, "flex-1")}>
                              Fechamento
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            Data Início
                          </p>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "w-full justify-start text-left font-normal h-9",
                                  !bulkPickerDateFrom && "text-muted-foreground"
                                )}
                              >
                                {bulkPickerDateFrom ? format(bulkPickerDateFrom, "dd/MM/yyyy") : "Selecione..."}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              {/* Mesma correção do filtro do pipeline: abre no mês da data já
                                  escolhida em vez de no mês atual. Ver o comentário longo no
                                  filtro "Período" acima. */}
                              <Calendar
                                mode="single"
                                selected={bulkPickerDateFrom}
                                defaultMonth={bulkPickerDateFrom}
                                onSelect={handleBulkPickerDateFromSelect}
                                locale={ptBR}
                                captionLayout="dropdown-buttons"
                                fromYear={1950}
                                toYear={new Date().getFullYear()}
                                className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            Data Fim
                          </p>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "w-full justify-start text-left font-normal h-9",
                                  !bulkPickerDateTo && "text-muted-foreground"
                                )}
                              >
                                {bulkPickerDateTo ? format(bulkPickerDateTo, "dd/MM/yyyy") : "Selecione..."}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              {/* Cai no mês da Data Início enquanto a Data Fim estiver vazia. */}
                              <Calendar
                                mode="single"
                                selected={bulkPickerDateTo}
                                defaultMonth={bulkPickerDateTo ?? bulkPickerDateFrom}
                                onSelect={handleBulkPickerDateToSelect}
                                initialFocus
                                locale={ptBR}
                                captionLayout="dropdown-buttons"
                                fromYear={1950}
                                toYear={new Date().getFullYear()}
                                className="[&_.rdp-nav]:hidden [&_.rdp-caption_label]:hidden"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </StandardPopoverMenu>
                  </div>
                </FilterButton>
              </div>

              {/* Card único (borda arredondada compartilhada): corpo com header fixo + linhas
                  roláveis, e um rodapé de paginação preso dentro da mesma caixa — igual ao
                  header, não some nem faz parte da área que borra durante o refetch. */}
              <div className="rounded-lg border overflow-hidden">
                <div className="relative">
                  {isBulkPickerLoading ? (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando negócios...
                    </div>
                  ) : (bulkPickerData?.data ?? []).length === 0 ? (
                    <p className="flex h-80 items-center justify-center text-center text-sm text-muted-foreground">Nenhum negócio encontrado.</p>
                  ) : (
                    // Mesmas colunas configuradas na tabela da tela (reaproveita PedidoRow) — clicar
                    // numa linha abre os detalhes do negócio (mesmo painel da tela) pra conferir se é
                    // o negócio certo antes de aplicar a alteração em massa.
                    <>
                      {isBulkPickerFetching && (
                        // top-12 pula a faixa do header (h-12 do TableHead) — o blur cobre só as
                        // linhas, deixando o cabeçalho sempre nítido/legível.
                        <div className="absolute inset-x-0 bottom-0 top-12 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      )}
                      <Table wrapperClassName="h-80">
                        <TableHeader className="sticky top-0 z-10 bg-muted">
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-10 px-2.5">
                              {/* Marcar aqui pergunta "só esta página ou todos os N?" quando há mais
                                  de uma página; a decisão das 7 respostas vive em selecao-em-massa.ts. */}
                              <Checkbox
                                checked={bulkPaginaTodaSelecionada}
                                aria-label="Selecionar todos"
                                onCheckedChange={bulkToggleTodos}
                              />
                            </TableHead>
                            {columns.filter(col => tableVisibleColumns.includes(col.id)).map(col => (
                              <TableHead key={col.id} className="whitespace-nowrap px-2.5 text-xs font-semibold">
                                {getLabel(col.id)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(bulkPickerData?.data ?? []).map(p => (
                            <PedidoRow
                              key={p.id}
                              pedido={p}
                              selected={bulkPickerTodosFiltrados ? !bulkPickerExcluidos.has(p.id) : bulkSelected.has(p.id)}
                              onToggle={() => {
                                if (bulkPickerTodosFiltrados) {
                                  setBulkPickerExcluidos(prev => {
                                    const next = new Set(prev);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.add(p.id);
                                    return next;
                                  });
                                } else {
                                  setBulkSelected(prev => {
                                    const next = new Map(prev);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.set(p.id, { nome: getNomeNegocio(p), status: p.status });
                                    return next;
                                  });
                                }
                              }}
                              onClick={() => setViewOrderId(p.id)}
                              visibleColumns={tableVisibleColumns}
                              columns={columns}
                              KANBAN_STAGES={KANBAN_STAGES}
                              getLabel={getLabel}
                              stageLabel={stageLabel}
                              temObras={temObras}
                              qtdParticipantes={participantesPorNegocio?.get(p.id)?.length ?? 0}
                              nomesDosParticipantes={(participantesPorNegocio?.get(p.id) ?? []).map(r => r.nome).join(', ')}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </div>
                <div className="border-t bg-muted/40 px-2.5 py-2">
                  <ListPagination
                    page={bulkPickerPage}
                    totalPages={bulkPickerTotalPages}
                    totalItems={bulkPickerTotalCount}
                    pageSize={bulkPickerPageSize}
                    onPageChange={setBulkPickerPage}
                    onPageSizeChange={(nextPageSize) => { setBulkPickerPageSize(nextPageSize); setBulkPickerPage(1); }}
                    itemLabel="negócio"
                    itemLabelPlural="negócios"
                  />
                </div>
              </div>
            </div>

            {/* Painel de selecionados: fica visível independente da página do picker */}
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Selecionados
                  <Badge className="font-normal normal-case">{bulkApplyCount}</Badge>
                </p>
                {(bulkPickerTodosFiltrados || bulkSelected.size > 0) && (
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={bulkLimparSelecao}>
                    Limpar
                  </Button>
                )}
              </div>
              <div className="h-80 overflow-y-auto space-y-1">
                {bulkPickerTodosFiltrados ? (
                  <div className="space-y-2 rounded-md border bg-background px-2.5 py-2 text-xs">
                    <p className="font-medium text-foreground">
                      Todos os {bulkPickerTotalCount.toLocaleString('pt-BR')} negócios do recorte atual
                    </p>
                    {bulkPickerExcluidos.size > 0 && (
                      <p className="text-muted-foreground">
                        menos {bulkPickerExcluidos.size} desmarcado(s) à mão
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      A alteração roda no servidor com os filtros do picker. Para escolher um a um,
                      desmarque a caixa do cabeçalho da tabela.
                    </p>
                  </div>
                ) : bulkSelected.size === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground px-2">
                    Marque negócios na lista ao lado para adicioná-los aqui.
                  </p>
                ) : (
                  Array.from(bulkSelected.entries()).map(([id, info]) => (
                    <div key={id} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs">
                      <span className="flex-1 truncate" title={info.nome}>{info.nome}</span>
                      <button
                        type="button"
                        aria-label="Remover da seleção"
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setBulkSelected(prev => {
                          const next = new Map(prev);
                          next.delete(id);
                          return next;
                        })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary shrink-0" />
            {bulkApplyCount} negócio(s) será(ão) atualizado(s)
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Alterar para
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox checked={bulkApplyStatus} onCheckedChange={(v) => setBulkApplyStatus(!!v)} id="bulk-apply-status" />
                <Label htmlFor="bulk-apply-status" className="cursor-pointer font-normal">Nova etapa</Label>
              </div>

              {/* De/Para explícito: mostra a(s) etapa(s) de origem dos negócios marcados antes da
                  seta, e o destino escolhido depois — evita o usuário aplicar uma "nova etapa" às
                  cegas sem saber de onde os negócios selecionados estão saindo. */}
              <div className="flex flex-wrap items-center gap-2 pl-7">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">De:</span>
                {bulkPickerTodosFiltrados ? (
                  bulkPickerStages.length > 0 ? (
                    bulkPickerStages.map(status => (
                      <Badge key={status} className={cn(getStageBadgeClass(stageColorToken(status)), "font-normal normal-case")}>
                        {stageLabel(status)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">todas as etapas do recorte</span>
                  )
                ) : bulkOriginStages.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">selecione negócios na lista</span>
                ) : (
                  bulkOriginStages.map(({ status, count }) => (
                    <Badge key={status} className={cn(getStageBadgeClass(stageColorToken(status)), "font-normal normal-case gap-1")}>
                      {stageLabel(status)}
                      <span className="opacity-80">× {count}</span>
                    </Badge>
                  ))
                )}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Para:</span>
                <Select value={bulkNewStatus} onValueChange={setBulkNewStatus} disabled={!bulkApplyStatus}>
                  <SelectTrigger className="h-8 flex-1 min-w-[160px] bg-background">
                    <SelectValue placeholder="Selecionar etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox checked={bulkApplyMarcador} onCheckedChange={(v) => setBulkApplyMarcador(!!v)} id="bulk-apply-marcador" />
              <Label htmlFor="bulk-apply-marcador" className="w-28 shrink-0 cursor-pointer font-normal">Novo marcador</Label>
              {/* SearchableSelect igual ao "Novo responsável" logo abaixo: são 17 opções e este é
                  o campo que grava a mudança em TODOS os negócios marcados — errar aqui por não
                  achar o marcador na rolagem custa caro. O desabilitado é feito por classe porque
                  o componente não tem propriedade `disabled`, mesmo padrão já usado ao lado. */}
              <SearchableSelect
                options={[{ value: 'nenhum', label: 'Nenhum' }, ...(marcadores ?? []).map(m => ({ value: m.id, label: m.nome }))]}
                value={bulkNewMarcadorId}
                onValueChange={setBulkNewMarcadorId}
                placeholder="Selecionar marcador"
                className={cn("flex-1 bg-background", !bulkApplyMarcador && "opacity-50 pointer-events-none")}
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox checked={bulkApplyVendedor} onCheckedChange={(v) => setBulkApplyVendedor(!!v)} id="bulk-apply-vendedor" />
              <Label htmlFor="bulk-apply-vendedor" className="w-28 shrink-0 cursor-pointer font-normal">Novo responsável</Label>
              <SearchableSelect
                options={(vendedores ?? []).map(v => ({ value: v.id, label: v.nome }))}
                value={bulkNewVendedorId}
                onValueChange={setBulkNewVendedorId}
                placeholder="Selecionar responsável"
                className={cn("flex-1 bg-background", !bulkApplyVendedor && "opacity-50 pointer-events-none")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} disabled={isBulkUpdating}>Cancelar</Button>
            <Button
              onClick={handleBulkApply}
              disabled={
                isBulkUpdating ||
                bulkApplyCount === 0 ||
                (!bulkApplyStatus && !bulkApplyMarcador && !bulkApplyVendedor) ||
                (bulkApplyStatus && !bulkNewStatus) ||
                (bulkApplyMarcador && !bulkNewMarcadorId) ||
                (bulkApplyVendedor && !bulkNewVendedorId)
              }
            >
              {isBulkUpdating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Aplicando...</> : `Aplicar a ${bulkApplyCount} negócio(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importDialogMounted && (
        <Suspense fallback={null}>
          <ImportPedidosDialog open={importOpen} onOpenChange={setImportOpen} />
        </Suspense>
      )}
      <ImportDialog
        open={importAiOpen}
        importType="negocios"
        onOpenChange={(v) => {
          setImportAiOpen(v);
          if (!v) queryClient.invalidateQueries({ queryKey: ['pedidos'] });
        }}
      />
      
      <KanbanColunasDialog
        open={colunasDialogOpen}
        onOpenChange={setColunasDialogOpen}
        empresaId={empresaId}
        funilId={funilId}
        funilNome={funis?.find(f => f.id === funilId)?.nome}
        funis={funis}
        visibleSlugs={visibleKanbanStages}
        onToggleVisibility={toggleKanbanStage}
        onResetVisibility={toggleAllKanbanStages}
      />

      <MarcadoresDialog
        open={marcadoresDialogOpen}
        onOpenChange={setMarcadoresDialogOpen}
        empresaId={empresaId}
      />

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar negócios</DialogTitle>
            {/* Diz QUANTOS negócios vão sair no arquivo, e o número é diferente por formato —
                por isso os dois aparecem. O Excel passou a cobrir o recorte filtrado inteiro
                (busca no servidor, ver handleExportExcel). O PDF continua com o que está na
                tela de propósito: um PDF do funil da MD teria mais de 250 páginas e o navegador
                monta esse arquivo inteiro na memória. Prometer "11.906" nos dois e entregar a
                página num deles seria a mesma armadilha de antes, só que ao contrário. */}
            <DialogDescription>
              {exportTargetId
                ? 'Escolha o formato do arquivo a ser gerado.'
                : `Excel: os ${totalCount.toLocaleString('pt-BR')} negócios do filtro atual. PDF: os ${(showKanban ? kanbanPedidosFlat.length : pedidos.length).toLocaleString('pt-BR')} que estão carregados na tela agora.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleExportFormatChoice('pdf')}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all"
            >
              <FileDown className="h-6 w-6 text-muted-foreground" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => handleExportFormatChoice('xlsx')}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all"
            >
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              Excel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recorte grande: avisa antes em vez de congelar a aba. O custo é real e dá para
          descrever com honestidade — são idas ao servidor de 1.000 em 1.000 (teto do servidor,
          ver PEDIDOS_LOTE_EXPORTACAO) e depois a montagem da planilha aqui no navegador. */}
      <AlertDialog open={confirmExportOpen} onOpenChange={setConfirmExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar {totalCount.toLocaleString('pt-BR')} negócios?</AlertDialogTitle>
            <AlertDialogDescription>
              A planilha vai sair com o filtro inteiro, não só com a página que está na tela.
              São {Math.ceil(totalCount / PEDIDOS_LOTE_EXPORTACAO)} buscas no servidor até juntar
              tudo, e nesse tempo a tela fica ocupada — normalmente algumas dezenas de segundos.
              Se você quer só uma amostra, dá para filtrar mais antes de exportar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleExportExcel(exportTargetId)}>
              Exportar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewOrderSheet}
      {/* Cinto e suspensório: os dois únicos gatilhos que abrem estes diálogos já estão
          dentro do bloco escondido acima, então eles nasceriam com `open={false}` de
          qualquer jeito. Vale mesmo assim — impede que um gatilho novo, colado ali no
          futuro, ressuscite a tela de tarefas numa empresa que não contratou. */}
      {temTarefas === true && (<>{addTarefaDialog}{editTarefaDialog}</>)}
      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
    </AppLayout>
  );
};

export default Negocios;

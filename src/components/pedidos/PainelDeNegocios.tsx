import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { ColumnSettings, type ColumnDefinition } from '@/components/shared/ColumnSettings';
import { ListPagination } from '@/components/shared/ListPagination';
import { LinkAnexoPrivado } from '@/components/shared/LinkAnexoPrivado';
import { SortableTh, type SortDirection } from '@/components/shared/SortableTh';
import { PainelDoNegocio } from '@/components/pedidos/PainelDoNegocio';
import { useAuth } from '@/hooks/use-auth';
import { useFabricantes } from '@/hooks/use-clientes';
import { useKanbanColunasEmpresa } from '@/hooks/use-kanban-colunas';
import { useNegocioNoEndereco } from '@/hooks/use-negocio-no-endereco';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useTableSettings } from '@/hooks/use-table-settings';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { parseMoedaBRL } from '@/lib/moeda';
import { compararFabricantes, fabricanteEstaAtivo } from '@/lib/ordem-de-fabricantes';

/**
 * O painel de negócios de uma ficha — o MESMO na empresa e no contato.
 *
 * 🔴 POR QUE ISTO VIROU UM COMPONENTE, em 06/09/2026. A ficha da empresa tinha este painel
 * inteiro: colunas que se arrastam, filtros, ordenação por qualquer cabeçalho, paginação e o
 * clique na linha abrindo o negócio. A ficha do CONTATO tinha outra coisa — uma tabela fixa de
 * cinco linhas, quatro colunas, sem filtro nem ordenação, com um botão "Ver Negócio" que
 * chamava `navigate('/app')` e portanto não levava a negócio nenhum.
 *
 * O dono do produto pediu literalmente: "tome o de empresas como referência e padrão a se
 * seguir e corrija esse em contatos". Copiar o código atenderia ao pedido de hoje e recriaria o
 * problema de amanhã — foi copiando que as duas telas chegaram a esse estado. Então o painel
 * saiu de `ClienteDetalhe` e passou a viver aqui, com as duas fichas chamando o mesmo código.
 *
 * 🔴 A CONFIGURAÇÃO DE COLUNAS É COMPARTILHADA entre as duas fichas (chave `clientes_negocios`),
 * por decisão do dono do produto em 06/09/2026: arrumar as colunas uma vez vale nos dois
 * lugares, e é isso que impede os painéis de divergirem de novo.
 *
 * Ela continua SEPARADA da lista principal de Negócios, e isso não mudou: são 14 colunas lá, e
 * compartilhar a chave derrubaria todas elas dentro deste card — além de fazer uma reordenação
 * aqui mexer na tela principal, e vice-versa.
 *
 * Quem recorta os negócios é quem chama: a ficha da empresa manda os do cliente, a do contato
 * manda os da empresa do contato. Este componente não decide de quem é a lista.
 *
 * 🔴 CLICAR NUMA LINHA ABRE `PainelDoNegocio`, O MESMO DE TODAS AS TELAS — desde 09/09/2026.
 * Até aqui esta lista tinha um diálogo próprio de detalhe: nome, obra, fabricante, valor, data,
 * etapa e observações, e mais nada. Era uma TERCEIRA versão do detalhe do negócio, e a mais
 * pobre das três — sem responsáveis, sem contatos, sem anexo, sem campos extras, sem tarefas,
 * sem histórico de movimentação e sem comentários. O guarda que existe contra essa cópia
 * (`src/test/painel-do-negocio-e-uma-peca-so.test.ts`) não a pegava porque ela era pobre demais
 * para ter as marcas que ele procura — ela não buscava o negócio nem recebia o formato completo,
 * desenhava o que já estava na linha da tabela. Segunda cópia não se descobre por teste de
 * comportamento: cada uma passa nos seus próprios testes (CLAUDE.md §7.14).
 *
 * Este componente MONTA o painel, e é o único do plano que monta: as duas fichas que o desenham
 * não montam painel de negócio nenhum. Ver o bloco no fim do JSX para o que não é passado a ele.
 */

// Os ids são os MESMOS de PEDIDOS_COLUMNS (Negocios.tsx), para as três telas falarem a mesma
// língua. Não tem coluna "Cliente" (numa ficha ele é sempre o mesmo) nem "Ações" (a linha
// inteira já abre o negócio).
const NEGOCIOS_COLUMNS: ColumnDefinition[] = [
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

// Exatamente as quatro colunas que as duas fichas já mostravam: quem nunca mexer na
// configuração continua vendo a mesma tabela de sempre.
const NEGOCIOS_DEFAULT_VISIBLE = ['fabricante', 'valor', 'etapa', 'data_pedido'];

/**
 * Formata datas ISO ("aaaa-mm-dd" ou timestamp completo) para dd/mm/aaaa sem passar por
 * conversão de fuso do navegador (o valor já representa a data salva pelo backend).
 */
const formatDateBR = (value?: string | null) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
};

/* -------------------------------------------------------------------------------------------
 * ORDENAÇÃO — no navegador, de propósito.
 *
 * A lista de Negócios manda a ordenação para o banco porque ela é paginada NO SERVIDOR:
 * ordenar ali no navegador reordenaria só as 25 linhas que vieram, e a tela mostraria "os
 * maiores valores" de uma página qualquer. Aqui o caso é o oposto — a ficha recebe TODOS os
 * negócios de uma vez, e a paginação desta tabela é só um recorte do array que já está na
 * memória. Ordenar o array inteiro antes de recortar dá a ordem certa, sem tocar em consulta.
 *
 * É por isso também que aqui TODA coluna sabe se ordenar, inclusive as que a lista principal
 * precisou deixar de fora (Negócio, Fabricante, Responsável, Etapa, Marcador, Contato,
 * Observações e as colunas criadas pela importação). Lá o impedimento era do banco: nome do
 * negócio nulo em toda a base, junção interna que descarta linha sem par, e a coluna `status`
 * guardando o apelido da etapa ("enviado") em vez do nome que aparece na tela ("Orçamento
 * Enviado"). Nada disso existe quando o valor já está na mão: aqui ordenamos exatamente o mesmo
 * valor que a célula mostra, então o que a pessoa lê é o que ordena.
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
const ORDENACAO_NEGOCIOS: Record<string, { tipo: TipoDeOrdenacao; asc?: string; desc?: string }> = {
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
  // "Observações" NÃO ordena, pelo mesmo motivo da lista principal: 11.898 dos 11.911 negócios
  // têm o campo vazio. Medido na ficha: em 704 dos 708 clientes com dois ou mais negócios, as
  // duas direções devolvem a lista IDÊNTICA. Um cabeçalho que responde a mesma coisa nos dois
  // sentidos é pior que nenhum.
  // Anexo é coluna de SIM/NÃO, não de texto: o que ela responde é "quais negócios têm PDF".
  // Por isso não entra na regra do vazio-no-fim — "sem anexo" é uma resposta, não um buraco.
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

const configDeOrdenacao = (
  col: ColumnDefinition,
): { tipo: TipoDeOrdenacao; asc: string; desc: string } => {
  // Mesma checagem que a célula faz para decidir de onde tira o valor: coluna criada pela
  // importação pode nascer com um id parecido com o de uma padrão, e aí ordenar pela regra da
  // padrão ordenaria por outra coisa que não a que está na célula.
  const padrao = NEGOCIOS_COLUMNS.some(c => c.id === col.id) ? ORDENACAO_NEGOCIOS[col.id] : undefined;
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
 * ordem de dois negócios criados em dias vizinhos. Aceita também o "dd/mm/aaaa" que as colunas
 * de data criadas pela importação costumam guardar.
 */
const chaveDeData = (valor: string): string | null => {
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
};

const estaVazio = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

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

  // Texto em pt-BR: o acento entra na conta ("Álvaro" antes de "Amaro"), maiúscula não separa,
  // e `numeric` faz "Obra 2" vir antes de "Obra 10".
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
};

/**
 * Os embeds do negócio (fabricante, vendedor, obra) vêm de um join que o tipo gerado pelo
 * Supabase não descreve. Um tipo com nome, em vez de `as any` espalhado.
 */
type PedidoComEmbeds = {
  fabricante?: { id?: string; nome?: string } | null;
  vendedor?: { id?: string; nome?: string } | null;
  obra?: { id?: string; nome_obra?: string } | null;
};
const comEmbeds = (p: unknown) => (p ?? {}) as PedidoComEmbeds;

/**
 * O negócio como a ficha o lê para ORDENAR. Todo campo aqui é um campo que `valorParaOrdenar`
 * de fato consulta — declarar a mais só criaria a ilusão de garantia.
 */
type NegocioDaFicha = PedidoComEmbeds & {
  id?: string;
  nome?: string | null;
  status?: string | null;
  valor_total?: number | null;
  data_pedido?: string | null;
  prazo_resposta?: string | null;
  endereco_entrega?: string | null;
  observacoes?: string | null;
  pdf_url?: string | null;
  cliente?: { empresa?: string | null } | null;
  marcador?: { nome?: string | null; cor?: string | null } | null;
  campos_extras?: Record<string, unknown> | null;
};

interface PainelDeNegociosProps {
  /** Os negócios que esta ficha mostra. Quem recorta é quem chama. */
  pedidos: NegocioDaFicha[] | undefined;
  carregando?: boolean;
  titulo?: string;
  /** Texto do estado vazio — a ficha do contato explica que os negócios vêm da empresa. */
  mensagemVazio?: string;
  /** Quando existe, desenha o botão "Novo Negócio". */
  aoCriarNegocio?: () => void;
}

export function PainelDeNegocios({
  pedidos,
  carregando = false,
  titulo = 'Negócios',
  mensagemVazio = 'Nenhum negócio encontrado para este cliente.',
  aoCriarNegocio,
}: PainelDeNegociosProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { ligada: temObras } = useSecaoLigada('obras');
  const { data: kanbanColunasEmpresa = [] } = useKanbanColunasEmpresa(empresaId);

  // As etapas da empresa, agrupadas por apelido: a ficha lista negócios de funis diferentes, e
  // o mesmo apelido ("enviado") pode ter nomes distintos em cada funil. O primeiro ganha.
  const KANBAN_STAGES = useMemo(() => {
    const porSlug = new Map<string, { key: string; label: string; color: string }>();
    kanbanColunasEmpresa.forEach(c => {
      if (!porSlug.has(c.slug)) porSlug.set(c.slug, { key: c.slug, label: c.nome, color: c.cor });
    });
    return Array.from(porSlug.values());
  }, [kanbanColunasEmpresa]);

  const stageLabel = useCallback(
    (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key,
    [KANBAN_STAGES],
  );
  // Mesma construção de classe que Negocios.tsx:97 usa para a etiqueta de etapa.
  const stageBadgeClass = (key: string) =>
    `bg-${KANBAN_STAGES.find(s => s.key === key)?.color || 'muted-foreground'} text-white`;

  // O negócio aberto vive no ENDEREÇO (`?negocio=<id>`), não em estado desta lista: assim
  // recarregar a ficha mantém o painel aberto, o voltar do navegador o fecha, e o link serve para
  // mandar a alguém — igual à tela de Negócios e à pauta "Hoje".
  //
  // Montar o hook AQUI é seguro mesmo que a tela em volta monte outra instância dele: desde o
  // commit 87dc7125 a marca de "fui eu que empurrei esta entrada" mora no `state` da própria
  // entrada do histórico, não num `useRef` por instância. Hoje nenhuma das duas fichas monta o
  // hook — nem mexe no endereço com `setSearchParams`, que é o outro jeito de apagar a marca (é o
  // que `Negocios.tsx` faz e por isso precisa repassar `state: location.state`).
  const { negocioAberto, abrirNegocio, fecharNegocio } = useNegocioNoEndereco();

  const [pedidosPage, setPedidosPage] = useState(1);
  const [pedidosPageSize, setPedidosPageSize] = useState(5);
  const [pedidosBusca, setPedidosBusca] = useState('');
  const [pedidosFiltroFabricante, setPedidosFiltroFabricante] = useState('todos');
  const [pedidosFiltroEtapa, setPedidosFiltroEtapa] = useState('todas');
  // `null` = a ordem em que os negócios chegam do banco (os mais recentes primeiro). Quem nunca
  // clicar num cabeçalho vê a tabela exatamente como via antes.
  const [ordenacaoNegocios, setOrdenacaoNegocios] = useState<OrdenacaoNegocios | null>(null);

  // Mesmo mecanismo de colunas da tela de Clientes e da lista de Negócios (arrastar para
  // reordenar, ligar/desligar, renomear, salvar modelo).
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
    defaultColumns: NEGOCIOS_COLUMNS,
    defaultVisibleColumns: NEGOCIOS_DEFAULT_VISIBLE,
  });

  // A ordem das colunas visíveis é a ordem da lista `columns` — é ela que o arrasta-e-solta
  // reordena, e é por isso que cabeçalho e células precisam sair sempre desta mesma variável.
  const negociosColunasVisiveis = useMemo(
    () => negociosColumns.filter(col => negociosVisibleColumns.includes(col.id)),
    [negociosColumns, negociosVisibleColumns],
  );

  const lista = useMemo(() => pedidos ?? [], [pedidos]);

  // O status Ativa/Inativa não vem no negócio: o embed de `pedidos` traz do fabricante só
  // `id, nome`. Quem sabe o status é o cadastro — daí este índice. É a MESMA consulta que o
  // resto do sistema já usa (mesma chave de cache), não uma busca a mais por causa desta tela.
  const { data: fabricantesCadastrados } = useFabricantes();
  const statusDoFabricante = useMemo(
    () => new Map((fabricantesCadastrados ?? []).map(f => [f.id, f.ativo !== false])),
    [fabricantesCadastrados],
  );

  // Esta lista é montada a partir dos NEGÓCIOS da ficha. O status entra como primeiro
  // desempate; marca sem status conhecido conta como ativa (ver ordem-de-fabricantes.ts).
  const fabricantesDaFicha = useMemo(() => {
    const mapa = new Map<string, string>();
    lista.forEach(p => {
      const fab = comEmbeds(p).fabricante;
      if (fab?.id) mapa.set(fab.id, fab.nome as string);
    });
    return Array.from(mapa, ([id, nome]) => ({
      id,
      nome,
      ativo: statusDoFabricante.get(id) ?? true,
    })).sort(compararFabricantes);
  }, [lista, statusDoFabricante]);

  const pedidosFiltrados = useMemo(() => {
    const termo = pedidosBusca.trim().toLowerCase();
    return lista.filter(p => {
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
  }, [lista, pedidosBusca, pedidosFiltroFabricante, pedidosFiltroEtapa]);

  const pedidosFiltrosAtivos =
    pedidosBusca.trim() !== '' || pedidosFiltroFabricante !== 'todos' || pedidosFiltroEtapa !== 'todas';

  /**
   * O valor pelo qual cada coluna ordena — o MESMO que a célula mostra. As duas funções têm a
   * mesma estrutura de propósito (primeiro a coluna criada pelo usuário, depois o `switch` das
   * padrão): se um dia uma célula mudar de fonte de dado, dá para ver na hora que a ordenação
   * precisa mudar junto.
   */
  const valorParaOrdenar = useCallback((p: NegocioDaFicha, colId: string): unknown => {
    const camposExtras = (p.campos_extras ?? {}) as Record<string, unknown>;
    if (!NEGOCIOS_COLUMNS.some(c => c.id === colId)) {
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
      case 'etapa': return stageLabel(p.status ?? '');
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
   * a tabela continuaria numa ordem que nenhum cabeçalho da tela explica.
   */
  const ordenacaoAtiva = useMemo(() => {
    if (!ordenacaoNegocios) return null;
    const col = negociosColunasVisiveis.find(c => c.id === ordenacaoNegocios.colId);
    if (!col) return null;
    return { colId: col.id, direction: ordenacaoNegocios.direction, ...configDeOrdenacao(col) };
  }, [ordenacaoNegocios, negociosColunasVisiveis]);

  // Ordena a lista JÁ FILTRADA (busca, fabricante, etapa), nunca a lista crua — senão o recorte
  // da página traria negócios que os filtros tinham tirado da tela.
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
  // maior, com cara de erro. Vale também quando a ordenação CAI porque a coluna foi escondida.
  useEffect(() => {
    setPedidosPage(1);
  }, [ordenacaoAtiva?.colId, ordenacaoAtiva?.direction]);

  const totalPedidosPages = Math.max(1, Math.ceil(pedidosFiltrados.length / pedidosPageSize));
  const paginatedPedidos = useMemo(
    () => pedidosOrdenados.slice((pedidosPage - 1) * pedidosPageSize, pedidosPage * pedidosPageSize),
    [pedidosOrdenados, pedidosPage, pedidosPageSize],
  );

  // Uma célula da tabela. Lê cada campo do mesmo jeito que a lista de Negócios lê
  // (Negocios.tsx, componente PedidoRow), para as telas nunca mostrarem coisas diferentes sobre
  // o mesmo negócio.
  const renderNegocioCell = (p: any, colId: string) => {
    const camposExtras = (p.campos_extras ?? {}) as Record<string, any>;
    const isColunaPadrao = NEGOCIOS_COLUMNS.some(c => c.id === colId);

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
        // A coluna é meio-obra, meio-endereço: o endereço de entrega é texto livre do próprio
        // negócio e continua valendo sem a seção Obras. Some só a reserva pelo nome da obra —
        // esconder a coluna inteira apagaria o endereço junto.
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
            {p.pdf_url ? <LinkAnexoPrivado url={p.pdf_url} /> : '—'}
          </TableCell>
        );
      default:
        return <TableCell key={colId}>—</TableCell>;
    }
  };

  return (
    <>
      <Card className="border-border/40">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{titulo}</CardTitle>
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
            {aoCriarNegocio && (
              <Button size="sm" onClick={aoCriarNegocio}>
                <Plus className="h-4 w-4 mr-1" /> Novo Negócio
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {lista.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    {/* A busca em si não muda (continua casando pelo nome da obra); o que muda
                        é a dica, para não oferecer uma palavra que a empresa sem a seção Obras
                        não reconhece. */}
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
                      {fabricantesDaFicha.map(f => (
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
                  colunas ganham o menu — os negócios da ficha já estão inteiros no navegador,
                  então nenhuma delas depende do banco para saber se ordenar. */}
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
                          {lista.length === 0
                            ? mensagemVazio
                            : 'Nenhum negócio encontrado com os filtros aplicados.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPedidos.map(p => (
                        // `p.id &&` porque `abrirNegocio` só sabe abrir um id de verdade: sem
                        // negócio nenhum, escrever `?negocio=` vazio no endereço deixaria o painel
                        // preso no estado "este negócio não está mais disponível".
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => p.id && abrirNegocio(p.id)}>
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

      {/* UM painel de detalhe para a ficha inteira, o MESMO que a tela de Negócios e a pauta
          "Hoje" abrem. Quem manda o id é o clique na linha, via `?negocio=` no endereço.

          Três propriedades opcionais NÃO são passadas, de propósito:

          • `onExcluir` — sem ela o botão Excluir nem é desenhado. Excluir negócio pela ficha do
            cliente não existe hoje e não foi pedido; a exclusão da tela de Negócios depende da
            máquina de seleção em massa de lá, que não existe aqui.
          • `negocioJaCarregado` — a ficha TEM o negócio em mãos (`usePedidosPorCliente` devolve
            `PedidoWithRelations`), mas mandá-lo daqui obrigaria o tipo local `NegocioDaFicha` a
            crescer para o formato completo, e ele é curto de propósito: todo campo dele é um campo
            que a ordenação de fato consulta. Sem a propriedade o painel busca por id sozinho —
            exatamente o caso para o qual `usePedidoPorId` existe —, e essa busca traz o `funil_id`
            de que o crachá da etapa precisa para não cair no slug cru.
          • `camposExtras` — a lista sai de `useTableSettings({ key: 'pedidos' })`, a preferência de
            colunas da TELA de Negócios, e este card já monta o mesmo hook com outra chave
            (`clientes_negocios`). Duas instâncias da MESMA chave na mesma árvore disputariam a
            mesma linha de `configuracoes_tabelas` — ver `camposExtras` em PainelDoNegocioProps. */}
      <PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />
    </>
  );
}

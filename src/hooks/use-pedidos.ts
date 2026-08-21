import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useRegistrarAtividade } from './use-historico-alteracoes';

export interface PedidoWithRelations {
  id: string;
  status: string;
  nome: string | null;
  valor_total: number | null;
  data_pedido: string;
  created_at: string;
  observacoes: string | null;
  cliente_id: string;
  fabricante_id: string;
  usuario_id: string;
  obra_id: string | null;
  endereco_entrega: string | null;
  prazo_resposta: string | null;
  pdf_url: string | null;
  campos_extras: Record<string, any> | null;
  marcador_id: string | null;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  obra: { id: string; nome_obra: string } | null;
  marcador: { id: string; nome: string; cor: string } | null;
}

/**
 * Qual coluna de data o filtro de período (dateFrom/dateTo) usa.
 *
 * - `data_pedido`     — a criação do negócio. Default e comportamento histórico.
 * - `prazo_resposta`  — a data de fechamento.
 *
 * POR QUE `prazo_resposta` E NÃO `fechado_em`: havia dois campos diferentes chamados
 * "Data de Fechamento" na interface. `fechado_em` é mantida por trigger e registra
 * quando o negócio entrou numa etapa final DENTRO do Repply; `prazo_resposta` é o que
 * a ficha e o formulário mostram como "Data de Fechamento", recebe a data vinda do
 * Bitrix na importação e é carimbada com a data de hoje quando o negócio entra numa
 * etapa final — pelo gatilho do banco, não por este arquivo (ver
 * supabase/migrations/20260821120100_data_fechamento_em_todos_os_caminhos.sql).
 *
 * Para negócio cadastrado à mão os dois coincidem. Para negócio importado, não: o
 * gatilho carimbou o momento da importação. Medido em 20/08/2026 na MD: dos 11.714
 * negócios importados com `fechado_em`, 11.653 estavam em 18/08 e 61 em 19/08 — a base
 * histórica inteira aparecia como fechada no dia da importação. Perguntar "quanto
 * vendemos em agosto" separava a venda importada da cadastrada à mão, e são a mesma
 * venda.
 *
 * `fechado_em` continua existindo como registro interno de transição de etapa
 * (20260811110000_pedidos_fechado_em.sql), mas não sustenta mais o filtro.
 */
export type PeriodoDateField = 'data_pedido' | 'prazo_resposta';

export interface PedidosFilters {
  stages?: string[];
  vendedorIds?: string[];
  fabricanteIds?: string[];
  marcadorIds?: string[];
  /** Escopa a busca a um único funil (pipeline). Sem isso, negócios de todos os funis da empresa aparecem juntos. */
  funilId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Qual data dateFrom/dateTo filtra — 'data_pedido' (criação, default) ou 'prazo_resposta' (fechamento). */
  dateField?: PeriodoDateField;
  onlyAttention?: boolean;
  /** Busca por cliente/fabricante — aplicada tanto na query de stats (RPC) quanto no fetch paginado da lista/kanban. */
  search?: string;
  /** Oculta negócios criados via importação em massa (import_hash preenchido). Não é enviado à
   *  query de stats (usePedidosStats) de propósito — os totais do cabeçalho continuam contando
   *  todos os negócios independente deste filtro visual. */
  hideImportados?: boolean;
}

async function resolveUsuarioIds(empresaId: string, vendedorIds?: string[]): Promise<string[]> {
  if (vendedorIds && vendedorIds.length > 0) return vendedorIds;
  const { data: companyUsers } = await supabase
    .from('usuarios')
    .select('id')
    .eq('empresa_id', empresaId);
  return companyUsers?.map(u => u.id) ?? [];
}

// Defesa em profundidade para o caminho de ids explícitos (seleção manual do usuário) das
// mutações em massa: a RLS já barra UPDATE/DELETE fora da empresa, mas aqui tratamos qualquer
// id fora dela como IDOR — hard stop antes de tocar no banco, em vez de deixar a RLS
// silenciosamente afetar 0 linhas para esses ids (o que mascararia o problema no retorno da
// mutação, já que o `count` combinaria os ids válidos com os inválidos sem distinção).
async function assertIdsBelongToEmpresa(ids: string[], empresaId: string): Promise<void> {
  const usuarioIds = await resolveUsuarioIds(empresaId);
  if (usuarioIds.length === 0) {
    throw new Error('Não foi possível validar a empresa dos negócios selecionados.');
  }
  const { data, error } = await supabase
    .from('pedidos')
    .select('id')
    .in('id', ids)
    .in('usuario_id', usuarioIds);
  if (error) throw error;
  const validIds = new Set((data ?? []).map(row => row.id));
  if (ids.some(id => !validIds.has(id))) {
    throw new Error('Um ou mais negócios selecionados não pertencem à sua empresa.');
  }
}

// "Fechamento" (ganho) e "Perdido" são etapas finais — nunca contam como "parado" pro filtro
// Atenção, já que o alerta de dias na etapa também não aparece pra elas no front. Usado tanto no
// fetch paginado quanto nas mutações em massa "por filtro", que precisam do mesmo recorte.
const ETAPAS_FINAIS_ATENCAO = '(fechamento,perdido)';

// Aplica dateFrom/dateTo na coluna certa conforme dateField. As duas colunas são DATE
// puro, então a comparação é direta — não precisa dos limites de início/fim de dia que
// o antigo fechado_em (timestamptz) exigia, nem de cast de coluna em filtro do
// PostgREST, que não é confiável via supabase-js. Compartilhado por usePedidos e pelas
// mutações em massa "por filtro", que precisam do mesmo recorte que a lista mostra.
export function applyDateRangeFilter<T extends { gte(column: string, value: string): T; lte(column: string, value: string): T }>(
  query: T,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  dateField: PeriodoDateField | undefined,
): T {
  const coluna = dateField === 'prazo_resposta' ? 'prazo_resposta' : 'data_pedido';
  if (dateFrom) query = query.gte(coluna, dateFrom);
  if (dateTo) query = query.lte(coluna, dateTo);
  return query;
}

export interface SearchMatches {
  clienteIds: string[];
  fabricanteIds: string[];
  obraIds: string[];
}

// Busca por texto casa contra colunas de tabelas relacionadas (cliente/fabricante/obra), que o
// PostgREST não filtra via `.or()` sobre um `.select()` com embeds — por isso resolvemos os ids
// que batem com o termo em consultas enxutas (cada uma já restrita pela RLS da respectiva tabela)
// e então filtramos pedidos por esses ids. Compartilhado pelo fetch paginado e pelas mutações em
// massa "por filtro", que precisam do mesmo recorte que o usuário vê na tela.
async function resolveSearchMatches(trimmedSearch: string): Promise<SearchMatches> {
  const [{ data: clienteMatches }, { data: fabricanteMatches }, { data: obraMatches }] = await Promise.all([
    supabase.from('clientes').select('id').ilike('empresa', `%${trimmedSearch}%`),
    supabase.from('fabricantes').select('id').ilike('nome', `%${trimmedSearch}%`),
    supabase.from('obras').select('id').ilike('nome_obra', `%${trimmedSearch}%`),
  ]);
  return {
    clienteIds: (clienteMatches ?? []).map(c => c.id),
    fabricanteIds: (fabricanteMatches ?? []).map(f => f.id),
    obraIds: (obraMatches ?? []).map(o => o.id),
  };
}

const hasNoSearchMatches = (matches: SearchMatches) =>
  matches.clienteIds.length === 0 && matches.fabricanteIds.length === 0 && matches.obraIds.length === 0;

// Todo painel que muda de número quando um negócio muda de etapa, de valor ou de dono.
// Vive numa lista só porque a memória deste projeto é de esquecer alguma: `dashboard_stats`
// e o Plano de Vendas não eram invalidados em lugar NENHUM do código. Com staleTime de 5
// minutos e sem refetch ao voltar pra aba (use-dashboard.ts:6-10), fechar um negócio e
// voltar ao Dashboard mostrava os 4 cartões e as duas roscas congelados — e quem conferisse
// concluiria, com razão aparente, que a correção não tinha funcionado.
// As seis mutações que mexem em negócio (arrastar no kanban, ação em massa, exclusão em
// massa, edição da ficha, cadastro novo e o remanejamento que a exclusão de etapa dispara)
// chamam esta função em vez de repetir a lista, para que acrescentar um painel novo seja
// uma linha aqui e não uma caçada por quatro arquivos.
export function invalidarPaineisDeNegocios(qc: QueryClient) {
  const chaves = [
    'pedidos',
    'pedidos_por_cliente',
    'pedidos_stats',
    'vw_faturamento_mensal',
    'dashboard_indicadores_vendedor',
    'dashboard_stats',
    'plano_vendas_progresso',
    // Chave própria de propósito: `invalidateQueries` casa elemento a elemento do array,
    // não por prefixo de texto — ['plano_vendas_progresso'] NÃO alcança
    // ['plano_vendas_progresso_por_vendedor'], e a quebra "Por vendedor" ficaria velha.
    'plano_vendas_progresso_por_vendedor',
  ];
  chaves.forEach(chave => qc.invalidateQueries({ queryKey: [chave] }));
}

// Resolve o termo de busca uma única vez, com `queryKey` baseada só no termo (não na etapa/status)
// — permite que o Kanban chame este hook uma vez na página e repasse o resultado já pronto para
// cada KanbanColumn via `resolvedSearchMatches`, em vez de cada coluna resolver os mesmos 3 ILIKEs
// de novo (antes: N colunas × 3 queries por termo digitado; agora: 3 queries no total, cacheadas).
export function useSearchMatches(search?: string) {
  const trimmed = search?.trim();
  return useQuery({
    queryKey: ['search-matches', trimmed],
    queryFn: () => resolveSearchMatches(trimmed!),
    enabled: !!trimmed,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

const buildSearchOrClause = (matches: SearchMatches): string => {
  const orParts: string[] = [];
  if (matches.clienteIds.length > 0) orParts.push(`cliente_id.in.(${matches.clienteIds.join(',')})`);
  if (matches.fabricanteIds.length > 0) orParts.push(`fabricante_id.in.(${matches.fabricanteIds.join(',')})`);
  if (matches.obraIds.length > 0) orParts.push(`obra_id.in.(${matches.obraIds.join(',')})`);
  return orParts.join(',');
};

export function usePedidos(
  empresaId?: string,
  page = 0,
  pageSize = 50,
  stages?: string[],
  filters?: PedidosFilters,
  enabled = true,
  // `count: 'exact'` faz o Postgres computar a contagem total junto com a página pedida — em
  // tabelas grandes isso deixa CADA página bem mais lenta pra buscar. A maioria dos chamadores
  // (ex.: picker do modal de Ação em Massa) já tem o total vindo de usePedidosStats (RPC dedicada)
  // e nunca lê o `count` devolvido aqui, então por padrão ele fica desligado — só quem
  // efetivamente usa `data.count` (ex.: KanbanColumn, pro "carregar mais" por coluna) precisa
  // passar `withCount: true` explicitamente.
  withCount = false,
  // Matches de busca já resolvidos (ver useSearchMatches) — quando fornecido, pula a resolução
  // interna (3 ILIKEs) e reaproveita o resultado. Usado pelo Kanban, onde várias colunas
  // compartilham o mesmo termo e resolveriam os mesmos ids repetidamente. `undefined` mantém o
  // comportamento antigo (resolve sozinho); `null` explícito também cai no fallback.
  resolvedSearchMatches?: SearchMatches | null,
) {
  const { vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, dateField, onlyAttention, hideImportados, funilId, search } = filters ?? {};

  return useQuery({
    queryKey: ['pedidos', empresaId, page, pageSize, stages, vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, dateField, onlyAttention, hideImportados, funilId, search, withCount],
    queryFn: async () => {
      let usuarioIds: string[] | null = null;

      if (empresaId) {
        usuarioIds = await resolveUsuarioIds(empresaId, vendedorIds);
        if (usuarioIds.length === 0) return { data: [], count: 0 };
      }

      const trimmedSearch = search?.trim();
      const searchMatches = trimmedSearch
        ? (resolvedSearchMatches ?? await resolveSearchMatches(trimmedSearch))
        : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) {
        return { data: [], count: 0 };
      }

      let query = supabase
        .from('pedidos')
        .select(`
          id, status, nome, valor_total, data_pedido, created_at, observacoes,
          cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
          cliente:clientes(id, empresa),
          fabricante:fabricantes(id, nome),
          vendedor:usuarios(id, nome, empresa_id),
          obra:obras(id, nome_obra),
          marcador:marcadores(id, nome, cor)
        `, withCount ? { count: 'exact' } : undefined)
        // `created_at` tem MUITOS valores duplicados (imports em massa gravam o mesmo
        // timestamp em centenas de linhas) — sem um desempate único e estável, o Postgres
        // pode reordenar as linhas empatadas entre execuções, fazendo o range crescer
        // "embaralhando" o que já tinha sido buscado em vez de só acrescentar linhas novas.
        // `id` garante ordenação 100% determinística.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (usuarioIds) {
        query = query.in('usuario_id', usuarioIds);
      }

      if (stages && stages.length > 0) {
        query = query.in('status', stages);
      }

      if (funilId) {
        query = query.eq('funil_id', funilId);
      }

      if (fabricanteIds && fabricanteIds.length > 0) {
        query = query.in('fabricante_id', fabricanteIds);
      }

      if (marcadorIds && marcadorIds.length > 0) {
        query = query.in('marcador_id', marcadorIds);
      }

      query = applyDateRangeFilter(query, dateFrom, dateTo, dateField);

      if (onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
      }

      if (hideImportados) {
        query = query.is('import_hash', null);
      }

      if (searchMatches) {
        query = query.or(buildSearchOrClause(searchMatches));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as PedidoWithRelations[], count: count ?? 0 };
    },
    enabled: !!empresaId && enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    // Mantém os dados da página/lote (ou do "Ver mais") anterior visíveis enquanto busca
    // o próximo, para o board do Kanban/Lista não sumir/piscar a cada requisição.
    placeholderData: keepPreviousData,
  });
}

// Negócios de um cliente específico (página de detalhes do cliente/empresa). Filtra direto no
// servidor por cliente_id em vez de reaproveitar usePedidos (que exige empresaId para rodar e,
// mesmo sem esse filtro, só traz os N pedidos mais recentes da empresa toda — negócios antigos
// de um cliente específico poderiam ficar de fora).
export function usePedidosPorCliente(clienteId?: string | null) {
  return useQuery({
    queryKey: ['pedidos_por_cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, status, nome, valor_total, data_pedido, created_at, observacoes,
          cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
          cliente:clientes(id, empresa),
          fabricante:fabricantes(id, nome),
          vendedor:usuarios(id, nome, empresa_id),
          obra:obras(id, nome_obra),
          marcador:marcadores(id, nome, cor)
        `)
        .eq('cliente_id', clienteId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PedidoWithRelations[];
    },
  });
}

export interface PedidoOption {
  id: string;
  status: string;
  nome: string | null;
  cliente: { id: string; empresa: string } | null;
  fabricante: { id: string; nome: string } | null;
}

/** Quantos negócios a lista traz quando NÃO há termo de busca (os mais recentes). */
export const PEDIDOS_OPTIONS_LIMITE_LISTA = 500;
/** Teto de resultados de uma busca — dropdown não é relatório. */
export const PEDIDOS_OPTIONS_LIMITE_BUSCA = 50;
/** A partir de quantas letras a busca vai ao servidor (1 letra traria meia base). */
export const PEDIDOS_OPTIONS_MIN_BUSCA = 2;

// Resolve os ids que casam com o termo, do mesmo jeito que resolveSearchMatches faz para a
// tela de Negócios: por ids, nunca colando o texto digitado dentro do filtro `.or()`. Um
// termo com vírgula ou parêntese quebraria a sintaxe do PostgREST se fosse concatenado ali.
// Cobre os três pedaços que formam o rótulo da opção (ver getNomeNegocio): o nome
// customizado do negócio, o nome do cliente e o nome do fabricante.
async function resolvePedidoOptionMatches(termo: string, usuarioIds: string[]) {
  const [{ data: pedidoMatches }, { data: clienteMatches }, { data: fabricanteMatches }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id')
      .in('usuario_id', usuarioIds)
      .ilike('nome', `%${termo}%`)
      .limit(PEDIDOS_OPTIONS_LIMITE_BUSCA),
    supabase.from('clientes').select('id').ilike('empresa', `%${termo}%`),
    supabase.from('fabricantes').select('id').ilike('nome', `%${termo}%`),
  ]);
  return {
    pedidoIds: (pedidoMatches ?? []).map(p => p.id),
    clienteIds: (clienteMatches ?? []).map(c => c.id),
    fabricanteIds: (fabricanteMatches ?? []).map(f => f.id),
  };
}

// Lista enxuta de negócios (só os campos usados pra rotular a opção) pra popular o seletor de
// "vincular a um negócio" no formulário de tarefas.
//
// SEM `search`: os PEDIDOS_OPTIONS_LIMITE_LISTA negócios mais recentes — é a lista de partida,
// não o universo. Eram 11.907 negócios contra um teto de 500, e o filtro do seletor acontece
// no navegador: procurar um negócio antigo não achava nada e a tela não avisava que tinha
// cortado. Subir o teto para o universo inteiro NÃO resolve e piora: o SearchableSelect
// desenha um item de lista para CADA opção, sem virtualização — 11.907 itens travam o
// diálogo. Quem consome pode comparar `data.length` com PEDIDOS_OPTIONS_LIMITE_LISTA para
// dizer honestamente que a lista está cortada.
//
// COM `search` (a partir de PEDIDOS_OPTIONS_MIN_BUSCA letras): a procura vai ao SERVIDOR e
// alcança a base inteira, devolvendo no máximo PEDIDOS_OPTIONS_LIMITE_BUSCA resultados.
// O parâmetro é opcional de propósito — quem já chamava com um argumento só continua
// funcionando exatamente como antes.
export function usePedidosOptions(empresaId?: string, search?: string) {
  const termo = search?.trim() ?? '';
  const buscandoNoServidor = termo.length >= PEDIDOS_OPTIONS_MIN_BUSCA;

  return useQuery({
    queryKey: ['pedidos_options', empresaId, buscandoNoServidor ? termo : null],
    enabled: !!empresaId,
    queryFn: async () => {
      const usuarioIds = await resolveUsuarioIds(empresaId!);
      if (usuarioIds.length === 0) return [];

      let query = supabase
        .from('pedidos')
        .select('id, status, nome, cliente:clientes(id, empresa), fabricante:fabricantes(id, nome)')
        .in('usuario_id', usuarioIds)
        .order('created_at', { ascending: false });

      if (buscandoNoServidor) {
        const { pedidoIds, clienteIds, fabricanteIds } = await resolvePedidoOptionMatches(termo, usuarioIds);
        const orParts: string[] = [];
        if (pedidoIds.length > 0) orParts.push(`id.in.(${pedidoIds.join(',')})`);
        if (clienteIds.length > 0) orParts.push(`cliente_id.in.(${clienteIds.join(',')})`);
        if (fabricanteIds.length > 0) orParts.push(`fabricante_id.in.(${fabricanteIds.join(',')})`);
        // Nada casou com o termo: devolve lista vazia em vez de deixar o `.or()` vazio, que
        // no PostgREST não filtra nada e traria os negócios mais recentes como se fossem
        // resultado da busca.
        if (orParts.length === 0) return [];
        query = query.or(orParts.join(',')).limit(PEDIDOS_OPTIONS_LIMITE_BUSCA);
      } else {
        query = query.limit(PEDIDOS_OPTIONS_LIMITE_LISTA);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PedidoOption[];
    },
    staleTime: 1000 * 60 * 5,
    // Sem isso, cada letra digitada derruba a lista pra vazia até a resposta chegar, e o
    // seletor pisca "Nenhuma opção encontrada" no meio da digitação.
    placeholderData: keepPreviousData,
  });
}

// Um negócio específico no mesmo formato da lista de opções. Existe para o caso em que a
// tarefa já está vinculada a um negócio que NÃO está entre os mais recentes: sem isso, o
// seletor não acha o id na lista e mostra o texto de "não selecionado", como se o vínculo
// tivesse sumido. `enabled` fica desligado quando não há id.
export function usePedidoOptionPorId(pedidoId?: string | null) {
  return useQuery({
    queryKey: ['pedido_option', pedidoId ?? null],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, status, nome, cliente:clientes(id, empresa), fabricante:fabricantes(id, nome)')
        .eq('id', pedidoId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PedidoOption | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePedidosStats(empresaId?: string, stages?: string[], filters?: PedidosFilters, enabled = true) {
  const { vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, dateField, onlyAttention, search, funilId, hideImportados } = filters ?? {};

  return useQuery({
    // Reage a filtros e busca — NUNCA a page/pageSize/"Exibir"/"Ver mais", que não fazem
    // parte da queryKey aqui de propósito (o header precisa do total real, não do carregado).
    queryKey: ['pedidos_stats', empresaId, stages, vendedorIds, fabricanteIds, marcadorIds, dateFrom, dateTo, dateField, onlyAttention, search, funilId, hideImportados],
    queryFn: async () => {
      let usuarioIds: string[] | null = null;

      if (empresaId) {
        usuarioIds = await resolveUsuarioIds(empresaId, vendedorIds);
        if (usuarioIds.length === 0) return { count: 0, valor: 0 };
      }

      const { data, error } = await supabase.rpc('pedidos_stats', {
        p_usuario_ids: usuarioIds,
        p_stages: stages && stages.length > 0 ? stages : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
        p_search: search?.trim() ? search.trim() : null,
        p_only_attention: !!onlyAttention,
        p_funil_id: funilId ?? null,
        p_marcador_ids: marcadorIds && marcadorIds.length > 0 ? marcadorIds : null,
        p_hide_importados: !!hideImportados,
        p_date_field: dateField ?? 'data_pedido',
      });
      if (error) throw error;
      const row = data?.[0];
      return { count: Number(row?.total_count ?? 0), valor: Number(row?.total_valor ?? 0) };
    },
    enabled: !!empresaId && enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    // Sem isso, toda troca de filtro/busca derruba `data` pra `undefined` até a nova resposta
    // chegar, e o header cai pra "0 negócios · Total: R$ 0,00" por um instante — pior ainda,
    // o checkbox "selecionar todos" (que decide abrir o diálogo de "selecionar todos os
    // filtrados" comparando `totalCount > currentPageIds.length`) enxerga esse 0 e conclui que
    // não há nada além da página carregada, marcando só as linhas visíveis em vez de oferecer
    // a opção de selecionar todo o filtro. `usePedidos` já mantém a página anterior do mesmo
    // jeito; aqui falta o mesmo tratamento pro total.
    placeholderData: keepPreviousData,
  });
}

export function useUpdatePedidoStatus() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Só a etapa vai no update. A DATA DE FECHAMENTO (`prazo_resposta`) é carimbada pelo
      // gatilho `fn_set_pedido_fechado_em` (migration 20260821120100), e daqui não sai nada
      // sobre ela de propósito: aqui só existiam DOIS dos seis caminhos que fecham um
      // negócio, o carimbo só valia para 'fechamento' (perder um negócio não registrava o
      // dia da perda) e a data vinha do relógio do computador do vendedor — relógio ou fuso
      // errado carimbava o dia errado, sem ninguém perceber. O gatilho cobre os seis
      // caminhos, cobre 'perdido' e usa o relógio do servidor, que é um só para todo mundo.
      // Duas donas para a mesma regra é como o problema começou.
      const { error } = await supabase.from('pedidos').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, status }) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          registroId: id,
          acao: 'UPDATE',
          descricao: `Moveu o negócio para a etapa "${status}"`,
        });
      }
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['pedidos'] });

      const previousEntries = qc.getQueriesData<{ data: PedidoWithRelations[]; count: number }>({ queryKey: ['pedidos'] });

      let movedItem: PedidoWithRelations | undefined;
      for (const [, data] of previousEntries) {
        movedItem = data?.data.find(p => p.id === id);
        if (movedItem) break;
      }

      for (const [key, old] of previousEntries) {
        if (!old) continue;
        const stages = key[4] as string[] | undefined;
        const hasItem = old.data.some(p => p.id === id);

        if (stages && stages.length > 0) {
          const belongsToTarget = stages.includes(status);
          if (!belongsToTarget && hasItem) {
            qc.setQueryData(key, { data: old.data.filter(p => p.id !== id), count: Math.max(0, old.count - 1) });
          } else if (belongsToTarget && !hasItem && movedItem) {
            qc.setQueryData(key, { data: [{ ...movedItem, status }, ...old.data], count: old.count + 1 });
          }
          continue;
        }

        if (hasItem) {
          qc.setQueryData(key, { data: old.data.map(p => p.id === id ? { ...p, status } : p), count: old.count });
        }
      }

      return { previousEntries };
    },
    onError: (err, variables, context) => {
      context?.previousEntries?.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => {
      invalidarPaineisDeNegocios(qc);
    },
  });
}

const BULK_BATCH_SIZE = 500;
const BULK_BATCH_DELAY_MS = 200;

export type BulkPedidosTarget = { ids: string[] } | { empresaId: string; stages?: string[]; filters?: PedidosFilters; excludeIds?: string[] };

export function useBulkDeletePedidos() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (params: BulkPedidosTarget) => {
      if ('ids' in params) {
        const { ids } = params;
        if (ids.length === 0) return 0;

        const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
        if (!empresaId) throw new Error('Empresa não identificada.');
        await assertIdsBelongToEmpresa(ids, empresaId);

        if (ids.length <= BULK_BATCH_SIZE) {
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', ids);
          if (error) throw error;
          return count ?? ids.length;
        }

        let deleted = 0;
        for (let i = 0; i < ids.length; i += BULK_BATCH_SIZE) {
          const batch = ids.slice(i, i + BULK_BATCH_SIZE);
          const { error, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', batch);
          if (error) throw error;
          deleted += count ?? batch.length;
          if (i + BULK_BATCH_SIZE < ids.length) {
            await new Promise(resolve => setTimeout(resolve, BULK_BATCH_DELAY_MS));
          }
        }
        return deleted;
      }

      const { empresaId, stages, filters, excludeIds } = params;
      const usuarioIds = await resolveUsuarioIds(empresaId, filters?.vendedorIds);
      if (usuarioIds.length === 0) return 0;

      // Precisa espelhar exatamente o mesmo recorte de `usePedidos`/`usePedidosStats` — senão a
      // exclusão "todos os filtrados" apaga mais do que o N mostrado/prometido no diálogo de
      // confirmação (ver ETAPAS_FINAIS_ATENCAO e resolveSearchMatches acima).
      const trimmedSearch = filters?.search?.trim();
      const searchMatches = trimmedSearch ? await resolveSearchMatches(trimmedSearch) : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) return 0;

      const buildMatchingQuery = () => {
        let query = supabase.from('pedidos').select('id').in('usuario_id', usuarioIds);
        if (excludeIds && excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        if (stages && stages.length > 0) query = query.in('status', stages);
        if (filters?.funilId) query = query.eq('funil_id', filters.funilId);
        if (filters?.fabricanteIds && filters.fabricanteIds.length > 0) query = query.in('fabricante_id', filters.fabricanteIds);
        if (filters?.marcadorIds && filters.marcadorIds.length > 0) query = query.in('marcador_id', filters.marcadorIds);
        query = applyDateRangeFilter(query, filters?.dateFrom, filters?.dateTo, filters?.dateField);
        if (filters?.onlyAttention) {
          const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
          query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
        }
        if (filters?.hideImportados) {
          query = query.is('import_hash', null);
        }
        if (searchMatches) {
          query = query.or(buildSearchOrClause(searchMatches));
        }
        return query;
      };

      // Um único DELETE cobrindo todos os filtrados de uma vez estourava o statement_timeout do
      // Postgres em empresas com muitos negócios (código 57014) — cada exclusão em cascata/trigger
      // por linha soma, e milhares de linhas num único statement passam do limite. Em vez disso,
      // busca até BULK_BATCH_SIZE ids que ainda casam com o filtro e apaga só esses; como as linhas
      // apagadas saem do resultado do filtro, repetir a busca sempre traz o próximo lote — sem
      // precisar de cursor/offset — até não sobrar nenhuma.
      let deleted = 0;
      while (true) {
        const { data, error: selectError } = await buildMatchingQuery().limit(BULK_BATCH_SIZE);
        if (selectError) throw selectError;
        const batchIds = (data ?? []).map(row => row.id);
        if (batchIds.length === 0) break;

        const { error: deleteError, count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', batchIds);
        if (deleteError) throw deleteError;
        deleted += count ?? batchIds.length;

        if (batchIds.length < BULK_BATCH_SIZE) break;
        await new Promise(resolve => setTimeout(resolve, BULK_BATCH_DELAY_MS));
      }
      return deleted;
    },
    onSuccess: (count, variables) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        const descricao = 'ids' in variables
          ? `Excluiu ${count} negócio(s) selecionado(s) manualmente`
          : `Excluiu ${count} negócio(s) em massa (exclusão por filtro)`;
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          acao: 'DELETE',
          descricao,
        });
      }
      invalidarPaineisDeNegocios(qc);
    },
  });
}

// Todos os campos são opcionais — o chamador decide quais alterar numa mesma chamada
// (é responsabilidade do chamador garantir que ao menos um esteja presente).
export type BulkPedidosUpdates = { status?: string; marcador_id?: string | null; usuario_id?: string };

// Aplica a mesma etapa (status) e/ou o mesmo marcador a vários negócios de uma vez, num único
// UPDATE — reaproveita o mesmo par de formatos de alvo do useBulkDeletePedidos (ids explícitos
// vs. "todos os filtrados" resolvido no servidor via os filtros já ativos na tela).
export function useBulkUpdatePedidos() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async ({ target, updates }: { target: BulkPedidosTarget; updates: BulkPedidosUpdates }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.marcador_id !== undefined) updateData.marcador_id = updates.marcador_id;
      if (updates.usuario_id !== undefined) updateData.usuario_id = updates.usuario_id;
      // Sem carimbo de data aqui: quem preenche a DATA DE FECHAMENTO é o gatilho
      // `fn_set_pedido_fechado_em` (migration 20260821120100), pelo mesmo motivo explicado
      // em useUpdatePedidoStatus — ele vale para ganho E para perda, vale para os seis
      // caminhos que fecham um negócio, e usa o relógio do servidor em vez do relógio de
      // cada navegador.

      if ('ids' in target) {
        const { ids } = target;
        if (ids.length === 0) return 0;

        const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
        if (!empresaId) throw new Error('Empresa não identificada.');
        await assertIdsBelongToEmpresa(ids, empresaId);

        if (ids.length <= BULK_BATCH_SIZE) {
          const { error, count } = await supabase.from('pedidos').update(updateData, { count: 'exact' }).in('id', ids);
          if (error) throw error;
          return count ?? ids.length;
        }

        let updated = 0;
        for (let i = 0; i < ids.length; i += BULK_BATCH_SIZE) {
          const batch = ids.slice(i, i + BULK_BATCH_SIZE);
          const { error, count } = await supabase.from('pedidos').update(updateData, { count: 'exact' }).in('id', batch);
          if (error) throw error;
          updated += count ?? batch.length;
          if (i + BULK_BATCH_SIZE < ids.length) {
            await new Promise(resolve => setTimeout(resolve, BULK_BATCH_DELAY_MS));
          }
        }
        return updated;
      }

      const { empresaId, stages, filters, excludeIds } = target;
      const usuarioIds = await resolveUsuarioIds(empresaId, filters?.vendedorIds);
      if (usuarioIds.length === 0) return 0;

      const trimmedSearch = filters?.search?.trim();
      const searchMatches = trimmedSearch ? await resolveSearchMatches(trimmedSearch) : null;
      if (searchMatches && hasNoSearchMatches(searchMatches)) return 0;

      let query = supabase.from('pedidos').update(updateData, { count: 'exact' }).in('usuario_id', usuarioIds);
      if (excludeIds && excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      if (stages && stages.length > 0) query = query.in('status', stages);
      if (filters?.funilId) query = query.eq('funil_id', filters.funilId);
      if (filters?.fabricanteIds && filters.fabricanteIds.length > 0) query = query.in('fabricante_id', filters.fabricanteIds);
      if (filters?.marcadorIds && filters.marcadorIds.length > 0) query = query.in('marcador_id', filters.marcadorIds);
      query = applyDateRangeFilter(query, filters?.dateFrom, filters?.dateTo, filters?.dateField);
      if (filters?.onlyAttention) {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.lte('created_at', cutoff).not('status', 'in', ETAPAS_FINAIS_ATENCAO);
      }
      if (filters?.hideImportados) {
        query = query.is('import_hash', null);
      }
      if (searchMatches) {
        query = query.or(buildSearchOrClause(searchMatches));
      }

      const { error, count } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count, { target, updates }) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id && count > 0) {
        const campos = [
          updates.status !== undefined ? 'a etapa' : null,
          updates.marcador_id !== undefined ? 'o marcador' : null,
          updates.usuario_id !== undefined ? 'o responsável' : null,
        ].filter(Boolean).join(' e ');
        const escopo = 'ids' in target ? 'selecionado(s) manualmente' : 'em massa (por filtro)';
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'pedidos',
          acao: 'UPDATE',
          descricao: `Alterou ${campos} de ${count} negócio(s) ${escopo}`,
        });
      }
      invalidarPaineisDeNegocios(qc);
    },
  });
}

export interface PedidoHistoricoStatus {
  id: string;
  pedido_id: string;
  tipo: 'status' | 'campo';
  status_anterior: string | null;
  status_novo: string | null;
  campo: string | null;
  valor_anterior_txt: string | null;
  valor_novo_txt: string | null;
  usuario_id: string | null;
  usuario: { id: string; nome: string } | null;
  created_at: string;
}

// Histórico de movimentação do negócio no Kanban (uma linha por avanço/troca de
// etapa, incluindo a etapa inicial na criação). Alimentado só por trigger no
// banco (trg_pedidos_historico_status) — cobre drag-and-drop, edição manual e
// qualquer outra via de escrita, sem depender do front lembrar de instrumentar.
export function usePedidoHistoricoStatus(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido_historico_status', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos_historico_status')
        .select('*, usuario:usuarios(id, nome)')
        .eq('pedido_id', pedidoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoHistoricoStatus[];
    },
  });
}

export function useHistoricoContatos(pedidoId: string | null) {
  return useQuery({
    queryKey: ['historico_contatos', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_contatos')
        .select('*, vendedor:vendedores(nome)')
        .eq('pedido_id', pedidoId!)
        .order('data_contato', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

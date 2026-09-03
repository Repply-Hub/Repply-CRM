import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// staleTime/gcTime/refetchOnWindowFocus no mesmo padrão de usePedidos (src/hooks/use-pedidos.ts)
// — sem isso, toda vez que a aba do Dashboard ganha foco essas agregações eram refeitas do zero.
const DASHBOARD_QUERY_OPTS = {
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 10,
  refetchOnWindowFocus: false,
} as const;

export function useFaturamentoMensal(empresaId?: string) {
  return useQuery({
    queryKey: ['vw_faturamento_mensal', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_faturamento_mensal')
        .select('*')
        .eq('empresa_id', empresaId as string)
        // 'mes_ano' é 'YYYY-MM' (ordena certo como string). A coluna 'mes' é o rótulo
        // formatado 'Mon/YY' — ordenar por ela alfabeticamente embaralhava os meses no gráfico.
        .order('mes_ano', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    // Sem isso a query disparava no mount com empresaId ainda undefined (RLS mascarava
    // o resultado errado, mas fazia a agregação rodar em dobro — uma vez "vazia" e de
    // novo assim que empresaId chegava).
    enabled: !!empresaId,
    ...DASHBOARD_QUERY_OPTS,
  });
}

export interface IndicadorVendedor {
  usuario_id: string;
  usuario_nome: string;
  // total_pedidos e qtd_fechado são a conta "de safra": negócios CRIADOS no
  // período e, desses, quantos já foram ganhos. É o que alimenta "Conversão por
  // Vendedor", que o Lucas decidiu manter por data de criação — o numerador é
  // subconjunto do denominador, então a taxa nunca passa de 100%.
  total_pedidos: number;
  qtd_fechado: number;
  // Já é a outra conta: quantos negócios esse vendedor FECHOU dentro do período
  // (por prazo_resposta, a "Data de Fechamento" da tela), tendo sido criados
  // quando fosse. Vem da migration 20260821120000. Hoje nenhum gráfico usa —
  // está aqui para quem precisar somar fechamento por pessoa sem reabrir a RPC.
  qtd_fechado_periodo?: number;
}

// Antes lia vw_indicadores_usuario sem filtro nenhum: reagregava o histórico
// INTEIRO de `pedidos` de cada usuário a cada carga do Dashboard, ignorando os
// filtros de Período/Fabricante do topo da tela (números que não batiam com o
// resto da tela) e ficando mais caro conforme a base cresce. RPC aceita os
// mesmos filtros de dashboard_stats — ver
// supabase/migrations/20260810140000_dashboard_filtros_multiplos.sql.
// Não recebe usuarioIds: essa lista alimenta o próprio seletor "Responsável"
// (e o Plano de Vendas), então precisa continuar trazendo todo mundo da
// empresa — a filtragem por vendedor(es) selecionado(s) é feita no cliente.
export function useIndicadoresVendedor(
  empresaId?: string,
  filters?: { fabricanteIds?: string[]; dateFrom?: string; dateTo?: string },
) {
  const { fabricanteIds, dateFrom, dateTo } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_indicadores_vendedor', empresaId, fabricanteIds, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_indicadores_vendedor', {
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      return (data ?? []) as IndicadorVendedor[];
    },
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTS,
  });
}

export interface DashboardStats {
  // ---- janela de CRIAÇÃO (data_pedido) ----
  total_pedidos: number;
  // "Criados no período que JÁ ganharam, em qualquer data". É o numerador da
  // Taxa de Conversão e nada mais. NÃO é o cartão "Negócios Fechados" — os dois
  // números são diferentes (ago/2026: 62 aqui contra 45 no cartão).
  pedidos_fechados: number;
  segmentacao_alto: number;
  segmentacao_medio: number;
  segmentacao_baixo: number;
  // ---- janela de FECHAMENTO (prazo_resposta) ----
  // "Fecharam DENTRO do período, tendo sido criados quando fosse". É o cartão
  // "Negócios Fechados" e o divisor do Ticket Médio.
  pedidos_fechados_periodo: number;
  total_faturamento: number;
  rendimento_fabricante: { fabrica: string; valor: number }[];
  rendimento_vendedor: { vendedor: string; valor: number }[];
}

// KPIs, segmentação e rendimento por fábrica/vendedor do Dashboard — antes calculados
// no cliente em cima de até 500 linhas de `pedidos` com 4 joins (usePedidos), o mesmo
// anti-padrão documentado no CLAUDE.md do projeto. A RPC roda como o usuário chamador
// (SECURITY INVOKER), então a RLS de pedidos já escopa para a empresa dele sozinha.
//
// Desde a migration 20260821120000 a função tem DUAS janelas de tempo (uma por
// data de criação, outra por data de fechamento) e devolve os dois números de
// negócios fechados — ver os comentários da interface DashboardStats acima.
export function useDashboardStats(
  empresaId?: string,
  filters?: { usuarioIds?: string[]; fabricanteIds?: string[]; dateFrom?: string; dateTo?: string },
) {
  const { usuarioIds, fabricanteIds, dateFrom, dateTo } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_stats', empresaId, usuarioIds, fabricanteIds, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_stats', {
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      const row = (data as DashboardStats[] | null)?.[0];
      return (row ?? {
        total_pedidos: 0,
        pedidos_fechados: 0,
        pedidos_fechados_periodo: 0,
        total_faturamento: 0,
        segmentacao_alto: 0,
        segmentacao_medio: 0,
        segmentacao_baixo: 0,
        rendimento_fabricante: [],
        rendimento_vendedor: [],
      }) as DashboardStats;
    },
    enabled: !!empresaId,
    // Mantém os dados do filtro anterior na tela enquanto o novo filtro carrega —
    // sem isso, trocar fabricante/responsável/período derrubava a tela inteira pro
    // spinner de full-page a cada mudança, porque a queryKey muda com os filtros.
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTS,
  });
}

export interface DashboardNegociosRisco {
  qtd_parados: number;
  valor_parados: number;
  qtd_sem_proxima_acao: number;
  valor_sem_proxima_acao: number;
  // Valor ÚNICO dos negócios em qualquer uma das duas condições acima — não é
  // valor_parados + valor_sem_proxima_acao, que contaria duas vezes o negócio
  // que é os dois problemas ao mesmo tempo. Ver comentário da RPC.
  valor_risco_total: number;
  // Vem vazio ([]) para quem não é gestor — a RPC já filtra por is_gestor(),
  // não é uma omissão do front. Não use este array pra decidir se o usuário É
  // gestor (ele também fica vazio quando não há nenhum negócio em risco).
  risco_por_vendedor: { vendedor: string; valor: number }[];
  risco_por_fabricante: { fabrica: string; valor: number }[];
}

// "Radar de Risco": negócios ABERTOS (nem ganhos nem perdidos) parados há
// p_dias_parado dias (sem mudança de status registrada em
// pedidos_historico_status) ou sem nenhuma tarefa em aberto apontando pra
// eles. Ver supabase/migrations/20260824220000_dashboard_negocios_risco.sql.
//
// Sem parâmetro de período de propósito: um negócio aberto criado há meses
// continua sendo risco hoje mesmo que o filtro "Período" do topo do Dashboard
// não alcance a data em que ele nasceu — filtrar por data de criação/fechamento
// escondia justamente os negócios mais antigos parados, que são os que mais
// importa achar aqui. Só Fabricante/Responsável (e o corte de dias parado, via
// diasParado) afetam este painel.
export function useDashboardNegociosRisco(
  empresaId?: string,
  filters?: { usuarioIds?: string[]; fabricanteIds?: string[]; funilId?: string; diasParado?: number },
) {
  const { usuarioIds, fabricanteIds, funilId, diasParado = 7 } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_negocios_risco', empresaId, usuarioIds, fabricanteIds, funilId, diasParado],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_negocios_risco', {
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_funil_id: funilId ?? null,
        p_dias_parado: diasParado,
      });
      if (error) throw error;
      const row = (data as DashboardNegociosRisco[] | null)?.[0];
      return (row ?? {
        qtd_parados: 0,
        valor_parados: 0,
        qtd_sem_proxima_acao: 0,
        valor_sem_proxima_acao: 0,
        valor_risco_total: 0,
        risco_por_vendedor: [],
        risco_por_fabricante: [],
      }) as DashboardNegociosRisco;
    },
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTS,
  });
}

export interface DashboardWhatsappStats {
  conversas_abertas: number;
  conversas_fechadas: number;
  tempo_resposta_atendente: { atendente: string; minutos: number }[];
  // Quantas conversas foram ATRIBUÍDAS a cada atendente dentro do período (conta
  // pela data da atribuição, não pela criação da conversa). Vem do log
  // whatsapp_conversa_atribuicoes — ver migration 20260903160000. Já ordenado
  // desc pela RPC.
  conversas_atribuidas_atendente: { atendente: string; quantidade: number }[];
}

// Métricas de atendimento via WhatsApp pro gestor/admin acompanhar a equipe —
// conversas_abertas/fechadas conta whatsapp_conversas.arquivada, e
// tempo_resposta_atendente pareia cada mensagem de entrada com a próxima saída na
// mesma conversa (ver supabase/migrations/20260819120000_dashboard_whatsapp_stats_rpc.sql).
// Sem p_usuario_ids/p_fabricante_ids: a RLS de whatsapp_conversas já restringe um
// não-gestor às conversas em que ele é responsável, então a própria RPC devolve
// só os dados que o usuário logado pode ver — nada a filtrar aqui.
export function useDashboardWhatsappStats(
  empresaId?: string,
  filters?: { dateFrom?: string; dateTo?: string },
) {
  const { dateFrom, dateTo } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_whatsapp_stats', empresaId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_whatsapp_stats', {
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      const row = (data as DashboardWhatsappStats[] | null)?.[0];
      return (row ?? {
        conversas_abertas: 0,
        conversas_fechadas: 0,
        tempo_resposta_atendente: [],
        conversas_atribuidas_atendente: [],
      }) as DashboardWhatsappStats;
    },
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTS,
  });
}

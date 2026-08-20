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
  total_pedidos: number;
  qtd_fechado: number;
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
  total_pedidos: number;
  pedidos_fechados: number;
  total_faturamento: number;
  segmentacao_alto: number;
  segmentacao_medio: number;
  segmentacao_baixo: number;
  rendimento_fabricante: { fabrica: string; valor: number }[];
  rendimento_vendedor: { vendedor: string; valor: number }[];
}

// KPIs, segmentação e rendimento por fábrica/vendedor do Dashboard — antes calculados
// no cliente em cima de até 500 linhas de `pedidos` com 4 joins (usePedidos), o mesmo
// anti-padrão documentado no CLAUDE.md do projeto. A RPC roda como o usuário chamador
// (SECURITY INVOKER), então a RLS de pedidos já escopa para a empresa dele sozinha.
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

export interface DashboardWhatsappStats {
  conversas_abertas: number;
  conversas_fechadas: number;
  tempo_resposta_atendente: { atendente: string; minutos: number }[];
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
      }) as DashboardWhatsappStats;
    },
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTS,
  });
}

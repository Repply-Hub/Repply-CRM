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
        .order('mes', { ascending: true });
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

export function useIndicadoresVendedor(empresaId?: string) {
  return useQuery({
    queryKey: ['vw_indicadores_usuario', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_indicadores_usuario')
        .select('*')
        .eq('empresa_id', empresaId as string);
      if (error) throw error;
      return data || [];
    },
    enabled: !!empresaId,
    ...DASHBOARD_QUERY_OPTS,
  });
}

export interface VelocidadeFabricante {
  fabricante_id: string;
  fabricante_nome: string;
  total_pedidos: number;
  /** Dias médios entre a criação do negócio e o primeiro orçamento enviado.
   *  null quando nenhum pedido do fabricante tem essa transição registrada
   *  (não é "0 dias" — é "sem dado"). */
  dias_medio_resposta: number | null;
}

// Antes lia vw_velocidade_por_fabricante, que perdeu a coluna de tempo médio
// numa recriação anterior (o frontend hardcodava `dias: 0` pra todo mundo — ver
// git blame de src/pages/Dashboard.tsx). RPC calcula de verdade a partir de
// pedidos_historico_status e aceita os mesmos filtros de Período/Responsável/
// Fabricante que dashboard_stats — ver
// supabase/migrations/20260806100000_velocidade_fabricante_rpc.sql.
export function useVelocidadeFabricante(
  empresaId?: string,
  filters?: { usuarioId?: string; fabricanteId?: string; dateFrom?: string; dateTo?: string },
) {
  const { usuarioId, fabricanteId, dateFrom, dateTo } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_velocidade_fabricante', empresaId, usuarioId, fabricanteId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_velocidade_fabricante', {
        p_usuario_id: usuarioId ?? null,
        p_fabricante_id: fabricanteId ?? null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      return (data ?? []) as VelocidadeFabricante[];
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
  filters?: { usuarioId?: string; fabricanteId?: string; dateFrom?: string; dateTo?: string },
) {
  const { usuarioId, fabricanteId, dateFrom, dateTo } = filters ?? {};

  return useQuery({
    queryKey: ['dashboard_stats', empresaId, usuarioId, fabricanteId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_stats', {
        p_usuario_id: usuarioId ?? null,
        p_fabricante_id: fabricanteId ?? null,
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

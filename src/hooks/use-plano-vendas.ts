import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlanoVendasProgresso {
  fabricante_id: string;
  fabricante_nome: string;
  meta_valor: number;
  vendido_valor: number;
}

// Progresso (meta x vendido) por fabricante, agregado no servidor pela RPC
// plano_vendas_progresso — mesmo motivo de dashboard_stats: evita puxar todo
// `pedidos` do período pro cliente só pra somar por fabricante. Arrays vazios
// (nenhum item selecionado no filtro) viram `null` antes de mandar pro
// servidor: `= ANY('{}')` não bate com nada, então um array vazio filtraria
// tudo fora — `null` é quem significa "sem filtro" na RPC.
export function usePlanoVendasProgresso(
  ano: number,
  mes: number,
  usuarioIds?: string[],
  fabricanteIds?: string[],
) {
  return useQuery({
    queryKey: ['plano_vendas_progresso', ano, mes, usuarioIds, fabricanteIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plano_vendas_progresso', {
        p_ano: ano,
        p_mes: mes,
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
      });
      if (error) throw error;
      return (data ?? []) as PlanoVendasProgresso[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

export interface PlanoVendasProgressoVendedor {
  usuario_id: string;
  usuario_nome: string;
  fabricante_id: string;
  fabricante_nome: string;
  meta_valor: number;
  vendido_valor: number;
}

// Detalhamento por vendedor (não só a soma da empresa) — usado pelo gestor/admin
// quando o filtro "Responsável" está em "Todos", pra ver o plano de cada
// vendedor lado a lado sem precisar trocar o filtro um por um. A RLS de
// metas_vendas/pedidos já restringe o retorno pra quem não é gestor (só a
// própria linha volta), então `enabled` aqui é só otimização — não é a
// barreira de segurança.
export function usePlanoVendasProgressoPorVendedor(
  ano: number,
  mes: number,
  enabled: boolean,
  usuarioIds?: string[],
  fabricanteIds?: string[],
) {
  return useQuery({
    queryKey: ['plano_vendas_progresso_por_vendedor', ano, mes, usuarioIds, fabricanteIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plano_vendas_progresso_por_vendedor', {
        p_ano: ano,
        p_mes: mes,
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
      });
      if (error) throw error;
      return (data ?? []) as PlanoVendasProgressoVendedor[];
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

export interface MetaVenda {
  id: string;
  fabricante_id: string;
  meta_valor: number;
}

// Linhas cruas de metas_vendas de um vendedor (ou da equipe toda, usuarioId ===
// null) num mês — usadas só pra pré-preencher o formulário de edição do gestor
// (a visão de progresso usa a RPC acima). `undefined` desliga a query (dialog
// fechado); `null` é "meta de equipe", explicitamente diferente de "desligado".
export function useMetasVendas(usuarioId: string | null | undefined, ano: number, mes: number) {
  return useQuery({
    queryKey: ['metas_vendas', usuarioId === null ? 'equipe' : usuarioId, ano, mes],
    queryFn: async () => {
      let query = supabase
        .from('metas_vendas')
        .select('id, fabricante_id, meta_valor')
        .eq('ano', ano)
        .eq('mes', mes);
      query = usuarioId === null ? query.is('usuario_id', null) : query.eq('usuario_id', usuarioId as string);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MetaVenda[];
    },
    enabled: usuarioId !== undefined,
  });
}

interface UpsertMetaVendaInput {
  empresaId: string;
  usuarioId: string | null;
  fabricanteId: string;
  ano: number;
  mes: number;
  metaValor: number;
}

// Via RPC (não .upsert() direto): os dois casos (meta individual x meta de
// equipe) são protegidos por índices únicos PARCIAIS (usuario_id IS NOT NULL /
// IS NULL) — o onConflict do supabase-js só mira ON CONFLICT (colunas), sem
// WHERE, então não consegue apontar pra um índice parcial. Ver migration
// 20260810120000_metas_vendas_toda_equipe.sql.
export function useUpsertMetaVenda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMetaVendaInput) => {
      const { error } = await supabase.rpc('upsert_meta_venda', {
        p_empresa_id: input.empresaId,
        p_usuario_id: input.usuarioId,
        p_fabricante_id: input.fabricanteId,
        p_ano: input.ano,
        p_mes: input.mes,
        p_meta_valor: input.metaValor,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['metas_vendas', variables.usuarioId ?? 'equipe', variables.ano, variables.mes] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso'] });
      // Prefixo diferente de 'plano_vendas_progresso' — invalidateQueries casa
      // por elemento de array, não por prefixo de string, então precisa da
      // chave própria (senão a lista "Por vendedor" fica com dado velho).
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso_por_vendedor'] });
    },
  });
}

export function useDeleteMetaVenda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('metas_vendas').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['metas_vendas'] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso'] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso_por_vendedor'] });
    },
  });
}

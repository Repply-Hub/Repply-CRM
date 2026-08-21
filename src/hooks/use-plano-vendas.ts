import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlanoVendasProgresso {
  fabricante_id: string;
  fabricante_nome: string;
  meta_valor: number;
  vendido_valor: number;
  // Só preenchidos (>0) quando filtrado por exatamente 1 vendedor — permite distinguir
  // "meta da equipe toda" de "minha fatia dela" no card do usuário comum, que não tem
  // acesso ao diálogo "Editar metas" (gestor-only) pra ver essa mesma quebra.
  meta_equipe_valor: number;
  meta_individual_valor: number;
}

// Progresso (meta x vendido) por fabricante, agregado no servidor pela RPC
// plano_vendas_progresso — mesmo motivo de dashboard_stats: evita puxar todo
// `pedidos` do período pro cliente só pra somar por fabricante. Arrays vazios
// (nenhum item selecionado no filtro) viram `null` antes de mandar pro
// servidor: `= ANY('{}')` não bate com nada, então um array vazio filtraria
// tudo fora — `null` é quem significa "sem filtro" na RPC.
//
// Recebe o INTERVALO (dateFrom/dateTo em 'yyyy-MM-dd'), não mais ano/mês. Antes
// só o mês da data inicial chegava aqui, então um filtro de "01/jan a 31/dez"
// devolvia janeiro e nada mais — sem nenhum sinal na tela de que o resto do
// período tinha sido descartado. A RPC (migration 20260821120000) soma as metas
// de todos os meses que o intervalo toca e o vendido do intervalo inteiro.
//
// `as never` nos dois argumentos: src/integrations/supabase/types.ts é gerado a
// partir do banco e ainda descreve a assinatura antiga (p_ano/p_mes). Enquanto
// ele não for regerado, é o mesmo escape já usado em use-admin-cs.ts.
export function usePlanoVendasProgresso(
  dateFrom: string,
  dateTo: string,
  usuarioIds?: string[],
  fabricanteIds?: string[],
  // true só na visão de 1 vendedor específico: fábrica sem meta INDIVIDUAL (só de
  // equipe, ou nenhuma) some da lista e do total, mesmo que tenha venda registrada.
  // Sem efeito na visão agregada "Todos" (default false), que continua somando as
  // metas de equipe normalmente.
  somenteComMeta?: boolean,
) {
  return useQuery({
    queryKey: ['plano_vendas_progresso', dateFrom, dateTo, usuarioIds, fabricanteIds, somenteComMeta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plano_vendas_progresso' as never, {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
        p_somente_com_meta: !!somenteComMeta,
      } as never);
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
//
// Só traz (vendedor, fabricante) onde existe meta INDIVIDUAL > 0 — venda numa
// fábrica sem meta individual (só de equipe, ou nenhuma) não entra aqui nem no
// total do vendedor, mesmo que a empresa tenha meta de equipe pra essa fábrica.
//
// Mesmo intervalo (dateFrom/dateTo) da função agregada acima, e pelo mesmo
// motivo: se só uma das duas somasse o período inteiro, o total da seção e a
// quebra "Por vendedor" passariam a discordar na tela e ninguém saberia qual
// das duas está certa.
export function usePlanoVendasProgressoPorVendedor(
  dateFrom: string,
  dateTo: string,
  enabled: boolean,
  usuarioIds?: string[],
  fabricanteIds?: string[],
) {
  return useQuery({
    queryKey: ['plano_vendas_progresso_por_vendedor', dateFrom, dateTo, usuarioIds, fabricanteIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plano_vendas_progresso_por_vendedor' as never, {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_usuario_ids: usuarioIds && usuarioIds.length > 0 ? usuarioIds : null,
        p_fabricante_ids: fabricanteIds && fabricanteIds.length > 0 ? fabricanteIds : null,
      } as never);
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

export interface MetaIndividualAlocada {
  usuario_id: string;
  fabricante_id: string;
  meta_valor: number;
}

// Metas INDIVIDUAIS (todo mundo, não só o vendedor sendo editado) por vendedor e
// fabricante, num mês — usada pro diálogo de edição calcular "quanto da meta geral
// ainda falta distribuir entre os vendedores" (meta de equipe − soma por fabricante) e
// pra marcar, no seletor de vendedor, quem já tem alguma meta lançada no período.
// Poucas linhas por empresa/mês, então soma no cliente em vez de RPC dedicada.
export function useMetasIndividuaisAlocadas(empresaId: string | undefined, ano: number, mes: number, enabled: boolean) {
  return useQuery({
    queryKey: ['metas_vendas_individuais_alocadas', empresaId, ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metas_vendas')
        .select('usuario_id, fabricante_id, meta_valor')
        .eq('empresa_id', empresaId as string)
        .eq('ano', ano)
        .eq('mes', mes)
        .not('usuario_id', 'is', null);
      if (error) throw error;
      return (data ?? []) as MetaIndividualAlocada[];
    },
    enabled: enabled && !!empresaId,
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
      queryClient.invalidateQueries({ queryKey: ['metas_vendas_individuais_alocadas'] });
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
      queryClient.invalidateQueries({ queryKey: ['metas_vendas_individuais_alocadas'] });
    },
  });
}

// Ordem customizada (por empresa) em que os fabricantes aparecem no Plano de
// Vendas — fabricante sem linha aqui cai no critério padrão (maior meta
// primeiro), aplicado nas RPCs plano_vendas_progresso/_por_vendedor. Mapa
// fabricante_id -> posição, pra ordenar listas no cliente (ex: fábricas dentro
// de cada vendedor em "Por vendedor", que a RPC não ordena globalmente).
export function useFabricantesOrdemPlanoVendas(empresaId?: string) {
  return useQuery({
    queryKey: ['plano_vendas_fabricante_ordem', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_vendas_fabricante_ordem')
        .select('fabricante_id, ordem')
        .eq('empresa_id', empresaId as string);
      if (error) throw error;
      return new Map((data ?? []).map(r => [r.fabricante_id, r.ordem]));
    },
    enabled: !!empresaId,
    staleTime: 1000 * 60 * 5,
  });
}

// Persiste a nova ordem — recebe a lista COMPLETA de fabricantes da empresa
// (não só os visíveis no diálogo que disparou o drag), pra que fabricantes sem
// meta neste mês/vendedor não percam a posição relativa que já tinham.
export function useReorderFabricantesPlanoVendas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ empresaId, orderedFabricanteIds }: { empresaId: string; orderedFabricanteIds: string[] }) => {
      const rows = orderedFabricanteIds.map((fabricante_id, ordem) => ({ empresa_id: empresaId, fabricante_id, ordem }));
      const { error } = await supabase
        .from('plano_vendas_fabricante_ordem')
        .upsert(rows, { onConflict: 'empresa_id,fabricante_id' });
      if (error) throw error;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_fabricante_ordem', variables.empresaId] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso'] });
      queryClient.invalidateQueries({ queryKey: ['plano_vendas_progresso_por_vendedor'] });
    },
  });
}

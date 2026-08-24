import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ObraVendas {
  ganho_qtd: number;
  ganho_valor: number;
  aberto_qtd: number;
  aberto_valor: number;
  perdido_qtd: number;
  perdido_valor: number;
  total_qtd: number;
}

export interface ObraFabricante {
  fabricante_id: string | null;
  fabricante_nome: string;
  ganho_qtd: number;
  ganho_valor: number;
  total_qtd: number;
}

export interface ObraNegocio {
  id: string;
  negocio_nome: string | null;
  cliente_nome: string | null;
  fabricante_nome: string | null;
  responsavel: string | null;
  status: string;
  etapa_nome: string;
  valor_total: number | null;
  data_pedido: string | null;
  total_count: number;
}

/** Quantos negócios a ficha da obra mostra por vez. */
export const NEGOCIOS_POR_PAGINA = 10;

/**
 * O que foi vendido para uma obra: os dois números, as representadas e a lista.
 *
 * 🔴 TUDO SOMADO NO BANCO. A tentação aqui é copiar `usePedidosPorCliente`
 * (`use-pedidos.ts:637`), que puxa todos os negócios do cliente para o navegador e conta em
 * memória. Copiado para obra, funciona no teste com poucas linhas e quebra em silêncio na
 * obra grande: o PostgREST corta em 1.000 linhas sem avisar, e a tela mostraria menos do que
 * tem, sem erro nenhum. É proibido pelo CLAUDE.md §6.4 e é a armadilha mais provável desta
 * seção.
 *
 * "Ganho" é `status = 'fechamento'` — a convenção do sistema inteiro, não escolha destes
 * hooks. "Em aberto" é o complemento: nem ganho, nem perdido. Detalhe e medição na migration
 * `20260824140000_vendas_por_obra.sql`.
 */
export function useObraVendas(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_vendas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('obra_vendas', { p_obra_id: obraId! });
      if (error) throw error;
      // A função sempre devolve UMA linha, mesmo para obra sem negócio nenhum (aí com zeros).
      return (data?.[0] ?? null) as ObraVendas | null;
    },
    enabled: !!obraId,
  });
}

export function useObraFabricantes(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_fabricantes', obraId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('obra_fabricantes', { p_obra_id: obraId! });
      if (error) throw error;
      return (data ?? []) as ObraFabricante[];
    },
    enabled: !!obraId,
  });
}

/**
 * A lista de negócios da obra, uma página por vez.
 *
 * `total_count` vem repetido em toda linha — é como o Postgres devolve o total junto da
 * página, sem uma segunda consulta. Página vazia não traz linha nenhuma e, portanto, não traz
 * total: por isso o total é lido da primeira linha e cai em zero quando não há nada.
 */
export function useObraNegocios(obraId?: string | null, pagina = 1) {
  return useQuery({
    queryKey: ['obra_negocios', obraId, pagina],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('obra_negocios', {
        p_obra_id: obraId!,
        p_limit: NEGOCIOS_POR_PAGINA,
        p_offset: (pagina - 1) * NEGOCIOS_POR_PAGINA,
      });
      if (error) throw error;
      const linhas = (data ?? []) as ObraNegocio[];
      return { linhas, total: linhas[0]?.total_count ?? 0 };
    },
    enabled: !!obraId,
    // Mantém a página anterior na tela enquanto a próxima carrega, em vez de piscar vazio.
    placeholderData: (anterior) => anterior,
  });
}

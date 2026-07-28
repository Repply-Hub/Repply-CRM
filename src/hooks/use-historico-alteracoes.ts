import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AcaoHistorico = 'INSERT' | 'UPDATE' | 'DELETE';

export interface HistoricoAlteracao {
  id: string;
  empresa_id: string | null;
  usuario_id: string | null;
  usuario: { id: string; nome: string } | null;
  tabela: string;
  registro_id: string | null;
  acao: AcaoHistorico;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  descricao: string | null;
  origem: 'trigger' | 'frontend';
  created_at: string;
}

export interface HistoricoFiltros {
  tabela?: string;
  usuarioId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useHistoricoAlteracoes(
  empresaId?: string,
  page = 0,
  pageSize = 50,
  filtros?: HistoricoFiltros,
) {
  return useQuery({
    queryKey: ['historico_alteracoes', empresaId, page, pageSize, filtros],
    queryFn: async () => {
      if (!empresaId) return { data: [] as HistoricoAlteracao[], count: 0 };

      let query = supabase
        .from('historico_alteracoes')
        .select('*, usuario:usuarios(id, nome)', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (filtros?.tabela) query = query.eq('tabela', filtros.tabela);
      if (filtros?.usuarioId) query = query.eq('usuario_id', filtros.usuarioId);
      if (filtros?.dateFrom) query = query.gte('created_at', filtros.dateFrom);
      if (filtros?.dateTo) query = query.lte('created_at', filtros.dateTo);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as HistoricoAlteracao[], count: count ?? 0 };
    },
    enabled: !!empresaId,
  });
}

interface RegistrarAtividadeParams {
  empresaId: string;
  usuarioId: string;
  tabela: string;
  acao: AcaoHistorico;
  descricao: string;
  registroId?: string;
  dadosAntes?: Record<string, unknown>;
  dadosDepois?: Record<string, unknown>;
}

/**
 * Registra manualmente uma entrada descritiva no histórico (origem = 'frontend').
 * Complementa os triggers do banco (que já capturam todo INSERT/UPDATE/DELETE
 * bruto): usar para dar contexto legível a ações que não mapeiam bem para um
 * único diff de linha, como exclusões em massa ou mudanças de etapa no Kanban.
 */
export function useRegistrarAtividade() {
  return useMutation({
    mutationFn: async (params: RegistrarAtividadeParams) => {
      const { error } = await supabase.from('historico_alteracoes').insert({
        empresa_id: params.empresaId,
        usuario_id: params.usuarioId,
        tabela: params.tabela,
        registro_id: params.registroId ?? null,
        acao: params.acao,
        descricao: params.descricao,
        dados_antes: params.dadosAntes ?? null,
        dados_depois: params.dadosDepois ?? null,
        origem: 'frontend',
      });
      if (error) throw error;
    },
  });
}

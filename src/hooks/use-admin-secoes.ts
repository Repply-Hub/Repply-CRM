import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LinhaSecaoEmpresa {
  empresa_id: string;
  empresa_nome: string | null;
  usuarios: number;
  preset_id: string | null;
  preset_nome: string | null;
  secao: string;
  /** Já resolvida: exceção → preset → padrão. */
  habilitada: boolean;
  /** De onde veio a resposta acima. Sem isto ninguém entende empresas divergindo. */
  origem: 'excecao' | 'preset' | 'padrao';
}

/**
 * Controle de seções por empresa, para o administrador global.
 *
 * Tudo por RPC `SECURITY DEFINER`, como o resto do painel de admin (use-admin-cs.ts): a
 * autorização real mora no corpo das funções — `is_admin()` com `RAISE` —, e a tela só
 * decide se aparece. Conferido: chamar `admin_secoes_por_empresa` sem sessão de admin
 * devolve "Apenas o administrador global pode ver o controle de seções".
 *
 * EIXO: isto é POR EMPRESA (o que existe). Não confundir com `use-permissoes.ts`, que é
 * POR USUÁRIO (quem vê, dentro do que existe).
 */
export function useAdminSecoes() {
  return useQuery({
    queryKey: ['admin_secoes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_secoes_por_empresa');
      if (error) throw error;
      return (data ?? []) as LinhaSecaoEmpresa[];
    },
  });
}

/**
 * Cria, altera ou remove a exceção de uma empresa.
 *
 * `habilitada: null` REMOVE a exceção, e a empresa volta a seguir o preset. Esse terceiro
 * estado não é luxo: sem ele, "voltar ao padrão" viraria uma exceção gravada com o mesmo
 * valor do preset — e no dia em que o preset mudasse, aquela empresa ficaria para trás sem
 * ninguém entender por quê.
 */
export function useDefinirExcecao() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      empresaId: string;
      secao: string;
      habilitada: boolean | null;
    }) => {
      const { error } = await supabase.rpc('admin_definir_excecao_secao', {
        p_empresa_id: p.empresaId,
        p_secao: p.secao,
        p_habilitada: p.habilitada,
      });
      if (error) throw error;
    },
    onSuccess: (_dados, p) => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      // A empresa afetada precisa reler o próprio mapa de seções — é a chave que o
      // useSecoesDaEmpresa usa. Sem esta invalidação, quem estiver logado lá continua
      // vendo o estado antigo por até 5 minutos (o staleTime daquele hook).
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });

      toast.success(
        p.habilitada === null
          ? 'Exceção removida — a empresa volta a seguir o preset'
          : p.habilitada
            ? 'Seção liberada para esta empresa'
            : 'Seção bloqueada para esta empresa',
      );
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o acesso');
    },
  });
}

export function useDefinirPresetDaEmpresa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { empresaId: string; presetId: string }) => {
      const { error } = await supabase.rpc('admin_definir_preset_da_empresa', {
        p_empresa_id: p.empresaId,
        p_preset_id: p.presetId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });
      toast.success('Preset da empresa alterado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o preset');
    },
  });
}

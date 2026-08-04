import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Painel de CS do admin global.
 *
 * Tudo passa por RPC `SECURITY DEFINER` por um motivo concreto: a métrica
 * central — "quando essa empresa usou o sistema pela última vez" — sai de
 * `auth.users.last_sign_in_at`, e o RLS bloqueia o schema `auth` para o cliente.
 * Não há como montar esta tela com consultas diretas.
 *
 * A autorização real mora no corpo das funções (`is_admin()` com RAISE). O que
 * o frontend faz é só decidir se mostra a tela.
 */

export interface EmpresaCS {
  empresa_id: string;
  nome: string | null;
  codigo_acesso: string;
  criada_em: string;
  plan_status: string | null;
  origem: string | null;
  plano_slug: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  tem_customer_stripe: boolean;
  usuarios: number;
  usuarios_ativos_7d: number;
  ultimo_acesso: string | null;
  negocios_30d: number;
  wa_msgs_30d: number;
  emails_30d: number;
}

export interface UsuarioCS {
  usuario_id: string;
  nome: string | null;
  email: string;
  role: string;
  criado_em: string;
  ultimo_acesso: string | null;
  suspenso: boolean;
}

export type AcaoPlano = 'trial' | 'cortesia' | 'bloquear';

/** Situação comercial derivada, que é como a tela agrupa as empresas. */
// A classificação comercial vive em lib/situacao-empresa.ts: é regra de negócio
// pura, testável sem mock, e este hook não deve ser dependência para exercitá-la.
export {
  situacaoDaEmpresa,
  diasDeTrial,
  ROTULO_SITUACAO,
  type SituacaoCS,
} from '@/lib/situacao-empresa';

export function useEmpresasCS() {
  return useQuery({
    queryKey: ['admin_empresas_cs'],
    queryFn: async (): Promise<EmpresaCS[]> => {
      const { data, error } = await supabase.rpc('admin_empresas_cs' as never);
      if (error) throw error;
      return (data ?? []) as unknown as EmpresaCS[];
    },
    staleTime: 60_000,
  });
}

export function useUsuariosDaEmpresa(empresaId: string | null) {
  return useQuery({
    queryKey: ['admin_empresa_usuarios', empresaId],
    queryFn: async (): Promise<UsuarioCS[]> => {
      if (!empresaId) return [];
      const { data, error } = await supabase.rpc(
        'admin_empresa_usuarios' as never,
        { p_empresa_id: empresaId } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as UsuarioCS[];
    },
    // Só busca quando a empresa é expandida: são 4 hoje, mas a consulta cruza
    // auth.users e não faz sentido pagar por todas de uma vez.
    enabled: !!empresaId,
    staleTime: 60_000,
  });
}

export function useDefinirPlano() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { empresaId: string; acao: AcaoPlano; dias?: number }) => {
      const { data, error } = await supabase.rpc(
        'admin_definir_plano' as never,
        {
          p_empresa_id: params.empresaId,
          p_acao: params.acao,
          p_dias: params.dias ?? 7,
        } as never,
      );
      if (error) throw error;
      return data as unknown as { plan_status: string; current_period_end: string | null };
    },
    onSuccess: (_r, params) => {
      qc.invalidateQueries({ queryKey: ['admin_empresas_cs'] });
      // O perfil carrega a assinatura embutida: sem invalidar, o gate do próprio
      // admin continuaria com o estado antigo em cache.
      qc.invalidateQueries({ queryKey: ['usuarios'] });

      const msg: Record<AcaoPlano, string> = {
        trial: `Teste liberado por ${params.dias ?? 7} dias.`,
        cortesia: 'Acesso de cortesia liberado, sem cobrança.',
        bloquear: 'Acesso bloqueado. Os dados continuam intactos.',
      };
      toast.success(msg[params.acao]);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

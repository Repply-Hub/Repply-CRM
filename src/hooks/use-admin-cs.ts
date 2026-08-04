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
export type SituacaoCS = 'pagante' | 'trial' | 'trial_vencido' | 'cortesia' | 'nunca_pagou' | 'bloqueada';

/**
 * Traduz o par (plan_status, origem) na leitura comercial.
 *
 * O banco guarda o estado técnico; a tela precisa da pergunta de negócio —
 * "essa empresa paga, testa ou está parada?". Manter a tradução aqui, e não
 * espalhada no JSX, é o que permite mudar a régua num lugar só.
 */
export function situacaoDaEmpresa(e: EmpresaCS): SituacaoCS {
  const status = (e.plan_status ?? '').toLowerCase();
  const origem = (e.origem ?? '').toLowerCase();

  if (status === 'trialing') {
    const fim = e.current_period_end ? new Date(e.current_period_end) : null;
    return fim && fim.getTime() <= Date.now() ? 'trial_vencido' : 'trial';
  }
  if (['inactive', 'canceled', 'unpaid'].includes(status)) {
    // Nunca teve customer no Stripe = cadastrou e não chegou a pagar. Já ter
    // tido customer significa que pagou e depois caiu — são dois trabalhos de
    // CS diferentes: um é ativação, o outro é retenção.
    return e.tem_customer_stripe ? 'bloqueada' : 'nunca_pagou';
  }
  // 'legacy' são as empresas que já usavam antes de existir cobrança;
  // 'cortesia' foram liberadas de propósito pelo painel. Nenhuma das duas paga,
  // e é isso que interessa na leitura comercial.
  if (origem === 'legacy' || origem === 'cortesia') return 'cortesia';
  return 'pagante';
}

export const ROTULO_SITUACAO: Record<SituacaoCS, string> = {
  pagante: 'Pagante',
  trial: 'Em teste',
  trial_vencido: 'Teste vencido',
  cortesia: 'Cortesia',
  nunca_pagou: 'Cadastrou, não pagou',
  bloqueada: 'Pagamento parado',
};

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

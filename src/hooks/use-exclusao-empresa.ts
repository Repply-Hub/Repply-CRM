import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';

/**
 * Excluir, restaurar e listar o que espera decisão — o lado do painel de admin.
 *
 * 🔴 EXCLUIR PASSA PELA FUNÇÃO DE SERVIDOR, e não direto pelo banco. A ordem importa: ela
 * cancela a assinatura no Stripe ANTES de marcar. Chamar a função de banco direto pularia o
 * cancelamento e deixaria uma empresa encerrada ainda sendo cobrada — dinheiro do cliente
 * saindo por um sistema que ele não acessa mais.
 *
 * Restaurar não tem esse problema (não há nada a desfazer no Stripe), então vai direto.
 */

export interface NumerosDaEmpresa {
  usuarios: number;
  clientes: number;
  obras: number;
  negocios: number;
  mensagens: number;
}

/** Quanto dado a empresa tem. Só carrega quando a confirmação abre — é uma contagem pesada. */
export function useNumerosDaEmpresa(empresaId: string | null) {
  return useQuery({
    queryKey: ['empresa_numeros', empresaId],
    queryFn: async (): Promise<NumerosDaEmpresa | null> => {
      const { data, error } = await supabase.rpc('empresa_numeros' as never, {
        p_empresa_id: empresaId,
      } as never);
      if (error) throw error;
      // A função devolve UMA linha, mas o PostgREST entrega `setof` como array. E devolve
      // ZERO linhas quando quem chama não é admin (o `where is_admin()` dentro dela) — por
      // isso o `?? null` no fim: sem admin não há linha, e isso não é erro.
      //
      // O `as unknown as` é feio e necessário: o nome da RPC entra como `never` (ela não está
      // nos tipos gerados), e aí o TypeScript não consegue estreitar o retorno sozinho.
      const linhas = (data ?? []) as unknown as NumerosDaEmpresa[];
      return linhas[0] ?? null;
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });
}

export interface EmpresaParaDecidir {
  empresa_id: string;
  nome: string;
  situacao:
    | 'excluida_aguardando'
    | 'excluida_prazo_esgotado'
    | 'inadimplente_prazo_esgotado';
  dias: number;
  dias_restantes: number;
  desde: string;
}

/**
 * O que espera uma decisão de vocês: empresas excluídas dentro do prazo, as que passaram
 * dele, e as que a régua de cobrança levou até o dia 90.
 *
 * As três terminam no mesmo lugar — alguém precisa decidir — e por isso vêm na mesma lista.
 */
export function useEmpresasParaDecidir() {
  return useQuery({
    queryKey: ['empresas_para_decidir'],
    queryFn: async (): Promise<EmpresaParaDecidir[]> => {
      const { data, error } = await supabase.rpc('empresas_para_decidir' as never);
      if (error) throw error;
      return (data ?? []) as EmpresaParaDecidir[];
    },
    staleTime: 60_000,
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin_empresas_cs'] });
  qc.invalidateQueries({ queryKey: ['empresas_para_decidir'] });
}

export function useExcluirEmpresa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ empresaId, motivo }: { empresaId: string; motivo: string }) => {
      // O token vai à mão: a sessão em memória pode estar vencida depois de a aba ficar aberta
      // a manhã inteira, e um 401 no meio de uma exclusão é o pior lugar para um erro mudo.
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) throw new Error('Sua sessão expirou. Entre novamente.');

      const { data, error } = await supabase.functions.invoke('empresa-excluir', {
        body: { empresa_id: empresaId, motivo: motivo || null },
        headers: { Authorization: `Bearer ${sessao.session.access_token}` },
      });

      if (error) throw await erroLegivelDaFunction(error, 'Não foi possível excluir a empresa.');
      return data as { assinatura_cancelada?: boolean; sem_assinatura?: boolean };
    },
    onSuccess: (r) => {
      invalidar(qc);
      toast.success(
        r?.assinatura_cancelada
          ? 'Empresa excluída e assinatura cancelada. Dá para restaurar por 60 dias.'
          : 'Empresa excluída. Dá para restaurar por 60 dias.',
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível excluir a empresa.')),
  });
}

export function useRestaurarEmpresa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (empresaId: string) => {
      const { data, error } = await supabase.rpc('restaurar_empresa' as never, {
        p_empresa_id: empresaId,
      } as never);
      if (error) throw error;
      return data as { assinatura_precisa_ser_refeita?: boolean };
    },
    onSuccess: (r) => {
      invalidar(qc);
      // 🔴 DIZER QUE A ASSINATURA NÃO VOLTOU. Ela foi cancelada de verdade no dia da exclusão,
      // e cancelamento não se desfaz. Sem este aviso, a pessoa restaura, vê a empresa
      // funcionando, e descobre no fim do mês que ninguém está pagando.
      if (r?.assinatura_precisa_ser_refeita) {
        toast.warning(
          'Empresa restaurada — mas a assinatura foi cancelada e precisa ser refeita pelo cliente.',
          { duration: 8000 },
        );
      } else {
        toast.success('Empresa restaurada, exatamente como estava antes.');
      }
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível restaurar a empresa.')),
  });
}

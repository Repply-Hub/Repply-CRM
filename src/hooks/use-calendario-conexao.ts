import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { mensagemDeErroDaFunction } from '@/lib/erro-edge-function';

export interface ConexaoCalendario {
  id: string;
  provedor: string;
  contaEmail: string | null;
  status: string;
  ultimoErro: string | null;
}

/**
 * Lê a conexão do vendedor com o Google Agenda (`calendario_contas`) e expõe as
 * ações de conectar/desconectar via a função de borda `calendario-conectar`
 * (Tarefa 7 — ainda não existe; aqui só chamamos o contrato dela).
 *
 * A consulta pede só as colunas sem token: a RLS libera a linha inteira, mas
 * `refresh_token`/`access_token` ficam protegidas por GRANT de coluna no banco
 * (migration 20260923140100) — pedir demais aqui devolveria erro de permissão.
 */
export function useConexaoCalendario() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.user_id;

  const consulta = useQuery({
    queryKey: ['calendario_conexao', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConexaoCalendario | null> => {
      const { data, error } = await supabase
        .from('calendario_contas')
        .select('id, provedor, conta_email, status, ultimo_erro')
        .eq('user_id', userId!)
        .eq('provedor', 'google')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        provedor: data.provedor,
        contaEmail: data.conta_email,
        status: data.status,
        ultimoErro: data.ultimo_erro,
      };
    },
  });

  async function iniciarGoogle() {
    const { data, error } = await supabase.functions.invoke('calendario-conectar', {
      body: { acao: 'iniciar', provedor: 'google' },
    });
    if (error) {
      toast.error(await mensagemDeErroDaFunction(error, 'Não foi possível iniciar a conexão.'));
      return;
    }
    if (data?.url) window.location.assign(data.url as string);
  }

  const desconectarMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('calendario-conectar', {
        body: { acao: 'desconectar', provedor: 'google' },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendario_conexao', userId] });
      toast.success('Calendário desconectado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível desconectar.')),
  });

  return {
    conexao: consulta.data ?? null,
    carregando: consulta.isLoading,
    iniciarGoogle,
    desconectar: () => desconectarMut.mutate(),
    desconectando: desconectarMut.isPending,
  };
}

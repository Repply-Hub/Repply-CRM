import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { toast } from 'sonner';
import { erroLegivelDaFunction, corpoDoErroDaFunction } from '@/lib/erro-edge-function';

export type ProvedorEmail = 'google' | 'microsoft' | 'imap';

export interface ContaEmail {
  id: string;
  empresa_id: string;
  provedor: ProvedorEmail;
  email: string;
  nome_exibicao: string | null;
  status: 'conectada' | 'revogada' | 'erro';
  ultimo_erro: string | null;
  ultima_sync_em: string | null;
  conectado_em: string;
}

export const ROTULO_PROVEDOR: Record<ProvedorEmail, string> = {
  google: 'Google / Gmail',
  microsoft: 'Microsoft 365 / Outlook',
  imap: 'Outro provedor (IMAP)',
};

/**
 * Caixa de e-mail da empresa, conectada via Nylas.
 *
 * A assinatura espelha de propósito a de `useGmail`
 * (`{ isConnected, connectedEmail, sendEmail, isLoading, isSending }`): a tela
 * de e-mails consome esse contrato em três pontos, e manter o formato faz a
 * troca de origem virar troca de import, sem reescrever a página.
 *
 * Diferença de modelo que importa: o Gmail era por USUÁRIO (`gmail_tokens` tem
 * PK `user_id`); aqui a caixa é da EMPRESA e o time inteiro compartilha, como
 * já acontece no WhatsApp. Por isso a consulta parte de `empresa_id`, não de
 * `user.id`.
 */
export function useEmailEmpresa() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const empresaId = profile?.empresa_id as string | undefined;

  const { data: conta, isLoading } = useQuery({
    queryKey: ['email_conta', empresaId],
    queryFn: async (): Promise<ContaEmail | null> => {
      if (!empresaId) return null;
      // Colunas explícitas: `select('*')` traria colunas novas sem querer, e
      // esta tabela fica ao lado de uma que guarda credencial. O grant_id vive
      // em `email_conta_grants`, sem policy alguma — o cliente não alcança.
      const { data, error } = await supabase
        .from('email_contas')
        .select('id, empresa_id, provedor, email, nome_exibicao, status, ultimo_erro, ultima_sync_em, conectado_em')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) {
        console.warn('[email] não consegui ler a conta:', error.message);
        return null;
      }
      return (data as ContaEmail | null) ?? null;
    },
    enabled: !!empresaId,
    staleTime: 30_000,
  });

  const conectarMutation = useMutation({
    mutationFn: async (provedor: ProvedorEmail) => {
      const { data, error } = await supabase.functions.invoke('email-conectar', {
        body: { provedor },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Não foi possível iniciar a conexão');
      if (!data?.url) throw new Error('O servidor não devolveu o endereço de conexão.');
      return data.url as string;
    },
    onSuccess: (url) => {
      // Navegação de página inteira, não popup: o fluxo termina num redirect do
      // provedor de volta para /emails, e popup bloqueado seria um beco sem saída.
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const desconectarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('email-desconectar', { body: {} });
      if (error) throw await erroLegivelDaFunction(error, 'Não foi possível desconectar');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_conta'] });
      toast.success('Caixa de e-mail desconectada.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const enviarMutation = useMutation({
    mutationFn: async (params: {
      to: string | string[];
      subject: string;
      body: string;
      cc?: string[];
      bcc?: string[];
      reply_to_message_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('email-enviar', {
        body: {
          to: Array.isArray(params.to) ? params.to : [params.to],
          subject: params.subject,
          body: params.body,
          cc: params.cc ?? [],
          bcc: params.bcc ?? [],
          ...(params.reply_to_message_id
            ? { reply_to_message_id: params.reply_to_message_id }
            : {}),
          // Chave de idempotência gerada aqui: o envio no Nylas é síncrono e sem
          // retry automático. Se a rede cair depois de o Nylas aceitar, o retry
          // não pode fazer o destinatário receber duas vezes.
          idempotency_key: crypto.randomUUID(),
        },
      });

      if (error) {
        // O `code` distingue situação tratável (sem conta, plano inativo) de
        // falha de verdade — e é inalcançável sem ler o corpo, porque a
        // biblioteca zera `data` quando o status é de erro.
        const corpo = await corpoDoErroDaFunction(error);
        const codigo = typeof corpo?.code === 'string' ? corpo.code : null;
        const e = await erroLegivelDaFunction(error, 'Erro ao enviar o e-mail');
        (e as Error & { code?: string }).code = codigo ?? undefined;
        throw e;
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_mensagens'] });
      toast.success('E-mail enviado.');
    },
    onError: (err: Error & { code?: string }) => {
      // Conexão morta merece um empurrão para a ação certa, não só o erro.
      if (err.code === 'conta_revogada' || err.code === 'sem_conta') {
        queryClient.invalidateQueries({ queryKey: ['email_conta'] });
      }
      toast.error(err.message);
    },
  });

  return {
    conta: conta ?? null,
    conectar: (provedor: ProvedorEmail) => conectarMutation.mutate(provedor),
    desconectar: () => desconectarMutation.mutate(),
    enviarEmail: (to: string | string[], subject: string, body: string) =>
      enviarMutation.mutateAsync({ to, subject, body }),
    enviar: enviarMutation.mutateAsync,

    // Nomes iguais aos do useGmail, para a tela não precisar mudar.
    isConnected: conta?.status === 'conectada',
    connectedEmail: conta?.email ?? null,
    isLoading,
    isSending: enviarMutation.isPending,
    isConnecting: conectarMutation.isPending,
    precisaReconectar: conta?.status === 'revogada',
  };
}

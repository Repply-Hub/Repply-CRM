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
    mutationFn: async (opcoes?: { preservarMensagens?: boolean }) => {
      // O padrão do servidor é preservar. Mandar explícito para o comportamento
      // não depender de quem chama esquecer de decidir.
      const preservar = opcoes?.preservarMensagens ?? true;
      const { data, error } = await supabase.functions.invoke('email-desconectar', {
        body: { preservar_mensagens: preservar },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Não foi possível desconectar');
      return data as { preservou?: boolean; mensagens?: number } | null;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['email_conta'] });
      // As listas apontavam para uma conta que não existe mais.
      queryClient.invalidateQueries({ queryKey: ['received_emails'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });

      const n = r?.mensagens ?? 0;
      if (r?.preservou === false && n > 0) {
        toast.success(`Caixa desconectada. ${n} ${n === 1 ? 'mensagem apagada' : 'mensagens apagadas'}.`);
      } else if (r?.preservou && n > 0) {
        toast.success(`Caixa desconectada. ${n} ${n === 1 ? 'mensagem mantida' : 'mensagens mantidas'} no histórico.`);
      } else {
        toast.success('Caixa de e-mail desconectada.');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sincronizarMutation = useMutation({
    mutationFn: async (opcoes?: {
      limit?: number;
      backfill?: boolean;
      silencioso?: boolean;
      /** Varrer SÓ estes marcadores (ids do provedor), em vez da caixa toda. */
      pastas?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('email-sync', {
        // backfill por padrão: quando a pessoa CLICA em atualizar, ela quer as
        // N mais recentes da caixa, não "o que mudou desde a última varredura".
        // O modo incremental serve ao cron, que roda sozinho e sem plateia.
        body: {
          limit: opcoes?.limit ?? 20,
          backfill: opcoes?.backfill ?? true,
          // Varredura dirigida: a tela pede um marcador específico quando a
          // pessoa abre um que ainda não tem mensagem aqui. Sem isto, o único
          // jeito de preencher aquele marcador seria esperar a varredura
          // completa chegar nele — que, numa caixa grande, pode ser a próxima.
          ...(opcoes?.pastas?.length ? { pastas: opcoes.pastas } : {}),
        },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Não foi possível sincronizar');
      return data as { novas: number; atualizadas: number; erros?: string[] };
    },
    onSuccess: (r, opcoes) => {
      queryClient.invalidateQueries({ queryKey: ['received_emails'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['email_conta'] });
      // A varredura é o ÚNICO momento em que a lista de marcadores é espelhada
      // do provedor. Sem invalidar aqui, quem acabou de sincronizar continuaria
      // vendo a barra lateral antiga até o staleTime de 60 s vencer — e, na
      // primeira sincronização depois de conectar, veria uma barra vazia.
      queryClient.invalidateQueries({ queryKey: ['email_pastas'] });

      // `silencioso` é a varredura que a própria tela dispara para preencher os
      // marcadores que faltam. Ninguém pediu por ela, então ninguém precisa ser
      // avisado do resultado — um "Nenhuma mensagem nova" toda vez que a tela
      // abre seria ruído puro.
      if (opcoes?.silencioso) return;

      if (r.erros?.length) {
        // Erro por conta não é falha da sincronização inteira: o que deu certo
        // já entrou, e esconder o resto faria o usuário achar que não veio nada.
        toast.warning(`Sincronizado com ressalvas: ${r.erros[0]}`);
        return;
      }
      if (r.novas > 0) {
        toast.success(`${r.novas} ${r.novas === 1 ? 'mensagem nova' : 'mensagens novas'}.`);
      } else {
        toast.info('Nenhuma mensagem nova.');
      }
    },
    onError: (err: Error, opcoes) => {
      // Falha do disparo automático também é silenciosa: a pessoa não pediu, e
      // a barra simplesmente segue sem os marcadores. O erro fica no console.
      if (opcoes?.silencioso) {
        console.warn('[email] não consegui espelhar os marcadores:', err.message);
        return;
      }
      toast.error(err.message);
    },
  });

  /**
   * Corpo completo de uma mensagem, sob demanda — em três degraus, do mais
   * barato para o mais caro:
   *
   *   1. cache do react-query  — reabrir a mesma mensagem é instantâneo;
   *   2. a própria linha       — uma consulta pequena (~1 kB), porque a Edge
   *                              Function grava o corpo ali na primeira
   *                              abertura, inclusive a de um colega;
   *   3. Edge Function/Nylas   — ~1 s, só quando ninguém abriu ainda.
   *
   * A versão anterior ia direto ao degrau 3 sempre, e ainda chamava
   * `invalidateQueries(['received_emails'])` no fim — o que refazia a busca da
   * listagem inteira a cada e-mail aberto. Nada disso é preciso: quem guarda o
   * corpo agora é o cache por mensagem, e a lista não carrega mais corpo nenhum.
   */
  const carregarCorpo = async (mensagemId: string): Promise<string | null> => {
    const chave = ['email_corpo', mensagemId];

    // `cid:` pendente = corpo cacheado ANTES de `resolverImagensInline` existir
    // na Edge Function (imagem embutida ainda referenciando o esquema que o
    // navegador não sabe interpretar). Repetido nos dois degraus de cache
    // abaixo (React Query em memória E a linha da tabela) — os dois guardam o
    // MESMO corpo já resolvido uma vez pela Edge Function, e um só deles
    // aceitando a versão quebrada bastaria pra reproduzir o ícone quebrado
    // direto do cache, sem nunca chegar na Edge Function de novo.
    const jaResolvido = (html: string | null | undefined): html is string =>
      !!html && !html.includes('cid:');

    const emCache = queryClient.getQueryData<string>(chave);
    if (jaResolvido(emCache)) return emCache;

    const { data: linha } = await supabase
      .from('email_mensagens')
      .select('corpo_html, conta_id')
      .eq('id', mensagemId)
      .maybeSingle();

    if (jaResolvido(linha?.corpo_html)) {
      queryClient.setQueryData(chave, linha.corpo_html);
      return linha.corpo_html;
    }

    // Mensagem de caixa já desconectada (conta_id nulo) e sem corpo em cache: o
    // conteúdo completo não existe mais em lugar nenhum acessível — buscá-lo
    // exigiria a credencial da caixa, que foi revogada no provedor.
    //
    // Sem esta saída, a chamada iria à Edge Function só para receber 409 e o
    // usuário veria "Credencial da caixa não encontrada. Reconecte." — que
    // engana duas vezes: sugere um defeito onde houve uma escolha, e propõe uma
    // ação que não recupera este corpo. Melhor ficar com a prévia, em silêncio.
    if (linha && linha.conta_id === null) return null;

    const { data, error } = await supabase.functions.invoke('email-mensagem', {
      body: { mensagem_id: mensagemId },
    });
    if (error) {
      const e = await erroLegivelDaFunction(error, 'Não foi possível abrir a mensagem');
      toast.error(e.message);
      return null;
    }

    const corpo = (data?.corpo_html as string) ?? '';
    if (corpo) queryClient.setQueryData(chave, corpo);
    return corpo;
  };

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
    /** `preservarMensagens` decide o destino do histórico já sincronizado. */
    desconectar: (opcoes?: { preservarMensagens?: boolean }) =>
      desconectarMutation.mutateAsync(opcoes),
    isDisconnecting: desconectarMutation.isPending,
    /**
     * Quem pode ligar/desligar a caixa da empresa. Espelha a lista que a Edge
     * Function `email-desconectar` valida no servidor — aqui é só para não
     * mostrar um botão que vai falhar; a barreira de verdade é lá.
     */
    podeGerenciarCaixa: ['admin', 'empresa', 'gestor'].includes(profile?.role ?? ''),
    /**
     * `respondendoA` é o `nylas_message_id` da mensagem que está sendo
     * respondida — e não é opcional por capricho.
     *
     * O Nylas usa esse id para montar os cabeçalhos `In-Reply-To` e
     * `References`. Sem eles a resposta sai como mensagem SOLTA: o cliente do
     * destinatário não a encosta na conversa, e o provedor devolve a cópia
     * enviada com uma thread própria. Aqui dentro isso tem uma consequência
     * pesada — a regra de acesso por marcador reconhece a resposta justamente
     * por ela pertencer à conversa de origem, então quem tem acesso a um
     * marcador responderia e não veria a própria resposta.
     */
    enviarEmail: (
      to: string | string[],
      subject: string,
      body: string,
      respondendoA?: string | null,
    ) =>
      enviarMutation.mutateAsync({
        to,
        subject,
        body,
        ...(respondendoA ? { reply_to_message_id: respondendoA } : {}),
      }),
    enviar: enviarMutation.mutateAsync,

    // Nomes iguais aos do useGmail, para a tela não precisar mudar.
    isConnected: conta?.status === 'conectada',
    connectedEmail: conta?.email ?? null,
    isLoading,
    isSending: enviarMutation.isPending,
    isConnecting: conectarMutation.isPending,
    precisaReconectar: conta?.status === 'revogada',

    /**
     * `silencioso` = varredura que a tela dispara sozinha; não avisa nada.
     * `pastas` = varre só esses marcadores, em vez da caixa inteira.
     */
    sincronizar: (opcoes?: {
      limit?: number;
      backfill?: boolean;
      silencioso?: boolean;
      pastas?: string[];
    }) => sincronizarMutation.mutate(opcoes),
    /** Promessa da mesma varredura, para quem precisa esperar terminar. */
    sincronizarAsync: sincronizarMutation.mutateAsync,
    isSyncing: sincronizarMutation.isPending,
    carregarCorpo,
  };
}

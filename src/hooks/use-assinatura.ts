import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { corpoDoErroDaFunction, erroLegivelDaFunction } from '@/lib/erro-edge-function';

/**
 * As duas operações de cobrança do cliente: começar a assinar, e gerenciar a assinatura.
 *
 * 🔴 EXISTE PARA NÃO HAVER DUAS CÓPIAS. Esta lógica nasceu dentro de `pages/Assinar.tsx`, e
 * em 30/08/2026 a aba Pagamentos passou a precisar exatamente dela. Duplicar significaria
 * duas versões do tratamento de erro do Stripe divergindo com o tempo — e a que divergisse
 * seria a que ninguém abre, porque só aparece quando o pagamento falha.
 *
 * Ambas mandam o usuário para uma página do Stripe (`window.location.href`), então não há
 * estado para reconciliar depois: quem volta, volta pela URL de retorno.
 *
 * ⚠️ DÍVIDA CONHECIDA, DEIXADA DE PROPÓSITO EM 30/08/2026: `pages/Assinar.tsx` continua com a
 * própria cópia deste código. A extração dele ficou de fora porque a tela entrelaça o
 * checkout com o `verificarAgora` dela, não tem teste nenhum cobrindo, e é a tela de
 * pagamento — refatorar isso no fim de uma sessão longa troca um risco pequeno (duas cópias)
 * por um grande (quebrar quem tenta pagar).
 *
 * Quem for mexer no tratamento de erro do Stripe: mexa NOS DOIS, ou colapse os dois neste
 * hook de uma vez. A cópia que divergir será a que ninguém abre, porque só aparece quando o
 * pagamento falha.
 */

type EmAndamento = 'checkout' | 'portal' | null;

interface Opcoes {
  /**
   * Chamado quando o checkout recusa porque a empresa JÁ tem assinatura ativa.
   *
   * Isso não é erro: é a tela estando velha. Quem chama costuma querer revalidar o perfil
   * para a interface se corrigir sozinha, em vez de deixar a pessoa olhando um botão de
   * assinar que ela não precisa mais.
   */
  aoJaEstarAtiva?: () => void | Promise<void>;
}

export function useAssinatura({ aoJaEstarAtiva }: Opcoes = {}) {
  const [processando, setProcessando] = useState<EmAndamento>(null);

  /**
   * O token vai no cabeçalho À MÃO, e não é redundância.
   *
   * `functions.invoke` usa a sessão que o cliente tem em memória, que pode estar vencida
   * depois de a aba ficar aberta a manhã inteira — e a função do servidor responderia 401
   * numa tela de pagamento, que é o pior lugar para um erro incompreensível. Buscar a sessão
   * agora força a renovação antes de sair daqui.
   */
  const tokenAtual = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast.error('Sua sessão expirou. Entre novamente.');
      return null;
    }
    return data.session.access_token;
  };

  /** Abre o checkout do Stripe para o plano escolhido. */
  const assinar = async (slugDoPlano: string) => {
    setProcessando('checkout');
    try {
      const token = await tokenAtual();
      if (!token) return;

      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { plano: slugDoPlano },
        headers: { Authorization: `Bearer ${token}` },
      });

      // 🔴 Quando a função responde com status de erro, a biblioteca devolve `data` NULO e
      // joga tudo em `error` — então os códigos de diagnóstico têm de ser lidos do corpo do
      // erro, nunca de `data`. Ler de `data` aqui dá `undefined` sempre, e o `if` de
      // diagnóstico nunca dispara.
      if (error) {
        const corpo = await corpoDoErroDaFunction(error);

        if (corpo?.code === 'ja_ativa') {
          toast.info('Esta empresa já tem assinatura ativa.');
          await aoJaEstarAtiva?.();
          return;
        }
        if (corpo?.code === 'sem_price_id') {
          toast.error('O plano ainda não está configurado para cobrança. Fale com o suporte.');
          return;
        }
        throw await erroLegivelDaFunction(error, 'Não foi possível abrir o pagamento.');
      }
      if (!data?.url) throw new Error('Resposta inesperada do servidor.');

      window.location.href = data.url;
    } catch (err) {
      console.error('[assinatura] checkout:', err);
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir o pagamento.');
    } finally {
      setProcessando(null);
    }
  };

  /**
   * Abre o portal do Stripe: faturas, recibos, troca de cartão e cancelamento.
   *
   * Estas quatro coisas ficam com o Stripe de propósito — são mecânica de dinheiro que ele
   * já resolve em português, sempre em dia, e sem a gente nunca tocar em número de cartão.
   * Refazer na nossa tela significaria manter uma cópia sincronizada de algo que não é nosso.
   */
  const abrirPortal = async () => {
    setProcessando('portal');
    try {
      const token = await tokenAtual();
      if (!token) return;

      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const corpo = await corpoDoErroDaFunction(error);
        // Sem cadastro no provedor não há o que gerenciar — o caminho é assinar.
        if (corpo?.code === 'sem_customer') {
          toast.info('Ainda não há assinatura para gerenciar. Assine o plano primeiro.');
          return;
        }
        throw await erroLegivelDaFunction(error, 'Não foi possível abrir a gestão da assinatura.');
      }
      if (!data?.url) throw new Error('Resposta inesperada do servidor.');

      window.location.href = data.url;
    } catch (err) {
      console.error('[assinatura] portal:', err);
      toast.error(
        err instanceof Error ? err.message : 'Não foi possível abrir a gestão da assinatura.',
      );
    } finally {
      setProcessando(null);
    }
  };

  return { assinar, abrirPortal, processando };
}

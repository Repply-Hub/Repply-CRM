import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * As tentativas de conectar a caixa que NÃO viraram conexão.
 *
 * 🔴 POR QUE ISTO EXISTE: em 09/09/2026 a JHS tentou conectar quatro vezes e
 * ninguém, nem eles nem nós, tinha como saber disso. A tela mostrava o mesmo
 * "conecte sua caixa" de sempre, como se nada tivesse acontecido, e descobrir o
 * que houve exigiu ler log de servidor — um dia de investigação.
 *
 * A linha da tentativa sempre existiu (`email_conexao_estados`, gravada pelo
 * `email-conectar`); o que faltava era alguém olhar. Sucesso não aparece aqui
 * porque a linha é consumida ao conectar — então tudo que sobra é tentativa que
 * não deu certo, que é justamente o que interessa mostrar.
 */

export interface TentativaDeConexao {
  provedor: string;
  criadoEm: string;
  /** 'cancelada' | 'recusada' | 'erro'; nulo = não voltou do provedor. */
  resultado: string | null;
  erroCodigo: string | null;
  erroDetalhe: string | null;
}

/** O que o `email-conectar` mostra como nome do provedor. */
const NOME_DO_PROVEDOR: Record<string, string> = {
  google: 'Gmail / Google Workspace',
  microsoft: 'Outlook / Microsoft 365',
  imap: 'servidor próprio (IMAP)',
};

export function nomeDoProvedor(provedor: string): string {
  return NOME_DO_PROVEDOR[provedor] ?? provedor;
}

/**
 * Traduz a tentativa numa frase para quem administra a empresa.
 *
 * Pura, para ser testada sozinha: é onde mora a decisão de o que dizer, e dizer
 * a coisa errada aqui foi o defeito original (falha reportada como "cancelada").
 */
export function fraseDaTentativa(t: TentativaDeConexao): string {
  const onde = nomeDoProvedor(t.provedor);
  if (t.resultado === 'cancelada') {
    return `Você começou a conectar ${onde} e cancelou na tela do provedor.`;
  }
  if (t.resultado === 'recusada') {
    return `O provedor recusou a conexão com ${onde}.`;
  }
  if (t.resultado === 'erro') {
    return `A conexão com ${onde} voltou incompleta do provedor.`;
  }
  // `resultado` nulo: a pessoa foi para a tela do provedor e nunca voltou. É o
  // caso da JHS, e o que era invisível — não há erro nosso para mostrar, e
  // dizer isso é mais honesto do que fingir que nada aconteceu.
  return `Você começou a conectar ${onde} e não terminou — a tela do provedor não devolveu resposta.`;
}

/** Uma linha de `email_conexao_estados`, sem depender dos tipos gerados. */
interface LinhaCrua {
  provedor: string;
  criado_em: string;
  resultado: string | null;
  erro_codigo: string | null;
  erro_detalhe: string | null;
}

export function useUltimaTentativaDeConexao(empresaId?: string | null) {
  return useQuery({
    queryKey: ['email_ultima_tentativa', empresaId],
    queryFn: async (): Promise<TentativaDeConexao | null> => {
      // O `select` é digitado à mão porque `types.ts` é gerado e está sendo
      // alterado por outra frente agora; regerar aqui atropelaria aquele
      // trabalho. Quando os tipos forem regerados, o `as` sai.
      const { data, error } = await supabase
        .from('email_conexao_estados')
        .select('provedor, criado_em, resultado, erro_codigo, erro_detalhe')
        .order('criado_em', { ascending: false })
        .limit(1);

      if (error) {
        // A RLS libera só quem administra a empresa. Vendedor não ver nada aqui
        // é o comportamento certo, e não um erro que mereça assustar a tela.
        console.warn('[email] não consegui ler as tentativas de conexão:', error.message);
        return null;
      }

      const linha = (data as unknown as LinhaCrua[] | null)?.[0];
      if (!linha) return null;

      return {
        provedor: linha.provedor,
        criadoEm: linha.criado_em,
        resultado: linha.resultado,
        erroCodigo: linha.erro_codigo,
        erroDetalhe: linha.erro_detalhe,
      };
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });
}

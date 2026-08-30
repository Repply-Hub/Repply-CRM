import { recusaDeAcesso } from '@/lib/recusa-do-banco';

/**
 * A frase legível de um erro que veio de uma gravação direta em tabela.
 *
 * 🔴 ERRO DO SUPABASE NÃO É UM `Error`. O que o PostgREST devolve é um objeto simples —
 * `{ message, details, hint, code }` —, então o `e instanceof Error` que todo mundo escreve
 * por reflexo dá FALSO justamente para os erros que importam, e a pessoa recebe a frase
 * genérica do `else`.
 *
 * Custou uma ida e volta em 25/08/2026: gravar a configuração da pauta violava uma chave
 * estrangeira, o banco dizia exatamente qual, e a tela mostrava só "Não foi possível salvar".
 * A causa estava na resposta o tempo todo.
 *
 * Os três campos entram juntos de propósito: `message` diz o que falhou, `details` diz em
 * qual linha ou coluna, e `hint` é onde o Postgres às vezes escreve a saída. Ficar só com o
 * primeiro joga fora a parte acionável.
 *
 * ⚠️ NÃO É PARA FUNÇÃO QUE RODA NO SERVIDOR. Ali a mensagem chega dentro de um corpo HTTP
 * ainda não lido, e recuperá-la é assíncrono — para esse caso use
 * `mensagemDeErroDaFunction` de `@/lib/erro-edge-function`. Os dois casos parecem o mesmo e
 * não são: aplicar este aqui num erro de `functions.invoke` devolve a frase genérica em
 * inglês da biblioteca.
 *
 * 🔴 RECUSA DAS REGRAS DE ACESSO SAI NA FRENTE. É o único erro comum cuja frase original não
 * ajuda ninguém — "new row violates row-level security policy" é inglês, é jargão de banco, e
 * não diz nem a causa nem a saída. `recusaDeAcesso` troca por uma frase que diz as duas. Todo
 * o resto continua chegando como o banco escreveu: ali a frase original é a parte útil.
 */
export function mensagemDeErro(e: unknown, padrao = 'erro desconhecido'): string {
  if (typeof e === 'string' && e.trim()) return e;

  const recusa = recusaDeAcesso(e);
  if (recusa) return recusa;

  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown };
    const partes = [o.message, o.details, o.hint].filter(
      (p): p is string => typeof p === 'string' && p.trim() !== '',
    );
    // `join` com separador visível: as três partes são frases independentes, e emendá-las
    // com espaço produziria um período que parece uma frase só e não é.
    if (partes.length > 0) return partes.join(' — ');
  }

  return padrao;
}

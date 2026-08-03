/**
 * Extrai a mensagem real de um erro devolvido por `supabase.functions.invoke`.
 *
 * O motivo de existir: quando a Edge Function responde com status de erro, a
 * biblioteca lança um `FunctionsHttpError` cuja mensagem é sempre a mesma frase
 * genérica em inglês — e ela faz isso ANTES de ler o corpo da resposta. A
 * explicação de verdade ("Instância desconectada", "Número não possui
 * WhatsApp"...) fica em `error.context`, que é o objeto `Response` ainda não
 * consumido.
 *
 * Sem isto, dez causas diferentes, com soluções diferentes, chegam ao usuário
 * como a mesma frase opaca.
 */

/** Frase que a biblioteca usa quando a função responde com erro. */
const MENSAGEM_GENERICA = 'Edge Function returned a non-2xx status code';

const FALLBACK = 'Não foi possível completar a ação. Tente de novo em instantes.';

interface ErroComContexto {
  message?: string;
  context?: unknown;
}

/**
 * Devolve o corpo JSON que a função respondeu, ou null.
 *
 * Serve para ler campos além da mensagem — em especial o `code`, que as funções
 * usam para diferenciar situações tratáveis ("já tem assinatura ativa", "ainda
 * não há cliente no provedor") de falhas de verdade. Sem isto esses códigos
 * ficariam inalcançáveis: quando o status é de erro, a biblioteca devolve
 * `data` nulo e joga tudo em `error`.
 */
export async function corpoDoErroDaFunction(
  erro: unknown,
): Promise<Record<string, unknown> | null> {
  const { context } = (erro ?? {}) as ErroComContexto;
  if (!(context instanceof Response)) return null;
  try {
    const corpo = await context.clone().json();
    return corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * @param erro    o `error` devolvido pelo `invoke`
 * @param padrao  mensagem a usar quando não há nada legível na resposta
 */
export async function mensagemDeErroDaFunction(
  erro: unknown,
  padrao: string = FALLBACK,
): Promise<string> {
  if (!erro) return padrao;

  const { message, context } = (erro ?? {}) as ErroComContexto;

  // O corpo só existe quando o erro é de status HTTP. `clone()` é obrigatório:
  // o corpo de uma Response só pode ser lido uma vez, e consumi-lo aqui
  // impediria qualquer outra leitura.
  if (context instanceof Response) {
    try {
      const texto = await context.clone().text();
      if (texto) {
        try {
          const corpo = JSON.parse(texto) as { error?: unknown; message?: unknown };
          const doCorpo = corpo?.error ?? corpo?.message;
          if (typeof doCorpo === 'string' && doCorpo.trim()) return doCorpo;
        } catch {
          // Não era JSON — usa o texto cru, desde que pareça mensagem e não uma
          // página de erro inteira.
          const limpo = texto.trim();
          if (limpo && limpo.length <= 300 && !limpo.startsWith('<')) return limpo;
        }
      }
    } catch {
      // Corpo ilegível: cai no tratamento abaixo.
    }
  }

  // Erros de rede e de sessão chegam sem corpo, mas com mensagem própria útil.
  if (typeof message === 'string' && message && message !== MENSAGEM_GENERICA) {
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
    }
    return message;
  }

  return padrao;
}

/**
 * Converte o erro num `Error` já com a mensagem legível, para ser lançado de
 * dentro de uma mutação e chegar pronto ao aviso na tela.
 */
export async function erroLegivelDaFunction(erro: unknown, padrao?: string): Promise<Error> {
  return new Error(await mensagemDeErroDaFunction(erro, padrao));
}

/**
 * A mensagem que o WhatsApp conectado não conseguiu abrir.
 *
 * O texto `[Undecryptable] …` vem PRONTO da uazapi — não é nossa tradução e não
 * é defeito nosso: quem falhou em decifrar foi a sessão do WhatsApp, e não
 * existe chamada que recupere o conteúdo depois. Acontece quando o provedor
 * entrega o pacote pela metade; nas 19 ocorrências do histórico da MD (de
 * 75.952 mensagens), `remetente_telefone` veio nulo em todas — é o mesmo pacote
 * degradado que fazia o grupo ser renomeado com o nome de quem enviou.
 *
 * O que dá para fazer é não jogar o texto cru do provedor na cara de quem
 * atende — e é só isso que este módulo existe para fazer.
 */

const MARCADOR = '[undecryptable]';

/** O que a bolha da conversa mostra no lugar do texto do provedor. */
export const FRASE_INDECIFRAVEL =
  'Esta mensagem não pôde ser lida aqui — abra o WhatsApp no celular para vê-la.';

/** O que a lista de conversas mostra na linha da prévia. */
export const PREVIA_INDECIFRAVEL = 'Mensagem não lida aqui';

export function ehIndecifravel(conteudo: string | null | undefined): boolean {
  return (conteudo ?? '').toLowerCase().includes(MARCADOR);
}

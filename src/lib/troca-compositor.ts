/**
 * Decide se clicar em Responder / Responder a todos / Encaminhar é uma TROCA DE
 * MODO na mesma mensagem já aberta em resposta — e não a abertura de outra
 * composição.
 *
 * Por que importa: a trava "um compositor de cada vez" (o aviso "há um rascunho
 * em edição") existe para não perder um rascunho ao abrir OUTRA composição —
 * um e-mail novo, ou a resposta a OUTRA mensagem. Mas trocar entre os três
 * modos de resposta da MESMA mensagem aberta é refinar a mesma resposta, não
 * abrir outra: aí o aviso só atrapalha (e, com os três botões, aparecia a cada
 * troca). Neste caso a troca é feita direto, sem aviso.
 *
 * É troca direta quando: já existe uma resposta INLINE aberta (`modo === 'inline'`),
 * ela é da mensagem que está aberta agora (`inlineParaId === emailAbertoId`), e
 * há de fato uma mensagem-alvo e uma mensagem aberta. O compositor ENCAIXADO
 * (e-mail novo) nunca conta — ele não é resposta a mensagem nenhuma.
 */
export function ehTrocaDeModoNaMesmaMensagem(
  modo: string,
  inlineParaId: string | null | undefined,
  emailAbertoId: string | null | undefined,
): boolean {
  return (
    modo === "inline" &&
    !!inlineParaId &&
    !!emailAbertoId &&
    inlineParaId === emailAbertoId
  );
}

import type { PainelChatCelular } from './painel-do-chat-no-celular';

/**
 * Decide se a menção da conversa atual deve ser marcada como vista AGORA —
 * regra combinada com o dono do produto: o @ some quando a pessoa de fato
 * ABRE a conversa, nunca antes.
 *
 * Extraído do `Chat.tsx` pelo achado I-2 da revisão final do Bloco 4: o alvo
 * podia contar como "selecionado" (e a menção, como vista) sem que a pessoa
 * tivesse aberto aquela conversa — por exemplo, no instante entre montar a
 * tela no Geral e o efeito de `?conversa=` trocar para o alvo que o aviso
 * pediu, ou no celular, onde o alvo já pode estar selecionado por baixo dos
 * panos enquanto só a LISTA está na tela (`painelVisivelNoCelular`, em
 * `src/lib/painel-do-chat-no-celular.ts`, dono do tipo `PainelChatCelular`
 * que esta função reusa em vez de duplicar).
 */
export function deveMarcarMencaoComoVista(params: {
  tipoDoAlvo: 'geral' | 'grupo' | 'dm';
  temMencaoNaoLida: boolean;
  isMobile: boolean;
  painelCelular: PainelChatCelular;
}): boolean {
  const { tipoDoAlvo, temMencaoNaoLida, isMobile, painelCelular } = params;
  // Conversa direta nunca marca por aqui (regra que já existia no `Chat.tsx`
  // antes deste conserto).
  if (tipoDoAlvo === 'dm') return false;
  if (!temMencaoNaoLida) return false;
  // Abaixo de `md` a conversa só está de fato na tela quando o painel mostra
  // 'conversa' — com a lista na tela, o alvo pode estar selecionado sem que
  // a pessoa tenha visto a mensagem. No desktop as duas colunas ficam
  // sempre lado a lado, então o alvo selecionado já basta.
  if (isMobile && painelCelular !== 'conversa') return false;
  return true;
}

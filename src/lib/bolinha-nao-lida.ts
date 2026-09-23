/**
 * O que o selo de não-lida da conversa mostra: o número de mensagens novas quando há
 * mensagem nova de verdade; uma bolinha sem número quando a conversa só está marcada
 * "não lida" à mão (sem mensagem nova); nada quando está tudo lido.
 */
export type EstadoDaBolinha = 'numero' | 'ponto' | 'nada';

export function estadoDaBolinha(quantidade: number, marcadoNaoLido: boolean): EstadoDaBolinha {
  if (quantidade > 0) return 'numero';
  if (marcadoNaoLido) return 'ponto';
  return 'nada';
}

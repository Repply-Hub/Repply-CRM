/**
 * A pauta do dia, separada em "o que ainda espera" e "o que já foi feito".
 *
 * Desde 12/09/2026 a fila é escolhida na virada do dia e só encolhe: o negócio que recebe
 * retorno sai da lista e nada entra no lugar. Para a tela poder dizer "3 de 7 feitos hoje" —
 * e distinguir quem trabalhou o dia inteiro de quem não tinha nada parado —, a função de banco
 * devolve também os já feitos, marcados com `tipo = 'negocio_feito'`.
 *
 * 🔴 QUEM CONSOME TEM DE FILTRAR. `ItemPauta` desenha qualquer item que receba; sem esta
 * separação, o negócio resolvido às 9h continuaria na tela às 17h com o botão "Retomar depois"
 * do lado.
 *
 * Recebe qualquer objeto com `tipo` de propósito: o teste não precisa montar um `ItemDaPauta`
 * inteiro só para conferir uma contagem.
 */
export type ItemParaSeparar = { tipo: string };

export type PautaSeparada<T extends ItemParaSeparar> = {
  /** O que a tela desenha: compromissos da agenda e os negócios que ainda esperam retorno. */
  naTela: T[];
  /** Os negócios do dia que já receberam retorno hoje. */
  feitos: T[];
  /**
   * Quantos NEGÓCIOS o dia trouxe — o denominador de "3 de 7 feitos hoje".
   *
   * Compromisso não entra: reunião marcada não é negócio parado, e contá-la faria o
   * denominador subir sem que houvesse mais trabalho de follow-up a fazer.
   */
  negociosDoDia: number;
};

export function separarAPauta<T extends ItemParaSeparar>(itens: T[]): PautaSeparada<T> {
  const feitos = itens.filter((i) => i.tipo === 'negocio_feito');
  const naTela = itens.filter((i) => i.tipo !== 'negocio_feito');
  const parados = naTela.filter((i) => i.tipo === 'negocio_parado').length;
  return { naTela, feitos, negociosDoDia: parados + feitos.length };
}

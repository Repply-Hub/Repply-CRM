import type { PernaDaRota } from './osrm';

/**
 * Casa cada PERNA do trajeto do OSRM com o par de paradas que ela liga NA LISTA DA TELA.
 *
 * 🔴 POR QUE ISTO NÃO É UM `pernas[i]` DIRETO — e por que ele seria um erro silencioso.
 * A lista da janela de rota mostra TODAS as paradas do dia; o traçado passa só pelas que têm
 * coordenada (`comPonto`, em `rota-do-dia.ts`). Basta UMA obra sem localização no meio do dia
 * para os dois índices se descolarem: com quatro paradas e a segunda sem coordenada, o OSRM
 * devolve DUAS pernas (1→3 e 3→4), e um `pernas[1]` escrito entre a parada 2 e a 3 mostraria o
 * tempo do trecho 3→4. O número é plausível, nada na tela acusa, e o vendedor programa o dia
 * por um tempo que é de outro pedaço do caminho. Medido na base em 27/08/2026: 8 das 82 obras
 * da MD estão sem coordenada porque a geocodificação não achou o endereço — o caso não é raro.
 *
 * 🔴 A PERNA QUE PULA UMA PARADA APARECE MESMO ASSIM, e isso é decisão, não descuido.
 * Quando a parada 2 está sem localização, a perna 1→3 é tempo de estrada que o vendedor vai
 * gastar de verdade. Escondê-la faria a soma do que está escrito na tela ficar MENOR que o
 * total do cabeçalho — e duas contagens que não fecham derrubam a confiança nas duas. Então
 * ela é mostrada no degrau que CHEGA na parada 3, carregando em `indicesPulados` quem ela não
 * visita, para a tela poder escrever "sem passar pela parada 2". O que ela não é: uma promessa
 * de que o desvio até a obra 2 sai de graça.
 *
 * Com isso vale o invariante que segura o cabeçalho: cada perna aparece EXATAMENTE uma vez, e
 * a soma dos trechos é a distância/duração da rota inteira. Conferido contra o servidor de
 * verdade em 28/08/2026 (três pontos em Natal): `route.duration` 1761,7s é exatamente a soma
 * de 840,2s + 921,5s, e `route.distance` 21.352,5m a soma de 9.848,7m + 11.503,8m — o total do
 * OSRM não inclui nada além das pernas, nem parada, nem espera, nem manobra.
 *
 * Função PURA: sem React, sem fetch, sem data. Quem busca é `use-rota-osrm.ts`.
 */

export interface ParadaParaTrecho {
  /**
   * Se esta parada entrou no traçado.
   *
   * 🔴 Mande a resposta que veio de `comPonto`, não um teste novo de latitude. São a mesma
   * pergunta feita duas vezes, e o dia em que os dois critérios discordarem num caso de canto
   * (latitude `NaN`, coordenada em texto) é o dia em que o tempo de um trecho aparece entre
   * outro par de paradas — sem erro nenhum na tela.
   */
  temLocalizacao: boolean;
}

export type TrechoDaRota =
  | {
      tipo: 'percurso';
      distanciaM: number;
      duracaoS: number;
      /**
       * Índices, NA LISTA COMPLETA, das paradas sem localização que ficaram dentro deste
       * trecho — ou seja, as que o caminho não visita. Vazio no caso comum.
       */
      indicesPulados: number[];
    }
  | {
      tipo: 'sem-localizacao';
      /** Qual das duas pontas está sem coordenada no cadastro. */
      ladoSemPonto: 'origem' | 'destino';
    }
  /** Há trecho, mas não há número para ele: o trajeto ainda está sendo buscado, ou não veio. */
  | { tipo: 'sem-calculo' };

/**
 * Um trecho para cada degrau da lista: `trechos[i]` fica ENTRE `paradas[i]` e `paradas[i+1]`.
 * Uma parada só devolve lista vazia — não existe "entre" com um ponto único.
 */
export function trechosEntreParadas(
  paradas: ParadaParaTrecho[],
  pernas?: PernaDaRota[] | null,
): TrechoDaRota[] {
  if (!Array.isArray(paradas) || paradas.length < 2) return [];

  const localizadas = paradas.filter((parada) => parada?.temLocalizacao).length;
  // N paradas no traçado dão N-1 pernas. É a mesma conta que `lerRespostaDaRota` documenta.
  const esperado = Math.max(0, localizadas - 1);

  // 🔴 OU A CONTAGEM BATE EXATAMENTE, OU NENHUM NÚMERO APARECE. Se o servidor devolver uma
  // quantidade de pernas diferente da que esta lista prevê, a correspondência entre perna e
  // par de paradas está quebrada em algum ponto que não dá para adivinhar — e um tempo colado
  // no par errado é pior que tempo nenhum, porque parece certo. Fica tudo em 'sem-calculo'.
  const pernasConfiaveis = Array.isArray(pernas) && pernas.length === esperado;

  const trechos: TrechoDaRota[] = [];
  /** Índice, na lista completa, da última parada que está no traçado. */
  let ultimaLocalizada: number | null = paradas[0]?.temLocalizacao ? 0 : null;
  /** Quantas pernas já foram consumidas — anda junto com o traçado, não com a lista. */
  let pernasUsadas = 0;

  for (let i = 0; i + 1 < paradas.length; i++) {
    const destino = paradas[i + 1];

    if (!destino?.temLocalizacao) {
      // Não existe perna que TERMINE numa obra que o mapa não sabe onde fica. Dizer isso é o
      // contrário de mostrar um tempo aproximado no lugar.
      trechos.push({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
      continue;
    }

    if (ultimaLocalizada === null) {
      // O trajeto começa AQUI: tudo que veio antes está sem coordenada, então não há de onde
      // sair. O OSRM também não devolve perna para este degrau — a rota dele começa nesta obra.
      trechos.push({ tipo: 'sem-localizacao', ladoSemPonto: 'origem' });
      ultimaLocalizada = i + 1;
      continue;
    }

    const perna = pernasConfiaveis ? pernas![pernasUsadas] : undefined;
    if (!perna) {
      trechos.push({ tipo: 'sem-calculo' });
    } else {
      const indicesPulados: number[] = [];
      for (let pulada = ultimaLocalizada + 1; pulada <= i; pulada++) indicesPulados.push(pulada);
      trechos.push({
        tipo: 'percurso',
        distanciaM: perna.distanciaM,
        duracaoS: perna.duracaoS,
        indicesPulados,
      });
    }

    // Anda mesmo quando não houve número a mostrar: a posição no traçado avançou de qualquer
    // jeito, e é ela que decide qual perna pertence ao próximo degrau.
    pernasUsadas++;
    ultimaLocalizada = i + 1;
  }

  return trechos;
}

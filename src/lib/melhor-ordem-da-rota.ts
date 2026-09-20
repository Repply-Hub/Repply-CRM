import type { MelhorOrdemDoServico, PontoNoMapa } from './osrm';

/**
 * Vale a pena sugerir outra ordem para as paradas?
 *
 * 🔴 O LIMIAR NÃO É ENFEITE. O tempo vem de um serviço público que não conhece trânsito: é
 * ESTIMATIVA. Sugerir remontar a rota por dois minutos gasta a confiança da pessoa no aviso —
 * e, quando o aviso realmente importar (meia hora a mais de estrada), ela já terá aprendido a
 * ignorá-lo.
 */
export const GANHO_MINIMO_S = 5 * 60;

export type CasoDaOrdem = 'ja_otima' | 'ordem_melhor' | 'sem_sugestao';

export interface AvaliacaoDaOrdem {
  caso: CasoDaOrdem;
  /** Segundos economizados. Zero quando não há o que economizar. */
  ganhoS: number;
  /** Os índices das paradas na ordem sugerida — só em `ordem_melhor`. */
  ordem: number[] | null;
}

const SEM_SUGESTAO: AvaliacaoDaOrdem = { caso: 'sem_sugestao', ganhoS: 0, ordem: null };
const JA_OTIMA: AvaliacaoDaOrdem = { caso: 'ja_otima', ganhoS: 0, ordem: null };

function ehMesmaOrdem(ordem: readonly number[]): boolean {
  return ordem.every((indice, lugar) => indice === lugar);
}

export function avaliarOrdemDaRota({
  duracaoAtualS,
  melhorOrdem,
}: {
  duracaoAtualS?: number | null;
  melhorOrdem?: MelhorOrdemDoServico | null;
}): AvaliacaoDaOrdem {
  // Sem os dois números não há comparação — e "não sei" nunca vira conselho.
  if (!Number.isFinite(duracaoAtualS as number) || !melhorOrdem) return SEM_SUGESTAO;
  const ordem = melhorOrdem.ordem;
  if (!Array.isArray(ordem) || ordem.length === 0) return SEM_SUGESTAO;
  if (!Number.isFinite(melhorOrdem.duracaoS)) return SEM_SUGESTAO;

  if (ehMesmaOrdem(ordem)) return JA_OTIMA;

  const ganhoS = Math.round((duracaoAtualS as number) - melhorOrdem.duracaoS);
  if (ganhoS < GANHO_MINIMO_S) return JA_OTIMA;

  return { caso: 'ordem_melhor', ganhoS, ordem: [...ordem] };
}

/**
 * A rota aceita sugestão de reordenação? Rota com visita já realizada é história — não
 * reordene.
 *
 * 🔴 DECISÃO DO DONO DO PRODUTO — 16/09/2026. A ordem só é flexível enquanto a rota está
 * sendo montada. Uma vez que qualquer parada já aconteceu (`realizada === true`), mudanças
 * de ordem reassociariam o time a um horário que já correu — o calendário dos participantes
 * teria de ser refeito, conflitos teriam de ser re-averiguados, a hora que o cliente já
 * recebeu viraria mentira. Rota com parada realizada é passado, não esboço.
 *
 * Parada com `realizada` ausente ou `null` é tratada como `false` (nunca foi visitada).
 * Lista vazia (rota sem paradas) devolve `true` — não há nada para rejeitar; o limiar de
 * 3 paradas é conferido em outro lugar.
 */
export function rotaAceitaSugestaoDeOrdem(
  paradas: ReadonlyArray<{ realizada?: boolean | null }>,
): boolean {
  return !paradas.some((p) => p.realizada === true);
}

/**
 * Os pontos da rota para o OSRM, um por parada, NA MESMA ORDEM que `paradasEmOrdem` — prontos
 * para `urlDaRota` e `urlDaMelhorOrdem`. A localização vem da OBRA de cada parada (`obraId`),
 * não da parada — `Parada`, no formulário da rota, não guarda coordenada nenhuma.
 *
 * 🔴 TUDO OU NADA: se QUALQUER parada estiver com a obra não encontrada, ou com latitude ou
 * longitude ausente/não numérica, a função devolve `null` para a ROTA INTEIRA — nunca filtra
 * as que faltam localização e segue com o resto.
 *
 * Parece mais útil sugerir com o que dá (filtrar as sem localização e calcular com as outras),
 * mas isso DESLOCARIA OS ÍNDICES. A resposta do serviço (`ordem`, em `MelhorOrdemDoServico`)
 * viria calculada sobre a lista FILTRADA — e `aplicarOrdemMantendoHorarios`
 * (`ordem-das-paradas.ts`) aplica esses índices em cima de `paradasEmOrdem`, a lista COMPLETA,
 * em ordem de horário. Um índice que na resposta do serviço significava "a terceira obra COM
 * localização" apontaria, em `paradasEmOrdem`, para uma parada diferente — e o botão "Usar
 * esta ordem" moveria a obra errada para o horário errado, sem nenhum aviso na tela.
 *
 * Com `null` a tela simplesmente não mostra sugestão nenhuma, que é a decisão 7 do desenho:
 * "serviço fora do ar, lento, ou obra sem localização: nenhuma sugestão".
 *
 * Lista de paradas vazia devolve lista vazia — não é erro, é "nada para sugerir", e
 * `urlDaMelhorOrdem` já devolve string vazia sozinho para menos de 3 pontos.
 */
export function pontosDaRotaEmOrdem(
  paradasEmOrdem: ReadonlyArray<{ obraId: string }>,
  obras: ReadonlyArray<{ id: string; latitude?: number | null; longitude?: number | null }>,
): PontoNoMapa[] | null {
  const obraPorId = new Map(obras.map((obra) => [obra.id, obra]));

  const pontos: PontoNoMapa[] = [];
  for (const parada of paradasEmOrdem) {
    const obra = obraPorId.get(parada.obraId);
    if (!obra || !Number.isFinite(obra.latitude) || !Number.isFinite(obra.longitude)) {
      return null;
    }
    pontos.push({ lat: obra.latitude as number, lng: obra.longitude as number });
  }
  return pontos;
}

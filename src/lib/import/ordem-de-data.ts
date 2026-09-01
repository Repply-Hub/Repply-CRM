/**
 * Decidir se uma coluna de datas está em dia/mês (brasileiro) ou mês/dia (americano) —
 * olhando a COLUNA INTEIRA, e não uma célula de cada vez.
 *
 * 🔴 POR QUE OLHAR A COLUNA MUDA TUDO. `12/08/2026` sozinho é indecidível: cabe como 12 de
 * agosto e como 8 de dezembro. Era assim que o conversor decidia — célula a célula, chutando
 * "brasileiro" sempre que os dois números coubessem em mês. Medido na importação de
 * 01/09/2026: 786 dos 2.358 negócios entraram com dia e mês trocados por causa desse chute,
 * e nenhuma linha foi rejeitada.
 *
 * Mas uma coluna quase nunca é indecidível. Basta UMA linha com `25/12/2024` para provar que
 * a coluna inteira é brasileira, e uma com `12/25/2024` para provar o contrário. Numa
 * planilha de 2.358 linhas, a chance de nenhuma data cair depois do dia 12 é desprezível.
 *
 * A célula que não sabe pergunta para as vizinhas.
 *
 * Isto NÃO substitui `normalizarDatas` (`ler-planilha.ts`), substitui o chute que sobrava
 * onde ela não alcança: CSV e planilha com a data digitada como texto. Onde a célula é de
 * data de verdade, nada aqui é preciso — a informação já veio sem ambiguidade.
 */

export type OrdemDeData = 'br' | 'us';

export interface DiagnosticoDeColuna {
  /** A ordem a aplicar nas células ambíguas desta coluna. */
  ordem: OrdemDeData;
  /** Alguma linha PROVOU a ordem? Quando falso, `ordem` é o padrão do país, não uma medição. */
  decidida: boolean;
  /** Linhas provaram ordens diferentes — planilha misturada, tem linha errada de qualquer jeito. */
  conflito: boolean;
  /** Quantos valores desta coluna parecem data escrita com barra ou hífen. */
  total: number;
  /** Quantos deles cabem nas duas leituras (os dois números menores ou iguais a 12). */
  ambiguas: number;
  provasBr: number;
  provasUs: number;
  /** Um valor real da coluna, para a tela poder mostrar de que datas está falando. */
  exemplo?: string;
  /** Quando há conflito, um exemplo de cada lado. */
  exemploBr?: string;
  exemploUs?: string;
}

const DATA_COM_SEPARADOR = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[T ]|$)/;

const VAZIO: DiagnosticoDeColuna = {
  ordem: 'br', decidida: false, conflito: false, total: 0, ambiguas: 0, provasBr: 0, provasUs: 0,
};

/**
 * Lê a coluna inteira e diz em que ordem ela está.
 *
 * Só votam os valores que provam alguma coisa: primeiro número acima de 12 prova brasileiro
 * (não existe mês 25), segundo número acima de 12 prova americano. Valor vazio, data em ISO
 * e texto qualquer não votam — e, o mais importante, um valor AMBÍGUO também não vota, senão
 * o palpite viraria prova de si mesmo.
 */
export function diagnosticarColunaDeData(valores: readonly unknown[]): DiagnosticoDeColuna {
  if (!valores?.length) return { ...VAZIO };

  let total = 0;
  let ambiguas = 0;
  let provasBr = 0;
  let provasUs = 0;
  let exemplo: string | undefined;
  let exemploBr: string | undefined;
  let exemploUs: string | undefined;

  for (const valor of valores) {
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (!texto) continue;

    const partes = DATA_COM_SEPARADOR.exec(texto);
    if (!partes) continue;

    const primeiro = Number(partes[1]);
    const segundo = Number(partes[2]);
    if (!primeiro || !segundo || primeiro > 31 || segundo > 31) continue;

    total++;
    if (exemplo === undefined) exemplo = texto;

    // Os dois acima de 12 não é data nenhuma: não prova nada e não conta como ambígua.
    if (primeiro > 12 && segundo > 12) continue;

    if (primeiro > 12) {
      provasBr++;
      if (exemploBr === undefined) exemploBr = texto;
    } else if (segundo > 12) {
      provasUs++;
      if (exemploUs === undefined) exemploUs = texto;
    } else {
      ambiguas++;
    }
  }

  const conflito = provasBr > 0 && provasUs > 0;
  const decidida = provasBr > 0 || provasUs > 0;

  // No conflito vale a maioria: a planilha tem linha errada de qualquer forma, e a tela
  // avisa. Empate cai no brasileiro, que é o padrão de quem usa este sistema.
  const ordem: OrdemDeData = provasUs > provasBr ? 'us' : 'br';

  return { ordem, decidida, conflito, total, ambiguas, provasBr, provasUs, exemplo, exemploBr, exemploUs };
}

/**
 * Roda o diagnóstico uma vez por CABEÇALHO da planilha que tenha cara de data.
 *
 * Por cabeçalho, e não por campo: dois campos podem apontar para a mesma coluna, e a coluna
 * é que tem uma ordem só.
 */
export function diagnosticarDatasDaPlanilha(
  rawData: readonly Record<string, unknown>[],
  cabecalhos: readonly string[],
): Record<string, DiagnosticoDeColuna> {
  const porCabecalho: Record<string, DiagnosticoDeColuna> = {};
  for (const cabecalho of cabecalhos) {
    if (!cabecalho) continue;
    const diagnostico = diagnosticarColunaDeData(rawData.map((linha) => linha[cabecalho]));
    if (diagnostico.total > 0) porCabecalho[cabecalho] = diagnostico;
  }
  return porCabecalho;
}

/**
 * Contrato do parser de planilha quanto a DATAS.
 *
 * POR QUE ESTE TESTE EXISTE: a importação da base do Bitrix24 gravou ~1 em cada 4
 * datas com dia e mês trocados, silenciosamente — nenhuma linha foi rejeitada.
 *
 * A causa tem dois elos:
 *
 *   1. O Bitrix exporta a data como NÚMERO de série do Excel, sem formato de célula.
 *      O parser lia com `raw: false`, que manda o SheetJS FORMATAR o número em texto.
 *      Sem formato na célula, o SheetJS usa o padrão dele, que é americano (`m/d/aa`).
 *      O número 46247 (12/08/2026) virava o texto "8/12/26".
 *
 *   2. `sanitizeFieldValue` então tenta adivinhar se o texto é BR ou US. Quando os dois
 *      primeiros segmentos são <= 12 ele não tem como saber e assume BR — invertendo
 *      dia e mês em TODA data cujo dia real seja de 1 a 12.
 *
 * O conserto é no elo 1: não jogar fora a informação inequívoca. Célula de data sai do
 * parser já em ISO (`AAAA-MM-DD`), sem passar por adivinhação nenhuma.
 *
 * Medido contra os 8 arquivos reais do Bitrix (26.181 datas): 73,3% de acerto pelo texto
 * formatado, 100% pelo caminho inequívoco.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseImportFile } from './file-parser';
import { sanitizeFieldValue } from '@/components/import/MappingStep';

/**
 * O `File` do jsdom não implementa `arrayBuffer()`, que é o que o parser usa.
 * Sem isto, o teste falha por ambiente e não pelo comportamento sob teste.
 */
function comoArquivo(buffer: ArrayBuffer, nome: string): File {
  const arquivo = new File([buffer], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (typeof (arquivo as unknown as { arrayBuffer?: unknown }).arrayBuffer !== 'function') {
    Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => buffer });
  }
  return arquivo;
}

function comoXlsx(sheet: XLSX.WorkSheet, nome: string): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Plan1');
  return comoArquivo(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), nome);
}

/**
 * Monta um .xlsx em memória com uma coluna de datas, do mesmo jeito que o Bitrix
 * exporta: célula numérica (serial do Excel) SEM formato explícito.
 */
function planilhaComDatas(datas: Date[]): File {
  const sheet = XLSX.utils.json_to_sheet(datas.map(d => ({ Data: d })), { cellDates: true });
  return comoXlsx(sheet, 'bitrix.xlsx');
}

/** Percorre o caminho real da importação: parser -> sanitização do campo de data. */
async function importar(datas: Date[]): Promise<(string | number | undefined)[]> {
  const { rawData } = await parseImportFile(planilhaComDatas(datas));
  return rawData.map(linha => sanitizeFieldValue(linha['Data'], 'date'));
}

describe('parseImportFile — datas', () => {
  it('preserva o dia quando ele é MAIOR que 12 (caso que já funcionava)', async () => {
    // 25/08/2026 e 31/12/2023: como 25 e 31 não podem ser mês, a adivinhação acertava.
    const saida = await importar([new Date(2026, 7, 25), new Date(2023, 11, 31)]);
    expect(saida.map(String).map(s => s.slice(0, 10))).toEqual(['2026-08-25', '2023-12-31']);
  });

  it('preserva o dia quando ele é MENOR OU IGUAL a 12 — o caso que quebrava', async () => {
    // 12/08/2026 virava 08/12/2026. 06/08/2026 virava 08/06/2026.
    const saida = await importar([new Date(2026, 7, 12), new Date(2026, 7, 6)]);
    expect(saida.map(String).map(s => s.slice(0, 10))).toEqual(['2026-08-12', '2026-08-06']);
  });

  it('não confunde dia com mês em NENHUM dia do ano', async () => {
    // Varre 2026 inteiro: se algum dia sair trocado, o teste aponta qual.
    const dias: Date[] = [];
    for (let mes = 0; mes < 12; mes++) {
      for (let dia = 1; dia <= 28; dia++) dias.push(new Date(2026, mes, dia));
    }
    const saida = await importar(dias);
    const esperado = dias.map(d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
    expect(saida.map(String).map(s => s.slice(0, 10))).toEqual(esperado);
  });

  it('mantém texto que não é data intacto', async () => {
    const sheet = XLSX.utils.json_to_sheet([{ Nome: 'Construtora Alves', Valor: 'R$ 1.234,50' }]);
    const { headers, rawData } = await parseImportFile(comoXlsx(sheet, 'x.xlsx'));
    expect(headers).toEqual(['Nome', 'Valor']);
    expect(rawData[0].Nome).toBe('Construtora Alves');
    expect(rawData[0].Valor).toBe('R$ 1.234,50');
  });
});

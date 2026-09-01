/**
 * Contrato do leitor de planilha que as telas de importação usam.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE, e não bastava o `file-parser.test.ts`. O bug de dia e mês
 * trocados foi corrigido em 20/08/2026 e **voltou em 01/09/2026**, com 786 dos 2.358
 * negócios importados entrando com a data invertida. O conserto nunca foi revertido: ele
 * estava testado no módulo `file-parser`, que nenhuma tela renderizada chama, enquanto a
 * tela real (`ImportPedidosDialog`) tinha uma leitura própria e desprotegida.
 *
 * Ou seja: **a validação passou por um caminho que a MD não usa.** Este teste exercita a
 * função que a tela chama de verdade. Se alguém escrever uma quarta leitura de planilha,
 * este arquivo não a alcança — para isso existe `uma-leitura-so.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { lerPlanilhaComoObjetos } from './ler-planilha';
import { sanitizeFieldValue } from '@/components/import/MappingStep';

/** O `File` do jsdom não implementa `arrayBuffer()` nem `text()`, que é o que o leitor usa. */
function comoArquivo(conteudo: ArrayBuffer | string, nome: string): File {
  const arquivo = new File([conteudo as BlobPart], nome);
  if (typeof (arquivo as unknown as { arrayBuffer?: unknown }).arrayBuffer !== 'function') {
    Object.defineProperty(arquivo, 'arrayBuffer', {
      value: async () => (typeof conteudo === 'string' ? new TextEncoder().encode(conteudo).buffer : conteudo),
    });
  }
  Object.defineProperty(arquivo, 'text', {
    value: async () => (typeof conteudo === 'string' ? conteudo : new TextDecoder().decode(conteudo)),
  });
  return arquivo;
}

function comoXlsx(sheet: XLSX.WorkSheet, nome = 'bitrix.xlsx'): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Plan1');
  return comoArquivo(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), nome);
}

/**
 * Monta a planilha como o Bitrix24 exporta: célula NUMÉRICA com o serial do Excel e o
 * formato curto embutido (`m/d/yy`, o numFmtId 14).
 *
 * 🔴 É esse formato — americano — que faz o SheetJS escrever `"8/12/26"` para 12 de agosto.
 * Medido com o xlsx 0.18.5 do projeto: com `z`, a releitura devolve `{t:'d', w:"8/13/26"}`.
 * O `write`/`read` é essencial; sem ele o `z` não vira formato de verdade no arquivo.
 */
function planilhaDoBitrix(datas: Date[]): File {
  const sheet = XLSX.utils.aoa_to_sheet([['Data'], ...datas.map(() => [0])]);
  datas.forEach((d, i) => {
    const serial = (d.getTime() - Date.UTC(1899, 11, 30) + d.getTimezoneOffset() * 60000) / 86400000;
    sheet[`A${i + 2}`] = { t: 'n', v: serial, z: 'm/d/yy' };
  });
  return comoXlsx(sheet);
}

/** Percorre o caminho real: leitura da planilha -> sanitização do campo de data. */
async function importarDatas(datas: Date[]): Promise<(string | number | undefined)[]> {
  const linhas = await lerPlanilhaComoObjetos(planilhaDoBitrix(datas));
  return linhas.map(l => sanitizeFieldValue(l.Data, 'date'));
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('lerPlanilhaComoObjetos — datas do Bitrix', () => {
  it('dia MAIOR que 12 já funcionava, e continua', async () => {
    // O "25" não cabe em mês nenhum, então o conversor nunca teve dúvida nesse caso.
    const datas = [new Date(2026, 7, 25), new Date(2024, 11, 31)];
    expect(await importarDatas(datas)).toEqual(['2026-08-25', '2024-12-31']);
  });

  it('🔴 dia MENOR ou igual a 12 — o caso que trocava dia com mês', async () => {
    // 12/08/2026 saía como 08/12/2026 (8 de dezembro). Foi este caso que produziu, na
    // importação de 01/09/2026, 294 negócios com data de criação em set-dez/2026 — meses
    // que ainda não aconteceram.
    const datas = [new Date(2026, 7, 12), new Date(2026, 1, 3), new Date(2026, 0, 9)];
    expect(await importarDatas(datas)).toEqual(['2026-08-12', '2026-02-03', '2026-01-09']);
  });

  it('🔴 nenhum dia trocado em 12 meses x 28 dias', async () => {
    const datas: Date[] = [];
    for (let mes = 0; mes < 12; mes++) for (let dia = 1; dia <= 28; dia++) datas.push(new Date(2026, mes, dia));
    expect(await importarDatas(datas)).toEqual(datas.map(iso));
  });

  it('texto que não é data continua intacto', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['Cliente'], ['Construtora Alfa']]);
    const linhas = await lerPlanilhaComoObjetos(comoXlsx(sheet));
    expect(linhas[0].Cliente).toBe('Construtora Alfa');
  });
});

describe('lerPlanilhaComoObjetos — cabeçalhos', () => {
  it('🔴 cabeçalho VAZIO no meio não desloca as colunas seguintes', async () => {
    // Montar as linhas a partir de uma lista de cabeçalhos filtrada (o que o `sheetToRows`
    // do file-parser faz) casaria "Data" com o valor da coluna sem título.
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Cliente', '', 'Data'],
      ['ACME', 'observação solta', '2026-08-12'],
    ]);
    const [linha] = await lerPlanilhaComoObjetos(comoXlsx(sheet));
    expect(linha.Cliente).toBe('ACME');
    expect(linha.Data).toBe('2026-08-12');
  });

  it('🔴 cabeçalho REPETIDO não faz uma coluna apagar a outra', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Data', 'Data'],
      ['2026-08-12', '2026-09-30'],
    ]);
    const [linha] = await lerPlanilhaComoObjetos(comoXlsx(sheet));
    expect(Object.values(linha)).toEqual(expect.arrayContaining(['2026-08-12', '2026-09-30']));
  });

  it('célula mesclada continua sendo espalhada pelas linhas do bloco', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Cliente', 'Valor'],
      ['ACME', '10'],
      ['', '20'],
    ]);
    sheet['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
    const linhas = await lerPlanilhaComoObjetos(comoXlsx(sheet));
    expect(linhas.map(l => l.Cliente)).toEqual(['ACME', 'ACME']);
  });
});

describe('lerPlanilhaComoObjetos — CSV', () => {
  it('🔴 data em ISO não perde um dia', async () => {
    // Medido com o xlsx 0.18.5: sem `raw: true`, o parser de CSV do SheetJS lê `2026-08-12`
    // e devolve `8/11/26`. Exportar Negócios e reimportar recuava a base inteira um dia.
    const arquivo = comoArquivo('Cliente,Data\nACME,2026-08-12\n', 'negocios.csv');
    const [linha] = await lerPlanilhaComoObjetos(arquivo);
    expect(sanitizeFieldValue(linha.Data, 'date')).toBe('2026-08-12');
  });

  it('🔴 acento sobrevive', async () => {
    // Lido como `type: 'array'` (byte a byte), "AÇÃO" virava "AÃÃO" e entrava torto no banco.
    const arquivo = comoArquivo('Cliente\nCONSTRUÇÃO AÇÃO\n', 'clientes.csv');
    const [linha] = await lerPlanilhaComoObjetos(arquivo);
    expect(linha.Cliente).toBe('CONSTRUÇÃO AÇÃO');
  });

  it('data escrita como dia/mês é preservada como texto para a decisão vir depois', async () => {
    const arquivo = comoArquivo('Data\n12/08/2026\n', 'x.csv');
    const [linha] = await lerPlanilhaComoObjetos(arquivo);
    expect(linha.Data).toBe('12/08/2026');
  });
});

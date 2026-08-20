import * as XLSX from 'xlsx';
import { expandMergedCells } from './expand-merged-cells';

export interface ParsedFile {
  headers: string[];
  rawData: Record<string, any>[];
}

/**
 * Parseia XLS/XLSX/CSV no client e devolve dados já estruturados
 * (array de objetos chaveados pelo header), prontos para o MappingStep.
 * Não envolve IA — parsing puro de planilha.
 */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const workbook = XLSX.read(text, { type: 'string' });
    return sheetToRows(workbook);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    // `cellDates` faz o SheetJS resolver a célula de data para um Date de verdade em vez
    // de deixá-la como número solto — é o que permite `normalizarDatas` reconhecê-la.
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    return sheetToRows(workbook);
  }

  throw new Error('Formato não suportado. Use .csv, .xls ou .xlsx.');
}

/**
 * Reescreve o texto exibido das células de data para ISO (`AAAA-MM-DD`, com `THH:mm`
 * quando há hora).
 *
 * POR QUE ISTO EXISTE: `sheet_to_json` com `raw: false` devolve o texto FORMATADO da
 * célula. Quando a planilha traz a data como número sem formato definido — que é
 * exatamente como o Bitrix24 exporta — o SheetJS cai no padrão dele, que é americano:
 * o serial 46247 (12/08/2026) vira o texto "8/12/26".
 *
 * Daí para frente ninguém mais consegue saber se "8/12" é 8 de dezembro ou 12 de agosto,
 * e `sanitizeFieldValue` precisa adivinhar. Na importação da base da MD isso trocou dia e
 * mês em ~1 de cada 4 datas, sem rejeitar uma linha sequer.
 *
 * A informação inequívoca existe na célula. Este passo simplesmente para de jogá-la fora:
 * a data sai daqui em ISO e nenhuma adivinhação acontece depois.
 *
 * Mexe em `w` (o texto exibido) e não no valor, porque é `w` que o `raw: false` lê — e
 * fazer isso antes de `sheet_to_json` preserva o tratamento de linhas em branco e de
 * células mescladas que vem de graça na conversão.
 */
function normalizarDatas(sheet: XLSX.WorkSheet): void {
  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);

  const dois = (n: number) => String(n).padStart(2, '0');

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell || cell.t !== 'd' || !(cell.v instanceof Date)) continue;

      const d = cell.v;
      // Getters locais, e não `toISOString()`: com `cellDates` o SheetJS constrói o Date
      // com o construtor local. Usar UTC aqui deslocaria a data em um dia para quem está
      // a oeste de Greenwich — que é o caso do Brasil inteiro.
      const data = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
      const temHora = d.getHours() || d.getMinutes() || d.getSeconds();
      cell.w = temHora ? `${data}T${dois(d.getHours())}:${dois(d.getMinutes())}` : data;
    }
  }
}

function sheetToRows(workbook: XLSX.WorkBook): ParsedFile {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  expandMergedCells(sheet);
  normalizarDatas(sheet);
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });

  if (matrix.length === 0) return { headers: [], rawData: [] };

  const headers = (matrix[0] as any[]).map((h) => String(h ?? '').trim()).filter(Boolean);
  const rawData = matrix.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((header, idx) => { obj[header] = row[idx] ?? ''; });
      return obj;
    });

  return { headers, rawData };
}

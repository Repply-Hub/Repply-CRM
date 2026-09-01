import * as XLSX from 'xlsx';
import { expandMergedCells } from './expand-merged-cells';
import { normalizarDatas } from './ler-planilha';

export interface ParsedFile {
  headers: string[];
  rawData: Record<string, any>[];
}

/**
 * Parseia XLS/XLSX/CSV no client e devolve dados já estruturados
 * (array de objetos chaveados pelo header), prontos para o MappingStep.
 * Não envolve IA — parsing puro de planilha.
 *
 * 🔴 A normalização de datas mora em `ler-planilha.ts`, junto com a leitura que as telas de
 * importação usam. Ela já esteve duplicada aqui, e foi assim que o conserto de 20/08/2026
 * ficou num arquivo que nenhuma tela chamava enquanto o bug seguia vivo na tela real.
 */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    const text = await file.text();
    // `raw: true` desliga a reinterpretação de data do parser de CSV do SheetJS, que lê
    // `2026-08-12` e devolve `8/11/26` — um dia a menos. Medido com o xlsx 0.18.5 do projeto.
    const workbook = XLSX.read(text, { type: 'string', raw: true });
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

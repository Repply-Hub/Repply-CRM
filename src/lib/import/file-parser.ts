import * as XLSX from 'xlsx';

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
    const workbook = XLSX.read(buffer, { type: 'array' });
    return sheetToRows(workbook);
  }

  throw new Error('Formato não suportado. Use .csv, .xls ou .xlsx.');
}

function sheetToRows(workbook: XLSX.WorkBook): ParsedFile {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
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

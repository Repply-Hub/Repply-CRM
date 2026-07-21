import * as XLSX from 'xlsx';

/**
 * sheet_to_json só lê valor na célula âncora (superior-esquerda) de um range mesclado;
 * as demais células do merge ficam vazias na leitura bruta. Isso faz com que colunas
 * mescladas (comum em exports de CRM que agrupam visualmente linhas por cliente/obra)
 * percam o valor em todas as linhas exceto a primeira do bloco.
 *
 * Preenche cada célula do range com o valor da célula âncora antes do parse, para que
 * sheet_to_json enxergue o mesmo valor repetido em todas as linhas do merge.
 */
export function expandMergedCells(sheet: XLSX.WorkSheet): void {
  (sheet['!merges'] || []).forEach((merge) => {
    const anchorRef = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const anchorCell = sheet[anchorRef];
    if (!anchorCell) return;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ref !== anchorRef) sheet[ref] = { ...anchorCell };
      }
    }
  });
}

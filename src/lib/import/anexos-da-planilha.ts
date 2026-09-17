/**
 * A coluna "Anexo" da planilha agora pode trazer VÁRIOS endereços — a exportação junta todos os
 * anexos de um negócio com vírgula (pacote "vários anexos", 17/09/2026). Aqui ficam as duas
 * peças puras que a importação usa para lidar com isso, longe do gancho de rede para poderem ser
 * testadas sozinhas.
 *
 * 🔴 A vírgula é o contrato dos dois lados: a exportação separa com vírgula, a importação divide
 * por vírgula. Endereço do nosso Storage nunca tem vírgula; os herdados do Bitrix, depois de
 * reparados, também não — por isso a divisão literal é segura.
 */

/** Os endereços de anexo de uma célula: separados por vírgula, aparados, sem vazios. */
export function enderecosDeAnexo(valor: unknown): string[] {
  return String(valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Reagrupa uma lista achatada de volta em uma lista por linha, usando o tamanho de cada linha.
 * O `achatado` TEM de estar na mesma ordem em que as linhas foram achatadas (é o índice, não um
 * rótulo, que diz a que linha cada item pertence) — é assim que os resultados de
 * `resolveEspelhoPdfUrls`, que recebe uma lista achatada, voltam para a linha certa.
 */
export function reagruparPorLinha<T>(tamanhosPorLinha: readonly number[], achatado: readonly T[]): T[][] {
  const out: T[][] = [];
  let cursor = 0;
  for (const n of tamanhosPorLinha) {
    out.push(achatado.slice(cursor, cursor + n));
    cursor += n;
  }
  return out;
}

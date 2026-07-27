const CORRUPTED_BITRIX_DOMAIN = /cdn,bitrix24,com,br/i;

/**
 * Corrige um link do CDN do Bitrix24 corrompido por uma conversão de locale que trocou
 * todos os pontos por vírgulas (ex: "cdn,bitrix24,com,br/.../arquivo,pdf" em vez de
 * "cdn.bitrix24.com.br/.../arquivo.pdf"). Corrige apenas o domínio, que é um padrão fixo
 * e seguro de reconhecer, e a extensão do arquivo no final da URL — o resto do path é
 * hash hexadecimal sem pontos legítimos, então não arriscamos trocar vírgulas que não
 * sejam originalmente separador. URLs que não batem com o padrão corrompido voltam
 * inalteradas.
 */
export function repairCorruptedBitrixUrl(url: string): string {
  if (!url || !CORRUPTED_BITRIX_DOMAIN.test(url)) return url;
  return url
    .replace(/cdn,bitrix24,com,br/gi, 'cdn.bitrix24.com.br')
    .replace(/,([a-zA-Z0-9]{2,5})$/, '.$1');
}

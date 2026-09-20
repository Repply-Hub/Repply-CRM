/**
 * Endereços de e-mail digitados nos campos Para/Cc/Cco — só função pura,
 * para fixar a regra em teste sem precisar do compositor (este projeto
 * testa função pura e deixa componente para o compilador e o navegador).
 *
 * Os campos aceitam vários endereços separados por vírgula OU
 * ponto-e-vírgula (os dois convivem, porque cliente de e-mail cola lista
 * copiada de qualquer um dos dois formatos) e a forma "Nome <e@x.com>",
 * que o Nylas aceita direto — por isso ela é preservada, nunca reduzida só
 * ao endereço.
 */

/** Endereço "puro" de dentro de "Nome <e@x.com>", ou a própria string quando não tem "<...>". */
function soEnderecoParaComparar(entrada: string): string {
  const m = entrada.match(/<([^>]+)>/);
  return (m ? m[1] : entrada).trim().toLowerCase();
}

/**
 * Separa por `,` e `;`, apara espaço de cada pedaço, descarta vazio e remove
 * duplicado — a comparação de duplicado usa só o endereço (sem diferenciar
 * maiúsculas), então "Ana <a@x.com>" e "A@X.COM" contam como o mesmo. Fica a
 * PRIMEIRA forma encontrada, com "Nome <...>" preservado como a pessoa
 * digitou.
 */
export function parseEnderecos(texto: string): string[] {
  const pedacos = (texto ?? '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const pedaco of pedacos) {
    const chave = soEnderecoParaComparar(pedaco);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(pedaco);
  }
  return resultado;
}

/**
 * Leniente de propósito: só serve de AVISO na tela, nunca para travar o
 * envio — o Nylas/provedor é quem valida de verdade. Exige um "@" com algo
 * antes e um "." depois dele (aceitando "Nome <e@x.com>").
 */
export function enderecoPareceValido(s: string): boolean {
  const endereco = soEnderecoParaComparar(s ?? '');
  const arroba = endereco.indexOf('@');
  if (arroba <= 0) return false;
  const depoisDoArroba = endereco.slice(arroba + 1);
  return depoisDoArroba.includes('.');
}

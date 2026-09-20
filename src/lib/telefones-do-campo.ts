import { telefoneParaCadastro } from './contato-da-conversa';

/**
 * Funções do campo de telefone de cadastro (`<CampoTelefones>`): um campo por número, com a
 * lista separada por vírgula no banco — nenhuma mudança de estrutura (decisão de 11/09/2026).
 *
 * 🔴 148 cadastros guardam mais de um número no mesmo campo (medido em 11/09/2026). Máscara de UM
 * número aplicada ao campo inteiro apaga o segundo: é o que `formatarTelefone` (src/lib/telefone.ts)
 * fazia na ficha do contato, porque ela corta tudo depois do 11º dígito. Aqui cada número tem o
 * seu campo, e nada aplica máscara à lista.
 */

/**
 * O MESMO separador de `chavesDeTelefone` (src/lib/contato-da-conversa.ts), que reconhece de
 * quem é uma conversa de WhatsApp. O hífen fica de fora de propósito: o identificador de grupo
 * antigo tem hífen. Sem a flag `g`, então `.test()` não guarda estado entre chamadas.
 */
export const SEPARADOR_DE_TELEFONES = /[,;/]/;

export function separarTelefones(bruto: string | null | undefined): string[] {
  return (bruto ?? '')
    .split(SEPARADOR_DE_TELEFONES)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Junta com ", " — o separador dos 148 cadastros de hoje. Campo vazio não vira vírgula solta. */
export function juntarTelefones(partes: string[]): string {
  return partes
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}

/** Os dígitos do número nacional: o `55` da frente só sai quando sobra número depois dele. */
function digitosNacionais(texto: string): string {
  const d = texto.replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

/**
 * O que a regra do telefone brasileiro NÃO pode tocar — nem para limitar, nem para formatar:
 * - número estrangeiro (começa com `+` e não é `+55`);
 * - identificador de grupo do WhatsApp: o novo tem `@`, o antigo é dígito-hífen-dígito comprido
 *   (CLAUDE.md §7.2 — limpar os não-dígitos dele monta um destino que não existe);
 * - texto com letra ou símbolo ("ramal 20");
 * - número que começa com zero (0800, 0300): DDD nunca começa com zero.
 */
export function ehTelefoneLivre(parte: string): boolean {
  const texto = parte.trim();
  if (!texto) return false;
  if (texto.startsWith('+') && !texto.replace(/\D/g, '').startsWith('55')) return true;
  if (texto.includes('@') || /\d{8,}-\d{6,}/.test(texto)) return true;
  if (/[^\d\s()+\-.]/.test(texto)) return true;
  return texto.replace(/\D/g, '').startsWith('0');
}

/**
 * Enquanto a pessoa digita: o texto fica COMO ELA ESCREVEU, e só o 12º dígito do número não
 * entra. Reformatar a cada tecla joga o cursor para o fim e faz a pessoa redigitar — onde o erro
 * nasce (CLAUDE.md §7.10). A formatação é ao sair do campo (`formatarTelefoneGuardado`).
 *
 * O que já estava fora do formato — um número antigo com ramal grudado, por exemplo — não é
 * cortado quando a pessoa o edita: cortar apagaria dígitos que ela nem tocou.
 */
export function limitarTelefoneDigitado(novo: string, anterior = ''): string {
  if (ehTelefoneLivre(novo) || ehTelefoneLivre(anterior)) return novo;
  if (digitosNacionais(anterior).length > 11) return novo;
  // O "55" da frente é ambíguo: pode ser código de país OU o DDD 55 (Rio Grande do Sul). Por
  // isso ele só conta como código de país quando há EVIDÊNCIA disso — "+" no texto novo ou no
  // anterior (isso cobre apagar o "+" de um número completo), o anterior já vinha com o 55
  // grudado em mais de 11 dígitos (é como 999 telefones estão gravados no banco), ou o número
  // foi colado num campo vazio. Sem nenhuma evidência, o teto é de 11 dígitos BRUTOS, para que
  // um DDD 55 com um dígito a mais nunca vire, sem aviso, outro DDD.
  //
  // Colar um número inteiro de DDD 55 com dígitos sobrando num campo vazio continua ambíguo —
  // e é lido do mesmo jeito que os telefones já gravados, como código de país.
  const digitosNovos = novo.replace(/\D/g, '');
  const digitosAnteriores = anterior.replace(/\D/g, '');
  const comMais = novo.trim().startsWith('+') || anterior.trim().startsWith('+');
  const anteriorJaVinhaComCodigoDePais = digitosAnteriores.length > 11 && digitosAnteriores.startsWith('55');
  const coladoNumCampoVazio = digitosAnteriores.length === 0 && digitosNovos.length > 1;
  const contaCodigoDePais = comMais || anteriorJaVinhaComCodigoDePais || coladoNumCampoVazio;
  const tamanho = contaCodigoDePais ? digitosNacionais(novo).length : digitosNovos.length;
  return tamanho > 11 ? anterior : novo;
}

/**
 * O número como o campo mostra: ao abrir o cadastro e ao sair do campo. `(84) 99999-8888` ou
 * `(84) 3222-1111`, sem `+55` — o formato de todo número já mascarado na base. Nunca enfia o nono
 * dígito em fixo (CLAUDE.md §7.1). O que não é telefone brasileiro completo volta como veio.
 */
export function formatarTelefoneGuardado(parte: string): string {
  return ehTelefoneLivre(parte) ? parte.trim() : telefoneParaCadastro(parte);
}

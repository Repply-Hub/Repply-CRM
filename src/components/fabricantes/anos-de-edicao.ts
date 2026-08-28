/**
 * Os anos que o seletor de edição do drive oferece.
 *
 * Antes o ano era digitado à mão, e digitar é onde o erro nasce: um "2062" sem querer passa
 * pela restrição do banco (2000–2100) e joga a edição para o topo da lista, empurrando o
 * catálogo vigente para baixo — e, até 28/08/2026, não havia como consertar sem excluir e
 * anexar de novo.
 *
 * 🔴 A FAIXA É CURTA DE PROPÓSITO: do ano que vem até dez anos atrás, doze opções.
 *
 * Catálogo de fábrica é material do ano corrente. Um ano à frente existe porque a fábrica
 * manda a edição do ano seguinte no fim do ano (a de 2027 chega em novembro de 2026), e dez
 * atrás cobrem com folga o material antigo que ainda vive no drive. Oferecer os 101 anos que
 * o banco aceita seria pior que digitar: rolar uma lista de cem itens para achar o ano
 * corrente é mais trabalhoso do que teclar quatro dígitos.
 */

/** Um ano à frente: a edição do ano seguinte chega antes do ano virar. */
export const ANOS_A_FRENTE = 1;

/** Dez anos atrás: material velho que ainda vive no drive, sem lista quilométrica. */
export const ANOS_PARA_TRAS = 10;

/**
 * Os limites da restrição `edicao_ano between 2000 and 2100`, da migration
 * `20260826200000_fabricante_arquivos.sql`. Repetidos aqui para que o seletor nunca ofereça
 * um ano que a gravação vai recusar.
 */
const ANO_MIN = 2000;
const ANO_MAX = 2100;

/**
 * A lista de anos do seletor, do mais NOVO para o mais velho — o ano corrente fica no alto,
 * que é onde a pessoa procura em quase todo anexo.
 *
 * `anoAGarantir` existe para a tela de EDITAR: um arquivo anexado com edição de 2014 abriria
 * com o seletor vazio se 2014 não estivesse na lista, e salvar em seguida trocaria a edição
 * sem que ninguém tivesse pedido. Ele entra na ordem certa, não no fim.
 *
 * Ano fora de 2000–2100 é ignorado em vez de entrar: incluí-lo daria um item que o banco
 * recusa na gravação — botão que existe e não funciona.
 */
export function anosDeEdicao(anoAtual: number, anoAGarantir?: number | null): number[] {
  const topo = Math.min(anoAtual + ANOS_A_FRENTE, ANO_MAX);
  const base = Math.max(anoAtual - ANOS_PARA_TRAS, ANO_MIN);

  const anos: number[] = [];
  for (let a = topo; a >= base; a--) anos.push(a);

  const garantir = Number(anoAGarantir);
  if (
    anoAGarantir != null
    && Number.isInteger(garantir)
    && garantir >= ANO_MIN
    && garantir <= ANO_MAX
    && !anos.includes(garantir)
  ) {
    anos.push(garantir);
    anos.sort((a, b) => b - a);
  }

  return anos;
}

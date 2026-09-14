/**
 * As letras do círculo da foto quando a pessoa não tem foto: a primeira do primeiro nome e a do
 * último, ou as duas primeiras de um nome só.
 *
 * Mora aqui, e não dentro de cada tela, porque duas telas desenham o mesmo círculo — o campo de
 * responsáveis do negócio e a tabela do time da tela "Hoje". Duas cópias da mesma regra divergem
 * em silêncio, e a mesma pessoa apareceria com letras diferentes em cada lugar.
 */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

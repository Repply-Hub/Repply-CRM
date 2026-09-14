/**
 * Os lembretes de um evento: quantos minutos antes do início avisar.
 *
 * Decisão do dono do produto (11/09/2026): evento novo já vem com 1 dia e 1 hora antes;
 * até 5 por evento. A lista é gravada normalizada (ordenada, sem repetição) para o robô
 * de lembretes nunca mandar o mesmo aviso duas vezes.
 */
export const LEMBRETES_PADRAO: readonly number[] = [1440, 60];
export const LIMITE_DE_LEMBRETES = 5;
export const OPCOES_DE_LEMBRETE: readonly number[] = [15, 30, 60, 120, 1440, 2880];

// Única fonte de verdade da conversão de unidade "personalizada" do formulário
// (o campo de lembrete único removido na Tarefa 4 do Bloco 3 tinha a mesma tabela duplicada).
export type UnidadeDeLembrete = 'minutos' | 'horas' | 'dias';
export const UNIDADE_EM_MINUTOS: Record<UnidadeDeLembrete, number> = {
  minutos: 1,
  horas: 60,
  dias: 1440,
};

export function normalizarLembretes(lista: readonly number[]): number[] {
  const validos = lista.filter((m) => Number.isInteger(m) && m > 0);
  return [...new Set(validos)].sort((a, b) => b - a).slice(0, LIMITE_DE_LEMBRETES);
}

// 30 dias em minutos — o teto do campo "Personalizado". CLAUDE.md §7.10 proíbe
// `type="number"` em campo com vírgula: o navegador devolve string vazia para "1,5" e o
// formulário fechava como se o lembrete tivesse entrado, sem avisar nada (Bloco 3, item C).
export const LIMITE_DE_MINUTOS_DO_LEMBRETE = 30 * 1440;

/**
 * Converte o texto digitado no campo "Personalizado" (aceita vírgula OU ponto como separador
 * decimal — é o mesmo dígito, "1,5" ou "1.5") para minutos, já multiplicado pela unidade
 * escolhida. Devolve `null` quando o texto não é um número, ou quando o resultado não é um
 * inteiro maior que 0 e até `LIMITE_DE_MINUTOS_DO_LEMBRETE` — "1,5" horas vira 90 (vale),
 * "1,5" minutos não é inteiro (não vale).
 */
export function minutosPersonalizados(texto: string, unidade: UnidadeDeLembrete): number | null {
  const limpo = texto.trim().replace(',', '.');
  // Só dígitos, com no máximo um separador decimal — "abc", vazio e "1,5,2" caem fora aqui,
  // antes mesmo de chegar à conta.
  if (!/^\d+(\.\d+)?$/.test(limpo)) return null;

  const numero = Number(limpo);
  const minutosBrutos = numero * UNIDADE_EM_MINUTOS[unidade];
  const minutos = Math.round(minutosBrutos);
  // Tolerância pequena: evita recusar "1,5" horas (90 exato) por erro de ponto flutuante, mas
  // ainda recusa "1,5" minutos — que não é um inteiro de verdade, tolerância nenhuma perdoaria.
  const ehInteiro = Math.abs(minutosBrutos - minutos) < 1e-6;
  if (!ehInteiro || minutos <= 0 || minutos > LIMITE_DE_MINUTOS_DO_LEMBRETE) return null;

  return minutos;
}

export function rotuloDoLembrete(minutos: number): string {
  if (minutos % 1440 === 0) {
    const n = minutos / 1440;
    return `${n} ${n === 1 ? 'dia' : 'dias'} antes`;
  }
  if (minutos % 60 === 0) {
    const n = minutos / 60;
    return `${n} ${n === 1 ? 'hora' : 'horas'} antes`;
  }
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} antes`;
}

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

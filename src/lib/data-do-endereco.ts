/**
 * O dia que vem no endereço da agenda (`/calendario?data=2026-09-16`) — é para onde
 * o botão "Abrir na agenda" do e-mail leva. Dia LOCAL (não UTC): "16" é 16 aqui.
 *
 * Não usa `new Date('2026-09-16')`: essa forma lê a string como UTC e no fuso do Brasil
 * devolveria o dia 15 (CLAUDE.md §7.12). Aqui os três números viram argumentos separados do
 * construtor, que sempre lê hora LOCAL — não há fuso a converter.
 */
export function dataDoEndereco(valor: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(ano, mes, dia);
  // `new Date(2026, 1, 30)` não recusa "30 de fevereiro": ela transborda para 2 de março.
  // Reler os três campos do resultado é o que pega a data que não existe.
  return d.getFullYear() === ano && d.getMonth() === mes && d.getDate() === dia ? d : null;
}

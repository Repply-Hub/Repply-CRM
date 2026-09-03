// Máscara de telefone brasileiro para campo de digitação, com código de país:
// `+55 (99) 99999-9999`.
//
// 🔴 A máscara NÃO fixa 11 dígitos no número nacional. Fixo com WhatsApp existe e
// tem 10 dígitos (ver CLAUDE.md §7.1 — o cliente real `(84) 2030-0387` que
// respondia por 100% das falhas de envio). O formato acompanha o que foi digitado:
//   - até 10 dígitos → `+55 (99) 9999-9999`  (fixo)
//   - 11 dígitos     → `+55 (99) 99999-9999` (celular)
// e nunca recusa nem descarta dígito do número nacional além do 11º — só para de
// formatar.
//
// O `55` é código de país fixo. Se o valor de entrada já traz `+55`/`55` na frente
// (o próprio valor mascarado, um número colado com DDI, ou os 13 dígitos grudados),
// ele é removido antes de contar o número nacional — senão o DDD 55 (Rio Grande do
// Sul) e o DDI se confundiriam.

/**
 * Só os dígitos do número NACIONAL (DDD + número), no máximo 11 — sem o `55` do
 * código de país.
 */
export function apenasDigitosTelefone(bruto: string | null | undefined): string {
  let s = (bruto ?? '').trim();
  // Tira o código de país que a nossa máscara sempre escreve: `+55 (...`, `55 ...`,
  // `+55(...`. O `\b` evita comer o começo de um DDD 55 colado sem pontuação.
  s = s.replace(/^\+?55\b[\s(]*/, '');
  let d = s.replace(/\D/g, '');
  // Rede de segurança: valor colado com o 55 grudado e sem `+` (13 dígitos).
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 11);
}

/**
 * Formata progressivamente enquanto a pessoa digita. Aceita valor já mascarado,
 * cru ou pela metade — sempre parte dos dígitos do número nacional.
 */
export function formatarTelefone(bruto: string | null | undefined): string {
  const d = apenasDigitosTelefone(bruto);
  if (d.length === 0) return '';
  let nacional: string;
  if (d.length <= 2) {
    nacional = `(${d}`;
  } else if (d.length <= 6) {
    nacional = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  } else if (d.length <= 10) {
    // Fixo: 4 + 4. Vale também para o celular ainda incompleto (7 a 10 dígitos).
    nacional = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  } else {
    // Celular completo: 5 + 4.
    nacional = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return `+55 ${nacional}`;
}

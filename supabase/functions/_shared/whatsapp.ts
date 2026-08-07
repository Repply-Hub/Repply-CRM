/**
 * Normalização de número de WhatsApp — a MESMA para webhook, envio e grupos.
 *
 * Era uma cópia idêntica em quatro functions; virou módulo quando a cópia
 * precisou mudar em todas ao mesmo tempo. O frontend (use-whatsapp-inbox)
 * mantém a própria cópia, porque não importa daqui.
 */

/**
 * Canoniza um número BR para o formato de envio da uazapi (só dígitos, com DDI).
 *
 * A regra do 9º dígito é o coração — e foi a origem de um defeito sério. A
 * versão antiga enfiava o 9 em QUALQUER número de 10 dígitos:
 *
 *     84 2030-0387  →  84 9 2030-0387
 *
 * Correto para celular antigo (JID pré-2012 sem o 9), errado para FIXO — e fixo
 * com WhatsApp é comum em empresa. O JID real desses contatos não tem o 9; o
 * que o CRM gravava e enviava não existia no WhatsApp, e a uazapi recusava com
 * "is not on WhatsApp" ou "no LID found". Nas 6.099 tentativas de envio já
 * registradas, TODAS as falhas vivas eram exatamente isso.
 *
 * Agora o 9 só entra na faixa de celular ([6-9] — fixo começa com 2-5). E NÃO
 * há regra de remoção: os dados provaram que 9+[2-5] contém tanto fixos com 9
 * espúrio quanto números genuínos (conversas com dezenas de mensagens LIDAS).
 * Faixa numérica não distingue os dois; quem decide é o próprio WhatsApp, no
 * fallback do whatsapp-send.
 */
export function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 10 && /^[6-9]$/.test(digits[2])) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

/**
 * A variante alternativa de um número ambíguo — ou null quando não há.
 *
 * Só existe para a faixa em que o formato não determina a linha:
 *   55 DD 9 [2-5]XXXXXXX  →  pode ser fixo com 9 espúrio  →  variante sem o 9
 *   55 DD   [2-5]XXXXXXX  →  pode ser conta que usa o 9   →  variante com o 9
 *
 * Celular inequívoco (9+[6-9]) e grupo não têm variante. Quem usa isso é o
 * fallback de envio: tenta o número como está e, se o WhatsApp disser que não
 * existe, tenta a variante UMA vez — o provedor é o único oráculo confiável.
 */
export function varianteDoNumero(numero: string): string | null {
  if (/^55\d{2}9[2-5]\d{7}$/.test(numero)) {
    return numero.slice(0, 4) + numero.slice(5);
  }
  if (/^55\d{2}[2-5]\d{7}$/.test(numero)) {
    return numero.slice(0, 4) + "9" + numero.slice(4);
  }
  return null;
}

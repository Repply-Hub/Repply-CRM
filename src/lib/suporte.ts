/**
 * Canal de suporte que o produto MOSTRA ao usuário (o botão "Falar com o suporte" da tela de
 * "Acesso restrito"). É público de propósito — é o WhatsApp de atendimento da Repply, feito para
 * o cliente ver e usar, não um segredo.
 */
export const SUPORTE_WHATSAPP = '5584996704294';

/**
 * Monta o link do WhatsApp com uma mensagem pronta.
 *
 * O `wa.me` quer o número só com dígitos (código do país + DDD + número, sem +, espaço ou hífen),
 * e o texto precisa ir percent-encoded — senão espaço e acento quebram o link. `encodeURIComponent`
 * cuida das duas coisas do lado do texto.
 */
export function linkSuporteWhatsApp(mensagem: string): string {
  return `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

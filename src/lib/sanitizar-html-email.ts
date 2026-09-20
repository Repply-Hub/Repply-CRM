import DOMPurify from "dompurify";

/**
 * Limpa o HTML que o EDITOR gera (corpo do e-mail e assinatura), deixando só o
 * conjunto "Essencial" — negrito, itálico, sublinhado, tachado, cor/fonte/tamanho
 * inline, listas, alinhamento, link e imagem. Remove script, style, iframe,
 * handlers (`on*`) e `javascript:`.
 *
 * Isto protege a ESCRITA/ENVIO. A LEITURA de e-mail recebido tem o seu próprio
 * DOMPurify em `LeitorEmail.tsx` (com allowlist própria) — os dois são
 * independentes de propósito.
 */
export function sanitizarHtmlEmail(html: string): string {
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS: [
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "a",
      "ul",
      "ol",
      "li",
      "img",
      "h1",
      "h2",
      "h3",
      "blockquote",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "width", "height", "style"],
    // Só http(s), mailto e imagem embutida em data:. Barra javascript:, etc.
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|data:image\/)/i,
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "base",
      "link",
    ],
    FORBID_ATTR: ["target", "ping", "srcset", "formaction"],
  });
}

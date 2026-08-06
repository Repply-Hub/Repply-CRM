import type { ReactNode } from "react";

// Mesmo padrão usado pelas abas de "Links" do Chat/WhatsApp (extração de mídia)
// — mantém consistência entre o que aparece linkado na bolha e o que é listado lá.
const URL_REGEX = /https?:\/\/[^\s]+/g;

const DEFAULT_LINK_CLASSNAME =
  "underline underline-offset-2 decoration-current/50 hover:decoration-current break-all";

/**
 * Transforma URLs "http(s)://..." dentro de um texto em links clicáveis,
 * preservando o restante do texto. Retorna o texto original quando não há URL.
 */
export function linkifyText(
  text: string | null | undefined,
  linkClassName: string = DEFAULT_LINK_CLASSNAME,
): ReactNode {
  if (!text) return text;

  const regex = new RegExp(URL_REGEX);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const raw = match[0];
    // Não engole pontuação de fechamento de frase colada no fim da URL (".", ",", ")", etc.)
    const trailingMatch = raw.match(/[.,;:!?)\]]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw;

    nodes.push(
      <a
        key={`link-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(trailing);

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

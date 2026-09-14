interface IconeWhatsAppProps {
  /** Tamanho do ícone (largura = altura), em pixels. */
  size?: number;
  className?: string;
  /**
   * Margem extra dentro do `viewBox`, em unidades do desenho (o padrão é
   * `0 0 24 24`; `margem={2}` vira `-2 -2 28 28`). Existe só para quem usa
   * este ícone ao lado de ícones do lucide-react, que são só TRAÇO — o
   * glifo do WhatsApp é PREENCHIDO, e na mesma caixa o preenchido lê mais
   * pesado/maior que os vizinhos mesmo em pixel idêntico. É o caso da barra
   * lateral (ver `sidebar-icons.ts`), não o do selo do aviso de mensagem
   * nova: aquele foi aprovado com o desenho no `viewBox` padrão, e mudar o
   * tamanho dele sem pedir não é decisão que cabe aqui — por isso o padrão
   * desta prop é `0` (sem margem).
   */
  margem?: number;
}

/**
 * O glifo do WhatsApp (telefone dentro do balão) como um único path de SVG —
 * o projeto não tem ícone de marca do WhatsApp em lugar nenhum, e criar um
 * componente aqui evita importar biblioteca nova só para isto. Usado no selo
 * de origem do aviso de mensagem nova (`aviso-de-mensagem-nova.ts`, sem
 * margem) e, desde 14/09/2026, no item "WhatsApp" da barra lateral
 * (`sidebar-icons.ts`, com `margem={2}`).
 */
export function IconeWhatsApp({ size = 14, className, margem = 0 }: IconeWhatsAppProps) {
  const m = margem;
  return (
    <svg
      viewBox={`${-m} ${-m} ${24 + 2 * m} ${24 + 2 * m}`}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.17c-.24.68-1.4 1.32-1.94 1.4-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.91-1.26-4.81-4.18-4.96-4.38-.15-.2-1.19-1.58-1.19-3.02 0-1.44.75-2.14 1.03-2.44.27-.29.59-.36.79-.36.2 0 .4 0 .57.01.18.01.43-.07.68.52.24.6.83 2.06.9 2.21.07.15.12.33.02.53-.09.2-.14.32-.28.49-.14.17-.29.38-.41.51-.14.14-.28.3-.12.58.16.29.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.22 1.37.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.63-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

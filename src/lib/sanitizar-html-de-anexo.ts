import DOMPurify from 'dompurify';

/**
 * Limpa o HTML gerado a partir de um ANEXO antes de ele virar tela.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO EXISTE (item 37 da dívida técnica)
 * ---------------------------------------------------------------------------------
 * `FilePreviewDialog` converte `.xlsx`, `.xls`, `.csv` e `.docx` em página (SheetJS e
 * mammoth) e injeta o resultado com `dangerouslySetInnerHTML`. Até 23/09/2026, **sem limpar**.
 *
 * Os dois conversores devolvem HTML que veio do ARQUIVO: célula com formatação mista carrega
 * HTML próprio (o campo `h` do SheetJS), e o mammoth não sanitiza por contrato — está escrito
 * na documentação dele.
 *
 * **Quem dispara: qualquer pessoa que tenha o número de WhatsApp da empresa.** Não precisa de
 * conta no sistema nem de link suspeito: precisa que alguém clique em "pré-visualizar", que é
 * o gesto do dia. O diálogo é usado na caixa de entrada do WhatsApp, não só no chat interno.
 * O que roda, roda com a sessão de quem clicou — e o token do Supabase vive no `localStorage`.
 *
 * ---------------------------------------------------------------------------------
 * POR QUE NÃO REUSAR `sanitizarHtmlEmail`
 * ---------------------------------------------------------------------------------
 * Aquele ajudante barra `table`, e planilha é toda tabela — reusá-lo mostraria a planilha
 * vazia. São conjuntos de permissões diferentes de propósito, como já acontece entre escrever
 * e ler e-mail neste projeto.
 *
 * A lista abaixo é a menor que mostra planilha e documento: estrutura de tabela, formatação de
 * texto e imagem embutida. Não há `script`, `iframe`, `object`, `embed`, `form`, nem gatilho
 * `on*` — o DOMPurify já tira os gatilhos por padrão, e a lista de tags fechada é a segunda
 * volta da chave.
 */
export function sanitizarHtmlDeAnexo(html: string): string {
  return DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS: [
      // a planilha
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
      // o documento
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'a', 'img', 'hr',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'colspan', 'rowspan', 'align'],
    // 🔴 NENHUM endereço de fora, nem em imagem nem em link. O DOMPurify aplica esta regra a
    // todo atributo de endereço, sem distinguir `src` de `href` — então aceitar `http(s)` para
    // o link aceitaria também para a imagem, e imagem de fora num arquivo de remetente
    // desconhecido é farol de leitura: quem mandou descobre quem abriu e quando.
    //
    // O que se perde: link dentro da planilha deixa de ser clicável (o texto fica, o endereço
    // sai). Numa pré-visualização de arquivo que chegou pelo WhatsApp, de alguém que pode ser
    // qualquer um, isso é ganho — link clicável ali é phishing pronto.
    //
    // `data:image/` FICA porque o mammoth traz as figuras do `.docx` embutidas assim; sem ele,
    // documento com figura abriria sem as figuras.
    ALLOWED_URI_REGEXP: /^(mailto:|data:image\/)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta'],
    FORBID_ATTR: ['target', 'ping', 'srcset', 'formaction', 'background'],
  });
}

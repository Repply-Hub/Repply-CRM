import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';

/**
 * Corpo de UMA mensagem de e-mail — papel branco, sanitizado, com endereços
 * clicáveis e listas grandes de destinatário colapsadas. Extraído para arquivo
 * próprio porque o LEITOR e cada MENSAGEM da conversa (`MensagemConversa`) o
 * reusam, cada um com seu próprio HTML e efeito de pós-processamento.
 */

/** Rótulos de destinatário que devem ser colapsados quando a lista for grande. */
const ROTULOS_TRUNCAVEIS = /^(Para|To|Cc|Cco|Bcc|Cópia|Com cópia)$/i;
/**
 * Todo rótulo de cabeçalho de e-mail encaminhado/citado reconhecido — inclui
 * os não-truncáveis (De/Data/Assunto...) só para marcar onde o campo anterior
 * termina. Sem isto, "Para:"/"Cc:" sem próximo rótulo de lista tentariam
 * engolir o "Assunto:" seguinte inteiro, por não saberem onde parar.
 */
const ROTULO_CABECALHO =
  /(^|\n)[ \t]*(Para|To|Cc|Cco|Bcc|Cópia|Com cópia|De|From|Data|Date|Enviado|Sent|Assunto|Subject)[ \t]*:[ \t]*/gi;

interface RunDeTexto {
  texto: string;
  /** `null` para quebras sintéticas (de `<br>` ou bordas de bloco), sem nó real por trás. */
  textNode: Text | null;
}

function ehElementoDeBloco(el: Element): boolean {
  return /^(DIV|P|TR|TD|TABLE|TBODY|LI|UL|OL)$/.test(el.tagName);
}

/**
 * "Achata" a subárvore em uma sequência de trechos de texto na ordem do
 * documento, tratando `<br>` e bordas de elemento de bloco como quebra de
 * linha — mesmo quando o HTML de origem não usa `\n` literal. Sem isto, um
 * cabeçalho como `<b>Para:</b> lista...` (rótulo e lista em nós de texto
 * irmãos, comum em e-mails do Outlook) não seria reconhecido: cada nó de
 * texto seria olhado isoladamente, e nenhum conteria "Para:" e a lista ao
 * mesmo tempo.
 */
function achatarTexto(raiz: HTMLElement): RunDeTexto[] {
  const runs: RunDeTexto[] = [];

  function marcarQuebra() {
    if (runs.length && runs[runs.length - 1].texto !== '\n') {
      runs.push({ texto: '\n', textNode: null });
    }
  }

  function visitar(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ texto: node.textContent ?? '', textNode: node as Text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === 'BR') {
      runs.push({ texto: '\n', textNode: null });
      return;
    }
    const bloco = ehElementoDeBloco(el);
    if (bloco) marcarQuebra();
    Array.from(el.childNodes).forEach(visitar);
    if (bloco) marcarQuebra();
  }

  Array.from(raiz.childNodes).forEach(visitar);
  return runs;
}

/** Ponto real (nó de texto + intervalo) ao longo do texto achatado. */
interface PontoDeTexto {
  inicio: number;
  fim: number;
  node: Text;
}

/** Acha o nó/offset real correspondente a um deslocamento no texto achatado. */
function resolverPosicao(
  pontos: PontoDeTexto[],
  offset: number,
  preferirFim: boolean,
): { node: Text; offset: number } | null {
  for (const p of pontos) {
    if (offset >= p.inicio && offset <= p.fim) return { node: p.node, offset: offset - p.inicio };
  }
  // O deslocamento caiu numa quebra sintética (sem nó de texto por trás) —
  // gruda no nó real mais próximo, para trás ou para frente conforme o caso.
  if (preferirFim) {
    for (let i = pontos.length - 1; i >= 0; i--) {
      if (pontos[i].fim <= offset) return { node: pontos[i].node, offset: pontos[i].node.textContent?.length ?? 0 };
    }
    return pontos.length ? { node: pontos[0].node, offset: 0 } : null;
  }
  for (const p of pontos) {
    if (p.inicio >= offset) return { node: p.node, offset: 0 };
  }
  const ultimo = pontos[pontos.length - 1];
  return ultimo ? { node: ultimo.node, offset: ultimo.node.textContent?.length ?? 0 } : null;
}

/**
 * E-mails encaminhados chegam como HTML cru do cliente de origem (Gmail,
 * Outlook...), sem nenhuma estrutura própria — o cabeçalho "De:/Data:/
 * Assunto:/Para:" é só texto dentro do HTML sanitizado. Quando a lista de
 * destinatários é grande (cópia para dezenas de distribuidores, comum neste
 * negócio), essa linha sozinha empurra o resto da mensagem para baixo.
 *
 * Isto não tenta entender o e-mail — apenas "achata" o texto renderizado
 * (achatarTexto), procura por rótulos de cabeçalho conhecidos e colapsa a
 * lista de destinatários que passar de 3 atrás de um botão "ver mais",
 * usando a Range API para apagar/inserir mesmo quando o trecho atravessa
 * vários nós de texto (rótulo em `<b>`, lista em nó irmão). Heurística por
 * natureza: cobre os formatos mais comuns de forward, não todo layout
 * possível.
 */
function colapsarListasDeDestinatarios(raiz: HTMLElement) {
  const runs = achatarTexto(raiz);
  const textoCompleto = runs.map((r) => r.texto).join('');

  const pontos: PontoDeTexto[] = [];
  {
    let cursor = 0;
    runs.forEach((r) => {
      const fim = cursor + r.texto.length;
      if (r.textNode) pontos.push({ inicio: cursor, fim, node: r.textNode });
      cursor = fim;
    });
  }

  const cabecalhos: { inicioConteudo: number; indexMatch: number; truncavel: boolean }[] = [];
  let m: RegExpExecArray | null;
  ROTULO_CABECALHO.lastIndex = 0;
  while ((m = ROTULO_CABECALHO.exec(textoCompleto))) {
    cabecalhos.push({
      inicioConteudo: m.index + m[0].length,
      indexMatch: m.index,
      truncavel: ROTULOS_TRUNCAVEIS.test(m[2]),
    });
  }
  if (!cabecalhos.length) return;

  // De trás para frente: cada mutação (deleteContents/insertNode) só toca
  // nós que ficam DEPOIS do cabeçalho atual no documento, então processar em
  // ordem decrescente evita invalidar os deslocamentos já calculados para os
  // cabeçalhos anteriores.
  for (let i = cabecalhos.length - 1; i >= 0; i--) {
    const atual = cabecalhos[i];
    if (!atual.truncavel) continue;

    const proximoInicio = i + 1 < cabecalhos.length ? cabecalhos[i + 1].indexMatch : textoCompleto.length;
    const bruto = textoCompleto.slice(atual.inicioConteudo, proximoInicio);
    const semCauda = bruto.replace(/\s+$/, '');
    const fimReal = atual.inicioConteudo + semCauda.length;

    const partes = semCauda
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    if (partes.length <= 3) continue;

    let idx = 0;
    for (let k = 0; k < 3; k++) idx = semCauda.indexOf(';', idx) + 1;
    const corte = atual.inicioConteudo + idx;
    const restantes = partes.length - 3;

    const pInicio = resolverPosicao(pontos, corte, false);
    const pFim = resolverPosicao(pontos, fimReal, true);
    if (!pInicio || !pFim) continue;

    const range = document.createRange();
    range.setStart(pInicio.node, pInicio.offset);
    range.setEnd(pFim.node, pFim.offset);

    const oculto = document.createElement('span');
    oculto.textContent = range.toString().trim();
    oculto.style.display = 'none';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'text-primary underline underline-offset-2 hover:text-primary/80';
    botao.style.font = 'inherit';
    botao.textContent = `ver mais... (${restantes})`;
    botao.addEventListener('click', () => {
      const expandido = oculto.style.display !== 'none';
      oculto.style.display = expandido ? 'none' : 'inline';
      botao.textContent = expandido ? `ver mais... (${restantes})` : 'ver menos';
    });

    range.deleteContents();
    const frag = document.createDocumentFragment();
    // Espaço como nó de texto próprio, fora do <button>: espaço só no
    // textContent do botão pode ser descartado pela renderização nativa do
    // elemento, então o "ver mais" colava direto no ";" anterior.
    frag.append(oculto, document.createTextNode(' '), botao);
    range.insertNode(frag);
  }
}

const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Envolve todo endereço de e-mail que aparece como TEXTO no corpo da
 * mensagem (assinatura, cabeçalho de encaminhamento, "Nome &lt;email&gt;"...)
 * num elemento clicável — mesma técnica de `achatarTexto`/`resolverPosicao`/
 * Range já usada para colapsar listas grandes, porque o endereço quase nunca
 * está sozinho no seu próprio nó de texto.
 *
 * Roda ANTES de `colapsarListasDeDestinatarios` no mesmo efeito: assim os
 * endereços que sobrarem visíveis já chegam clicáveis, e os que forem
 * escondidos atrás do "ver mais" (que vira texto puro ali dentro) não
 * precisam ser — ninguém clica no que está oculto.
 */
function tornarEnderecosClicaveis(raiz: HTMLElement, onClicar: (endereco: string) => void) {
  const runs = achatarTexto(raiz);
  const textoCompleto = runs.map((r) => r.texto).join('');

  const pontos: PontoDeTexto[] = [];
  {
    let cursor = 0;
    runs.forEach((r) => {
      const fim = cursor + r.texto.length;
      if (r.textNode) pontos.push({ inicio: cursor, fim, node: r.textNode });
      cursor = fim;
    });
  }

  const matches: { inicio: number; fim: number; endereco: string }[] = [];
  let m: RegExpExecArray | null;
  REGEX_EMAIL.lastIndex = 0;
  while ((m = REGEX_EMAIL.exec(textoCompleto))) {
    matches.push({ inicio: m.index, fim: m.index + m[0].length, endereco: m[0] });
  }
  if (!matches.length) return;

  // De trás para frente, pelo mesmo motivo de `colapsarListasDeDestinatarios`:
  // cada substituição só toca nós depois do match atual no documento.
  for (let i = matches.length - 1; i >= 0; i--) {
    const { inicio, fim, endereco } = matches[i];
    const pInicio = resolverPosicao(pontos, inicio, false);
    const pFim = resolverPosicao(pontos, fim, true);
    if (!pInicio || !pFim) continue;

    const range = document.createRange();
    range.setStart(pInicio.node, pInicio.offset);
    range.setEnd(pFim.node, pFim.offset);

    const span = document.createElement('span');
    span.setAttribute('role', 'button');
    span.tabIndex = 0;
    span.className = 'cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary';
    // Marcador só para a limpeza pós-colapso (ver `colapsarListasDeDestinatarios`
    // logo depois, no mesmo efeito): quando o corte de uma lista grande cai
    // exatamente no fim do texto de um destes spans, o `Range` esvazia o nó de
    // texto mas não remove o `<span>` que sobra — vazio, invisível, mas lixo no
    // DOM. Sem o marcador, a limpeza não saberia distinguir isso de um `<span>`
    // vazio legítimo que já viesse no HTML original do e-mail.
    span.dataset.enderecoClicavel = 'true';
    span.textContent = endereco;
    span.addEventListener('click', (e) => {
      // `stopPropagation`+`preventDefault`: o endereço pode estar dentro de um
      // `<a href="mailto:...">` de verdade vindo do e-mail original — sem
      // isto, o clique abriria o cliente de e-mail do sistema operacional por
      // cima do modal de confirmação.
      e.preventDefault();
      e.stopPropagation();
      onClicar(endereco);
    });
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClicar(endereco);
      }
    });

    range.deleteContents();
    range.insertNode(span);
  }
}

export function CorpoEmail({
  html,
  textoSimples,
  onClicarEndereco,
}: {
  html?: string | null;
  textoSimples?: string | null;
  onClicarEndereco?: (endereco: string) => void;
}) {
  /**
   * O corpo do e-mail é HTML escrito por QUALQUER PESSOA DO MUNDO — basta
   * escrever para o endereço da empresa. Injetá-lo cru era um XSS armazenado:
   * `<img src=x onerror="...">` roda no domínio do CRM, com a sessão do
   * Supabase de quem abriu ao alcance. (React não executa `<script>` inserido
   * por `innerHTML`, mas manipuladores inline como `onerror`/`onload` e URLs
   * `javascript:` executam normalmente — a proteção do React não cobre isto.)
   *
   * `FORBID_TAGS`/`FORBID_ATTR` além do padrão do DOMPurify porque e-mail é o
   * pior caso de HTML alheio:
   *  - `style` como TAG (não o atributo) permite CSS que vaza dados via
   *    `background: url(...)` em seletores de atributo;
   *  - `target` vindo do HTML alheio é removido de propósito: quem decide o
   *    destino do link somos nós, no pós-processamento abaixo, onde todo link
   *    de verdade ganha `target="_blank"` + `rel="noopener noreferrer"`. Assim
   *    o link abre em NOVA ABA (nunca por cima do Repply) e o `rel` corta o
   *    acesso da página aberta ao `window.opener` — a preocupação que antes
   *    fazia os links abrirem na própria aba.
   */
  const corpoSeguro = useMemo(
    () =>
      html
        ? DOMPurify.sanitize(html, {
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'base', 'link'],
            FORBID_ATTR: ['target', 'formaction', 'ping', 'srcset'],
          })
        : '',
    [html],
  );

  const corpoHtmlRef = useRef<HTMLDivElement>(null);

  // Em ref, não nas deps do efeito abaixo: o efeito faz mutação de DOM via
  // Range (não é idempotente — rodar duas vezes sobre o mesmo HTML já
  // processado colapsaria/envolveria tudo de novo). Se `onClicarEndereco`
  // fosse dependência direta, uma função nova a cada render do componente-pai
  // reexecutaria a mutação sem o corpo do e-mail ter mudado.
  const onClicarEnderecoRef = useRef(onClicarEndereco);
  useEffect(() => {
    onClicarEnderecoRef.current = onClicarEndereco;
  }, [onClicarEndereco]);

  // Roda depois do HTML sanitizado estar no DOM — a busca por endereços e por
  // "Para:"/"To:" precisa dos nós de texto já renderizados, não da string crua.
  useEffect(() => {
    const container = corpoHtmlRef.current;
    if (!container) return;

    tornarEnderecosClicaveis(container, (end) => onClicarEnderecoRef.current?.(end));
    colapsarListasDeDestinatarios(container);
    // Ver o comentário em `enderecoClicavel`, acima: o colapso pode esvaziar um
    // span de endereço sem removê-lo.
    container.querySelectorAll('span[data-endereco-clicavel]').forEach((el) => {
      if (!el.textContent) el.remove();
    });

    // Link de verdade (http/https) do corpo abre em NOVA ABA, nunca por cima do
    // Repply — perder o e-mail aberto para seguir um link era o pior caso. O
    // `rel` corta o `window.opener` da página aberta (por isso o sanitizador
    // acima remove qualquer `target` que venha no HTML: o destino é decidido
    // aqui, não pelo remetente). `mailto:` fica de fora: ele é interceptado
    // logo abaixo para abrir a composição dentro do próprio CRM.
    container.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (/^mailto:/i.test(href)) return;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    // Complemento defensivo: um `<a href="mailto:...">` cujo texto visível
    // NÃO é o próprio endereço (ícone, "fale conosco"...) não seria pego pela
    // varredura de texto acima. Delegado no container em vez de por link,
    // porque o conteúdo é recriado inteiro a cada troca de e-mail.
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement)?.closest?.('a[href^="mailto:" i]');
      if (!alvo) return;
      e.preventDefault();
      const end = (alvo.getAttribute('href') ?? '').replace(/^mailto:/i, '').split('?')[0].trim();
      if (end) onClicarEnderecoRef.current?.(end);
    };
    container.addEventListener('click', aoClicar);
    return () => container.removeEventListener('click', aoClicar);
  }, [corpoSeguro]);

  /* Papel branco por padrão, como Gmail e Outlook: o HTML de e-mail é escrito
     assumindo fundo claro, e renderizar sobre o tema escuro produziria preto
     no preto na maioria das mensagens.

     O que NÃO fazemos aqui é impor cor ao conteúdo por TAG. A versão anterior
     aplicava `prose`, que estiliza cada elemento (`p`, `a`, `h1`...)
     individualmente e por isso sobrescrevia até cor herdada de um `style` no
     ancestral — num e-mail de fundo escuro com texto claro, o título e os
     links viravam escuro sobre escuro e sumiam.

     `text-slate-900` aqui é só o valor herdado pelo CONTAINER: ele preenche o
     texto que não define cor própria. Qualquer elemento do e-mail que já
     define sua própria cor continua intacto, porque isto não cria regra por
     tag.

     `color-scheme: light` impede o navegador de reinterpretar cores em modo
     escuro dentro deste bloco. */
  return (
    <div
      className="overflow-hidden rounded-lg border bg-white text-slate-900"
      style={{ colorScheme: 'light' }}
    >
      {html ? (
        <div
          ref={corpoHtmlRef}
          // Espaçamento sim, cor não: um e-mail de texto simples sem wrapper
          // próprio ficaria colado na borda. A rolagem horizontal é o preço de
          // aceitar HTML alheio: muitos e-mails são tabelas de largura fixa
          // (600px é o padrão do mercado) e sem isto empurrariam a página
          // inteira.
          className="overflow-x-auto p-4 [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
          dangerouslySetInnerHTML={{ __html: corpoSeguro }}
        />
      ) : (
        <div className="whitespace-pre-wrap px-5 py-4 text-[0.9375rem] leading-relaxed text-slate-800">
          {textoSimples || ''}
        </div>
      )}
    </div>
  );
}

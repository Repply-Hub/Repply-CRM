import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { ArrowLeft, Trash2, Reply, Loader2, Paperclip, MailOpen, CornerUpLeft, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface EmailAberto {
  id: string;
  assunto?: string | null;
  remetente?: string | null;
  destinatario?: string | null;
  html?: string | null;
  corpo?: string | null;
  /** Prévia curta vinda do provedor; é o que aparece enquanto o corpo carrega. */
  snippet?: string | null;
  /**
   * Id da mensagem no provedor (`email_mensagens.nylas_message_id`), NÃO o id
   * da linha. É o que o Nylas precisa para amarrar uma resposta à conversa.
   */
  gmail_message_id?: string | null;
  /** Endereço da caixa de origem, quando ela já foi desconectada. */
  caixaOrigem?: string | null;
  /** Só existe em mensagem recebida; enviada não tem estado de leitura. */
  lido?: boolean;
  /** Só existe em mensagem recebida: já saiu alguma resposta nesta conversa? */
  respondida?: boolean;
  criado_em?: string | null;
  created_at?: string | null;
  carregandoCorpo?: boolean;
  anexos?: Array<{ filename?: string; size?: number }>;
  type?: 'sent' | 'received';
  /** Id da conversa no provedor — liga esta mensagem às demais do mesmo thread. */
  threadId?: string | null;
}

/** Uma outra mensagem da mesma conversa, exibida já aberta em "Nesta conversa". */
export interface MensagemDaConversa {
  id: string;
  tipo: 'sent' | 'received';
  /** Mesmo formato de `EmailAberto.remetente`: "Nome <email>" ou só o endereço. */
  remetente: string;
  data: string | null;
  /** Corpo completo já carregado — usado no lugar da prévia, para o card vir aberto. */
  html: string;
  /** Prévia; fallback só quando `html` vier vazio (corpo não pôde ser buscado). */
  snippet: string;
  /** Sem sentido em mensagem enviada — ignorado nesse caso. */
  lido?: boolean;
}

interface Props {
  email: EmailAberto;
  emailDaConta: string | null;
  onVoltar: () => void;
  onExcluir: () => void;
  onResponder: () => void;
  /** Clique num endereço de e-mail — no cabeçalho ou dentro do corpo da mensagem. */
  onClicarEndereco?: (endereco: string) => void;
  /** Ausente em mensagem enviada, que não tem "não lido" para marcar. */
  onMarcarNaoLido?: () => void;
  /** Ausente em mensagem enviada — marcador é conceito da caixa de entrada. */
  onMover?: () => void;
  /** Demais mensagens da mesma conversa (mesmo `nylas_thread_id`), já sem a que está aberta. */
  mensagensDaConversa?: MensagemDaConversa[];
  carregandoConversa?: boolean;
  /** Clique num card de "Nesta conversa" — troca a mensagem aberta no leitor. */
  onAbrirMensagemDaConversa?: (id: string) => void;
}

/** Separa "Fulano <fulano@x.com>" em nome e endereço. */
function separarRemetente(valor?: string | null): { nome: string; endereco: string } {
  const bruto = (valor ?? '').trim();
  if (!bruto) return { nome: 'Desconhecido', endereco: '' };
  const m = bruto.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].trim() || m[2], endereco: m[2] };
  return { nome: bruto, endereco: bruto.includes('@') ? bruto : '' };
}

function tamanhoLegivel(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

/**
 * Corpo de UMA mensagem — papel branco, sanitizado, com endereços clicáveis.
 * Usado tanto pela mensagem principal quanto por cada card de "Nesta
 * conversa": extraído à parte porque cada mensagem tem seu PRÓPRIO HTML (e
 * portanto seu próprio container/efeito de pós-processamento) — não dá para
 * reaproveitar uma única ref quando várias mensagens ficam abertas ao mesmo
 * tempo na tela.
 */
function CorpoEmail({
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
   *  - `target` sem `rel` daria `window.opener` à página aberta.
   *
   * `ADD_ATTR: ['target']` não entra: os links abrem na própria aba, e é
   * melhor assim do que abrir uma aba nova com opener exposto.
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

/**
 * Leitura de uma mensagem, ocupando a tela inteira — como o Gmail.
 *
 * Substitui o modal que existia antes: e-mail não é confirmação de ação, é
 * conteúdo para ler. Modal empilha um contexto sobre o outro, prende a rolagem
 * e obriga a fechar para voltar à lista; a leitura em página deixa o "voltar"
 * ser o gesto natural, e o corpo respira na largura toda.
 */
export function LeitorEmail({
  email,
  emailDaConta,
  onVoltar,
  onExcluir,
  onResponder,
  onClicarEndereco,
  onMarcarNaoLido,
  onMover,
  mensagensDaConversa,
  carregandoConversa,
  onAbrirMensagemDaConversa,
}: Props) {
  const { nome, endereco } = separarRemetente(email.remetente);
  const data = email.created_at ?? email.criado_em;
  const inicial = (nome || '?').trim()[0]?.toUpperCase() ?? '?';
  const anexos = email.anexos ?? [];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Barra de ações. Fixa no topo para que "voltar" e "excluir" continuem
          alcançáveis em e-mail longo, sem obrigar a rolar de volta.
          "Voltar" leva rótulo, e não só a seta: é a saída da tela, e ícone
          solto obriga a passar o mouse para descobrir o que faz. */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onResponder} className="gap-2">
            <Reply className="h-4 w-4" />
            Responder
          </Button>
          {onMarcarNaoLido && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMarcarNaoLido}
              className="text-muted-foreground hover:text-foreground"
              title="Marcar como não lido"
              aria-label="Marcar como não lido"
            >
              <MailOpen className="h-4 w-4" />
            </Button>
          )}
          {onMover && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMover}
              className="text-muted-foreground hover:text-foreground"
              title="Mover para marcador"
              aria-label="Mover para marcador"
            >
              <Tag className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onExcluir}
            className="text-muted-foreground hover:text-destructive"
            title="Excluir"
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* max-w-5xl (1024px), não 3xl (768px): a maioria dos e-mails de sistema
            é montada em tabela de largura fixa maior que 768, então em 3xl a
            mensagem chegava cortada à direita e só aparecia inteira rolando na
            horizontal — dentro de uma tela que já rola na vertical. */}
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <h1 className="mb-4 font-semibold text-[1.5rem] leading-snug text-foreground">
            {email.assunto || '(sem assunto)'}
          </h1>

          <div className="mb-6 flex items-start gap-3 border-b border-border/60 pb-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary ring-1 ring-primary/15">
              {inicial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={
                    endereco && onClicarEndereco
                      ? 'truncate font-semibold text-sm text-foreground cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary'
                      : 'truncate font-semibold text-sm text-foreground'
                  }
                  role={endereco && onClicarEndereco ? 'button' : undefined}
                  tabIndex={endereco && onClicarEndereco ? 0 : undefined}
                  onClick={() => endereco && onClicarEndereco?.(endereco)}
                  onKeyDown={(e) => {
                    if (endereco && onClicarEndereco && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onClicarEndereco(endereco);
                    }
                  }}
                >
                  {nome}
                </span>
                {endereco && endereco !== nome && (
                  <span
                    className={
                      onClicarEndereco
                        ? 'truncate text-xs text-muted-foreground cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary'
                        : 'truncate text-xs text-muted-foreground'
                    }
                    role={onClicarEndereco ? 'button' : undefined}
                    tabIndex={onClicarEndereco ? 0 : undefined}
                    onClick={() => onClicarEndereco?.(endereco)}
                    onKeyDown={(e) => {
                      if (onClicarEndereco && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onClicarEndereco(endereco);
                      }
                    }}
                  >
                    {endereco}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {/* "para mim" quando o destinatário é a própria caixa — é como o
                    Gmail escreve, e evita repetir o endereço que o usuário já
                    sabe de cor. */}
                para{' '}
                {email.destinatario && onClicarEndereco ? (
                  <span
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                    role="button"
                    tabIndex={0}
                    onClick={() => onClicarEndereco(email.destinatario!)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClicarEndereco(email.destinatario!);
                      }
                    }}
                  >
                    {email.destinatario === emailDaConta ? 'mim' : email.destinatario}
                  </span>
                ) : email.destinatario === emailDaConta ? (
                  'mim'
                ) : (
                  email.destinatario || '—'
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {data && (
                <div className="text-xs text-muted-foreground">
                  {format(new Date(data), "dd 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })}
                </div>
              )}
              {email.respondida && (
                <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <CornerUpLeft className="h-3 w-3" />
                  Você respondeu
                </div>
              )}
            </div>
          </div>

          {email.carregandoCorpo && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando o conteúdo completo...
            </div>
          )}

          {/* Mensagem de caixa desconectada cujo corpo nunca chegou a ser
              buscado. Dizer isso é melhor do que mostrar só a prévia e deixar a
              pessoa achando que o e-mail veio truncado ou que algo falhou. */}
          {!email.carregandoCorpo && !email.html && email.caixaOrigem && (
            <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              Só a prévia desta mensagem foi guardada. Ela veio de{' '}
              <span className="font-medium text-foreground">{email.caixaOrigem}</span>, uma caixa
              que não está mais conectada — o conteúdo completo continua na conta original, no
              provedor.
            </div>
          )}

          <CorpoEmail html={email.html} textoSimples={email.corpo} onClicarEndereco={onClicarEndereco} />

          {anexos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {anexos.length} {anexos.length === 1 ? 'anexo' : 'anexos'}
              </p>
              <div className="flex flex-wrap gap-2">
                {anexos.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                    title="O download de anexos ainda não está disponível"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="max-w-[200px] truncate text-foreground">
                      {a.filename ?? 'arquivo'}
                    </span>
                    {a.size ? (
                      <span className="text-muted-foreground">{tamanhoLegivel(a.size)}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {carregandoConversa && (
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando o resto da conversa...
            </div>
          )}

          {/* Cada mensagem da conversa vira seu próprio card, já ABERTO (corpo
              completo, não só a prévia) — só o cabeçalho (quem/quando) fica
              num botão à parte, fora do corpo em si: o corpo é HTML de
              terceiros injetado via `dangerouslySetInnerHTML` dentro de
              `CorpoEmail`, e aninhar isso dentro de um `<button>` quebraria os
              próprios links/endereços clicáveis do conteúdo (elemento
              interativo dentro de elemento interativo). O botão do cabeçalho
              serve para focar aquela mensagem como a "atual" do leitor — para
              responder ou excluir especificamente ela, por exemplo — o corpo
              já visível não depende do clique. `gap-5` entre os cards: mais
              respiro que os `gap-2` de quando eram só prévia, porque agora
              cada um carrega o corpo inteiro. Só aparece quando existe MAIS de
              uma mensagem no mesmo `nylas_thread_id`; conversa de mensagem
              única não ganha a seção. */}
          {!!mensagensDaConversa?.length && (
            <div className="mt-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nesta conversa ({mensagensDaConversa.length + 1})
              </p>
              <div className="flex flex-col gap-5">
                {mensagensDaConversa.map((m) => {
                  const { nome } = separarRemetente(m.remetente);
                  const naoLida = m.tipo === 'received' && m.lido === false;
                  return (
                    <div key={m.id} className="overflow-hidden rounded-lg border border-border/60">
                      <button
                        type="button"
                        onClick={() => onAbrirMensagemDaConversa?.(m.id)}
                        title="Focar esta mensagem (responder ou excluir só ela)"
                        className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                            m.tipo === 'sent'
                              ? 'bg-primary/10 text-primary'
                              : naoLida
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {m.tipo === 'sent' ? (
                            <CornerUpLeft className="h-3.5 w-3.5" />
                          ) : (
                            (nome || '?').trim()[0]?.toUpperCase() ?? '?'
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-sm',
                              naoLida ? 'font-bold text-foreground' : 'font-medium text-foreground',
                            )}
                          >
                            {m.tipo === 'sent' ? 'Você' : nome}
                          </span>
                        </div>
                        {m.data && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(new Date(m.data), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </button>
                      <div className="border-t border-border/60 p-3">
                        <CorpoEmail html={m.html} textoSimples={m.snippet} onClicarEndereco={onClicarEndereco} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Responder aparece duas vezes de propósito, como no Gmail: na barra
              do topo, alcançável a qualquer momento, e aqui — onde a pessoa
              acabou de ler e é quando ela decide responder. */}
          <div className="mt-6 flex gap-2 pb-6">
            <Button variant="outline" className="rounded-full px-5 gap-2" onClick={onResponder}>
              <Reply className="h-4 w-4" />
              Responder
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { type ReactNode } from 'react';
import {
  ArrowLeft,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  MoreVertical,
  Loader2,
  Paperclip,
  MailOpen,
  CornerUpLeft,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CorpoEmail } from './CorpoEmail';
import {
  type EnderecoDoEmail,
  separarRemetente,
  itensDeEndereco,
  ListaDeEnderecos,
  tamanhoLegivel,
} from './email-enderecos';

// `EnderecoDoEmail` mora em `./email-enderecos` (compartilhado com
// `MensagemConversa`); re-exportado aqui porque `Emails.tsx` o importa deste
// módulo desde antes.
export type { EnderecoDoEmail };

export interface EmailAberto {
  id: string;
  assunto?: string | null;
  remetente?: string | null;
  destinatario?: string | null;
  /**
   * Lista completa de "Para", no formato do Nylas. Quando vem preenchida, o
   * cabeçalho mostra TODOS os destinatários em vez do `destinatario` singular
   * acima (que seguiu existindo por compatibilidade — nem todo caminho que
   * abre um e-mail busca esta coluna). Sem isto, e-mail antigo ou consulta que
   * não trouxe a coluna: a linha "Para" simplesmente cai no comportamento de
   * sempre.
   */
  destinatarios?: EnderecoDoEmail[] | null;
  /** Mesmo formato de `destinatarios`. Mostrado como "Cc:" quando houver algum. */
  cc?: EnderecoDoEmail[] | null;
  /**
   * Mesmo formato. Mostrado como "Cco:" só quando `type === 'sent'` — em
   * mensagem RECEBIDA, Cco nunca aparece (é oculta por natureza; quem recebeu
   * não sabe quem mais estava em cópia oculta).
   */
  bcc?: EnderecoDoEmail[] | null;
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
  /**
   * Anexos NÃO-inline da mensagem (`email_mensagens.anexos`, gravado ao abrir).
   * O `id` é o identificador do anexo no provedor — é o que o "Encaminhar"
   * precisa para o servidor rebaixar cada arquivo do Nylas e reanexar.
   */
  anexos?: Array<{ id?: string; filename?: string; content_type?: string; size?: number }>;
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
  /**
   * "Responder a todos" (modelo Gmail). Só vira botão quando esta função vem E
   * a mensagem tem mais de um destinatário — responder a todos de uma mensagem
   * com um destinatário só é igual a responder, e o botão a mais só confunde.
   */
  onResponderATodos?: () => void;
  /** "Encaminhar" (modelo Gmail). Ausente = o botão não aparece. */
  onEncaminhar?: () => void;
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
  /**
   * O compositor de RESPOSTA (variante "inline" de `CompositorEmail`), já
   * montado pela página — o leitor só decide ONDE ele aparece. `null`/
   * `undefined` quando não se está respondendo esta conversa.
   */
  compositorInline?: ReactNode;
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
  onResponderATodos,
  onEncaminhar,
  onClicarEndereco,
  onMarcarNaoLido,
  onMover,
  mensagensDaConversa,
  carregandoConversa,
  onAbrirMensagemDaConversa,
  compositorInline,
}: Props) {
  const { nome, endereco } = separarRemetente(email.remetente);
  const data = email.created_at ?? email.criado_em;
  const inicial = (nome || '?').trim()[0]?.toUpperCase() ?? '?';
  const anexos = email.anexos ?? [];
  // Listas do cabeçalho (padrão Gmail — ver `docs/superpowers/specs/2026-09-16-
  // email-grupo15-design.md`): "Para" só troca para a lista completa quando
  // `destinatarios` vier preenchido (senão cai no `destinatario` singular de
  // sempre, mais abaixo). Cco NUNCA em mensagem recebida — é oculta por
  // natureza, e só quem enviou vê a própria cópia oculta.
  const itensPara = itensDeEndereco(email.destinatarios);
  const itensCc = itensDeEndereco(email.cc);
  const itensCco = email.type === 'sent' ? itensDeEndereco(email.bcc) : [];
  // "Responder a todos" só faz sentido com mais de um destinatário (Para + Cc);
  // com um só, é igual a "Responder". Fora isso, precisa do handler vindo da página.
  const podeResponderATodos =
    !!onResponderATodos && itensPara.length + itensCc.length > 1;

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
          {/* Trio em destaque, como no Gmail: Responder / Responder a todos /
              Encaminhar. As duas primeiras variam conforme a mensagem (ver
              `podeResponderATodos`) e o handler vindo da página. */}
          <Button variant="ghost" size="sm" onClick={onResponder} className="gap-2">
            <Reply className="h-4 w-4" />
            Responder
          </Button>
          {podeResponderATodos && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResponderATodos}
              className="gap-2"
            >
              <ReplyAll className="h-4 w-4" />
              Responder a todos
            </Button>
          )}
          {onEncaminhar && (
            <Button variant="ghost" size="sm" onClick={onEncaminhar} className="gap-2">
              <Forward className="h-4 w-4" />
              Encaminhar
            </Button>
          )}

          {/* "⋮ mais": ações secundárias fora do caminho principal. Excluir vive
              aqui (não é ação de todo dia e já tem confirmação própria), junto de
              marcar não lida e mover — os dois só entram quando a página passa o
              handler (mensagem enviada não tem "não lido", por exemplo). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                title="Mais ações"
                aria-label="Mais ações"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onMarcarNaoLido && (
                <DropdownMenuItem onClick={onMarcarNaoLido} className="gap-2">
                  <MailOpen className="h-4 w-4" />
                  Marcar como não lida
                </DropdownMenuItem>
              )}
              {onMover && (
                <DropdownMenuItem onClick={onMover} className="gap-2">
                  <Tag className="h-4 w-4" />
                  Mover para marcador
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={onExcluir}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

          {/* A RESPOSTA (inline) entra no TOPO da conversa — logo abaixo do
              assunto e ACIMA da mensagem aberta, como combinado. Com a conversa
              em ordem "mais recente primeiro", a resposta é o item mais novo e
              por isso fica em cima (antes ela caía depois do corpo, no meio da
              conversa). `compositorInline` já vem montado pela página
              (`Emails.tsx`), que decide SE existe; aqui só se decide ONDE. */}
          {compositorInline && <div className="mb-6">{compositorInline}</div>}

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
                    sabe de cor. Lista inteira quando `destinatarios` (Nylas) vier
                    preenchida; senão, o `destinatario` singular de sempre — não
                    quebra e-mail antigo nem consulta que não trouxe a coluna. */}
                para{' '}
                {itensPara.length > 0 ? (
                  <ListaDeEnderecos
                    itens={itensPara}
                    emailDaConta={emailDaConta}
                    onClicarEndereco={onClicarEndereco}
                  />
                ) : email.destinatario && onClicarEndereco ? (
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
              {/* "Cc" — mesma regra de "Para" (lista, "mim", clicável); só aparece
                  quando há algum. */}
              {itensCc.length > 0 && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  Cc:{' '}
                  <ListaDeEnderecos
                    itens={itensCc}
                    emailDaConta={emailDaConta}
                    onClicarEndereco={onClicarEndereco}
                  />
                </div>
              )}
              {/* "Cco" — só em mensagem ENVIADA por mim. `itensCco` já vem vazio
                  quando `email.type !== 'sent'` (ver onde é calculado, acima),
                  então este bloco nunca aparece numa mensagem recebida — Cco é
                  oculta por natureza, quem recebeu não sabe quem mais estava
                  em cópia oculta. */}
              {itensCco.length > 0 && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  Cco:{' '}
                  <ListaDeEnderecos
                    itens={itensCco}
                    emailDaConta={emailDaConta}
                    onClicarEndereco={onClicarEndereco}
                  />
                </div>
              )}
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

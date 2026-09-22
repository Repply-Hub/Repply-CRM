import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronUp,
  CornerUpLeft,
  Forward,
  Loader2,
  MailOpen,
  MoreVertical,
  Paperclip,
  Reply,
  ReplyAll,
  Tag,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CorpoEmail } from './CorpoEmail';
import { type EnderecoDoEmail } from './email-enderecos';

/** Separa "Fulano <fulano@x.com>" em nome e endereço. */
function separarRemetente(valor?: string | null): { nome: string; endereco: string } {
  const bruto = (valor ?? '').trim();
  if (!bruto) return { nome: 'Desconhecido', endereco: '' };
  const m = bruto.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].trim() || m[2], endereco: m[2] };
  return { nome: bruto, endereco: bruto.includes('@') ? bruto : '' };
}

/**
 * Converte a lista do Nylas (`{name?, email}`) para `{nome, endereco}` — mesmo
 * par que `separarRemetente` produz, usado para "Para"/"Cc"/"Cco". Item sem
 * endereço é descartado.
 */
function itensDeEndereco(
  lista?: EnderecoDoEmail[] | null,
): { nome: string; endereco: string }[] {
  return (lista ?? [])
    .map((item) => {
      const endereco = (item?.email ?? '').trim();
      const nome = (item?.name ?? '').trim();
      return { nome: nome || endereco, endereco };
    })
    .filter((item) => item.endereco);
}

function tamanhoLegivel(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uma linha de endereços (Para/Cc/Cco), cada um clicável, com o próprio endereço
 * da caixa trocado por "mim".
 */
function ListaDeEnderecos({
  itens,
  emailDaConta,
  onClicarEndereco,
}: {
  itens: { nome: string; endereco: string }[];
  emailDaConta: string | null;
  onClicarEndereco?: (endereco: string) => void;
}) {
  return (
    <>
      {itens.map((item, i) => {
        const rotulo = item.endereco === emailDaConta ? 'mim' : item.nome;
        return (
          <span key={`${item.endereco}-${i}`}>
            {onClicarEndereco ? (
              <span
                className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                role="button"
                tabIndex={0}
                onClick={() => onClicarEndereco(item.endereco)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClicarEndereco(item.endereco);
                  }
                }}
              >
                {rotulo}
              </span>
            ) : (
              rotulo
            )}
            {i < itens.length - 1 ? ', ' : ''}
          </span>
        );
      })}
    </>
  );
}

/**
 * Uma mensagem da conversa, no leitor por conversa (estilo Gmail). É a MESMA
 * peça para todas as mensagens da thread — a aberta e as recolhidas —, no lugar
 * do formato antigo ("principal por extenso" + cards de "Nesta conversa").
 */
export interface MensagemDaConversa {
  id: string;
  tipo: 'sent' | 'received';
  /** "Nome <email>" ou só o endereço. */
  remetente: string;
  destinatarios: EnderecoDoEmail[];
  cc: EnderecoDoEmail[];
  bcc: EnderecoDoEmail[];
  assunto: string | null;
  data: string | null;
  snippet: string;
  /** `nylas_message_id` — o que responder/encaminhar precisa para amarrar à conversa. */
  gmail_message_id: string | null;
  /** Só recebida tem estado de leitura. */
  lido?: boolean;
  /** Endereço da caixa de origem, quando ela já foi desconectada. */
  caixaOrigem?: string | null;
  /** Selo de anexo na linha recolhida (a lista real vem no corpo, ao abrir). */
  tem_anexo?: boolean;
  /** Corpo completo — só preenchido DEPOIS de aberta (buscado sob demanda). */
  html?: string | null;
  anexos?: Array<{ id?: string; filename?: string; content_type?: string; size?: number }>;
  carregandoCorpo?: boolean;
  /** "Você respondeu" — só faz sentido em recebida. */
  respondida?: boolean;
}

interface Props {
  mensagem: MensagemDaConversa;
  emailDaConta: string | null;
  /** Aberta = cabeçalho + corpo + ⋮; recolhida = uma linha clicável. */
  aberta: boolean;
  /** Verdadeiro enquanto o corpo desta mensagem está sendo buscado (após abrir). */
  carregandoCorpo?: boolean;
  /** Clique recolhe/expande esta mensagem. */
  onAlternar: () => void;
  onClicarEndereco?: (endereco: string) => void;
  onResponder: () => void;
  /** Só vira item do ⋮ quando vier E a mensagem tiver mais de um destinatário. */
  onResponderATodos?: () => void;
  onEncaminhar: () => void;
  /** Ausente em mensagem enviada (não tem "não lido"). */
  onMarcarNaoLido?: () => void;
  onMover?: () => void;
  onExcluir: () => void;
}

export function MensagemConversa({
  mensagem,
  emailDaConta,
  aberta,
  carregandoCorpo,
  onAlternar,
  onClicarEndereco,
  onResponder,
  onResponderATodos,
  onEncaminhar,
  onMarcarNaoLido,
  onMover,
  onExcluir,
}: Props) {
  const enviada = mensagem.tipo === 'sent';
  const { nome, endereco } = separarRemetente(mensagem.remetente);
  const inicial = (nome || '?').trim()[0]?.toUpperCase() ?? '?';
  const naoLida = mensagem.tipo === 'received' && mensagem.lido === false;
  const rotuloRemetente = enviada ? 'Você' : nome;
  const itensPara = itensDeEndereco(mensagem.destinatarios);
  const itensCc = itensDeEndereco(mensagem.cc);
  // Cco só em mensagem ENVIADA por mim — recebida nunca mostra cópia oculta.
  const itensCco = enviada ? itensDeEndereco(mensagem.bcc) : [];
  const podeResponderATodos =
    !!onResponderATodos && itensPara.length + itensCc.length > 1;
  const anexos = mensagem.anexos ?? [];

  // ---- recolhida: uma linha clicável ----
  if (!aberta) {
    return (
      <button
        type="button"
        onClick={onAlternar}
        className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            enviada || naoLida ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {enviada ? <CornerUpLeft className="h-3.5 w-3.5" /> : inicial}
        </div>
        <span
          className={cn(
            'max-w-[30%] shrink-0 truncate text-sm',
            naoLida ? 'font-bold text-foreground' : 'font-medium text-foreground',
          )}
        >
          {rotuloRemetente}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {mensagem.snippet}
        </span>
        {naoLida && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />
        )}
        {mensagem.tem_anexo && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {mensagem.data && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {format(new Date(mensagem.data), "dd 'de' MMM, HH:mm", { locale: ptBR })}
          </span>
        )}
      </button>
    );
  }

  // ---- aberta: cabeçalho + corpo + ⋮ ----
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="flex items-start gap-3 border-b border-border/60 bg-card px-4 py-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            enviada || naoLida ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {enviada ? <CornerUpLeft className="h-4 w-4" /> : inicial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={
                endereco && onClicarEndereco
                  ? 'truncate text-sm font-semibold text-foreground cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary'
                  : 'truncate text-sm font-semibold text-foreground'
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
              {rotuloRemetente}
            </span>
            {!enviada && endereco && endereco !== nome && (
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
          {itensPara.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              para{' '}
              <ListaDeEnderecos itens={itensPara} emailDaConta={emailDaConta} onClicarEndereco={onClicarEndereco} />
            </div>
          )}
          {itensCc.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              Cc:{' '}
              <ListaDeEnderecos itens={itensCc} emailDaConta={emailDaConta} onClicarEndereco={onClicarEndereco} />
            </div>
          )}
          {itensCco.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              Cco:{' '}
              <ListaDeEnderecos itens={itensCco} emailDaConta={emailDaConta} onClicarEndereco={onClicarEndereco} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {mensagem.data && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {format(new Date(mensagem.data), "dd 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onAlternar}
            title="Recolher"
            aria-label="Recolher"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                title="Mais ações"
                aria-label="Mais ações"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onResponder} className="gap-2">
                <Reply className="h-4 w-4" />
                Responder
              </DropdownMenuItem>
              {podeResponderATodos && (
                <DropdownMenuItem onClick={onResponderATodos} className="gap-2">
                  <ReplyAll className="h-4 w-4" />
                  Responder a todos
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEncaminhar} className="gap-2">
                <Forward className="h-4 w-4" />
                Encaminhar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onMarcarNaoLido && !enviada && (
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

      <div className="p-3">
        {carregandoCorpo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Carregando o conteúdo…
          </div>
        )}
        {mensagem.respondida && (
          <div className="mb-2 flex items-center gap-1 text-[11px] font-medium text-primary">
            <CornerUpLeft className="h-3 w-3" />
            Você respondeu
          </div>
        )}
        {!carregandoCorpo && !mensagem.html && mensagem.caixaOrigem && (
          <div className="mb-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            Só a prévia desta mensagem foi guardada. Ela veio de{' '}
            <span className="font-medium text-foreground">{mensagem.caixaOrigem}</span>, uma caixa
            que não está mais conectada.
          </div>
        )}
        <CorpoEmail
          html={mensagem.html}
          textoSimples={mensagem.snippet}
          onClicarEndereco={onClicarEndereco}
        />
        {anexos.length > 0 && (
          <div className="mt-3">
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
                  <span className="max-w-[200px] truncate text-foreground">{a.filename ?? 'arquivo'}</span>
                  {a.size ? <span className="text-muted-foreground">{tamanhoLegivel(a.size)}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { ArrowLeft, Trash2, Reply, Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface EmailAberto {
  id: string;
  assunto?: string | null;
  remetente?: string | null;
  destinatario?: string | null;
  html?: string | null;
  corpo?: string | null;
  criado_em?: string | null;
  created_at?: string | null;
  carregandoCorpo?: boolean;
  anexos?: Array<{ filename?: string; size?: number }>;
  type?: 'sent' | 'received';
}

interface Props {
  email: EmailAberto;
  emailDaConta: string | null;
  onVoltar: () => void;
  onExcluir: () => void;
  onResponder: () => void;
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

/**
 * Leitura de uma mensagem, ocupando a tela inteira — como o Gmail.
 *
 * Substitui o modal que existia antes: e-mail não é confirmação de ação, é
 * conteúdo para ler. Modal empilha um contexto sobre o outro, prende a rolagem
 * e obriga a fechar para voltar à lista; a leitura em página deixa o "voltar"
 * ser o gesto natural, e o corpo respira na largura toda.
 */
export function LeitorEmail({ email, emailDaConta, onVoltar, onExcluir, onResponder }: Props) {
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
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <h1 className="mb-6 font-normal text-[1.375rem] leading-snug text-foreground">
            {email.assunto || '(sem assunto)'}
          </h1>

          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary">
              {inicial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate font-semibold text-sm text-foreground">{nome}</span>
                {endereco && endereco !== nome && (
                  <span className="truncate text-xs text-muted-foreground">
                    &lt;{endereco}&gt;
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {/* "para mim" quando o destinatário é a própria caixa — é como o
                    Gmail escreve, e evita repetir o endereço que o usuário já
                    sabe de cor. */}
                para{' '}
                {email.destinatario && email.destinatario === emailDaConta
                  ? 'mim'
                  : (email.destinatario || '—')}
              </div>
            </div>

            {data && (
              <div className="shrink-0 text-xs text-muted-foreground">
                {format(new Date(data), "dd 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })}
              </div>
            )}
          </div>

          {email.carregandoCorpo && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando o conteúdo completo...
            </div>
          )}

          {/* Papel branco por padrão, como Gmail e Outlook: o HTML de e-mail é
              escrito assumindo fundo claro, e renderizar sobre o tema escuro
              produziria preto no preto na maioria das mensagens.

              O que NÃO fazemos aqui é impor cor ao conteúdo. A versão anterior
              aplicava `prose` e `text-slate-800`, que sobrescrevem as cores que
              o próprio e-mail define — num e-mail de fundo escuro com texto
              claro (o da Make é exatamente isso), o título e os links viravam
              escuro sobre escuro e sumiam. Cor, fonte e espaçamento são do
              remetente; nós só damos a tela e contemos o transbordo.

              `color-scheme: light` impede o navegador de reinterpretar cores
              em modo escuro dentro deste bloco. */}
          <div
            className="overflow-hidden rounded-lg border bg-white"
            style={{ colorScheme: 'light' }}
          >
            {email.html ? (
              <div
                // Espaçamento sim, cor não: um e-mail de texto simples sem
                // wrapper próprio ficaria colado na borda. Em mensagens que
                // trazem fundo próprio isso vira uma moldura branca fina, que é
                // como o Gmail também as mostra.
                //
                // A rolagem horizontal é o preço de aceitar HTML alheio: muitos
                // e-mails são tabelas de largura fixa (600px é o padrão do
                // mercado) e sem isto empurrariam a página inteira.
                className="overflow-x-auto p-4 [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
                dangerouslySetInnerHTML={{ __html: email.html }}
              />
            ) : (
              <div className="whitespace-pre-wrap px-5 py-4 text-[0.9375rem] leading-relaxed text-slate-800">
                {email.corpo || ''}
              </div>
            )}
          </div>

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

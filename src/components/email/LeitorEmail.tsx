import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Forward, Loader2, Reply, ReplyAll } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { idsAbertasPorPadrao } from '@/lib/mensagens-abertas-por-padrao';
import { MensagemConversa, type MensagemDaConversa } from './MensagemConversa';
import { type EnderecoDoEmail } from './email-enderecos';

// `EnderecoDoEmail` mora em `./email-enderecos` (compartilhado); re-exportado
// aqui porque `Emails.tsx` o importa deste módulo desde antes.
export type { EnderecoDoEmail };

/**
 * A mensagem ABERTA no leitor, no formato que a página (`Emails.tsx`) monta ao
 * clicar numa linha da caixa. Serve de PONTO DE ENTRADA da conversa (define a
 * thread e qual mensagem começa expandida); a conversa em si é a lista de
 * `MensagemDaConversa` que a página passa.
 */
export interface EmailAberto {
  id: string;
  assunto?: string | null;
  remetente?: string | null;
  destinatario?: string | null;
  destinatarios?: EnderecoDoEmail[] | null;
  cc?: EnderecoDoEmail[] | null;
  bcc?: EnderecoDoEmail[] | null;
  html?: string | null;
  corpo?: string | null;
  /** Prévia curta vinda do provedor; é o que aparece enquanto o corpo carrega. */
  snippet?: string | null;
  /** Id da mensagem no provedor (`email_mensagens.nylas_message_id`), NÃO o id da linha. */
  gmail_message_id?: string | null;
  /** Endereço da caixa de origem, quando ela já foi desconectada. */
  caixaOrigem?: string | null;
  lido?: boolean;
  respondida?: boolean;
  criado_em?: string | null;
  created_at?: string | null;
  carregandoCorpo?: boolean;
  anexos?: Array<{ id?: string; filename?: string; content_type?: string; size?: number }>;
  type?: 'sent' | 'received';
  /** Id da conversa no provedor — liga esta mensagem às demais do mesmo thread. */
  threadId?: string | null;
}

interface Props {
  /** A conversa INTEIRA, mais recente primeiro. */
  mensagens: MensagemDaConversa[];
  /** Id da mensagem que a pessoa abriu (começa expandida). */
  idAbertoInicial: string;
  emailDaConta: string | null;
  carregandoConversa?: boolean;
  onVoltar: () => void;
  onClicarEndereco?: (endereco: string) => void;
  /** Pedido de buscar o corpo de UMA mensagem (ao abri-la). Idempotente na página. */
  onCarregarCorpo: (id: string) => void;
  /** O compositor de RESPOSTA (variante "inline"), montado pela página. */
  compositorInline?: ReactNode;
  // Ações — recebem a mensagem-alvo. O topo chama com a MAIS RECENTE; o ⋮ de
  // cada mensagem chama com a própria.
  onResponder: (m: MensagemDaConversa) => void;
  onResponderATodos?: (m: MensagemDaConversa) => void;
  onEncaminhar: (m: MensagemDaConversa) => void;
  onMarcarNaoLido?: (m: MensagemDaConversa) => void;
  onMover?: (m: MensagemDaConversa) => void;
  onExcluir: (m: MensagemDaConversa) => void;
}

/**
 * Leitura de uma conversa, como o Gmail: uma lista única de mensagens (mais
 * recente primeiro), cada uma recolhível. A que a pessoa abriu e as não lidas
 * começam abertas; as demais recolhidas. Ações no topo agem na mais recente;
 * cada mensagem tem o próprio menu ⋮.
 */
export function LeitorEmail({
  mensagens,
  idAbertoInicial,
  emailDaConta,
  carregandoConversa,
  onVoltar,
  onClicarEndereco,
  onCarregarCorpo,
  compositorInline,
  onResponder,
  onResponderATodos,
  onEncaminhar,
  onMarcarNaoLido,
  onMover,
  onExcluir,
}: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(() =>
    idsAbertasPorPadrao(mensagens, idAbertoInicial),
  );

  // Re-semeia quando a CONVERSA muda (outra mensagem de entrada) ou quando o
  // conjunto de mensagens muda (a lista completa chega, resposta nova, exclusão).
  // Carregar o corpo (preencher `html`) NÃO muda os ids, então recolher/expandir
  // manual é preservado.
  const idsChave = mensagens.map((m) => m.id).join(',');
  useEffect(() => {
    setExpandidos(idsAbertasPorPadrao(mensagens, idAbertoInicial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsChave, idAbertoInicial]);

  // Busca o corpo das mensagens abertas que ainda não têm corpo (as de padrão e
  // as que a pessoa expandir). Em ref para não reagir à identidade da função.
  const onCarregarCorpoRef = useRef(onCarregarCorpo);
  onCarregarCorpoRef.current = onCarregarCorpo;
  useEffect(() => {
    for (const m of mensagens) {
      if (expandidos.has(m.id) && m.html == null) onCarregarCorpoRef.current(m.id);
    }
  }, [expandidos, mensagens]);

  const alternar = (id: string) => {
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // A lista vem mais-recente-primeiro: o topo age na primeira.
  const maisRecente = mensagens[0];
  const assunto = maisRecente?.assunto || '(sem assunto)';
  const podeResponderATodosTopo =
    !!onResponderATodos &&
    !!maisRecente &&
    (maisRecente.destinatarios?.length ?? 0) + (maisRecente.cc?.length ?? 0) > 1;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Barra de ações, fixa no topo. As de resposta agem na mensagem mais
          recente (continuar a conversa); ações de UMA mensagem ficam no ⋮ dela. */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        {maisRecente && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onResponder(maisRecente)} className="gap-2">
              <Reply className="h-4 w-4" />
              Responder
            </Button>
            {podeResponderATodosTopo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResponderATodos?.(maisRecente)}
                className="gap-2"
              >
                <ReplyAll className="h-4 w-4" />
                Responder a todos
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onEncaminhar(maisRecente)} className="gap-2">
              <Forward className="h-4 w-4" />
              Encaminhar
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <h1 className="mb-4 font-semibold text-[1.5rem] leading-snug text-foreground">
            {assunto}
          </h1>

          {/* A RESPOSTA (inline) entra no TOPO da conversa — logo abaixo do
              assunto e acima da mensagem mais recente. */}
          {compositorInline && <div className="mb-6">{compositorInline}</div>}

          {carregandoConversa && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando a conversa…
            </div>
          )}

          <div className="flex flex-col gap-3 pb-6">
            {mensagens.map((m) => (
              <MensagemConversa
                key={m.id}
                mensagem={m}
                emailDaConta={emailDaConta}
                aberta={expandidos.has(m.id)}
                carregandoCorpo={m.carregandoCorpo}
                onAlternar={() => alternar(m.id)}
                onClicarEndereco={onClicarEndereco}
                onResponder={() => onResponder(m)}
                onResponderATodos={onResponderATodos ? () => onResponderATodos(m) : undefined}
                onEncaminhar={() => onEncaminhar(m)}
                onMarcarNaoLido={onMarcarNaoLido ? () => onMarcarNaoLido(m) : undefined}
                onMover={onMover ? () => onMover(m) : undefined}
                onExcluir={() => onExcluir(m)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

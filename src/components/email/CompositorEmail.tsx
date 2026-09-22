import { useEffect, useRef, useState } from 'react';
import { ChevronUp, Loader2, Mail, Minus, Paperclip, Send, Settings, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditorTextoRico } from '@/components/shared/EditorTextoRico';
import { CampoDestinatarios } from './CampoDestinatarios';
import { tamanhoLegivel } from '@/lib/fabricante-arquivos';
import { cn } from '@/lib/utils';

export interface RascunhoEmail {
  destinatario: string;
  assunto: string;
  corpo: string;
  /** Vários endereços separados por vírgula/ponto-e-vírgula, como o "Para". Não persiste no rascunho salvo (ver `Props.valores`). */
  cc: string;
  /** Idem, para cópia oculta. */
  cco: string;
}

interface Props {
  /**
   * "encaixado" = cartão flutuante no canto inferior (e-mail novo), não-modal:
   * o fundo continua rolável. "inline" = bloco em fluxo (resposta no topo da
   * conversa). Default "encaixado".
   */
  variante?: 'encaixado' | 'inline';
  /** Só no "encaixado": recolhido para a barrinha do cabeçalho. */
  minimizado?: boolean;
  onMinimizarChange?: (v: boolean) => void;
  /** Fecha o compositor SEM apagar — o rascunho fica salvo (autosave). Diferente de `onDescartar` (lixo). */
  onFechar: () => void;
  valores: RascunhoEmail;
  onChange: (valores: RascunhoEmail) => void;
  onEnviar: (e: React.FormEvent) => void;
  onDescartar: () => void;
  isConnected: boolean;
  isEnviando: boolean;
  /** "Nova mensagem" na caixa; "Responder" quando sai de dentro de um e-mail. */
  titulo?: string;
  /** Endereço da caixa da empresa — o autocompletar não sugere a própria caixa. */
  emailDaConta?: string | null;
  /**
   * Anexos já presos ao rascunho deste e-mail. A lista vem do
   * `email_rascunho_anexos`; o binário mora no balde privado e só a função
   * de servidor `email-enviar` o alcança no envio.
   */
  anexos: Array<{ id: string; nome_arquivo: string; tamanho: number }>;
  /** Recebe os arquivos escolhidos no seletor — a validação (tipo/tamanho) é de quem trata. */
  onAnexar: (arquivos: File[]) => void;
  onRemoverAnexo: (id: string) => void;
  /** `true` enquanto um upload está em curso: trava o Enviar para o arquivo não ficar de fora. */
  anexando: boolean;
  /**
   * Leva para a edição da assinatura em Configurações. Opcional e sem
   * guarda de papel: qualquer pessoa que escreve e-mail pode ajustar a
   * própria assinatura, não só quem gerencia a caixa da empresa.
   */
  onConfigurarAssinatura?: () => void;
  /**
   * Sobe uma imagem inserida NO CORPO (não confundir com anexo) e devolve a
   * URL pública. Passar esta prop habilita o botão Imagem na barra do
   * editor; sem ela, o botão não aparece.
   */
  onEnviarImagemCorpo?: (file: File) => Promise<string>;
}

/**
 * Compositor de e-mail — NÃO é mais modal (desde 21/09/2026, reforma "estilo
 * Gmail"). Duas molduras conforme `variante`:
 *  - "encaixado": cartão de posição fixa no canto inferior, que não trava o
 *    fundo (dá pra rolar a lista/o e-mail atrás), com minimizar + fechar; no
 *    celular vira tela cheia. É o e-mail NOVO.
 *  - "inline": bloco em fluxo, montado no topo da conversa aberta (o leitor). É
 *    a RESPOSTA.
 * O formulário (Para/Cc/Cco, assunto, editor, anexos, Enviar) é o mesmo nas
 * duas; só a moldura muda. Quem controla abrir/fechar/minimizar é a página
 * (`Emails.tsx`), que monta um compositor de cada vez.
 */
export function CompositorEmail({
  variante = 'encaixado',
  minimizado = false,
  onMinimizarChange,
  onFechar,
  valores,
  onChange,
  onEnviar,
  onDescartar,
  isConnected,
  isEnviando,
  titulo = 'Nova mensagem',
  emailDaConta,
  anexos,
  onAnexar,
  onRemoverAnexo,
  anexando,
  onConfigurarAssinatura,
  onEnviarImagemCorpo,
}: Props) {
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  // Cc/Cco começam abertos se já vierem preenchidos no mount (e-mail novo com
  // cópia, ou "Responder a todos" recém-aberto).
  const [mostrarCc, setMostrarCc] = useState(!!valores.cc);
  const [mostrarCco, setMostrarCco] = useState(!!valores.cco);

  // ...MAS o Cc também pode passar a ter conteúdo SEM remontar o compositor:
  // trocar "Responder" → "Responder a todos" na mesma mensagem só muda o `cc`
  // (a página não recria a instância, para preservar o corpo digitado). Sem
  // isto, os endereços copiados ficavam preenchidos mas o campo continuava
  // escondido. Só REVELA (nunca esconde): esconder enquanto a pessoa digita ou
  // apaga seria hostil.
  useEffect(() => {
    if (valores.cc) setMostrarCc(true);
  }, [valores.cc]);
  useEffect(() => {
    if (valores.cco) setMostrarCco(true);
  }, [valores.cco]);

  const corpoForm = (
    <form onSubmit={onEnviar} className="flex min-h-0 flex-1 flex-col">
      {/* Só o miolo rola; cabeçalho (da moldura) e este rodapé de ações ficam
          fixos — o mesmo teto-de-altura/rolagem que o `ConteudoDialogo` dava,
          agora à mão (CLAUDE.md §7.11), porque o cartão não é Dialog. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Campos sem moldura (silhueta de compositor), mas COM anel de foco.
            Rótulos <label htmlFor> para clique/leitor de tela chegarem ao input
            mesmo sem borda visível. */}
        <div className="border-b px-6">
          <div className="flex items-center gap-2 py-2">
            <label htmlFor="to" className="min-w-[60px] text-sm text-muted-foreground">
              Para
            </label>
            <CampoDestinatarios
              id="to"
              ariaLabel="Para"
              valor={valores.destinatario}
              onChange={(v) => onChange({ ...valores, destinatario: v })}
              emailDaConta={emailDaConta}
            />
            {/* Estilo Gmail: o link some depois de clicado. */}
            <div className="flex shrink-0 items-center gap-2">
              {!mostrarCc && (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setMostrarCc(true)}
                >
                  Cc
                </button>
              )}
              {!mostrarCco && (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setMostrarCco(true)}
                >
                  Cco
                </button>
              )}
            </div>
          </div>
        </div>

        {mostrarCc && (
          <div className="border-b px-6">
            <div className="flex items-center gap-2 py-2">
              <label htmlFor="cc" className="min-w-[60px] text-sm text-muted-foreground">
                Cc
              </label>
              <CampoDestinatarios
                id="cc"
                ariaLabel="Cc"
                valor={valores.cc}
                onChange={(v) => onChange({ ...valores, cc: v })}
                emailDaConta={emailDaConta}
              />
            </div>
          </div>
        )}

        {mostrarCco && (
          <div className="border-b px-6">
            <div className="flex items-center gap-2 py-2">
              <label htmlFor="cco" className="min-w-[60px] text-sm text-muted-foreground">
                Cco
              </label>
              <CampoDestinatarios
                id="cco"
                ariaLabel="Cco"
                valor={valores.cco}
                onChange={(v) => onChange({ ...valores, cco: v })}
                emailDaConta={emailDaConta}
              />
            </div>
          </div>
        )}

        <div className="border-b px-6">
          <div className="flex items-center gap-2 py-3">
            <label htmlFor="subject" className="min-w-[60px] text-sm text-muted-foreground">
              Assunto
            </label>
            <Input
              id="subject"
              placeholder="Assunto"
              className="h-8 border-none bg-transparent px-0 font-medium shadow-none"
              value={valores.assunto}
              onChange={(e) => onChange({ ...valores, assunto: e.target.value })}
            />
          </div>
        </div>

        <div className="px-6 py-4">
          <EditorTextoRico
            value={valores.corpo}
            onChange={(html) => onChange({ ...valores, corpo: html })}
            onEnviarImagem={onEnviarImagemCorpo}
            placeholder="Escreva sua mensagem aqui..."
            minHeight={variante === 'inline' ? 220 : 320}
            aria-label="Corpo do e-mail"
          />
        </div>

        {/* Anexos. O seletor de arquivo é escondido e disparado pelo botão. */}
        <div className="border-t px-6 py-3">
          <input
            ref={inputArquivoRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const lista = Array.from(e.target.files ?? []);
              if (lista.length) onAnexar(lista);
              e.target.value = '';
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => inputArquivoRef.current?.click()}
                disabled={anexando}
                title="Anexar arquivos a este e-mail"
              >
                {anexando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                {anexando ? 'Enviando arquivo…' : 'Anexar'}
              </Button>
              {/* A assinatura vive dentro do corpo (editor acima); este botão só
                  leva para ajustar o texto salvo em Configurações. */}
              {onConfigurarAssinatura && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={onConfigurarAssinatura}
                  title="Editar a assinatura salva em Configurações"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configurar assinatura
                </Button>
              )}
            </div>
            {anexos.length > 0 && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {anexos.length} {anexos.length === 1 ? 'anexo' : 'anexos'}
              </span>
            )}
          </div>

          {anexos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {anexos.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.nome_arquivo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {tamanhoLegivel(a.tamanho)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    onClick={() => onRemoverAnexo(a.id)}
                    title={`Remover ${a.nome_arquivo}`}
                    aria-label={`Remover ${a.nome_arquivo}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Rodapé de ações fixo: Descartar (lixo, à esquerda) e Enviar/Conectar
          (à direita). `justify-between` de propósito. `shrink-0` para não ceder
          espaço ao miolo. */}
      <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t px-6 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDescartar}
          title="Descartar rascunho"
          aria-label="Descartar rascunho"
        >
          <Trash2 className="h-5 w-5" />
        </Button>

        {!isConnected ? (
          // Sem caixa conectada não há de onde enviar. Fechar (o rascunho fica
          // salvo) em vez de navegar para fora.
          <Button
            type="button"
            variant="outline"
            onClick={onFechar}
            className="flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            Conectar uma caixa para enviar
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isEnviando || anexando}
            title={anexando ? 'Aguarde o anexo terminar de subir' : undefined}
            className="gap-2"
          >
            {isEnviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </Button>
        )}
      </div>
    </form>
  );

  if (variante === 'inline') {
    return (
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex shrink-0 items-center justify-between border-b bg-muted px-4 py-2">
          <span className="truncate text-sm font-medium">{titulo}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {corpoForm}
      </div>
    );
  }

  // encaixado: cartão fixo no canto inferior direito (não-modal); celular = tela cheia.
  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col border bg-card shadow-2xl',
        'bottom-0 right-4 w-[540px] max-w-[calc(100vw-2rem)] max-h-[85dvh] rounded-t-lg',
        'max-sm:inset-0 max-sm:right-0 max-sm:w-full max-sm:max-h-none max-sm:rounded-none',
      )}
      role="region"
      aria-label={titulo}
    >
      <div className="flex shrink-0 items-center justify-between border-b bg-muted px-4 py-2">
        <span className="truncate text-sm font-medium">{titulo}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMinimizarChange?.(!minimizado)}
            title={minimizado ? 'Expandir' : 'Minimizar'}
            aria-label={minimizado ? 'Expandir' : 'Minimizar'}
          >
            {minimizado ? <ChevronUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {!minimizado && corpoForm}
    </div>
  );
}

import { Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export interface RascunhoEmail {
  destinatario: string;
  assunto: string;
  corpo: string;
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  valores: RascunhoEmail;
  onChange: (valores: RascunhoEmail) => void;
  onEnviar: (e: React.FormEvent) => void;
  onDescartar: () => void;
  isConnected: boolean;
  isEnviando: boolean;
  /** "Nova mensagem" na caixa; "Responder" quando sai de dentro de um e-mail. */
  titulo?: string;
}

/**
 * Compositor de e-mail.
 *
 * Vive num componente próprio porque é montado em DOIS lugares: na listagem
 * (botão "Escrever") e dentro do leitor de uma mensagem (botão "Responder").
 * Enquanto ele existia solto no JSX da listagem, responder obrigava a fechar o
 * e-mail aberto para o diálogo ter onde aparecer — a pessoa clicava em
 * "Responder" e era jogada de volta para a caixa de entrada.
 */
export function CompositorEmail({
  open,
  onOpenChange,
  valores,
  onChange,
  onEnviar,
  onDescartar,
  isConnected,
  isEnviando,
  titulo = 'Nova mensagem',
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* O "X" é só o do DialogContent — o Radix já o desenha em todo diálogo.
          Havia um segundo botão de fechar desenhado à mão aqui, e os dois
          ficavam empilhados no mesmo canto. Em vez de mais um botão, o que
          este seletor faz é reposicionar e clarear o nativo para ele pousar
          na faixa escura do cabeçalho. Só existe um <button> filho direto do
          DialogContent: o próprio botão de fechar do Radix. */}
      <DialogContent
        className="sm:max-w-[600px] p-0 overflow-hidden rounded-xl border-none shadow-2xl
                   [&>button]:right-3 [&>button]:top-2.5 [&>button]:text-white
                   [&>button]:opacity-80 [&>button:hover]:opacity-100"
      >
        <div className="bg-[#404040] text-white px-4 py-2">
          <DialogTitle className="text-sm font-medium">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">
            Preencha destinatário, assunto e mensagem para enviar pela caixa da empresa.
          </DialogDescription>
        </div>

        <form onSubmit={onEnviar} className="p-0 space-y-0">
          <div className="px-4 border-b">
            <div className="flex items-center gap-2 py-2">
              <span className="text-sm text-muted-foreground min-w-[60px]">Para</span>
              <Input
                id="to"
                placeholder="email@exemplo.com"
                className="border-none shadow-none focus-visible:ring-0 px-0 h-8 bg-transparent"
                value={valores.destinatario}
                onChange={(e) => onChange({ ...valores, destinatario: e.target.value })}
              />
            </div>
          </div>

          <div className="px-4 border-b">
            <div className="flex items-center gap-2 py-2">
              <span className="text-sm text-muted-foreground min-w-[60px]">Assunto</span>
              <Input
                id="subject"
                placeholder="Assunto"
                className="border-none shadow-none focus-visible:ring-0 px-0 h-8 font-medium bg-transparent"
                value={valores.assunto}
                onChange={(e) => onChange({ ...valores, assunto: e.target.value })}
              />
            </div>
          </div>

          <div className="p-4">
            <Textarea
              id="body"
              placeholder="Escreva sua mensagem aqui..."
              className="min-h-[300px] border-none focus-visible:ring-0 p-0 resize-none text-base"
              value={valores.corpo}
              onChange={(e) => onChange({ ...valores, corpo: e.target.value })}
            />
          </div>

          <div className="p-4 flex justify-between items-center bg-muted/10">
            <div className="flex gap-2 items-center">
              {!isConnected ? (
                // Sem caixa conectada não há de onde enviar. O caminho para
                // conectar fica na própria aba de e-mails, atrás deste diálogo —
                // daí fechar em vez de navegar para fora.
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full px-6 flex gap-2 items-center"
                >
                  <Mail className="h-4 w-4" />
                  Conectar uma caixa para enviar
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="rounded-full px-6 bg-[#0b57d0] hover:bg-[#0842a0] text-white"
                  disabled={isEnviando}
                >
                  {isEnviando ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-destructive"
                onClick={onDescartar}
                title="Descartar rascunho"
                aria-label="Descartar rascunho"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

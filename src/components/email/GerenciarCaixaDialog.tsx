import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Archive, Loader2, Mail, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEmailEmpresa, ROTULO_PROVEDOR } from '@/hooks/use-email-empresa';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}

/**
 * Gerenciar a caixa de e-mail da empresa: ver qual está conectada e trocá-la.
 *
 * POR QUE ISTO EXISTE: o `ConectarEmailCard` — único lugar com o botão de
 * desconectar — só é renderizado quando NÃO há caixa conectada. Depois de
 * conectar, ele some, e não sobrava caminho nenhum na interface para trocar de
 * endereço. O backend já sabia desconectar; faltava a porta.
 *
 * A escolha sobre o histórico é o miolo da tela. Desconectar mexe em
 * correspondência já recebida, e as duas respostas certas dependem da intenção:
 * quem troca de endereço normalmente quer manter o que já chegou; quem está
 * saindo de vez pode querer limpar. Escolher por quem usa seria errar metade
 * das vezes, então a decisão é explícita — e "manter" vem primeiro por ser o
 * caminho reversível.
 */
export function GerenciarCaixaDialog({ open, onOpenChange }: Props) {
  const { conta, connectedEmail, desconectar, isDisconnecting } = useEmailEmpresa();
  const [confirmando, setConfirmando] = useState<'preservar' | 'apagar' | null>(null);

  // Contagem real, para a confirmação dizer o tamanho do que está em jogo em vez
  // de um genérico "as mensagens serão apagadas".
  const { data: totalMensagens } = useQuery({
    queryKey: ['email_mensagens_da_conta', conta?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('email_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('conta_id', conta!.id);
      return count ?? 0;
    },
    enabled: open && !!conta?.id,
  });

  const executar = async (preservar: boolean) => {
    try {
      await desconectar({ preservarMensagens: preservar });
    } catch {
      // O hook já avisa por toast. Em caso de falha o diálogo FICA aberto, na
      // tela de confirmação, para a pessoa tentar de novo sem refazer o caminho.
      return;
    }
    setConfirmando(null);
    onOpenChange(false);
  };

  const fechar = (aberto: boolean) => {
    if (!aberto) setConfirmando(null);
    onOpenChange(aberto);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Caixa de e-mail da empresa</DialogTitle>
          <DialogDescription>
            A caixa é compartilhada pelo time. Desconectar afeta todo mundo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{connectedEmail}</p>
            <p className="text-xs text-muted-foreground">
              {conta?.provedor ? ROTULO_PROVEDOR[conta.provedor] : '—'}
              {typeof totalMensagens === 'number' && (
                <> · {totalMensagens} {totalMensagens === 1 ? 'mensagem' : 'mensagens'} no CRM</>
              )}
            </p>
          </div>
        </div>

        {!confirmando ? (
          <>
            <p className="text-sm text-muted-foreground">
              Para usar outro endereço, desconecte este primeiro. Depois a tela de e-mails
              oferece a conexão da caixa nova.
            </p>

            <div className="flex flex-col gap-2">
              {/* Manter primeiro: é a opção reversível. Apagar não tem volta. */}
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3 text-left"
                onClick={() => setConfirmando('preservar')}
              >
                <Archive className="h-4 w-4 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Desconectar e manter o histórico</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    As mensagens continuam no CRM, marcadas com o endereço de origem.
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3 text-left"
                onClick={() => setConfirmando('apagar')}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Desconectar e apagar o histórico</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Remove do CRM tudo que já foi sincronizado desta caixa.
                  </span>
                </span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">
                  {confirmando === 'apagar'
                    ? `Apagar ${totalMensagens ?? 0} ${(totalMensagens ?? 0) === 1 ? 'mensagem' : 'mensagens'}?`
                    : 'Desconectar esta caixa?'}
                </p>
                <p className="text-muted-foreground">
                  {confirmando === 'apagar'
                    ? 'Não há como desfazer pelo CRM. As mensagens originais continuam na conta de e-mail no provedor — aqui elas somem.'
                    : 'O time perde o acesso a esta caixa pelo CRM até alguém conectar outra. As mensagens já recebidas ficam.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmando(null)} disabled={isDisconnecting}>
                Voltar
              </Button>
              <Button
                variant={confirmando === 'apagar' ? 'destructive' : 'default'}
                onClick={() => executar(confirmando === 'preservar')}
                disabled={isDisconnecting}
                className="gap-2"
              >
                {isDisconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmando === 'apagar' ? 'Apagar e desconectar' : 'Desconectar'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

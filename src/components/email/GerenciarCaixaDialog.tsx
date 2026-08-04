import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Archive, Loader2, Mail, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { useCompartilhamentoCaixa } from '@/hooks/use-email-pastas';
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
  const { pessoas, alternar, isSalvando } = useCompartilhamentoCaixa(open ? conta?.id : null);

  /**
   * Quanto está em jogo — e, principalmente, QUANTO do que sobra dá para ler.
   *
   * A distinção não é detalhe: a sincronização nunca baixa o corpo das
   * mensagens, só a prévia. O corpo é buscado sob demanda, quando alguém abre.
   * Na prática a esmagadora maioria do histórico existe só como assunto +
   * prévia — e, depois de desconectar, o corpo fica inalcançável para sempre,
   * porque buscá-lo exigiria a credencial que acabou de ser revogada.
   *
   * Dizer só "N mensagens" seria tecnicamente verdadeiro e enganoso: a pessoa
   * escolheria "manter" imaginando um arquivo consultável.
   */
  const { data: contagem } = useQuery({
    queryKey: ['email_mensagens_da_conta', conta?.id],
    queryFn: async () => {
      const base = () =>
        supabase
          .from('email_mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('conta_id', conta!.id);

      const [{ count: total }, { count: completas }] = await Promise.all([
        base(),
        base().not('corpo_html', 'is', null),
      ]);
      return { total: total ?? 0, completas: completas ?? 0 };
    },
    enabled: open && !!conta?.id,
  });

  const totalMensagens = contagem?.total;
  const soPrevia = contagem ? contagem.total - contagem.completas : 0;

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

        {/* `min-w-0` em todo filho que possa crescer: o DialogContent é um GRID,
            e item de grid tem `min-width: auto`, ou seja, se recusa a encolher
            abaixo do próprio conteúdo. Sem isto, um endereço de e-mail comprido
            empurra a caixa inteira para além do `max-w` e o diálogo vaza da
            tela — foi exatamente o que aconteceu aqui. */}
        <div className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
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
            {/* Quem enxerga a caixa. Vem antes de desconectar de propósito: é a
                ação do dia a dia, e desconectar é irreversível. */}
            <div className="min-w-0 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Quem tem acesso</p>
                <p className="text-xs text-muted-foreground">
                  Gestores sempre enxergam
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Libere o time para receber e responder por esta caixa. É assim que o
                atendimento compartilha um endereço só.
              </p>

              <div className="max-h-56 overflow-y-auto rounded-lg border">
                {pessoas.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum usuário na empresa.
                  </p>
                ) : (
                  pessoas.map((p) => {
                    // Gestor/dono não entra na lista: o acesso dele não vem daqui,
                    // vem do papel. Deixar a caixinha marcada e travada explica
                    // isso melhor do que escondê-lo.
                    const porPapel = p.role === 'gestor' || p.role === 'empresa' || p.role === 'admin';
                    return (
                      <label
                        key={p.usuarioId}
                        className={cn(
                          'flex items-center gap-3 border-b px-3 py-2 last:border-b-0',
                          porPapel ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40',
                        )}
                      >
                        <Checkbox
                          checked={porPapel || p.liberadoExplicitamente}
                          disabled={porPapel || isSalvando}
                          onCheckedChange={(v) => alternar(p.usuarioId, v === true)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {p.nome || p.email || '—'}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {porPapel ? `${p.role} · acesso pelo cargo` : p.email}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Para usar outro endereço, desconecte este primeiro. Depois a tela de e-mails
              oferece a conexão da caixa nova.
            </p>

            <div className="flex min-w-0 flex-col gap-2">
              {/* Manter primeiro: é a opção reversível. Apagar não tem volta. */}
              <Button
                variant="outline"
                className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal px-4 py-3 text-left"
                onClick={() => setConfirmando('preservar')}
              >
                <Archive className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">Desconectar e manter o histórico</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {contagem && soPrevia > 0 ? (
                      <>
                        {contagem.completas} {contagem.completas === 1 ? 'mensagem fica' : 'mensagens ficam'}{' '}
                        completa{contagem.completas === 1 ? '' : 's'}; as outras {soPrevia} ficam só com
                        remetente, assunto e prévia — o conteúdo delas não será mais recuperável.
                      </>
                    ) : (
                      <>As mensagens continuam no CRM, marcadas com o endereço de origem.</>
                    )}
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal px-4 py-3 text-left"
                onClick={() => setConfirmando('apagar')}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
            <div className="flex min-w-0 items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-medium text-foreground">
                  {confirmando === 'apagar'
                    ? `Apagar ${totalMensagens ?? 0} ${(totalMensagens ?? 0) === 1 ? 'mensagem' : 'mensagens'}?`
                    : 'Desconectar esta caixa?'}
                </p>
                <p className="text-muted-foreground">
                  {confirmando === 'apagar' ? (
                    'Não há como desfazer pelo CRM. As mensagens originais continuam na conta de e-mail no provedor — aqui elas somem.'
                  ) : soPrevia > 0 ? (
                    <>
                      O time perde o acesso a esta caixa pelo CRM até alguém conectar outra. O
                      histórico fica para consulta, mas o conteúdo completo de {soPrevia}{' '}
                      {soPrevia === 1 ? 'mensagem' : 'mensagens'} não terá como ser recuperado — ele
                      continua apenas na conta original, no provedor.
                    </>
                  ) : (
                    'O time perde o acesso a esta caixa pelo CRM até alguém conectar outra. As mensagens já recebidas ficam.'
                  )}
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

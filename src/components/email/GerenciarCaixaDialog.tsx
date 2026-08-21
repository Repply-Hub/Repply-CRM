import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Archive, ChevronDown, Loader2, Mail, PenLine, Search, Tag, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  useCompartilhamentoCaixa,
  useEmailPastas,
  type UsuarioDaCaixa,
} from '@/hooks/use-email-pastas';
import { useEmailEmpresa, ROTULO_PROVEDOR } from '@/hooks/use-email-empresa';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// Teto de altura e rolagem: com muita gente na empresa este diálogo passa da
// altura da tela, e o modal do shadcn corta o excedente EM CIMA e EMBAIXO ao
// mesmo tempo — some o rodapé e some o "X" de fechar, sem saída pelo teclado.
import { ConteudoDialogo } from '@/components/shared/DialogoResponsivo';

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
/** A partir de quantos marcadores a lista deixa de caber no olho e ganha busca. */
const MARCADORES_ATE_ROLAR = 8;

/**
 * Os marcadores de UMA pessoa, com busca própria.
 *
 * A MD tem 31 marcadores e a lista se repete inteira a cada pessoa que se abre:
 * sem busca, liberar um marcador para cinco vendedores é rolar trinta linhas
 * cinco vezes. A busca é local (nada vai ao servidor) e o estado mora aqui
 * dentro — trocar de pessoa recomeça com a lista inteira, que é o esperado.
 */
function MarcadoresDaPessoa({
  marcadores,
  caixaInteira,
  liberados,
  isSalvando,
  onAlternar,
}: {
  marcadores: { pastaId: string; nome: string }[];
  caixaInteira: boolean;
  liberados: string[];
  isSalvando: boolean;
  onAlternar: (pastaId: string, ligado: boolean) => void;
}) {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? marcadores.filter((m) => m.nome.toLowerCase().includes(termo))
    : marcadores;

  return (
    <>
      {marcadores.length > MARCADORES_ATE_ROLAR && (
        <div className="relative py-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marcador..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          Nenhum marcador com "{busca.trim()}".
        </p>
      ) : (
        // Teto de altura só quando a lista é longa: com poucos marcadores uma
        // caixa de rolagem meio vazia parece defeito.
        <div className={cn(marcadores.length > MARCADORES_ATE_ROLAR && 'max-h-48 overflow-y-auto pr-1')}>
          {visiveis.map((m) => (
            <label
              key={m.pastaId}
              className={cn(
                'flex items-center gap-3 py-1',
                caixaInteira ? 'opacity-50' : 'cursor-pointer',
              )}
            >
              {/* Com a caixa inteira liberada o marcador já está incluído.
                  Travado e marcado diz isso sem apagar a escolha anterior:
                  desmarcar "caixa inteira" devolve o que a pessoa tinha. */}
              <Checkbox
                checked={caixaInteira || liberados.includes(m.pastaId)}
                disabled={caixaInteira || isSalvando}
                onCheckedChange={(v) => onAlternar(m.pastaId, v === true)}
              />
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.nome}</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/** Resume, numa linha, o que a pessoa enxerga hoje. */
function resumoDoAcesso(p: UsuarioDaCaixa): string {
  if (p.porPapel) return `${p.role} · acesso pelo cargo`;
  if (p.caixaInteira) return 'Caixa inteira';
  if (p.marcadores.length === 1) return '1 marcador';
  if (p.marcadores.length > 1) return `${p.marcadores.length} marcadores`;
  return 'Sem acesso';
}

export function GerenciarCaixaDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { conta, connectedEmail, desconectar, isDisconnecting } = useEmailEmpresa();
  const [confirmando, setConfirmando] = useState<'preservar' | 'apagar' | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const { pessoas, alternar, isSalvando } = useCompartilhamentoCaixa(open ? conta?.id : null);
  const { data: pastas = [] } = useEmailPastas(open ? conta?.id : null);
  const marcadores = pastas.filter((p) => !p.ehSistema);

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
      <ConteudoDialogo className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Caixa de e-mail da empresa</DialogTitle>
          <DialogDescription>
            A caixa é compartilhada pelo time. Desconectar afeta todo mundo.
          </DialogDescription>
        </DialogHeader>

        {/* `min-w-0` em todo filho que possa crescer: item de grid — e de flex,
            que é o que o ConteudoDialogo usa — tem `min-width: auto`, ou seja,
            se recusa a encolher abaixo do próprio conteúdo. Sem isto, um
            endereço de e-mail comprido empurra a caixa inteira para além do
            `max-w` e o diálogo vaza da tela — foi o que aconteceu aqui. */}
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
            {/* Atalho pra assinatura: quem abre "gerenciar caixa" pensando em
                como o e-mail sai formatado não tinha nenhum caminho daqui até
                lá — precisava saber de cor que isso mora em Configurações. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                onOpenChange(false);
                navigate('/configuracoes?tab=perfil');
              }}
            >
              <PenLine className="h-4 w-4" />
              Configurar assinatura de e-mail
            </Button>

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
                Libere a caixa inteira ou só um marcador. Quem enxerga um marcador
                também responde por ele — é assim que o atendimento divide um
                endereço só entre várias pessoas.
              </p>

              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {pessoas.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum usuário na empresa.
                  </p>
                ) : (
                  pessoas.map((p) => {
                    const aberto = expandido === p.usuarioId;
                    return (
                      <div key={p.usuarioId} className="border-b last:border-b-0">
                        {/* Gestor/dono não abre: o acesso dele não vem daqui, vem
                            do papel. Dizer isso na linha explica melhor do que
                            escondê-lo da lista. */}
                        <button
                          type="button"
                          disabled={p.porPapel}
                          onClick={() => setExpandido(aberto ? null : p.usuarioId)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left',
                            p.porPapel ? 'opacity-60' : 'hover:bg-muted/40',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">
                              {p.nome || p.email || '—'}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {resumoDoAcesso(p)}
                            </span>
                          </span>
                          {!p.porPapel && (
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                aberto && 'rotate-180',
                              )}
                            />
                          )}
                        </button>

                        {aberto && (
                          <div className="space-y-1 bg-muted/30 px-3 pb-3 pl-4">
                            <label className="flex cursor-pointer items-center gap-3 py-1">
                              <Checkbox
                                checked={p.caixaInteira}
                                disabled={isSalvando}
                                onCheckedChange={(v) =>
                                  alternar(p.usuarioId, null, v === true)
                                }
                              />
                              <span className="text-sm text-foreground">Caixa inteira</span>
                            </label>

                            {marcadores.length === 0 ? (
                              <p className="py-1 text-xs text-muted-foreground">
                                Esta caixa não tem marcadores. Eles aparecem aqui depois
                                da próxima sincronização.
                              </p>
                            ) : (
                              <MarcadoresDaPessoa
                                marcadores={marcadores}
                                caixaInteira={p.caixaInteira}
                                liberados={p.marcadores}
                                isSalvando={isSalvando}
                                onAlternar={(pastaId, ligado) =>
                                  alternar(p.usuarioId, pastaId, ligado)
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
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
      </ConteudoDialogo>
    </Dialog>
  );
}

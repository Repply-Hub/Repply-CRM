import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Send, Loader2, MessageSquare, Info, AlertTriangle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { mensagemDeRecusa, type Recusa } from '@/lib/recusa-de-envio';
import { filtrarDestinos, type DestinoWhatsApp } from '@/lib/destinos-whatsapp';
import { useDestinosWhatsApp } from '@/hooks/use-destinos-whatsapp';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useEnviarCatalogo } from '@/hooks/use-enviar-catalogo';
import type { ArquivoDaFabrica } from '@/hooks/use-fabricante-arquivos';

/**
 * Escolher para quem mandar o catálogo no WhatsApp.
 *
 * 🔴 DESDE 27/08/2026 A LISTA INCLUI AS CONVERSAS ABERTAS atribuídas a quem está usando, e não
 * só o cadastro. Medido: as 779 conversas de WhatsApp da MD estão TODAS sem contato do CRM
 * vinculado — uma lista feita só de `contatos` deixava de fora exatamente as pessoas com quem a
 * equipe está conversando, e obrigava a cadastrar o cliente só para poder mandar um PDF para
 * alguém que já estava do outro lado de uma conversa aberta.
 *
 * A junção das duas fontes é pura e mora em `src/lib/destinos-whatsapp.ts`, que também remove o
 * repetido: a mesma pessoa no cadastro e numa conversa vira UMA linha, senão alguém mandaria
 * duas vezes achando que são clientes diferentes.
 *
 * 🔴 A RECUSA APARECE COMO INFORMAÇÃO, NÃO COMO ERRO VERMELHO. Vermelho faz a pessoa achar
 * que quebrou, e quem acha que quebrou tenta de novo — que é exatamente o comportamento que
 * as travas existem para evitar. Ver `src/lib/recusa-de-envio.ts`.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arquivo: ArquivoDaFabrica | null;
}

export function EnviarCatalogoDialog({ open, onOpenChange, arquivo }: Props) {
  const navigate = useNavigate();
  const enviar = useEnviarCatalogo();
  const [busca, setBusca] = useState('');
  // 🔴 `conversaId`, não telefone. O botão "ver na conversa" precisa dele: a caixa de entrada
  // seleciona a conversa por `?conversaId=` (WhatsAppInbox.tsx:3876), e `?telefone=` não é lido
  // por ninguém — o clique abria o WhatsApp na tela padrão, parecendo que tinha falhado.
  const [recusa, setRecusa] = useState<(Recusa & { conversaId: string | null }) | null>(null);

  // Só quem TEM para onde mandar. Medido em 26/08/2026: 942 de 1.092 contatos têm telefone —
  // mostrar os outros 150 só para dar erro depois é desperdiçar o clique de quem está com o
  // cliente esperando. A RLS já escopa por empresa; não filtrar de novo aqui.
  const { destinos, carregando: isLoading, falhouContatos, falhouConversas } =
    useDestinosWhatsApp(open);

  const filtrados = useMemo(() => filtrarDestinos(destinos, busca).slice(0, 60), [destinos, busca]);

  const mandar = async (destino: DestinoWhatsApp) => {
    if (!arquivo) return;
    setRecusa(null);
    try {
      const r = await enviar.mutateAsync({ arquivo, destino });

      if (r.enviado) {
        toast.success(`Catálogo enviado para ${destino.nome}.`);
        onOpenChange(false);
        return;
      }

      // Recusado por uma das travas: a tela mostra a mensagem certa, com o horário.
      setRecusa({
        ...mensagemDeRecusa(r.motivo!, r.liberaEm ?? null, destino.nome),
        conversaId: destino.conversaId,
      });
    } catch (e) {
      toast.error(`Não foi possível enviar: ${mensagemDeErro(e)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!enviar.isPending) { onOpenChange(o); if (!o) { setBusca(''); setRecusa(null); } } }}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle>Enviar no WhatsApp</DialogTitle>
          <DialogDescription className="truncate">{arquivo?.nome}</DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-3">
          {recusa && (
            <div
              className={cn(
                'flex gap-3 rounded-lg border p-3',
                // 🔴 A repetição é NEUTRA. Ela não é um bloqueio: o envio deu certo, e a
                // mensagem é a confirmação que a pessoa procurava ao clicar de novo.
                recusa.tom === 'neutro'
                  ? 'border-border bg-muted/40'
                  : 'border-amber-500/40 bg-amber-500/10',
              )}
            >
              {recusa.tom === 'neutro'
                ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-card-foreground">{recusa.titulo}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{recusa.texto}</p>
                {recusa.verNaConversa && (
                  // Se a dúvida é "será que foi?", levar a pessoa até a mensagem resolve o
                  // problema dela. Mandá-la esperar dez minutos com a mesma dúvida, não.
                  <Button
                    variant="link" size="sm" className="mt-1 h-auto gap-1.5 p-0 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      // Sem a conversa aberta (contato que nunca recebeu mensagem), vai para a
                      // caixa de entrada mesmo — melhor que um parâmetro que ninguém lê.
                      navigate(
                        recusa.conversaId
                          ? `/whatsapp?conversaId=${encodeURIComponent(recusa.conversaId)}`
                          : '/whatsapp',
                      );
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Ver na conversa
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Falha de um lado não esconde o outro: com os contatos fora, as conversas ainda
              servem para mandar, e o contrário também. */}
          {(falhouContatos || falhouConversas) && (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {falhouContatos && falhouConversas
                ? 'Não foi possível carregar os destinos. Tente de novo em instantes.'
                : falhouContatos
                  ? 'Os contatos cadastrados não carregaram — só as conversas abertas estão na lista.'
                  : 'As conversas abertas não carregaram — só os contatos cadastrados estão na lista.'}
            </p>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, empresa ou telefone"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              disabled={enviar.isPending}
              autoFocus
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {isLoading ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            ) : filtrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {busca.trim()
                  ? 'Nada com WhatsApp bate com essa busca.'
                  : 'Nenhum contato com telefone e nenhuma conversa atribuída a você.'}
              </p>
            ) : (
              filtrados.map((d) => (
                <button
                  key={d.chave}
                  type="button"
                  disabled={enviar.isPending}
                  onClick={() => void mandar(d)}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-card-foreground">
                      {d.ehGrupo && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      {d.nome}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[d.detalhe, d.telefone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          {enviar.isPending && (
            <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
            </span>
          )}
          <Button variant="outline" disabled={enviar.isPending} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

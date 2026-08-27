import { useState, useMemo } from 'react';
import { Search, Send, Loader2, Users, AlertTriangle, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { filtrarDestinos, type DestinoWhatsApp } from '@/lib/destinos-whatsapp';
import { useDestinosWhatsApp } from '@/hooks/use-destinos-whatsapp';
import { useEnviarRota } from '@/hooks/use-enviar-rota';

/**
 * Escolher para quem mandar a rota do dia no WhatsApp.
 *
 * 🔴 A LISTA INCLUI AS CONVERSAS ABERTAS, e não só o cadastro. Medido em 27/08/2026: as 779
 * conversas de WhatsApp da MD estão TODAS sem contato do CRM vinculado. Uma lista feita só de
 * `contatos` deixaria de fora exatamente as pessoas com quem a equipe está conversando — e
 * mandar a rota do dia para o próprio grupo da equipe, que é o uso mais provável, seria
 * impossível sem antes cadastrar o grupo como se fosse cliente.
 *
 * A prévia do texto fica à vista antes de mandar. Rota é coisa que vai para cliente e para
 * equipe: ver o que sai é o que evita mandar o dia errado.
 */

interface EnviarRotaDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** O texto pronto, montado por `mensagemDaRota`. */
  mensagem: string;
  /** Quantas paradas a rota tem, só para o cabeçalho. */
  totalDeParadas: number;
}

export function EnviarRotaDialog({
  open,
  onOpenChange,
  mensagem,
  totalDeParadas,
}: EnviarRotaDialogProps) {
  const [busca, setBusca] = useState('');
  const { destinos, carregando, falhouContatos, falhouConversas } = useDestinosWhatsApp(open);
  const enviar = useEnviarRota();

  const filtrados = useMemo(() => filtrarDestinos(destinos, busca).slice(0, 60), [destinos, busca]);

  const mandar = async (destino: DestinoWhatsApp) => {
    try {
      await enviar.mutateAsync({ destino, mensagem });
      toast.success(`Rota enviada para ${destino.nome}.`);
      onOpenChange(false);
      setBusca('');
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível enviar a rota.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={enviar.isPending ? undefined : onOpenChange}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Enviar a rota por WhatsApp
          </DialogTitle>
          <DialogDescription>
            {totalDeParadas} {totalDeParadas === 1 ? 'parada' : 'paradas'}. Escolha para quem
            mandar.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {/* A prévia é o que evita mandar o dia errado — e o texto é curto o bastante para caber. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              O que vai ser enviado
            </p>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-card-foreground">
              {mensagem}
            </pre>
          </div>

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

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {carregando ? (
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

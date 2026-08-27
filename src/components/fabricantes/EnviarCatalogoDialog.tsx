import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Send, Loader2, MessageSquare, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeRecusa, type Recusa } from '@/lib/recusa-de-envio';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useEnviarCatalogo } from '@/hooks/use-enviar-catalogo';
import type { ArquivoDaFabrica } from '@/hooks/use-fabricante-arquivos';

/**
 * Escolher o contato e mandar o catálogo no WhatsApp dele.
 *
 * Só contatos do CRM: o envio cai na conversa daquele contato e fica no histórico, e o
 * telefone vem da ficha em vez de ser digitado — que é onde nasce o erro do nono dígito.
 *
 * 🔴 A RECUSA APARECE COMO INFORMAÇÃO, NÃO COMO ERRO VERMELHO. Vermelho faz a pessoa achar
 * que quebrou, e quem acha que quebrou tenta de novo — que é exatamente o comportamento que
 * as travas existem para evitar. Ver `src/lib/recusa-de-envio.ts`.
 */

interface ContatoParaEnvio {
  id: string;
  nome_contato: string | null;
  empresa: string | null;
  telefone: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arquivo: ArquivoDaFabrica | null;
}

export function EnviarCatalogoDialog({ open, onOpenChange, arquivo }: Props) {
  const navigate = useNavigate();
  const enviar = useEnviarCatalogo();
  const [busca, setBusca] = useState('');
  const [recusa, setRecusa] = useState<(Recusa & { telefone: string }) | null>(null);

  const { data: contatos, isLoading } = useQuery({
    queryKey: ['contatos-com-telefone'],
    enabled: open,
    queryFn: async (): Promise<ContatoParaEnvio[]> => {
      // Só quem TEM telefone. Medido em 26/08/2026: 942 de 1.092 contatos têm — mostrar os
      // outros 150 só para dar erro depois é desperdiçar o clique de quem está com o cliente
      // esperando. A RLS já escopa por empresa; não filtrar de novo aqui.
      const { data, error } = await supabase
        .from('contatos')
        .select('id, nome_contato, empresa, telefone')
        .not('telefone', 'is', null)
        .neq('telefone', '')
        .order('nome_contato')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ContatoParaEnvio[];
    },
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = contatos ?? [];
    if (!t) return lista.slice(0, 50);
    return lista
      .filter((c) =>
        [c.nome_contato, c.empresa, c.telefone].some((v) => (v ?? '').toLowerCase().includes(t)),
      )
      .slice(0, 50);
  }, [contatos, busca]);

  const mandar = async (c: ContatoParaEnvio) => {
    if (!arquivo) return;
    setRecusa(null);
    try {
      const r = await enviar.mutateAsync({
        arquivo,
        contatoId: c.id,
        telefone: c.telefone ?? '',
        nomeDoContato: c.nome_contato ?? '',
      });

      if (r.enviado) {
        toast.success(`Catálogo enviado para ${c.nome_contato ?? 'o contato'}.`);
        onOpenChange(false);
        return;
      }

      // Recusado por uma das travas: a tela mostra a mensagem certa, com o horário.
      setRecusa({
        ...mensagemDeRecusa(r.motivo!, r.liberaEm ?? null, c.nome_contato ?? ''),
        telefone: c.telefone ?? '',
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
                    onClick={() => { onOpenChange(false); navigate(`/whatsapp?telefone=${recusa.telefone}`); }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Ver na conversa
                  </Button>
                )}
              </div>
            </div>
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
                  ? 'Nenhum contato com telefone bate com essa busca.'
                  : 'Nenhum contato com telefone cadastrado.'}
              </p>
            ) : (
              filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={enviar.isPending}
                  onClick={() => void mandar(c)}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {c.nome_contato || 'Sem nome'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.empresa, c.telefone].filter(Boolean).join(' · ')}
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

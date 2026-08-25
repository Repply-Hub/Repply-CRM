import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useRegistrarRetorno } from '@/hooks/use-pauta';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  pedidoId: string | null;
  tituloDoNegocio: string;
}

/** Sugestão inicial: daqui a uma semana. É o intervalo mais comum de "me retorna depois". */
function sugestaoDeRetorno(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * "Retomar depois" — o que substituiu o simples adiar.
 *
 * Pede duas coisas, e as duas são o ponto: o MOTIVO (que vira registro visível para a
 * equipe no histórico do negócio) e a DATA DE RETORNO (quando vale a pena procurar de
 * novo). Tem cotação de hoje para compra do mês que vem; tem cliente que pediu uma semana
 * para olhar. Sem a data, "adiar" seria uma soneca cega.
 *
 * 🔴 O ATRITO É PROPOSITAL. Ao adiar, outro item entra no lugar — a pauta não encolhe. Com
 * 193 negócios candidatos, adiar de graça viraria esteira infinita e a tela morreria como
 * morreram as notificações. Ter de escrever uma frase e escolher uma data é o que separa
 * "decidi adiar isto" de "tirei da frente sem pensar".
 */
export function DialogoRetorno({ aberto, aoFechar, pedidoId, tituloDoNegocio }: Props) {
  const [motivo, setMotivo] = useState('');
  const [retorno, setRetorno] = useState<Date>(sugestaoDeRetorno);
  const registrar = useRegistrarRetorno();

  // Reabrir o diálogo para outro negócio tem de começar limpo: sem isto, o motivo do
  // anterior aparece escrito no próximo, e alguém salva sem reparar.
  useEffect(() => {
    if (aberto) {
      setMotivo('');
      setRetorno(sugestaoDeRetorno());
    }
  }, [aberto, pedidoId]);

  const motivoValido = motivo.trim().length >= 3;

  const salvar = async () => {
    if (!pedidoId || !motivoValido) return;
    try {
      await registrar.mutateAsync({
        pedidoId,
        motivo: motivo.trim(),
        // `format` lê o fuso LOCAL, e o calendário entrega meia-noite local: os dois falam a
        // mesma língua e não há nada a converter. Passar por `toISOString()` aqui recuaria
        // um dia a partir das 21h (CLAUDE.md §7.12).
        retornoEm: format(retorno, 'yyyy-MM-dd'),
      });
      toast.success(`Retorno marcado para ${format(retorno, "dd 'de' MMMM", { locale: ptBR })}`);
      aoFechar();
    } catch (e) {
      toast.error(
        e instanceof Error && e.message
          ? `Não foi possível registrar: ${e.message}`
          : 'Não foi possível registrar o retorno. Tente de novo.',
      );
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle>Retomar depois</DialogTitle>
          <DialogDescription className="line-clamp-2">{tituloDoNegocio}</DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="motivo-retorno">Por que sai da pauta hoje? *</Label>
            <Textarea
              id="motivo-retorno"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: o cliente vai decidir depois que a obra começar"
              rows={3}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Isso fica registrado no histórico do negócio, visível para a equipe.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Quando vale a pena procurar de novo? *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(retorno, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={retorno}
                  // `selected` NÃO decide o mês de abertura no react-day-picker v8 — só
                  // `month ?? defaultMonth ?? hoje` (CLAUDE.md §7.13).
                  defaultMonth={retorno}
                  onSelect={(d) => d && setRetorno(d)}
                  locale={ptBR}
                  disabled={{ before: new Date() }}
                  initialFocus
                  // Sem `captionLayout` a primitiva do projeto esconde o rótulo do mês e
                  // anula as setas: o calendário fica preso no mês atual, sem saída.
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear()}
                  toYear={new Date().getFullYear() + 3}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              O negócio volta para a sua pauta nesse dia, e a data entra no seu calendário.
            </p>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" onClick={aoFechar} disabled={registrar.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!motivoValido || registrar.isPending}>
            {registrar.isPending ? 'Registrando…' : 'Marcar retorno'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

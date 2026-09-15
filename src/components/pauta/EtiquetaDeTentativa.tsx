import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A ETIQUETA DE NEGÓCIO PERSEGUIDO — pedido de 15/09/2026.
 *
 * `tentativas` é o número de "Retomar depois" já registrados no negócio (linhas de
 * `historico_contatos` do tipo `retorno`, contadas na função de banco). Como o primeiro envio do
 * orçamento já conta como a 1ª tentativa, o texto é `tentativas + 1`: uma retomada é a "2ª".
 *
 * Substitui a etiqueta "Orçamento parado" — um cliente cobrado várias vezes não está "parado", e é
 * o que mais pede atenção. Fundo laranja da marca (`--primary`), mais forte que o vermelho de
 * parado. Devolve `null` quando não houve retomada, para quem monta poder desenhar o selo comum.
 */
export function EtiquetaDeTentativa({ tentativas, className }: { tentativas: number; className?: string }) {
  if (tentativas <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground',
        className,
      )}
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {tentativas + 1}ª tentativa
    </span>
  );
}

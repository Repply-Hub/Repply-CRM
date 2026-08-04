import { Inbox, Send, Tag, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { PastaEmail } from '@/hooks/use-email-pastas';

/** `null` = sem filtro de marcador (a aba Recebidos/Enviados manda). */
export type PastaSelecionada = string | null;

interface Props {
  pastas: PastaEmail[];
  carregando: boolean;
  selecionada: PastaSelecionada;
  onSelecionar: (pastaId: PastaSelecionada) => void;
  /** Quantas mensagens a aba atual tem sem filtro de marcador. */
  totalSemFiltro: number;
}

/**
 * Coluna de pastas e marcadores da caixa, no formato do Gmail/Bitrix.
 *
 * Mostra a organização que a pessoa JÁ TEM no provedor. As pastas de sistema
 * (Entrada, Enviados, Lixeira…) ficam de fora da lista de marcadores porque as
 * duas primeiras já são as abas da tela, e as outras não são sincronizadas —
 * oferecer um filtro que sempre volta vazio é pior do que não oferecer.
 *
 * Some inteira quando a caixa não tem marcador nenhum: uma coluna com um item
 * só rouba largura da lista de mensagens sem dar nada em troca.
 */
export function BarraPastas({
  pastas,
  carregando,
  selecionada,
  onSelecionar,
  totalSemFiltro,
}: Props) {
  const marcadores = pastas.filter((p) => !p.ehSistema);

  if (!carregando && marcadores.length === 0) return null;

  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/20 md:flex">
      <button
        onClick={() => onSelecionar(null)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
          selecionada === null
            ? 'bg-primary/10 font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <Inbox className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Todas</span>
        <span className="shrink-0 text-xs tabular-nums opacity-70">{totalSemFiltro}</span>
      </button>

      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Marcadores
      </p>

      {carregando && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando…
        </div>
      )}

      {marcadores.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelecionar(p.pastaId)}
          title={p.nome}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
            selecionada === p.pastaId
              ? 'bg-primary/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Tag className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{p.nome}</span>
          {/* A contagem vem do provedor e conta a caixa INTEIRA, não só o que
              já sincronizamos — por isso ela pode ser maior que a lista. É a
              mesma contagem que o Gmail mostra ao lado do marcador. */}
          {!!p.naoLidas && (
            <Badge
              variant="secondary"
              className="h-5 shrink-0 border-none bg-muted px-1.5 text-[11px] tabular-nums text-foreground"
            >
              {p.naoLidas}
            </Badge>
          )}
        </button>
      ))}
    </aside>
  );
}

import { MapPin, MapPinOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  TOGGLE_BUTTON_CLASS,
  TOGGLE_BUTTON_ACTIVE,
  TOGGLE_BUTTON_INACTIVE,
} from '@/lib/toggle-group-styles';
import type { MarcadorObra } from '@/hooks/use-marcadores-obras';
import { obraSemPontoNoMapa, type ObraComCoordenada } from '@/hooks/use-geocode-obras';

interface MapaObrasPainelProps {
  /** Obras já filtradas por busca + marcador e ordenadas (a mesma projeção do mapa). */
  obras: ObraComCoordenada[];
  isLoading: boolean;
  marcadores: MarcadorObra[] | undefined;
  /** 'todos' ou o id de um marcador — é o MESMO estado do FilterButton da página,
   *  de propósito: chip e popover ficam sincronizados sem estado duplicado. */
  marcadorFilter: string;
  onMarcadorFilter: (id: string) => void;
  /** Contagem por marcador calculada ANTES do filtro de marcador (reflete só a busca),
   *  senão escolher um chip zeraria os números de todos os outros. */
  contagemPorMarcador: Map<string, number>;
  totalBusca: number;
  /**
   * Quantas obras o serviço de endereço NÃO conseguiu localizar.
   *
   * 🔴 São justamente as que NÃO aparecem no mapa — e por isso quem só olha o mapa nunca as
   * encontra para corrigir. O filtro existe para dar um caminho até elas. Medido em 27/08/2026:
   * 8 das 82 obras da MD estão assim.
   */
  totalSemEndereco: number;
  soSemEndereco: boolean;
  onSoSemEndereco: (ligado: boolean) => void;
  selectedObraId: string | null;
  onSelectObra: (id: string) => void;
}

export function MapaObrasPainel({
  obras,
  isLoading,
  marcadores,
  marcadorFilter,
  onMarcadorFilter,
  contagemPorMarcador,
  totalBusca,
  totalSemEndereco,
  soSemEndereco,
  onSoSemEndereco,
  selectedObraId,
  onSelectObra,
}: MapaObrasPainelProps) {
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap gap-1.5 p-3 border-b border-border">
        <button
          type="button"
          className={cn(
            TOGGLE_BUTTON_CLASS,
            'h-7 px-2.5 text-xs',
            marcadorFilter === 'todos' ? TOGGLE_BUTTON_ACTIVE : TOGGLE_BUTTON_INACTIVE
          )}
          onClick={() => onMarcadorFilter('todos')}
        >
          Todas
          <span className="tabular-nums opacity-80">{totalBusca}</span>
        </button>
        {(marcadores ?? []).map((m) => (
          <button
            key={m.id}
            type="button"
            className={cn(
              TOGGLE_BUTTON_CLASS,
              'h-7 px-2.5 text-xs',
              marcadorFilter === m.id ? TOGGLE_BUTTON_ACTIVE : TOGGLE_BUTTON_INACTIVE
            )}
            onClick={() => onMarcadorFilter(marcadorFilter === m.id ? 'todos' : m.id)}
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', `bg-${m.cor}`)} />
            {m.nome}
            <span className="tabular-nums opacity-80">{contagemPorMarcador.get(m.id) ?? 0}</span>
          </button>
        ))}

        {/* Só aparece quando há alguma: um filtro que sempre devolve zero é ruído na barra. */}
        {totalSemEndereco > 0 && (
          <button
            type="button"
            className={cn(
              TOGGLE_BUTTON_CLASS,
              'h-7 px-2.5 text-xs',
              soSemEndereco ? TOGGLE_BUTTON_ACTIVE : TOGGLE_BUTTON_INACTIVE,
            )}
            onClick={() => onSoSemEndereco(!soSemEndereco)}
            title="Obras que o serviço de endereço não conseguiu localizar — elas não aparecem no mapa"
          >
            <MapPinOff className="h-3 w-3 shrink-0" />
            Sem endereço
            <span className="tabular-nums opacity-80">{totalSemEndereco}</span>
          </button>
        )}
      </div>

      {/* div com overflow em vez do <ScrollArea> do Radix: o Viewport dele embrulha o
          conteúdo num display:table, que cresce até a largura do MAIOR texto — endereço
          comprido alargava todas as linhas e o truncate nunca cortava nada. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : obras.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">
            Nenhuma obra encontrada com esses filtros.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {obras.map((obra) => {
              const selecionada = obra.id === selectedObraId;
              const semLocalizacao = obraSemPontoNoMapa(obra);
              return (
                <button
                  key={obra.id}
                  type="button"
                  onClick={() => onSelectObra(obra.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 space-y-1 transition-colors hover:bg-accent/50',
                    selecionada && 'bg-accent/70 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {obra.marcador_nome ? (
                      <Badge className={cn('text-[10px] text-white border-none', `bg-${obra.marcador_cor}`)}>
                        {obra.marcador_nome}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    {semLocalizacao && (
                      <span
                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                        title="O endereço desta obra não foi encontrado no mapa. Edite o endereço para tentar de novo."
                      >
                        <MapPinOff className="h-3 w-3" />
                        sem ponto no mapa
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm leading-snug truncate">{obra.nome_obra}</p>
                  {obra.cliente_empresa && (
                    <p className="text-xs text-muted-foreground truncate">{obra.cliente_empresa}</p>
                  )}
                  {obra.endereco_entrega && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{obra.endereco_entrega}</span>
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

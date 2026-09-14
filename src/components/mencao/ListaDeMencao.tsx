import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TODOS = '__todos__';

export interface SugestaoDeMencao {
  id: string;
  rotulo: string;
  detalhe?: string;
  avatar_url?: string | null;
}

interface Props {
  consulta: string;
  sugestoes: SugestaoDeMencao[];
  ativa: number;
  onEscolher: (s: SugestaoDeMencao) => void;
  mensagemVazia: string;
  className?: string;
}

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/**
 * A lista que abre ao digitar @. A "barra de busca" do topo MOSTRA o que foi digitado
 * depois do @ — não é um segundo campo: o foco fica no campo de mensagem o tempo todo,
 * e é lá que a pessoa continua digitando (pedido do dono do produto: "uma lista com
 * barra de busca para clicar no nome").
 */
export function ListaDeMencao({ consulta, sugestoes, ativa, onEscolher, mensagemVazia, className }: Props) {
  return (
    <div
      className={cn(
        'w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn('truncate', consulta ? 'text-foreground' : 'text-muted-foreground')}>
          {consulta || 'Digite um nome'}
        </span>
      </div>
      <div role="listbox" aria-label="Mencionar alguém" className="max-h-56 overflow-y-auto p-1">
        {sugestoes.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{mensagemVazia}</p>
        ) : (
          sugestoes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === ativa}
              // mousedown, e não click: o click tiraria o foco do campo antes de escolher.
              onMouseDown={(e) => {
                e.preventDefault();
                onEscolher(s);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                i === ativa ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {s.avatar_url ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" /> : s.id === TODOS ? '@' : iniciais(s.rotulo)}
              </span>
              <span className={cn('truncate', s.id === TODOS && 'font-medium')}>{s.rotulo}</span>
              {s.detalhe && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{s.detalhe}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

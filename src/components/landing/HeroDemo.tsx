import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Mini-pipeline animado do hero: cards de negócio avançam de etapa sozinhos,
 * como aconteceria no Kanban real.
 *
 * Feito com estado + intervalo em vez de biblioteca de animação — o projeto não
 * tem framer-motion, e a transição de posição aqui é só o card remontando na
 * coluna seguinte com `animate-lp-card-entra`. As cores das etapas vêm dos
 * tokens `--kanban-*` que o app já usa no pipeline de verdade.
 */

const COLUNAS = [
  { id: 'novo', titulo: 'Novo', cor: 'bg-kanban-new' },
  { id: 'orcamento', titulo: 'Orçamento', cor: 'bg-kanban-budget' },
  { id: 'enviado', titulo: 'Enviado', cor: 'bg-kanban-sent' },
  { id: 'fechado', titulo: 'Fechado', cor: 'bg-kanban-closed' },
] as const;

interface Negocio {
  id: number;
  titulo: string;
  valor: string;
  etapa: number;
}

const NEGOCIOS_INICIAIS: Negocio[] = [
  { id: 1, titulo: 'Residencial Aurora', valor: 'R$ 84.500', etapa: 2 },
  { id: 2, titulo: 'Condomínio Vila Nova', valor: 'R$ 132.000', etapa: 1 },
  { id: 3, titulo: 'Edifício Marês', valor: 'R$ 47.900', etapa: 0 },
  { id: 4, titulo: 'Obra Ponta Negra', valor: 'R$ 219.300', etapa: 1 },
];

const INTERVALO_MS = 2200;

export function HeroDemo() {
  const [negocios, setNegocios] = useState<Negocio[]>(NEGOCIOS_INICIAIS);
  const [movido, setMovido] = useState<number | null>(null);

  useEffect(() => {
    // Respeita quem pediu menos movimento no sistema: a demo fica estática.
    const prefereMenosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefereMenosMovimento) return;

    let passo = 0;
    const timer = setInterval(() => {
      setNegocios((atual) => {
        // Avança um card por vez, em rodízio; ao chegar em "Fechado", ele
        // reinicia em "Novo" para o loop nunca esvaziar o quadro.
        const indice = passo % atual.length;
        passo += 1;
        const alvo = atual[indice];
        setMovido(alvo.id);
        return atual.map((n, i) =>
          i === indice ? { ...n, etapa: n.etapa >= COLUNAS.length - 1 ? 0 : n.etapa + 1 } : n,
        );
      });
    }, INTERVALO_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden
      className="rounded-xl border border-border bg-lp-ink-elevado p-3 shadow-card-hover sm:p-4"
    >
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 text-[11px] font-medium text-muted-foreground">Pipeline de vendas</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {COLUNAS.map((coluna, indiceColuna) => {
          const daColuna = negocios.filter((n) => n.etapa === indiceColuna);
          return (
            <div key={coluna.id} className="min-w-0">
              <div className="mb-2 flex items-center gap-1.5 px-0.5">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', coluna.cor)} />
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {coluna.titulo}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
                  {daColuna.length}
                </span>
              </div>

              <div className="flex min-h-[8.5rem] flex-col gap-1.5 rounded-lg bg-lp-ink/60 p-1.5">
                {daColuna.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'rounded-md border border-border bg-card p-2 shadow-card',
                      movido === n.id && 'animate-lp-card-entra',
                    )}
                  >
                    <p className="truncate text-[10px] font-semibold leading-tight text-card-foreground">
                      {n.titulo}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-medium tabular-nums text-primary">
                      {n.valor}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

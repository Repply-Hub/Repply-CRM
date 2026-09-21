import { VITRINE_LANCAMENTO } from '@/lib/planos';

/**
 * O bloco de preço da condição de lançamento, mostrado na landing (`PrecosSection`) e no paywall
 * (`Assinar`). Um só componente para as duas telas nunca divergirem — os valores vêm de
 * `VITRINE_LANCAMENTO` (`lib/planos.ts`), a fonte única.
 *
 * O desenho (decisão do Lucas, 21/09/2026): duas formas de pagar o MESMO plano, lado a lado. O
 * parcelado num card neutro (a opção comum) e o à vista no Pix num card ESCURO com brilho laranja
 * — o mesmo tratamento do herói da landing (`bg-lp-ink` + brilhos `bg-primary` borrados) —, com a
 * etiqueta "economize R$ 503". É onde o olho bate. Os benefícios e o botão ficam na tela que usa
 * este bloco, não aqui.
 *
 * `tamanho`: 'grande' na landing, 'medio' no cartão estreito do /assinar (aí os dois cards
 * empilham em vez de ficar lado a lado).
 */
export function PrecoLancamento({ tamanho = 'grande' }: { tamanho?: 'grande' | 'medio' }) {
  const grande = tamanho === 'grande';
  const valor = grande ? 'text-4xl' : 'text-3xl';

  return (
    <div className={`mx-auto grid gap-4 ${grande ? 'max-w-xl sm:grid-cols-2' : 'max-w-sm grid-cols-1'}`}>
      {/* Parcelado — a opção comum, card neutro */}
      <div className="rounded-2xl border border-border bg-card p-5 text-left">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Parcelado</div>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">{VITRINE_LANCAMENTO.parcelas}x de</span>
          <span className={`font-display font-bold tabular-nums tracking-tight text-foreground ${valor}`}>
            {VITRINE_LANCAMENTO.parcelaMensal}
          </span>
        </p>
        <div className="mt-2 text-xs text-muted-foreground">por mês, no cartão</div>
      </div>

      {/* À vista no Pix — o destaque: card escuro com brilho laranja, como o herói da landing */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-lp-ink p-5 text-left">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* Brilho laranja discreto, como o herói da landing (lá é opacidade ~0.05–0.07): o laranja
              é um respiro sobre o preto, não uma cor dominante. A receita do herói usa desfoque
              64px/blur-3xl, mas num card de ~280px esse desfoque grande dilui a cor a ponto de sumir
              (e o `overflow-hidden` corta a maior parte da mancha). Por isso aqui o desfoque é menor
              (40px/blur-2xl), o que CONCENTRA a cor e deixa o brilho perceptível mesmo com opacidade
              baixa — o jeito de manter o detalhe sutil sem ele desaparecer. */}
          <div className="absolute -top-[35%] right-[-15%] h-[95%] w-[85%] rounded-full bg-primary/[0.20] blur-2xl" />
          <div className="absolute bottom-[-40%] left-[-20%] h-[85%] w-[65%] rounded-full bg-primary/[0.11] blur-2xl" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-primary">À vista no Pix</span>
            <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
              economize {VITRINE_LANCAMENTO.economia}
            </span>
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className={`font-display font-bold tabular-nums tracking-tight text-white ${valor}`}>
              {VITRINE_LANCAMENTO.aVista}
            </span>
            <span className="text-sm text-white/60">/ano</span>
          </p>
          <div className="mt-2 text-xs text-white/60">pagamento único — a melhor conta</div>
        </div>
      </div>
    </div>
  );
}

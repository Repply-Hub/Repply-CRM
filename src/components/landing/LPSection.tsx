import { cn } from '@/lib/utils';

type Tom = 'ink' | 'elevado' | 'creme' | 'laranja';

const TONS: Record<Tom, string> = {
  ink: 'bg-lp-ink text-foreground',
  elevado: 'bg-lp-ink-elevado text-foreground',
  // A classe `light` devolve os tokens claros a esta subárvore, mesmo estando
  // dentro do wrapper `.dark` da landing — por isso os componentes shadcn usados
  // aqui dentro (Button, Card) saem com as cores certas sem nenhum override.
  creme: 'light bg-lp-cream text-foreground',
  laranja: 'bg-primary text-lp-ink',
};

interface LPSectionProps {
  id?: string;
  tom?: Tom;
  className?: string;
  children: React.ReactNode;
}

export function LPSection({ id, tom = 'ink', className, children }: LPSectionProps) {
  return (
    <section id={id} className={cn('relative', TONS[tom], className)}>
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24 lg:py-28">{children}</div>
    </section>
  );
}

/**
 * Rótulo pequeno em caixa alta que abre cada seção, precedido pelo ponto laranja
 * do símbolo "r." da marca.
 */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary',
        className,
      )}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </p>
  );
}

/**
 * Cabeçalho padrão das seções: eyebrow, título e texto de apoio.
 * Alinhado à esquerda por padrão — centralizar tudo achata a hierarquia e faz a
 * página parecer um folheto em vez de um argumento.
 */
export function HeaderSecao({
  eyebrow,
  titulo,
  apoio,
  centralizado = false,
  className,
}: {
  eyebrow: string;
  titulo: React.ReactNode;
  apoio?: React.ReactNode;
  centralizado?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('mb-14', centralizado ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl', className)}>
      <Eyebrow className={centralizado ? 'justify-center' : undefined}>{eyebrow}</Eyebrow>
      <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
        {titulo}
      </h2>
      {apoio && (
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          {apoio}
        </p>
      )}
    </div>
  );
}

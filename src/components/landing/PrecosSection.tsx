import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarPrecoBRL } from '@/lib/planos';
import { usePlanos } from '@/hooks/use-planos';
import { Eyebrow, LPSection } from './LPSection';

export function PrecosSection() {
  // Preço vem do banco, com a constante como reserva — uma página de vendas sem
  // preço é pior que um preço vindo de constante.
  const { planos } = usePlanos();
  const plano = planos[0];

  return (
    <LPSection id="precos" tom="creme">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow className="justify-center">Preços</Eyebrow>
        <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
          Um plano. O time inteiro dentro.
        </h2>
        <p className="mx-auto mt-5 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          Sem cobrança por usuário, sem taxa de implantação e sem fidelidade. A assinatura é da empresa —
          quantos vendedores entrarem, entraram.
        </p>

        {plano.selo && (
          <span className="mt-10 inline-flex items-center rounded-full bg-primary px-3.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-lp-ink">
            {plano.selo}
          </span>
        )}

        <p className="mt-5 flex items-baseline justify-center gap-2">
          <span className="font-display text-6xl font-bold tabular-nums tracking-tight text-foreground sm:text-7xl">
            {formatarPrecoBRL(plano.precoMensal)}
          </span>
          <span className="text-lg text-muted-foreground">/mês</span>
        </p>

        <ul className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-5 gap-y-2.5">
          {plano.beneficios.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Button
            asChild
            size="lg"
            className="group h-12 rounded-full px-8 text-base font-semibold shadow-brand"
          >
            <Link to={`/cadastro?tipo=empresa&plano=${plano.slug}`}>
              Criar conta da empresa
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Valor de lançamento, mantido enquanto a assinatura ficar ativa. Cobrança mensal no cartão.
          </p>
        </div>
      </div>
    </LPSection>
  );
}

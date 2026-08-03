import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarPrecoBRL, rotuloIntervalo } from '@/lib/planos';
import { usePlanos } from '@/hooks/use-planos';

export function CtaFinalSection() {
  const { planos } = usePlanos();
  const plano = planos[0];

  return (
    <section className="relative overflow-hidden bg-primary">
      {/* Malha decorativa, com máscara radial para sumir nas bordas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#0A0A0A 1px, transparent 1px), linear-gradient(90deg, #0A0A0A 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(circle at 30% 50%, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle at 30% 50%, black 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_auto] lg:gap-14">
        <div>
          {/* Todo o texto sobre o laranja usa o preto da marca: 6.35:1 de
              contraste, contra 3.12:1 se fosse branco. */}
          <span className="mb-4 inline-flex items-center rounded-full bg-lp-ink px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-primary">
            Comece agora
          </span>
          <h2 className="max-w-2xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-lp-ink sm:text-4xl">
            Pronto para tirar a carteira do WhatsApp?
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-lp-ink/80">
            Crie a conta da empresa e chame seu time pelo código.{' '}
            {formatarPrecoBRL(plano.preco)}
            {rotuloIntervalo(plano.intervalo)}, usuários ilimitados, cancele quando quiser.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 lg:items-end">
          <Button
            asChild
            size="lg"
            className="group h-12 rounded-full bg-lp-ink px-7 text-base font-semibold text-foreground hover:bg-lp-ink/90"
          >
            <Link to="/cadastro?tipo=empresa">
              Criar conta da empresa
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Link
            to="/cadastro?tipo=funcionario"
            className="text-[13px] font-medium text-lp-ink/80 underline-offset-2 hover:text-lp-ink hover:underline"
          >
            Sua empresa já usa o Repply? Entre com o código →
          </Link>
        </div>
      </div>
    </section>
  );
}

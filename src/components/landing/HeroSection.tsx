import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroDemo } from './HeroDemo';

const GARANTIAS = ['WhatsApp e e-mail integrados', 'Usuários ilimitados', 'Importa sua planilha atual'];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-lp-ink">
      {/* Brilho de marca ao fundo, no mesmo espírito do painel do login. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[20%] right-[5%] h-[60%] w-[55%] rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="absolute bottom-[-25%] left-[-5%] h-[55%] w-[45%] rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-28 lg:pt-20">
        <div className="animate-lp-surgir">
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/[0.07] py-1.5 pl-2 pr-4">
            <span className="rounded-md bg-primary px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-lp-ink">
              CRM
            </span>
            <span className="text-[13px] font-medium text-foreground">
              Para quem vende para obra
            </span>
          </div>

          <h1 className="font-display text-[2.5rem] font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Negócio que entra
            <br />
            no WhatsApp não
            <br />
            <span className="text-primary">se perde</span> mais.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            O pedido que chegou por mensagem vira negócio no funil, com dono, prazo e histórico. Cliente,
            obra e fabricante no mesmo lugar — e o gestor enxergando tudo sem precisar
            pedir relatório.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="group h-12 rounded-full px-7 text-base font-semibold shadow-brand"
            >
              <Link to="/cadastro?tipo=empresa">
                Criar conta da empresa
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-border px-7 text-base font-medium text-foreground hover:bg-secondary"
            >
              <Link to="/cadastro?tipo=funcionario">Entrar com código da empresa</Link>
            </Button>
          </div>

          <p className="mt-3 max-w-md text-xs text-muted-foreground">
            Seu time entra com o código da empresa e não paga nada — a assinatura é uma só.
          </p>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
            {GARANTIAS.map((g) => (
              <li key={g} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-2.5 w-2.5 text-primary" strokeWidth={3} />
                </span>
                {g}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 animate-lp-surgir [animation-delay:120ms]">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

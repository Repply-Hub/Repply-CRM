import { usePaginaRolavel } from '@/hooks/use-pagina-rolavel';
import { LandingNav } from '@/components/landing/LandingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { AntesAgoraSection } from '@/components/landing/AntesAgoraSection';
import { ComoFuncionaSection } from '@/components/landing/ComoFuncionaSection';
import { RecursosSection } from '@/components/landing/RecursosSection';
import { PrecosSection } from '@/components/landing/PrecosSection';
import { CtaFinalSection } from '@/components/landing/CtaFinalSection';
import { LandingFooter } from '@/components/landing/LandingFooter';

/**
 * Landing page pública.
 *
 * A página é sempre escura, independente do tema que o usuário escolheu no app.
 * Isso é feito com a classe `dark` no wrapper, que redeclara os tokens de cor só
 * nesta subárvore — por isso os componentes shadcn usados aqui saem certos sem
 * nenhum override. Regra que vale para toda a pasta `components/landing`: usar
 * classes de token (bg-card, text-muted-foreground) e nunca variantes `dark:`,
 * porque o Tailwind as compila como `.dark .classe`, um seletor de ancestral —
 * a própria div abaixo não responderia às suas próprias variantes.
 *
 * As seções creme reativam o tema claro com `light` (ver LPSection).
 */
export default function Landing() {
  usePaginaRolavel();

  return (
    <div className="dark repply-landing min-h-screen bg-lp-ink font-sans text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-lp-ink"
      >
        Pular para o conteúdo
      </a>

      <LandingNav />

      <main id="conteudo">
        <HeroSection />
        <AntesAgoraSection />
        <ComoFuncionaSection />
        <RecursosSection />
        <PrecosSection />
        <CtaFinalSection />
      </main>

      <LandingFooter />
    </div>
  );
}

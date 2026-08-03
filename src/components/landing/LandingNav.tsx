import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
// O logo-dark é o badge de fundo laranja — o mesmo que o painel escuro do login
// usa. O logo-light tem fundo #0A0A0A e desapareceria contra o fundo da landing.
import logoRepply from '@/assets/logo-dark.svg';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ANCORAS = [
  { href: '#problema', label: 'O cenário' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#precos', label: 'Preços' },
];

/**
 * Navegação fixa da landing, com a barra de progresso de scroll da marca.
 *
 * O progresso é lido de `document.documentElement` (e não de um container), o que
 * só funciona porque a página roda com a classe `pagina-rolavel` — ver
 * `usePaginaRolavel`.
 */
export function LandingNav() {
  const [progresso, setProgresso] = useState(0);
  const [compacta, setCompacta] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    const aoRolar = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgresso(total > 0 ? (el.scrollTop / total) * 100 : 0);
      setCompacta(el.scrollTop > 12);
    };

    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  return (
    <header className="sticky top-0 z-50">
      <div
        className={cn(
          'transition-colors duration-300',
          compacta ? 'border-b border-border bg-lp-ink/85 backdrop-blur-md' : 'bg-transparent',
        )}
      >
        <nav
          aria-label="Navegação principal"
          className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8"
        >
          <Link to="/" className="flex items-center gap-2.5" aria-label="Repply — início">
            <img src={logoRepply} alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              repply
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {ANCORAS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {a.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full px-5 font-semibold shadow-brand">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-expanded={menuAberto}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            className="flex h-10 w-10 items-center justify-center rounded-md text-foreground md:hidden"
          >
            {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {menuAberto && (
          <div className="border-t border-border bg-lp-ink px-5 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {ANCORAS.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  onClick={() => setMenuAberto(false)}
                  className="rounded-md px-2 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {a.label}
                </a>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Entrar</Link>
              </Button>
              <Button asChild className="w-full font-semibold">
                <Link to="/cadastro">Criar conta</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        aria-hidden
        className="h-0.5 origin-left bg-primary transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progresso / 100})` }}
      />
    </header>
  );
}

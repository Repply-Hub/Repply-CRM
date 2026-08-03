import { Link } from 'react-router-dom';
import logoRepply from '@/assets/logo-dark.svg';

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-lp-ink">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <img src={logoRepply} alt="" className="h-9 w-9 object-contain" />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">
                repply
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              CRM comercial para representantes, distribuidores e equipes de venda do mercado da
              construção e do imobiliário.
            </p>
          </div>

          <nav aria-label="Rodapé" className="flex gap-14">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Produto
              </p>
              <ul className="space-y-2.5">
                <li>
                  <a href="#recursos" className="text-sm text-muted-foreground hover:text-foreground">
                    Recursos
                  </a>
                </li>
                <li>
                  <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground">
                    Preços
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Conta
              </p>
              <ul className="space-y-2.5">
                <li>
                  <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                    Entrar
                  </Link>
                </li>
                <li>
                  <Link to="/cadastro" className="text-sm text-muted-foreground hover:text-foreground">
                    Criar conta
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Repply · Ecossistema Repply
          </p>
          <p className="text-xs text-muted-foreground">Grupo MD · Natal/RN</p>
        </div>
      </div>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoRepply from '@/assets/logo-dark.svg';
import { Logo } from '@/components/layout/Logo';

interface AuthShellProps {
  /** Título grande, só no desktop. */
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}

const NUMEROS = [
  { valor: '100%', rotulo: 'Digital' },
  { valor: '5x', rotulo: 'Mais rápido' },
  { valor: '360°', rotulo: 'Visão completa' },
];

/**
 * Moldura das telas de entrada (login, cadastro): painel de marca à esquerda,
 * formulário à direita. Estava inline em Login.tsx e passou a ser compartilhada
 * com a página de cadastro.
 *
 * O painel escuro é sempre escuro, independente do tema — por isso usa o mesmo
 * import direto do logo laranja que o login já usava, e não o componente Logo,
 * que troca de arte conforme o tema.
 */
export function AuthShell({ titulo, subtitulo, children }: AuthShellProps) {
  return (
    // h-screen e não min-h-screen: com min-h o wrapper cresce junto com o
    // formulário, a coluna da direita nunca fica menor que o próprio conteúdo e
    // o overflow-y-auto dela não tem o que rolar — em tela baixa o botão de
    // enviar ficava fora da viewport, sem alcance, porque html/body são
    // overflow:hidden. Com altura fixa, a coluna rola de verdade.
    <div className="h-screen flex">
      <div className="hidden lg:flex lg:w-[45%] bg-lp-ink relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-[-10%] left-[10%] w-[60%] h-[60%] rounded-full bg-primary/[0.07] blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="flex items-center gap-3 w-fit">
            <img src={logoRepply} alt="" className="h-14 w-14 object-contain" />
            <span className="font-display text-2xl font-bold tracking-tight text-white">Repply</span>
          </Link>

          <div className="space-y-6">
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white">
              o CRM que fala
              <br />
              <span className="text-primary">a sua língua.</span>
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-white/60">
              Controle total da carteira, foco no que importa, profissionalismo em cada interação. A
              sensação de estar no comando.
            </p>

            <div className="flex gap-8 pt-4">
              {NUMEROS.map((n) => (
                <div key={n.rotulo}>
                  <p className="font-display text-2xl font-bold text-white">{n.valor}</p>
                  <p className="text-xs text-white/40">{n.rotulo}</p>
                </div>
              ))}
            </div>
          </div>

          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
          >
            <ArrowLeft className="h-3 w-3" />
            Voltar para o site
          </Link>
        </div>
      </div>

      {/* overflow-y-auto é obrigatório: com html/body em overflow:hidden, sem ele
          o formulário fica cortado em tela baixa ou com o teclado aberto. */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="w-full max-w-sm py-6">
            <div className="mb-6 flex flex-col items-center lg:hidden">
              <Link to="/" className="flex flex-col items-center">
                <Logo className="mb-2 mt-4 h-16 w-16" />
              </Link>
            </div>

            {/* O título aparece em todas as larguras: escondê-lo no celular
                deixava a página sem nenhum heading e, pior, sem o texto que
                distingue "criar empresa" de "entrar com código". */}
            <div className="mb-8 text-center lg:text-left">
              <h2 className="font-display text-xl font-bold text-foreground lg:text-2xl">{titulo}</h2>
              {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

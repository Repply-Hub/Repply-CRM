import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CreditCard, Timer } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { motivoDoBloqueio, podeGerenciarAssinatura, type MotivoDoBloqueio } from '@/lib/plano-gate';
import { cn } from '@/lib/utils';

/**
 * A faixa que explica, no topo do app, por que a empresa parou de conseguir escrever.
 *
 * 🔴 ELA EXISTE PORQUE O BLOQUEIO ERA MUDO. Até 30/08/2026, empresa com plano inativo
 * simplesmente via o salvamento falhar — sem faixa, sem tela, sem uma palavra. A pessoa
 * descobria por tentativa e erro, e ligava para o suporte perguntando o que houve.
 *
 * 🔴 TRÊS TEXTOS, NÃO UM. `motivoDoBloqueio` separa quem deve de quem não deve, e a
 * diferença não é cosmética: dizer "regularize seu pagamento" para quem nunca pagou um
 * centavo é acusar de calote quem não deve nada. Foi exatamente o erro que o painel de admin
 * cometeu até 29/08/2026.
 */

interface Aparencia {
  /** Classes do fundo e da borda. Tokens da marca, nunca cor solta (CLAUDE.md §8). */
  caixa: string;
  icone: typeof AlertTriangle;
  titulo: string;
  /** O que a pessoa faz a respeito. Só aparece para quem pode mexer na assinatura. */
  acao: string;
}

/**
 * ⚠️ O desenho aprovado pedia AZUL para o caso do teste vencido. A marca não tem azul
 * (`src/index.css` traz laranja, âmbar, verde e vermelho), e inventar um sexto tom para uma
 * faixa seria furar o sistema de cores por um caso só.
 *
 * A separação que importa está mantida, e ficou mais honesta: ÂMBAR para quem não deve nada
 * (teste acabou, assinatura nunca ativada) e VERMELHO para quem tem pendência de verdade. O
 * texto faz o resto do trabalho.
 */
const APARENCIA: Record<MotivoDoBloqueio, Aparencia> = {
  teste_venceu: {
    caixa: 'border-warning/40 bg-warning/10',
    icone: Timer,
    titulo: 'Seu período de teste terminou',
    acao: 'Ver planos',
  },
  nunca_ativou: {
    caixa: 'border-warning/40 bg-warning/10',
    icone: CreditCard,
    titulo: 'Sua assinatura ainda não está ativa',
    acao: 'Ativar assinatura',
  },
  pagamento_parou: {
    caixa: 'border-destructive/40 bg-destructive/10',
    icone: AlertTriangle,
    titulo: 'Seu pagamento está pendente',
    acao: 'Regularizar',
  },
};

/** "terminou em 12 de ago" — só quando a data existe e é legível. */
function desde(quando: Date | null): string {
  if (!quando || Number.isNaN(quando.getTime())) return '';
  return ` em ${quando.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
}

/**
 * Publica a altura da faixa em `--altura-faixa-cobranca`, para quem se posiciona por cima do
 * conteudo saber que o topo desceu.
 *
 * 🔴 QUEM PRECISA DISSO HOJE: o aviso de salvamento (`ui/sonner.tsx`), que tem a altura do
 * cabecalho cravada a mao. Sem esta medida ele pousa EM CIMA do cabecalho assim que a faixa
 * aparece — e e uma quebra silenciosa, que so se ve quando alguem salva alguma coisa.
 *
 * Medida em vez de constante porque a faixa QUEBRA EM DUAS LINHAS em tela estreita: um valor
 * fixo acertaria no desktop e erraria no celular, que e onde o espaco ja e escasso.
 */
function useAlturaPublicada(ref: React.RefObject<HTMLElement>, ativa: boolean) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const elemento = ref.current;

    // Limpar importa em todos os caminhos: a empresa pode regularizar sem recarregar a
    // pagina, e a variavel orfa deixaria todo aviso do sistema deslocado.
    const limpar = () => raiz.style.removeProperty('--altura-faixa-cobranca');

    if (!ativa || !elemento) {
      limpar();
      return;
    }

    const medir = () =>
      raiz.style.setProperty('--altura-faixa-cobranca', `${elemento.offsetHeight}px`);
    medir();

    // 🔴 SEM ResizeObserver, MEDE UMA VEZ E SEGUE — nunca deixa de desenhar a faixa.
    //
    // Ele existe em todo navegador desde 2020, então em produção o `if` nunca é falso. Mas
    // esta faixa fica no TOPO DE TODAS AS TELAS: se ela lançar, o app inteiro cai junto, e
    // cairia exatamente para quem já está com problema de pagamento — o pior momento
    // possível para uma tela branca.
    //
    // Descoberto ao escrever o teste (o ambiente de teste não tem ResizeObserver). Um
    // remendo no teste esconderia a fragilidade em vez de tirá-la.
    //
    // 🔴 A LIMPEZA VEM JUNTO, e não é detalhe: sair com `return` seco deixaria a variável
    // grudada depois que a empresa regularizasse, e todo aviso do sistema ficaria deslocado
    // para baixo para sempre, sem ninguém saber por quê.
    if (typeof ResizeObserver === 'undefined') return limpar;

    const observador = new ResizeObserver(medir);
    observador.observe(elemento);

    return () => {
      observador.disconnect();
      limpar();
    };
  }, [ref, ativa]);
}

export function FaixaDeCobranca() {
  const { profile, session } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  const bloqueio = motivoDoBloqueio(profile);
  useAlturaPublicada(ref, !!bloqueio);
  // Empresa em dia, perfil ainda carregando, admin global: nada a dizer. Devolver `null` e
  // não uma caixa vazia — faixa de altura zero ainda empurraria o layout.
  if (!bloqueio) return null;

  const { caixa, icone: Icone, titulo, acao } = APARENCIA[bloqueio.motivo];
  const podeResolver = podeGerenciarAssinatura(profile, session);

  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 text-sm sm:px-6',
        caixa,
      )}
    >
      <Icone className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden />

      <span className="font-medium text-foreground">
        {titulo}
        {bloqueio.motivo === 'teste_venceu' && desde(bloqueio.venceuEm)}.
      </span>

      {/* 🔴 DIZER O QUE AINDA FUNCIONA, e não só o que parou. Sem esta frase a pessoa
          conclui que perdeu os dados — que é o medo real de quem vê um aviso vermelho no
          topo do sistema onde está a carteira dela. */}
      <span className="text-muted-foreground">
        Você continua vendo e exportando tudo. Criar e editar ficam indisponíveis.
      </span>

      {podeResolver ? (
        <Link
          to="/assinar"
          className="ml-auto shrink-0 rounded-md border border-foreground/20 bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {acao}
        </Link>
      ) : (
        // Quem não responde pela assinatura não recebe um botão que vai recusá-lo lá na
        // frente — recebe a única coisa que resolve o problema dele.
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          Fale com o gestor da sua empresa.
        </span>
      )}
    </div>
  );
}

import { HelpCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useBotaoAjudaVisivel } from '@/hooks/use-botao-ajuda-visivel';

/**
 * Botão de Ajuda, flutuante no canto inferior direito de toda tela logada — pedido do Lucas
 * em 21/09/2026 para substituir o item de sidebar (que saiu do menu, ver REMOVED_IDS em
 * use-sidebar-preferences.ts e o comentário de ITENS_DO_ADMIN_GERAL em AppSidebar.tsx).
 *
 * `/ajuda` não é condicionada por permissão de usuário (ver o comentário em Ajuda.tsx) — só
 * pelo PLANO da empresa, e é exatamente isso que `useSecaoLigada('ajuda')` responde. Some
 * enquanto a resposta não chega (ligada === undefined) em vez de piscar e desaparecer.
 *
 * `useBotaoAjudaVisivel` é a preferência pessoal (Configurações › CardDoBotaoDeAjuda) para
 * quem quer esconder o botão neste computador — sem apagar acesso a `/ajuda`, só ao atalho.
 */
export function BotaoDeAjudaFlutuante() {
  const location = useLocation();
  const { ligada } = useSecaoLigada('ajuda');
  const { visivel } = useBotaoAjudaVisivel();

  if (!visivel) return null;
  if (ligada !== true) return null;
  if (location.pathname === '/ajuda') return null;

  return (
    <Link
      to="/ajuda"
      aria-label="Ajuda"
      title="Ajuda"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <HelpCircle className="h-6 w-6" />
    </Link>
  );
}

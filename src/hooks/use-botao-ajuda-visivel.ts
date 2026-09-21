import { useCallback, useEffect, useState } from 'react';

/**
 * Se a pessoa quer ver o botão flutuante de Ajuda. Vive no navegador dela, como as
 * outras preferências pessoais do sistema (ver use-som-ligado). Visível por padrão:
 * quem acha que atrapalha, desliga — o botão em si não tem outra forma de sumir desde
 * que saiu da sidebar (21/09/2026).
 */
const CHAVE = 'repply_botao_ajuda_visivel';

/** Leitura crua, para quem precisa do valor fora de um componente. */
export function botaoAjudaVisivel(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'false';
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima restrita): botão visível.
    return true;
  }
}

export function useBotaoAjudaVisivel() {
  const [visivel, setVisivel] = useState(botaoAjudaVisivel);

  // Duas abas abertas: desligar numa desliga na outra.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setVisivel(botaoAjudaVisivel());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const definir = useCallback((v: boolean) => {
    try {
      localStorage.setItem(CHAVE, String(v));
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
    setVisivel(v);
  }, []);

  return { visivel, definir };
}

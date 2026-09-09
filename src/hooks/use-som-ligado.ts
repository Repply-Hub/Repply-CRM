import { useCallback, useEffect, useState } from 'react';

/**
 * Se a pessoa quer ouvir os avisos. Vive no navegador dela, como as outras
 * preferências pessoais do sistema (ver use-table-settings). Ligado por padrão:
 * quem não quer, desliga; quem nunca reparou que existe, é avisado.
 */
const CHAVE = 'repply_som_ligado';

/** Leitura crua, para quem precisa do valor fora de um componente. */
export function somLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'false';
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima restrita): som ligado.
    return true;
  }
}

export function useSomLigado() {
  const [ligado, setLigado] = useState(somLigado);

  // Duas abas abertas: desligar numa desliga na outra.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setLigado(somLigado());
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
    setLigado(v);
  }, []);

  return { ligado, definir };
}

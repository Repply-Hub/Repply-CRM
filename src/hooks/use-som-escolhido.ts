import { useCallback, useEffect, useState } from 'react';
import { SOM_PADRAO, somDoCatalogo } from '@/lib/catalogo-de-sons';

/**
 * Qual som a pessoa quer ouvir nas notificações. Vive no navegador dela, como o
 * liga/desliga (use-som-ligado): é preferência de PESSOA — decisão do dono do produto,
 * "individual e não a nível de todos da empresa".
 */
const CHAVE = 'repply_som_notificacao';

/** Leitura crua, para quem precisa do valor fora de um componente. */
export function somEscolhido(): string {
  try {
    return somDoCatalogo(localStorage.getItem(CHAVE)).id;
  } catch {
    return SOM_PADRAO;
  }
}

export function useSomEscolhido() {
  const [id, setId] = useState(somEscolhido);

  // Duas abas abertas: trocar numa troca na outra.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setId(somEscolhido());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const escolher = useCallback((novo: string) => {
    const valido = somDoCatalogo(novo).id;
    try {
      localStorage.setItem(CHAVE, valido);
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
    setId(valido);
  }, []);

  return { id, escolher };
}

import { useEffect, useState } from 'react';

// Evita o "flash" de um spinner que aparece e some quase instantaneamente: só liga o indicador
// se `loading` continuar true depois de `delayMs` (a busca já rápida o suficiente nem chega a
// mostrar nada), mas desliga IMEDIATAMENTE assim que `loading` vira false (nunca atrasa o fim).
// Sem isso, uma busca rápida (poucas dezenas/centenas de ms) faz o ícone piscar a cada pausa de
// digitação em vez de mostrar um carregamento estável só quando realmente demora.
export function useDelayedLoading(loading: boolean, delayMs = 200): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return shown;
}

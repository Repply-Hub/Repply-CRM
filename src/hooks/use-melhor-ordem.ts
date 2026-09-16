import { useQuery } from '@tanstack/react-query';
import { urlDaMelhorOrdem, lerRespostaDaMelhorOrdem, type PontoNoMapa, type MelhorOrdemDoServico } from '@/lib/osrm';

/**
 * A melhor sequência para as paradas, pelo mesmo servidor de demonstração do trajeto — e com as
 * mesmas três guardas, pelos mesmos motivos (ver `use-rota-osrm.ts`): resposta guardada por uma
 * hora, uma tentativa a mais e corte em 12 segundos.
 *
 * 🔴 Diferente do trajeto, aqui o silêncio é a resposta certa quando algo dá errado: sem
 * sugestão a rota continua exatamente como a pessoa montou. Por isso um erro aqui NÃO aparece
 * na tela.
 */
const UMA_HORA = 60 * 60 * 1000;
const LIMITE_MS = 12_000;

export function useMelhorOrdem(pontos: PontoNoMapa[] | null | undefined) {
  const url = pontos ? urlDaMelhorOrdem(pontos) : '';
  const total = pontos?.length ?? 0;

  return useQuery<MelhorOrdemDoServico | null>({
    queryKey: ['melhor-ordem', url],
    enabled: url.length > 0,
    staleTime: UMA_HORA,
    gcTime: UMA_HORA,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const corte = new AbortController();
      const relogio = setTimeout(() => corte.abort(), LIMITE_MS);
      try {
        const resposta = await fetch(url, { signal: corte.signal });
        if (!resposta.ok) return null;
        return lerRespostaDaMelhorOrdem(await resposta.json(), total);
      } catch {
        // Servidor fora, lento ou resposta estranha: sem sugestão, e sem barulho na tela.
        return null;
      } finally {
        clearTimeout(relogio);
      }
    },
  });
}

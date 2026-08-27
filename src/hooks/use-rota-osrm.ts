import { useQuery } from '@tanstack/react-query';
import { urlDaRota, lerRespostaDaRota, type PontoNoMapa, type RotaCalculada } from '@/lib/osrm';

/**
 * Busca o trajeto de carro entre as paradas de uma rota de visita.
 *
 * O cálculo em si é puro e mora em `src/lib/osrm.ts`; aqui só acontece a ida à rede.
 *
 * 🔴 O SERVIDOR É DE DEMONSTRAÇÃO. `router.project-osrm.org` é mantido pelo projeto OSRM como
 * vitrine, não como serviço contratado: não tem acordo de disponibilidade, pode ficar lento e
 * pode recusar quem bate demais. Três decisões saem daí:
 *
 * 1. GUARDA POR UMA HORA. O caminho entre duas obras não muda ao longo do dia — o que muda é o
 *    trânsito, e o OSRM nem considera trânsito. Reconsultar a cada abertura da tela seria bater
 *    no servidor de graça.
 * 2. UMA TENTATIVA A MAIS, SÓ. Insistir num servidor sobrecarregado é o que faz ele cortar de
 *    vez, e a tela já tem uma saída digna quando não vem trajeto.
 * 3. TEMPO LIMITE DE 12 SEGUNDOS. Sem ele, uma requisição pendurada deixa a tela com o desenho
 *    do trajeto "quase chegando" para sempre, e a pessoa fica esperando algo que não vem.
 *
 * Quando não vem trajeto, quem desenha NÃO deve esconder a rota: o mapa mostra as paradas
 * ligadas por linha reta tracejada, dizendo que é a ordem das visitas e não o caminho das ruas.
 * Perder o traçado é um arranhão; deixar o vendedor sem ver a sequência das visitas dele é o
 * estrago.
 */

const UMA_HORA = 60 * 60 * 1000;
const LIMITE_MS = 12_000;

export function useRotaOsrm(pontos: PontoNoMapa[] | null | undefined) {
  // `urlDaRota` já devolve vazio para menos de duas paradas e para coordenada inválida — é ele
  // quem decide se há o que buscar, e a chave sai da própria URL.
  const url = pontos ? urlDaRota(pontos) : '';

  return useQuery<RotaCalculada | null>({
    queryKey: ['rota-osrm', url],
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
        if (!resposta.ok) {
          throw new Error(`o serviço de rotas respondeu ${resposta.status}`);
        }
        // `lerRespostaDaRota` devolve null para resposta que não serve. Aqui isso vira erro de
        // propósito: o React Query precisa saber que NÃO há trajeto para a tela cair na linha
        // reta, e `null` como sucesso deixaria `isError` falso.
        const rota = lerRespostaDaRota(await resposta.json());
        if (!rota) throw new Error('o serviço de rotas não encontrou caminho entre as obras');
        return rota;
      } finally {
        clearTimeout(relogio);
      }
    },
  });
}

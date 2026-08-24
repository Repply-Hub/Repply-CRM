import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ObraComCoordenada {
  id: string;
  nome_obra: string;
  endereco_entrega: string | null;
  /** Nome e cor do marcador da obra, quando ela tiver um. Marcador é opcional: obra sem
   *  etiqueta é estado válido, e aí os dois vêm nulos e o balão do mapa não mostra nada.
   *  Substituíram o antigo `status`, que nunca teve lista cadastrada em empresa nenhuma. */
  marcador_nome?: string | null;
  marcador_cor?: string | null;
  spe_cnpj: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at?: string | null;
  cliente_empresa?: string | null;
  cliente_id?: string | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fila ÚNICA para toda consulta ao Nominatim que sai deste módulo. O serviço é público e
// aceita 1 requisição por segundo por IP; estourar isso bloqueia o IP — e como o escritório
// inteiro costuma sair pelo mesmo IP, o bloqueio derruba o mapa e o autocomplete de endereço
// para todo mundo de uma vez. A fila garante o espaçamento mesmo quando o laço de
// geocodificação e a busca livre do mapa disparam ao mesmo tempo.
const INTERVALO_NOMINATIM_MS = 1100;
let filaNominatim: Promise<unknown> = Promise.resolve();
let ultimaConsulta = 0;

function consultarNominatim(consulta: string): Promise<NominatimResult[]> {
  const minhaVez = filaNominatim.then(async () => {
    const espera = ultimaConsulta + INTERVALO_NOMINATIM_MS - Date.now();
    if (espera > 0) await sleep(espera);
    ultimaConsulta = Date.now();
    // O cabeçalho User-Agent que existia aqui era inútil: navegador não deixa o fetch
    // sobrescrevê-lo (é cabeçalho proibido) e o descartava em silêncio. A identificação
    // junto ao Nominatim vai pelo Referer, que o navegador manda sozinho.
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    // 403/429 = bloqueio ou limite do serviço, 5xx = fora do ar. É diferente de "endereço
    // não existe" (que responde 200 com lista vazia) — e o chamador precisa distinguir.
    if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
    return res.json() as Promise<NominatimResult[]>;
  });
  // Falha de uma consulta não pode entupir a fila das seguintes.
  filaNominatim = minhaVez.catch(() => {});
  return minhaVez;
}

/**
 * Geocodifica endereços via Nominatim (OpenStreetMap) — gratuito, sem chave de API.
 * Já existiu aqui um ramo que preferia a API do Google quando havia chave; foi removido
 * em 2026-08 junto com o mapa do Google (era o único ponto do sistema com custo por consulta).
 *
 * Devolve `null` quando o serviço respondeu e NÃO ENCONTROU o endereço, e LANÇA erro quando
 * o serviço falhou (rede, bloqueio, fora do ar). A diferença importa: "não encontrou" pode
 * ser carimbado como tentativa definitiva; falha de serviço é temporária e deve ser
 * tentada de novo depois.
 */
export async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  let data = await consultarNominatim(endereco);

  // Se não encontrar, tenta simplificar o endereço (remove complementos após vírgula ou hífen)
  if (!data.length) {
    const enderecoLimpo = endereco.replace(/^(condominio|residencial|edificio|ed\.|bloco)\s+/i, '');
    const partes = enderecoLimpo.split(/[,-]/);
    const enderecoSimplificado = partes[0].trim();

    if (enderecoSimplificado !== endereco) {
      data = await consultarNominatim(enderecoSimplificado);
    }

    if (!data.length && partes.length > 1) {
      data = await consultarNominatim(`${partes[0].trim()}, ${partes[partes.length - 1].trim()}`);
    }
  }

  if (!data.length) {
    console.warn(`[Geocoding] Nenhum resultado para o endereço: ${endereco}`);
    return null;
  }
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/** Obra que já passou pela geocodificação e ficou sem ponto: o endereço não foi encontrado.
 *  Predicado único para o mapa e o painel lateral não divergirem na definição. */
export function obraSemPontoNoMapa(o: ObraComCoordenada): boolean {
  return (o.latitude === null || o.longitude === null) && !!o.geocoded_at;
}

export function useGeocodeObras(obras: ObraComCoordenada[] | undefined) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ObraComCoordenada[]>(obras ?? []);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [carregando, setCarregando] = useState(false);
  // Espelho do estado para o efeito ler o valor corrente sem entrar nas dependências.
  const itemsRef = useRef<ObraComCoordenada[]>(items);
  itemsRef.current = items;

  // A chave inclui endereço e nome de propósito: editar o endereço de uma obra zera o
  // carimbo (ver o submit de edição em Obras.tsx), e é a mudança do TEXTO que faz o efeito
  // rodar de novo e re-geocodificar — com a chave só por id, obra corrigida ficava presa
  // com o pino velho (ou sem pino) até recarregar a página. O `geocoded_at` NÃO entra na
  // chave: o próprio laço grava esse carimbo no cache a cada obra processada, e ele na
  // chave faria o laço se cancelar e recomeçar a cada gravação.
  const chaveObras = useMemo(
    () =>
      obras
        ?.map((o) => `${o.id}:${o.endereco_entrega ?? ''}:${o.nome_obra ?? ''}`)
        .join('|') ?? '',
    [obras]
  );

  useEffect(() => {
    if (!obras) return;

    // Mescla com o que ESTA SESSÃO já geocodificou: mudar filtro/busca re-deriva a lista a
    // partir do cache de obras, e o cache pode ainda não ter a coordenada recém-gravada.
    // Sem a mescla, um clique num chip de marcador apagava os pinos da sessão e refazia
    // todas as consultas ao Nominatim do zero. A mescla só vale quando endereço e nome não
    // mudaram — se mudaram, o carimbo foi zerado de propósito pela edição e a obra DEVE
    // ser re-geocodificada.
    const conhecidas = new Map(itemsRef.current.map((o) => [o.id, o]));
    const mesclado = obras.map((o) => {
      const local = conhecidas.get(o.id);
      if (
        local?.geocoded_at &&
        !o.geocoded_at &&
        local.endereco_entrega === o.endereco_entrega &&
        local.nome_obra === o.nome_obra
      ) {
        return {
          ...o,
          latitude: local.latitude,
          longitude: local.longitude,
          geocoded_at: local.geocoded_at,
        };
      }
      return o;
    });
    setItems(mesclado);

    const pendentes = mesclado.filter(
      (o) => (!!o.endereco_entrega || !!o.nome_obra) && (o.latitude === null || o.longitude === null) && !o.geocoded_at
    );
    
    console.log('[useGeocodeObras] Obras pendentes:', pendentes.length);

    if (pendentes.length === 0) return;

    let cancelado = false;
    setCarregando(true);
    setProgresso({ atual: 0, total: pendentes.length });

    (async () => {
      for (let i = 0; i < pendentes.length; i++) {
        if (cancelado) break;
        const obra = pendentes[i];
        const enderecoBusca = obra.endereco_entrega || obra.nome_obra;

        let coord: { lat: number; lng: number } | null = null;
        try {
          coord = await geocodificar(enderecoBusca);
        } catch (err) {
          // Falha de SERVIÇO (rede, bloqueio, fora do ar) — diferente de "endereço não
          // existe". Não carimba a obra: ela volta a tentar na próxima abertura do mapa.
          console.warn(`[useGeocodeObras] Serviço de geocodificação falhou para ${obra.nome_obra}; ficará para a próxima:`, err);
          setProgresso({ atual: i + 1, total: pendentes.length });
          continue;
        }
        if (cancelado) break;

        const agora = new Date().toISOString();
        if (coord) {
          console.log(`[useGeocodeObras] Endereço geocodificado para ${obra.nome_obra}:`, coord);
          const { error: updateError } = await supabase
            .from('obras')
            .update({
              latitude: coord.lat,
              longitude: coord.lng,
              geocoded_at: agora,
            })
            .eq('id', obra.id);

          if (updateError) {
            console.error('[useGeocodeObras] Erro ao atualizar obra no Supabase:', updateError);
          }

          setItems((prev) =>
            prev.map((o) =>
              o.id === obra.id
                ? { ...o, latitude: coord.lat, longitude: coord.lng, geocoded_at: agora }
                : o
            )
          );

          // Atualiza também o CACHE da lista de obras — é dele que o painel lateral e a
          // projeção do mapa derivam. Sem isto, o cache ficava mentindo (coordenada nula)
          // até um refetch, e o painel contradizia o mapa na mesma tela.
          qc.setQueriesData({ queryKey: ['obras'] }, (velho: unknown) =>
            Array.isArray(velho)
              ? velho.map((o: { id: string }) =>
                  o.id === obra.id
                    ? { ...o, latitude: coord.lat, longitude: coord.lng, geocoded_at: agora }
                    : o
                )
              : velho
          );
        } else {
          console.warn(`[useGeocodeObras] Falha ao geocodificar ${obra.nome_obra}`);
          // O carimbo de "já tentei" é gravado ATÉ na falha, de propósito: sem ele, cada
          // abertura da aba tentaria os mesmos endereços ruins de novo, em loop. A obra sai
          // do limbo quando alguém corrige o endereço (a edição zera o carimbo).
          const { error: updateError } = await supabase
            .from('obras')
            .update({ geocoded_at: agora })
            .eq('id', obra.id);

          if (updateError) {
            console.error('[useGeocodeObras] Erro ao marcar falha de geocodificação:', updateError);
          }

          // Refletir no estado local também, para o contador de "endereço não encontrado"
          // aparecer na hora, sem esperar recarregar a lista.
          setItems((prev) =>
            prev.map((o) => (o.id === obra.id ? { ...o, geocoded_at: agora } : o))
          );
          qc.setQueriesData({ queryKey: ['obras'] }, (velho: unknown) =>
            Array.isArray(velho)
              ? velho.map((o: { id: string }) =>
                  o.id === obra.id ? { ...o, geocoded_at: agora } : o
                )
              : velho
          );
        }

        setProgresso({ atual: i + 1, total: pendentes.length });
        // O espaçamento de 1 req/seg do Nominatim é garantido pela fila em consultarNominatim.
      }
      if (!cancelado) setCarregando(false);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveObras]);

  return { items, carregando, progresso };
}

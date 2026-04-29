import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ObraComCoordenada {
  id: string;
  nome_obra: string;
  endereco_entrega: string | null;
  status: string;
  spe_cnpj: string | null;
  latitude: number | null;
  longitude: number | null;
  cliente_empresa?: string | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Geocodifica endereços usando Nominatim (OpenStreetMap) - gratuito, sem API key.
 * Respeita o rate limit de 1 req/seg e cacheia o resultado em obras.latitude/longitude.
 */
export async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Tenta primeiro o endereço completo
    let query = encodeURIComponent(endereco);
    console.log(`[Geocoding] Tentando: ${endereco}`);
    let res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${query}`,
      {
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'LovableCRM/1.0 (contact@lovable.dev)'
        },
      }
    );
    
    let data: NominatimResult[] = await res.json();
    
    // Se não encontrar, tenta simplificar o endereço (remove complementos após vírgula ou hífen)
    if (!data.length) {
      // Tenta remover "Condominio", "Residencial", "Edificio" etc do início se for o caso
      const enderecoLimpo = endereco.replace(/^(condominio|residencial|edificio|ed\.|bloco)\s+/i, '');
      const partes = enderecoLimpo.split(/[,-]/);
      const enderecoSimplificado = partes[0].trim();
      
      if (enderecoSimplificado !== endereco) {
        console.log(`[Geocoding] Tentando simplificado: ${enderecoSimplificado}`);
        query = encodeURIComponent(enderecoSimplificado);
        res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${query}`,
          {
            headers: {
              'Accept-Language': 'pt-BR',
              'User-Agent': 'LovableCRM/1.0 (contact@lovable.dev)'
            },
          }
        );
        data = await res.json();
      }
      
      // Se ainda não encontrar e houver cidade/estado, tenta apenas logradouro + cidade
      if (!data.length && partes.length > 1) {
        const ruaCidade = `${partes[0].trim()}, ${partes[partes.length - 1].trim()}`;
        console.log(`[Geocoding] Tentando rua + cidade: ${ruaCidade}`);
        query = encodeURIComponent(ruaCidade);
        res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${query}`,
          {
            headers: {
              'Accept-Language': 'pt-BR',
              'User-Agent': 'LovableCRM/1.0 (contact@lovable.dev)'
            },
          }
        );
        data = await res.json();
      }
    }

    if (!data.length) {
      console.warn(`No geocoding results for address: ${endereco}`);
      return null;
    }
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error(`Geocoding error for ${endereco}:`, err);
    return null;
  }
}

export function useGeocodeObras(obras: ObraComCoordenada[] | undefined) {
  const [items, setItems] = useState<ObraComCoordenada[]>(obras ?? []);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!obras) return;
    setItems(obras);

    const pendentes = obras.filter(
      (o) => !!o.endereco_entrega && (o.latitude === null || o.longitude === null)
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
        const coord = await geocodificar(obra.endereco_entrega!);
        if (cancelado) break;

        if (coord) {
          console.log(`[useGeocodeObras] Endereço geocodificado para ${obra.nome_obra}:`, coord);
          const { error: updateError } = await supabase
            .from('obras')
            .update({
              latitude: coord.lat,
              longitude: coord.lng,
              geocoded_at: new Date().toISOString(),
            })
            .eq('id', obra.id);

          if (updateError) {
            console.error('[useGeocodeObras] Erro ao atualizar obra no Supabase:', updateError);
          }

          setItems((prev) =>
            prev.map((o) =>
              o.id === obra.id ? { ...o, latitude: coord.lat, longitude: coord.lng } : o
            )
          );
        } else {
          console.warn(`[useGeocodeObras] Falha ao geocodificar ${obra.nome_obra}`);
          // Se falhou mas o endereço parece válido, podemos tentar uma versão simplificada ou apenas marcar como processado
          const { error: updateError } = await supabase
            .from('obras')
            .update({ geocoded_at: new Date().toISOString() })
            .eq('id', obra.id);
            
          if (updateError) {
            console.error('[useGeocodeObras] Erro ao marcar falha de geocodificação:', updateError);
          }
        }

        setProgresso({ atual: i + 1, total: pendentes.length });
        // Nominatim pede 1 req/seg
        await sleep(1100);
      }
      if (!cancelado) setCarregando(false);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras?.map((o) => o.id).join(',')]);

  return { items, carregando, progresso };
}

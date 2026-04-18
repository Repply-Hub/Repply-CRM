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
async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(endereco);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${query}`,
      {
        headers: {
          'Accept-Language': 'pt-BR',
        },
      }
    );
    if (!res.ok) return null;
    const data: NominatimResult[] = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
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
          await supabase
            .from('obras')
            .update({
              latitude: coord.lat,
              longitude: coord.lng,
              geocoded_at: new Date().toISOString(),
            })
            .eq('id', obra.id);

          setItems((prev) =>
            prev.map((o) =>
              o.id === obra.id ? { ...o, latitude: coord.lat, longitude: coord.lng } : o
            )
          );
        } else {
          // Marca tentativa para evitar reprocessar (geocoded_at sem coords = "tentamos e falhou")
          await supabase
            .from('obras')
            .update({ geocoded_at: new Date().toISOString() })
            .eq('id', obra.id);
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

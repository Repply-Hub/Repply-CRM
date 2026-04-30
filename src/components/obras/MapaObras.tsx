import { useMemo, useEffect, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Loader2, MapPin, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGeocodeObras, type ObraComCoordenada } from '@/hooks/use-geocode-obras';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  ativa: 'Ativa',
  concluida: 'Concluída',
  parada: 'Parada',
};

interface MapaObrasProps {
  obras: ObraComCoordenada[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
}

export function MapaObras({ obras, isLoading, searchTerm = '' }: MapaObrasProps) {
  const { items, carregando, progresso } = useGeocodeObras(obras);
  const [selectedObra, setSelectedObra] = useState<ObraComCoordenada | null>(null);
  
  // Note: For a production app, the API key should be in an environment variable
  // but for the preview to work, we'll try to load without a key (will show development watermark)
  // or use a public one if available.
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", 
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);

  const obrasComCoord = useMemo(
    () => items.filter((o) => o.latitude !== null && o.longitude !== null),
    [items]
  );

  const obrasSemEndereco = useMemo(
    () => items.filter((o) => !o.endereco_entrega),
    [items]
  );

  const centro = useMemo(() => {
    if (obrasComCoord.length === 0) return { lat: -5.7945, lng: -35.211 }; // Natal/RN
    const lat =
      obrasComCoord.reduce((s, o) => s + (o.latitude ?? 0), 0) / obrasComCoord.length;
    const lng =
      obrasComCoord.reduce((s, o) => s + (o.longitude ?? 0), 0) / obrasComCoord.length;
    return { lat, lng };
  }, [obrasComCoord]);

  const onUnmount = useCallback(function callback(map: google.maps.Map) {
    setMap(null);
  }, []);

  useEffect(() => {
    if (map && searchTerm && searchTerm.trim().length > 3) {
      const geocoder = new google.maps.Geocoder();
      // First try to find among existing obras
      const obraMatch = obrasComCoord.find(o => 
        o.nome_obra.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.endereco_entrega && o.endereco_entrega.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      if (obraMatch) {
        map.setCenter({ lat: obraMatch.latitude!, lng: obraMatch.longitude! });
        map.setZoom(17);
        setSelectedObra(obraMatch);
        return;
      }

      // If no local match, use Google Geocoder
      geocoder.geocode({ address: searchTerm + ', Brasil' }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          map.setCenter(results[0].geometry.location);
          map.setZoom(16);
        }
      });
    }
  }, [map, searchTerm, obrasComCoord]);

  if (isLoading || !isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">{obrasComCoord.length}</span>
          <span>obra(s) no mapa</span>
        </div>
        {obrasSemEndereco.length > 0 && (
          <span className="text-xs">• {obrasSemEndereco.length} sem endereço cadastrado</span>
        )}
        {carregando && (
          <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Geocodificando endereços ({progresso.atual}/${progresso.total})…</span>
          </div>
        )}
      </div>

      <div className="rounded-lg overflow-hidden border border-border shadow-card" style={{ height: '70vh', minHeight: 480 }}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={centro}
          zoom={obrasComCoord.length > 0 ? 11 : 6}
          onLoad={setMap}
          onUnmount={onUnmount}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          }}
        >
          {obrasComCoord.map((obra) => (
            <Marker
              key={obra.id}
              position={{ lat: obra.latitude!, lng: obra.longitude! }}
              onClick={() => setSelectedObra(obra)}
            />
          ))}

          {selectedObra && (
            <InfoWindow
              position={{ lat: selectedObra.latitude!, lng: selectedObra.longitude! }}
              onCloseClick={() => setSelectedObra(null)}
            >
              <div className="p-1 space-y-1.5 min-w-[180px] max-w-[250px] text-foreground">
                <p className="font-bold text-sm leading-tight">{selectedObra.nome_obra}</p>
                {selectedObra.cliente_empresa && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span>{selectedObra.cliente_empresa}</span>
                  </div>
                )}
                {selectedObra.endereco_entrega && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="break-words">{selectedObra.endereco_entrega}</span>
                  </div>
                )}
                <div className="mt-1">
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    {STATUS_LABEL[selectedObra.status] ?? selectedObra.status}
                  </Badge>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      {obrasComCoord.length === 0 && !carregando && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nenhuma obra com endereço geocodificado ainda. Cadastre endereços nas obras para vê-las no mapa.
        </div>
      )}
    </div>
  );
}

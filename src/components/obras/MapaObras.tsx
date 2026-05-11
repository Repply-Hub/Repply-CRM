import { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Loader2, MapPin, Building2, AlertTriangle, Key } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGeocodeObras, type ObraComCoordenada } from '@/hooks/use-geocode-obras';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em Andamento',
  ativa: 'Ativa',
  concluida: 'Concluída',
  parada: 'Parada',
};

interface MapaObrasProps {
  obras: ObraComCoordenada[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
  selectedObraId?: string;
}

export function MapaObras({ obras, isLoading, searchTerm = '', selectedObraId }: MapaObrasProps) {
  const navigate = useNavigate();
  const { items, carregando, progresso } = useGeocodeObras(obras);
  const [selectedObra, setSelectedObra] = useState<ObraComCoordenada | null>(null);
  
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const hasApiKey = googleMapsApiKey.length > 0;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey, 
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);

  const obrasComCoord = useMemo(
    () => items.filter((o) => o.latitude !== null && o.longitude !== null),
    [items]
  );

  const obrasSemLocalizacao = useMemo(
    () => items.filter((o) => !o.endereco_entrega && !o.nome_obra),
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
    if (!map) return;

    if (selectedObraId) {
      const obraMatch = obrasComCoord.find(o => o.id === selectedObraId);
      if (obraMatch) {
        map.setCenter({ lat: obraMatch.latitude!, lng: obraMatch.longitude! });
        map.setZoom(17);
        setSelectedObra(obraMatch);
        return;
      }
    }

    if (searchTerm && searchTerm.trim().length > 3) {
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
  }, [map, searchTerm, obrasComCoord, selectedObraId]);

  if (isLoading || !isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">{obrasComCoord.length}</span>
          <span className="text-slate-600 dark:text-slate-400">obra(s) no mapa</span>
        </div>
        {obrasSemLocalizacao.length > 0 && (
          <div className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-100 dark:border-amber-800">
            {obrasSemLocalizacao.length} sem localização
          </div>
        )}
        {carregando && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800 animate-pulse shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Mapeando obras ({progresso.atual}/{progresso.total})…</span>
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
              <div className="p-2 space-y-2 min-w-[200px] max-w-[280px]">
                <p className="font-bold text-base leading-tight text-slate-900">{selectedObra.nome_obra}</p>
                
                {selectedObra.cliente_empresa && (
                  <div 
                    className="flex items-center gap-1.5 text-sm text-slate-700 font-medium bg-slate-50 p-1.5 rounded border border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                    onClick={() => {
                      if (selectedObra.cliente_id) {
                        navigate(`/clientes/${selectedObra.cliente_id}`);
                      }
                    }}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                    <span>{selectedObra.cliente_empresa}</span>
                  </div>
                )}
                
                <div className="flex items-start gap-1.5 text-sm text-slate-600 leading-snug">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  <span className="break-words">{selectedObra.endereco_entrega || selectedObra.nome_obra}</span>
                </div>
                
                <div className="pt-1 flex items-center justify-between">
                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-none text-[11px] px-2 py-0.5">
                    {STATUS_LABEL[selectedObra.status] ?? selectedObra.status}
                  </Badge>
                  <span className="text-[10px] text-slate-400 italic">ID: {selectedObra.id.split('-')[0]}</span>
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

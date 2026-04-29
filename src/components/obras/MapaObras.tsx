import { useMemo, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGeocodeObras, geocodificar, type ObraComCoordenada } from '@/hooks/use-geocode-obras';

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Fix dos ícones padrão do Leaflet (assets quebram com bundlers)
const iconPadrao = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapaObrasProps {
  obras: ObraComCoordenada[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
}

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  ativa: 'Ativa',
  concluida: 'Concluída',
  parada: 'Parada',
};

  export function MapaObras({ obras, isLoading, searchTerm = '' }: MapaObrasProps) {
  const { items, carregando, progresso } = useGeocodeObras(obras);
  const [searchCoord, setSearchCoord] = useState<[number, number] | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.trim().length > 3) {
        const coord = await geocodificar(searchTerm);
        if (coord) {
          setSearchCoord([coord.lat, coord.lng]);
        }
      } else {
        setSearchCoord(null);
      }
    }, 800); // Debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const obrasComCoord = useMemo(
    () => items.filter((o) => o.latitude !== null && o.longitude !== null),
    [items]
  );

  const obrasSemEndereco = useMemo(
    () => items.filter((o) => !o.endereco_entrega),
    [items]
  );

  // Centro do mapa: prioriza termo pesquisado, senão média das obras, senão Natal/RN
  const centro = useMemo<[number, number]>(() => {
    if (searchCoord) return searchCoord;
    if (obrasComCoord.length === 0) return [-5.7945, -35.211]; // Natal/RN
    const lat =
      obrasComCoord.reduce((s, o) => s + (o.latitude ?? 0), 0) / obrasComCoord.length;
    const lng =
      obrasComCoord.reduce((s, o) => s + (o.longitude ?? 0), 0) / obrasComCoord.length;
    return [lat, lng];
  }, [obrasComCoord, searchCoord]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status bar */}
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
          <div className="flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              Geocodificando endereços ({progresso.atual}/{progresso.total})…
            </span>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div className="rounded-lg overflow-hidden border border-border shadow-card" style={{ height: '70vh', minHeight: 480 }}>
        <MapContainer
          center={centro}
          zoom={obrasComCoord.length > 0 ? 11 : 6}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <ChangeView center={centro} zoom={isSearching && obrasComCoord.length > 0 ? 14 : (obrasComCoord.length > 0 ? 11 : 6)} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {obrasComCoord.map((obra) => (
            <Marker
              key={obra.id}
              position={[obra.latitude!, obra.longitude!]}
              icon={iconPadrao}
            >
              <Popup>
                <div className="space-y-1.5 min-w-[200px]">
                  <p className="font-semibold text-sm leading-tight">{obra.nome_obra}</p>
                  {obra.cliente_empresa && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>{obra.cliente_empresa}</span>
                    </div>
                  )}
                  {obra.endereco_entrega && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{obra.endereco_entrega}</span>
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {STATUS_LABEL[obra.status] ?? obra.status}
                  </Badge>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {obrasComCoord.length === 0 && !carregando && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nenhuma obra com endereço geocodificado ainda. Cadastre endereços nas obras para vê-las no mapa.
        </div>
      )}
    </div>
  );
}

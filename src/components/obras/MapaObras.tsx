import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Building2, Maximize2, Minimize2, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { geocodificar, useGeocodeObras, type ObraComCoordenada } from '@/hooks/use-geocode-obras';

// O `STATUS_LABEL` que existia aqui traduzia quatro apelidos fixos (em_andamento, ativa,
// concluida, parada) que nunca bateram com lista nenhuma: `status_obras` está vazia nas 8
// empresas, então o balão mostrava o apelido cru do banco. Quem etiqueta a obra agora é o
// MARCADOR, que vem com nome e cor próprios pela junção — e quando a obra não tem marcador o
// balão simplesmente não mostra etiqueta, em vez de inventar uma.

// Ícone dos pinos: divIcon com SVG inline em vez do marker-icon.png padrão do Leaflet — a URL
// do PNG é montada em tempo de execução e o Vite não a resolve (o pino sumiria). De quebra, o
// SVG aceita a cor do marcador da obra, os mesmos tokens do Badge e do kanban.
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(cor?: string | null): L.DivIcon {
  // `cor` vem de coluna de texto livre e entra num trecho de HTML: só passa adiante o que
  // tem cara de token CSS (`kanban-new`, `destructive`…). Qualquer outra coisa cai no padrão.
  const token = cor && /^[a-z0-9-]{1,40}$/.test(cor) ? cor : null;
  const key = token ?? 'default';
  const cached = iconCache.get(key);
  if (cached) return cached;
  const fill = token ? `hsl(var(--${token}))` : 'hsl(var(--primary))';
  const icon = L.divIcon({
    // Sem className próprio o Leaflet aplica .leaflet-div-icon (caixa branca com borda).
    className: 'obra-pin',
    // var() não funciona em atributo fill de SVG: a cor entra pelo style e o path usa currentColor.
    html: `<div style="color:${fill}; line-height:0; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.4));">
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
        <path fill="currentColor" stroke="white" stroke-width="1.5"
          d="M15 1C7.3 1 1 7.3 1 15c0 10 14 24 14 24s14-14 14-24C29 7.3 22.7 1 15 1z"/>
        <circle cx="15" cy="15" r="5" fill="white"/>
      </svg></div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
  iconCache.set(key, icon);
  return icon;
}

interface MapControllerProps {
  /** Termo de busca JÁ com debounce — o pai segura 800ms antes de propagar. */
  termoBusca: string;
  selectedObraId?: string;
  obrasComCoord: ObraComCoordenada[];
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}

// No react-leaflet, center/zoom do MapContainer valem só na montagem. Todo movimento
// dinâmico (enquadrar as obras, focar uma obra, busca) passa por este filho com useMap().
//
// Duas regras de convivência com o usuário, aprendidas na revisão:
// 1. A geocodificação em segundo plano entrega uma coordenada a cada ~1s, e cada entrega
//    re-renderiza este componente. NENHUM movimento de câmera pode se repetir só por causa
//    disso — senão o mapa fica puxando a câmera de volta a cada segundo, embaixo da mão de
//    quem está navegando. Daí o `ultimoFoco` (cada alvo é focado UMA vez) e o
//    `usuarioMexeu` (depois que a pessoa arrasta ou dá zoom, o enquadre automático para).
// 2. Movimento que o código dispara não pode contar como "o usuário mexeu" — daí o
//    `movendoProgramatico` em volta de cada setView/fitBounds.
function MapController({ termoBusca, selectedObraId, obrasComCoord, markerRefs }: MapControllerProps) {
  const map = useMap();
  const usuarioMexeu = useRef(false);
  const movendoProgramatico = useRef(false);
  const ultimoFoco = useRef('');
  const totalEnquadrado = useRef(0);

  const moverProgramaticamente = (mover: () => void) => {
    movendoProgramatico.current = true;
    mover();
    // O flag é limpo no moveend/zoomend; o timer é rede de segurança para o caso de o
    // movimento não sair do lugar (alvo igual à posição atual não emite evento nenhum).
    setTimeout(() => {
      movendoProgramatico.current = false;
    }, 1200);
  };

  useEffect(() => {
    const marcarInteracao = () => {
      if (!movendoProgramatico.current) usuarioMexeu.current = true;
    };
    const limparProgramatico = () => {
      movendoProgramatico.current = false;
    };
    map.on('dragstart zoomstart', marcarInteracao);
    map.on('moveend zoomend', limparProgramatico);
    return () => {
      map.off('dragstart zoomstart', marcarInteracao);
      map.off('moveend zoomend', limparProgramatico);
    };
  }, [map]);

  // Enquadra o conjunto de obras conforme as coordenadas chegam (a geocodificação roda
  // depois da montagem e vai adicionando pontos aos poucos) — mas para de enquadrar assim
  // que o usuário mexe no mapa ou que algum foco (obra selecionada/busca) assumiu a câmera.
  useEffect(() => {
    if (obrasComCoord.length === 0 || obrasComCoord.length === totalEnquadrado.current) return;
    if (usuarioMexeu.current || ultimoFoco.current) return;
    totalEnquadrado.current = obrasComCoord.length;
    const bounds = L.latLngBounds(
      obrasComCoord.map((o) => [o.latitude!, o.longitude!] as [number, number])
    );
    moverProgramaticamente(() => map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 }));
  }, [map, obrasComCoord]);

  useEffect(() => {
    const termo = termoBusca.trim().toLowerCase();
    const alvo = selectedObraId
      ? `obra:${selectedObraId}`
      : termo.length >= 3
        ? `busca:${termo}`
        : '';

    if (!alvo) {
      // Busca limpa: libera o alvo para, se a pessoa digitar o mesmo termo de novo, focar de novo.
      ultimoFoco.current = '';
      return;
    }
    if (alvo === ultimoFoco.current) return;

    const focar = (lat: number, lng: number, zoom: number, markerId?: string) => {
      ultimoFoco.current = alvo;
      moverProgramaticamente(() => map.setView([lat, lng], zoom));
      if (markerId) markerRefs.current.get(markerId)?.openPopup();
    };

    if (selectedObraId) {
      const obra = obrasComCoord.find((o) => o.id === selectedObraId);
      if (obra) focar(obra.latitude!, obra.longitude!, 17, obra.id);
      // Sem coordenada ainda: o efeito roda de novo quando a geocodificação dela chegar.
      return;
    }

    const match = obrasComCoord.find(
      (o) =>
        (o.nome_obra || '').toLowerCase().includes(termo) ||
        (o.endereco_entrega || '').toLowerCase().includes(termo)
    );
    if (match) {
      focar(match.latitude!, match.longitude!, 17, match.id);
      return;
    }

    // Sem match local: geocodifica a busca livre no Nominatim (a fila do módulo garante o
    // limite de 1 req/s). O alvo é marcado ANTES da resposta, para os re-renders da
    // geocodificação em segundo plano não repetirem a mesma consulta.
    ultimoFoco.current = alvo;
    let cancelado = false;
    geocodificar(`${termoBusca.trim()}, Brasil`)
      .then((coord) => {
        if (!cancelado && coord) {
          moverProgramaticamente(() => map.setView([coord.lat, coord.lng], 16));
        }
      })
      // Serviço indisponível: a busca simplesmente não move o mapa. Sem erro na tela.
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [map, termoBusca, selectedObraId, obrasComCoord, markerRefs]);

  return null;
}

interface MapaObrasProps {
  obras: ObraComCoordenada[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
  selectedObraId?: string;
}

export function MapaObras({ obras, isLoading, searchTerm = '', selectedObraId }: MapaObrasProps) {
  const navigate = useNavigate();
  const { items, carregando, progresso } = useGeocodeObras(obras);
  const markerRefs = useRef(new Map<string, L.Marker>());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [tilesFalharam, setTilesFalharam] = useState(false);

  // Sem debounce, cada tecla dispararia o efeito de busca — e, sem match local, uma
  // consulta ao Nominatim por tecla. 800ms segura até a pessoa parar de digitar.
  const termoBusca = useDebouncedValue(searchTerm, 800);

  const obrasComCoord = useMemo(
    () => items.filter((o) => o.latitude !== null && o.longitude !== null),
    [items]
  );

  // Obras que já passaram pela geocodificação e ficaram sem ponto: o endereço não foi
  // encontrado. Corrigir o endereço na edição zera o carimbo e tenta de novo.
  const obrasSemLocalizacao = useMemo(
    () => items.filter((o) => (o.latitude === null || o.longitude === null) && !!o.geocoded_at),
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

  useEffect(() => {
    const aoMudarTelaCheia = () => {
      setTelaCheia(Boolean(document.fullscreenElement));
      // O container muda de tamanho; sem isto o Leaflet continua desenhando no tamanho antigo.
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    };
    document.addEventListener('fullscreenchange', aoMudarTelaCheia);
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia);
  }, []);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen?.();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">{obrasComCoord.length}</span>
          <span className="text-slate-600 dark:text-slate-400">obra(s) no mapa</span>
        </div>
        {obrasSemLocalizacao.length > 0 && (
          <div
            className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-100 dark:border-amber-800"
            title="O endereço dessas obras não foi encontrado no mapa. Edite o endereço para tentar de novo."
          >
            {obrasSemLocalizacao.length} com endereço não encontrado
          </div>
        )}
        {carregando && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800 animate-pulse shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Mapeando obras ({progresso.atual}/{progresso.total})…</span>
          </div>
        )}
        {tilesFalharam && (
          <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-100 dark:border-amber-800">
            <WifiOff className="h-3.5 w-3.5" />
            <span>Falha ao carregar o fundo do mapa — verifique a conexão.</span>
          </div>
        )}
      </div>

      {/* relative z-0 isolate confina os z-index internos do Leaflet (vão até 1000) dentro do
          wrapper — sem isso o mapa desenha por cima do Sheet de detalhes e dos diálogos (z-50). */}
      <div
        ref={wrapperRef}
        className="relative z-0 isolate rounded-lg overflow-hidden border border-border shadow-card bg-background"
        // Metade da tela: sobra espaço para rolar a página. Quem precisa de mapa grande usa
        // o botão de tela cheia.
        style={{ height: telaCheia ? '100dvh' : '50vh', minHeight: 380 }}
      >
        <MapContainer
          ref={mapRef}
          center={[centro.lat, centro.lng]}
          zoom={obrasComCoord.length > 0 ? 11 : 6}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{
              tileerror: () => setTilesFalharam(true),
              tileload: () => setTilesFalharam(false),
            }}
          />

          {obrasComCoord.map((obra) => (
            <Marker
              key={obra.id}
              position={[obra.latitude!, obra.longitude!]}
              icon={pinIcon(obra.marcador_cor)}
              ref={(m) => {
                if (m) markerRefs.current.set(obra.id, m);
                else markerRefs.current.delete(obra.id);
              }}
            >
              <Popup maxWidth={280}>
                <div className="p-2 space-y-2 min-w-[200px] max-w-[280px]">
                  <p className="font-bold text-base leading-tight text-slate-900">{obra.nome_obra}</p>

                  {obra.cliente_empresa && (
                    <div
                      className="flex items-center gap-1.5 text-sm text-slate-700 font-medium bg-slate-50 p-1.5 rounded border border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                      onClick={() => {
                        if (obra.cliente_id) {
                          navigate(`/clientes/${obra.cliente_id}`);
                        }
                      }}
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                      <span>{obra.cliente_empresa}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-1.5 text-sm text-slate-600 leading-snug">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                    <span className="break-words">{obra.endereco_entrega || obra.nome_obra}</span>
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-2">
                    {/* A cor vem do token do marcador (`bg-kanban-new`, `bg-destructive`…), que é
                        exatamente o conjunto coberto pelo safelist do Tailwind. Obra sem marcador
                        não mostra etiqueta nenhuma. */}
                    {obra.marcador_nome && (
                      <Badge className={cn('text-white border-none text-[11px] px-2 py-0.5', `bg-${obra.marcador_cor}`)}>
                        {obra.marcador_nome}
                      </Badge>
                    )}
                    <span className="text-[10px] text-slate-400 italic ml-auto">ID: {obra.id.split('-')[0]}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          <MapController
            termoBusca={termoBusca}
            selectedObraId={selectedObraId}
            obrasComCoord={obrasComCoord}
            markerRefs={markerRefs}
          />
        </MapContainer>

        {/* O mapa do Google tinha botão de tela cheia; o Leaflet não traz um. Este usa a
            tela cheia do próprio navegador sobre o wrapper. */}
        <button
          type="button"
          onClick={alternarTelaCheia}
          title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          className="absolute top-2 right-2 z-[1001] rounded-md border border-border bg-background/90 p-2 shadow-sm hover:bg-accent transition-colors"
        >
          {telaCheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {obrasComCoord.length === 0 && !carregando && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nenhuma obra com endereço geocodificado ainda. Cadastre endereços nas obras para vê-las no mapa.
        </div>
      )}
    </div>
  );
}

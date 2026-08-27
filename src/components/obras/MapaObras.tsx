import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Maximize2, Minimize2, WifiOff, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatarMoedaBRL } from '@/lib/moeda';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useObraVendas } from '@/hooks/use-obra-vendas';
import {
  geocodificar,
  obraSemPontoNoMapa,
  useGeocodeObras,
  type ObraComCoordenada,
} from '@/hooks/use-geocode-obras';

// O `STATUS_LABEL` que existia aqui traduzia quatro apelidos fixos (em_andamento, ativa,
// concluida, parada) que nunca bateram com lista nenhuma: `status_obras` está vazia nas 8
// empresas, então o balão mostrava o apelido cru do banco. Quem etiqueta a obra agora é o
// MARCADOR, que vem com nome e cor próprios pela junção — e quando a obra não tem marcador o
// balão simplesmente não mostra etiqueta, em vez de inventar uma.

// Ícone dos pinos: divIcon em vez do marker-icon.png padrão do Leaflet — a URL do PNG é
// montada em tempo de execução e o Vite não a resolve (o pino sumiria). O visual é uma
// bolinha na cor do marcador da obra (mesmos tokens do Badge e do kanban), com o rótulo do
// nome ao lado via <Tooltip permanent>.
const iconCache = new Map<string, L.DivIcon>();

function dotIcon(cor?: string | null, selecionada = false): L.DivIcon {
  // `cor` vem de coluna de texto livre e entra num trecho de HTML: só passa adiante o que
  // tem cara de token CSS (`kanban-new`, `destructive`…). Qualquer outra coisa cai no padrão.
  const token = cor && /^[a-z0-9-]{1,40}$/.test(cor) ? cor : null;
  // A seleção PRECISA estar na chave do cache: o divIcon é compartilhado entre todos os
  // marcadores da mesma cor, e sem isso selecionar uma obra cresceria as bolinhas de todas.
  const key = `${token ?? 'default'}${selecionada ? ':sel' : ''}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const fill = token ? `hsl(var(--${token}))` : 'hsl(var(--primary))';
  const icon = L.divIcon({
    // Sem className próprio o Leaflet aplica .leaflet-div-icon (caixa branca com borda).
    className: 'obra-dot',
    html: `<span class="obra-dot-inner${selecionada ? ' obra-dot-selecionada' : ''}" style="background:${fill}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    tooltipAnchor: [9, 0],
  });
  iconCache.set(key, icon);
  return icon;
}

/** Coordenada de um ENDEREÇO buscado (não é obra). `termo` é o texto normalizado da busca
 *  que gerou o ponto — quando o termo atual bate com ele, a coordenada já existe e não se
 *  consulta o Nominatim de novo. */
export interface PontoBusca {
  lat: number;
  lng: number;
  termo: string;
}

// Pino do endereço buscado: gota na cor primária, diferente das bolinhas das obras.
let buscaIconCache: L.DivIcon | null = null;
function buscaIcon(): L.DivIcon {
  if (buscaIconCache) return buscaIconCache;
  buscaIconCache = L.divIcon({
    className: 'obra-dot',
    html: `<div style="color:hsl(var(--primary)); line-height:0; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.4));">
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 30 40">
        <path fill="currentColor" stroke="white" stroke-width="1.5"
          d="M15 1C7.3 1 1 7.3 1 15c0 10 14 24 14 24s14-14 14-24C29 7.3 22.7 1 15 1z"/>
        <circle cx="15" cy="15" r="5" fill="white"/>
      </svg></div>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    tooltipAnchor: [8, -20],
  });
  return buscaIconCache;
}

interface MapControllerProps {
  /** Termo de busca JÁ com debounce — o pai segura 800ms antes de propagar. */
  termoBusca: string;
  selectedObraId?: string | null;
  /** Cresce a cada CLIQUE de seleção — reaplica o foco mesmo quando o id repetido é o
   *  mesmo (reclicar a obra selecionada depois de arrastar o mapa volta até ela). */
  focoTick: number;
  obrasComCoord: ObraComCoordenada[];
  pontoBusca: PontoBusca | null;
  onPontoBusca: (p: PontoBusca | null) => void;
  onSelectObra: (id: string | null) => void;
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
function MapController({
  termoBusca,
  selectedObraId,
  focoTick,
  obrasComCoord,
  pontoBusca,
  onPontoBusca,
  onSelectObra,
}: MapControllerProps) {
  const map = useMap();
  const usuarioMexeu = useRef(false);
  const movendoProgramatico = useRef(false);
  const ultimoFoco = useRef('');
  const ultimaBuscaFocada = useRef('');
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

    if (selectedObraId) {
      // O tick entra no alvo: reclicar a mesma obra gera alvo novo e refoca.
      const alvo = `obra:${selectedObraId}:${focoTick}`;
      if (alvo === ultimoFoco.current) return;
      const obra = obrasComCoord.find((o) => o.id === selectedObraId);
      if (obra) {
        ultimoFoco.current = alvo;
        // Sem salto brusco: aproxima até zoom de rua, mas não afasta quem já está mais perto.
        moverProgramaticamente(() =>
          map.setView([obra.latitude!, obra.longitude!], Math.max(map.getZoom(), 15))
        );
      }
      // Sem coordenada ainda: o efeito roda de novo quando a geocodificação dela chegar.
      return;
    }

    // Sem seleção: libera o foco de seleção para reaplicar depois.
    ultimoFoco.current = '';

    if (termo.length < 3) {
      ultimaBuscaFocada.current = '';
      // Busca limpa: o pino do endereço buscado sai junto.
      if (pontoBusca) onPontoBusca(null);
      return;
    }
    // Cada termo de busca é focado UMA vez. Sem esta trava, fechar o cartão de uma obra
    // com a busca ainda digitada devolvia a câmera ao alvo velho da busca — um teleporte
    // que o usuário não pediu.
    if (termo === ultimaBuscaFocada.current) return;

    const match = obrasComCoord.find(
      (o) =>
        (o.nome_obra || '').toLowerCase().includes(termo) ||
        (o.endereco_entrega || '').toLowerCase().includes(termo)
    );
    if (match) {
      ultimaBuscaFocada.current = termo;
      // Seleciona de verdade, em vez de só mover a câmera: destaca a bolinha, marca a
      // linha na lista e abre o cartão — senão a busca parava num aglomerado de pontos
      // sem dizer qual deles era o resultado. O pino de endereço de busca anterior sai.
      if (pontoBusca) onPontoBusca(null);
      onSelectObra(match.id);
      return;
    }

    // A sugestão de endereço clicada já entregou a coordenada (pontoBusca vem pronto do
    // pai): centraliza direto, sem repetir a consulta ao Nominatim.
    if (pontoBusca && pontoBusca.termo === termo) {
      ultimaBuscaFocada.current = termo;
      moverProgramaticamente(() => map.setView([pontoBusca.lat, pontoBusca.lng], 16));
      return;
    }

    // Sem match local: geocodifica a busca livre no Nominatim (a fila do módulo garante o
    // limite de 1 req/s). O termo é marcado ANTES da resposta, para os re-renders da
    // geocodificação em segundo plano não repetirem a mesma consulta.
    ultimaBuscaFocada.current = termo;
    let cancelado = false;
    geocodificar(`${termoBusca.trim()}, Brasil`)
      .then((coord) => {
        if (cancelado) return;
        if (coord) {
          // O pino marca o lugar encontrado — antes a câmera ia até lá e nada indicava o ponto.
          onPontoBusca({ lat: coord.lat, lng: coord.lng, termo });
          moverProgramaticamente(() => map.setView([coord.lat, coord.lng], 16));
        } else {
          // Endereço não encontrado: some o pino da busca anterior, que ficou sem sentido.
          onPontoBusca(null);
        }
      })
      // Serviço indisponível: a busca simplesmente não move o mapa. Sem erro na tela.
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [map, termoBusca, selectedObraId, focoTick, obrasComCoord, pontoBusca, onPontoBusca, onSelectObra]);

  return null;
}

interface CartaoObraSelecionadaProps {
  obra: ObraComCoordenada;
  onFechar: () => void;
  onVerDetalhes: (id: string) => void;
}

// Cartão flutuante da obra selecionada, sobre o canto do mapa. Substitui o Popup do
// Leaflet. Montado só quando há seleção — é isso que faz a busca dos negócios da obra
// disparar apenas na hora certa.
function CartaoObraSelecionada({ obra, onFechar, onVerDetalhes }: CartaoObraSelecionadaProps) {
  const navigate = useNavigate();
  // Mesma fonte da ficha da obra: soma feita NO BANCO pela RPC `obra_vendas`, com a decisão
  // de produto de 24/08/2026 — "Ganho" e "Em aberto" lado a lado, nunca um número só (somar
  // tudo faria orçamento parecer venda; só o ganho esconderia a oportunidade de pé).
  const { data: vendas, isLoading: carregandoVendas, isError: erroVendas } = useObraVendas(obra.id);

  return (
    <div className="absolute bottom-3 left-3 z-[1001] w-[min(360px,calc(100%-1.5rem))] rounded-lg border border-border bg-card text-card-foreground shadow-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {obra.marcador_nome && (
            <Badge className={cn('text-white border-none text-[11px] shrink-0', `bg-${obra.marcador_cor}`)}>
              {obra.marcador_nome}
            </Badge>
          )}
          {obra.spe_cnpj && (
            <span className="text-xs text-muted-foreground font-mono truncate">SPE {obra.spe_cnpj}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          title="Fechar"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="font-semibold leading-tight">{obra.nome_obra}</p>
      <p className="text-sm text-muted-foreground">
        {[obra.cliente_empresa, obra.endereco_entrega].filter(Boolean).join(' • ')}
      </p>

      {obraSemPontoNoMapa(obra) && (
        <p className="text-xs text-muted-foreground">
          Endereço não encontrado no mapa — edite o endereço da obra para posicionar o pino.
        </p>
      )}

      <div className="pt-1">
        {carregandoVendas ? (
          <Skeleton className="h-9 w-40" />
        ) : erroVendas ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os negócios da obra.</p>
        ) : vendas && vendas.total_qtd > 0 ? (
          <div className="flex gap-5">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ganho</p>
              <p className="font-semibold tabular-nums">
                {formatarMoedaBRL(vendas.ganho_valor)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {vendas.ganho_qtd} negócio(s)
                </span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Em aberto</p>
              <p className="font-semibold tabular-nums">
                {formatarMoedaBRL(vendas.aberto_valor)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {vendas.aberto_qtd} negócio(s)
                </span>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum negócio vinculado a esta obra</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onVerDetalhes(obra.id)}>
          Ver detalhes
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!obra.cliente_id}
          onClick={() => obra.cliente_id && navigate(`/clientes/${obra.cliente_id}`)}
        >
          Ver cliente
        </Button>
      </div>
    </div>
  );
}

interface MapaObrasProps {
  obras: ObraComCoordenada[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
  selectedObraId?: string | null;
  /** Cresce a cada clique de seleção — reclicar a obra já selecionada refoca a câmera. */
  focoTick: number;
  pontoBusca: PontoBusca | null;
  onPontoBusca: (p: PontoBusca | null) => void;
  onSelectObra: (id: string | null) => void;
  onVerDetalhes: (id: string) => void;
}

export function MapaObras({
  obras,
  isLoading,
  searchTerm = '',
  selectedObraId,
  focoTick,
  pontoBusca,
  onPontoBusca,
  onSelectObra,
  onVerDetalhes,
}: MapaObrasProps) {
  const { items, carregando, progresso } = useGeocodeObras(obras);
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
  const obrasSemLocalizacao = useMemo(() => items.filter(obraSemPontoNoMapa), [items]);

  const obraSelecionada = useMemo(
    () => (selectedObraId ? items.find((o) => o.id === selectedObraId) ?? null : null),
    [items, selectedObraId]
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
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    /* relative z-0 isolate confina os z-index internos do Leaflet (vão até 1000) dentro do
       wrapper — sem isso o mapa desenha por cima do Sheet de detalhes e dos diálogos (z-50).
       Tudo que flutua sobre o mapa (cartão, avisos, tela cheia) fica DENTRO deste wrapper,
       em z-[1001] — assim também aparece em tela cheia, que é pedida no próprio wrapper. */
    /* `flex-1` em vez de height:100%: o pai é sempre uma coluna flex (ver o TabsContent do
       mapa em Obras.tsx), e altura percentual dentro de item flex sem altura explícita
       resolve para "auto" — foi o que deixou o mapa encolhido no rodapé da aba. Em tela
       cheia a altura vira explícita, porque o elemento fullscreen sai do fluxo do pai. */
    <div
      ref={wrapperRef}
      className="relative z-0 isolate flex-1 flex flex-col rounded-lg overflow-hidden border border-border shadow-card bg-background"
      style={{ height: telaCheia ? '100dvh' : undefined, minHeight: 320 }}
    >
      <MapContainer
        ref={mapRef}
        center={[centro.lat, centro.lng]}
        zoom={obrasComCoord.length > 0 ? 11 : 6}
        scrollWheelZoom
        style={{ width: '100%', flex: '1 1 0%', minHeight: 0 }}
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
            icon={dotIcon(obra.marcador_cor, obra.id === selectedObraId)}
            eventHandlers={{ click: () => onSelectObra(obra.id) }}
          >
            <Tooltip permanent direction="right" offset={[2, 0]} opacity={1} className="obra-rotulo">
              {obra.nome_obra}
            </Tooltip>
          </Marker>
        ))}

        {/* Pino do endereço buscado: gota na cor primária, distinta das bolinhas das obras. */}
        {pontoBusca && (
          <Marker position={[pontoBusca.lat, pontoBusca.lng]} icon={buscaIcon()}>
            <Tooltip permanent direction="right" offset={[2, -14]} opacity={1} className="obra-rotulo">
              Endereço buscado
            </Tooltip>
          </Marker>
        )}

        <MapController
          termoBusca={termoBusca}
          selectedObraId={selectedObraId}
          focoTick={focoTick}
          obrasComCoord={obrasComCoord}
          pontoBusca={pontoBusca}
          onPontoBusca={onPontoBusca}
          onSelectObra={onSelectObra}
        />
      </MapContainer>

      {/* Avisos compactos sobre o mapa (abaixo do controle de zoom, que fica no topo-esquerda) */}
      <div className="absolute top-2 left-12 z-[1001] flex flex-col items-start gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium rounded-md border border-border bg-card/90 text-card-foreground px-2 py-1 shadow-sm">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {obrasComCoord.length} no mapa
        </span>
        {carregando && (
          <span className="flex items-center gap-1.5 text-xs font-medium rounded-md border border-border bg-card/90 text-card-foreground px-2 py-1 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Mapeando obras ({progresso.atual}/{progresso.total})…
          </span>
        )}
        {obrasSemLocalizacao.length > 0 && (
          <span
            className="flex items-center gap-1.5 text-xs rounded-md border border-border bg-card/90 text-muted-foreground px-2 py-1 shadow-sm"
            title="O endereço dessas obras não foi encontrado no mapa. Edite o endereço para tentar de novo."
          >
            {obrasSemLocalizacao.length} com endereço não encontrado
          </span>
        )}
        {tilesFalharam && (
          <span className="flex items-center gap-1.5 text-xs rounded-md border border-border bg-card/90 text-muted-foreground px-2 py-1 shadow-sm">
            <WifiOff className="h-3.5 w-3.5" />
            Falha ao carregar o fundo do mapa — verifique a conexão.
          </span>
        )}
      </div>

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

      {obraSelecionada && (
        <CartaoObraSelecionada
          obra={obraSelecionada}
          onFechar={() => onSelectObra(null)}
          onVerDetalhes={onVerDetalhes}
        />
      )}

      {obrasComCoord.length === 0 && !carregando && (
        <div className="absolute inset-x-0 bottom-3 z-[1001] text-center pointer-events-none">
          <span className="inline-block rounded-md border border-border bg-card/90 text-muted-foreground text-sm px-3 py-1.5 shadow-sm">
            Nenhuma obra com endereço geocodificado ainda. Cadastre endereços nas obras para vê-las no mapa.
          </span>
        </div>
      )}
    </div>
  );
}

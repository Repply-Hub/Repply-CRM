import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MapPin, Route, Send, AlertTriangle } from 'lucide-react';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { TracadoDaRota } from './TracadoDaRota';
import { useRotaOsrm } from '@/hooks/use-rota-osrm';
import { distanciaLegivel, duracaoLegivel } from '@/lib/osrm';
import type { RotaDoDia } from '@/lib/rota-do-dia';

/**
 * O trajeto da rota numa janela própria.
 *
 * 🔴 POR QUE NÃO É O MAPA DE OBRAS. A primeira versão (27/08/2026) trocava a aba e desenhava a
 * rota por cima do mapa geral. O Lucas pediu o contrário, e o motivo é bom: o mapa geral mostra
 * as 74 obras com coordenada, e a rota do dia tem três ou quatro. Procurar o trajeto no meio de
 * setenta pinos é trabalho, e trocar de aba ainda faz a pessoa perder o filtro e a rolagem em
 * que ela estava na lista de visitas.
 *
 * Aqui só existem as obras DA ROTA. Nada mais entra no mapa.
 *
 * 🔴 O MAPA PRECISA SER REMONTADO A CADA ABERTURA — daí a `key` no `MapContainer` e o
 * `AjustarAoAbrir`. Leaflet mede o tamanho do container UMA vez, na montagem; dentro de um
 * diálogo que ainda está abrindo, essa medida é zero, e o mapa nasce com 0x0: fica cinza, sem
 * lado nenhum, e nenhum erro aparece.
 */

interface RotaNoMapaDialogProps {
  /** A rota a mostrar. `null` fecha a janela. */
  rota: RotaDoDia | null;
  onFechar: () => void;
  /** Abre o envio por WhatsApp desta rota. */
  onEnviar?: (rota: RotaDoDia) => void;
}

/**
 * Enquadra a rota e recalcula o tamanho do mapa depois que o diálogo terminou de abrir.
 *
 * O atraso não é superstição: a animação de abertura do Radix leva uns 200ms, e medir antes dela
 * terminar devolve o tamanho do meio da transição — o mapa fica enquadrado errado, mostrando um
 * pedaço do oceano ao lado das obras.
 */
function AjustarAoAbrir({ pontos }: { pontos: Array<[number, number]> }) {
  const mapa = useMap();

  useEffect(() => {
    const ajustar = () => {
      mapa.invalidateSize();
      if (pontos.length === 1) {
        mapa.setView(pontos[0], 14);
      } else if (pontos.length > 1) {
        mapa.fitBounds(pontos, { padding: [48, 48], maxZoom: 15 });
      }
    };
    const relogio = setTimeout(ajustar, 260);
    return () => clearTimeout(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function RotaNoMapaDialog({ rota, onFechar, onEnviar }: RotaNoMapaDialogProps) {
  const paradas = useMemo(
    () =>
      (rota?.comPonto ?? []).map((p) => ({
        id: p.id,
        nome: p.obraNome,
        lat: p.latitude!,
        lng: p.longitude!,
        horario: p.inicio,
      })),
    [rota],
  );

  const pontos = useMemo(
    () => paradas.map((p) => [p.lat, p.lng] as [number, number]),
    [paradas],
  );

  const { data: trajeto, isLoading: buscando, isError: falhou } = useRotaOsrm(
    rota?.podeDesenhar ? paradas.map((p) => ({ lat: p.lat, lng: p.lng })) : null,
  );

  const aberto = !!rota;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <ConteudoDialogo className="sm:max-w-3xl">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            <span className="capitalize">
              {rota ? `Rota de ${format(rota.data, "EEEE, d 'de' MMMM", { locale: ptBR })}` : 'Rota'}
            </span>
          </DialogTitle>
          <DialogDescription>
            {rota?.comPonto.length ?? 0}{' '}
            {(rota?.comPonto.length ?? 0) === 1 ? 'parada no mapa' : 'paradas no mapa'}
            {trajeto
              ? ` · ${distanciaLegivel(trajeto.distanciaM)} · cerca de ${duracaoLegivel(trajeto.duracaoS)}`
              : ''}
            {buscando ? ' · calculando o trajeto…' : ''}
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-3">
          {falhou && (
            // Dizer o que a linha reta significa é o que evita a pessoa achar que o sistema
            // está mostrando um caminho que não existe.
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O serviço de rotas não respondeu. As linhas mostram a ordem das visitas, não o
              caminho pelas ruas.
            </p>
          )}

          {rota && rota.semPonto.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {rota.semPonto.length === 1
                ? '1 parada não aparece no mapa: a obra está sem localização no cadastro.'
                : `${rota.semPonto.length} paradas não aparecem no mapa: as obras estão sem localização no cadastro.`}{' '}
              São elas: {rota.semPonto.map((p) => p.obraNome ?? 'Obra sem nome').join(', ')}.
            </p>
          )}

          <div className="h-[52dvh] min-h-[280px] overflow-hidden rounded-lg border border-border">
            {aberto && pontos.length > 0 ? (
              <MapContainer
                // 🔴 A chave remonta o mapa quando muda de rota. Sem ela, reabrir com outro dia
                // reaproveitaria a instância antiga, e o enquadramento ficaria no dia anterior.
                key={rota!.chave}
                center={pontos[0]}
                zoom={13}
                scrollWheelZoom
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <TracadoDaRota
                  chave={rota!.chave}
                  paradas={paradas}
                  rota={falhou ? null : trajeto}
                />
                <AjustarAoAbrir pontos={pontos} />
              </MapContainer>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {buscando ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                  </span>
                ) : (
                  'Nenhuma parada desta rota tem localização no cadastro, então não há o que desenhar.'
                )}
              </div>
            )}
          </div>

          {/* A lista ao lado do mapa: o mapa mostra ONDE, a lista mostra QUANDO e em que ordem —
              e inclui as paradas sem localização, que no mapa não têm como aparecer. */}
          {rota && (
            <ol className="space-y-1">
              {rota.paradas.map((p, i) => {
                const noMapa = p.latitude != null && p.longitude != null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-md px-1 py-1 text-sm"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                        noMapa
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-dashed border-muted-foreground/50 text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {format(p.inicio, 'HH:mm')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-card-foreground">
                      {p.obraNome ?? 'Obra sem nome'}
                    </span>
                    {!noMapa && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        sem localização
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CorpoDialogo>

        <RodapeDialogo>
          {onEnviar && rota && (
            <Button
              variant="outline"
              className="mr-auto gap-2"
              onClick={() => onEnviar(rota)}
            >
              <Send className="h-4 w-4" />
              Enviar por WhatsApp
            </Button>
          )}
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

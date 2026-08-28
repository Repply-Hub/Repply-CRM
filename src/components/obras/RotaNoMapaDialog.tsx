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
import { trechosEntreParadas, type TrechoDaRota } from '@/lib/trechos-da-rota';
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

/**
 * O degrau entre uma parada e a seguinte: quanto tempo e quanto caminho separa as duas.
 *
 * 🔴 POR QUE ISTO NÃO PODIA CONTINUAR SÓ NO MAPA. O tempo por trecho já existia no traçado,
 * mas dentro de uma etiqueta de passar o mouse: para ler os três tempos de um dia era preciso
 * caçar linha por linha, uma de cada vez, e no celular — onde não existe passar o mouse — não
 * havia como ler nenhum. Quem está montando o dia precisa dos números juntos, na ordem em que
 * vai dirigir, e é isso que a lista faz.
 *
 * 🔴 A LINHINHA CINZA FICA MESMO SEM TEXTO. Ela é o que segura a altura do degrau igual nos
 * quatro estados (calculando, com número, sem localização, serviço fora). Sem ela a lista
 * inteira pula para baixo quando os tempos chegam, no meio da leitura de quem está olhando.
 */
function LinhaDoTrecho({ trecho, buscando }: { trecho: TrechoDaRota; buscando: boolean }) {
  let texto: string | null = null;

  if (trecho.tipo === 'percurso') {
    // 🔴 "cerca de" não é enfeite, e vale aqui pelo mesmo motivo que vale no mapa: o tempo sai
    // de uma estimativa que nem considera trânsito, e prometer minuto exato a quem está
    // dirigindo queima a confiança na ferramenta inteira.
    texto = `cerca de ${duracaoLegivel(trecho.duracaoS)} · ${distanciaLegivel(trecho.distanciaM)}`;
    if (trecho.indicesPulados.length === 1) {
      texto += ` · sem passar pela parada ${trecho.indicesPulados[0] + 1}`;
    } else if (trecho.indicesPulados.length > 1) {
      texto += ` · sem passar pelas paradas ${trecho.indicesPulados
        .map((indice) => indice + 1)
        .join(', ')}`;
    }
  } else if (trecho.tipo === 'sem-localizacao') {
    texto =
      trecho.ladoSemPonto === 'destino'
        ? 'sem trajeto: a próxima obra está sem localização'
        : 'sem trajeto: a obra anterior está sem localização';
  } else if (buscando) {
    texto = 'calculando o trajeto…';
  }
  // Sobra um caso: 'sem-calculo' com a busca terminada, ou seja, o serviço de rotas não
  // respondeu. Aqui o degrau fica só com a linha, DE PROPÓSITO — o aviso já está no topo da
  // janela, e repeti-lo em cada trecho empurraria a lista de paradas para fora da tela
  // justamente quando ela é a única coisa que sobrou de útil.

  return (
    <div className="flex items-center gap-2.5 pl-[13px]">
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      {texto && (
        <span className="text-[11px] leading-none text-muted-foreground">{texto}</span>
      )}
    </div>
  );
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

  /**
   * Quem está no traçado, decidido pela PRÓPRIA `comPonto` — não por um segundo teste de
   * latitude aqui dentro.
   *
   * 🔴 São a mesma pergunta feita duas vezes, e ela já estava respondida de dois jeitos: a
   * lista usava `latitude != null` e o traçado usa o teste de `rota-do-dia.ts`, que também
   * exige número finito. Uma obra com latitude `NaN` passava no primeiro e reprovava no
   * segundo — apareceria na lista como se estivesse no mapa, e o tempo de cada trecho depois
   * dela sairia deslocado uma parada. Perguntar ao conjunto que de fato virou rota fecha essa
   * porta de vez.
   */
  const noTracado = useMemo(() => new Set(rota?.comPonto ?? []), [rota]);

  // Um trecho para cada degrau da lista. A conta de qual perna pertence a qual par de paradas
  // é pura e está presa por teste em `src/lib/trechos-da-rota.ts` — é lá que mora o porquê.
  const trechos = useMemo(
    () =>
      trechosEntreParadas(
        (rota?.paradas ?? []).map((parada) => ({ temLocalizacao: noTracado.has(parada) })),
        trajeto?.pernas,
      ),
    [rota, noTracado, trajeto],
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
          {/* 🔴 O TOTAL DAQUI É A SOMA DOS TRECHOS DA LISTA, e isso foi conferido contra o
              servidor em 28/08/2026: o `duration` da rota do OSRM é exatamente a soma dos
              `duration` das pernas (1761,7s = 840,2 + 921,5), e o mesmo vale para a distância.
              O total não embute parada na obra, espera nem manobra — o OSRM só sabe de estrada.
              Por isso a lista abaixo mostra TODAS as pernas, inclusive a que pula uma obra sem
              localização: esconder uma delas faria este número deixar de fechar com o que está
              escrito na tela, e aí nenhum dos dois é acreditado.

              O que sobra de diferença é só arredondamento de escrita: cada trecho é escrito
              com 0,1 km e minuto cheio, então somar o que está na tela pode dar 21,3 km onde o
              cabeçalho diz 21,4. Daí "total" e "cerca de" — o número é a ordem de grandeza da
              viagem, não uma promessa de cronômetro. */}
          <DialogDescription>
            {rota?.comPonto.length ?? 0}{' '}
            {(rota?.comPonto.length ?? 0) === 1 ? 'parada no mapa' : 'paradas no mapa'}
            {trajeto
              ? ` · total: cerca de ${duracaoLegivel(trajeto.duracaoS)} · ${distanciaLegivel(trajeto.distanciaM)}`
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
              e inclui as paradas sem localização, que no mapa não têm como aparecer.

              🔴 O TEMPO DE DESLOCAMENTO MORA ENTRE UM ITEM E O SEGUINTE, e o horário de cada
              parada continua sendo o AGENDADO. Os dois não têm por que fechar: se a soma dos
              trechos dá 40 min e o vendedor marcou as visitas de duas em duas horas, a folga é
              escolha dele — pode ser o tempo dentro da obra, o almoço, uma margem. O OSRM só
              sabe de estrada. A tela registra as duas coisas lado a lado e não tenta
              "consertar" nenhuma. */}
          {rota && (
            <ol className="space-y-1">
              {rota.paradas.map((p, i) => {
                const noMapa = noTracado.has(p);
                const trecho = trechos[i];
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
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
                    </div>
                    {/* Rota de uma parada só não tem degrau nenhum — e a lista não fica
                        estranha por isso: é uma linha, como sempre foi. */}
                    {trecho && <LinhaDoTrecho trecho={trecho} buscando={buscando} />}
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

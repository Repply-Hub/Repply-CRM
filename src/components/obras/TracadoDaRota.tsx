import { useEffect, useState } from 'react';
import { Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { format } from 'date-fns';
import { distanciaLegivel, duracaoLegivel, type RotaCalculada } from '@/lib/osrm';

/**
 * O trajeto da rota de visita desenhado sobre o mapa de obras.
 *
 * Camada separada de propósito: `MapaObras` já tem 545 linhas, e o trajeto é uma coisa que
 * aparece por cima do mapa em vez de ser parte dele.
 *
 * 🔴 DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. QUANDO O SERVIÇO DE ROTAS FALHA, O DESENHO NÃO SOME — vira linha reta tracejada entre as
 *    paradas, na ordem das visitas. O servidor do OSRM é de demonstração e cai. Se a tela
 *    escondesse tudo nesse caso, o vendedor perderia também a informação de QUAIS obras ele vai
 *    visitar e em que ordem, que é o que ele mais precisa e que o CRM sabe sozinho. O tracejado
 *    é o que diz "esta é a sequência, não é o caminho das ruas" sem escrever nada.
 *
 * 2. UMA LINHA POR PERNA, e não uma linha só do começo ao fim. É o que permite acender um
 *    trecho quando o mouse passa por cima e mostrar o tempo DAQUELE trecho. Com uma linha só, o
 *    hover acenderia a rota inteira — o mesmo que não acender nada.
 */

export interface ParadaNoTracado {
  id: string;
  nome: string | null;
  lat: number;
  lng: number;
  horario: Date | null;
}

interface TracadoDaRotaProps {
  paradas: ParadaNoTracado[];
  rota: RotaCalculada | null | undefined;
  /**
   * Identificador da rota. Muda quando a pessoa escolhe OUTRO dia.
   *
   * 🔴 É ele que dispara o reenquadramento, e não a lista de paradas: um array novo a cada
   * desenho da tela faria o mapa voltar ao enquadramento inicial toda vez, arrancando da pessoa
   * o zoom que ela acabou de dar.
   */
  chave: string;
}

const cacheDeNumeros = new Map<string, L.DivIcon>();

/**
 * Pino numerado, para a ORDEM da rota se ler no mapa.
 *
 * Sem número, três bolinhas iguais não dizem por onde começar — e a ordem é justamente o que a
 * rota acrescenta a um punhado de obras.
 */
function pinoNumerado(numero: number, aceso: boolean): L.DivIcon {
  // 🔴 O estado aceso PRECISA entrar na chave do cache. O ícone é compartilhado entre pinos do
  // mesmo número, e sem isso acender uma parada mudaria o desenho de todas — foi exatamente a
  // armadilha que o `dotIcon` do mapa já documenta.
  const chave = `${numero}${aceso ? ':aceso' : ''}`;
  const guardado = cacheDeNumeros.get(chave);
  if (guardado) return guardado;

  const icone = L.divIcon({
    className: 'rota-pino',
    html:
      `<span class="rota-pino-inner${aceso ? ' rota-pino-aceso' : ''}">${numero}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [13, 0],
  });
  cacheDeNumeros.set(chave, icone);
  return icone;
}

export function TracadoDaRota({ paradas, rota, chave }: TracadoDaRotaProps) {
  const [pernaAcesa, setPernaAcesa] = useState<number | null>(null);
  const mapa = useMap();

  // Enquadra a rota escolhida. Sem isto, abrir a rota de um dia com obras no interior deixaria
  // o mapa parado em Natal e o traçado inteiro fora da tela — a pessoa clicaria em "ver no
  // mapa" e não veria nada mudar.
  useEffect(() => {
    if (paradas.length < 2) return;
    const limites = L.latLngBounds(paradas.map((p) => [p.lat, p.lng] as [number, number]));
    mapa.fitBounds(limites, { padding: [64, 64], maxZoom: 14, animate: true });
    // Só a chave: ver o comentário da prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (paradas.length < 2) return null;

  const pontos = paradas.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <>
      {paradas.slice(0, -1).map((parada, i) => {
        const perna = rota?.pernas[i];
        // A geometria da perna pode vir vazia mesmo com a rota calculada (servidor respondeu
        // sem os passos). Aí este trecho cai na reta, sozinho, sem derrubar os outros.
        const temRuas = !!perna && perna.tracado.length > 1;
        const caminho = temRuas ? perna!.tracado : [pontos[i], pontos[i + 1]];
        const aceso = pernaAcesa === i;

        return (
          <Polyline
            key={`${parada.id}-${i}`}
            positions={caminho}
            pathOptions={{
              color: aceso ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.55)',
              weight: aceso ? 7 : 4,
              // Tracejado é o que diz "sequência, não caminho" sem precisar de legenda.
              dashArray: temRuas ? undefined : '6 8',
              lineCap: 'round',
            }}
            eventHandlers={{
              mouseover: () => setPernaAcesa(i),
              mouseout: () => setPernaAcesa(null),
            }}
          >
            {/* `sticky` faz a etiqueta seguir o mouse ao longo da linha, em vez de ficar presa
                no meio dela — numa perna longa o meio pode estar fora da tela. */}
            <Tooltip sticky direction="top" opacity={1}>
              {perna ? (
                <span>
                  {distanciaLegivel(perna.distanciaM)} ·{' '}
                  {/* 🔴 "cerca de" não é enfeite: o tempo vem de uma estimativa de trânsito
                      público, e prometer minuto exato a quem está dirigindo queima a confiança
                      na ferramenta inteira. */}
                  cerca de {duracaoLegivel(perna.duracaoS)}
                </span>
              ) : (
                <span>Trajeto pelas ruas indisponível — esta é a ordem das visitas</span>
              )}
            </Tooltip>
          </Polyline>
        );
      })}

      {paradas.map((parada, i) => (
        <Marker
          key={parada.id}
          position={[parada.lat, parada.lng]}
          icon={pinoNumerado(i + 1, pernaAcesa === i || pernaAcesa === i - 1)}
          zIndexOffset={1000}
        >
          <Tooltip direction="right" offset={[4, 0]} opacity={1} className="obra-rotulo">
            {parada.horario ? `${format(parada.horario, 'HH:mm')} — ` : ''}
            {parada.nome ?? 'Obra sem nome'}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

import { describe, it, expect } from 'vitest';
import {
  urlDaRota,
  lerRespostaDaRota,
  duracaoLegivel,
  distanciaLegivel,
  type PontoNoMapa,
} from './osrm';

/**
 * Três obras reais de Natal/RN, conferidas contra o servidor de verdade em 27/08/2026:
 * a resposta veio com code "Ok", 19.7 km, 22 min, 2 pernas (6,3 km/7 min e 13,4 km/15 min) e
 * uma LineString de 586 pontos.
 *
 * 🔴 Repare que lat e lng são os DOIS negativos e da mesma ordem de grandeza. É exatamente
 * por isso que a inversão lng/lat passa despercebida aqui: -5.8127 e -35.2094 trocados de
 * lugar continuam parecendo "um par de coordenadas de Natal". Os testes abaixo prendem a
 * ordem nas duas direções (o que sai na URL e o que entra no traçado).
 */
const OBRA_A: PontoNoMapa = { lat: -5.8127, lng: -35.2094 };
const OBRA_B: PontoNoMapa = { lat: -5.856, lng: -35.198 };
const OBRA_C: PontoNoMapa = { lat: -5.79, lng: -35.25 };

/** Resposta no formato do servidor, encurtada na geometria (a real trouxe 586 pontos). */
function respostaDeTresObras() {
  return {
    code: 'Ok',
    routes: [
      {
        distance: 19700,
        duration: 1320,
        legs: [
          { distance: 6300, duration: 420 },
          { distance: 13400, duration: 900 },
        ],
        geometry: {
          type: 'LineString',
          // Em [lng, lat], que é como o OSRM entrega.
          coordinates: [
            [-35.2094, -5.8127],
            [-35.2031, -5.8342],
            [-35.198, -5.856],
            [-35.25, -5.79],
          ],
        },
      },
    ],
  };
}

describe('urlDaRota', () => {
  it('inverte lat/lng para lng/lat, que é a ordem que o OSRM espera na URL', () => {
    const url = urlDaRota([OBRA_A, OBRA_B]);

    // Longitude primeiro. Os zeros à direita somem porque number vira texto (-35.1980 →
    // "-35.198"); o OSRM aceita as duas formas.
    expect(url).toBe(
      'https://router.project-osrm.org/route/v1/driving/' +
        '-35.2094,-5.8127;-35.198,-5.856?overview=full&geometries=geojson&steps=true',
    );
  });

  it('🔴 nunca escreve o par na ordem do Leaflet (lat,lng) na URL', () => {
    const url = urlDaRota([OBRA_A, OBRA_B]);

    // Se este teste cair, o traço vai aparecer do outro lado do planeta sem erro nenhum.
    expect(url).toContain('-35.2094,-5.8127');
    expect(url).not.toContain('-5.8127,-35.2094');
  });

  it('mantém a ordem das paradas, separadas por ponto-e-vírgula', () => {
    const url = urlDaRota([OBRA_A, OBRA_B, OBRA_C]);
    const trechoDasCoordenadas = url.split('/driving/')[1].split('?')[0];

    expect(trechoDasCoordenadas).toBe('-35.2094,-5.8127;-35.198,-5.856;-35.25,-5.79');
  });

  it('pede overview=full e geometries=geojson', () => {
    // Sem geojson o OSRM devolve polyline codificada, que a leitura não sabe desenhar.
    expect(urlDaRota([OBRA_A, OBRA_B])).toContain('?overview=full&geometries=geojson&steps=true');
  });

  it('devolve string vazia com menos de 2 pontos, em vez de URL inválida', () => {
    expect(urlDaRota([])).toBe('');
    expect(urlDaRota([OBRA_A])).toBe('');
  });

  it('devolve string vazia quando alguma obra está sem coordenada', () => {
    // Obra cadastrada sem geolocalização: viraria "undefined,undefined" dentro da URL.
    const semCoordenada = { lat: undefined as unknown as number, lng: -35.2 };

    expect(urlDaRota([OBRA_A, semCoordenada])).toBe('');
    expect(urlDaRota([OBRA_A, { lat: NaN, lng: -35.2 }])).toBe('');
  });
});

/**
 * Resposta com `steps`, que é o que a URL pede de verdade (`steps=true`). Conferida contra o
 * servidor real em 27/08/2026: cada perna traz os seus passos, e cada passo a sua geometria.
 */
function respostaComPassos() {
  const passo = (coords: number[][]) => ({ geometry: { type: 'LineString', coordinates: coords } });
  return {
    code: 'Ok',
    routes: [{
      distance: 19700,
      duration: 1320,
      geometry: { type: 'LineString', coordinates: [[-35.211, -5.7945], [-35.175, -5.8827], [-35.25, -5.79]] },
      legs: [
        {
          distance: 6300, duration: 420,
          // Dois passos que se emendam: o último ponto do primeiro é o primeiro do segundo.
          steps: [passo([[-35.211, -5.7945], [-35.19, -5.8]]), passo([[-35.19, -5.8], [-35.175, -5.8827]])],
        },
        { distance: 13400, duration: 900, steps: [passo([[-35.175, -5.8827], [-35.25, -5.79]])] },
      ],
    }],
  };
}

describe('lerRespostaDaRota', () => {
  it('lê distância e duração da resposta conferida contra o servidor', () => {
    const rota = lerRespostaDaRota(respostaDeTresObras());

    expect(rota).not.toBeNull();
    expect(rota!.distanciaM).toBe(19700);
    expect(rota!.duracaoS).toBe(1320);
  });

  it('🔴 converte a geometria de [lng, lat] do OSRM para [lat, lng] do Leaflet', () => {
    const rota = lerRespostaDaRota(respostaDeTresObras());

    // Primeiro ponto do traçado é a obra A: latitude -5.8127 na frente, longitude -35.2094
    // atrás. Invertido, o Leaflet desenharia perto da Antártida — sem reclamar de nada.
    expect(rota!.tracado[0]).toEqual([-5.8127, -35.2094]);
    expect(rota!.tracado[rota!.tracado.length - 1]).toEqual([-5.79, -35.25]);
  });

  it('ida e volta: o que entra em lat/lng volta em lat/lng, na mesma ordem', () => {
    const url = urlDaRota([OBRA_A, OBRA_B]);
    const rota = lerRespostaDaRota(respostaDeTresObras());

    // A URL leva longitude primeiro; o traçado devolve latitude primeiro. As duas pontas
    // presas no mesmo teste é o que impede alguém de "consertar" uma delas sozinha.
    expect(url).toContain(`${OBRA_A.lng},${OBRA_A.lat}`);
    expect(rota!.tracado[0]).toEqual([OBRA_A.lat, OBRA_A.lng]);
  });

  it('N paradas dão N-1 pernas', () => {
    const rota = lerRespostaDaRota(respostaDeTresObras());

    // Três obras, duas pernas: A→B e B→C.
    expect(rota!.pernas).toHaveLength(2);
    expect(rota!.pernas[0]).toMatchObject({ distanciaM: 6300, duracaoS: 420 });
    expect(rota!.pernas[1]).toMatchObject({ distanciaM: 13400, duracaoS: 900 });
  });

  it('🔴 cada perna traz o traçado DELA, para acender um trecho sozinho', () => {
    // Sem isto só existiria o traço inteiro, do começo ao fim, e passar o mouse numa perna
    // acenderia a rota toda — que é o mesmo que não acender nada.
    const rota = lerRespostaDaRota(respostaComPassos());
    expect(rota!.pernas[0].tracado).toEqual([[-5.7945, -35.211], [-5.8, -35.19], [-5.8827, -35.175]]);
    expect(rota!.pernas[1].tracado).toEqual([[-5.8827, -35.175], [-5.79, -35.25]]);
  });

  it('🔴 o ponto de emenda entre dois passos não é repetido', () => {
    // O último ponto de um passo é o primeiro do seguinte. Repetir engorda o desenho a cada
    // manobra — invisível na tela, e por isso mesmo fácil de deixar passar.
    const rota = lerRespostaDaRota(respostaComPassos());
    const t = rota!.pernas[0].tracado;
    for (let i = 1; i < t.length; i++) expect(t[i]).not.toEqual(t[i - 1]);
  });

  it('🔴 sem os passos, a ROTA continua desenhando — só o realce some', () => {
    // O servidor público às vezes responde sem `steps`. Perder o realce por trecho é um
    // arranhão; perder o trajeto inteiro por causa dele seria o estrago.
    const rota = lerRespostaDaRota(respostaDeTresObras());
    expect(rota).not.toBeNull();
    expect(rota!.tracado.length).toBeGreaterThan(0);
    expect(rota!.pernas.every((p) => p.tracado.length === 0)).toBe(true);
  });

  it('passo torto é pulado, não derruba a perna', () => {
    const bruto = respostaComPassos();
    // @ts-expect-error — mexendo no fixture de propósito
    bruto.routes[0].legs[0].steps.splice(1, 0, { geometry: 'ktp}Aj{|nP' }, null);
    const rota = lerRespostaDaRota(bruto);
    expect(rota).not.toBeNull();
    expect(rota!.pernas[0].tracado.length).toBeGreaterThan(0);
  });

  it('devolve null em code NoRoute (obras que o carro não liga)', () => {
    expect(lerRespostaDaRota({ code: 'NoRoute', message: 'Impossible route' })).toBeNull();
  });

  it('devolve null em code TooBig (rota longa demais para o servidor público)', () => {
    expect(lerRespostaDaRota({ code: 'TooBig', message: 'Too many coordinates' })).toBeNull();
  });

  it('devolve null quando a resposta não traz routes', () => {
    expect(lerRespostaDaRota({ code: 'Ok' })).toBeNull();
    expect(lerRespostaDaRota({ code: 'Ok', routes: [] })).toBeNull();
    expect(lerRespostaDaRota({ code: 'Ok', routes: 'nada disso' })).toBeNull();
  });

  it('devolve null quando vem HTML de erro em vez de JSON', () => {
    // Servidor sobrecarregado responde página de erro; o fetch entrega texto.
    expect(lerRespostaDaRota('<html><body>502 Bad Gateway</body></html>')).toBeNull();
    expect(lerRespostaDaRota(null)).toBeNull();
    expect(lerRespostaDaRota(undefined)).toBeNull();
    expect(lerRespostaDaRota([])).toBeNull();
    expect(lerRespostaDaRota(42)).toBeNull();
  });

  it('devolve null quando distância ou duração não são número', () => {
    const semDistancia = respostaDeTresObras();
    (semDistancia.routes[0] as Record<string, unknown>).distance = null;
    expect(lerRespostaDaRota(semDistancia)).toBeNull();

    // A duração precisa do caso dela. Com o teste conferindo só a distância, apagar metade da
    // guarda passava despercebido — e uma duração ausente vira "menos de 1 min" na tela, que
    // é uma resposta plausível para uma rota de 19,7 km e por isso ninguém desconfia.
    const semDuracao = respostaDeTresObras();
    (semDuracao.routes[0] as Record<string, unknown>).duration = null;
    expect(lerRespostaDaRota(semDuracao)).toBeNull();
  });

  it('devolve null quando as pernas não vieram', () => {
    const resposta = respostaDeTresObras();
    delete (resposta.routes[0] as Record<string, unknown>).legs;

    expect(lerRespostaDaRota(resposta)).toBeNull();
  });

  it('devolve null quando a geometria não é LineString', () => {
    const semGeometria = respostaDeTresObras();
    delete (semGeometria.routes[0] as Record<string, unknown>).geometry;
    expect(lerRespostaDaRota(semGeometria)).toBeNull();

    // Polyline codificada: string em vez de lista de pontos.
    const codificada = respostaDeTresObras();
    (codificada.routes[0] as Record<string, unknown>).geometry = 'ktp}Aj{|nPmA?';
    expect(lerRespostaDaRota(codificada)).toBeNull();
  });

  it('devolve null quando algum ponto do traçado está quebrado', () => {
    const parIncompleto = respostaDeTresObras();
    parIncompleto.routes[0].geometry.coordinates = [[-35.2094, -5.8127], [-35.2031]] as never;
    expect(lerRespostaDaRota(parIncompleto)).toBeNull();

    const naoNumerico = respostaDeTresObras();
    naoNumerico.routes[0].geometry.coordinates = [['-35.2094', '-5.8127']] as never;
    expect(lerRespostaDaRota(naoNumerico)).toBeNull();
  });

  it('devolve null quando o par vem fora da faixa do globo', () => {
    // Par invertido em longitude alta: lido como latitude, -122 não existe.
    const invertido = respostaDeTresObras();
    invertido.routes[0].geometry.coordinates = [[-37.77, -122.42]] as never;

    expect(lerRespostaDaRota(invertido)).toBeNull();
  });

  /**
   * 🔴 Os testes daqui para baixo existem porque os de cima passavam SEM a guarda que diziam
   * conferir. Foram achados apagando cada guarda do código e vendo quais testes reclamavam:
   * sete delas podiam sumir inteiras com a suíte toda verde. Um teste que continua verde
   * depois de a proteção ser apagada não protege nada — só dá a impressão de proteger, que é
   * pior, porque a próxima pessoa apaga a linha "morta" confiando na suíte.
   */

  it('🔴 recusa code diferente de Ok mesmo com routes preenchido', () => {
    // Os testes de NoRoute e TooBig acima passam pelo motivo errado: as respostas deles não
    // têm `routes`, então parariam na conferência seguinte de qualquer jeito. Só este caso
    // prende a leitura do campo `code`.
    const mentiroso = { ...respostaDeTresObras(), code: 'NoRoute' };

    expect(lerRespostaDaRota(mentiroso)).toBeNull();
  });

  it('🔴 recusa geometria de outro tipo de GeoJSON com coordenadas em forma de LineString', () => {
    // MultiPoint tem exatamente a mesma forma de coordenadas ([[lng, lat], ...]). O teste da
    // polyline codificada não cobre isto: string é barrada antes, na conferência de objeto.
    // Sem a linha do `type`, isto viraria um traçado desenhado a partir de pontos soltos.
    const multiPonto = respostaDeTresObras();
    multiPonto.routes[0].geometry.type = 'MultiPoint';

    expect(lerRespostaDaRota(multiPonto)).toBeNull();
  });

  it('devolve null quando uma perna vem sem número, em vez de mandar lixo para a tela', () => {
    // Perna sem distância viraria "0 m até a próxima obra" — número plausível, e o vendedor
    // sairia acreditando que a obra é na esquina.
    const pernaQuebrada = respostaDeTresObras();
    (pernaQuebrada.routes[0].legs[1] as Record<string, unknown>).distance = null;

    expect(lerRespostaDaRota(pernaQuebrada)).toBeNull();
  });

  it('🔴 não explode quando uma perna vem null', () => {
    // Ler `.distance` de null é TypeError. A função promete null em erro — aqui é onde essa
    // promessa se prova, e não em mais nenhum dos outros testes.
    const pernaNula = respostaDeTresObras();
    pernaNula.routes[0].legs = [null] as never;

    expect(lerRespostaDaRota(pernaNula)).toBeNull();
  });

  it('🔴 não explode quando coordinates vem como algo que não se percorre', () => {
    // `for...of` num número estoura "is not iterable". É a única forma de resposta ruim que
    // derrubaria a tela do vendedor em vez de simplesmente esconder o traçado.
    const naoIteravel = respostaDeTresObras();
    naoIteravel.routes[0].geometry.coordinates = 42 as never;

    expect(lerRespostaDaRota(naoIteravel)).toBeNull();
  });

  it('devolve null quando a LineString vem sem nenhum ponto', () => {
    // Traçado vazio não desenha nada, e quem centraliza o mapa em `tracado[0]` pega undefined.
    // Melhor não ter rota do que ter uma rota que existe e não leva a lugar nenhum.
    const semPontos = respostaDeTresObras();
    semPontos.routes[0].geometry.coordinates = [];

    expect(lerRespostaDaRota(semPontos)).toBeNull();
  });
});

describe('duracaoLegivel', () => {
  it('não escreve "0 min" para trajeto de segundos', () => {
    expect(duracaoLegivel(0)).toBe('menos de 1 min');
    expect(duracaoLegivel(59)).toBe('menos de 1 min');
  });

  it('escreve minutos abaixo de uma hora', () => {
    expect(duracaoLegivel(1320)).toBe('22 min'); // os 22 min da rota real
    expect(duracaoLegivel(60)).toBe('1 min');
    expect(duracaoLegivel(420)).toBe('7 min');
  });

  it('escreve horas com o minuto em dois dígitos', () => {
    expect(duracaoLegivel(3900)).toBe('1h05');
    expect(duracaoLegivel(3600)).toBe('1h00');
    expect(duracaoLegivel(9000)).toBe('2h30');
  });

  it('🔴 59min59 vira "1h00", nunca "60 min"', () => {
    expect(duracaoLegivel(3599)).toBe('1h00');
  });
});

describe('distanciaLegivel', () => {
  it('escreve quilômetro com vírgula decimal', () => {
    expect(distanciaLegivel(19700)).toBe('19,7 km');
    expect(distanciaLegivel(6300)).toBe('6,3 km');
    expect(distanciaLegivel(13400)).toBe('13,4 km');
  });

  it('🔴 nunca deixa escapar ponto decimal na tela', () => {
    // "19.7 km" é como o toFixed devolve, e não é como o brasileiro lê.
    expect(distanciaLegivel(19700)).not.toContain('.');
    expect(distanciaLegivel(1234)).not.toContain('.');
  });

  it('escreve metro arredondado na dezena abaixo de 1 km', () => {
    expect(distanciaLegivel(850)).toBe('850 m');
    expect(distanciaLegivel(847)).toBe('850 m');
    expect(distanciaLegivel(800)).toBe('800 m');
  });

  it('995 m vira "1,0 km" em vez do esquisito "1000 m"', () => {
    expect(distanciaLegivel(995)).toBe('1,0 km');
    expect(distanciaLegivel(1000)).toBe('1,0 km');
  });

  it('não quebra com valor ausente ou negativo', () => {
    expect(distanciaLegivel(0)).toBe('0 m');
    expect(distanciaLegivel(-5)).toBe('0 m');
    expect(distanciaLegivel(undefined as unknown as number)).toBe('0 m');
  });
});

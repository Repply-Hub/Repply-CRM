import { describe, it, expect } from 'vitest';
import { agruparEmRotasDoDia, rotaDaChave, type VisitaParaRota } from './rota-do-dia';

/**
 * Coordenadas de verdade no Rio Grande do Norte: a MD Representações é de Natal, e é lá que
 * ficam as obras dela. Usar cidade de outro estado aqui faria o teste passar do mesmo jeito e
 * deixaria uma pista falsa sobre a base — e a ordem lat/lng é justamente o erro que
 * `src/lib/osrm.ts` documenta como invisível nesta região.
 */
const NATAL = { latitude: -5.7945, longitude: -35.211 };
const PARNAMIRIM = { latitude: -5.9156, longitude: -35.2628 };
const MOSSORO = { latitude: -5.1875, longitude: -37.3441 };

const FABIOLA = 'fabiola-uuid';
const LUCAS = 'lucas-uuid';

/**
 * Cria uma visita. `hora` e `minuto` no fuso LOCAL de propósito: é assim que o `new Date` do
 * navegador entrega o horário que a pessoa digitou na tela.
 */
function visita(
  id: string,
  dia: number,
  hora: number,
  minuto = 0,
  extras: Partial<VisitaParaRota> = {},
): VisitaParaRota {
  return {
    id,
    obraId: `obra-${id}`,
    obraNome: `Obra ${id}`,
    inicio: new Date(2026, 7, dia, hora, minuto), // agosto/2026
    criadoPor: FABIOLA,
    ...NATAL,
    ...extras,
  };
}

describe('agruparEmRotasDoDia', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(agruparEmRotasDoDia([])).toEqual([]);
  });

  it('junta na MESMA rota as visitas do mesmo dia e do mesmo criador', () => {
    const rotas = agruparEmRotasDoDia([
      visita('a', 27, 9),
      visita('b', 27, 10),
      visita('c', 27, 11),
    ]);

    expect(rotas).toHaveLength(1);
    expect(rotas[0].paradas.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('separa em rotas diferentes as visitas de dias diferentes', () => {
    const rotas = agruparEmRotasDoDia([visita('a', 27, 9), visita('b', 28, 9)]);

    expect(rotas).toHaveLength(2);
    // Contar as paradas não basta: [1, 1] continuaria verde se a visita do dia 27 caísse na
    // rota do dia 28 e vice-versa. É preciso dizer QUAL parada foi para QUAL dia.
    expect(rotas.map((r) => [r.data.getDate(), r.paradas.map((p) => p.id)])).toEqual([
      [28, ['b']],
      [27, ['a']],
    ]);
  });

  it('🔴 separa por CRIADOR: dois vendedores no mesmo dia são duas rotas, não uma', () => {
    // Hoje a base tem ZERO dias assim, mas com os 13 da equipe isso vira rotina. Sem esta
    // separação, um dia de campo da Fabíola em Parnamirim e do Lucas em Mossoró viraria uma
    // rota só, com as paradas intercaladas por horário e um traçado que ninguém percorreu.
    const rotas = agruparEmRotasDoDia([
      visita('fab-1', 27, 9, 0, { ...PARNAMIRIM }),
      visita('luc-1', 27, 10, 0, { criadoPor: LUCAS, ...MOSSORO }),
      visita('fab-2', 27, 11, 0, { ...PARNAMIRIM }),
    ]);

    expect(rotas).toHaveLength(2);

    const daFabiola = rotas.find((r) => r.criadoPor === FABIOLA);
    const doLucas = rotas.find((r) => r.criadoPor === LUCAS);

    expect(daFabiola?.paradas.map((p) => p.id)).toEqual(['fab-1', 'fab-2']);
    expect(doLucas?.paradas.map((p) => p.id)).toEqual(['luc-1']);
  });

  it('🔴 as paradas ficam em ordem CRONOLÓGICA, mesmo chegando embaralhadas do banco', () => {
    // Esta é a decisão que este teste existe para travar: a tela de criar rota deixa arrastar
    // as paradas, mas essa ordem NÃO é gravada em coluna nenhuma — ela só sobrevive no horário
    // sugerido (09:00, 10:00, 11:00...). O horário é o único critério que reproduz o caminho
    // que a pessoa vai de fato dirigir. Se algum dia alguém trocar por "ordem do banco" ou
    // por `id`, o mapa vai desenhar um zigue-zague plausível e errado — e este teste cai.
    const rotas = agruparEmRotasDoDia([
      visita('terceira', 27, 11),
      visita('primeira', 27, 9),
      visita('quarta', 27, 14, 30),
      visita('segunda', 27, 10),
    ]);

    expect(rotas[0].paradas.map((p) => p.id)).toEqual([
      'primeira',
      'segunda',
      'terceira',
      'quarta',
    ]);
    expect(rotas[0].comPonto.map((p) => p.id)).toEqual([
      'primeira',
      'segunda',
      'terceira',
      'quarta',
    ]);
  });

  it('🔴 duas paradas no MESMO horário saem sempre na mesma ordem', () => {
    // O desempate por `id` estava escrito no código e não tinha teste nenhum — todo teste de
    // ordem usava horários diferentes, então esse ramo do comparador nunca rodava.
    // Empate de horário é comum: a importação do Bitrix traz evento sem hora e todos caem no
    // mesmo instante. Sem desempate, a ordem das paradas passa a depender de como o banco
    // devolveu as linhas, e o mesmo dia aparece numa ordem a cada recarga — o traçado do mapa
    // muda sozinho e a lista "dança" debaixo do dedo de quem está lendo.
    const naOrdem = agruparEmRotasDoDia([visita('a', 27, 9), visita('b', 27, 9)]);
    const aoContrario = agruparEmRotasDoDia([visita('b', 27, 9), visita('a', 27, 9)]);

    expect(naOrdem[0].paradas.map((p) => p.id)).toEqual(['a', 'b']);
    expect(aoContrario[0].paradas.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('dia com UMA parada só continua na lista, mas não dá para desenhar', () => {
    const rotas = agruparEmRotasDoDia([visita('sozinha', 27, 9)]);

    expect(rotas).toHaveLength(1);
    expect(rotas[0].paradas).toHaveLength(1);
    expect(rotas[0].comPonto).toHaveLength(1);
    expect(rotas[0].podeDesenhar).toBe(false);
  });

  it('duas paradas com coordenada já dão um traçado', () => {
    const rotas = agruparEmRotasDoDia([
      visita('a', 27, 9, 0, { ...PARNAMIRIM }),
      visita('b', 27, 10, 0, { ...MOSSORO }),
    ]);

    expect(rotas[0].podeDesenhar).toBe(true);
  });

  it('🔴 obra SEM coordenada não some: vai para semPonto e continua entre as paradas', () => {
    // 8 das 82 obras da MD estão sem lat/lng porque a geocodificação não achou o endereço.
    // Sumir com elas faria a pessoa achar que a visita não foi cadastrada.
    const rotas = agruparEmRotasDoDia([
      visita('com', 27, 9),
      visita('sem', 27, 10, 0, { latitude: null, longitude: null }),
    ]);

    expect(rotas[0].paradas.map((p) => p.id)).toEqual(['com', 'sem']);
    expect(rotas[0].comPonto.map((p) => p.id)).toEqual(['com']);
    expect(rotas[0].semPonto.map((p) => p.id)).toEqual(['sem']);
    // Só um ponto desenhável: não há caminho para traçar.
    expect(rotas[0].podeDesenhar).toBe(false);
  });

  it('meia coordenada (só latitude) conta como SEM ponto', () => {
    const rotas = agruparEmRotasDoDia([
      visita('meia', 27, 9, 0, { latitude: -5.7945, longitude: null }),
      visita('nenhuma', 27, 10, 0, { latitude: undefined, longitude: undefined }),
    ]);

    expect(rotas[0].comPonto).toHaveLength(0);
    expect(rotas[0].semPonto).toHaveLength(2);
    expect(rotas[0].podeDesenhar).toBe(false);
  });

  it('🔴 latitude ZERO é coordenada válida — o equador corta o Amapá', () => {
    // `if (v.latitude && v.longitude)` mandaria uma obra de Macapá para semPonto e ela sumiria
    // do mapa sem explicação. O teste é de TIPO, não de verdade.
    const rotas = agruparEmRotasDoDia([
      visita('macapa', 27, 9, 0, { latitude: 0, longitude: -51.0694 }),
      visita('natal', 27, 10),
    ]);

    expect(rotas[0].comPonto.map((p) => p.id)).toEqual(['macapa', 'natal']);
    expect(rotas[0].semPonto).toHaveLength(0);
    expect(rotas[0].podeDesenhar).toBe(true);
  });

  it('a chave é ESTÁVEL: mesma entrada, mesma chave, em qualquer ordem', () => {
    const entrada = [visita('a', 27, 9), visita('b', 27, 15)];

    const primeira = agruparEmRotasDoDia(entrada)[0].chave;
    const segunda = agruparEmRotasDoDia(entrada)[0].chave;
    const embaralhada = agruparEmRotasDoDia([...entrada].reverse())[0].chave;

    expect(primeira).toBe(segunda);
    expect(embaralhada).toBe(primeira);
    expect(primeira).toBe(`2026-08-27__${FABIOLA}`);
  });

  it('🔴 a chave usa o fuso LOCAL: uma visita das 23h50 fica no dia dela', () => {
    // Com `toISOString` esta visita viraria 2026-08-28 (UTC-3 depois das 21h) e sairia da rota
    // que a pessoa dirigiu no dia 27. É o erro clássico de data no Brasil.
    const rotas = agruparEmRotasDoDia([visita('tarde-da-noite', 27, 23, 50)]);

    expect(rotas[0].chave).toBe(`2026-08-27__${FABIOLA}`);
    expect(rotas[0].data.getDate()).toBe(27);
  });

  it('🔴 virada de dia: 23h50 e 00h10 são rotas DIFERENTES', () => {
    const rotas = agruparEmRotasDoDia([
      visita('noite', 27, 23, 50),
      visita('madrugada', 28, 0, 10),
    ]);

    expect(rotas).toHaveLength(2);
    expect(rotas.map((r) => r.chave)).toEqual([
      `2026-08-28__${FABIOLA}`,
      `2026-08-27__${FABIOLA}`,
    ]);
  });

  it('as rotas vêm da mais RECENTE para a mais antiga', () => {
    const rotas = agruparEmRotasDoDia([
      visita('meio', 20, 9),
      visita('velha', 3, 9),
      visita('nova', 27, 9),
    ]);

    expect(rotas.map((r) => r.data.getDate())).toEqual([27, 20, 3]);
  });

  it('a data da rota é a MEIA-NOITE do dia, não o horário da primeira parada', () => {
    const rotas = agruparEmRotasDoDia([visita('a', 27, 14, 35)]);
    const { data } = rotas[0];

    expect(data.getHours()).toBe(0);
    expect(data.getMinutes()).toBe(0);
    expect(data.getSeconds()).toBe(0);
    expect(data.getMilliseconds()).toBe(0);
    expect(data.getDate()).toBe(27);
  });

  it('não quebra com obraNome, criadoPor e latitude nulos', () => {
    const rotas = agruparEmRotasDoDia([
      visita('a', 27, 9, 0, {
        obraNome: null,
        criadoPor: null,
        latitude: null,
        longitude: null,
      }),
      visita('b', 27, 10, 0, { obraNome: null, criadoPor: null }),
    ]);

    expect(rotas).toHaveLength(1);
    expect(rotas[0].criadoPor).toBeNull();
    expect(rotas[0].chave).toBe('2026-08-27__sem-autor');
    expect(rotas[0].paradas.map((p) => p.id)).toEqual(['a', 'b']);
    expect(rotas[0].semPonto.map((p) => p.id)).toEqual(['a']);
  });

  it('visita sem criador não se mistura com a de quem tem criador', () => {
    const rotas = agruparEmRotasDoDia([
      visita('orfa', 27, 9, 0, { criadoPor: null }),
      visita('da-fabiola', 27, 10),
    ]);

    expect(rotas).toHaveLength(2);
  });

  it('🔴 uma linha com data quebrada não derruba a lista inteira', () => {
    // A importação do Bitrix ainda produz evento sem `data_inicio`. O `format` do date-fns
    // lança RangeError em data inválida — e, no meio da montagem da tela, UMA linha ruim
    // apagaria todas as rotas do vendedor.
    const rotas = agruparEmRotasDoDia([
      visita('boa', 27, 9),
      { ...visita('ruim', 27, 10), inicio: new Date('nada disso') },
      visita('outra-boa', 27, 11),
    ]);

    expect(rotas).toHaveLength(1);
    expect(rotas[0].paradas.map((p) => p.id)).toEqual(['boa', 'outra-boa']);
  });

  it('não mexe no array que recebeu, nem nos horários das visitas', () => {
    const entrada = [visita('c', 27, 11), visita('a', 27, 9), visita('b', 27, 10)];
    const ordemOriginal = entrada.map((v) => v.id);
    const horariosOriginais = entrada.map((v) => v.inicio.getTime());

    agruparEmRotasDoDia(entrada);

    expect(entrada.map((v) => v.id)).toEqual(ordemOriginal);
    // 🔴 Conferir só a ordem do array deixava passar a mutação que mais assusta: trocar
    // `startOfDay(v.inicio)` por um `v.inicio.setHours(0, 0, 0, 0)` — que parece a mesma
    // coisa e é mais curto — ZERA o horário de cada visita dentro do objeto que veio da tela.
    // A agenda que compartilha esses objetos passaria a mostrar todas as visitas à meia-noite.
    expect(entrada.map((v) => v.inicio.getTime())).toEqual(horariosOriginais);
  });
});

describe('rotaDaChave', () => {
  it('acha a rota pela chave', () => {
    const rotas = agruparEmRotasDoDia([visita('a', 27, 9), visita('b', 28, 9)]);
    const achada = rotaDaChave(rotas, `2026-08-27__${FABIOLA}`);

    expect(achada?.paradas.map((p) => p.id)).toEqual(['a']);
  });

  it('devolve undefined quando a chave não existe, e não quebra com chave vazia', () => {
    const rotas = agruparEmRotasDoDia([visita('a', 27, 9)]);

    expect(rotaDaChave(rotas, '2020-01-01__ninguem')).toBeUndefined();
    expect(rotaDaChave(rotas, '')).toBeUndefined();
    expect(rotaDaChave([], `2026-08-27__${FABIOLA}`)).toBeUndefined();
  });
});

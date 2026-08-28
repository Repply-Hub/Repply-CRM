import { describe, it, expect } from 'vitest';
import { trechosEntreParadas, type TrechoDaRota } from './trechos-da-rota';
import type { PernaDaRota } from './osrm';

/**
 * Números conferidos contra o servidor de verdade em 28/08/2026, com três pontos em Natal/RN
 * (`router.project-osrm.org`, code "Ok"):
 *
 *   perna 1 ....... 840,2 s · 9.848,7 m
 *   perna 2 ....... 921,5 s · 11.503,8 m
 *   rota inteira .. 1.761,7 s · 21.352,5 m   ← exatamente a soma das duas
 *
 * O total do OSRM NÃO inclui nada além das pernas — nem tempo parado na obra, nem espera. É o
 * que o teste "a soma dos trechos é o total da rota" prende: se um dia um trecho sumir da lista
 * (foi o que quase aconteceu com a perna que pula uma obra sem localização), o cabeçalho passa
 * a dizer um número que a tela não consegue justificar.
 */
const PERNA_A: PernaDaRota = { distanciaM: 9848.7, duracaoS: 840.2, tracado: [] };
const PERNA_B: PernaDaRota = { distanciaM: 11503.8, duracaoS: 921.5, tracado: [] };
const TOTAL_DA_ROTA = { distanciaM: 21352.5, duracaoS: 1761.7 };

const COM = { temLocalizacao: true };
const SEM = { temLocalizacao: false };

function somaDosPercursos(trechos: TrechoDaRota[]) {
  return trechos.reduce(
    (soma, trecho) =>
      trecho.tipo === 'percurso'
        ? { distanciaM: soma.distanciaM + trecho.distanciaM, duracaoS: soma.duracaoS + trecho.duracaoS }
        : soma,
    { distanciaM: 0, duracaoS: 0 },
  );
}

describe('trechosEntreParadas — o caso comum', () => {
  it('põe um trecho entre cada parada e a seguinte, na ordem das pernas', () => {
    const trechos = trechosEntreParadas([COM, COM, COM], [PERNA_A, PERNA_B]);

    expect(trechos).toHaveLength(2);
    expect(trechos[0]).toEqual({
      tipo: 'percurso',
      distanciaM: 9848.7,
      duracaoS: 840.2,
      indicesPulados: [],
    });
    expect(trechos[1]).toEqual({
      tipo: 'percurso',
      distanciaM: 11503.8,
      duracaoS: 921.5,
      indicesPulados: [],
    });
  });

  it('🔴 a soma dos trechos mostrados é o total da rota — é o que alinha o cabeçalho com a lista', () => {
    const trechos = trechosEntreParadas([COM, COM, COM], [PERNA_A, PERNA_B]);

    expect(somaDosPercursos(trechos)).toEqual(TOTAL_DA_ROTA);
  });

  it('rota de uma parada só não tem trecho nenhum', () => {
    expect(trechosEntreParadas([COM], [])).toEqual([]);
    expect(trechosEntreParadas([], [])).toEqual([]);
    expect(trechosEntreParadas(undefined as never, [])).toEqual([]);
  });
});

describe('trechosEntreParadas — obra sem localização no cadastro', () => {
  it('🔴 não inventa tempo até uma obra que o mapa não sabe onde fica', () => {
    // A parada 2 (índice 1) está sem coordenada: o OSRM traça 1→3, e só.
    const trechos = trechosEntreParadas([COM, SEM, COM], [PERNA_A]);

    expect(trechos[0]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
  });

  it('🔴 a perna que pula a obra sem localização continua na lista, dizendo quem ela não visita', () => {
    const trechos = trechosEntreParadas([COM, SEM, COM], [PERNA_A]);

    expect(trechos).toHaveLength(2);
    expect(trechos[1]).toEqual({
      tipo: 'percurso',
      distanciaM: 9848.7,
      duracaoS: 840.2,
      // Índice na lista COMPLETA — a tela escreve "sem passar pela parada 2".
      indicesPulados: [1],
    });
    // E o total continua fechando: nenhuma perna ficou escondida.
    expect(somaDosPercursos(trechos)).toEqual({ distanciaM: 9848.7, duracaoS: 840.2 });
  });

  it('🔴 nunca desloca a perna errada para o par errado', () => {
    // Quatro paradas, a segunda sem coordenada: as pernas são 1→3 e 3→4. Um `pernas[i]` direto
    // colocaria a perna 3→4 entre as paradas 2 e 3 — o número plausível e errado.
    const trechos = trechosEntreParadas([COM, SEM, COM, COM], [PERNA_A, PERNA_B]);

    expect(trechos).toHaveLength(3);
    expect(trechos[0].tipo).toBe('sem-localizacao');
    expect(trechos[1]).toMatchObject({ tipo: 'percurso', duracaoS: 840.2, indicesPulados: [1] });
    expect(trechos[2]).toMatchObject({ tipo: 'percurso', duracaoS: 921.5, indicesPulados: [] });
    expect(somaDosPercursos(trechos)).toEqual(TOTAL_DA_ROTA);
  });

  it('duas obras sem localização em sequência entram as duas no aviso do trecho que as pula', () => {
    const trechos = trechosEntreParadas([COM, SEM, SEM, COM], [PERNA_A]);

    expect(trechos[0]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
    expect(trechos[1]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
    expect(trechos[2]).toMatchObject({ tipo: 'percurso', indicesPulados: [1, 2] });
  });

  it('quando a rota COMEÇA numa obra sem localização, o degrau diz que falta a origem', () => {
    // O traçado do OSRM começa na segunda parada: não existe perna para o primeiro degrau.
    const trechos = trechosEntreParadas([SEM, COM, COM], [PERNA_A]);

    expect(trechos[0]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'origem' });
    expect(trechos[1]).toMatchObject({ tipo: 'percurso', duracaoS: 840.2, indicesPulados: [] });
  });

  it('quando a rota TERMINA numa obra sem localização, o último degrau fica sem trajeto', () => {
    const trechos = trechosEntreParadas([COM, COM, SEM], [PERNA_A]);

    expect(trechos[0]).toMatchObject({ tipo: 'percurso', duracaoS: 840.2 });
    expect(trechos[1]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
  });

  it('com nenhuma obra localizada não sobra nenhum número na tela', () => {
    const trechos = trechosEntreParadas([SEM, SEM, SEM], null);

    expect(trechos.every((t) => t.tipo === 'sem-localizacao')).toBe(true);
  });
});

describe('trechosEntreParadas — quando o trajeto não veio', () => {
  it('sem pernas (buscando, ou serviço fora do ar) nenhum trecho mostra número', () => {
    const trechos = trechosEntreParadas([COM, COM, COM], undefined);

    expect(trechos).toEqual([{ tipo: 'sem-calculo' }, { tipo: 'sem-calculo' }]);
  });

  it('🔴 a parada sem localização continua avisada mesmo sem trajeto — isso o CRM sabe sozinho', () => {
    const trechos = trechosEntreParadas([COM, SEM, COM], null);

    expect(trechos[0]).toEqual({ tipo: 'sem-localizacao', ladoSemPonto: 'destino' });
    expect(trechos[1]).toEqual({ tipo: 'sem-calculo' });
  });

  it('🔴 quantidade de pernas diferente da prevista não casa torto: fica sem número', () => {
    // Três paradas pedem duas pernas. Uma só significa que a correspondência quebrou em algum
    // ponto — mostrar o que veio colaria o tempo de um trecho no par de paradas errado.
    const trechos = trechosEntreParadas([COM, COM, COM], [PERNA_A]);

    expect(trechos).toEqual([{ tipo: 'sem-calculo' }, { tipo: 'sem-calculo' }]);
  });

  it('perna a mais também é recusada, e não silenciosamente ignorada', () => {
    const trechos = trechosEntreParadas([COM, COM], [PERNA_A, PERNA_B]);

    expect(trechos).toEqual([{ tipo: 'sem-calculo' }]);
  });
});

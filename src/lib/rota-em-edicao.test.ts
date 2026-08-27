import { describe, it, expect } from 'vitest';
import {
  diferencaDaRota,
  type ParadaEditada,
  type ParadaGravada,
} from './rota-em-edicao';

/**
 * Obras de verdade da carteira da MD, em Natal. Nome real ajuda a ler o teste como a Fabíola
 * leria a tela: "Residencial Mares" é a parada que carrega a observação de campo em vários
 * casos aqui, e é ela que não pode sumir.
 */
const MARES = 'obra-residencial-mares';
const ALPHAVILLE = 'obra-alphaville';
const PONTA_NEGRA = 'obra-ponta-negra';

const DIA = '2026-08-27';

/** Uma parada como o banco devolve. Por padrão SEM registro de campo. */
function gravada(
  grupoId: string,
  obraId: string,
  hora: number,
  minuto = 0,
  extras: Partial<ParadaGravada> = {},
): ParadaGravada {
  return {
    grupoId,
    obraId,
    // Fuso LOCAL de propósito: é assim que o horário digitado na tela volta do banco.
    inicio: new Date(2026, 7, 27, hora, minuto),
    visitaRealizada: false,
    visitaObservacao: null,
    ...extras,
  };
}

/** Uma parada como a tela devolve depois da edição. */
function editada(obraId: string, horario: string, grupoId?: string | null): ParadaEditada {
  return { obraId, horario, grupoId };
}

describe('diferencaDaRota — o caminho comum', () => {
  it('só mudou o horário de uma parada: ela entra em alterar e mais nada acontece', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '10:30', 'g1'), editada(ALPHAVILLE, '11:00', 'g2')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar).toEqual([
      { grupoId: 'g1', inicio: new Date(2026, 7, 27, 10, 30), fim: new Date(2026, 7, 27, 11, 30) },
    ]);
    expect(diff.remover).toEqual([]);
    expect(diff.inserir).toEqual([]);
    expect(diff.semMudanca).toBe(false);
  });

  it('nada mudou: as três listas vazias e semMudanca verdadeiro', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '09:00', 'g1'), editada(ALPHAVILLE, '11:00', 'g2')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff).toEqual({ alterar: [], remover: [], inserir: [], semMudanca: true });
  });

  it('parada tirada da rota vai para remover pelo grupo', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '09:00', 'g1')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.remover).toEqual(['g2']);
    expect(diff.alterar).toEqual([]);
    expect(diff.inserir).toEqual([]);
    expect(diff.semMudanca).toBe(false);
  });

  it('parada acrescentada agora (sem grupoId) vai para inserir', () => {
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '09:00', 'g1'), editada(PONTA_NEGRA, '14:00')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.inserir).toEqual([
      {
        obraId: PONTA_NEGRA,
        inicio: new Date(2026, 7, 27, 14, 0),
        fim: new Date(2026, 7, 27, 15, 0),
      },
    ]);
    expect(diff.alterar).toEqual([]);
    expect(diff.remover).toEqual([]);
  });

  it('grupoId nulo conta como parada nova, igual a grupoId ausente', () => {
    const diff = diferencaDaRota([], [editada(PONTA_NEGRA, '08:00', null)], DIA);

    expect(diff.inserir).toHaveLength(1);
    expect(diff.inserir[0].obraId).toBe(PONTA_NEGRA);
    expect(diff.alterar).toEqual([]);
  });

  it('alterar, remover e inserir na mesma edição', () => {
    const antes = [
      gravada('g1', MARES, 9),
      gravada('g2', ALPHAVILLE, 11),
      gravada('g3', PONTA_NEGRA, 15),
    ];
    const depois = [
      editada(MARES, '09:00', 'g1'), // intocada
      editada(ALPHAVILLE, '10:00', 'g2'), // adiantou
      editada('obra-nova', '16:30'), // nova
      // g3 sumiu da tela
    ];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar.map((a) => a.grupoId)).toEqual(['g2']);
    expect(diff.remover).toEqual(['g3']);
    expect(diff.inserir.map((i) => i.obraId)).toEqual(['obra-nova']);
    expect(diff.semMudanca).toBe(false);
  });
});

describe('diferencaDaRota — reordenação', () => {
  it('reordenação pura troca os horários das duas paradas e as duas entram em alterar', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    // A pessoa arrastou Alphaville para cima: quem estava às 9 passa a 11 e vice-versa.
    const depois = [editada(ALPHAVILLE, '09:00', 'g2'), editada(MARES, '11:00', 'g1')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar).toEqual([
      { grupoId: 'g2', inicio: new Date(2026, 7, 27, 9, 0), fim: new Date(2026, 7, 27, 10, 0) },
      { grupoId: 'g1', inicio: new Date(2026, 7, 27, 11, 0), fim: new Date(2026, 7, 27, 12, 0) },
    ]);
    expect(diff.remover).toEqual([]);
    expect(diff.inserir).toEqual([]);
  });

  it('arrastar sem trocar horário nenhum não gera mudança', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    // Só a ordem da lista na tela mudou; cada parada continua no seu horário.
    const depois = [editada(ALPHAVILLE, '11:00', 'g2'), editada(MARES, '09:00', 'g1')];

    expect(diferencaDaRota(antes, depois, DIA).semMudanca).toBe(true);
  });
});

describe('diferencaDaRota — listas vazias e nulas', () => {
  it('duas listas vazias devolvem semMudanca', () => {
    expect(diferencaDaRota([], [], DIA)).toEqual({
      alterar: [],
      remover: [],
      inserir: [],
      semMudanca: true,
    });
  });

  it('listas nulas não explodem', () => {
    expect(() => diferencaDaRota(null as unknown as never, undefined as unknown as never, DIA)).not.toThrow();
    expect(diferencaDaRota(null as unknown as never, undefined as unknown as never, DIA).semMudanca).toBe(true);
  });

  it('esvaziar a rota inteira é resultado legítimo: remove todos os grupos', () => {
    const antes = [
      gravada('g1', MARES, 9),
      gravada('g2', ALPHAVILLE, 11),
      gravada('g3', PONTA_NEGRA, 15),
    ];

    const diff = diferencaDaRota(antes, [], DIA);

    expect(diff.remover).toEqual(['g1', 'g2', 'g3']);
    expect(diff.semMudanca).toBe(false);
  });

  it('rota nova do zero: tudo é inserção', () => {
    const diff = diferencaDaRota([], [editada(MARES, '08:00'), editada(ALPHAVILLE, '10:00')], DIA);

    expect(diff.inserir).toHaveLength(2);
    expect(diff.alterar).toEqual([]);
    expect(diff.remover).toEqual([]);
  });
});

describe('diferencaDaRota — grupoId fantasma', () => {
  it('grupoId que não existe no banco vira INSERIR, nunca alterar', () => {
    // Um UPDATE nesse grupo afetaria 0 linhas sem erro nenhum: a parada sumiria calada.
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '09:00', 'g1'), editada(PONTA_NEGRA, '14:00', 'g-fantasma')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar).toEqual([]);
    expect(diff.inserir).toEqual([
      {
        obraId: PONTA_NEGRA,
        inicio: new Date(2026, 7, 27, 14, 0),
        fim: new Date(2026, 7, 27, 15, 0),
      },
    ]);
    expect(diff.remover).toEqual([]);
  });

  it('grupo fantasma não arrasta a parada gravada de verdade para a remoção', () => {
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(PONTA_NEGRA, '14:00', 'g-fantasma')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.remover).toEqual(['g1']); // g1 saiu da tela, então sai mesmo
    expect(diff.inserir).toHaveLength(1);
    expect(diff.alterar).toEqual([]);
  });

  it('o mesmo grupo repetido na tela: o segundo vira inserção, não um segundo UPDATE', () => {
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '10:00', 'g1'), editada(MARES, '16:00', 'g1')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar).toEqual([
      { grupoId: 'g1', inicio: new Date(2026, 7, 27, 10, 0), fim: new Date(2026, 7, 27, 11, 0) },
    ]);
    expect(diff.inserir).toEqual([
      { obraId: MARES, inicio: new Date(2026, 7, 27, 16, 0), fim: new Date(2026, 7, 27, 17, 0) },
    ]);
  });
});

describe('diferencaDaRota — horário inválido', () => {
  it('horário vazio descarta a parada sem colocá-la em lista nenhuma', () => {
    const diff = diferencaDaRota([], [editada(MARES, '')], DIA);

    expect(diff).toEqual({ alterar: [], remover: [], inserir: [], semMudanca: true });
  });

  it('horário "abc" não vira parada', () => {
    const diff = diferencaDaRota([], [editada(MARES, 'abc'), editada(ALPHAVILLE, '09:00')], DIA);

    expect(diff.inserir.map((i) => i.obraId)).toEqual([ALPHAVILLE]);
  });

  it('horário "25:00" não vira Data inválida nem parada', () => {
    const diff = diferencaDaRota([], [editada(MARES, '25:00'), editada(MARES, '10:61')], DIA);

    expect(diff.inserir).toEqual([]);
    expect(diff.semMudanca).toBe(true);
  });

  it('🔴 parada gravada com horário inválido na tela NÃO vai para remover', () => {
    // Se fosse para remover, o registro de campo dela iria embora junto — por causa de um
    // campo que a pessoa ainda estava digitando.
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '', 'g1'), editada(ALPHAVILLE, '11:00', 'g2')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.remover).toEqual([]);
    expect(diff.alterar).toEqual([]);
    expect(diff.inserir).toEqual([]);
    expect(diff.semMudanca).toBe(true);
  });

  it('hora de um dígito ("9:05") é aceita', () => {
    const diff = diferencaDaRota([], [editada(MARES, '9:05')], DIA);

    expect(diff.inserir[0].inicio).toEqual(new Date(2026, 7, 27, 9, 5));
  });

  it('🔴 data da rota ilegível não apaga a rota: devolve "nada a fazer"', () => {
    // Sem esta guarda, toda parada editada seria descartada e a rota inteira cairia em
    // remover — um parâmetro malformado zerando o dia.
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '09:00', 'g1'), editada(ALPHAVILLE, '11:00', 'g2')];

    for (const dataRuim of ['', '27/08/2026', '2026-13-01', '2026-02-31', null as unknown as never]) {
      const diff = diferencaDaRota(antes, depois, dataRuim);
      expect(diff).toEqual({ alterar: [], remover: [], inserir: [], semMudanca: true });
    }
  });
});

describe('diferencaDaRota — duração', () => {
  it('duração padrão é 60 minutos', () => {
    const diff = diferencaDaRota([], [editada(MARES, '09:00')], DIA);

    expect(diff.inserir[0].fim).toEqual(new Date(2026, 7, 27, 10, 0));
  });

  it('duração personalizada de 90 minutos vale para inserir e para alterar', () => {
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '08:00', 'g1'), editada(ALPHAVILLE, '13:00')];

    const diff = diferencaDaRota(antes, depois, DIA, 90);

    expect(diff.alterar[0].fim).toEqual(new Date(2026, 7, 27, 9, 30));
    expect(diff.inserir[0].fim).toEqual(new Date(2026, 7, 27, 14, 30));
  });

  it('duração de 30 minutos encurta a parada', () => {
    const diff = diferencaDaRota([], [editada(MARES, '09:00')], DIA, 30);

    expect(diff.inserir[0].fim).toEqual(new Date(2026, 7, 27, 9, 30));
  });

  it('duração inválida (zero, negativa, texto) cai no padrão de 60 minutos', () => {
    const esperado = new Date(2026, 7, 27, 10, 0);

    expect(diferencaDaRota([], [editada(MARES, '09:00')], DIA, 0).inserir[0].fim).toEqual(esperado);
    expect(diferencaDaRota([], [editada(MARES, '09:00')], DIA, -30).inserir[0].fim).toEqual(
      esperado,
    );
    expect(
      diferencaDaRota([], [editada(MARES, '09:00')], DIA, Number.NaN).inserir[0].fim,
    ).toEqual(esperado);
  });

  it('duração infinita também cai no padrão, em vez de virar Data inválida', () => {
    // `Number.isFinite` é a metade da guarda que NaN não exercita: Infinity passa em
    // `duracao > 0` numa boa, e `instante + Infinity` não dá erro nenhum — devolve uma Data
    // inválida, que chega ao banco como fim nulo e deixa a parada sem hora de término.
    const diff = diferencaDaRota(
      [],
      [editada(MARES, '09:00')],
      DIA,
      Number.POSITIVE_INFINITY,
    );

    expect(diff.inserir[0].fim).toEqual(new Date(2026, 7, 27, 10, 0));
  });
});

describe('diferencaDaRota — fuso e virada de data', () => {
  it('🔴 primeiro dia do mês fica no próprio mês, não na noite do dia 31 anterior', () => {
    // new Date('2026-09-01') devolveria 31/08 às 21h no horário de Brasília.
    const diff = diferencaDaRota([], [editada(MARES, '09:00')], '2026-09-01');

    const inicio = diff.inserir[0].inicio;
    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(8); // setembro
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(9);
  });

  it('🔴 meia-noite do dia 1º de março não recua para fevereiro', () => {
    const diff = diferencaDaRota([], [editada(MARES, '00:00')], '2026-03-01');

    const inicio = diff.inserir[0].inicio;
    expect(inicio.getMonth()).toBe(2); // março
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(0);
  });

  it('parada no fim do dia empurra o fim para o dia seguinte', () => {
    const diff = diferencaDaRota([], [editada(MARES, '23:30')], '2026-08-31');

    const fim = diff.inserir[0].fim;
    expect(fim.getMonth()).toBe(8); // setembro
    expect(fim.getDate()).toBe(1);
    expect(fim.getHours()).toBe(0);
    expect(fim.getMinutes()).toBe(30);
  });

  it('ano bissexto: 29 de fevereiro de 2028 é dia válido', () => {
    const diff = diferencaDaRota([], [editada(MARES, '08:00')], '2028-02-29');

    expect(diff.inserir[0].inicio.getDate()).toBe(29);
    expect(diff.inserir[0].inicio.getMonth()).toBe(1);
  });
});

describe('diferencaDaRota — o que já foi registrado em campo', () => {
  it('🔴 a diferença não menciona visita realizada nem observação em lugar nenhum', () => {
    // A preservação acontece por NÃO TOCAR nesses campos. Se o diff os citasse, o UPDATE
    // passaria a escrevê-los com o que a tela tinha em memória e a anotação viraria nulo.
    const antes = [
      gravada('g1', MARES, 9, 0, {
        visitaRealizada: true,
        visitaObservacao: 'cliente pediu orçamento de porcelanato',
      }),
      gravada('g2', ALPHAVILLE, 11),
      gravada('g3', PONTA_NEGRA, 15, 0, { visitaRealizada: true, visitaObservacao: 'obra parada' }),
    ];
    const depois = [
      editada(MARES, '09:00', 'g1'), // intocada
      editada(ALPHAVILLE, '12:00', 'g2'), // só esta mudou
      editada('obra-nova', '17:00'),
      // g3 saiu da rota
    ];

    const diff = diferencaDaRota(antes, depois, DIA);
    const serializado = JSON.stringify(diff);

    expect(serializado).not.toMatch(/visita/i);
    expect(serializado).not.toContain('porcelanato');
    expect(serializado).not.toContain('obra parada');

    // E as formas exatas: nenhum campo a mais que os quatro combinados.
    expect(Object.keys(diff).sort()).toEqual(['alterar', 'inserir', 'remover', 'semMudanca']);
    expect(Object.keys(diff.alterar[0]).sort()).toEqual(['fim', 'grupoId', 'inicio']);
    expect(Object.keys(diff.inserir[0]).sort()).toEqual(['fim', 'inicio', 'obraId']);
  });

  it('a parada visitada e intocada não aparece em nenhuma das três listas', () => {
    const antes = [
      gravada('g1', MARES, 9, 0, {
        visitaRealizada: true,
        visitaObservacao: 'cliente pediu orçamento de porcelanato',
      }),
      gravada('g2', ALPHAVILLE, 11),
    ];
    // A pessoa abriu a rota só para corrigir o horário da OUTRA parada.
    const depois = [editada(MARES, '09:00', 'g1'), editada(ALPHAVILLE, '14:00', 'g2')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar.map((a) => a.grupoId)).not.toContain('g1');
    expect(diff.remover).not.toContain('g1');
    expect(JSON.stringify(diff)).not.toContain('g1');
  });

  it('trocar a obra de uma parada gravada não vira alteração (limite conhecido)', () => {
    // `alterar` não carrega obraId. Enquanto for assim, a tela não pode deixar trocar a obra
    // de uma parada já salva — tem de ser remover + inserir. Este teste existe para a decisão
    // aparecer na cara de quem for mudá-la.
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(ALPHAVILLE, '09:00', 'g1')];

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.semMudanca).toBe(true);
  });
});

describe('diferencaDaRota — várias cópias do mesmo compromisso', () => {
  it('compromisso com várias cópias (uma por participante) é removido uma vez só', () => {
    // Medido no banco: 251 linhas para 160 compromissos, o maior com 11 cópias. Quem chama
    // apaga TODAS as cópias do grupo; a lista cita o grupo, não a linha.
    const antes = [
      gravada('g1', MARES, 9),
      gravada('g1', MARES, 9), // mesma parada, outro participante
      gravada('g1', MARES, 9),
      gravada('g2', ALPHAVILLE, 11),
    ];

    const diff = diferencaDaRota(antes, [editada(ALPHAVILLE, '11:00', 'g2')], DIA);

    expect(diff.remover).toEqual(['g1']);
  });

  it('compromisso com várias cópias é alterado uma vez só', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g1', MARES, 9)];

    const diff = diferencaDaRota(antes, [editada(MARES, '10:00', 'g1')], DIA);

    expect(diff.alterar).toEqual([
      { grupoId: 'g1', inicio: new Date(2026, 7, 27, 10, 0), fim: new Date(2026, 7, 27, 11, 0) },
    ]);
    expect(diff.remover).toEqual([]);
  });
});

/**
 * Os testes abaixo nasceram de uma revisão por MUTAÇÃO feita em 27/08/2026: cada guarda do
 * código foi apagada ou invertida, uma de cada vez, para ver se algum teste reclamava. Os que
 * ninguém pegou estão presos aqui. O nome de cada um diz o que ele mata.
 */
describe('diferencaDaRota — guardas que a mutação pegou soltas', () => {
  it('🔴 data ilegível não deixa passar a metade DESTRUTIVA: a parada tirada da tela não sai', () => {
    // O teste "data da rota ilegível" lá de cima passava mesmo SEM a guarda da data, porque
    // toda parada que continua na tela é salva pela preservação do horário ilegível. O que a
    // guarda protege de verdade é a parada que a pessoa TIROU da tela: sem ela, `alterar` e
    // `inserir` saem vazios (nenhum horário vira instante) e a remoção passa sozinha — a
    // exclusão é gravada e a correção de horário da mesma edição some calada.
    const antes = [
      gravada('g1', MARES, 9),
      gravada('g2', ALPHAVILLE, 11),
      gravada('g3', PONTA_NEGRA, 15),
    ];
    const depois = [
      editada(MARES, '09:00', 'g1'),
      editada(ALPHAVILLE, '10:00', 'g2'), // correção de horário
      // g3 foi tirada da tela: com data boa iria para `remover`
    ];

    for (const dataRuim of ['', '27/08/2026', '2026-13-01', '2026-02-31', null as unknown as never]) {
      const diff = diferencaDaRota(antes, depois, dataRuim);

      expect(diff.remover).toEqual([]);
      expect(diff).toEqual({ alterar: [], remover: [], inserir: [], semMudanca: true });
    }
  });

  it('🔴 data ilegível com a rota esvaziada na tela também não apaga nada', () => {
    const antes = [gravada('g1', MARES, 9), gravada('g2', ALPHAVILLE, 11)];

    expect(diferencaDaRota(antes, [], '2026-13-01').remover).toEqual([]);
  });

  it('🔴 acrescentar parada nova conta como mudança (semMudanca falso)', () => {
    // Nenhum teste exercitava `semMudanca` com SÓ inserção. Se ele ignorasse `inserir`, a tela
    // leria "nada mudou", fecharia sem tocar no banco, e a parada que a pessoa acabou de
    // acrescentar nunca existiria — sem erro nenhum aparecer.
    expect(diferencaDaRota([], [editada(MARES, '08:00')], DIA).semMudanca).toBe(false);

    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '09:00', 'g1'), editada(PONTA_NEGRA, '14:00')];
    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar).toEqual([]);
    expect(diff.remover).toEqual([]);
    expect(diff.inserir).toHaveLength(1);
    expect(diff.semMudanca).toBe(false);
  });

  it('🔴 evento gravado sem grupo (compromisso avulso do dia) não entra em remover', () => {
    // A consulta do dia traz TODOS os eventos, e compromisso que não nasceu de rota não tem
    // grupo. Sem a guarda, ele entraria no mapa com chave vazia e sairia em `remover` — e quem
    // chama apagaria por grupo nulo, mexendo em linha que não é da rota.
    const antes = [
      gravada('g1', MARES, 9),
      gravada('ignorado', ALPHAVILLE, 11, 0, { grupoId: null }),
      gravada('ignorado', PONTA_NEGRA, 15, 0, { grupoId: '' }),
    ];

    const diff = diferencaDaRota(antes, [editada(MARES, '09:00', 'g1')], DIA);

    expect(diff.remover).toEqual([]);
    expect(diff.semMudanca).toBe(true);
  });

  it('parada gravada com início nulo não explode e vai para alterar', () => {
    // O banco pode devolver início nulo, e a tela chama isto no meio do carregamento. Sem a
    // conferência de tipo, `.getTime()` de um nulo derruba a tela inteira da rota.
    const antes = [gravada('g1', MARES, 9, 0, { inicio: null })];

    expect(() => diferencaDaRota(antes, [editada(MARES, '09:00', 'g1')], DIA)).not.toThrow();

    const diff = diferencaDaRota(antes, [editada(MARES, '09:00', 'g1')], DIA);

    // Início ilegível é caso de CORRIGIR, não de ignorar: manda o horário novo.
    expect(diff.alterar).toEqual([
      { grupoId: 'g1', inicio: new Date(2026, 7, 27, 9, 0), fim: new Date(2026, 7, 27, 10, 0) },
    ]);
    expect(diff.remover).toEqual([]);
  });

  it('parada gravada cujo início veio como TEXTO do banco não explode e vai para alterar', () => {
    // O Supabase devolve data como texto. Se a linha crua chegar aqui sem passar por `new
    // Date`, `inicio` é string — e string não tem `.getTime()`.
    const antes = [
      gravada('g1', MARES, 9, 0, { inicio: '2026-08-27T09:00:00' as unknown as Date }),
    ];

    const diff = diferencaDaRota(antes, [editada(MARES, '09:00', 'g1')], DIA);

    expect(diff.alterar.map((a) => a.grupoId)).toEqual(['g1']);
    expect(diff.remover).toEqual([]);
  });

  it('linha nula no meio das listas não derruba a tela', () => {
    // A tela chama isto com o carregamento pela metade; uma posição vazia na lista não pode
    // virar "não foi possível abrir a rota".
    const antes = [gravada('g1', MARES, 9), null, gravada('g2', ALPHAVILLE, 11)];
    const depois = [editada(MARES, '10:00', 'g1'), null, editada(ALPHAVILLE, '11:00', 'g2')];

    expect(() => diferencaDaRota(antes, depois, DIA)).not.toThrow();

    const diff = diferencaDaRota(antes, depois, DIA);

    expect(diff.alterar.map((a) => a.grupoId)).toEqual(['g1']);
    expect(diff.remover).toEqual([]);
    expect(diff.inserir).toEqual([]);
  });

  it('minuto 60 exato ("10:60") não vira 11:00 calado', () => {
    // "10:61" já era testado, mas ele morre no `> 59` E no `> 60` — não separa os dois. Só o
    // 60 exato prova que o limite é 59: `new Date(..., 10, 60)` rola para 11:00 no mesmo dia,
    // e a conferência de calendário (que só olha ano/mês/dia) deixaria passar.
    const diff = diferencaDaRota([], [editada(MARES, '10:60')], DIA);

    expect(diff.inserir).toEqual([]);
    expect(diff.semMudanca).toBe(true);
  });

  it('espaço em volta da data e do horário não descarta a parada', () => {
    const diff = diferencaDaRota([], [editada(MARES, ' 09:00 ')], ' 2026-08-27 ');

    expect(diff.inserir[0].inicio).toEqual(new Date(2026, 7, 27, 9, 0));
    expect(diff.inserir[0].fim).toEqual(new Date(2026, 7, 27, 10, 0));
  });

  it('data e horário com sujeira em volta são RECUSADOS, não adivinhados', () => {
    // As âncoras do padrão não são enfeite. Sem elas, "2026-08-27T00:00:00" e "09:00:00"
    // seriam aceitos pelo pedaço que casa no meio do texto — e o sistema passaria a adivinhar
    // formato em vez de recusar o que não combinou.
    const antes = [gravada('g1', MARES, 9)];
    const depois = [editada(MARES, '10:00', 'g1')];

    // Data com hora colada: cai na guarda da data e devolve "nada a fazer".
    expect(diferencaDaRota(antes, depois, '2026-08-27T00:00:00')).toEqual({
      alterar: [],
      remover: [],
      inserir: [],
      semMudanca: true,
    });

    // Horário com segundos: a parada é descartada, e o grupo dela fica PRESERVADO.
    const comSegundos = diferencaDaRota(antes, [editada(MARES, '10:00:00', 'g1')], DIA);
    expect(comSegundos.inserir).toEqual([]);
    expect(comSegundos.alterar).toEqual([]);
    expect(comSegundos.remover).toEqual([]);
  });
});

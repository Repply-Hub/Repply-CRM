import { describe, it, expect } from 'vitest';
import {
  consultaCasaComTodos,
  detectarMencao,
  filtrarPessoas,
  inserirMencao,
  mencionadosNoTexto,
  partesComMencao,
} from './mencao';

const PESSOAS = [
  { id: 'u1', nome: 'Ângela Souza' },
  { id: 'u2', nome: 'Angelo Reis' },
  { id: 'u3', nome: 'Carlos Lima' },
];

describe('detectarMencao', () => {
  it('abre com @ no começo ou depois de espaço', () => {
    expect(detectarMencao('@eri', 4)).toEqual({ consulta: 'eri', inicio: 0 });
    expect(detectarMencao('bom dia @eri', 12)).toEqual({ consulta: 'eri', inicio: 8 });
  });

  it('@ sozinho abre com consulta vazia', () => {
    expect(detectarMencao('oi @', 4)).toEqual({ consulta: '', inicio: 3 });
  });

  it('não abre em e-mail nem depois de espaço', () => {
    expect(detectarMencao('fulano@empresa', 14)).toBeNull();
    expect(detectarMencao('@eri ', 5)).toBeNull();
  });

  it('olha só até o cursor', () => {
    expect(detectarMencao('@eri depois', 4)).toEqual({ consulta: 'eri', inicio: 0 });
  });
});

describe('filtrarPessoas', () => {
  it('sem acento e sem maiúscula: "ang" acha Ângela e Angelo', () => {
    expect(filtrarPessoas(PESSOAS, 'ang').map((p) => p.id)).toEqual(['u1', 'u2']);
  });

  it('acha pelo sobrenome', () => {
    expect(filtrarPessoas(PESSOAS, 'lima').map((p) => p.id)).toEqual(['u3']);
  });

  it('consulta vazia devolve todos, até o limite', () => {
    expect(filtrarPessoas(PESSOAS, '', 2)).toHaveLength(2);
  });

  it('quem começa com a consulta vem antes', () => {
    const lista = [{ id: 'a', nome: 'Ana Carla' }, { id: 'b', nome: 'Carla Souza' }];
    expect(filtrarPessoas(lista, 'carla').map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('inserirMencao', () => {
  it('troca "@eri" pelo nome inteiro e põe o cursor depois do espaço', () => {
    expect(inserirMencao('bom dia @ang tudo bem', { consulta: 'ang', inicio: 8 }, 'Ângela Souza')).toEqual({
      texto: 'bom dia @Ângela Souza  tudo bem',
      cursor: 22,
    });
  });

  it('quando a consulta está no fim do texto, não sobra nada depois do espaço', () => {
    expect(inserirMencao('bom dia @ang', { consulta: 'ang', inicio: 8 }, 'Ângela Souza')).toEqual({
      texto: 'bom dia @Ângela Souza ',
      cursor: 22,
    });
  });
});

describe('mencionadosNoTexto', () => {
  const escolhidos = new Map([['u1', 'Ângela Souza'], ['u3', 'Carlos Lima']]);

  it('só vale quem continua escrito no texto', () => {
    expect(mencionadosNoTexto('@Ângela Souza pode ver?', escolhidos)).toEqual({ ids: ['u1'], todos: false });
  });

  it('@todos e @all marcam todos, em qualquer caixa', () => {
    expect(mencionadosNoTexto('@todos reunião às 15h', new Map()).todos).toBe(true);
    expect(mencionadosNoTexto('atenção @ALL.', new Map()).todos).toBe(true);
  });

  it('"@todoscontente" não é @todos', () => {
    expect(mencionadosNoTexto('@todoscontente', new Map()).todos).toBe(false);
  });

  it('@todos seguido de pontuação sem espaço também marca todos', () => {
    expect(mencionadosNoTexto('cc @todos)', new Map()).todos).toBe(true);
  });

  it('"@todosjuntos" não é @todos', () => {
    expect(mencionadosNoTexto('@todosjuntos', new Map()).todos).toBe(false);
  });

  it('não conta pedaço de nome: "@Anabela" não é quem escolheu "Ana"', () => {
    expect(mencionadosNoTexto('oi @Anabela, tudo bem?', new Map([['u1', 'Ana']]))).toEqual({
      ids: [],
      todos: false,
    });
  });

  it('nome mais longo escrito não conta também para quem escolheu o mais curto', () => {
    const doisEscolhidos = new Map([['u1', 'Ana'], ['u2', 'Ana Souza']]);
    expect(mencionadosNoTexto('reunião com @Ana Souza amanhã', doisEscolhidos)).toEqual({
      ids: ['u2'],
      todos: false,
    });
  });

  it('conta os dois quando os dois nomes aparecem escritos', () => {
    const doisEscolhidos = new Map([['u1', 'Ana'], ['u2', 'Ana Souza']]);
    expect(mencionadosNoTexto('chama @Ana e @Ana Souza', doisEscolhidos)).toEqual({
      ids: ['u1', 'u2'],
      todos: false,
    });
  });

  it('nome com caractere especial de regex não quebra a busca', () => {
    expect(mencionadosNoTexto('avisa @Ana (RH) por favor', new Map([['u1', 'Ana (RH)']]))).toEqual({
      ids: ['u1'],
      todos: false,
    });
  });

  it('conta o nome quando ele termina o texto', () => {
    expect(mencionadosNoTexto('já pode falar com @Carlos Lima', new Map([['u3', 'Carlos Lima']]))).toEqual({
      ids: ['u3'],
      todos: false,
    });
  });

  it('conta o nome seguido de pontuação', () => {
    expect(mencionadosNoTexto('fala com @Carlos Lima, por favor.', new Map([['u3', 'Carlos Lima']]))).toEqual({
      ids: ['u3'],
      todos: false,
    });
  });
});

describe('consultaCasaComTodos', () => {
  it.each([['', true], ['to', true], ['al', true], ['todos', true], ['x', false], ['tod x', false]])(
    '"%s" → %s',
    (c, r) => expect(consultaCasaComTodos(c)).toBe(r),
  );
});

describe('partesComMencao', () => {
  it('parte o texto nos nomes mencionados, o mais longo primeiro', () => {
    expect(partesComMencao('oi @Ana Souza e @Ana', ['Ana', 'Ana Souza'], false)).toEqual([
      { texto: 'oi ', mencao: null },
      { texto: '@Ana Souza', mencao: 'Ana Souza' },
      { texto: ' e ', mencao: null },
      { texto: '@Ana', mencao: 'Ana' },
    ]);
  });

  it('@todos só é destacado quando a mensagem de fato marcou todos', () => {
    expect(partesComMencao('@todos', [], false)).toEqual([{ texto: '@todos', mencao: null }]);
    expect(partesComMencao('@todos', [], true)).toEqual([{ texto: '@todos', mencao: 'todos' }]);
  });

  it('não destaca pedaço de palavra: "@Anabela" não é "@Ana"', () => {
    expect(partesComMencao('@Anabela', ['Ana'], false)).toEqual([{ texto: '@Anabela', mencao: null }]);
  });
});

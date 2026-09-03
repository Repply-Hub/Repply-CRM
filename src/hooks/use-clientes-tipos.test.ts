import { describe, it, expect } from 'vitest';
import {
  slugDeTipo,
  rotuloDoTipo,
  tipoPadrao,
  opcoesDeFiltro,
  ehPessoaFisica,
  decidirRenomeacao,
} from '@/lib/tipos-de-cliente';

const LISTA = [
  { slug: 'construtora_ativa', nome: 'Construtora Ativa' },
  { slug: 'loja_ativa', nome: 'Loja Ativa' },
  { slug: 'pessoa fisica', nome: 'Pessoa Física' },
];

describe('slugDeTipo', () => {
  it('tira acento, baixa a caixa e junta com underscore', () => {
    expect(slugDeTipo('Construtora Inativa')).toBe('construtora_inativa');
    expect(slugDeTipo('  Pessoa Física  ')).toBe('pessoa_fisica');
  });

  it('devolve vazio quando o nome nao tem nenhum caractere aproveitavel', () => {
    expect(slugDeTipo('   ')).toBe('');
    expect(slugDeTipo('!!!')).toBe('');
  });
});

describe('rotuloDoTipo', () => {
  it('acha o rotulo pelo slug', () => {
    expect(rotuloDoTipo('construtora_ativa', LISTA)).toBe('Construtora Ativa');
  });

  it('cai no proprio valor quando o slug nao esta na lista', () => {
    // Um cliente gravado com um tipo que ja foi removido da lista continua legivel.
    expect(rotuloDoTipo('construtora - 3 níveis', LISTA)).toBe('construtora - 3 níveis');
  });
});

describe('tipoPadrao', () => {
  it('e o primeiro item da lista', () => {
    expect(tipoPadrao(LISTA)).toBe('construtora_ativa');
  });

  it('e vazio quando a lista ainda nao carregou', () => {
    expect(tipoPadrao([])).toBe('');
  });
});

describe('opcoesDeFiltro', () => {
  it('soma os tipos em uso que nao estao na lista, para nenhum cliente sumir da busca', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa', 'construtora']);
    expect(opcoes.map(o => o.value)).toEqual([
      'construtora_ativa', 'loja_ativa', 'pessoa fisica', 'construtora',
    ]);
    expect(opcoes.find(o => o.value === 'construtora')?.label).toBe('construtora');
  });

  it('nao duplica um tipo que esta na lista e em uso', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa']);
    expect(opcoes).toHaveLength(3);
  });
});

describe('ehPessoaFisica', () => {
  it('reconhece as duas grafias gravadas no banco e variacoes de caixa/acento', () => {
    // 'pessoa fisica' (com espaco, sem acento) e o que a importacao de planilha grava --
    // e o valor real em 129 clientes da MD. 'pessoa_fisica' e o slug usado no codigo.
    expect(ehPessoaFisica('pessoa_fisica')).toBe(true);
    expect(ehPessoaFisica('pessoa fisica')).toBe(true);
    expect(ehPessoaFisica('Pessoa Física')).toBe(true);
    expect(ehPessoaFisica('PESSOA FISICA')).toBe(true);
  });

  it('nao confunde com outros tipos, nem com pessoa juridica', () => {
    expect(ehPessoaFisica('construtora')).toBe(false);
    expect(ehPessoaFisica('construtora_ativa')).toBe(false);
    expect(ehPessoaFisica('')).toBe(false);
    expect(ehPessoaFisica('pessoa juridica')).toBe(false);
  });

  it('nao estoura com null ou undefined -- volta false em vez de derrubar a ficha do cliente', () => {
    // `cliente.tipo` pode chegar nulo (linha antiga, importação incompleta). O TypeScript
    // do projeto está com strictNullChecks desligado, então nada aqui barra a chamada --
    // sem guarda, `.toLowerCase()` dentro de slugDeTipo lança TypeError e a tela inteira
    // cai, em vez de só mostrar "CNPJ" no lugar de "CPF".
    expect(ehPessoaFisica(null as unknown as string)).toBe(false);
    expect(ehPessoaFisica(undefined as unknown as string)).toBe(false);
  });
});

describe('decidirRenomeacao', () => {
  // A migration semeou nome = slug para toda empresa que já existia -- por isso, antes de
  // qualquer renomeação, o tipo "construtora" tem nome literal "construtora" (minúsculo).
  const CONSTRUTORA = { id: 't1', nome: 'construtora' };
  const LOJA = { id: 't2', nome: 'Loja Ativa' };
  const LISTA = [CONSTRUTORA, LOJA];

  it("'' e '   ' sao nome vazio", () => {
    expect(decidirRenomeacao('', CONSTRUTORA, LISTA)).toBe('vazio');
    expect(decidirRenomeacao('   ', CONSTRUTORA, LISTA)).toBe('vazio');
  });

  it('nome identico ao atual (mesmo texto) e sem mudanca', () => {
    expect(decidirRenomeacao('construtora', CONSTRUTORA, LISTA)).toBe('sem-mudanca');
  });

  it('ARMADILHA: "construtora" -> "Construtora" no PRÓPRIO tipo é renomeação válida', () => {
    // Este é o caso real da MD: o nome novo, normalizado, é IGUAL ao slug do próprio
    // tipo (porque a migration copiou um no outro). Uma comparação que confundisse nome
    // com slug, ou que não ignorasse o próprio id, bloquearia a primeira renomeação
    // legítima do sistema. A comparação certa é nome x nome, excluindo o próprio id.
    expect(decidirRenomeacao('Construtora', CONSTRUTORA, LISTA)).toBe('renomear');
  });

  it('nome novo que nao existe e renomeacao valida', () => {
    expect(decidirRenomeacao('Distribuidora', CONSTRUTORA, LISTA)).toBe('renomear');
  });

  it('nome igual ao de outro tipo e duplicado', () => {
    expect(decidirRenomeacao('Loja Ativa', CONSTRUTORA, LISTA)).toBe('duplicado');
  });

  it('nome igual ao de outro tipo com caixa/acento diferentes tambem e duplicado', () => {
    // 'CONSTRUTORA' e 'Construtóra' são grafias que o gestor pode digitar sem perceber
    // que já existe um tipo "Construtora" -- a comparação tem que normalizar as duas
    // para bater com o tipo já existente, mesmo sem o texto literal ser igual.
    const outraLista = [CONSTRUTORA, { id: 't3', nome: 'Construtora' }];
    expect(decidirRenomeacao('CONSTRUTORA', CONSTRUTORA, outraLista)).toBe('duplicado');
    expect(decidirRenomeacao('Construtóra', CONSTRUTORA, outraLista)).toBe('duplicado');
  });

  it('lista com um tipo so (o proprio) e renomeacao valida', () => {
    expect(decidirRenomeacao('Construtora', CONSTRUTORA, [CONSTRUTORA])).toBe('renomear');
  });
});

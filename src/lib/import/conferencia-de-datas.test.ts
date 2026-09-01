import { describe, it, expect } from 'vitest';
import { conferirDatasImportadas, textoDoAviso } from './conferencia-de-datas';
import { diagnosticarColunaDeData } from './ordem-de-data';

const HOJE = new Date(2026, 8, 1); // 01/09/2026, o dia da importação que originou tudo isto

describe('conferirDatasImportadas', () => {
  it('🔴 reproduz o incidente de 01/09/2026: criação no futuro é o sinal da troca', () => {
    // Na importação real, 294 dos 2.358 negócios ficaram em set-dez/2026 porque o dia real
    // (de 1 a 12) virou mês. `08/12/2026` gravado é `12/08/2026` de verdade.
    const linhas = [
      { data_pedido: '2026-12-08' },
      { data_pedido: '2026-10-04' },
      { data_pedido: '2026-08-25' },
      { data_pedido: '2026-02-03' },
    ];
    const aviso = conferirDatasImportadas(linhas, {}, HOJE);
    expect(aviso.criacaoNoFuturo).toBe(2);
    expect(aviso.criacaoMaisDistante).toBe('2026-12-08');
    expect(aviso.grave).toBe(true);
  });

  it('🔴 FECHAMENTO no futuro não é alarme — é previsão de negócio aberto', () => {
    // `prazo_resposta` é a data de fechamento e, em negócio aberto, ela aponta para frente
    // por definição (CLAUDE.md §4.4). Contar junto faria o aviso aparecer sempre.
    const aviso = conferirDatasImportadas(
      [{ data_pedido: '2026-08-25', prazo_resposta: '2026-11-30' }], {}, HOJE,
    );
    expect(aviso.fechamentoNoFuturo).toBe(1);
    expect(aviso.criacaoNoFuturo).toBe(0);
    expect(aviso.grave).toBe(false);
  });

  it('data de hoje não conta como futuro', () => {
    expect(conferirDatasImportadas([{ data_pedido: '2026-09-01' }], {}, HOJE).criacaoNoFuturo).toBe(0);
  });

  it('data com hora colada é comparada pelo dia', () => {
    expect(conferirDatasImportadas([{ data_pedido: '2026-12-08T14:30' }], {}, HOJE).criacaoNoFuturo).toBe(1);
  });

  it('valor que não é data, vazio ou nulo não quebra nem conta', () => {
    const aviso = conferirDatasImportadas(
      [{ data_pedido: '' }, { data_pedido: null }, { data_pedido: 'sem data' }, {}], {}, HOJE,
    );
    expect(aviso.criacaoNoFuturo).toBe(0);
    expect(aviso.grave).toBe(false);
  });

  it('lista vazia ou nula não quebra', () => {
    expect(conferirDatasImportadas([], {}, HOJE).grave).toBe(false);
    expect(conferirDatasImportadas(null as never, {}, HOJE).grave).toBe(false);
  });

  it('coluna sem prova de formato é reportada como indecidida', () => {
    const diagnosticos = { Criacao: diagnosticarColunaDeData(['01/02/2026', '03/04/2026']) };
    const aviso = conferirDatasImportadas([], diagnosticos, HOJE);
    expect(aviso.colunasIndecididas).toHaveLength(1);
    expect(aviso.colunasIndecididas[0].ambiguas).toBe(2);
    // Indecisão sozinha NÃO segura a importação: o padrão brasileiro é razoável e a pessoa
    // só precisa ser avisada, não impedida.
    expect(aviso.grave).toBe(false);
  });

  it('coluna PROVADA não vira aviso — só o que está no escuro aparece', () => {
    const diagnosticos = { Criacao: diagnosticarColunaDeData(['25/12/2026', '01/02/2026']) };
    expect(conferirDatasImportadas([], diagnosticos, HOJE).colunasIndecididas).toEqual([]);
  });

  it('coluna com os dois formatos é reportada como conflito, não como indecisão', () => {
    const diagnosticos = { Criacao: diagnosticarColunaDeData(['25/12/2026', '12/25/2026']) };
    const aviso = conferirDatasImportadas([], diagnosticos, HOJE);
    expect(aviso.colunasEmConflito).toHaveLength(1);
    expect(aviso.colunasIndecididas).toEqual([]);
  });
});

describe('textoDoAviso', () => {
  it('a frase diz o número e a data mais distante, em português de gente', () => {
    const aviso = conferirDatasImportadas(
      [{ data_pedido: '2026-12-08' }, { data_pedido: '2026-10-04' }], {}, HOJE,
    );
    const [frase] = textoDoAviso(aviso);
    expect(frase).toContain('2 negócios');
    expect(frase).toContain('08/12/2026');
    expect(frase).toContain('dia e mês trocados');
  });

  it('uma linha só não vira "1 negócios"', () => {
    const aviso = conferirDatasImportadas([{ data_pedido: '2026-12-08' }], {}, HOJE);
    expect(textoDoAviso(aviso)[0]).toContain('1 negócio ficou');
  });

  it('sem problema nenhum, não há frase', () => {
    expect(textoDoAviso(conferirDatasImportadas([{ data_pedido: '2026-08-25' }], {}, HOJE))).toEqual([]);
  });
});

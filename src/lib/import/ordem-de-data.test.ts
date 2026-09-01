import { describe, it, expect } from 'vitest';
import { diagnosticarColunaDeData, diagnosticarDatasDaPlanilha } from './ordem-de-data';
import { sanitizeImportedRows, sanitizeFieldValue } from '@/components/import/MappingStep';

describe('diagnosticarColunaDeData', () => {
  it('🔴 UMA linha com dia acima de 12 decide a coluna inteira', () => {
    // É o ponto do arquivo: `01/02/2026` sozinho é indecidível, mas ao lado de `25/12/2026`
    // deixa de ser — a coluna está em dia/mês.
    const d = diagnosticarColunaDeData(['25/12/2026', '01/02/2026', '03/04/2026']);
    expect(d.ordem).toBe('br');
    expect(d.decidida).toBe(true);
    expect(d.provasBr).toBe(1);
    expect(d.ambiguas).toBe(2);
  });

  it('🔴 o mesmo vale para o outro lado: segundo número acima de 12 prova americano', () => {
    const d = diagnosticarColunaDeData(['12/25/2026', '01/02/2026']);
    expect(d.ordem).toBe('us');
    expect(d.decidida).toBe(true);
    expect(d.provasUs).toBe(1);
  });

  it('coluna 100% ambígua assume brasileiro, mas NÃO se diz decidida', () => {
    // A diferença importa: é ela que faz a tela avisar em vez de calar.
    const d = diagnosticarColunaDeData(['01/02/2026', '03/04/2026']);
    expect(d.ordem).toBe('br');
    expect(d.decidida).toBe(false);
    expect(d.ambiguas).toBe(2);
  });

  it('planilha misturada é sinalizada, e a maioria vence', () => {
    const d = diagnosticarColunaDeData(['25/12/2026', '30/01/2026', '12/25/2026']);
    expect(d.conflito).toBe(true);
    expect(d.ordem).toBe('br');
    expect(d.exemploBr).toBe('25/12/2026');
    expect(d.exemploUs).toBe('12/25/2026');
  });

  it('data com hora também vota', () => {
    const d = diagnosticarColunaDeData(['30/12/2022 18:01']);
    expect(d.ordem).toBe('br');
    expect(d.decidida).toBe(true);
  });

  it('ISO, vazio e texto livre não votam nem contam', () => {
    const d = diagnosticarColunaDeData(['2026-08-12', '', null, undefined, 'sem data', 42]);
    expect(d.total).toBe(0);
    expect(d.decidida).toBe(false);
  });

  it('🔴 valor ambíguo não vira prova — senão o palpite se confirmaria sozinho', () => {
    const d = diagnosticarColunaDeData(['01/02/2026']);
    expect(d.provasBr).toBe(0);
    expect(d.provasUs).toBe(0);
  });

  it('os dois números acima de 12 não é data: não prova e não conta como ambígua', () => {
    const d = diagnosticarColunaDeData(['25/30/2026']);
    expect(d.ambiguas).toBe(0);
    expect(d.decidida).toBe(false);
  });

  it('lista vazia ou nula não quebra', () => {
    expect(diagnosticarColunaDeData([]).total).toBe(0);
    expect(diagnosticarColunaDeData(null as never).total).toBe(0);
  });
});

describe('diagnosticarDatasDaPlanilha', () => {
  const linhas = [
    { Criacao: '25/12/2026', Fechamento: '01/02/2026', Cliente: 'ACME' },
    { Criacao: '01/02/2026', Fechamento: '03/04/2026', Cliente: 'Beta' },
  ];

  it('diagnostica cada coluna de data em separado e ignora as que não são data', () => {
    const r = diagnosticarDatasDaPlanilha(linhas, ['Criacao', 'Fechamento', 'Cliente']);
    expect(Object.keys(r).sort()).toEqual(['Criacao', 'Fechamento']);
    expect(r.Criacao.decidida).toBe(true);
    expect(r.Fechamento.decidida).toBe(false);
  });

  it('🔴 cada coluna decide por si — uma provada não decide a vizinha', () => {
    // Se a decisão fosse da planilha inteira, "Fechamento" herdaria a prova de "Criacao" e a
    // tela deixaria de avisar sobre uma coluna que continua no escuro.
    const r = diagnosticarDatasDaPlanilha(linhas, ['Criacao', 'Fechamento']);
    expect(r.Fechamento.ambiguas).toBe(2);
  });
});

/**
 * O teste que prova que a decisão é da COLUNA e não da célula: a mesma célula, com a mesma
 * escrita, sai diferente conforme a vizinhança. É isso que separa este conserto de um chute
 * mais educado.
 */
describe('sanitizeImportedRows — a coluna decide pela célula ambígua', () => {
  const converter = (datas: string[]) =>
    sanitizeImportedRows({
      rawData: datas.map((Data) => ({ Data })),
      fields: [{ key: 'data_pedido', label: 'Data', required: false }],
      mapping: { data_pedido: 'Data' },
    }).map((linha) => linha.data_pedido);

  it('🔴 vizinha brasileira faz 01/02/2026 ser 1º de FEVEREIRO', () => {
    expect(converter(['25/12/2026', '01/02/2026'])).toEqual(['2026-12-25', '2026-02-01']);
  });

  it('🔴 a MESMA célula, com vizinha americana, é 2 de JANEIRO', () => {
    expect(converter(['12/25/2026', '01/02/2026'])).toEqual(['2026-12-25', '2026-01-02']);
  });

  it('sem prova nenhuma na coluna, continua o padrão brasileiro de sempre', () => {
    expect(converter(['01/02/2026'])).toEqual(['2026-02-01']);
  });

  it('data já em ISO passa direto, sem opinião de vizinha', () => {
    expect(converter(['2026-08-12', '12/25/2026'])).toEqual(['2026-08-12', '2026-12-25']);
  });
});

describe('sanitizeFieldValue — serial do Excel que chegou como texto', () => {
  it('🔴 "46247" vira 13/08/2026, e não o ano 46247', () => {
    // `new Date("46247")` é válido e devolve o ano 46247 — que o Postgres aceita sem
    // reclamar (o tipo `date` vai até 5874897). Célula numérica sem formato nenhum produz
    // exatamente esse texto. O valor conferido contra o próprio SheetJS do projeto.
    expect(sanitizeFieldValue('46247', 'date')).toBe('2026-08-13');
  });

  it('número de 5 dígitos fora da faixa de datas não vira data', () => {
    expect(sanitizeFieldValue('99999', 'date')).toBe('99999');
    expect(sanitizeFieldValue('10000', 'date')).toBe('10000');
  });

  it('o comportamento sem o terceiro parâmetro é o de sempre', () => {
    expect(sanitizeFieldValue('12/08/2026', 'date')).toBe('2026-08-12');
    expect(sanitizeFieldValue('25/12/2026', 'date')).toBe('2026-12-25');
  });
});

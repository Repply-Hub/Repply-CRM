import { describe, it, expect } from 'vitest';
import { FASES_DA_OBRA, rotuloDaFase, resumoDaAnalise, tarefaDoProximoPasso } from './analise-da-visita';

describe('fases da obra', () => {
  it('são as seis do ramo, na ordem do canteiro', () => {
    expect(FASES_DA_OBRA.map((f) => f.chave)).toEqual([
      'fundacao', 'estrutura', 'alvenaria', 'instalacoes', 'acabamento', 'entrega',
    ]);
  });

  it('traduz a chave gravada no rótulo da tela, e não inventa para o que não conhece', () => {
    expect(rotuloDaFase('acabamento')).toBe('Acabamento');
    expect(rotuloDaFase('fase-que-nao-existe')).toBe('');
    expect(rotuloDaFase(null)).toBe('');
  });
});

describe('resumoDaAnalise — o que vai na mensagem', () => {
  it('escreve uma linha por resposta preenchida', () => {
    expect(
      resumoDaAnalise({
        fase: 'acabamento',
        concorrentes: 'Marca Exemplo',
        contatoNome: 'Pessoa Exemplo',
        proximoPasso: 'Mandar proposta de louças',
        proximoPassoEm: '2026-09-20',
        observacao: 'Obra parada por chuva',
      }),
    ).toEqual([
      'Fase: Acabamento',
      'Concorrente: Marca Exemplo',
      'Falou com: Pessoa Exemplo',
      'Próximo passo: Mandar proposta de louças (até 20/09)',
      'Obs.: Obra parada por chuva',
    ]);
  });

  it('pula o que não foi respondido', () => {
    expect(resumoDaAnalise({ fase: 'estrutura' })).toEqual(['Fase: Estrutura']);
    expect(resumoDaAnalise({ proximoPasso: 'Voltar em duas semanas' })).toEqual([
      'Próximo passo: Voltar em duas semanas',
    ]);
  });

  it('visita sem nenhuma resposta não gera linha nenhuma', () => {
    expect(resumoDaAnalise({})).toEqual([]);
    expect(resumoDaAnalise(null)).toEqual([]);
    expect(resumoDaAnalise({ fase: '  ', observacao: '' })).toEqual([]);
  });
});

describe('tarefaDoProximoPasso', () => {
  it('monta a tarefa com o nome da obra no título e a data como prazo', () => {
    expect(
      tarefaDoProximoPasso({
        nomeObra: 'Obra Exemplo',
        clienteId: 'cliente-1',
        proximoPasso: 'Mandar proposta de louças',
        proximoPassoEm: '2026-09-20',
      }),
    ).toEqual({
      titulo: 'Próximo passo — Obra Exemplo',
      descricao: 'Mandar proposta de louças',
      // 🔴 Âncora de meio-dia: a coluna é timestamp e o dia não pode escorregar por fuso.
      prazo_final: '2026-09-20T12:00:00',
      cliente_id: 'cliente-1',
    });
  });

  it('🔴 sem data não vira tarefa — tarefa sem prazo não cobra ninguém', () => {
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPasso: 'Voltar lá' })).toBeNull();
  });

  it('sem próximo passo escrito não vira tarefa', () => {
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPassoEm: '2026-09-20' })).toBeNull();
    expect(tarefaDoProximoPasso({ nomeObra: 'Obra Exemplo', proximoPasso: '   ', proximoPassoEm: '2026-09-20' })).toBeNull();
  });

  it('obra sem nome ainda vira tarefa, com rótulo honesto', () => {
    expect(
      tarefaDoProximoPasso({ proximoPasso: 'Voltar lá', proximoPassoEm: '2026-09-20' })?.titulo,
    ).toBe('Próximo passo — obra sem nome');
  });
});

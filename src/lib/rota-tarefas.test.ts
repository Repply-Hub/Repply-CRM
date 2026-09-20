import { describe, it, expect } from 'vitest';
import { tarefasDaRotaConcluida, type ParadaParaTarefa } from './rota-tarefas';
import { RESPOSTAS_VAZIAS, type RespostasDaVisita } from './analise-da-visita';

/**
 * `tarefasDaRotaConcluida` decide quais tarefas do próximo passo nascem ao gravar uma rota.
 * O ponto que estes testes fixam é a TRANSIÇÃO: a tarefa só nasce para a visita que PASSOU a
 * realizada agora, nunca para uma que já estava — senão remarcar duplicaria.
 */

function respostas(patch: Partial<RespostasDaVisita> = {}): RespostasDaVisita {
  return {
    ...RESPOSTAS_VAZIAS,
    proximoPasso: 'Mandar proposta de louças',
    proximoPassoEm: '2026-09-20',
    ...patch,
  };
}

function parada(patch: Partial<ParadaParaTarefa> = {}): ParadaParaTarefa {
  return {
    grupoId: 'grupo-1',
    nomeObra: 'Obra Exemplo',
    clienteId: 'cliente-1',
    realizada: true,
    respostas: respostas(),
    ...patch,
  };
}

describe('tarefasDaRotaConcluida — ao CRIAR a rota', () => {
  it('rota "já aconteceram" com próximo passo + data + caixinha marcada gera a tarefa', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: false,
      jaRealizada: true,
      paradas: [parada({ grupoId: undefined })],
    });
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].titulo).toContain('Obra Exemplo');
    expect(tarefas[0].prazo_final).toBe('2026-09-20T12:00:00');
    expect(tarefas[0].cliente_id).toBe('cliente-1');
  });

  it('rota que ainda NÃO aconteceu (jaRealizada false) não gera tarefa nenhuma', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: false,
      jaRealizada: false,
      paradas: [parada({ grupoId: undefined })],
    });
    expect(tarefas).toEqual([]);
  });

  it('sem data não gera tarefa, mesmo com a rota já realizada', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: false,
      jaRealizada: true,
      paradas: [parada({ grupoId: undefined, respostas: respostas({ proximoPassoEm: '' }) })],
    });
    expect(tarefas).toEqual([]);
  });

  it('caixinha desmarcada não gera tarefa, mesmo com data', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: false,
      jaRealizada: true,
      paradas: [parada({ grupoId: undefined, respostas: respostas({ criarTarefa: false }) })],
    });
    expect(tarefas).toEqual([]);
  });

  it('uma tarefa por parada com próximo passo — as sem próximo passo ficam de fora', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: false,
      jaRealizada: true,
      paradas: [
        parada({ grupoId: undefined, nomeObra: 'Obra A' }),
        parada({ grupoId: undefined, nomeObra: 'Obra B', respostas: respostas({ proximoPasso: '', proximoPassoEm: '' }) }),
        parada({ grupoId: undefined, nomeObra: 'Obra C', respostas: respostas({ proximoPasso: 'Ligar' }) }),
      ],
    });
    expect(tarefas.map((t) => t.titulo)).toEqual([
      expect.stringContaining('Obra A'),
      expect.stringContaining('Obra C'),
    ]);
  });
});

describe('tarefasDaRotaConcluida — ao EDITAR a rota (transição)', () => {
  it('parada que PASSA a realizada agora (não era antes) gera a tarefa', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: true,
      jaRealizada: false,
      paradas: [parada({ grupoId: 'g1' })],
      paradasGravadas: [{ grupoId: 'g1', visitaRealizada: false }],
    });
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].titulo).toContain('Obra Exemplo');
  });

  it('🔴 parada que JÁ ERA realizada NÃO gera tarefa de novo (não duplica ao reeditar)', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: true,
      jaRealizada: false,
      paradas: [parada({ grupoId: 'g1' })],
      paradasGravadas: [{ grupoId: 'g1', visitaRealizada: true }],
    });
    expect(tarefas).toEqual([]);
  });

  it('parada em transição mas com a caixinha desmarcada não gera tarefa', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: true,
      jaRealizada: false,
      paradas: [parada({ grupoId: 'g1', respostas: respostas({ criarTarefa: false }) })],
      paradasGravadas: [{ grupoId: 'g1', visitaRealizada: false }],
    });
    expect(tarefas).toEqual([]);
  });

  it('🔴 parada NOVA (sem grupoId) marcada realizada na edição NÃO gera tarefa', () => {
    // Rede de defesa: uma parada acrescentada durante a edição é gravada pelo caminho de INSERIR,
    // que a força a não-realizada. A tela já esconde o "já realizada" dela; mesmo que isso
    // regredisse e ela chegasse aqui como realizada, a função não pode inventar uma tarefa para
    // uma visita que ficou planejada.
    const tarefas = tarefasDaRotaConcluida({
      editando: true,
      jaRealizada: false,
      paradas: [parada({ grupoId: undefined, realizada: true })],
      paradasGravadas: [],
    });
    expect(tarefas).toEqual([]);
  });

  it('numa rota mista, só a parada que passou a realizada gera tarefa', () => {
    const tarefas = tarefasDaRotaConcluida({
      editando: true,
      jaRealizada: false,
      paradas: [
        parada({ grupoId: 'g1', nomeObra: 'Já era realizada' }),
        parada({ grupoId: 'g2', nomeObra: 'Passou agora' }),
        parada({ grupoId: 'g3', nomeObra: 'Continua planejada', realizada: false }),
      ],
      paradasGravadas: [
        { grupoId: 'g1', visitaRealizada: true },
        { grupoId: 'g2', visitaRealizada: false },
        { grupoId: 'g3', visitaRealizada: false },
      ],
    });
    expect(tarefas.map((t) => t.titulo)).toEqual([expect.stringContaining('Passou agora')]);
  });
});

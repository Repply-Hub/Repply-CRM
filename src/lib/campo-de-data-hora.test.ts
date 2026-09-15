import { describe, it, expect } from 'vitest';
import { paraCampoData, paraCampoDataHora, novoFimAoMudarInicio } from './campo-de-data-hora';

/**
 * Trava o +3h da Agenda e das Tarefas (CLAUDE.md §7.12, mesma família).
 *
 * O defeito media assim: `EventDialog` e `TarefaFormDialog` montavam o campo `datetime-local`
 * recortando `Date.toISOString()` (texto em UTC) e, ao salvar, liam esse texto como hora LOCAL —
 * cada edição empurrava início e fim 3 horas para a frente, sem a pessoa mexer no horário.
 *
 * O fuso destes testes é o que `src/test/setup.ts` já crava para a suíte inteira
 * (`process.env.TZ = "America/Fortaleza"`, UTC-3 — mesmo deslocamento de São Paulo em 2026, sem
 * horário de verão). Sem essa linha estes testes falham em qualquer máquina que rode em UTC: a
 * primeira asserção abaixo compara `17:00` (local) contra `20:00` (UTC), e as duas só divergem
 * quando o fuso local de verdade está em vigor.
 */

describe('paraCampoDataHora — instante do banco para texto de campo, no fuso local', () => {
  it('2026-09-15T20:00:00Z (banco, UTC) vira o texto 2026-09-15T17:00 (campo, local)', () => {
    const doBanco = new Date('2026-09-15T20:00:00Z');
    expect(paraCampoDataHora(doBanco)).toBe('2026-09-15T17:00');
  });

  it('reler esse texto como hora local devolve o MESMO instante — editar sem mudar não desloca', () => {
    const textoDoCampo = paraCampoDataHora(new Date('2026-09-15T20:00:00Z'));
    expect(new Date(textoDoCampo).toISOString()).toBe('2026-09-15T20:00:00.000Z');
  });
});

describe('paraCampoData — dia inteiro não anda um dia a cada edição', () => {
  it('o fim gravado como 23:59:59 local continua no mesmo dia', () => {
    // 23:59:59 de 20/09 no fuso local é 02:59:59 de 21/09 em UTC — é assim que o banco guarda.
    const fimDoBanco = new Date('2026-09-21T02:59:59Z');
    expect(paraCampoData(fimDoBanco)).toBe('2026-09-20');
  });
});

describe('novoFimAoMudarInicio — o fim anda junto quando o início muda, com a mesma duração', () => {
  it('evento com hora: mantém a duração em minutos', () => {
    const resultado = novoFimAoMudarInicio(
      '2026-09-15T14:00',
      '2026-09-16T09:00',
      '2026-09-15T15:30', // 1h30 depois do início antigo
      false,
    );
    expect(resultado).toBe('2026-09-16T10:30');
  });

  it('início novo ilegível (campo vazio, ainda digitando): devolve o fim atual sem mexer', () => {
    const resultado = novoFimAoMudarInicio('2026-09-15T14:00', '', '2026-09-15T15:30', false);
    expect(resultado).toBe('2026-09-15T15:30');
  });

  it('fim atual antes do início antigo (estado inconsistente): cai no padrão de 1h depois do novo início', () => {
    const resultado = novoFimAoMudarInicio(
      '2026-09-15T14:00',
      '2026-09-16T09:00',
      '2026-09-15T13:00',
      false,
    );
    expect(resultado).toBe('2026-09-16T10:00');
  });

  it('fim atual vazio (estado inconsistente): também cai no padrão de 1h depois do novo início', () => {
    const resultado = novoFimAoMudarInicio('2026-09-15T14:00', '2026-09-16T09:00', '', false);
    expect(resultado).toBe('2026-09-16T10:00');
  });

  it('dia inteiro: mantém a duração em dias', () => {
    const resultado = novoFimAoMudarInicio('2026-09-15', '2026-09-20', '2026-09-17', true);
    expect(resultado).toBe('2026-09-22');
  });

  it('dia inteiro, fim vazio: o novo fim é a mesma data do novo início', () => {
    const resultado = novoFimAoMudarInicio('2026-09-15', '2026-09-20', '', true);
    expect(resultado).toBe('2026-09-20');
  });
});

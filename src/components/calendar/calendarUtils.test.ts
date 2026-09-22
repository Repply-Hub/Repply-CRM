import { describe, it, expect } from 'vitest';
import { eventsForDay, recorteNoDia } from './calendarUtils';
import type { CalendarEvent } from './types';

/**
 * "Os eventos deste dia" e "o pedaço do evento que cabe neste dia".
 *
 * Até 22/09/2026 o dia era decidido por `isSameDay(evento.inicio, dia)`: só o PRIMEIRO dia
 * contava. Uma feira de três dias ou uma viagem de representação marcada de 10 a 12 aparecia
 * só no dia 10, e os dias 11 e 12 pareciam livres — alguém marcava visita em cima da viagem.
 * O dado sempre esteve certo (o dia inteiro é gravado até 23:59:59 do último dia); quem errava
 * era o desenho.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): o repositório é público.
 */

function evento(inicio: string, fim: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `ev-${inicio}`,
    titulo: 'Feira Exemplo',
    descricao: null,
    inicio: new Date(inicio),
    fim: new Date(fim),
    diaInteiro: false,
    tipoCalendario: 'pessoal',
    cor: '#000000',
    editavel: true,
    ...extra,
  } as CalendarEvent;
}

const dia = (texto: string) => new Date(`${texto}T12:00:00`);

describe('eventsForDay', () => {
  it('mostra um compromisso de três dias em todos os três', () => {
    const feira = evento('2026-09-10T00:00:00', '2026-09-12T23:59:59', { diaInteiro: true });

    expect(eventsForDay([feira], dia('2026-09-10'))).toHaveLength(1);
    expect(eventsForDay([feira], dia('2026-09-11'))).toHaveLength(1);
    expect(eventsForDay([feira], dia('2026-09-12'))).toHaveLength(1);
  });

  it('não mostra o compromisso fora da faixa dele', () => {
    const feira = evento('2026-09-10T00:00:00', '2026-09-12T23:59:59', { diaInteiro: true });

    expect(eventsForDay([feira], dia('2026-09-09'))).toHaveLength(0);
    expect(eventsForDay([feira], dia('2026-09-13'))).toHaveLength(0);
  });

  it('continua mostrando o compromisso de um dia só no dia dele', () => {
    const reuniao = evento('2026-09-10T14:00:00', '2026-09-10T15:00:00');

    expect(eventsForDay([reuniao], dia('2026-09-10'))).toHaveLength(1);
    expect(eventsForDay([reuniao], dia('2026-09-11'))).toHaveLength(0);
  });

  it('mostra o compromisso que atravessa a meia-noite nos dois dias', () => {
    const virada = evento('2026-09-10T22:00:00', '2026-09-11T02:00:00');

    expect(eventsForDay([virada], dia('2026-09-10'))).toHaveLength(1);
    expect(eventsForDay([virada], dia('2026-09-11'))).toHaveLength(1);
  });

  it('não empurra para o dia seguinte o compromisso que termina exatamente à meia-noite', () => {
    const ateMeiaNoite = evento('2026-09-10T22:00:00', '2026-09-11T00:00:00');

    expect(eventsForDay([ateMeiaNoite], dia('2026-09-11'))).toHaveLength(0);
  });

  it('mostra um marco instantâneo no dia dele, inclusive à meia-noite', () => {
    const marco = evento('2026-09-10T00:00:00', '2026-09-10T00:00:00');

    expect(eventsForDay([marco], dia('2026-09-10'))).toHaveLength(1);
  });
});

describe('recorteNoDia', () => {
  it('no dia do meio, o pedaço ocupa o dia inteiro', () => {
    const feira = evento('2026-09-10T08:00:00', '2026-09-12T18:00:00');

    const pedaco = recorteNoDia(feira, dia('2026-09-11'));

    expect(pedaco.inicio.getHours()).toBe(0);
    expect(pedaco.inicio.getDate()).toBe(11);
    expect(pedaco.fim.getHours()).toBe(23);
    expect(pedaco.fim.getDate()).toBe(11);
  });

  it('no primeiro dia, começa na hora de verdade e vai até o fim do dia', () => {
    const feira = evento('2026-09-10T08:00:00', '2026-09-12T18:00:00');

    const pedaco = recorteNoDia(feira, dia('2026-09-10'));

    expect(pedaco.inicio.getHours()).toBe(8);
    expect(pedaco.fim.getDate()).toBe(10);
    expect(pedaco.fim.getHours()).toBe(23);
  });

  it('no último dia, começa no início do dia e termina na hora de verdade', () => {
    const feira = evento('2026-09-10T08:00:00', '2026-09-12T18:00:00');

    const pedaco = recorteNoDia(feira, dia('2026-09-12'));

    expect(pedaco.inicio.getHours()).toBe(0);
    expect(pedaco.fim.getHours()).toBe(18);
    expect(pedaco.fim.getDate()).toBe(12);
  });

  it('um compromisso que cabe no dia não é alterado', () => {
    const reuniao = evento('2026-09-10T14:00:00', '2026-09-10T15:30:00');

    const pedaco = recorteNoDia(reuniao, dia('2026-09-10'));

    expect(pedaco.inicio.getTime()).toBe(reuniao.inicio.getTime());
    expect(pedaco.fim.getTime()).toBe(reuniao.fim.getTime());
  });
});

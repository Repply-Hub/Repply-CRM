import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  format,
} from 'date-fns';
import type { ViewMode } from '@/components/calendar/types';

/**
 * O recorte de datas que o calendário precisa buscar, dado o modo de visão e a data central.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 27/08/2026 o calendário buscava a base INTEIRA, sem recorte de
 * data e sem limite. Medido em produção:
 *
 *   negócios com data de fechamento .......... 11.906   -> cada um vira item de "dia inteiro"
 *   teto do servidor por consulta .............  1.000
 *   o pior dia (31/07/2024) ...................    458   prazos no mesmo dia
 *
 * Três estragos de uma vez, e o pior era invisível:
 *
 * 1. O CALENDÁRIO MOSTRAVA UM EM CADA DOZE PRAZOS, em silêncio. O PostgREST corta em mil
 *    linhas e não avisa — e, sem `order`, as mil não são sequer as mais recentes.
 * 2. A faixa de "dia inteiro" não tem teto de altura. Um dia com 458 prazos gera uns 7.800px
 *    de faixa, que espremem a grade de horas para perto de zero: não é que a rolagem trave,
 *    é que não sobra o que rolar.
 * 3. A consulta arrastava 11.906 linhas para o navegador a cada abertura, contrariando o
 *    `CLAUDE.md` §6.4 ("some no banco, não no navegador").
 *
 * Recortar por período resolve os três — e é a única correção que também devolve a INTEIREZA
 * do dado, que é o defeito que ninguém via.
 *
 * Função pura para poder ser fixada em teste: os limites de semana e de mês são exatamente
 * onde erro de fuso e de virada de ano se escondem.
 */

export interface PeriodoDoCalendario {
  de: Date;
  ate: Date;
  /** `yyyy-MM-dd` — é assim que a coluna `prazo_resposta` (tipo `date`) se compara. */
  deTexto: string;
  ateTexto: string;
}

export function periodoDoCalendario(modo: ViewMode, dataCentral: Date): PeriodoDoCalendario {
  let de: Date;
  let ate: Date;

  // 🔴 `weekStartsOn: 1` — SEGUNDA, igual a `getWeekDays` e `getMonthGrid`
  // (calendarUtils.ts:14 e :21). Usar o padrão do date-fns (domingo) desloca o recorte um dia:
  // o domingo, que é o ÚLTIMO dia da grade, cairia fora do período buscado e apareceria vazio
  // toda semana. Foi um teste que pegou isto antes de virar bug.
  const SEMANA = { weekStartsOn: 1 } as const;

  if (modo === 'mes') {
    // 🔴 NÃO é o primeiro e o último dia do mês. A grade de mês desenha semanas inteiras, e
    // portanto mostra dias do mês anterior e do seguinte — recortar no mês deixaria essas
    // bordas vazias, e o buraco pareceria "não há nada nesse dia".
    de = startOfWeek(startOfMonth(dataCentral), SEMANA);
    ate = endOfWeek(endOfMonth(dataCentral), SEMANA);
  } else if (modo === 'semana') {
    de = startOfWeek(dataCentral, SEMANA);
    ate = endOfWeek(dataCentral, SEMANA);
  } else {
    de = startOfDay(dataCentral);
    ate = endOfDay(dataCentral);
  }

  return {
    de,
    ate,
    // `format` do date-fns lê o fuso LOCAL, igual ao resto do sistema. Usar `toISOString`
    // aqui recuaria um dia depois das 21h — a armadilha do CLAUDE.md §7.12.
    deTexto: format(de, 'yyyy-MM-dd'),
    ateTexto: format(ate, 'yyyy-MM-dd'),
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { generatePedidosExcel } from './generate-excel';
import type { PedidoRow } from './generate-pdf';

/**
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A coluna "Data" recebe o texto `AAAA-MM-DD` de uma coluna `date` do banco. Passar esse texto
 * por `new Date(...)` o lê como meia-noite UTC — no horário de Brasília, 21h do DIA ANTERIOR
 * (CLAUDE.md §7.12). Todo negócio saía um dia antes; o do dia 1º, no mês anterior; o de 1º de
 * janeiro, no ano anterior. O PDF irmão já tinha sido consertado disso (`generate-pdf.ts`); a
 * planilha ficou para trás.
 *
 * O gravador de arquivo é trocado por um que só guarda a planilha montada: o que se confere é o
 * que iria dentro do arquivo, sem disparar download nenhum.
 */

const gravar = vi.fn();
// Embrulhado em seta porque `vi.mock` é içado para o topo do arquivo: a seta só lê `gravar`
// quando a planilha é gravada, e aí ele já existe.
vi.mock('xlsx', async () => {
  const real = await vi.importActual<typeof import('xlsx')>('xlsx');
  return { ...real, writeFile: (...a: unknown[]) => gravar(...a) };
});

function linha(data: string): PedidoRow {
  return {
    cliente: 'Construtora Alfa',
    obra: 'Ed. Solar',
    fabricante: 'Portobello',
    vendedor: 'Ana Lima',
    valor: 1000,
    etapa: 'Enviado',
    data,
  };
}

function dataNaPlanilha(): unknown {
  const [planilha] = gravar.mock.calls[0] as [XLSX.WorkBook, string];
  const [primeira] = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha.Sheets['Orçamentos']);
  return primeira.Data;
}

/**
 * 🔴 A PRECONDIÇÃO. Em UTC, `new Date("2026-09-01")` devolve 01/09 e os casos de baixo passariam
 * com o defeito de pé. `src/test/setup.ts` crava `America/Fortaleza`; se alguém tirar, é aqui
 * que avisa, em vez de o teste virar enfeite em silêncio.
 */
describe('o fuso dos testes', () => {
  it('está atrás de UTC — sem isso os casos da planilha não provam nada', () => {
    expect(new Date('2026-09-01').getDate()).toBe(31);
  });
});

describe('generatePedidosExcel — coluna Data', () => {
  beforeEach(() => gravar.mockClear());

  it.each([
    ['2026-08-25', '25/08/2026', 'dia qualquer'],
    ['2026-09-01', '01/09/2026', 'dia 1º: o erro trocava o MÊS'],
    ['2026-01-01', '01/01/2026', '1º de janeiro: o erro trocava o ANO'],
  ])('%s sai %s na planilha (%s)', (doBanco, esperado) => {
    generatePedidosExcel([linha(doBanco)]);
    expect(dataNaPlanilha()).toBe(esperado);
  });
});

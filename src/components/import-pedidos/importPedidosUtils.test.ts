import { describe, expect, it } from 'vitest';
import {
  detectImportPedidosMapping,
  getImportedPedidosRows,
  getSheetHeaders,
} from './importPedidosUtils';

describe('importPedidosUtils', () => {
  const rows = [
    {
      'Nome do negócio': 'Repav Rosário Edificações',
      Pipeline: 'Portobello',
      Fase: 'Negociações do Mês',
      Contato: 'João',
      Empresa: 'Repav Rosário Edificações e Pavimentação',
      'Valor total': 'R$ 10.500,00',
    },
    {
      'Nome do negócio': 'Obra Torre Sul',
      Pipeline: 'Eliane',
      Fase: 'Enviado',
      Contato: 'Maria',
      Empresa: 'Construtora ABC',
      'Valor total': 'R$ 2.000,00',
    },
  ];

  it('detecta automaticamente Empresa, Pipeline e Fase', () => {
    const headers = getSheetHeaders(rows);
    const mapping = detectImportPedidosMapping(headers, rows);

    expect(mapping.cliente).toBe('Empresa');
    expect(mapping.fabricante).toBe('Pipeline');
    expect(mapping.status).toBe('Fase');
    expect(mapping.valor).toBe('Valor total');
  });

  it('converte as linhas para o formato interno sem exigir mapeamento manual', () => {
    const mapping = {
      cliente: 'Empresa',
      fabricante: 'Pipeline',
      valor: 'Valor total',
      observacoes: 'Nome do negócio',
      status: 'Fase',
    } as const;

    expect(getImportedPedidosRows(rows, mapping)).toEqual([
      {
        cliente: 'Repav Rosário Edificações e Pavimentação',
        fabricante: 'Portobello',
        valor: 10500,
        observacoes: 'Repav Rosário Edificações',
        status: 'negociacao',
      },
      {
        cliente: 'Construtora ABC',
        fabricante: 'Eliane',
        valor: 2000,
        observacoes: 'Obra Torre Sul',
        status: 'enviado',
      },
    ]);
  });
});
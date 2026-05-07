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
      negocio: 'Nome do negócio',
      cliente: 'Empresa',
      contato: 'Contato',
      obra: '',
      fabricante: 'Pipeline',
      valor: 'Valor total',
      vendedor: '',
      observacoes: '',
      status: 'Fase',
      data_pedido: '',
      prazo_resposta: '',
    };

    expect(getImportedPedidosRows(rows, mapping)).toEqual([
      {
        negocio: 'Repav Rosário Edificações',
        cliente: 'Repav Rosário Edificações e Pavimentação',
        contato: 'João',
        obra: '',
        fabricante: 'Portobello',
        valor: 10500,
        vendedor: '',
        observacoes: '',
        status: 'negociacao',
        data_pedido: undefined,
        prazo_resposta: undefined,
        campos_extras: {},
      },
      {
        negocio: 'Obra Torre Sul',
        cliente: 'Construtora ABC',
        contato: 'Maria',
        obra: '',
        fabricante: 'Eliane',
        valor: 2000,
        vendedor: '',
        observacoes: '',
        status: 'enviado',
        data_pedido: undefined,
        prazo_resposta: undefined,
        campos_extras: {},
      },
    ]);
  });
});
import { describe, expect, it } from 'vitest';
import {
  detectImportPedidosMapping,
  getImportedPedidosRows,
  getSheetHeaders,
  matchPedidoStatusToColuna,
} from './importPedidosUtils';
import { sanitizeFieldValue } from '@/components/import/MappingStep';

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
      marcador: '',
      data_pedido: '',
      prazo_resposta: '',
      pdf_url: '',
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
        marcador: '',
        data_pedido: undefined,
        prazo_resposta: undefined,
        pdf_url: '',
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
        marcador: '',
        data_pedido: undefined,
        prazo_resposta: undefined,
        pdf_url: '',
        campos_extras: {},
      },
    ]);
  });
});

describe('matchPedidoStatusToColuna', () => {
  const colunasPadrao = [
    { slug: 'novo_lead', nome: 'Novo Lead' },
    { slug: 'elaboracao', nome: 'Elaboração de Orçamento' },
    { slug: 'enviado', nome: 'Orçamento Enviado' },
    { slug: 'negociacao', nome: 'Negociação' },
    { slug: 'fechamento', nome: 'Fechamento' },
    { slug: 'perdido', nome: 'Perdido' },
  ];

  it('reconhece "Perdido" e não deixa cair em Novo Lead', () => {
    expect(matchPedidoStatusToColuna('Perdido', colunasPadrao)).toBe('perdido');
    expect(matchPedidoStatusToColuna('Cancelado', colunasPadrao)).toBe('perdido');
  });

  it('casa por nome/slug reais mesmo com colunas customizadas pela empresa', () => {
    const colunasCustom = [
      { slug: 'contato inicial', nome: 'Contato Inicial' },
      { slug: 'visita tecnica', nome: 'Visita Técnica' },
      { slug: 'proposta', nome: 'Proposta Enviada' },
      { slug: 'ganho', nome: 'Ganhamos' },
    ];

    expect(matchPedidoStatusToColuna('Visita Técnica', colunasCustom)).toBe('visita tecnica');
    expect(matchPedidoStatusToColuna('proposta enviada', colunasCustom)).toBe('proposta');
    expect(matchPedidoStatusToColuna('Ganho', colunasCustom)).toBe('ganho');
  });

  it('cai na primeira coluna do funil (respeitando a ordem) quando nada bate', () => {
    expect(matchPedidoStatusToColuna('valor totalmente desconhecido', colunasPadrao)).toBe('novo_lead');
  });

  it('sem colunas carregadas, usa novo_lead como último fallback', () => {
    expect(matchPedidoStatusToColuna('qualquer coisa', [])).toBe('novo_lead');
  });

  // Regressão: sanitizeFieldValue (MappingStep.tsx) rodava ANTES de matchPedidoStatusToColuna
  // e "adivinhava" um valor genérico com uma tabela fixa incompleta (sem "perdido"), que
  // engolia parte do texto antes da etapa real poder ser casada — ex.: "negociações perdidas"
  // virava "negociacao" (perdendo "perdida") e caía sempre em Negociação, nunca em Perdido.
  it('preserva o texto da planilha através da sanitização, então casa com a coluna real', () => {
    const sanitizedGanho = sanitizeFieldValue('Negócios Ganhos', 'status');
    const sanitizedPerdido = sanitizeFieldValue('Negociações Perdidas', 'status');

    expect(matchPedidoStatusToColuna(sanitizedGanho, colunasPadrao)).toBe('fechamento');
    expect(matchPedidoStatusToColuna(sanitizedPerdido, colunasPadrao)).toBe('perdido');
  });
});
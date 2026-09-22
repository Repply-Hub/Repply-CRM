import { describe, it, expect } from 'vitest';
import type { PedidoWithRelations } from '@/hooks/use-pedidos';
import {
  PDF_NEGOCIOS_TETO,
  pdfCabeNoTeto,
  tituloDoPdfDeNegocios,
  linhasDoPdfDeNegocios,
} from './pdf-de-negocios';

/**
 * O PDF de negócios sai com o FILTRO INTEIRO, como o Excel, até um teto.
 *
 * Até 22/09/2026 ele saía só com o que estava carregado na tela (os cartões visíveis de cada
 * coluna do Kanban, ou a página da Lista), mas com o título "Orçamentos - Pipeline Completo" e
 * um "N negócios · Total: R$ X" calculado só sobre essas linhas. Quem recebia o arquivo lia um
 * total de pipeline várias vezes menor que o real, sem nada indicar que era parcial.
 *
 * Decisão do Lucas em 22/09/2026: filtro inteiro até 1.000 negócios; acima disso a tela avisa e
 * sugere filtrar mais ou usar o Excel.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): o repositório é público.
 */

function negocio(id: string, extra: Partial<Record<string, unknown>> = {}): PedidoWithRelations {
  return {
    id,
    status: 'negociacao',
    valor_total: 1000,
    data_pedido: '2026-09-01',
    cliente: { empresa: 'Empresa Exemplo Ltda' },
    obra: { nome_obra: 'Obra Exemplo' },
    fabricante: { nome: 'Fábrica Exemplo' },
    vendedor: { nome: 'Ana Souza' },
    ...extra,
  } as unknown as PedidoWithRelations;
}

const rotulo = (slug: string) => ({ negociacao: 'Negociação', fechamento: 'Fechamento' }[slug] ?? slug);

describe('pdfCabeNoTeto', () => {
  it('aceita até o teto de 1.000 negócios, inclusive', () => {
    expect(PDF_NEGOCIOS_TETO).toBe(1000);
    expect(pdfCabeNoTeto(1)).toBe(true);
    expect(pdfCabeNoTeto(1000)).toBe(true);
  });

  it('recusa acima do teto', () => {
    expect(pdfCabeNoTeto(1001)).toBe(false);
    expect(pdfCabeNoTeto(12000)).toBe(false);
  });
});

describe('tituloDoPdfDeNegocios', () => {
  it('diz "Pipeline Completo" só quando não há filtro nenhum', () => {
    expect(tituloDoPdfDeNegocios(false)).toBe('Orçamentos - Pipeline Completo');
  });

  it('diz "Filtrado" quando há qualquer filtro ou busca', () => {
    expect(tituloDoPdfDeNegocios(true)).toBe('Orçamentos - Filtrado');
  });
});

describe('linhasDoPdfDeNegocios', () => {
  it('leva todos os negócios recebidos, não um recorte', () => {
    const negocios = Array.from({ length: 300 }, (_, i) => negocio(`n${i}`));

    const linhas = linhasDoPdfDeNegocios(negocios, undefined, rotulo);

    expect(linhas).toHaveLength(300);
    expect(linhas.reduce((soma, l) => soma + l.valor, 0)).toBe(300_000);
  });

  it('monta cada linha com cliente, obra, fábrica, vendedor, valor, rótulo da etapa e data', () => {
    const [linha] = linhasDoPdfDeNegocios(
      [negocio('n1', { status: 'fechamento', valor_total: 180000 })],
      undefined,
      rotulo,
    );

    expect(linha).toEqual({
      cliente: 'Empresa Exemplo Ltda',
      obra: 'Obra Exemplo',
      fabricante: 'Fábrica Exemplo',
      vendedor: 'Ana Souza',
      participantes: '',
      valor: 180000,
      etapa: 'Fechamento',
      data: '2026-09-01',
    });
  });

  it('traz os participantes além do responsável principal, em texto', () => {
    const participantes = new Map([['n1', [{ nome: 'Bruno Lima' }, { nome: 'Carla Dias' }]]]);

    const [linha] = linhasDoPdfDeNegocios([negocio('n1')], participantes, rotulo);

    expect(linha.participantes).toBe('Bruno Lima, Carla Dias');
  });

  it('usa traço onde falta cliente, obra, fábrica ou vendedor, e zero onde falta valor', () => {
    const [linha] = linhasDoPdfDeNegocios(
      [negocio('n1', { cliente: null, obra: null, fabricante: null, vendedor: null, valor_total: null })],
      undefined,
      rotulo,
    );

    expect(linha).toMatchObject({ cliente: '-', obra: '-', fabricante: '-', vendedor: '-', valor: 0 });
  });
});

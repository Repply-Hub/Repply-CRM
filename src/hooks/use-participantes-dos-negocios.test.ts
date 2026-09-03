import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * O mapa de participantes por negócio — o que alimenta o "+N" da lista, o cartão do Kanban e
 * a coluna "Outros responsáveis" do PDF.
 *
 * 🔴 Duas coisas com falha SILENCIOSA e por isso testadas:
 *
 *   1. A PAGINAÇÃO. O PostgREST devolve no máximo 1.000 linhas por ida ao servidor e NÃO avisa
 *      que cortou. Sem o laço, o negócio nº 1.001 apareceria sem participante nenhum — e
 *      ninguém desconfiaria, porque a tela mostraria um número plausível (zero).
 *
 *   2. O CORTE NO LOTE CURTO. Sem ele o laço iria até o teto de 50 mil pedindo página vazia
 *      atrás de página vazia, o que é 50 idas ao servidor para não trazer nada.
 */

let paginas: Array<Array<{ pedido_id: string; usuario_id: string; usuarios: { nome: string } }>> = [];
const faixasPedidas: Array<[number, number]> = [];
let erro: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async (de: number, ate: number) => {
              faixasPedidas.push([de, ate]);
              const indice = Math.floor(de / 1000);
              return { data: paginas[indice] ?? [], error: erro };
            },
          }),
        }),
      }),
    }),
  },
}));

import { buscarParticipantesDosNegocios } from './use-participantes-dos-negocios';

function linha(pedido: string, usuario: string, nome: string) {
  return { pedido_id: pedido, usuario_id: usuario, usuarios: { nome } };
}

/** Uma página cheia (1.000 linhas), para forçar o laço a pedir a próxima. */
function paginaCheia(prefixo: string) {
  return Array.from({ length: 1000 }, (_, i) => linha(`${prefixo}-${i}`, `u-${i}`, `Pessoa ${i}`));
}

beforeEach(() => {
  paginas = [];
  faixasPedidas.length = 0;
  erro = null;
});

afterEach(() => vi.clearAllMocks());

describe('buscarParticipantesDosNegocios', () => {
  it('agrupa vários participantes no mesmo negócio', async () => {
    paginas = [[linha('ped-1', 'u1', 'Bruno Sá'), linha('ped-1', 'u2', 'Ana Lima'), linha('ped-2', 'u3', 'Caio')]];

    const mapa = await buscarParticipantesDosNegocios();

    expect(mapa.get('ped-1')?.map((r) => r.nome)).toEqual(['Ana Lima', 'Bruno Sá']);
    expect(mapa.get('ped-2')?.map((r) => r.nome)).toEqual(['Caio']);
    expect(mapa.has('ped-3')).toBe(false);
  });

  it('🔴 continua pedindo enquanto a página vem cheia — o corte em 1.000 não avisa que cortou', async () => {
    paginas = [paginaCheia('a'), [linha('ped-tardio', 'u9', 'Zeca')]];

    const mapa = await buscarParticipantesDosNegocios();

    expect(faixasPedidas.length).toBe(2);
    expect(faixasPedidas[1]).toEqual([1000, 1999]);
    expect(mapa.get('ped-tardio')?.[0].nome).toBe('Zeca');
    expect(mapa.size).toBe(1001);
  });

  it('🔴 para no primeiro lote curto, em vez de varrer até o teto', async () => {
    paginas = [[linha('ped-1', 'u1', 'Ana')]];

    await buscarParticipantesDosNegocios();

    expect(faixasPedidas).toEqual([[0, 999]]);
  });

  it('nome ausente não vira nome inventado', async () => {
    paginas = [[{ pedido_id: 'ped-1', usuario_id: 'u1', usuarios: null } as never]];

    const mapa = await buscarParticipantesDosNegocios();

    expect(mapa.get('ped-1')?.[0].nome).toBe('Sem nome');
  });

  it('erro do banco sobe, em vez de devolver mapa vazio', async () => {
    erro = { message: 'permission denied', code: '42501' };
    paginas = [[linha('ped-1', 'u1', 'Ana')]];

    await expect(buscarParticipantesDosNegocios()).rejects.toBeTruthy();
  });
});

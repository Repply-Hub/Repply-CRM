import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * O QUE ESTE ARQUIVO PRENDE, na faixa "Agendados para retornar":
 *  1. fechada mostra o resumo (quantidade + valor guardado);
 *  2. o resumo POR VENDEDOR só aparece para quem vê a pauta toda — mesmo que o servidor mande
 *     dados, a tela não desenha para os demais (reforço do corte que já é do servidor, §6.1);
 *  3. aberta, a tabela traz a coluna "Volta em";
 *  4. "Trazer de volta" pede confirmação e só então chama `cancelar_retorno`.
 *
 * Nomes inventados (CLAUDE.md §6.9). O vendedor do resumo ('Ana Souza') é DIFERENTE do responsável
 * das linhas ('Bruno Lima') de propósito: é assim que o teste 2 distingue o chip da tabela.
 */
const estado = vi.hoisted(() => ({
  qtd_total: 3,
  valor_total: 240000,
  por_vendedor: [{ vendedor: 'Ana Souza', qtd: 3, valor: 240000 }],
  canceladas: [] as { p_pedido_id: string }[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'dashboard_agendados') {
        return {
          data: [{
            qtd_total: estado.qtd_total,
            valor_total: estado.valor_total,
            agendados_por_vendedor: estado.por_vendedor,
          }],
          error: null,
        };
      }
      if (nome === 'negocios_agendados') {
        return {
          data: Array.from({ length: Math.min(estado.qtd_total, 100) }, (_, i) => ({
            id: `neg-${i}`,
            nome: `Negócio ${i}`,
            fabrica: 'Fábrica X',
            etapa: 'Proposta',
            responsavel: 'Bruno Lima',
            responsavel_avatar: null,
            valor: 80000 - i,
            data_retorno: '2026-09-25',
            total_geral: estado.qtd_total,
            valor_geral: estado.valor_total,
            tentativas: 0,
          })),
          error: null,
        };
      }
      if (nome === 'cancelar_retorno') {
        estado.canceladas.push(args as { p_pedido_id: string });
        return { data: [{ retornos_removidos: 1, tarefas_removidas: 1 }], error: null };
      }
      return { data: null, error: null };
    },
  },
}));

import { AgendadosParaRetornar } from './AgendadosParaRetornar';

beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

beforeEach(() => {
  estado.qtd_total = 3;
  estado.valor_total = 240000;
  estado.por_vendedor = [{ vendedor: 'Ana Souza', qtd: 3, valor: 240000 }];
  estado.canceladas = [];
});

afterEach(() => cleanup());

function montar(podeVerDeTodos = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(
    <AgendadosParaRetornar empresaId="emp-1" filtros={{}} podeVerDeTodos={podeVerDeTodos} onAbrir={() => {}} />,
    { wrapper: Wrapper },
  );
}

describe('a faixa de agendados para retornar', () => {
  it('fechada, mostra o resumo com quantidade e valor guardado', async () => {
    montar(true);
    expect(await screen.findByText('3 negócios')).toBeInTheDocument();
    expect(screen.getByText('R$ 240.000,00')).toBeInTheDocument();
    expect(screen.getByText('Agendados para retornar')).toBeInTheDocument();
  });

  it('🔴 sem a chave, NÃO mostra o resumo por vendedor (mesmo o servidor mandando)', async () => {
    montar(false);
    // abre a sanfona
    fireEvent.click(await screen.findByText('Agendados para retornar'));
    // a tabela carrega (responsável Bruno Lima aparece)…
    expect(await screen.findAllByText('Bruno Lima')).not.toHaveLength(0);
    // …mas o chip do resumo por vendedor (Ana Souza) NÃO
    expect(screen.queryByText('Ana Souza')).toBeNull();
  });

  it('com a chave, mostra o resumo por vendedor ao abrir', async () => {
    montar(true);
    fireEvent.click(await screen.findByText('Agendados para retornar'));
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
  });

  it('aberta, a tabela tem a coluna "Volta em"', async () => {
    montar(true);
    fireEvent.click(await screen.findByText('Agendados para retornar'));
    expect(await screen.findByText('Volta em')).toBeInTheDocument();
    // a data do retorno, formatada
    expect(screen.getAllByText('25/09/2026').length).toBeGreaterThan(0);
  });

  it('🔴 "Trazer de volta" pede confirmação e só então chama cancelar_retorno', async () => {
    montar(true);
    fireEvent.click(await screen.findByText('Agendados para retornar'));
    // clicar no botão da linha NÃO cancela ainda — abre a confirmação
    fireEvent.click((await screen.findAllByRole('button', { name: 'Trazer de volta' }))[0]);
    expect(estado.canceladas).toHaveLength(0);
    expect(await screen.findByText('Trazer o negócio de volta?')).toBeInTheDocument();
    // confirmar no diálogo chama a função
    fireEvent.click(screen.getByRole('button', { name: 'Sim, trazer de volta' }));
    await waitFor(() => expect(estado.canceladas).toHaveLength(1));
    expect(estado.canceladas[0].p_pedido_id).toBe('neg-0');
  });
});

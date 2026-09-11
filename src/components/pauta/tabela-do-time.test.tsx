import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * O QUE ESTE ARQUIVO PRENDE: o comportamento do "Ver mais" da tabela do time, que é onde esta
 * tela pode ficar cara sem ninguém perceber.
 *
 * 🔴 O CASO PRINCIPAL É O TERCEIRO: mexer num filtro tem de voltar a página para 10 **sem antes
 * pedir o tamanho antigo**. Quem abriu 60 linhas e depois estreita o filtro estaria pedindo 60
 * linhas de um recorte que acabou de encolher — e, como a lista é ordenada por valor sobre a
 * carteira inteira debaixo da regra de segurança do banco, a página grande é justamente a cara.
 *
 * Esse detalhe é a razão de o reinício ser feito DURANTE a renderização e não num `useEffect`.
 * Efeito roda depois da renderização e depois dos efeitos internos do TanStack Query: a consulta
 * grande já teria saído para o servidor, e o efeito só a tornaria inútil. É a diferença entre
 * "não gastou" e "gastou à toa" — e ela não aparece na tela, só na conta do banco. Por isso o
 * teste conta as CHAMADAS, não o que está escrito no botão.
 */

const estado = vi.hoisted(() => ({
  chamadas: [] as { p_limite: number; p_etapas: string[] | null }[],
  total: 145,
  // O erro do Supabase é um objeto simples, não um `Error` — é essa a forma que chega na tela
  // (CLAUDE.md §4.6), e é por isso que o esboço devolve exatamente ela.
  erro: null as null | { message: string; details?: string; hint?: string; code?: string },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (_nome: string, args: { p_limite: number; p_etapas: string[] | null }) => {
      estado.chamadas.push(args);
      if (estado.erro) return { data: null, error: estado.erro };
      // O servidor devolve no máximo o que existe no recorte — e nunca mais de 100, que é o teto
      // escrito dentro da função (`least(p_limite, 100)`, migration 20260909130000).
      const quantas = Math.min(args.p_limite, 100, estado.total);
      return {
        data: Array.from({ length: quantas }, (_, i) => ({
          id: `neg-${i}`,
          nome: `Negócio ${i}`,
          fabrica: 'Fábrica X',
          etapa: 'Proposta',
          responsavel: 'Ana Souza',
          valor: 10_000 - i,
          dias_parado: 9,
          // `total_geral` repete em toda linha o total do RECORTE, não o da página.
          total_geral: estado.total,
        })),
        error: null,
      };
    },
  },
}));

import { TabelaDoTime } from './TabelaDoTime';

function envolver() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function montar(filtros: { etapas?: string[] } = {}, podeVerDeTodos = true) {
  const Wrapper = envolver();
  return render(
    <TabelaDoTime
      empresaId="emp-1"
      filtros={filtros}
      podeVerDeTodos={podeVerDeTodos}
      onAbrir={() => {}}
      onRetomar={() => {}}
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  estado.chamadas = [];
  estado.total = 145;
  estado.erro = null;
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('a tabela do time', () => {
  it('abre com 10 linhas e diz onde a pessoa está na lista', async () => {
    montar();

    expect(await screen.findByText('Ver mais (mostrando 10 de 145)')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 10 linhas + o cabeçalho
    expect(estado.chamadas[0].p_limite).toBe(10);
  });

  it('"Ver mais" cresce o limite em vez de andar com o deslocamento', async () => {
    montar();
    fireEvent.click(await screen.findByText('Ver mais (mostrando 10 de 145)'));

    expect(await screen.findByText('Ver mais (mostrando 20 de 145)')).toBeInTheDocument();
    expect(estado.chamadas.map((c) => c.p_limite)).toEqual([10, 20]);
  });

  it('🔴 mexer no filtro volta para 10 SEM pedir antes as 20 do recorte novo', async () => {
    const { rerender } = montar();
    fireEvent.click(await screen.findByText('Ver mais (mostrando 10 de 145)'));
    await screen.findByText('Ver mais (mostrando 20 de 145)');

    // O filtro estreitou: agora o recorte tem 12 negócios, não 145. O `rerender` do Testing
    // Library reaplica o mesmo envoltório, então o componente continua no MESMO cache — que é
    // exatamente o cenário de quem mexe num filtro com a tela já aberta.
    estado.total = 12;
    rerender(
      <TabelaDoTime
        empresaId="emp-1"
        filtros={{ etapas: ['proposta'] }}
        podeVerDeTodos
        onAbrir={() => {}}
        onRetomar={() => {}}
      />,
    );

    await screen.findByText('Ver mais (mostrando 10 de 12)');

    const doRecorteNovo = estado.chamadas.filter((c) => c.p_etapas !== null);
    expect(doRecorteNovo.map((c) => c.p_limite)).toEqual([10]);
  });

  it('esconde o "Ver mais" quando a lista inteira já está na tela', async () => {
    estado.total = 6;
    montar();

    expect(await screen.findByText('6 negócios — a lista inteira.')).toBeInTheDocument();
    expect(screen.queryByText(/Ver mais/)).toBeNull();
  });

  /**
   * 🔴 O TETO DE 100 DA FUNÇÃO DE BANCO. Passando dele, o servidor devolve as mesmas 100 linhas
   * por mais que a tela peça — um "Ver mais" ali seria um botão que não faz nada. A tabela para
   * de oferecê-lo e diz onde parou.
   */
  it('para no teto de 100 e explica, em vez de oferecer um botão que não muda nada', async () => {
    estado.total = 145;
    montar();
    for (let i = 0; i < 9; i++) {
      fireEvent.click(await screen.findByText(/^Ver mais/));
    }

    await waitFor(() =>
      expect(screen.getByText(/Mostrando os 100 maiores de 145/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Ver mais/)).toBeNull();
  });

  /**
   * Sem a chave `pauta_de_todos` o servidor só manda os negócios da própria pessoa, então a
   * coluna repetiria o mesmo nome em todas as linhas. Esconder aqui é COSMÉTICO — o corte de
   * verdade é o da função de banco (CLAUDE.md §6.1).
   */
  it('a coluna Responsável só existe para quem tem a chave', async () => {
    montar({}, false);
    await screen.findByText('Negócio 0');
    expect(screen.queryByRole('columnheader', { name: 'Responsável' })).toBeNull();

    cleanup();
    montar({}, true);
    await screen.findByText('Negócio 0');
    expect(screen.getByRole('columnheader', { name: 'Responsável' })).toBeInTheDocument();
  });

  /**
   * 🔴 AUSÊNCIA DE RESPOSTA NÃO É "NÃO HÁ NADA" — as duas maneiras de não ter resposta.
   *
   * O erro do banco a tela mostra com a frase que o banco escreveu (CLAUDE.md §4.6). Já a falta de
   * REDE não vira erro: o TanStack Query PAUSA a consulta, e ela fica sem dados, sem erro e com
   * `isLoading` falso — medido no navegador em 10/09/2026 (`status: pending`,
   * `fetchStatus: paused`). Sem um ramo próprio, os dois cairiam no "nenhum negócio pedindo
   * atenção", que é a tela mentindo por falta de resposta.
   */
  it('mostra a frase que o BANCO escreveu quando a consulta falha', async () => {
    estado.erro = {
      code: 'PGRST202',
      message: 'Could not find the function public.negocios_em_risco in the schema cache',
    };
    montar();

    expect(await screen.findByText(/Could not find the function public\.negocios_em_risco/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum negócio pedindo atenção agora.')).toBeNull();
  });

  it('🔴 consulta pausada diz que ainda não carregou — nunca "nenhum negócio pedindo atenção"', async () => {
    onlineManager.setOnline(false);
    montar();

    expect(await screen.findByText(/Ainda não consegui carregar a lista/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum negócio pedindo atenção agora.')).toBeNull();
    expect(estado.chamadas).toHaveLength(0);
  });

  /**
   * 🔴 A FRASE DA PAUSA NÃO PODE CULPAR A INTERNET.
   *
   * `isPaused` tem DUAS portas: o `canContinue()` do Query exige rede **e** foco da aba, então
   * trocar de aba no meio de uma tentativa também pausa. Medido em 10/09/2026 no `localhost`:
   * consulta pausada com `navigator.onLine` verdadeiro e o `fetch` respondendo 200, guardando em
   * `failureReason` o erro de verdade — "Could not find the function public.negocios_em_risco".
   *
   * Dizer "sem conexão" ali manda a pessoa conferir o wi-fi por causa de um erro do servidor, e
   * joga fora a explicação que o banco mandou. Este teste falha se alguém reescrever a frase
   * culpando a rede de novo.
   */
  it('🔴 pausada com um motivo guardado, mostra o motivo — não culpa a internet', async () => {
    estado.erro = {
      code: 'PGRST202',
      message: 'Could not find the function public.negocios_em_risco in the schema cache',
    };
    onlineManager.setOnline(false);
    montar();

    expect(await screen.findByText(/Ainda não consegui carregar a lista/)).toBeInTheDocument();
    expect(screen.queryByText(/[Ss]em conexão/)).toBeNull();
    expect(screen.queryByText(/internet/)).toBeNull();
  });

  it('cada linha tem as duas ações, e "Retomar depois" não abre o negócio junto', async () => {
    const abertos: string[] = [];
    const retomados: string[] = [];
    const Wrapper = envolver();
    render(
      <TabelaDoTime
        empresaId="emp-1"
        filtros={{}}
        podeVerDeTodos
        onAbrir={(id) => abertos.push(id)}
        onRetomar={(linha) => retomados.push(linha.id)}
      />,
      { wrapper: Wrapper },
    );

    await screen.findByText('Negócio 0');
    fireEvent.click(screen.getAllByRole('button', { name: 'Retomar depois' })[0]);

    expect(retomados).toEqual(['neg-0']);
    // 🔴 O ponto do `stopPropagation`: a linha inteira também abre o negócio, e sem ele o clique
    // no botão dispararia as duas coisas — o diálogo e o painel, um por cima do outro.
    expect(abertos).toEqual([]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir negócio' })[0]);
    expect(abertos).toEqual(['neg-0']);
  });
});

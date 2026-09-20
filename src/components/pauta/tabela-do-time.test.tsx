import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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
  chamadas: [] as {
    p_limite: number;
    p_etapas: string[] | null;
    p_ordenar_por?: string;
    p_ascendente?: boolean;
  }[],
  total: 145,
  // Quantas retomadas a PRIMEIRA linha teve (as outras vêm com 0). Um teste sobe isto para provar a
  // etiqueta "Nª tentativa"; o padrão 0 mantém os outros testes sem etiqueta nenhuma.
  tentativas: 0,
  // O erro do Supabase é um objeto simples, não um `Error` — é essa a forma que chega na tela
  // (CLAUDE.md §4.6), e é por isso que o esboço devolve exatamente ela.
  erro: null as null | { message: string; details?: string; hint?: string; code?: string },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (
      _nome: string,
      args: { p_limite: number; p_etapas: string[] | null; p_ordenar_por?: string; p_ascendente?: boolean },
    ) => {
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
          // Só a primeira linha tem foto — as outras nove seguem sem, e são a prova de que o
          // conserto da foto (F1 da revisão final) não esconde a inicial de quem não tem uma.
          responsavel_avatar: i === 0 ? 'https://exemplo.test/ana-souza.png' : null,
          valor: 10_000 - i,
          dias_parado: 9,
          // `total_geral` repete em toda linha o total do RECORTE, não o da página.
          total_geral: estado.total,
          // Só a primeira linha carrega as retomadas do cenário; as demais, nenhuma.
          tentativas: i === 0 ? estado.tentativas : 0,
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

// O menu de ordenação é Radix, que usa APIs de ponteiro que o jsdom não implementa; sem estes
// esboços, abrir o menu estoura.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

beforeEach(() => {
  estado.chamadas = [];
  estado.total = 145;
  estado.tentativas = 0;
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

  it('a linha perseguida mostra a etiqueta "Nª tentativa", e a não-perseguida não', async () => {
    estado.tentativas = 2; // a primeira linha teve 2 retomadas registradas
    montar();
    await screen.findByText('Negócio 0');
    // 2 retomadas + o envio = "3ª tentativa"
    expect(screen.getByText('3ª tentativa')).toBeInTheDocument();
    // só a primeira linha ganha a etiqueta; as outras nove seguem sem nenhuma
    expect(screen.getAllByText(/ª tentativa/)).toHaveLength(1);
  });

  it('"Ver mais" cresce o limite em vez de andar com o deslocamento', async () => {
    montar();
    fireEvent.click(await screen.findByText('Ver mais (mostrando 10 de 145)'));

    expect(await screen.findByText('Ver mais (mostrando 20 de 145)')).toBeInTheDocument();
    expect(estado.chamadas.map((c) => c.p_limite)).toEqual([10, 20]);
  });

  it('a ordenação-padrão que vai ao servidor é maior valor primeiro', async () => {
    montar();
    await screen.findByText('Negócio 0');
    expect(estado.chamadas[0].p_ordenar_por).toBe('valor');
    expect(estado.chamadas[0].p_ascendente).toBe(false);
  });

  it('ordenar por "Menor valor primeiro" manda valor ascendente e volta o "Ver mais" para 10', async () => {
    montar();
    // Cresce para 20 primeiro — é o que prova que trocar a ordem REINICIA a lista, não pede 20 da
    // ordem nova (o mesmo cuidado do reinício por filtro, acima).
    fireEvent.click(await screen.findByText('Ver mais (mostrando 10 de 145)'));
    await screen.findByText('Ver mais (mostrando 20 de 145)');

    // Abre o menu do título "Valor" (Enter abre o menu Radix de forma confiável no jsdom) e escolhe
    // o crescente.
    fireEvent.keyDown(screen.getByRole('button', { name: /Valor/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByText('Menor valor primeiro'));

    await waitFor(() => {
      const ultima = estado.chamadas.at(-1)!;
      expect(ultima.p_ordenar_por).toBe('valor');
      expect(ultima.p_ascendente).toBe(true);
      expect(ultima.p_limite).toBe(10);
    });
  });

  it('a coluna de ações não tem menu de ordenação', async () => {
    montar();
    await screen.findByText('Negócio 0');
    // O cabeçalho de ações é o rótulo invisível "Ações", e não vira gatilho de ordenação.
    expect(screen.queryByRole('button', { name: 'Ações' })).toBeNull();
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
   *
   * O teste desenha até 100 linhas em nove cliques: sozinho leva uns 3 s, e com a máquina
   * ocupada passou dos 5 s do padrão (15/09/2026). Daí o prazo próprio no fim.
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
  }, 15_000);

  /**
   * Desde 16/09/2026 a coluna Responsável aparece SEMPRE (pedido do Lucas), com e sem a chave
   * `pauta_de_todos`. Sem a chave, o servidor só manda os negócios da própria pessoa, então a
   * coluna mostra o rosto dela mesma em toda linha — que é o que o Lucas pediu ver. O corte de
   * quem vê o quê continua sendo o da função de banco (CLAUDE.md §6.1), não esta coluna.
   */
  it('a coluna Responsável aparece com e sem a chave', async () => {
    montar({}, false);
    await screen.findByText('Negócio 0');
    expect(screen.getByRole('columnheader', { name: 'Responsável' })).toBeInTheDocument();

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

  describe('a tabela do time: rosto do dono, botão laranja e âncora', () => {
    it('🔴 o dono aparece no círculo, com as iniciais quando não há foto', async () => {
      montar({}, true);
      // O jsdom não carrega imagem sozinho: sem o truque do `window.Image` (ver o teste "com a
      // foto…", logo abaixo), o `<AvatarImage>` nunca avisa que carregou e o Radix mantém a
      // inicial — que é também o que aparece enquanto a foto de verdade carrega ou quando falha.
      expect(await screen.findAllByText('AS')).toHaveLength(10);
    });

    it('🔴 com a foto carregada, a linha do dono mostra a imagem — sem esconder a inicial de quem não tem foto', async () => {
      // O mesmo truque de CampoDeResponsaveis.foto.test.tsx (linhas ~19-38): quem o Radix
      // consulta para saber se a foto chegou é um `new window.Image()` interno, não o `<img>`
      // desenhado na tela — e o jsdom não carrega nenhum dos dois sozinho. Restaura o original no
      // fim MESMO se o teste falhar, para a troca não vazar para os outros testes deste arquivo,
      // que contam com o jsdom NÃO carregando imagem para continuar mostrando a inicial.
      class ImagemJaCarregada {
        complete = true;
        naturalWidth = 64;
        src = '';
        referrerPolicy = '';
        crossOrigin: string | null = null;
        addEventListener() {}
        removeEventListener() {}
      }
      const ImagemOriginal = window.Image;
      (window as unknown as { Image: unknown }).Image = ImagemJaCarregada;

      try {
        montar({}, true);
        const linhaDoDono = (await screen.findByText('Negócio 0')).closest('tr') as HTMLElement;

        await waitFor(() =>
          expect(
            linhaDoDono.querySelector('img[src="https://exemplo.test/ana-souza.png"]'),
          ).not.toBeNull(),
        );
        // A prova de que a foto SUBSTITUI a inicial, em vez de as duas aparecerem juntas — o
        // defeito original relatado pelo Lucas (ver o comentário de `CampoDeResponsaveis.foto.test.tsx`).
        expect(within(linhaDoDono).queryByText('AS')).toBeNull();
        // As outras 9 linhas continuam mostrando as iniciais porque não têm foto — o conserto não
        // esconde a inicial de quem não tem avatar.
        expect(screen.getAllByText('AS')).toHaveLength(9);
      } finally {
        (window as unknown as { Image: unknown }).Image = ImagemOriginal;
      }
    });

    it('sem a chave, o círculo do dono também aparece — é o próprio usuário', async () => {
      montar({}, false);
      await screen.findByText('Negócio 0');
      // Sem a chave o servidor manda só os negócios da própria pessoa, então o rosto (aqui, as
      // iniciais, porque o jsdom não carrega a foto) aparece em toda linha — o que o Lucas pediu.
      expect(await screen.findAllByText('AS')).toHaveLength(10);
    });

    it('"Abrir negócio" é o botão principal, laranja como na pauta', async () => {
      montar();
      const botoes = await screen.findAllByRole('button', { name: 'Abrir negócio' });
      expect(botoes[0].className).toContain('bg-primary');
    });

    it('o cartão tem a âncora que o aviso da pauta vazia usa', async () => {
      const { container } = montar();
      await screen.findByText('Negócio 0');
      expect(container.querySelector('#tabela-do-time')).not.toBeNull();
    });
  });
});

describe('as larguras da tabela do time', () => {
  const CHAVE_COM = 'repply_hoje_larguras_tabela_do_time_com_responsavel_v1';
  const alca = (rotulo: string) =>
    screen.getByRole('separator', { name: `Ajustar a largura da coluna ${rotulo}` });

  beforeEach(() => localStorage.clear());

  async function colunas(container: HTMLElement) {
    await screen.findByText('Negócio 0');
    return Array.from(container.querySelectorAll('col')) as HTMLElement[];
  }

  it('🔴 por padrão a soma cabe no espaço da tabela na página: 926 px', async () => {
    const com = montar({}, true);
    expect(await colunas(com.container)).toHaveLength(7);
    expect((com.container.querySelector('table') as HTMLElement).style.width).toBe('926px');

    cleanup();
    // A coluna Responsável aparece sempre agora: sem a chave a tabela tem a MESMA forma (7 colunas).
    const sem = montar({}, false);
    expect(await colunas(sem.container)).toHaveLength(7);
    expect((sem.container.querySelector('table') as HTMLElement).style.width).toBe('926px');
  });

  it('a largura guardada neste navegador é a que aparece; o que não foi guardado nasce no padrão', async () => {
    localStorage.setItem(CHAVE_COM, JSON.stringify({ negocio: 333 }));
    const { container } = montar();
    const cols = await colunas(container);
    expect(cols[0].style.width).toBe('333px');
    expect(cols[1].style.width).toBe('76px');
  });

  it('as setas do teclado ajustam a coluna, e o ajuste fica guardado', async () => {
    const { container } = montar();
    const cols = await colunas(container);
    expect(cols[0].style.width).toBe('154px');

    fireEvent.keyDown(alca('Negócio'), { key: 'ArrowRight' });

    await waitFor(() => expect(cols[0].style.width).toBe('170px'));
    expect(JSON.parse(localStorage.getItem(CHAVE_COM) as string).negocio).toBe(170);
  });

  it('dois cliques na alça voltam a coluna à largura-padrão', async () => {
    localStorage.setItem(CHAVE_COM, JSON.stringify({ negocio: 333 }));
    const { container } = montar();
    const cols = await colunas(container);

    fireEvent.doubleClick(alca('Negócio'));

    await waitFor(() => expect(cols[0].style.width).toBe('154px'));
    expect(JSON.parse(localStorage.getItem(CHAVE_COM) as string).negocio).toBe(154);
  });

  it('🔴 a alça é acessível: tem piso, teto e um texto do valor em pixels', async () => {
    // Sem aria-valuemin/aria-valuemax um role="separator" assume a faixa padrão 0–100, e a
    // MAIOR largura-padrão da tabela (154, de "Negócio") já ficaria fora dela.
    const { container } = montar();
    await colunas(container);

    const alcaDoNegocio = alca('Negócio');
    expect(alcaDoNegocio.getAttribute('aria-valuemin')).toBe('120');
    expect(alcaDoNegocio.getAttribute('aria-valuetext')).toBe('154 pixels');
  });

  it('🔴 a coluna já no padrão: dois cliques na alça não gravam nada', async () => {
    // Um duplo clique numa coluna que já está no padrão não muda largura nenhuma — e não deveria
    // congelar as larguras-padrão de hoje no navegador de quem só tocou a alça.
    const { container } = montar();
    await colunas(container);

    fireEvent.doubleClick(alca('Negócio'));

    expect(localStorage.getItem(CHAVE_COM)).toBeNull();
  });

  it('o título da coluna continua com o nome dela, e não com o texto da alça', async () => {
    montar();
    await screen.findByText('Negócio 0');
    expect(screen.getByRole('columnheader', { name: 'Responsável' })).toBeInTheDocument();
  });
});

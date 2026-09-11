import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ItemDaPauta } from '@/hooks/use-pauta';
import { PADROES_DA_PAUTA } from '@/hooks/use-configuracoes-automacao';
import Hoje from './Hoje';

/**
 * O topo da tela "Hoje": três estados, e só dois deles falam com a voz da pauta.
 *
 *   · fila com itens — a manchete é a de `vozDaPauta`, a escada desenhada para a tela e o e-mail
 *     das 7h dizerem a mesma coisa, e a linha de baixo só aparece quando a voz tem uma;
 *   · fila vazia E tabela do time vazia — a tela comemora com o degrau 1, e o sol continua;
 *   · 🔴 fila vazia COM trabalho na tabela do time, ou sem resposta dela — "Sua fila está vazia".
 *     A voz NÃO entra aqui: com a fila vazia ela diz "Seu dia está seu", e isso seria mentira logo
 *     acima de uma tabela cheia. É o estado de quem supervisiona e não tem negócio próprio; ele
 *     nasceu depois do plano da voz, e por isso é o mais fácil de alguém "unificar" sem perceber.
 *
 * E a régua de "parado" da frase tem de ser a da empresa, a mesma com que o banco montou a fila: o
 * último bloco prova que o ajuste lido do banco chega à voz, e que sem ele vale o 3 do banco.
 *
 * O resto da tela é esboço (a tabela do time, o painel do negócio, o diálogo): o que se prende aqui
 * é o que o topo diz. Nomes e valores INVENTADOS — o repositório é público (CLAUDE.md §6.9).
 */

const tela = vi.hoisted(() => ({
  pauta: { data: [] as unknown[] | undefined, isLoading: false },
  time: {
    data: { total: 0, linhas: [] } as { total: number; linhas: unknown[] } | undefined,
    isLoading: false,
    status: 'success',
  },
  ajustes: { data: undefined as Record<string, unknown> | undefined },
  empresasPedidas: [] as (string | undefined)[],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/pauta/RadarDeRisco', () => ({ RadarDeRisco: () => null }));
vi.mock('@/components/pauta/DialogoRetorno', () => ({ DialogoRetorno: () => null }));
vi.mock('@/components/pedidos/PainelDoNegocio', () => ({ PainelDoNegocio: () => null }));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { empresa_id: 'emp-1', nome: 'Ana Souza' } }),
}));
vi.mock('@/hooks/use-minha-permissao', () => ({ usePossoVerPautaDeTodos: () => false }));
vi.mock('@/hooks/use-negocio-no-endereco', () => ({
  useNegocioNoEndereco: () => ({ negocioAberto: null, abrirNegocio: () => {}, fecharNegocio: () => {} }),
}));
vi.mock('@/hooks/use-pauta', () => ({ usePauta: () => tela.pauta }));
vi.mock('@/hooks/use-dashboard', () => ({ useNegociosEmRisco: () => tela.time }));
vi.mock('@/hooks/use-configuracoes-automacao', async (importOriginal) => ({
  // Os padrões são os DE VERDADE: é deles que a tela tira o 3 enquanto o ajuste não chega.
  ...(await importOriginal<typeof import('@/hooks/use-configuracoes-automacao')>()),
  useConfiguracoesAutomacao: (empresaId?: string) => {
    tela.empresasPedidas.push(empresaId);
    return tela.ajustes;
  },
}));

const negocio = (titulo: string, valor: number | null, dias: number): ItemDaPauta => ({
  tipo: 'negocio_parado',
  referencia_id: `id-${titulo}`,
  selo: 'Parado',
  titulo,
  detalhe: 'Sem mudar de etapa há alguns dias',
  valor,
  quando: null,
  dias_parado: dias,
  ordem: 0,
  responsavel: null,
});

function prepararTela({
  pauta,
  tabelaDoTime = { total: 0 },
  diasParadoDaEmpresa,
}: {
  pauta: ItemDaPauta[];
  tabelaDoTime?: { total: number } | 'sem resposta';
  diasParadoDaEmpresa?: number;
}) {
  tela.pauta = { data: pauta, isLoading: false };
  tela.time =
    tabelaDoTime === 'sem resposta'
      ? { data: undefined, isLoading: false, status: 'error' }
      : { data: { total: tabelaDoTime.total, linhas: [] }, isLoading: false, status: 'success' };
  tela.ajustes = {
    data:
      diasParadoDaEmpresa === undefined
        ? undefined
        : { ...PADROES_DA_PAUTA, pauta_dias_parado: diasParadoDaEmpresa },
  };
}

function montarATela() {
  return render(
    <MemoryRouter initialEntries={['/hoje']}>
      <Hoje />
    </MemoryRouter>,
  );
}

/** O `Intl` separa "R$" do número com espaço INQUEBRÁVEL; aqui o texto é conferido como se lê. */
const comoSeLe = (el: Element | null) => (el?.textContent ?? '').replace(/\u00A0/g, ' ');
const manchete = () => comoSeLe(screen.getByRole('heading', { level: 2 }));
/** A linha logo abaixo da manchete — só existe quando a voz tem `apoio`. */
const apoio = () => document.querySelector('header p');

afterEach(() => {
  cleanup();
  tela.empresasPedidas.length = 0;
});

describe('o topo da tela "Hoje"', () => {
  describe('🔴 fila vazia com trabalho na tabela do time — quem supervisiona e não tem negócio próprio', () => {
    it('continua dizendo "Sua fila está vazia", e aponta a tabela de baixo', () => {
      prepararTela({ pauta: [], tabelaDoTime: { total: 5 } });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      expect(screen.getByText(/O que pede atenção está na tabela logo abaixo — 5 negócios\./)).toBeInTheDocument();
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
    });

    it('sem resposta da tabela também — ausência de resposta não é tabela vazia', () => {
      prepararTela({ pauta: [], tabelaDoTime: 'sem resposta' });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
    });
  });

  it('fila e tabela vazias: comemora com o degrau 1 da voz, e o sol e o parágrafo ficam', () => {
    prepararTela({ pauta: [], tabelaDoTime: { total: 0 } });
    const { container } = montarATela();

    expect(manchete()).toBe('Nada parado. Seu dia está seu.');
    expect(screen.queryByText('Pauta zerada')).toBeNull();
    expect(screen.getByText(/Nada em aberto para hoje/)).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-sun')).not.toBeNull();
  });

  it('fila com negócios: a manchete é a da voz, com o ponto laranja, e o "em jogo" sai', () => {
    prepararTela({ pauta: [negocio('Obra Exemplo', 250000, 5), negocio('Loja Exemplo', 120500, 5)] });
    montarATela();

    expect(manchete()).toBe('R$ 370.500 parados em 2 negócios.');
    expect(apoio()).toBeNull();
    expect(screen.queryByText(/em jogo|esperam? você/)).toBeNull();
    // Os itens continuam com centavos (`formatarMoedaBRL`); só a frase de cima arredonda.
    expect(
      screen.getAllByText((_, el) => el?.tagName === 'SPAN' && comoSeLe(el) === 'R$ 250.000,00'),
    ).toHaveLength(1);
  });

  it('a linha de baixo aparece quando a voz tem uma: valor e nome do negócio que destoa', () => {
    prepararTela({ pauta: [negocio('Obra Grande', 500000, 5), negocio('Obra Esquecida', 1000, 40)] });
    montarATela();

    expect(manchete()).toBe('Um negócio seu está há 40 dias sem mexer.');
    expect(comoSeLe(apoio())).toBe('R$ 1.000 · Obra Esquecida');
  });

  describe('a régua de "parado" é a da empresa — a mesma com que o banco montou a fila', () => {
    // 4 dias é o dobro de 2 e passa do padrão (3): com a régua padrão, a voz aponta o negócio.
    const fila = [negocio('Obra A', 100, 4), negocio('Obra B', 50, 2)];

    it('🔴 com o ajuste em 10, 4 dias não é parado para esta empresa, e a voz não aponta ninguém', () => {
      prepararTela({ pauta: fila, diasParadoDaEmpresa: 10 });
      montarATela();

      expect(manchete()).toBe('R$ 150 parados em 2 negócios.');
      // O mesmo `empresaId` da aba Automação — é o que faz as duas telas dividirem a chave de cache.
      expect(tela.empresasPedidas).toContain('emp-1');
    });

    it('enquanto o ajuste não chega, ou se a leitura falhar, vale o padrão do banco: 3', () => {
      prepararTela({ pauta: fila });
      montarATela();

      expect(manchete()).toBe('Um negócio seu está há 4 dias sem mexer.');
      expect(comoSeLe(apoio())).toBe('R$ 100 · Obra A');
    });
  });
});

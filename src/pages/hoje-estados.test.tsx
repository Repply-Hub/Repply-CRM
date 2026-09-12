import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * O QUE ESTE ARQUIVO PRENDE: a tela "Hoje" distingue TRÊS dias diferentes que hoje pareciam
 * iguais — o dia em que não havia nada parado, o dia em que a fila própria está vazia mas há
 * trabalho da equipe embaixo, e o dia em que a pessoa (ou o time) ZEROU a pauta.
 *
 * Pedido do dono do produto em 12/09/2026: "quando um usuário for dando os retornos aos
 * negócios que estão na pauta aí a pauta vai diminuindo até zerar". Sem a mensagem própria,
 * quem trabalhou o dia todo vê a mesma tela de quem não tinha nada a fazer.
 *
 * Tudo que fala com o servidor vira esboço: aqui só a ESCOLHA DO ESTADO importa. Nomes e
 * valores inventados (CLAUDE.md §6.9).
 */

const mockPauta = vi.fn();
vi.mock('@/hooks/use-pauta', () => ({
  usePauta: () => mockPauta(),
  useRegistrarRetorno: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-dashboard', () => ({
  useNegociosEmRisco: () => ({ data: { total: 0 }, isLoading: false, status: 'success' }),
}));
vi.mock('@/components/pauta/RadarDeRisco', () => ({ RadarDeRisco: () => <div /> }));
vi.mock('@/components/pedidos/PainelDoNegocio', () => ({ PainelDoNegocio: () => <div /> }));
vi.mock('@/components/pauta/DialogoRetorno', () => ({ DialogoRetorno: () => <div /> }));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { nome: 'Ana Souza', empresa_id: 'emp-1', role: 'gestor' } }),
}));
vi.mock('@/hooks/use-minha-permissao', () => ({ usePossoVerPautaDeTodos: () => true }));
vi.mock('@/hooks/use-configuracoes-automacao', () => ({
  useConfiguracoesAutomacao: () => ({ data: { pauta_dias_parado: 3 } }),
  PADROES_DA_PAUTA: { pauta_dias_parado: 3 },
}));
// 🔴 OS NOMES SÃO OS DO HOOK DE VERDADE (`negocioAberto`, `abrirNegocio`, `fecharNegocio`):
// `Hoje.tsx` desestrutura os três, e um esboço com nomes diferentes entrega `undefined` e a
// tela estoura no primeiro clique — um teste que "passa" sem provar nada.
vi.mock('@/hooks/use-negocio-no-endereco', () => ({
  useNegocioNoEndereco: () => ({
    negocioAberto: null,
    abrirNegocio: vi.fn(),
    fecharNegocio: vi.fn(),
  }),
}));

import { MemoryRouter } from 'react-router-dom';
import Hoje from './Hoje';

afterEach(() => {
  cleanup();
  mockPauta.mockReset();
});

const feito = (id: string) => ({
  tipo: 'negocio_feito', referencia_id: id, selo: 'Feito hoje', titulo: 'Obra Exemplo',
  detalhe: 'Em Negociação', valor: 180000, quando: null, dias_parado: 9, ordem: 2000,
  responsavel: null,
});
const parado = (id: string) => ({
  tipo: 'negocio_parado', referencia_id: id, selo: 'Orçamento parado', titulo: 'Obra Modelo',
  detalhe: 'Em Negociação', valor: 90000, quando: null, dias_parado: 11, ordem: 1000,
  responsavel: null,
});

function desenhar() {
  render(<MemoryRouter><Hoje /></MemoryRouter>);
}

describe('os estados da tela "Hoje"', () => {
  it('🔴 zerou: nenhum pendente e pelo menos um feito', () => {
    mockPauta.mockReturnValue({ data: [feito('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
  });

  it('🔴 com pendente e feito, a tela conta o progresso', () => {
    mockPauta.mockReturnValue({ data: [parado('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.getByText('1 de 2 feitos hoje')).toBeInTheDocument();
    expect(screen.queryByText('Pauta de hoje zerada')).not.toBeInTheDocument();
  });

  it('sem nada feito e sem nada parado, continua a frase de hoje', () => {
    mockPauta.mockReturnValue({ data: [], isLoading: false });
    desenhar();
    expect(screen.queryByText('Pauta de hoje zerada')).not.toBeInTheDocument();
    expect(screen.getByText(/Nada parado/)).toBeInTheDocument();
  });

  it('o negócio já feito não é desenhado como item da fila', () => {
    mockPauta.mockReturnValue({ data: [parado('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.queryByText('Obra Exemplo')).not.toBeInTheDocument();
    expect(screen.getByText('Obra Modelo')).toBeInTheDocument();
  });

  it('🔴 negócio de colega mostra de quem é', () => {
    mockPauta.mockReturnValue({
      data: [{ ...parado('a'), responsavel: 'Bruno Lima' }],
      isLoading: false,
    });
    desenhar();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('negócio próprio não ganha etiqueta de dono', () => {
    // A função de banco manda `responsavel` NULO quando o negócio é de quem está olhando. Sem
    // esta conferência, uma etiqueta com o próprio nome em todo item passaria despercebida.
    mockPauta.mockReturnValue({ data: [parado('a')], isLoading: false });
    desenhar();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });
});

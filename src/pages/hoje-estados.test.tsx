import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

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
// Quantos negócios a tabela do time de baixo tem — cada teste do aviso da pauta vazia escolhe.
const cenario = vi.hoisted(() => ({ totalDoTime: 0 }));
vi.mock('@/hooks/use-dashboard', () => ({
  useNegociosEmRisco: () => ({ data: { total: cenario.totalDoTime }, isLoading: false, status: 'success' }),
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
  cenario.totalDoTime = 0;
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
    // 🔴 PRENDE O CONTRATO: a manchete fala com a voz só o que está NA TELA (`naTela`), não a
    // pauta inteira. Com só o pendente (R$ 90.000, 1 negócio) a voz cai no degrau do valor
    // somado. Contando o feito também (R$ 90.000 + R$ 180.000 em 2 negócios) a frase seria outra
    // — e é essa diferença que prova que `Hoje.tsx` filtra antes de chamar `vozDaPauta`. `\s`
    // porque o `Intl` separa "R$" do número com um espaço NÃO SEPARÁVEL (U+00A0), não um espaço
    // comum.
    expect(screen.getByText(/R\$\s90\.000 parados em 1 negócio/)).toBeInTheDocument();
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

  it('🔴 zerou com negócios na tabela de baixo: aviso com botão que aponta a tabela', () => {
    cenario.totalDoTime = 145;
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
    // Este arquivo monta a tela COM a chave `pauta_de_todos`.
    expect(
      screen.getByText('Quer adiantar? Os 145 negócios que pedem atenção estão na tabela logo abaixo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver a tabela' })).toBeInTheDocument();
  });

  it('zerou com a tabela de baixo vazia: nada para apontar, nenhum aviso', () => {
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver a tabela' })).toBeNull();
  });

  it('"Ver a tabela" desce a tela até a tabela do time', () => {
    cenario.totalDoTime = 145;
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    // O Radar é esboço neste arquivo: a âncora de verdade mora na `TabelaDoTime`, e aqui ela é posta
    // à mão. O jsdom não implementa `scrollIntoView`.
    const alvo = document.createElement('div');
    alvo.id = 'tabela-do-time';
    alvo.scrollIntoView = vi.fn();
    document.body.appendChild(alvo);
    try {
      desenhar();
      fireEvent.click(screen.getByRole('button', { name: 'Ver a tabela' }));
      expect(alvo.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      alvo.remove();
    }
  });
});

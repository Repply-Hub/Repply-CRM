import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// Estado dos esboços (config, gravações e equipe) — trocado por teste. Nomes INVENTADOS (§6.9).
const estado = vi.hoisted(() => ({
  config: { data: undefined as unknown, isLoading: false },
  isPending: false,
  gravados: [] as { chave: string; valor: unknown }[],
  equipe: { data: [] as { id: string; nome: string }[] },
}));

vi.mock('@/hooks/use-configuracoes-automacao', async (importOriginal) => ({
  // Mantém PADROES_DA_PAUTA de verdade — é dele que a config de teste parte.
  ...(await importOriginal<typeof import('@/hooks/use-configuracoes-automacao')>()),
  useConfiguracoesAutomacao: () => estado.config,
  useSalvarConfiguracaoAutomacao: () => ({
    mutateAsync: (arg: { chave: string; valor: unknown }) => {
      estado.gravados.push(arg);
      return Promise.resolve();
    },
    isPending: estado.isPending,
  }),
}));
vi.mock('@/hooks/use-clientes', () => ({ useVendedores: () => estado.equipe }));

import { PADROES_DA_PAUTA } from '@/hooks/use-configuracoes-automacao';
import { AutomacaoTab } from './AutomacaoTab';

const equipeExemplo = [
  { id: 'u-1', nome: 'Ana Souza' },
  { id: 'u-2', nome: 'Bruno Lima' },
];

function prepara({ email = true, excluidos = [] as string[] }) {
  estado.config = {
    data: { ...PADROES_DA_PAUTA, pauta_resumo_email: email, pauta_resumo_excluidos: excluidos },
    isLoading: false,
  };
  estado.equipe = { data: equipeExemplo };
  estado.gravados = [];
}

// O "Adicionar" é um Popover Radix, que usa APIs de ponteiro que o jsdom não traz.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

afterEach(cleanup);

describe('AutomacaoTab — quem recebe o e-mail da pauta', () => {
  it('todos aparecem como autorizados por padrão (nenhum excluído, nenhum botão de adicionar)', () => {
    prepara({ email: true, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    expect(screen.getByRole('button', { name: 'Remover Ana Souza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Bruno Lima' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull();
  });

  it('remover uma pessoa grava a lista de excluídos com o id dela', () => {
    prepara({ email: true, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));

    expect(estado.gravados).toContainEqual({ chave: 'pauta_resumo_excluidos', valor: ['u-1'] });
  });

  it('quem foi removido não aparece como autorizado, e surge o "Adicionar"', () => {
    prepara({ email: true, excluidos: ['u-1'] });
    render(<AutomacaoTab empresaId="emp-1" />);

    expect(screen.queryByRole('button', { name: 'Remover Ana Souza' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover Bruno Lima' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar/ })).toBeInTheDocument();
  });

  it('adicionar de volta tira a pessoa da lista de excluídos', async () => {
    prepara({ email: true, excluidos: ['u-1'] });
    render(<AutomacaoTab empresaId="emp-1" />);

    // O Popover Radix abre no clique do gatilho; dentro, cada removido é um botão para trazer de volta.
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(await screen.findByText('Ana Souza'));

    expect(estado.gravados).toContainEqual({ chave: 'pauta_resumo_excluidos', valor: [] });
  });

  it('com o resumo por e-mail desligado, os botões de remover ficam desabilitados', () => {
    prepara({ email: false, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    expect(screen.getByRole('button', { name: 'Remover Ana Souza' })).toBeDisabled();
  });
});

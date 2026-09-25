import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Dados inventados (CLAUDE.md §6.9): o repositório é público.
const { useVendedoresMock } = vi.hoisted(() => ({ useVendedoresMock: vi.fn() }));
vi.mock('@/hooks/use-clientes', () => ({ useVendedores: useVendedoresMock }));

import { ResponsavelComFoto } from './ResponsavelComFoto';

describe('ResponsavelComFoto', () => {
  beforeEach(() => {
    useVendedoresMock.mockReturnValue({
      data: [{ nome: 'Ana Souza', avatar_url: 'http://exemplo/ana.png' }],
    });
  });
  afterEach(() => cleanup());

  it('sem nome, não renderiza nada', () => {
    const { container } = render(<ResponsavelComFoto nome={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o nome e as iniciais no fallback', () => {
    render(<ResponsavelComFoto nome="Ana Souza" />);
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    // No jsdom o AvatarImage do Radix não "carrega", então o fallback (iniciais) fica visível.
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('com mostrarNome=false, esconde o texto do nome (só o avatar)', () => {
    render(<ResponsavelComFoto nome="Ana Souza" mostrarNome={false} />);
    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('AS')).toBeInTheDocument();
  });
});

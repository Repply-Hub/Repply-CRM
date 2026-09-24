import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BotaoDeAjudaFlutuante } from './BotaoDeAjudaFlutuante';

const useSecaoLigadaMock = vi.fn();
const useBotaoAjudaVisivelMock = vi.fn();

vi.mock('@/hooks/use-secoes', () => ({ useSecaoLigada: (id: string) => useSecaoLigadaMock(id) }));
vi.mock('@/hooks/use-botao-ajuda-visivel', () => ({ useBotaoAjudaVisivel: () => useBotaoAjudaVisivelMock() }));

function renderEm(pathname: string) {
  useSecaoLigadaMock.mockReturnValue({ ligada: true, carregando: false });
  useBotaoAjudaVisivelMock.mockReturnValue({ visivel: true, definir: vi.fn() });
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<BotaoDeAjudaFlutuante />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BotaoDeAjudaFlutuante — direcionamento pela seção atual', () => {
  it('em /whatsapp, o link leva à seção whatsapp da Ajuda', () => {
    renderEm('/whatsapp');
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda?secao=whatsapp');
  });

  it('numa rota filha (/pedidos/123/editar), o link leva à seção da rota-mãe (pipeline)', () => {
    renderEm('/pedidos/123/editar');
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda?secao=pipeline');
  });

  it('numa rota sem seção conhecida (/login), o link cai na Ajuda sem seção fixada', () => {
    renderEm('/login');
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda');
  });

  it('na própria /ajuda, não renderiza nada', () => {
    renderEm('/ajuda');
    expect(screen.queryByRole('link', { name: 'Ajuda' })).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PrecoLancamento } from './PrecoLancamento';

describe('PrecoLancamento', () => {
  it('mostra os dois cards: parcelado neutro e à vista no Pix em destaque', () => {
    render(<PrecoLancamento />);
    // Parcelado
    expect(screen.getByText('Parcelado')).toBeInTheDocument();
    expect(screen.getByText('12x de')).toBeInTheDocument();
    expect(screen.getByText('R$ 333,33')).toBeInTheDocument();
    expect(screen.getByText('por mês, no cartão')).toBeInTheDocument();
    // À vista no Pix — o destaque, com a economia
    expect(screen.getByText('À vista no Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 3.497')).toBeInTheDocument();
    expect(screen.getByText('/ano')).toBeInTheDocument();
    expect(screen.getByText('economize R$ 503')).toBeInTheDocument();
  });

  it('renderiza os dois tamanhos sem quebrar', () => {
    const { rerender } = render(<PrecoLancamento tamanho="grande" />);
    expect(screen.getByText('R$ 3.497')).toBeInTheDocument();
    rerender(<PrecoLancamento tamanho="medio" />);
    expect(screen.getByText('R$ 3.497')).toBeInTheDocument();
  });
});

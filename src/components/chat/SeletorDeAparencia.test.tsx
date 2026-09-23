import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Users2 } from 'lucide-react';
import { SeletorDeAparencia } from './SeletorDeAparencia';

// SeletorCorLivre usa Popover/estado do design system; para este teste focar em
// símbolo/paleta, mockamos o de cor livre por um placeholder inerte.
vi.mock('@/components/shared/SeletorCorLivre', () => ({ SeletorCorLivre: () => null }));

const valor = { icone: null, corFundo: null, corIcone: null, fotoUrl: null };

describe('SeletorDeAparencia', () => {
  it('mostra os 10 símbolos e emite onChange ao escolher um', () => {
    const onChange = vi.fn();
    render(<SeletorDeAparencia valor={valor} onChange={onChange} onEscolherImagem={vi.fn()} IconePadrao={Users2} nome="Grupo" />);
    const botoes = screen.getAllByRole('button', { name: /símbolo/i });
    expect(botoes).toHaveLength(10);
    fireEvent.click(botoes[2]); // 'lampada'
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icone: 'lampada' }));
  });

  it('escolher uma cor da paleta preenche fundo e ícone', () => {
    const onChange = vi.fn();
    render(<SeletorDeAparencia valor={{ ...valor, icone: 'balao' }} onChange={onChange} onEscolherImagem={vi.fn()} IconePadrao={Users2} nome="Grupo" />);
    fireEvent.click(screen.getAllByRole('button', { name: /cor/i })[0]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ corFundo: expect.stringMatching(/^#/), corIcone: expect.stringMatching(/^#/) }));
  });
});

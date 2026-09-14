import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const ouvirAmostraFalso = vi.fn();
vi.mock('@/lib/som', () => ({ ouvirAmostra: (id: string) => ouvirAmostraFalso(id) }));

import { CardDeSom } from './CardDeSom';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  ouvirAmostraFalso.mockReset();
});

describe('CardDeSom', () => {
  it('🔴 a lista de sons começa fechada — a troca não fica toda aparente', () => {
    render(<CardDeSom />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: /quero mudar o som das minhas notificações/i })).toBeTruthy();
  });

  it('abrir mostra os 10 sons, com o padrão marcado', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect((screen.getByRole('radio', { name: 'Padrão' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Criados pela Repply')).toBeTruthy();
  });

  it('escolher grava na hora e toca o som uma vez', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sino' }));
    expect(localStorage.getItem('repply_som_notificacao')).toBe('sino');
    expect(ouvirAmostraFalso).toHaveBeenCalledWith('sino');
  });

  it('o ▶ só toca, sem trocar a escolha', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir Pop' }));
    expect(ouvirAmostraFalso).toHaveBeenCalledWith('pop');
    expect(localStorage.getItem('repply_som_notificacao')).toBeNull();
  });

  it('o liga/desliga continua lá', () => {
    render(<CardDeSom />);
    expect(screen.getByRole('switch', { name: /tocar som nas notificações/i })).toBeTruthy();
  });
});

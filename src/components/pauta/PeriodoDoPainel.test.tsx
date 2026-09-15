import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PeriodoDoPainel } from './PeriodoDoPainel';

describe('PeriodoDoPainel', () => {
  it('desligado por padrão: mostra o botão "Período" e, ao ativar, manda um período completo', () => {
    const onChange = vi.fn();
    render(<PeriodoDoPainel onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0];
    expect(arg.dataDe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.dataAte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ativo: o "×" limpa o período de volta ao desligado', () => {
    const onChange = vi.fn();
    render(<PeriodoDoPainel dataDe="2026-01-01" dataAte="2026-03-31" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar período' }));

    expect(onChange).toHaveBeenCalledWith({ dataDe: undefined, dataAte: undefined });
  });
});

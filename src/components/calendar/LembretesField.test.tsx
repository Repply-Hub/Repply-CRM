import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LembretesField } from './LembretesField';

afterEach(cleanup);

describe('LembretesField', () => {
  it('mostra cada lembrete como etiqueta removível', () => {
    render(<LembretesField value={[1440, 60]} onChange={() => {}} />);
    expect(screen.getByText('1 dia antes')).toBeTruthy();
    expect(screen.getByText('1 hora antes')).toBeTruthy();
  });

  it('remover tira só aquele', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[1440, 60]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover 1 hora antes' }));
    expect(onChange).toHaveBeenCalledWith([1440]);
  });

  it('adicionar uma opção pronta entra na lista, na ordem', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[1440]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith([1440, 15]);
  });

  it('personalizado: 3 horas vira 180 minutos', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
    fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'horas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onChange).toHaveBeenCalledWith([180]);
  });

  it('com 5 lembretes, some a opção de adicionar', () => {
    render(<LembretesField value={[2880, 1440, 120, 60, 15]} onChange={() => {}} />);
    expect(screen.queryByLabelText('Adicionar lembrete')).toBeNull();
  });

  it('sem nenhum, diz que não há lembrete', () => {
    render(<LembretesField value={[]} onChange={() => {}} />);
    expect(screen.getByText('Sem lembrete')).toBeTruthy();
  });

  describe('personalizado — valor que não vale (Bloco 3, item C)', () => {
    const MENSAGEM = 'Não deu para usar esse tempo. Use um número de minutos inteiro, até 30 dias.';

    it('"1,5" minutos mostra o erro, não chama onChange e o formulário continua aberto', () => {
      const onChange = vi.fn();
      render(<LembretesField value={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
      fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: '1,5' } });
      fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'minutos' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText(MENSAGEM)).toBeTruthy();
      // Continua aberto: o campo "Quanto tempo antes" ainda está na tela.
      expect(screen.getByLabelText('Quanto tempo antes')).toBeTruthy();
    });

    it('"abc" mostra o erro', () => {
      const onChange = vi.fn();
      render(<LembretesField value={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
      fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: 'abc' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText(MENSAGEM)).toBeTruthy();
    });

    it('campo vazio mostra o erro', () => {
      const onChange = vi.fn();
      render(<LembretesField value={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
      fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText(MENSAGEM)).toBeTruthy();
    });

    it('"1,5" horas vale, vira 90 e fecha o formulário (aceita vírgula)', () => {
      const onChange = vi.fn();
      render(<LembretesField value={[]} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
      fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: '1,5' } });
      fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'horas' } });
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(onChange).toHaveBeenCalledWith([90]);
      // Fechou: o campo "Quanto tempo antes" não está mais na tela.
      expect(screen.queryByLabelText('Quanto tempo antes')).toBeNull();
    });
  });
});

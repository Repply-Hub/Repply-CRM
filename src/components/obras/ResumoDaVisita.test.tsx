import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResumoDaVisita } from './ResumoDaVisita';

/**
 * `ResumoDaVisita` é o bloco somente-leitura do cartão da visita: mostra a análise já gravada
 * (fase, concorrente, com quem falou, próximo passo e a observação) para QUALQUER pessoa que
 * veja o cartão, não só quem registrou a visita — achado na revisão do Task 6a, onde a análise
 * só aparecia para quem estava no modo de edição.
 */

afterEach(() => cleanup());

describe('ResumoDaVisita', () => {
  it('mostra uma linha por resposta preenchida, incluindo a observação', () => {
    render(
      <ResumoDaVisita
        analise={{
          fase: 'acabamento',
          concorrentes: 'Marca Exemplo',
          contatoNome: 'Pessoa Exemplo',
          proximoPasso: 'Mandar proposta de louças',
          proximoPassoEm: '2026-09-20',
          observacao: 'Obra parada por chuva',
        }}
      />,
    );

    expect(screen.getByText('Fase: Acabamento')).toBeInTheDocument();
    expect(screen.getByText('Concorrente: Marca Exemplo')).toBeInTheDocument();
    expect(screen.getByText('Falou com: Pessoa Exemplo')).toBeInTheDocument();
    expect(screen.getByText('Próximo passo: Mandar proposta de louças (até 20/09)')).toBeInTheDocument();
    expect(screen.getByText('Obs.: Obra parada por chuva')).toBeInTheDocument();
  });

  it('mostra só as respostas que existem, sem inventar as outras', () => {
    render(<ResumoDaVisita analise={{ fase: 'estrutura' }} />);
    expect(screen.getByText('Fase: Estrutura')).toBeInTheDocument();
    expect(screen.queryByText(/Concorrente:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Obs\.:/)).not.toBeInTheDocument();
  });

  it('🔴 sem nenhuma resposta, não desenha nada — nem uma caixa vazia', () => {
    const { container } = render(<ResumoDaVisita analise={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('visita nula também não desenha nada', () => {
    const { container } = render(<ResumoDaVisita analise={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

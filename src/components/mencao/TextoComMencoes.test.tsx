import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TextoComMencoes } from './TextoComMencoes';

afterEach(cleanup);

describe('TextoComMencoes', () => {
  it('destaca o nome mencionado', () => {
    render(<TextoComMencoes texto="@Ângela Souza pode ver?" nomes={['Ângela Souza']} todos={false} />);
    expect(screen.getByText('@Ângela Souza').getAttribute('data-mencao')).toBe('outra');
  });

  it('com mais destaque quando é o nome de quem está lendo', () => {
    render(<TextoComMencoes texto="@Ângela Souza pode ver?" nomes={['Ângela Souza']} todos={false} meuNome="Ângela Souza" />);
    expect(screen.getByText('@Ângela Souza').getAttribute('data-mencao')).toBe('minha');
  });

  it('@todos marcado conta como menção a quem lê', () => {
    render(<TextoComMencoes texto="@todos reunião" nomes={[]} todos meuNome="Carlos" />);
    expect(screen.getByText('@todos').getAttribute('data-mencao')).toBe('minha');
  });

  it('continua transformando link em link', () => {
    render(<TextoComMencoes texto="@Eric veja https://exemplo.com.br" nomes={['Eric']} todos={false} />);
    expect(screen.getByRole('link').getAttribute('href')).toContain('https://exemplo.com.br');
  });
});

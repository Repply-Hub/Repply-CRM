import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EtiquetaDeTentativa } from './EtiquetaDeTentativa';

describe('EtiquetaDeTentativa', () => {
  it('não desenha nada quando não houve retomada', () => {
    const { container } = render(<EtiquetaDeTentativa tentativas={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uma retomada é a "2ª tentativa" (o envio é a 1ª)', () => {
    render(<EtiquetaDeTentativa tentativas={1} />);
    expect(screen.getByText('2ª tentativa')).toBeInTheDocument();
  });

  it('três retomadas viram "4ª tentativa"', () => {
    render(<EtiquetaDeTentativa tentativas={3} />);
    expect(screen.getByText('4ª tentativa')).toBeInTheDocument();
  });
});

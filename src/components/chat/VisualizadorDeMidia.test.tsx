import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualizadorDeMidia } from './VisualizadorDeMidia';

describe('VisualizadorDeMidia', () => {
  it('mostra a imagem quando o tipo é imagem', () => {
    render(<VisualizadorDeMidia midia={{ url: 'blob:x', tipo: 'imagem', nome: 'foto.png' }} onClose={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'foto.png' })).toBeInTheDocument();
  });

  it('mostra o player de vídeo quando o tipo é vídeo', () => {
    // O Dialog do shadcn renderiza num portal (document.body), fora do `container`
    // da render — por isso a busca do <video> é no documento, como a da imagem via `screen`.
    render(<VisualizadorDeMidia midia={{ url: 'blob:y', tipo: 'video', nome: 'clipe.mp4' }} onClose={vi.fn()} />);
    expect(document.querySelector('video')).not.toBeNull();
  });

  it('não renderiza nada sem mídia', () => {
    const { container } = render(<VisualizadorDeMidia midia={null} onClose={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });
});

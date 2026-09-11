import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CampoDeResponsaveis } from './CampoDeResponsaveis';

/**
 * A foto de quem está no negócio.
 *
 * 🔴 O DEFEITO (relatado pelo Lucas em 11/09/2026: algumas imagens dos usuários apareciam
 * cortadas nos responsáveis). O componente desenhava a foto com um `<img>` comum dentro do
 * `<Avatar>`, e as iniciais com `<AvatarFallback>`. O `<AvatarFallback>` só some quando o
 * `<Avatar>` sabe que a foto carregou — e quem conta isso a ele é o `<AvatarImage>`, que não
 * estava lá. Então as duas coisas apareciam JUNTAS, lado a lado dentro do mesmo círculo: a
 * foto espremida de um lado, as iniciais do outro.
 *
 * No ambiente de teste nenhuma imagem carrega sozinha. A `ImagemJaCarregada` faz o papel do
 * navegador: é o que o Radix consulta (`complete` e `naturalWidth`) para decidir que a foto
 * chegou.
 */
class ImagemJaCarregada {
  complete = true;
  naturalWidth = 64;
  src = '';
  referrerPolicy = '';
  crossOrigin: string | null = null;
  addEventListener() {}
  removeEventListener() {}
}

const ImagemOriginal = window.Image;

beforeEach(() => {
  (window as unknown as { Image: unknown }).Image = ImagemJaCarregada;
});

afterEach(() => {
  (window as unknown as { Image: unknown }).Image = ImagemOriginal;
  cleanup();
});

describe('CampoDeResponsaveis — a foto', () => {
  it('🔴 com a foto carregada, aparece só a foto: as iniciais saem de cena', async () => {
    render(
      <CampoDeResponsaveis
        pessoas={[{ id: 'u1', nome: 'Ana Lima', avatarUrl: 'https://exemplo.test/ana.png' }]}
        value={[{ usuarioId: 'u1', principal: true }]}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(document.querySelector('img[src*="ana.png"]')).not.toBeNull());
    expect(screen.queryByText('AL')).toBeNull();
  });

  it('🔴 na lista de adicionar pessoa, a mesma regra vale', async () => {
    render(
      <CampoDeResponsaveis
        pessoas={[
          { id: 'u1', nome: 'Ana Lima', avatarUrl: null },
          { id: 'u2', nome: 'Bruno Sá', avatarUrl: 'https://exemplo.test/bruno.png' },
        ]}
        value={[{ usuarioId: 'u1', principal: true }]}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /adicionar pessoa/i }));

    await waitFor(() => expect(document.querySelector('img[src*="bruno.png"]')).not.toBeNull());
    expect(screen.queryByText('BS')).toBeNull();
  });

  // Guarda do outro lado: o conserto não pode esconder as iniciais de quem não tem foto.
  it('sem foto, as iniciais continuam aparecendo', () => {
    render(
      <CampoDeResponsaveis
        pessoas={[{ id: 'u1', nome: 'Ana Lima', avatarUrl: null }]}
        value={[{ usuarioId: 'u1', principal: true }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('AL')).toBeTruthy();
  });
});

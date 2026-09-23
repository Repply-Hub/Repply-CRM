import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users2 } from 'lucide-react';
import { AvatarDeChat } from './AvatarDeChat';

describe('AvatarDeChat', () => {
  it('mostra a imagem quando há fotoUrl', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <AvatarDeChat fotoUrl="blob:x" nome="Grupo" IconePadrao={Users2} />
      </QueryClientProvider>
    );
    expect(container.querySelector('img')).not.toBeNull();
  });
  it('mostra o símbolo com a cor de fundo escolhida', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <AvatarDeChat icone="balao" corFundo="#E3F0FF" corIcone="#2563EB" IconePadrao={Users2} />
      </QueryClientProvider>
    );
    expect(container.querySelector('img')).toBeNull();
    // a cor de fundo entra por style inline → distingue do padrão (que usa classe bg-primary)
    expect(container.querySelector('[style*="background"]')).not.toBeNull();
  });
  it('mostra o ícone padrão quando não há foto nem símbolo', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <AvatarDeChat IconePadrao={Users2} />
      </QueryClientProvider>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[style*="background"]')).toBeNull();
  });
});

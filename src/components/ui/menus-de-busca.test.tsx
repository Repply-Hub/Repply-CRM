import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Command, CommandInput, CommandItem, CommandList } from './command';

/**
 * As três regras que impedem uma busca de sair da tela. Moram nos componentes-base
 * de propósito: são ~40 buscas no sistema, e consertar uma a uma deixaria a próxima
 * busca nova nascer quebrada.
 */
describe('menus de busca cabem na tela', () => {
  it('o conteúdo suspenso nunca passa da largura da tela', () => {
    render(
      <Popover open>
        <PopoverTrigger>abrir</PopoverTrigger>
        <PopoverContent className="w-[400px]">conteúdo</PopoverContent>
      </Popover>,
    );
    const el = screen.getByText('conteúdo');
    expect(el.className).toContain('max-w-[calc(100vw-1rem)]');
    // A largura pedida pela tela continua valendo onde cabe (computador).
    expect(el.className).toContain('w-[400px]');
  });

  it('a lista encolhe quando sobra pouca altura na tela', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar..." />
        <CommandList data-testid="lista">
          <CommandItem>um</CommandItem>
        </CommandList>
      </Command>,
    );
    expect(screen.getByTestId('lista').className).toContain(
      'max-h-[min(300px,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))]',
    );
  });

  it('texto de ajuda longo termina em reticências em vez de cortar no meio', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar por nome, empresa, e-mail ou telefone..." />
      </Command>,
    );
    expect(screen.getByPlaceholderText(/buscar por nome/i).className).toContain('text-ellipsis');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O campo que sobe a logo da empresa.
 *
 * 🔴 ESTE ARQUIVO NASCEU DEPOIS DO CÓDIGO, e isso é o defeito que ele conserta. O componente
 * foi para produção em 31/08/2026 sem um teste sequer — e é ele que grava um arquivo num balde
 * público e uma URL na tabela `empresas`. As duas coisas mais fáceis de errar aqui são
 * silenciosas:
 *
 *   · a gravação da URL ser recusada pela regra de segurança do banco, que não devolve erro:
 *     devolve sucesso com ZERO linhas. A tela diria "Logo atualizada" sem ter atualizado nada;
 *   · a ordem do remover. Se o arquivo sumisse ANTES da linha, e a gravação falhasse, a empresa
 *     ficaria apontando para um arquivo que não existe — e o PDF sairia sem logo E sem o nome,
 *     porque a URL continuaria preenchida.
 */

const recarregarPerfil = vi.fn().mockResolvedValue(null);
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ refreshProfile: (...a: unknown[]) => recarregarPerfil(...a) }),
}));

const toastSucesso = vi.fn();
const toastErro = vi.fn();
const toastAviso = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSucesso(...a),
    error: (...a: unknown[]) => toastErro(...a),
    warning: (...a: unknown[]) => toastAviso(...a),
  },
}));

/** O que `prepararLogo` devolve. Cada teste ajusta — ele precisa de canvas, que o jsdom não tem. */
let preparo: unknown = {
  blob: new Blob(['x'], { type: 'image/png' }),
  largura: 500,
  altura: 500,
  quaseInvisivelNoBranco: false,
};
let erroDoPreparo: Error | null = null;
vi.mock('@/lib/logo-da-empresa', async () => {
  const real = await vi.importActual<typeof import('@/lib/logo-da-empresa')>('@/lib/logo-da-empresa');
  return {
    ...real,
    prepararLogo: async () => {
      if (erroDoPreparo) throw erroDoPreparo;
      return preparo;
    },
  };
});

const enviou = vi.fn();
const removeu = vi.fn();
const gravou = vi.fn();
let respostaDoEnvio: { error: unknown } = { error: null };
let respostaDaGravacao: { data: unknown; error: unknown } = { data: [{ id: 'e1' }], error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (caminho: string, blob: Blob, opcoes: unknown) => {
          enviou(caminho, blob, opcoes);
          return respostaDoEnvio;
        },
        remove: async (caminhos: string[]) => {
          removeu(caminhos);
          return { error: null };
        },
        getPublicUrl: (caminho: string) => ({
          data: { publicUrl: `https://balde/branding/${caminho}` },
        }),
      }),
    },
    from: () => ({
      update: (payload: unknown) => ({
        eq: () => ({
          select: async () => {
            gravou(payload);
            return respostaDaGravacao;
          },
        }),
      }),
    }),
  },
}));

import { CampoDeLogoDaEmpresa } from './CampoDeLogoDaEmpresa';

const EMPRESA = '0c5df684-20d1-4d4f-b0f0-30676d4d4128';

function desenhar(logoUrl: string | null = null) {
  const aoMudar = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampoDeLogoDaEmpresa empresaId={EMPRESA} logoUrl={logoUrl} aoMudar={aoMudar} />
    </QueryClientProvider>,
  );
  return { aoMudar };
}

/** Simula a escolha de um arquivo no input escondido. */
function escolherArquivo() {
  const input = document.getElementById('logo-da-empresa') as HTMLInputElement;
  const file = new File(['conteudo'], 'marca.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  preparo = { blob: new Blob(['x'], { type: 'image/png' }), largura: 500, altura: 500, quaseInvisivelNoBranco: false };
  erroDoPreparo = null;
  respostaDoEnvio = { error: null };
  respostaDaGravacao = { data: [{ id: 'e1' }], error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CampoDeLogoDaEmpresa', () => {
  it('sem logo, explica o que o campo faz e o que acontece sem ele', () => {
    desenhar(null);
    expect(screen.getByText(/sem logo, sai o nome da empresa/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /escolher arquivo/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull();
  });

  it('com logo, mostra a imagem e oferece trocar e remover', () => {
    desenhar('https://balde/logo.png');
    expect(screen.getByAltText(/logo da empresa/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /trocar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /remover/i })).toBeTruthy();
  });

  it('🔴 grava na pasta DA EMPRESA — é o que separa uma da outra no balde', async () => {
    desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(enviou).toHaveBeenCalled());
    expect(enviou.mock.calls[0][0]).toBe(`${EMPRESA}/logo.png`);
    expect(enviou.mock.calls[0][2]).toMatchObject({ upsert: true, contentType: 'image/png' });
  });

  it('grava a URL com quebra-cache, senão a logo antiga fica servida por horas', async () => {
    const { aoMudar } = desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(gravou).toHaveBeenCalled());
    const url = (gravou.mock.calls[0][0] as { logo_url: string }).logo_url;
    expect(url).toContain(`branding/${EMPRESA}/logo.png`);
    expect(url).toMatch(/\?v=\d+$/);
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(url));
  });

  it('🔴 zero linhas gravadas NÃO é sucesso — é recusa silenciosa do banco', async () => {
    respostaDaGravacao = { data: [], error: null };
    const { aoMudar } = desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/não foi salva|nao foi salva/i);
    // E a tela NÃO passa a mostrar uma logo que não foi salva.
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('🔴 logo clara demais avisa, mas SALVA — recusar arquivo legítimo seria pior', async () => {
    preparo = { blob: new Blob(['x'], { type: 'image/png' }), largura: 10, altura: 10, quaseInvisivelNoBranco: true };
    const { aoMudar } = desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastAviso).toHaveBeenCalled());
    expect(toastAviso.mock.calls[0][0]).toMatch(/clara|sumir/i);
    expect(gravou).toHaveBeenCalled();
    expect(aoMudar).toHaveBeenCalled();
  });

  it('envio recusado pelo balde não grava URL nenhuma na empresa', async () => {
    respostaDoEnvio = { error: { message: 'new row violates row-level security policy' } };
    desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(gravou).not.toHaveBeenCalled();
    // A frase técnica em inglês não chega ao usuário.
    expect(toastErro.mock.calls[0][0]).not.toMatch(/row-level|policy|violates/i);
  });

  it('arquivo que não é imagem para antes de tocar no balde', async () => {
    erroDoPreparo = new Error('Não consegui abrir este arquivo como imagem.');
    desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(enviou).not.toHaveBeenCalled();
    expect(gravou).not.toHaveBeenCalled();
  });

  it('🔴 ao remover, a LINHA cai antes do arquivo', async () => {
    // A ordem inversa deixaria a empresa apontando para um arquivo que não existe mais: o PDF
    // sairia sem logo E sem o nome, porque a URL continuaria preenchida.
    const ordem: string[] = [];
    gravou.mockImplementation(() => ordem.push('linha'));
    removeu.mockImplementation(() => ordem.push('arquivo'));

    const { aoMudar } = desenhar('https://balde/logo.png');
    fireEvent.click(screen.getByRole('button', { name: /remover/i }));

    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
    expect(ordem).toEqual(['linha', 'arquivo']);
    expect(gravou.mock.calls[0][0]).toEqual({ logo_url: null });
    expect(removeu.mock.calls[0][0]).toEqual([`${EMPRESA}/logo.png`]);
    expect(aoMudar).toHaveBeenCalledWith(null);
  });

  it('🔴 manda o PERFIL se recarregar — é de lá que os PDFs leem a logo', async () => {
    // O defeito que isto fixa: `profile` mora em `useState` dentro do `useAuth`, não numa
    // chave de react-query. Invalidar cache não o alcança. Sem este recarregamento, a pessoa
    // subia a logo, via o preview certo, exportava um relatório e ele saía SEM logo — até
    // recarregar a página inteira.
    desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
    expect(recarregarPerfil).toHaveBeenCalled();
  });

  it('e recarrega o perfil ao remover também', async () => {
    desenhar('https://balde/logo.png');
    fireEvent.click(screen.getByRole('button', { name: /remover/i }));

    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
    expect(recarregarPerfil).toHaveBeenCalled();
  });

  it('🔴 gravação recusada NÃO recarrega o perfil — não há o que mostrar', async () => {
    respostaDaGravacao = { data: [], error: null };
    desenhar(null);
    escolherArquivo();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(recarregarPerfil).not.toHaveBeenCalled();
  });

  it('🔴 os botões não submetem o formulário em volta', () => {
    // O campo mora dentro do `<form>` da aba Empresa. Um botão sem `type="button"` submeteria o
    // formulário ao ser clicado — salvando os campos de texto sem ninguém pedir.
    desenhar('https://balde/logo.png');
    for (const nome of [/trocar/i, /remover/i]) {
      expect(screen.getByRole('button', { name: nome }).getAttribute('type')).toBe('button');
    }
  });
});

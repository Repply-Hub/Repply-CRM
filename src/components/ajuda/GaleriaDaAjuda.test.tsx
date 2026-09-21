import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { GaleriaDaAjuda } from './GaleriaDaAjuda';

// jsdom não implementa IntersectionObserver, e o embla-carousel (por trás do <Carousel> do
// shadcn) usa um internamente para saber quais slides estão visíveis. Sem este stub, todo
// teste que monta a galeria com pelo menos uma foto quebra com "IntersectionObserver is not
// defined" — não é um bug do componente, é uma lacuna do jsdom.
class IntersectionObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso);

/**
 * A sequência de fotos de um passo numerado. O que se prende aqui:
 *
 * 1. Visibilidade — quem não é admin master só vê a galeria quando ela já tem foto (mesma
 *    regra de `ImagemDaAjuda`).
 * 2. O cálculo do PRÓXIMO número da sequência (`<prefixo>-N`) — o ponto mais fácil de
 *    quebrar, porque um lote de fotos precisa numerar 1, 2, 3... sem reler o cache entre um
 *    envio e outro (o cache só atualiza depois que a mutação de cada arquivo termina e a
 *    query é invalidada).
 * 3. Remover uma foto manda a chave e o path certos para a mutação.
 *
 * Nomes e caminhos inventados — não há dado de cliente aqui.
 */

const tela = vi.hoisted(() => ({
  profile: { role: 'vendedor' } as { role: string } | null,
  imagens: new Map<string, { chave: string; path: string; atualizadoEm: string; url: string }>(),
}));

const enviarMutateAsync = vi.hoisted(() => vi.fn());
const removerMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: tela.profile }),
}));
vi.mock('@/hooks/use-ajuda-imagens', () => ({
  useAjudaImagens: () => ({ data: tela.imagens }),
  useEnviarImagemDaAjuda: () => ({ mutateAsync: enviarMutateAsync, isPending: false }),
  useRemoverImagemDaAjuda: () => ({ mutate: removerMutate, isPending: false }),
}));

function foto(chave: string) {
  return { chave, path: `${chave}.png`, atualizadoEm: '2026-01-01T00:00:00Z', url: `https://exemplo.test/${chave}.png` };
}

function arquivoDeImagem(nome: string) {
  return new File(['conteudo'], nome, { type: 'image/png' });
}

afterEach(() => {
  cleanup();
  tela.profile = { role: 'vendedor' };
  tela.imagens = new Map();
  enviarMutateAsync.mockReset().mockResolvedValue(undefined);
  removerMutate.mockReset();
});

describe('GaleriaDaAjuda — visibilidade', () => {
  it('não renderiza nada para quem não é admin master quando a sequência está vazia', () => {
    tela.profile = { role: 'vendedor' };
    const { container } = render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a sequência para quem não é admin master quando já há foto', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.getByAltText(/Tela do passo 1/)).toBeInTheDocument();
    // Sem controle de admin nenhum.
    expect(screen.queryByRole('button', { name: /remover esta foto/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Adicionar/)).not.toBeInTheDocument();
  });

  it('admin master vê a caixa de envio mesmo com a sequência vazia', () => {
    tela.profile = { role: 'admin' };
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.getByText(/Sequência pendente: Tela do passo 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar fotos/i })).toBeInTheDocument();
  });
});

describe('GaleriaDaAjuda — só uma foto não precisa de contador nem de setas', () => {
  it('não mostra "1/1" nem botões de navegação quando há uma única foto', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous slide/i })).not.toBeInTheDocument();
  });

  it('mostra o contador com mais de uma foto, na ordem numérica do sufixo (não na ordem de inserção no mapa)', () => {
    tela.profile = { role: 'admin' };
    // De propósito fora de ordem no Map — a galeria tem que ordenar pelo número, não pela
    // ordem em que a query devolveu as linhas.
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.getByText('1/2')).toBeInTheDocument();
    // A primeira foto exibida (slide ativo) é a -1, não a -2.
    expect(screen.getByAltText(/foto 1 de 2/)).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-1.png');
  });
});

describe('GaleriaDaAjuda — chave sem sufixo (a de ImagemDaAjuda, antes de 21/09/2026)', () => {
  it('uma chave IGUAL ao prefixo, sem número, aparece como a primeira foto da galeria', () => {
    tela.profile = { role: 'vendedor' };
    // "dashboard-grafico" é exatamente o prefixo, sem "-1" — o formato que a imagem única de
    // um tópico gravava antes da coluna do tópico virar galeria.
    tela.imagens = new Map([['dashboard-grafico', foto('dashboard-grafico')]]);
    render(<GaleriaDaAjuda prefixo="dashboard-grafico" legenda="Gráfico do Dashboard" />);

    expect(screen.getByAltText(/Gráfico do Dashboard/)).toHaveAttribute(
      'src',
      'https://exemplo.test/dashboard-grafico.png',
    );
  });

  it('a chave sem sufixo entra ANTES das numeradas na ordem do carrossel', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['dashboard-grafico-2', foto('dashboard-grafico-2')],
      ['dashboard-grafico', foto('dashboard-grafico')],
    ]);
    render(<GaleriaDaAjuda prefixo="dashboard-grafico" legenda="Gráfico do Dashboard" />);

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByAltText(/foto 1 de 2/)).toHaveAttribute('src', 'https://exemplo.test/dashboard-grafico.png');
  });

  it('quando só existe a chave sem sufixo (índice 0), a próxima foto enviada vira "-1" — não repete o índice 0', async () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([['dashboard-grafico', foto('dashboard-grafico')]]);
    render(<GaleriaDaAjuda prefixo="dashboard-grafico" legenda="Gráfico do Dashboard" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [arquivoDeImagem('nova.png')] } });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(1));
    expect(enviarMutateAsync.mock.calls[0][0]).toMatchObject({ chave: 'dashboard-grafico-1' });
  });

  it('com a chave sem sufixo E uma numerada já presentes, a próxima foto continua depois do maior número', async () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['dashboard-grafico-2', foto('dashboard-grafico-2')],
      ['dashboard-grafico', foto('dashboard-grafico')],
    ]);
    render(<GaleriaDaAjuda prefixo="dashboard-grafico" legenda="Gráfico do Dashboard" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [arquivoDeImagem('nova.png')] } });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(1));
    expect(enviarMutateAsync.mock.calls[0][0]).toMatchObject({ chave: 'dashboard-grafico-3' });
  });

  it('uma chave de OUTRO tópico que só compartilha o começo do nome não entra na galeria', () => {
    tela.profile = { role: 'vendedor' };
    // "dashboard-grafico-pizza" não é nem "dashboard-grafico" nem "dashboard-grafico-<número>".
    tela.imagens = new Map([['dashboard-grafico-pizza', foto('dashboard-grafico-pizza')]]);
    const { container } = render(<GaleriaDaAjuda prefixo="dashboard-grafico" legenda="Gráfico do Dashboard" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('GaleriaDaAjuda — numeração da sequência ao enviar', () => {
  it('a primeira foto de uma sequência vazia vira "<prefixo>-1"', async () => {
    tela.profile = { role: 'admin' };
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-3" legenda="Tela do passo 3" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [arquivoDeImagem('a.png')] } });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(1));
    expect(enviarMutateAsync.mock.calls[0][0]).toMatchObject({ chave: 'hoje-pauta-passo-3-1' });
  });

  it('um lote de 3 fotos numera em sequência (N+1, N+2, N+3) sem esperar o cache atualizar entre uma e outra', async () => {
    tela.profile = { role: 'admin' };
    // Já existe uma foto -2 (a -1 foi removida antes) — o próximo tem que ser -3, o maior
    // índice atual + 1, não "quantidade de fotos + 1".
    tela.imagens = new Map([['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [arquivoDeImagem('a.png'), arquivoDeImagem('b.png'), arquivoDeImagem('c.png')] },
    });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(3));
    expect(enviarMutateAsync.mock.calls[0][0]).toMatchObject({ chave: 'hoje-pauta-passo-1-3' });
    expect(enviarMutateAsync.mock.calls[1][0]).toMatchObject({ chave: 'hoje-pauta-passo-1-4' });
    expect(enviarMutateAsync.mock.calls[2][0]).toMatchObject({ chave: 'hoje-pauta-passo-1-5' });
  });

  it('envia os arquivos em sequência, não em paralelo — o segundo só começa depois que o primeiro termina', async () => {
    tela.profile = { role: 'admin' };
    let resolverPrimeiro: (() => void) | undefined;
    enviarMutateAsync.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolverPrimeiro = resolve; }),
    );
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [arquivoDeImagem('a.png'), arquivoDeImagem('b.png')] } });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(1));
    // O segundo arquivo ainda não foi enviado: o primeiro `mutateAsync` não resolveu.
    expect(enviarMutateAsync).toHaveBeenCalledTimes(1);

    resolverPrimeiro?.();
    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(2));
    expect(enviarMutateAsync.mock.calls[1][0]).toMatchObject({ chave: 'hoje-pauta-passo-1-2' });
  });
});

describe('GaleriaDaAjuda — remover uma foto', () => {
  it('manda a chave e o path exatos da foto clicada, não da sequência inteira', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [botaoRemover] = screen.getAllByTitle('Remover esta foto');
    fireEvent.click(botaoRemover);

    expect(removerMutate).toHaveBeenCalledWith(
      { chave: 'hoje-pauta-passo-1-1', path: 'hoje-pauta-passo-1-1.png' },
      expect.anything(),
    );
  });
});

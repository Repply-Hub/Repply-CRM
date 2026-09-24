import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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
const trocarPosicaoMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: tela.profile }),
}));
vi.mock('@/hooks/use-ajuda-imagens', () => ({
  useAjudaImagens: () => ({ data: tela.imagens }),
  useEnviarImagemDaAjuda: () => ({ mutateAsync: enviarMutateAsync, isPending: false }),
  useRemoverImagemDaAjuda: () => ({ mutate: removerMutate, isPending: false }),
  useTrocarPosicaoImagemDaAjuda: () => ({ mutate: trocarPosicaoMutate, isPending: false }),
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
  trocarPosicaoMutate.mockReset();
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

describe('GaleriaDaAjuda — colar (Ctrl+V) sobe a imagem', () => {
  it('colar uma imagem na área de envio dispara o envio, como se tivesse escolhido o arquivo', async () => {
    tela.profile = { role: 'admin' };
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const areaDeEnvio = screen.getByText(/Sequência pendente/).closest('div') as HTMLElement;
    const arquivo = arquivoDeImagem('colado.png');
    fireEvent.paste(areaDeEnvio, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => arquivo }] },
    });

    await waitFor(() => expect(enviarMutateAsync).toHaveBeenCalledTimes(1));
    expect(enviarMutateAsync.mock.calls[0][0]).toMatchObject({ chave: 'hoje-pauta-passo-1-1', arquivo });
  });

  it('colar texto (sem arquivo de imagem) não dispara envio nenhum', () => {
    tela.profile = { role: 'admin' };
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const areaDeEnvio = screen.getByText(/Sequência pendente/).closest('div') as HTMLElement;
    fireEvent.paste(areaDeEnvio, {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
    });

    expect(enviarMutateAsync).not.toHaveBeenCalled();
  });

  it('quem não é admin master não tem a área de envio, então não há onde colar', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByText(/Sequência pendente|Adicionar mais fotos/)).not.toBeInTheDocument();
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

describe('GaleriaDaAjuda — trocar a posição de uma foto', () => {
  it('mover para frente troca a chave com a foto seguinte, não com a última', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
      ['hoje-pauta-passo-1-3', foto('hoje-pauta-passo-1-3')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [primeiraMoverFrente] = screen.getAllByTitle('Mover esta foto uma posição para frente');
    fireEvent.click(primeiraMoverFrente);

    expect(trocarPosicaoMutate).toHaveBeenCalledWith(
      { chaveA: 'hoje-pauta-passo-1-1', chaveB: 'hoje-pauta-passo-1-2' },
      expect.anything(),
    );
  });

  it('mover para trás troca a chave com a foto anterior', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [, segundaMoverTras] = screen.getAllByTitle('Mover esta foto uma posição para trás');
    fireEvent.click(segundaMoverTras);

    expect(trocarPosicaoMutate).toHaveBeenCalledWith(
      { chaveA: 'hoje-pauta-passo-1-2', chaveB: 'hoje-pauta-passo-1-1' },
      expect.anything(),
    );
  });

  it('a primeira foto não pode mover para trás, nem a última para frente — nas pontas os botões ficam desabilitados', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [primeiraTras, segundaTras] = screen.getAllByTitle('Mover esta foto uma posição para trás');
    const [primeiraFrente, segundaFrente] = screen.getAllByTitle('Mover esta foto uma posição para frente');
    expect(primeiraTras).toBeDisabled();
    expect(segundaTras).not.toBeDisabled();
    expect(primeiraFrente).not.toBeDisabled();
    expect(segundaFrente).toBeDisabled();
  });

  it('com uma foto só, não mostra botão de mover nenhum — não há para onde trocar', () => {
    tela.profile = { role: 'admin' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByTitle(/Mover esta foto/)).not.toBeInTheDocument();
  });

  it('quem não é admin master não vê botão de mover, mesmo com várias fotos', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByTitle(/Mover esta foto/)).not.toBeInTheDocument();
  });
});

describe('GaleriaDaAjuda — na página, com mais de uma foto', () => {
  it('mostra a descrição de como navegar e deixa as setas do carrossel na cor primária (laranja)', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.getByText(/2 fotos nesta sequência/)).toBeInTheDocument();
    const anterior = screen.getByRole('button', { name: /previous slide/i });
    const proxima = screen.getByRole('button', { name: /next slide/i });
    // Variante "default" do Button é a que pinta de laranja (bg-primary, token da marca).
    expect(anterior.className).toContain('bg-primary');
    expect(proxima.className).toContain('bg-primary');
  });

  it('com uma foto só, não mostra a descrição de navegação nem setas', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByText(/fotos nesta sequência/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous slide/i })).not.toBeInTheDocument();
  });
});

describe('GaleriaDaAjuda — tira de miniaturas na página', () => {
  it('com mais de uma foto, mostra uma miniatura por foto, na ordem da sequência', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-3', foto('hoje-pauta-passo-1-3')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const miniaturas = screen.getAllByAltText(/Tela do passo 1 — miniatura/);
    expect(miniaturas).toHaveLength(3);
    expect(miniaturas[0]).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-1.png');
    expect(miniaturas[1]).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-2.png');
    expect(miniaturas[2]).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-3.png');
  });

  it('com uma foto só, não mostra tira de miniatura nenhuma', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByAltText(/miniatura/)).not.toBeInTheDocument();
  });

  it('clicar numa miniatura não quebra a tela (chama a navegação do carrossel)', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [, segundaMiniatura] = screen.getAllByAltText(/Tela do passo 1 — miniatura/);
    expect(() => fireEvent.click(segundaMiniatura)).not.toThrow();
  });
});

describe('GaleriaDaAjuda — tira de miniaturas dentro do diálogo de ampliar', () => {
  it('abre junto com o diálogo, no rodapé, e destaca a foto que está ampliada', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    // Ainda fechado: só a tira da página, nenhuma dentro de diálogo (não existe diálogo).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const [primeiroBotaoAmpliar] = screen.getAllByTitle('Ampliar imagem');
    fireEvent.click(primeiroBotaoAmpliar);

    const dialogo = screen.getByRole('dialog');
    const miniaturasDoDialogo = within(dialogo).getAllByAltText(/Tela do passo 1 — miniatura/);
    expect(miniaturasDoDialogo).toHaveLength(2);
    // A primeira (índice 0, a que abriu) vem destacada.
    expect(miniaturasDoDialogo[0].closest('button')?.className).toContain('border-primary');
    expect(miniaturasDoDialogo[1].closest('button')?.className).not.toContain('border-primary');
  });

  it('clicar numa miniatura do diálogo troca a foto ampliada, sem fechar o diálogo', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getAllByTitle('Ampliar imagem')[0]);
    const dialogo = screen.getByRole('dialog');

    const [, segundaMiniaturaDoDialogo] = within(dialogo).getAllByAltText(/Tela do passo 1 — miniatura/);
    fireEvent.click(segundaMiniaturaDoDialogo);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dialogo.querySelector('img[alt="Tela do passo 1"]')).toHaveAttribute(
      'src',
      'https://exemplo.test/hoje-pauta-passo-1-2.png',
    );
  });

  it('com uma foto só, o diálogo não mostra tira de miniatura nenhuma', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getByTitle('Ampliar imagem'));

    expect(within(screen.getByRole('dialog')).queryByAltText(/miniatura/)).not.toBeInTheDocument();
  });
});

describe('GaleriaDaAjuda — navegar dentro do diálogo de ampliar', () => {
  it('abre a foto clicada e, com mais de uma, mostra o contador e deixa ir para a próxima', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    const [primeiroBotaoAmpliar] = screen.getAllByTitle('Ampliar imagem');
    fireEvent.click(primeiroBotaoAmpliar);

    const dialogo = screen.getByRole('dialog');
    // O carrossel da página não desmonta com o diálogo aberto — Radix só sobrepõe. Por
    // isso o "1/2" do contador é procurado DENTRO do diálogo, não em `screen` inteiro
    // (que ainda tem o "1/2" do carrossel por trás).
    expect(within(dialogo).getByText('1/2')).toBeInTheDocument();
    expect(dialogo.querySelector('img')).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-1.png');

    fireEvent.click(screen.getByTitle('Próxima foto'));

    expect(within(dialogo).getByText('2/2')).toBeInTheDocument();
    expect(dialogo.querySelector('img')).toHaveAttribute('src', 'https://exemplo.test/hoje-pauta-passo-1-2.png');
    // Chegou na última: não dá a volta para a primeira.
    expect(screen.getByTitle('Próxima foto')).toBeDisabled();
  });

  it('clicar na PRÓPRIA imagem (não só no ícone de lupa) também abre o diálogo ampliado', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText(/Tela do passo 1/));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('com uma foto só, o diálogo abre sem contador nem setas de navegação', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getByTitle('Ampliar imagem'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTitle('Próxima foto')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Foto anterior')).not.toBeInTheDocument();
  });
});

describe('GaleriaDaAjuda — clicar na imagem ampliada aproxima no ponto do clique', () => {
  function imagemDoDialogo(dialogo: HTMLElement, largura: number, altura: number) {
    const img = dialogo.querySelector('img[alt="Tela do passo 1"]') as HTMLImageElement;
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: largura, bottom: altura, width: largura, height: altura, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return img;
  }

  it('primeiro clique aproxima, centrado no ponto exato do clique (não no centro da imagem)', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getByTitle('Ampliar imagem'));
    const dialogo = screen.getByRole('dialog');
    // 200x100 — clique em (50, 25) cai em 25% da largura e 25% da altura.
    const img = imagemDoDialogo(dialogo, 200, 100);

    fireEvent.click(img, { clientX: 50, clientY: 25 });

    expect(img.style.transform).toBe('scale(2)');
    expect(img.style.transformOrigin).toBe('25% 25%');
  });

  it('clicar de novo, já com zoom, devolve ao tamanho normal e recentra a origem', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')]]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getByTitle('Ampliar imagem'));
    const dialogo = screen.getByRole('dialog');
    const img = imagemDoDialogo(dialogo, 200, 100);

    fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(img.style.transform).toBe('scale(2)');

    // O ponto do segundo clique não importa: com zoom diferente de 1, qualquer clique volta
    // ao normal — não abre um zoom novo em cima do zoom antigo.
    fireEvent.click(img, { clientX: 199, clientY: 99 });

    expect(img.style.transform).toBe('scale(1)');
    expect(img.style.transformOrigin).toBe('50% 50%');
  });

  it('trocar de foto (Próxima/Anterior) reseta o zoom por clique e a origem, como já fazia com o zoom dos botões', () => {
    tela.profile = { role: 'vendedor' };
    tela.imagens = new Map([
      ['hoje-pauta-passo-1-1', foto('hoje-pauta-passo-1-1')],
      ['hoje-pauta-passo-1-2', foto('hoje-pauta-passo-1-2')],
    ]);
    render(<GaleriaDaAjuda prefixo="hoje-pauta-passo-1" legenda="Tela do passo 1" />);

    fireEvent.click(screen.getAllByTitle('Ampliar imagem')[0]);
    const dialogo = screen.getByRole('dialog');
    const primeiraImg = imagemDoDialogo(dialogo, 200, 100);
    fireEvent.click(primeiraImg, { clientX: 0, clientY: 0 });
    expect(primeiraImg.style.transform).toBe('scale(2)');

    fireEvent.click(screen.getByTitle('Próxima foto'));

    const segundaImg = dialogo.querySelector('img[alt="Tela do passo 1"]') as HTMLImageElement;
    expect(segundaImg.style.transform).toBe('scale(1)');
    expect(segundaImg.style.transformOrigin).toBe('50% 50%');
  });
});

import {
  ehFalhaDeModulo,
  ErroDeVersao,
  ErroDeDownload,
  enderecoDoModulo,
  curarCacheDoModulo,
  carregarComCura,
} from './lazy-com-retry';

/**
 * O que está sob teste é a decisão "isto é versão velha, ou é bug de verdade?".
 * Errar para um lado mostra "Algo deu errado" a quem só precisava recarregar;
 * errar para o outro esconde um bug real atrás de "saiu uma versão nova".
 */
describe('ehFalhaDeModulo', () => {
  // As mensagens abaixo são as que os navegadores realmente emitem. Elas variam
  // por navegador, e no nosso caso a mais provável é a de MIME type: o rewrite
  // catch-all do vercel.json devolve index.html (text/html) com status 200 no
  // lugar do arquivo que sumiu, então o navegador reclama do tipo, não do 404.
  it.each([
    ['Chrome/Edge', 'Failed to fetch dynamically imported module: https://x/assets/Emails-abc.js'],
    ['Firefox', 'error loading dynamically imported module'],
    ['Safari', 'Importing a module script failed.'],
    ['MIME type (rewrite devolvendo HTML)', "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html."],
    ['webpack legado', 'Loading chunk 42 failed.'],
    ['ChunkLoadError', 'ChunkLoadError: Loading chunk vendors failed.'],
  ])('reconhece a falha do %s', (_navegador, mensagem) => {
    expect(ehFalhaDeModulo(new Error(mensagem))).toBe(true);
  });

  it('é indiferente a maiúsculas e minúsculas', () => {
    expect(ehFalhaDeModulo(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
  });

  // Estes são bugs de verdade. Se caíssem como "versão nova", o usuário
  // recarregaria para sempre sem nunca resolver — e o erro real ficaria
  // escondido atrás de uma mensagem tranquilizadora.
  it.each([
    ["Cannot read properties of null (reading 'split')"],
    ['Invalid time value'],
    ['x is not a function'],
    ['Minified React error #185'],
  ])('não confunde bug real com versão velha: %s', (mensagem) => {
    expect(ehFalhaDeModulo(new Error(mensagem))).toBe(false);
  });

  it('não quebra com valores que não são Error', () => {
    expect(ehFalhaDeModulo(null)).toBe(false);
    expect(ehFalhaDeModulo(undefined)).toBe(false);
    expect(ehFalhaDeModulo('Failed to fetch dynamically imported module')).toBe(true);
  });
});

describe('ErroDeVersao', () => {
  it('guarda a causa original para o registro em app_erros', () => {
    const causa = new Error('Failed to fetch dynamically imported module');
    const erro = new ErroDeVersao(causa);
    expect(erro.causaOriginal).toBe(causa);
  });

  // A tela decide o texto por `instanceof` OU por `name`. O `name` é o que
  // sobrevive quando o erro cruza uma fronteira que o serializa.
  it('é identificável pelas duas vias que a tela de erro usa', () => {
    const erro = new ErroDeVersao(new Error('qualquer'));
    expect(erro).toBeInstanceOf(ErroDeVersao);
    expect(erro.name).toBe('ErroDeVersao');
    expect(erro).toBeInstanceOf(Error);
  });
});

/**
 * A CURA DO CACHE ENVENENADO — o caso medido em 22/09/2026.
 *
 * Uma vendedora da MD ficou 27 minutos presa na tela de "saiu uma versão nova", em laço:
 * recarregar não resolvia, sair não resolvia, reiniciar o computador não resolvia, e a janela
 * anônima funcionava. O motivo apareceu na aba Network do navegador dela: o arquivo
 * `input-1TXyZfTh.js` respondia 404 vindo do **cache do disco**, enquanto no servidor ele
 * estava lá, íntegro.
 *
 * A causa é nossa: a regra de cache do `vercel.json` vale para o caminho `/assets/`, e vale
 * TAMBÉM para as respostas de erro. Um 404 momentâneo — durante uma publicação, ou uma falha
 * de rede de um segundo — chega ao navegador com `Cache-Control: public, max-age=604800` e
 * fica guardado por SETE DIAS. A partir daí o navegador nem pergunta ao servidor, e nenhuma
 * quantidade de recarregar resolve.
 *
 * A cura: antes de tentar de novo, buscar o arquivo com `cache: 'reload'`, que obriga o
 * navegador a ir à rede e substitui a entrada envenenada. Isso também separa três casos que
 * hoje caem todos em "saiu uma versão nova": o arquivo voltou, o arquivo sumiu de verdade, e
 * o servidor não respondeu.
 */
describe('enderecoDoModulo', () => {
  it('acha o endereço do arquivo na mensagem do Chrome', () => {
    const erro = new Error('Failed to fetch dynamically imported module: https://crm.exemplo.com.br/assets/input-1TXyZfTh.js');
    expect(enderecoDoModulo(erro)).toBe('https://crm.exemplo.com.br/assets/input-1TXyZfTh.js');
  });

  it('devolve nulo quando o navegador não diz qual arquivo falhou', () => {
    expect(enderecoDoModulo(new Error('error loading dynamically imported module'))).toBeNull();
    expect(enderecoDoModulo(null)).toBeNull();
  });
});

describe('curarCacheDoModulo', () => {
  it('busca o arquivo ignorando o cache do navegador', async () => {
    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const buscar = (async (url: string, opcoes: RequestInit) => {
      chamadas.push([url, opcoes]);
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await curarCacheDoModulo('https://x/assets/input-1.js', buscar);

    expect(chamadas[0][0]).toBe('https://x/assets/input-1.js');
    expect(chamadas[0][1]?.cache).toBe('reload');
  });

  it('o arquivo estava lá: é cache envenenado, e agora foi substituído', async () => {
    const buscar = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    expect(await curarCacheDoModulo('https://x/a.js', buscar)).toBe('arquivo-voltou');
  });

  it('o arquivo sumiu mesmo: é versão velha', async () => {
    const buscar = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(await curarCacheDoModulo('https://x/a.js', buscar)).toBe('arquivo-sumiu');
  });

  it('o servidor não respondeu: é a conexão, não a versão', async () => {
    const buscar = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await curarCacheDoModulo('https://x/a.js', buscar)).toBe('sem-resposta');
  });

  it('sem endereço não há o que curar, e não gasta uma ida à rede', async () => {
    let foi = false;
    const buscar = (async () => { foi = true; return { ok: true, status: 200 }; }) as unknown as typeof fetch;
    expect(await curarCacheDoModulo(null, buscar)).toBe('nao-sei');
    expect(foi).toBe(false);
  });
});

describe('carregarComCura', () => {
  const modulo = { default: () => null };
  const falhaDoChrome = () =>
    new Error('Failed to fetch dynamically imported module: https://x/assets/input-1.js');

  it('🔴 o caso da vendedora: o arquivo está no servidor, a cura limpa o cache e a página carrega', async () => {
    let tentativas = 0;
    const importar = async () => {
      tentativas++;
      if (tentativas === 1) throw falhaDoChrome();
      return modulo;
    };
    const buscar = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    expect(await carregarComCura(importar, buscar)).toBe(modulo);
    expect(tentativas).toBe(2);
  });

  it('não mexe em erro que não é de carregamento: bug de verdade sobe como veio', async () => {
    const bug = new TypeError('x is not a function');
    const importar = async () => { throw bug; };
    const buscar = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(carregarComCura(importar, buscar)).rejects.toBe(bug);
  });

  it('arquivo realmente fora do ar vira "saiu uma versão nova"', async () => {
    const importar = async () => { throw falhaDoChrome(); };
    const buscar = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

    await expect(carregarComCura(importar, buscar)).rejects.toBeInstanceOf(ErroDeVersao);
  });

  it('servidor sem resposta vira erro de download, não de versão', async () => {
    const importar = async () => { throw falhaDoChrome(); };
    const buscar = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;

    await expect(carregarComCura(importar, buscar)).rejects.toBeInstanceOf(ErroDeDownload);
  });
});

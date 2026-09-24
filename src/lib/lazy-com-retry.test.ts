import {
  ehFalhaDeModulo,
  ErroDeVersao,
  ErroDeDownload,
  enderecoDoModulo,
  curarCacheDoModulo,
  carregarComCura,
  textoDoDiagnostico,
  dependenciasDoModulo,
  curarModuloEDependencias,
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

describe('diagnóstico do carregamento', () => {
  /**
   * 🔴 O QUE ESTES TESTES PRENDEM, E POR QUE ELES EXISTEM.
   *
   * Em 24/09/2026 o dono do produto ficou preso na tela de "saiu versão nova" mesmo
   * recarregando, e a investigação travou num ponto constrangedor: **três desfechos
   * diferentes da cura produzem exatamente a mesma mensagem e a mesma pilha em `app_erros`**.
   *
   *   · o arquivo sumiu mesmo do servidor                → recarregar resolve
   *   · o arquivo estava lá e o cache foi trocado        → recarregar resolve AGORA
   *   · o navegador não disse qual arquivo era (nao-sei) → a cura NEM RODOU, e recarregar
   *                                                        vai falhar de novo, para sempre
   *
   * O terceiro é o único que explica "preso mesmo recarregando", e era indistinguível dos
   * outros dois no registro. Pior: o erro já carregava a causa original — com o endereço do
   * arquivo e a mensagem real do navegador — e o gravador descartava isso, salvando só a frase
   * final. A informação existia no instante da falha e era jogada fora antes de ser escrita.
   *
   * Por isso este bloco. Ele não conserta o travamento: ele faz a PRÓXIMA ocorrência dizer
   * qual dos caminhos aconteceu, em vez de alguém especular. Diagnóstico não é conserto, e
   * chutar aqui foi o que fez este problema voltar depois de "resolvido".
   */

  const erroComEndereco = new Error(
    'Failed to fetch dynamically imported module: https://exemplo.invalido/assets/Pagina-abc.js',
  );
  const erroSemEndereco = new Error('error loading dynamically imported module');

  it('🔴 arquivo fora do ar: registra o desfecho e o arquivo', async () => {
    const buscar = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const erro = await carregarComCura(() => Promise.reject(erroComEndereco), buscar).catch(e => e);

    expect(erro).toBeInstanceOf(ErroDeVersao);
    expect(erro.diagnostico?.desfecho).toBe('arquivo-sumiu');
    expect(erro.diagnostico?.endereco).toBe('https://exemplo.invalido/assets/Pagina-abc.js');
  });

  it('🔴 o caso que explica "preso mesmo recarregando": a cura NEM RODOU', async () => {
    // Sem endereço na mensagem não há o que curar, e o código segue para a segunda tentativa
    // — que falha. O desfecho `nao-sei` é a marca de que o cache continua envenenado.
    let vezes = 0;
    const buscar = (async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    const erro = await carregarComCura(() => { vezes++; return Promise.reject(erroSemEndereco); }, buscar).catch(e => e);

    expect(erro).toBeInstanceOf(ErroDeVersao);
    expect(erro.diagnostico?.desfecho).toBe('nao-sei');
    expect(erro.diagnostico?.endereco).toBeNull();
    expect(vezes).toBe(2);
  });

  it('cache trocado e segunda tentativa ainda falhou: fica registrado que a cura RODOU', async () => {
    const buscar = (async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    const erro = await carregarComCura(() => Promise.reject(erroComEndereco), buscar).catch(e => e);

    expect(erro).toBeInstanceOf(ErroDeVersao);
    expect(erro.diagnostico?.desfecho).toBe('arquivo-voltou');
  });

  it('servidor sem resposta também vem identificado', async () => {
    const buscar = (async () => { throw new Error('rede'); }) as unknown as typeof fetch;
    const erro = await carregarComCura(() => Promise.reject(erroComEndereco), buscar).catch(e => e);

    expect(erro).toBeInstanceOf(ErroDeDownload);
    expect(erro.diagnostico?.desfecho).toBe('sem-resposta');
  });

  it('🔴 a mensagem que a pessoa lê NÃO muda — o diagnóstico é para o registro', async () => {
    // Se a frase mudasse, a consulta que agrupa as ocorrências em `app_erros` pararia de casar,
    // e a série histórica seria perdida justamente ao instrumentar.
    const buscar = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const erro = await carregarComCura(() => Promise.reject(erroComEndereco), buscar).catch(e => e);

    expect(erro.message).toBe('A página faz parte de uma versão anterior do sistema.');
  });
});

describe('textoDoDiagnostico', () => {
  it('vira uma linha legível para entrar no registro', () => {
    const texto = textoDoDiagnostico({
      desfecho: 'nao-sei',
      endereco: null,
      causa: 'error loading dynamically imported module',
    });
    expect(texto).toContain('nao-sei');
    expect(texto).toContain('error loading dynamically imported module');
  });

  it('sem diagnóstico não inventa linha nenhuma', () => {
    expect(textoDoDiagnostico(undefined)).toBe('');
  });

  it('🔴 não deixa a causa crescer sem limite — o registro tem teto de 8000 caracteres', () => {
    const texto = textoDoDiagnostico({
      desfecho: 'arquivo-sumiu',
      endereco: null,
      causa: 'x'.repeat(5000),
    });
    expect(texto.length).toBeLessThan(1000);
  });
});

describe('dependenciasDoModulo', () => {
  /**
   * 🔴 A CAUSA RAIZ DO TRAVAMENTO, achada em 24/09/2026.
   *
   * Quando uma página depende de um arquivo que está envenenado no cache, o navegador culpa a
   * PÁGINA, não o arquivo culpado. Verificado no Chrome, em produção, com um módulo de teste
   * que importava um arquivo inexistente:
   *
   *   "Failed to fetch dynamically imported module: blob:https://.../ecb60356"   ← a página
   *   (a mensagem NÃO cita o arquivo que realmente faltou)
   *
   * Consequência: a cura buscava a página — que estava perfeita, 200 —, concluía "era cache
   * envenenado, já troquei", tentava importar de novo, falhava, e o arquivo de verdade
   * envenenado nunca era tocado. Recarregar repetia o mesmo caminho, para sempre.
   *
   * Foi exatamente isso que prendeu o dono do produto: quatro arquivos guardados como erro, e
   * só limpar os quatro à mão pelas ferramentas do navegador resolveu.
   */

  const base = 'https://exemplo.invalido/assets/Pagina-abc.js';

  it('acha o que o pedaço de código importa, do jeito que o empacotador escreve', () => {
    const fonte = 'import{a}from"./compartilhado-x1.js";import"./efeito-y2.js";export const z=1;';
    expect(dependenciasDoModulo(fonte, base)).toEqual([
      'https://exemplo.invalido/assets/compartilhado-x1.js',
      'https://exemplo.invalido/assets/efeito-y2.js',
    ]);
  });

  it('aceita aspas simples e espaços, que aparecem quando o build não minifica', () => {
    const fonte = "import { a } from './um-x1.js';\nimport './dois-y2.js';";
    expect(dependenciasDoModulo(fonte, base)).toHaveLength(2);
  });

  it('🔴 ignora o que não é arquivo nosso — nunca sair buscando endereço de fora', () => {
    const fonte = 'import"https://cdn.invalido/pacote.js";import"./nosso-x1.js";';
    expect(dependenciasDoModulo(fonte, base)).toEqual(['https://exemplo.invalido/assets/nosso-x1.js']);
  });

  it('não repete o mesmo arquivo duas vezes', () => {
    const fonte = 'import"./x1.js";import{b}from"./x1.js";';
    expect(dependenciasDoModulo(fonte, base)).toHaveLength(1);
  });

  it('código sem importação nenhuma não quebra', () => {
    expect(dependenciasDoModulo('export const a=1;', base)).toEqual([]);
    expect(dependenciasDoModulo('', base)).toEqual([]);
  });
});

describe('curarModuloEDependencias', () => {
  function servidor(respostas: Record<string, { status: number; corpo?: string }>) {
    const pedidos: string[] = [];
    const buscar = (async (url: string) => {
      pedidos.push(url);
      const r = respostas[url] ?? { status: 404 };
      return new Response(r.corpo ?? '', { status: r.status });
    }) as unknown as typeof fetch;
    return { buscar, pedidos };
  }

  const pagina = 'https://exemplo.invalido/assets/Pagina-abc.js';
  const dep = 'https://exemplo.invalido/assets/compartilhado-x1.js';

  it('🔴 limpa TAMBÉM a dependência — é o conserto da causa raiz', async () => {
    const { buscar, pedidos } = servidor({
      [pagina]: { status: 200, corpo: 'import"./compartilhado-x1.js";' },
      [dep]: { status: 200, corpo: 'export const a=1;' },
    });

    const r = await curarModuloEDependencias(pagina, buscar);

    expect(r.desfecho).toBe('arquivo-voltou');
    expect(pedidos).toContain(dep);
    expect(r.dependenciasCuradas).toBe(1);
    expect(r.dependenciasAusentes).toBe(0);
  });

  it('🔴 dependência que some de verdade fica contada — é deploy quebrado, não cache', async () => {
    const { buscar } = servidor({
      [pagina]: { status: 200, corpo: 'import"./compartilhado-x1.js";' },
      [dep]: { status: 404 },
    });

    const r = await curarModuloEDependencias(pagina, buscar);

    expect(r.desfecho).toBe('arquivo-voltou');
    expect(r.dependenciasAusentes).toBe(1);
  });

  it('a página mesma fora do ar continua sendo versão velha, e não vai atrás de dependência', async () => {
    const { buscar, pedidos } = servidor({ [pagina]: { status: 404 } });

    const r = await curarModuloEDependencias(pagina, buscar);

    expect(r.desfecho).toBe('arquivo-sumiu');
    expect(pedidos).toEqual([pagina]);
  });

  it('servidor sem resposta continua sendo problema de conexão', async () => {
    const buscar = (async () => { throw new Error('rede'); }) as unknown as typeof fetch;
    const r = await curarModuloEDependencias(pagina, buscar);
    expect(r.desfecho).toBe('sem-resposta');
  });

  it('sem endereço não há o que curar, e não gasta ida à rede', async () => {
    const { buscar, pedidos } = servidor({});
    const r = await curarModuloEDependencias(null, buscar);
    expect(r.desfecho).toBe('nao-sei');
    expect(pedidos).toEqual([]);
  });

  it('🔴 dependência que não responde não derruba a cura do resto', async () => {
    let n = 0;
    const buscar = (async (url: string) => {
      n++;
      if (url === pagina) return new Response('import"./compartilhado-x1.js";', { status: 200 });
      throw new Error('rede caiu nesta');
    }) as unknown as typeof fetch;

    const r = await curarModuloEDependencias(pagina, buscar);

    expect(r.desfecho).toBe('arquivo-voltou');
    expect(n).toBe(2);
  });
});

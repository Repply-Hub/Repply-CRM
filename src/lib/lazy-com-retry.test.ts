import { ehFalhaDeModulo, ErroDeVersao } from './lazy-com-retry';

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

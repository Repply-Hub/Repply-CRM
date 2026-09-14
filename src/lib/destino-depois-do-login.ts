/**
 * Para onde mandar a pessoa depois de entrar, quando ela caiu em /login PORQUE a sessão
 * expirou no meio de uma rota (ex.: clicou em "Abrir na agenda" de um e-mail e caiu aqui em
 * vez de ir direto para `/calendario?data=...`) — Bloco 3, item E.
 *
 * Só aceita caminho INTERNO. Qualquer coisa que possa levar para fora do site, ou de volta
 * para o próprio /login, devolve `null` — quem chama cai no destino de hoje (o que já
 * acontecia antes deste conserto).
 */
export function destinoDepoisDoLogin(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/')) return null;
  // "//evil.com" é protocolo-relativo (o navegador entende como outro domínio), e "/\evil.com"
  // é a mesma armadilha por outra porta: alguns navegadores tratam a barra invertida como "/".
  if (from.startsWith('//')) return null;
  if (from.startsWith('/\\')) return null;
  // 🔴 Não é só a string exata `/login`. `/login?x=1` e `/login#y` também voltam para a
  // MESMA tela de login (query e hash não mudam qual rota o React Router casa), e cairiam
  // num "redireciona para onde já está" se aceitos. O corte é logo depois de "/login": só
  // aceita se vier "/", "?", "#" ou o fim da string ali — "/loginho" (uma rota diferente,
  // que só por acaso começa com as mesmas letras, se um dia existir) continua liberado.
  if (/^\/login(?:[/?#]|$)/.test(from)) return null;

  // Um esquema disfarçado de caminho ("/javascript:alert(1)") ainda tem ":" antes da
  // primeira "/", "?" ou "#" do primeiro segmento — corta ali para não confundir com
  // ":" dentro da query ou do hash, que são inofensivos.
  const semBarraInicial = from.slice(1);
  const fimDoPrimeiroSegmento = semBarraInicial.search(/[/?#]/);
  const primeiroSegmento =
    fimDoPrimeiroSegmento === -1 ? semBarraInicial : semBarraInicial.slice(0, fimDoPrimeiroSegmento);
  if (primeiroSegmento.includes(':')) return null;

  // Mantém a query e o hash: `from` já é o caminho inteiro, sem alteração.
  return from;
}

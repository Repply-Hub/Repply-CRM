import { lazy, type ComponentType } from "react";

/**
 * Erro de "a página que você tinha aberta é de uma versão que não existe mais".
 *
 * Tipado para o ErrorBoundary conseguir distinguir isso de um bug de verdade e
 * mostrar a mensagem certa — antes, os dois caíam no mesmo "Algo deu errado",
 * que não dizia nada a quem estava na frente da tela.
 */
export class ErroDeVersao extends Error {
  constructor(public readonly causaOriginal: unknown) {
    super("A página faz parte de uma versão anterior do sistema.");
    this.name = "ErroDeVersao";
  }
}

/**
 * Reconhece a falha de carregar um módulo dinâmico.
 *
 * A mensagem varia por navegador, e aqui ela é ESPECIALMENTE enganosa por causa
 * do `vercel.json`: a regra `"/(.*)" -> "/index.html"` é catch-all, então um
 * chunk que não existe mais não devolve 404 — devolve a página HTML com status
 * 200 (verificado em produção). O navegador então recusa executar HTML como
 * módulo e reclama de MIME type, não de arquivo ausente. Por isso a lista cobre
 * as duas famílias de mensagem, e por isso não dá para detectar isso por status.
 */
export function ehFalhaDeModulo(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  return [
    "Failed to fetch dynamically imported module", // Chrome/Edge
    "error loading dynamically imported module", // Firefox
    "Importing a module script failed", // Safari
    "Expected a JavaScript module script", // o caso do rewrite devolvendo HTML
    "Failed to load module script",
    "Loading chunk",
    "ChunkLoadError",
  ].some((t) => msg.toLowerCase().includes(t.toLowerCase()));
}

/**
 * `React.lazy` que traduz falha de carregamento em erro reconhecível.
 *
 * POR QUE ISTO EXISTE: todas as páginas do app são carregadas sob demanda, e o
 * Vite nomeia cada arquivo com um hash do conteúdo. Quando sai um deploy os
 * hashes mudam, e quem estava com a aba aberta fica apontando para arquivos que
 * não existem mais. Clicar numa aba dispara um import que falha, e a tela
 * quebra — sem que nada esteja errado com o código.
 *
 * Pior: o React GUARDA a promise rejeitada. Uma vez que o import falhou, todo
 * render seguinte daquele componente relança o mesmo erro; nem "tentar de novo"
 * nem navegar pelo menu recriam o módulo. Só recarregar a página resolve — o
 * que explica por que o usuário vinha tendo que apertar F5.
 *
 * Sobre a segunda tentativa: ela só ajuda quando a primeira falha foi oscilação
 * de rede. Se o arquivo realmente sumiu do servidor, o navegador guarda a falha
 * no module map e a repetição falha na hora, sem rede — que é o resultado certo,
 * e é rápido. Não dá para "furar" esse cache de dentro do app; a saída real é
 * recarregar a página, e é isso que a tela de `ErroDeVersao` oferece.
 */
export function lazyComRetry<T extends ComponentType<never>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importar();
    } catch (primeiroErro) {
      if (!ehFalhaDeModulo(primeiroErro)) throw primeiroErro;
      try {
        return await importar();
      } catch (segundoErro) {
        throw new ErroDeVersao(segundoErro);
      }
    }
  });
}

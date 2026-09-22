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
 * Erro de "não conseguimos BAIXAR o arquivo" — diferente de "o arquivo não existe mais".
 *
 * Separar os dois importa porque a saída é outra: versão velha se resolve recarregando;
 * download que não completa não se resolve recarregando, e mandar a pessoa apertar o mesmo
 * botão para sempre foi o que prendeu uma vendedora da MD por 27 minutos em 22/09/2026.
 */
export class ErroDeDownload extends Error {
  constructor(public readonly causaOriginal: unknown) {
    super("Não foi possível baixar esta página do sistema.");
    this.name = "ErroDeDownload";
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
 * O endereço do arquivo que falhou, quando o navegador o informa.
 *
 * O Chrome escreve "Failed to fetch dynamically imported module: <url>". Firefox e Safari não
 * dizem qual arquivo era — e aí não há o que curar, só tentar de novo.
 */
export function enderecoDoModulo(erro: unknown): string | null {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  const achado = /https?:\/\/[^\s"')]+\.js/i.exec(msg);
  return achado ? achado[0] : null;
}

export type ResultadoDaCura = "arquivo-voltou" | "arquivo-sumiu" | "sem-resposta" | "nao-sei";

/**
 * Busca o arquivo IGNORANDO o cache do navegador, e diz o que encontrou.
 *
 * 🔴 POR QUE ISTO EXISTE, medido em produção em 22/09/2026. A regra de cache do `vercel.json`
 * casa pelo caminho (`/assets/`), e o cabeçalho que ela manda vale também para as respostas de
 * ERRO. Um 404 momentâneo — a janela de troca de uma publicação, ou uma falha de rede de um
 * segundo — chega ao navegador com `Cache-Control: public, max-age=604800` e fica guardado por
 * SETE DIAS. Dali em diante o navegador não pergunta mais nada ao servidor: serve o "não
 * existe" do próprio disco. Recarregar não resolve, sair não resolve, reiniciar o computador
 * não resolve; só limpar os arquivos guardados do navegador, que quase ninguém sabe fazer.
 *
 * `cache: "reload"` obriga a ida à rede e SUBSTITUI a entrada guardada — é isso que desenvenena.
 * E o resultado separa três casos que antes eram um só:
 *   · `arquivo-voltou`  — estava no servidor: era cache envenenado, e agora foi trocado;
 *   · `arquivo-sumiu`   — saiu do ar mesmo: é versão velha, recarregar resolve;
 *   · `sem-resposta`    — nem chegamos ao servidor: é a conexão, e recarregar não resolve.
 */
export async function curarCacheDoModulo(
  endereco: string | null,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaCura> {
  if (!endereco) return "nao-sei";
  try {
    const resposta = await buscar(endereco, { cache: "reload", credentials: "same-origin" });
    return resposta.ok ? "arquivo-voltou" : "arquivo-sumiu";
  } catch {
    return "sem-resposta";
  }
}

/**
 * Carrega a página, e se o download falhar, tenta desenvenenar o cache antes de desistir.
 *
 * Fica separado do `lazyComRetry` para poder ser testado: o que importa aqui é a decisão entre
 * os três desfechos, e não o embrulho do React.
 *
 * Mesmo quando a segunda tentativa falha, a cura já valeu: o arquivo bom ficou no lugar do
 * "não existe", então o "Recarregar" da tela de erro — que antes não tinha como funcionar —
 * passa a funcionar.
 */
export async function carregarComCura<T extends ComponentType<never>>(
  importar: () => Promise<{ default: T }>,
  buscar: typeof fetch = fetch,
): Promise<{ default: T }> {
  try {
    return await importar();
  } catch (primeiroErro) {
    if (!ehFalhaDeModulo(primeiroErro)) throw primeiroErro;

    const cura = await curarCacheDoModulo(enderecoDoModulo(primeiroErro), buscar);
    if (cura === "arquivo-sumiu") throw new ErroDeVersao(primeiroErro);
    if (cura === "sem-resposta") throw new ErroDeDownload(primeiroErro);

    try {
      return await importar();
    } catch (segundoErro) {
      // O arquivo está no servidor e o cache foi trocado, mas o navegador guarda a falha do
      // primeiro import nesta aba. Recarregar resolve — e agora resolve de verdade.
      throw new ErroDeVersao(segundoErro);
    }
  }
}

/**
 * `React.lazy` que traduz falha de carregamento em erro reconhecível, e que cura o cache
 * envenenado antes de desistir (ver `carregarComCura`).
 *
 * POR QUE ISTO EXISTE: todas as páginas do app são carregadas sob demanda, e o Vite nomeia
 * cada arquivo com um hash do conteúdo. Quando sai um deploy os hashes mudam, e quem estava
 * com a aba aberta fica apontando para arquivos que não existem mais.
 *
 * O React GUARDA a promise rejeitada: uma vez que o import falhou, todo render seguinte
 * relança o mesmo erro, e nem navegar pelo menu recria o módulo. Só recarregar a página
 * resolve — e é isso que a tela de erro oferece.
 */
export function lazyComRetry<T extends ComponentType<never>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(() => carregarComCura(importar));
}

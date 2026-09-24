import { lazy, type ComponentType } from "react";

/**
 * Erro de "a página que você tinha aberta é de uma versão que não existe mais".
 *
 * Tipado para o ErrorBoundary conseguir distinguir isso de um bug de verdade e
 * mostrar a mensagem certa — antes, os dois caíam no mesmo "Algo deu errado",
 * que não dizia nada a quem estava na frente da tela.
 */
export type ResultadoDaCura = "arquivo-voltou" | "arquivo-sumiu" | "sem-resposta" | "nao-sei";

/**
 * O que a cura encontrou, para ir junto no registro de `app_erros`.
 *
 * 🔴 POR QUE ISTO EXISTE. Em 24/09/2026 três desfechos diferentes da cura produziam
 * exatamente a mesma mensagem e a mesma pilha no registro, e a investigação de um travamento
 * real ficou sem saber qual deles havia acontecido. Pior: o erro já carregava a causa original
 * — com o endereço do arquivo e a mensagem do navegador — e o gravador descartava isso.
 *
 * A informação existia no instante da falha e era jogada fora antes de ser escrita. Este tipo
 * é o que a leva até o banco.
 */
export interface DiagnosticoDeCarregamento {
  desfecho: ResultadoDaCura;
  /** O arquivo que o navegador culpou. Nem sempre é o culpado de verdade — ver `dependenciasDoModulo`. */
  endereco: string | null;
  /** A mensagem CRUA do navegador, que é a que diz o que aconteceu de fato. */
  causa: string;
  dependenciasCuradas?: number;
  dependenciasAusentes?: number;
}

export class ErroDeVersao extends Error {
  constructor(
    public readonly causaOriginal: unknown,
    /** Qual caminho da cura produziu este erro. Ver `DiagnosticoDeCarregamento`. */
    public readonly diagnostico?: DiagnosticoDeCarregamento,
  ) {
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
  constructor(
    public readonly causaOriginal: unknown,
    public readonly diagnostico?: DiagnosticoDeCarregamento,
  ) {
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
 * Os arquivos que este pedaço de código importa diretamente.
 *
 * 🔴 ISTO É O CONSERTO DA CAUSA RAIZ, achada em 24/09/2026 e verificada no Chrome em produção.
 *
 * Quando uma página depende de um arquivo envenenado, o navegador culpa a PÁGINA, não o arquivo
 * culpado. Medido com um módulo de teste que importava um arquivo inexistente:
 *
 *   "Failed to fetch dynamically imported module: blob:https://.../ecb60356"
 *
 * — e a mensagem não cita, em lugar nenhum, o arquivo que realmente faltou. Por isso a cura
 * antiga buscava a página (que estava perfeita, 200), concluía "já troquei o cache", tentava de
 * novo, falhava, e o arquivo de verdade envenenado nunca era tocado. Recarregar repetia o mesmo
 * caminho para sempre. Foi o que prendeu o dono do produto: QUATRO arquivos guardados como
 * erro, e só limpar os quatro à mão resolveu.
 *
 * Só olha um nível: o empacotador põe as dependências compartilhadas a uma importação de
 * distância da página, e é onde elas estavam. Descer mais custaria idas à rede a cada
 * travamento sem cobrir caso novo.
 */
export function dependenciasDoModulo(fonte: string, enderecoBase: string): string[] {
  if (!fonte) return [];
  const achados = new Set<string>();
  // Pega `from"./x.js"`, `import"./x.js"` e `import("./x.js")`, com aspas de qualquer tipo.
  const padrao = /(?:from|import)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+?\.js)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(fonte)) !== null) {
    try {
      achados.add(new URL(m[1], enderecoBase).toString());
    } catch {
      // Endereço que não resolve não vira ida à rede.
    }
  }
  return [...achados];
}

export interface ResultadoDaCuraFunda {
  desfecho: ResultadoDaCura;
  dependenciasCuradas: number;
  dependenciasAusentes: number;
}

/**
 * Desenvenena o arquivo E as dependências diretas dele.
 *
 * A ordem importa: se a própria página sumiu do servidor, isso é versão velha e não há
 * dependência a perseguir — recarregar resolve, e sair buscando arquivos seria gastar rede à
 * toa no meio de um erro.
 */
export async function curarModuloEDependencias(
  endereco: string | null,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaCuraFunda> {
  const vazio = { dependenciasCuradas: 0, dependenciasAusentes: 0 };
  if (!endereco) return { desfecho: "nao-sei", ...vazio };

  let resposta: Response;
  try {
    resposta = await buscar(endereco, { cache: "reload", credentials: "same-origin" });
  } catch {
    return { desfecho: "sem-resposta", ...vazio };
  }
  if (!resposta.ok) return { desfecho: "arquivo-sumiu", ...vazio };

  // 🔴 LER O CORPO NÃO PODE MUDAR O VEREDITO. O corpo serve só para descobrir as dependências;
  // se a leitura falhar, o que se sabe do ARQUIVO continua igual — ele respondeu, e portanto
  // não é "servidor sem resposta". Misturar as duas coisas fazia uma cura bem-sucedida ser
  // relatada como queda de conexão, mandando a pessoa para a saída errada.
  let fonte = "";
  try {
    fonte = typeof resposta.text === "function" ? await resposta.text() : "";
  } catch {
    fonte = "";
  }

  let curadas = 0;
  let ausentes = 0;
  // Uma dependência que falhe NÃO pode derrubar a cura das outras: estamos no meio de um erro,
  // e cada arquivo desenvenenado é um a menos prendendo a pessoa.
  const idas = dependenciasDoModulo(fonte, endereco).map(async (dep) => {
    try {
      const r = await buscar(dep, { cache: "reload", credentials: "same-origin" });
      if (r.ok) curadas++;
      else ausentes++;
    } catch {
      // Sem resposta nesta: não conta como curada nem como ausente.
    }
  });
  await Promise.all(idas);

  return { desfecho: "arquivo-voltou", dependenciasCuradas: curadas, dependenciasAusentes: ausentes };
}

/**
 * O diagnóstico virado texto, para entrar no `stack` gravado em `app_erros`.
 *
 * Vai no `stack` e não na `mensagem` de propósito: mudar a mensagem quebraria a consulta que
 * agrupa as ocorrências históricas, e a série de meses seria perdida justamente ao instrumentar.
 */
export function textoDoDiagnostico(d?: DiagnosticoDeCarregamento): string {
  if (!d) return "";
  const partes = [
    `desfecho=${d.desfecho}`,
    `arquivo=${d.endereco ?? "(o navegador não disse)"}`,
    `curadas=${d.dependenciasCuradas ?? 0}`,
    `ausentes=${d.dependenciasAusentes ?? 0}`,
    `causa=${(d.causa ?? "").slice(0, 300)}`,
  ];
  return `[diagnóstico de carregamento] ${partes.join(" · ")}`;
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

    const endereco = enderecoDoModulo(primeiroErro);
    const cura = await curarModuloEDependencias(endereco, buscar);
    const diagnostico: DiagnosticoDeCarregamento = {
      desfecho: cura.desfecho,
      endereco,
      causa: primeiroErro instanceof Error ? primeiroErro.message : String(primeiroErro ?? ""),
      dependenciasCuradas: cura.dependenciasCuradas,
      dependenciasAusentes: cura.dependenciasAusentes,
    };

    if (cura.desfecho === "arquivo-sumiu") throw new ErroDeVersao(primeiroErro, diagnostico);
    if (cura.desfecho === "sem-resposta") throw new ErroDeDownload(primeiroErro, diagnostico);

    try {
      return await importar();
    } catch (segundoErro) {
      // O arquivo está no servidor e o cache foi trocado, mas o navegador guarda a falha do
      // primeiro import nesta aba. Recarregar resolve — e agora resolve de verdade.
      //
      // 🔴 `desfecho: "nao-sei"` chegando aqui é o sinal de que a cura NEM RODOU (o navegador
      // não disse qual arquivo era), e então recarregar NÃO vai resolver. Era esse caso que
      // ficava indistinguível dos outros no registro.
      throw new ErroDeVersao(segundoErro, diagnostico);
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

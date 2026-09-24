/**
 * Re-registrar o endereço do webhook na operadora, sem destruir o que já está lá.
 *
 * Item 16 da dívida técnica · Tarefa 4 de `docs/operacao/plano-blindagem-whatsapp-execucao.md`.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 A REGRA: LER O QUE ESTÁ LÁ, DEVOLVER IGUAL, MUDAR SÓ O ENDEREÇO
 * ---------------------------------------------------------------------------------
 * O plano escrito mandava enviar um corpo fixo — `{ url, enabled: true, events: ["All"] }`.
 * Medido na operadora em 23/09/2026, pelo `GET /webhook` das instâncias VIVAS, a configuração
 * real **difere de uma para a outra**: uma tem `events: []` e a outra `events: ["All"]`. As
 * duas recebem tudo, então nenhuma está errada — mas o corpo fixo teria reescrito a primeira
 * para outra coisa.
 *
 * E o jeito de descobrir o que isso muda seria a caixa de WhatsApp de um cliente pagante parar
 * de receber — em silêncio, com a instância ainda aparecendo "conectada" na tela. Já aconteceu
 * neste sistema (`0715119`).
 *
 * Por isso nada aqui inventa configuração: o corpo enviado é o corpo recebido, com o endereço
 * trocado. Campo que a operadora inventar amanhã viaja junto sem ninguém precisar saber dele.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 A SEGUNDA REGRA: NUNCA ESCOLHER NO ESCURO
 * ---------------------------------------------------------------------------------
 * O `GET /webhook` devolve uma **lista**, e cada endereço tem `id` próprio. Se vier nenhum, ou
 * mais de um, estas funções RECUSAM e explicam — não chutam qual reconfigurar. Dois endereços
 * cadastrados significam o mesmo evento chegando em dobro, que é problema diferente e precisa
 * de decisão humana.
 *
 * O contrato está preso em `src/lib/endereco-do-webhook.test.ts`, que importa DESTE arquivo —
 * não há segunda cópia para divergir (a lição do telefone do WhatsApp, CLAUDE.md §7.1).
 */

/** O caminho da nossa função de webhook, dentro do projeto do Supabase. */
export const CAMINHO_DO_WEBHOOK = "/functions/v1/whatsapp-webhook";

/** Um endereço de webhook como a operadora devolve. Os campos extras são de propósito. */
export interface WebhookDaOperadora {
  id?: string;
  url?: string;
  enabled?: boolean;
  events?: unknown;
  [campo: string]: unknown;
}

/**
 * O resultado de uma decisão: deu, com o endereço escolhido; ou não deu, com o motivo em
 * português pronto para ir à tela.
 *
 * Os dois campos aparecem nas duas variantes (um deles sempre `undefined`) de propósito: este
 * projeto compila com `strictNullChecks` desligado (`CLAUDE.md` §2), e sem isso o compilador
 * não estreita a união por `if (!r.ok)` — quem lesse `r.motivo` depois de checar `ok` tomaria
 * erro de tipo por um código que está certo.
 */
export type Escolha =
  | { ok: true; webhook: WebhookDaOperadora; motivo?: undefined }
  | { ok: false; webhook?: undefined; motivo: string };

/**
 * Segredo novo. 32 caracteres hexadecimais: cabe numa URL sem escapar nada, e é longo o
 * bastante para não se adivinhar.
 *
 * Reconfigurar é também como se ROTACIONA — por isso nunca reaproveita o anterior.
 */
export function gerarSegredoDeWebhook(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * O mesmo endereço, agora carregando o segredo.
 *
 * Usa `searchParams.set`, que TROCA um `s=` existente em vez de acrescentar um segundo — sem
 * isso, a segunda rotação produziria `?s=antigo&s=novo` e a operadora escolheria um dos dois.
 * Todo o resto do endereço é preservado.
 */
export function enderecoComSegredo(urlAtual: string, segredo: string): string {
  const u = new URL(urlAtual);
  u.searchParams.set("s", segredo);
  return u.toString();
}

/**
 * Este endereço é mesmo o da NOSSA função, para ESTA instância?
 *
 * 🔴 É a trava que impede gravar um segredo em endereço alheio. Se alguém tiver apontado o
 * webhook para outro lugar (outro projeto, outra instância, um túnel de teste esquecido), a
 * reconfiguração para aqui em vez de mandar o segredo para fora.
 */
export function ehNossoEndereco(
  url: string | undefined,
  baseDoSupabase: string,
  instanceName: string,
): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.origin === new URL(baseDoSupabase).origin &&
      u.pathname === CAMINHO_DO_WEBHOOK &&
      u.searchParams.get("instance") === instanceName;
  } catch {
    return false;
  }
}

/**
 * Tira o segredo de um texto antes de ele ir para a tela ou para o registro.
 *
 * 🔴 POR QUE. Quando a operadora RECUSA o novo endereço, ela costuma devolver o que recebeu
 * dentro da mensagem de erro — e o que ela recebeu é a URL com `&s=<segredo>`. Repassar esse
 * corpo cru para o navegador publicaria o segredo num aviso de tela e no registro do console.
 *
 * O segredo dessa tentativa não chega a ser gravado (o código só grava depois de conferir),
 * então seria um segredo morto. Mas "morto" depende de um detalhe do fluxo continuar
 * verdadeiro para sempre, e isso não é jeito de tratar segredo.
 *
 * 🔴 O SEGREDO VAI COMO PARÂMETRO, E ESSA É A PARTE QUE FUNCIONA. Mascarar por padrão de texto
 * (`&s=...`) só acerta quando o `&` chega literal. Ao serializar JSON, servidor em Go escreve
 * o `&` na forma escapada de seis caracteres (barra invertida, `u`, `0026`) — e aí a máscara
 * passa reto, com o segredo inteiro atrás.
 * O mesmo vale para o endereço já escapado dentro de outra string. Apagar o VALOR que a gente
 * mesma acabou de gerar não depende de adivinhar o formato de ninguém; os padrões abaixo ficam
 * como segunda linha, para o que vier de outras chamadas.
 */
export function semSegredoNoTexto(
  texto: string | undefined | null,
  segredo?: string,
): string {
  if (!texto) return "";
  let limpo = texto;
  if (segredo && segredo.length >= 8) limpo = limpo.split(segredo).join("<oculto>");
  return limpo
    .replace(/([?&]s=)[^&"'\s\\]+/g, "$1<oculto>")
    .replace(/(\\u0026s=)[^&"'\s\\]+/gi, "$1<oculto>")
    .replace(/("(?:token|apikey|api_key|secret)"\s*:\s*")[^"]+/gi, "$1<oculto>");
}

/**
 * O endereço da nossa função de webhook para uma instância que está NASCENDO.
 *
 * Existe para os dois caminhos de criação (`whatsapp-provision` e `whatsapp-admin-provision`)
 * não montarem a mesma string cada um do seu jeito — é a lição do telefone do WhatsApp
 * (`CLAUDE.md` §7.1): regra duplicada é regra que vai divergir.
 *
 * Para instância que JÁ EXISTE não use isto: use `enderecoComSegredo` sobre o endereço que a
 * operadora devolveu, para não apagar parâmetro que já esteja lá.
 */
export function enderecoDeInstanciaNova(
  baseDoSupabase: string,
  instanceName: string,
  segredo: string,
): string {
  const u = new URL(CAMINHO_DO_WEBHOOK, baseDoSupabase);
  u.searchParams.set("instance", instanceName);
  u.searchParams.set("s", segredo);
  return u.toString();
}

/** Qual dos endereços cadastrados reconfigurar — ou por que não dá para decidir sozinho. */
export function escolherWebhookParaReconfigurar(lista: unknown): Escolha {
  if (!Array.isArray(lista)) {
    return {
      ok: false,
      motivo: "A operadora respondeu algo que não é uma lista de endereços. Nada foi mudado.",
    };
  }
  if (lista.length === 0) {
    return {
      ok: false,
      motivo: "A operadora não tem nenhum endereço de webhook cadastrado para esta instância. " +
        "Nada foi mudado — criar um do zero é outra decisão, porque não há configuração a preservar.",
    };
  }
  if (lista.length > 1) {
    return {
      ok: false,
      motivo: `A operadora tem ${lista.length} endereços cadastrados para esta instância, e não ` +
        "dá para adivinhar qual é o certo. Nada foi mudado. Mais de um endereço também significa " +
        "que cada mensagem está chegando em dobro — vale conferir antes de seguir.",
    };
  }
  // 🔴 Um item que não é objeto passaria daqui e só estouraria lá na frente, ao ler `.url` —
  // virando um 500 genérico no lugar de uma frase que explica. Recusar aqui mantém a promessa
  // deste módulo: ou devolve um endereço utilizável, ou diz por que não dá.
  const primeiro = lista[0];
  if (!primeiro || typeof primeiro !== "object") {
    return {
      ok: false,
      motivo: "A operadora devolveu um endereço em formato que não dá para ler. Nada foi mudado.",
    };
  }
  return { ok: true, webhook: primeiro as WebhookDaOperadora };
}

/**
 * O corpo a enviar de volta: tudo o que veio, com o endereço trocado.
 *
 * 🔴 O espalhamento não é preguiça, é o ponto. Listar os campos à mão faria a gente apagar,
 * calado, qualquer campo que a operadora tenha hoje e a gente não conheça — ou que ela venha a
 * criar. Preservar é a regra; a lista de campos é detalhe que muda sem avisar.
 */
export function corpoDeReconfiguracao(
  webhook: WebhookDaOperadora,
  novaUrl: string,
): WebhookDaOperadora {
  return { ...webhook, url: novaUrl };
}

/**
 * Depois de enviar, a operadora ficou mesmo como a gente pediu?
 *
 * 🔴 ISTO NÃO É ZELO EXCESSIVO. "A operadora respondeu 200" e "a operadora aplicou" são coisas
 * diferentes, e a diferença entre elas é a caixa de WhatsApp de um cliente. Pior: se o envio
 * ACRESCENTAR um endereço em vez de substituir, o 200 vem igual e cada mensagem passa a chegar
 * duas vezes. Só uma segunda leitura separa os três casos.
 */
export function conferirReconfiguracao(lista: unknown, urlEsperada: string): Escolha {
  if (!Array.isArray(lista)) {
    return { ok: false, motivo: "Não foi possível reler a configuração da operadora para conferir." };
  }
  if (lista.length === 0) {
    return { ok: false, motivo: "Depois do envio, a operadora não tem endereço nenhum cadastrado." };
  }
  if (lista.length > 1) {
    return {
      ok: false,
      motivo: `Depois do envio, a operadora passou a ter ${lista.length} endereços — ou seja, o ` +
        "envio ACRESCENTOU em vez de substituir, e cada mensagem chegaria em dobro.",
    };
  }
  const atual = (lista[0] as WebhookDaOperadora)?.url;
  if (atual !== urlEsperada) {
    return {
      ok: false,
      motivo: "A operadora aceitou o envio mas o endereço cadastrado continua sendo outro.",
    };
  }
  return { ok: true, webhook: lista[0] as WebhookDaOperadora };
}

/**
 * O TEXTO do resumo diário — a parte que só monta HTML, sem falar com ninguém.
 *
 * Saiu de `index.ts` em 10/09/2026 por um motivo prático: o e-mail passou a ter DOIS formatos
 * (a fila pessoal e o pulso da equipe) e não havia como conferir nenhum dos dois sem disparar
 * envio de verdade — e há gente real do outro lado. Aqui, sem `Deno.serve`, sem `createClient`
 * e sem `fetch`, o Vitest consegue importar e montar o corpo com dados de mentira:
 * `src/lib/corpo-do-resumo-diario.test.ts`. É o mesmo caminho que
 * `supabase/functions/_shared/nylas.ts` já usa com `src/lib/erro-do-provedor-de-email.test.ts`.
 *
 * ⚠️ O import de `./modelo.ts` leva a extensão porque este arquivo roda em Deno. O Vite resolve
 * assim também (`allowImportingTsExtensions` em `tsconfig.app.json`), então o teste importa o
 * mesmo arquivo que o servidor executa — não uma cópia.
 */
import { MODELO_RESUMO, MODELO_ITEM } from "./modelo.ts";

/** Um item da fila pessoal, como `pauta_do_dia_de` devolve. */
export interface ItemDaPauta {
  tipo: string;
  selo: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  quando: string | null;
  // Nome do dono do negócio. `pauta_do_dia_de` só preenche este campo quando o item NÃO é
  // de quem vai receber o e-mail — para o próprio dono ele vem nulo de propósito, senão o
  // e-mail ficaria repetindo o nome da própria pessoa em todo item.
  //
  // ⚠️ Desde a migration 20260909120000 a fila é sempre pessoal, então ele vem SEMPRE nulo.
  // A coluna ficou no retorno de propósito (ver o cabeçalho daquela migration), e o tratamento
  // aqui também: o dia em que a fila voltar a ter item de outra pessoa, os dois voltam a servir.
  responsavel?: string | null;
}

/**
 * Uma linha da tabela do time, como `negocios_em_risco_de` devolve.
 *
 * `total_geral` e `valor_geral` repetem em TODA linha o total do recorte inteiro, não o da
 * página — é o que deixa o e-mail dizer "R$ X em N negócios" tendo lido só as 5 maiores.
 * Espelha `NegocioEmRisco` de `src/hooks/use-dashboard.ts`, mais a coluna `valor_geral`, que
 * só a variante do e-mail devolve.
 */
export interface NegocioDaEquipe {
  id: string;
  nome: string;
  fabrica: string | null;
  etapa: string | null;
  responsavel: string | null;
  valor: number | null;
  dias_parado: number | null;
  total_geral: number;
  valor_geral: number | null;
}

/**
 * Dinheiro em e-mail vai SEM centavos: "R$ 10.580.166". Numa manchete, os centavos só roubam
 * a atenção do número que importa. `Intl.NumberFormat` é o equivalente Deno de
 * `formatarMoedaBRL` (CLAUDE.md §7.10) — nunca montar isso à mão, nunca `parseFloat`.
 */
export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Escapa o que vai para dentro do HTML. Nome de cliente com "&" ou "<" quebraria o e-mail. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Bom dia, Érika" soa como pessoa; o nome completo soa como cadastro. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

/**
 * Preenche os marcadores de um modelo, na ordem em que vêm.
 *
 * 🔴 NÃO USA `replaceAll`, e são dois motivos independentes:
 *
 *  1. O `tsc` do projeto fixa `lib: ["ES2020", …]` em `tsconfig.app.json`, e `replaceAll` é de
 *     ES2021. Como este arquivo é importado pelo teste em `src/`, ele entra na conferência de
 *     tipos (CLAUDE.md §9) — e cada `replaceAll` virava um erro novo na contagem. Medido em
 *     10/09/2026: 4 erros, que sumiram com esta troca.
 *  2. Com TEXTO no segundo argumento, tanto `replace` quanto `replaceAll` interpretam `$&`,
 *     `` $` `` e `$'` como referência ao trecho casado. Nome de negócio e de cliente vêm do
 *     banco, e `esc()` não escapa cifrão: um negócio chamado `Obra $& Cia` fazia o marcador
 *     reaparecer no meio do e-mail. `split`/`join` não interpreta nada.
 */
function preencher(molde: string, valores: Record<string, string>): string {
  return Object.entries(valores).reduce(
    (texto, [marcador, valor]) => texto.split(marcador).join(valor),
    molde,
  );
}

export function montarItens(itens: ItemDaPauta[]): string {
  return itens
    .map((i) => {
      // Compromisso mostra a HORA no lugar do valor: é o que decide a ordem do dia dele.
      // A hora vem em UTC do banco; o fuso é fixado aqui, senão o das 21h aparece como 00h.
      const direita = i.quando
        ? new Date(i.quando).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })
        : i.valor !== null
        ? BRL.format(Number(i.valor))
        : "";

      return preencher(MODELO_ITEM, {
        ITEM_SELO: esc(i.selo),
        ITEM_VALOR: esc(direita),
        ITEM_TITULO: esc(i.titulo),
        // `responsavel` só vem quando o negócio NÃO é de quem recebe o e-mail — a função de
        // banco já resolve isso. Sem esta linha, o gestor recebe negócio de colega sem saber
        // de quem é, e cobra a pessoa errada.
        ITEM_DETALHE: esc(i.responsavel ? `${i.detalhe} · ${i.responsavel}` : i.detalhe),
      });
    })
    .join("\n");
}

export function montarEmail(nome: string, itens: ItemDaPauta[], link: string): string {
  const total = itens.length;
  const valor = itens.reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

  return preencher(MODELO_RESUMO, {
    "{{PAUTA_NOME}}": esc(primeiroNome(nome)),
    "{{PAUTA_MANCHETE}}": total === 1 ? "1 coisa espera você" : `${total} coisas esperam você`,
    "{{PAUTA_VALOR}}": valor > 0 ? `${BRL.format(valor)} em jogo` : "",
    "{{PAUTA_ITENS}}": montarItens(itens),
    "{{PAUTA_BOTAO}}": "Abrir minha pauta",
    "{{PAUTA_RODAPE}}": 'É a mesma pauta que aparece na tela "Hoje".',
    "{{PAUTA_LINK}}": link,
  });
}

export function assuntoDaPauta(itens: ItemDaPauta[]): string {
  return itens.length === 1
    ? "1 coisa espera você hoje"
    : `${itens.length} coisas esperam você hoje`;
}

// ────────────────────────────────────────────────────────────────────────────
// O PULSO DA EQUIPE
//
// Para quem tem a chave `pauta_de_todos` e ficou sem negócio próprio. Ver o comentário do
// `index.ts` sobre por que este e-mail existe.
// ────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 "PEDEM ATENÇÃO", E NÃO "PARADOS". A lista vem de `WHERE parado OR sem_proxima_acao`, e as
 * duas metades são bem diferentes de tamanho. Medido na MD em 10/09/2026, no recorte de 161:
 *
 *     107 estão de fato parados além do prazo   →  R$  5.681.469
 *      54 entraram só por não ter próxima ação  →  R$  4.898.696
 *                                        total  →  R$ 10.580.166
 *
 * Dizer "R$ 10.580.166 parados" inventaria R$ 4,9 milhões de negócio parado que não existe —
 * quase o dobro do que está parado de verdade. A tela já tinha resolvido isso do mesmo jeito
 * (`TabelaDoTime.tsx`: "Um título que só dissesse 'parados' mentiria sobre o que a tabela
 * lista"), e o e-mail não pode contar uma história diferente da tela sobre o mesmo dia.
 */
export function montarPulsoDaEquipe(
  nome: string,
  equipe: NegocioDaEquipe[],
  link: string,
): string {
  const total = Number(equipe[0]?.total_geral ?? equipe.length);
  const valor = Number(equipe[0]?.valor_geral ?? 0);
  const quantos = plural(total, "negócio", "negócios");

  // Sem valor somado a manchete vira o número de negócios — "R$ 0 pedem atenção" seria um
  // e-mail dizendo que não há nada num dia em que há. Negócio sem valor preenchido existe
  // nesta base (CLAUDE.md §7.10 conta como), então este ramo não é hipotético.
  const comValor = valor > 0;

  return preencher(MODELO_RESUMO, {
    "{{PAUTA_NOME}}": esc(primeiroNome(nome)),
    "{{PAUTA_MANCHETE}}": esc(
      comValor ? `${BRL.format(valor)} pedem atenção` : `${quantos} da equipe pedem atenção`,
    ),
    "{{PAUTA_VALOR}}": esc(comValor ? `em ${quantos} da equipe` : ""),
    "{{PAUTA_ITENS}}": montarItensDaEquipe(equipe),
    "{{PAUTA_BOTAO}}": "Ver a tabela do time",
    "{{PAUTA_RODAPE}}": 'É a mesma tabela do time que aparece na tela "Hoje".',
    "{{PAUTA_LINK}}": link,
  });
}

export function assuntoDoPulso(equipe: NegocioDaEquipe[]): string {
  const total = Number(equipe[0]?.total_geral ?? equipe.length);
  return total === 1
    ? "1 negócio da equipe pede atenção"
    : `${total} negócios da equipe pedem atenção`;
}

function montarItensDaEquipe(equipe: NegocioDaEquipe[]): string {
  return equipe
    .map((n) => {
      // "Sem mexer há N dias" é o que `dias_parado` mede de verdade: dias desde a última
      // mudança de etapa (ou desde a criação, quando nunca houve uma). Não dizemos "parado há
      // N dias" porque a linha pode estar na lista por não ter próxima ação, com N abaixo do
      // corte — e aí "parado" seria mentira. Com N = 0 a frase inteira sai: "sem mexer há 0
      // dias" não quer dizer nada.
      const dias = n.dias_parado;
      const partes = [
        n.responsavel,
        n.etapa,
        dias !== null && dias >= 1 ? `sem mexer há ${plural(dias, "dia", "dias")}` : null,
      ].filter((p): p is string => Boolean(p && String(p).trim()));

      return preencher(MODELO_ITEM, {
        ITEM_SELO: esc("Pede atenção"),
        ITEM_VALOR: esc(n.valor === null ? "" : BRL.format(Number(n.valor))),
        // 🔴 `esc()` em tudo que vem do banco: nome de negócio e de cliente podem ter `<` ou `&`.
        ITEM_TITULO: esc(n.nome),
        ITEM_DETALHE: esc(partes.length > 0 ? partes.join(" · ") : "Negócio da equipe"),
      });
    })
    .join("\n");
}

/**
 * As contas do drive de catálogos por fabricante.
 *
 * Só função pura aqui, de propósito: é a parte do drive que dá para fixar em teste sem
 * arsenal de renderização — este projeto testa função pura em 18 arquivos e não renderiza
 * componente em nenhum. Os componentes ficam com o compilador e o navegador.
 *
 * Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
 */

/** Rótulos curtos e minúsculos, como a etiqueta do cartão mostra. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * A etiqueta da edição: `set/2026` quando há mês, `2026` quando a fábrica faz catálogo anual.
 *
 * Mês fora de 1–12 cai no ano em vez de virar `undefined/2026`. O banco tem a restrição, mas
 * a tela não é a única porta: linha mexida à mão no painel do Supabase chegaria aqui.
 */
export function rotuloDaEdicao(ano: number, mes: number | null | undefined): string {
  if (mes == null || mes < 1 || mes > 12) return String(ano);
  return `${MESES[mes - 1]}/${ano}`;
}

export interface TemEdicao {
  edicao_ano: number;
  edicao_mes: number | null;
}

/**
 * Ordena da edição mais NOVA para a mais velha. Serve direto ao `Array.prototype.sort`.
 *
 * 🔴 `mes ?? 0` faz o catálogo do ANO se comportar como se fosse de janeiro, então "set/2026"
 * aparece acima de "2026". Sem isso os dois empatam, a ordem fica à mercê da ordem de chegada,
 * e o representante abre a fábrica sem saber qual é a edição vigente — que é exatamente o
 * problema que este drive existe para resolver.
 *
 * ⚠️ O MESMO cuidado precisa existir do lado do banco, e lá ele se escreve diferente: em
 * `order by ... desc` o Postgres põe NULO PRIMEIRO, então a consulta precisa de
 * `nulls last` (`{ nullsFirst: false }` no cliente). Medido em 26/08/2026 — sem isso, "2026"
 * subia acima de "set/2026", o inverso do que este comparador garante.
 */
export function compararPorEdicao(a: TemEdicao, b: TemEdicao): number {
  if (a.edicao_ano !== b.edicao_ano) return b.edicao_ano - a.edicao_ano;
  return (b.edicao_mes ?? 0) - (a.edicao_mes ?? 0);
}

/**
 * Tamanho em português: vírgula decimal, e nunca "NaN" nem "0.00 MB" na tela.
 *
 * Abaixo de um mega mostra em KB inteiros — "0,3 MB" não diz nada a ninguém, "340 KB" diz.
 */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

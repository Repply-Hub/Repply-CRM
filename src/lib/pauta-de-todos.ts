/**
 * "Esta pessoa enxerga a pauta de TODA a equipe?" — a mesma resposta que o banco dá.
 *
 * 🔴 ISTO NÃO PROTEGE NADA (CLAUDE.md §6.1). Quem decide de verdade é
 * `public.ve_pauta_de_todos(uuid)` no Postgres, que a pauta e o painel de risco consultam.
 * Aqui a resposta serve só para a TELA não oferecer um filtro que voltaria vazio nem esconder
 * um que o servidor mandaria preenchido. **Se as duas divergirem, quem manda é o banco** — e a
 * divergência aparece como filtro que existe e não filtra nada, ou como lista que aparece sem o
 * controle para recortá-la.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA, COPIADA DE `public.ve_pauta_de_todos(p_usuario_id uuid)`:
 *
 *   select coalesce(
 *     (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
 *        from permissoes_usuario pu
 *       where pu.usuario_id = p_usuario_id and pu.modulo = 'pedidos'
 *         and pu.funcionalidades ? 'pauta_de_todos'),          -- ← a chave tem que ESTAR GRAVADA
 *     (select u.role in ('gestor','admin','empresa') ...)      -- ← senão, vale o papel
 *   );
 *
 * Duas coisas que o `coalesce` decide, e que é fácil escrever errado:
 *
 *   1. **A chave MANDA sobre o papel.** Gravada como `false` num gestor, ele volta a ver só os
 *      próprios negócios. É por isso que este arquivo NÃO pode usar `usePodeFazer`: aquele hook
 *      começa com `if (ehGestor) return true` sem olhar a linha de permissão — o mesmo defeito
 *      de `has_funcionalidade()` no banco, que a especificação §6.1 proíbe justamente aqui.
 *   2. **Chave AUSENTE não é chave falsa.** O `?` do Postgres exige que a chave exista no JSON.
 *      Hoje é o caso de todo mundo: medido em 07/09/2026, **zero** linhas de
 *      `permissoes_usuario` têm `pauta_de_todos` gravada. Tratar ausência como `false` tiraria
 *      dos 5 gestores da MD a pauta ampliada que o servidor já lhes entrega.
 */

/** Os três papéis que `is_gestor()` aceita, e que o `coalesce` usa quando a chave não está lá. */
export const PAPEIS_COM_PAUTA_DE_TODOS = ['gestor', 'admin', 'empresa'] as const;

/** O mínimo de uma linha de `permissoes_usuario` que esta decisão precisa ler. */
export interface LinhaDePermissao {
  modulo: string;
  funcionalidades?: Record<string, unknown> | null;
}

/** O módulo onde a chave mora. Na tela ele se chama "Negócios"; no banco, `pedidos`. */
const MODULO = 'pedidos';
const CHAVE = 'pauta_de_todos';

/**
 * As duas listas que a entrada de `boolean` do Postgres aceita, na íntegra.
 *
 * Além de `true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0`, o Postgres aceita qualquer **prefixo não
 * ambíguo** das palavras — por isso `t`, `tr`, `tru`, `y`, `ye`, `f`, `fa`, `fal`, `fals` e `n`
 * estão aqui. `o` sozinho fica de fora de propósito: é ambíguo entre `on` e `off`, e o banco o
 * recusa. Maiúscula não diferencia e espaço nas pontas é ignorado — por isso a normalização
 * abaixo faz `trim().toLowerCase()` antes de consultar.
 */
const TEXTOS_VERDADEIROS = new Set(['t', 'tr', 'tru', 'true', 'y', 'ye', 'yes', 'on', '1']);
const TEXTOS_FALSOS = new Set(['f', 'fa', 'fal', 'fals', 'false', 'n', 'no', 'off', '0']);

/**
 * Traduz o valor cru da chave em "sim", "não" ou "não está configurada".
 *
 * `funcionalidades` é `jsonb`, então o que chega no navegador pode não ser booleano mesmo que a
 * tela de permissões só grave booleano — e o `::boolean` do banco é MUITO mais permissivo do que
 * "só `true` e `false`". Medido no próprio Postgres em 07/09/2026:
 *
 *   ('{"k":1}'::jsonb      ->> 'k')::boolean  ->  true
 *   ('{"k":0}'::jsonb      ->> 'k')::boolean  ->  false
 *   ('{"k":"yes"}'::jsonb  ->> 'k')::boolean  ->  true
 *   ('{"k":"t"}'::jsonb    ->> 'k')::boolean  ->  true
 *   ('{"k":"on"}'::jsonb   ->> 'k')::boolean  ->  true
 *   ('{"k":"TRUE"}'::jsonb ->> 'k')::boolean  ->  true
 *
 * Este arquivo existe para reproduzir a função do banco cláusula por cláusula, então ele aceita
 * exatamente o mesmo conjunto — ver `TEXTOS_VERDADEIROS` e `TEXTOS_FALSOS`. O número `1` do JSON
 * entra por aqui também: `->>` o entrega como o texto `'1'`, que o cast aceita.
 *
 * 🔴 **O QUE O POSTGRES RECUSARIA (`'talvez'`, `2`, `''`, `'o'`, objeto, lista) CAI NO PAPEL**,
 * como se a chave não estivesse gravada. É escolha explícita, por dois motivos:
 *
 *   1. **A tela não pode estourar.** Lá o cast levanta `22P02` e derruba a chamada inteira —
 *      `ve_pauta_de_todos` é consultada de dentro de `pauta_do_dia_de`, então o erro apaga a
 *      pauta do dia, não só esta resposta. Não há aqui uma "resposta do banco" para copiar:
 *      o banco não responde, ele falha.
 *   2. **Cair no papel é a resposta menos surpreendente**, porque é a mesma que a pessoa já
 *      recebe hoje — medido em 07/09/2026, **zero** linhas de `permissoes_usuario` têm a chave
 *      gravada, e nenhum escritor produz não-booleano (o `Switch` da matriz manda `boolean`; o
 *      backfill do preset usa `to_jsonb(...)` sobre uma comparação).
 */
function chaveGravada(valor: unknown): boolean | null {
  // `null` e `undefined` (e qualquer objeto ou lista) contam como ausente. No banco vale o
  // mesmo para o `null` do JSON: `funcionalidades ? 'chave'` é verdadeiro, mas `->> 'chave'`
  // devolve NULL e o `coalesce` cai no papel do mesmo jeito.
  if (typeof valor !== 'boolean' && typeof valor !== 'number' && typeof valor !== 'string') {
    return null;
  }
  const texto = String(valor).trim().toLowerCase();
  if (TEXTOS_VERDADEIROS.has(texto)) return true;
  if (TEXTOS_FALSOS.has(texto)) return false;
  return null;
}

/**
 * A resposta final. `permissoes` é a lista crua de `usePermissoes(profile.id)` — todas as linhas
 * da pessoa, de todos os módulos. Lista ausente (ainda carregando, ou consulta recusada) NÃO é
 * lista vazia: ver o comentário de `usePossoVerPautaDeTodos`.
 */
export function vePautaDeTodos(
  papel: string | null | undefined,
  permissoes: LinhaDePermissao[] | null | undefined,
): boolean {
  const doModulo = (permissoes ?? []).find((p) => p.modulo === MODULO);
  const gravada = chaveGravada(doModulo?.funcionalidades?.[CHAVE]);
  if (gravada !== null) return gravada;

  return (PAPEIS_COM_PAUTA_DE_TODOS as readonly string[]).includes(papel ?? '');
}

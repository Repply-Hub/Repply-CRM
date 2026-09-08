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
 * Traduz o valor cru da chave em "sim", "não" ou "não está configurada".
 *
 * `funcionalidades` é `jsonb`, então o que chega no navegador pode não ser booleano mesmo que a
 * tela de permissões só grave booleano. O `::boolean` do banco aceita `'true'`/`'false'` como
 * texto e **estoura `22P02`** em qualquer outra coisa. A tela não pode estourar: valor
 * irreconhecível é tratado como "não configurada" e cai no papel — é a divergência deliberada,
 * e ela só existe num estado que nenhuma tela produz.
 */
function chaveGravada(valor: unknown): boolean | null {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  // `null` dentro do JSON conta como ausente no banco também: `funcionalidades ? 'chave'` é
  // verdadeiro, mas `->> 'chave'` devolve NULL e o `coalesce` cai no papel do mesmo jeito.
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

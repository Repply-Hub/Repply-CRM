/**
 * O vínculo que uma tarefa aberta a partir do painel do negócio nasce carregando: o negócio e o
 * cliente dele. É o que vai em `extraFields` do `TarefaFormDialog`.
 *
 * 🔴 `pedido_id` é OBRIGATÓRIO aqui de propósito. O tipo é metade do conserto: enquanto o painel
 * montava `extraFields={{ pedido_id: pedidoId!, … }}`, o `!` calava o compilador sobre um valor
 * que É nulo quando o painel fecha — e era exatamente esse nulo que gravava a tarefa solta. Com
 * o objeto inteiro sendo `null` ou completo, não existe estado intermediário onde o `pedido_id`
 * some sozinho.
 */
export interface AlvoDaTarefaDoNegocio {
  pedido_id: string;
  /** Nem todo negócio tem cliente; `null` é resposta legítima, `undefined` não. */
  cliente_id: string | null;
}

/**
 * Congela o vínculo da tarefa a partir do negócio que está em mãos AGORA.
 *
 * 🔴 POR QUE ISTO EXISTE, medido na tela e no banco em 10/09/2026. O `extraFields` do painel era
 * lido no momento do ENVIO, não no da abertura — e no meio do caminho o painel podia fechar,
 * zerando `pedidoId` e `negocio`. A tarefa nascia com `pedido_id` E `cliente_id` nulos, e a
 * ficha dela mostrava "NEGÓCIO: —". Chamar isto no clique que ABRE o formulário tira a gravação
 * da dependência de um estado que muda debaixo dela.
 *
 * Devolve `null` quando não há negócio — nunca um objeto pela metade. Quem recebe `null` é o
 * `extraFields`, e `undefined` ali significa "nenhum campo travado", que é o comportamento certo
 * para um formulário aberto de outro lugar.
 *
 * 🔴 `cliente_id ?? null`, nunca `undefined`: `TarefaFormDialog` decide MOSTRAR o campo
 * "Empresa (cliente)" por `extraFields?.cliente_id !== undefined`. Com `undefined` o campo
 * aparecia, mas o `...extraFields` do `handleSave` sobrescrevia a escolha da pessoa com
 * `undefined` na hora de gravar — ou seja, um campo que aceitava o clique e jogava fora a
 * resposta.
 *
 * ⚠️ Correção de 10/09/2026, na revisão: isso NÃO acontecia por "negócio sem cliente", como
 * este comentário chegou a afirmar. `pedidos.cliente_id` é `NOT NULL` e não há uma linha nula
 * na base inteira — negócio sem cliente não existe. O campo aparecia porque **o painel já tinha
 * fechado** e o alvo vinha vazio, que é o próprio defeito que este arquivo conserta. Em todo
 * caso real, o `extraFields` novo e o antigo entregam exatamente os mesmos valores; o `?? null`
 * é cinto de segurança contra o alvo incompleto, não conserto de um dado que falta.
 *
 * 🔴 POR QUE MORA EM `lib/` E NÃO DENTRO DO PAINEL: exportar uma função (não um componente) de
 * um arquivo `.tsx` de componente acende o aviso `react-refresh/only-export-components` do
 * eslint e desliga o recarregamento a quente do painel inteiro em desenvolvimento. Medido em
 * 10/09/2026 — a função nasceu lá e voltou para cá por isso. `src/lib/` é o lugar das funções
 * puras (CLAUDE.md §14), e de quebra o teste passa a importá-la sem arrastar a árvore inteira do
 * componente.
 *
 * Teste: `src/test/tarefa-do-painel-nasce-ligada-ao-negocio.test.ts`.
 */
export function alvoDaTarefaDoNegocio(
  negocio: { id?: string | null; cliente_id?: string | null } | null | undefined,
): AlvoDaTarefaDoNegocio | null {
  if (!negocio?.id) return null;
  return { pedido_id: negocio.id, cliente_id: negocio.cliente_id ?? null };
}

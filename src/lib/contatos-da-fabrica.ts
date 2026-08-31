/**
 * As três regras dos contatos de fábrica que erram em silêncio se ficarem na tela.
 *
 * Funções puras, sem React e sem Supabase — é o que permite testá-las. Este projeto não
 * tem um único teste de componente (48 arquivos de teste, zero `render(` e zero
 * `renderHook`), então regra que fica dentro do `.tsx` não é coberta por nada.
 *
 * Ver docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md.
 */

export interface ContatoDaFabrica {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  principal: boolean;
  funcao_id: string | null;
}

export interface FuncaoDaFabrica {
  id: string;
  nome: string;
  ordem: number;
}

/**
 * Contato sem função vai para o FIM.
 *
 * `Number.MAX_SAFE_INTEGER` é o que garante isso sem espalhar `if` pela comparação — e
 * cobre de brinde o caso do `funcao_id` que aponta para uma função já apagada, que a tela
 * pode ter em cache no instante seguinte à remoção.
 */
function ordemDaFuncao(contato: ContatoDaFabrica, funcoes: FuncaoDaFabrica[]): number {
  if (!contato.funcao_id) return Number.MAX_SAFE_INTEGER;
  const f = funcoes.find((x) => x.id === contato.funcao_id);
  return f ? f.ordem : Number.MAX_SAFE_INTEGER;
}

/**
 * Principal primeiro, depois pela ordem da função, e o empate pelo nome.
 *
 * 🔴 O empate por nome não é capricho. Sem um critério FINAL, a ordem sai como o banco
 * devolver — e ela muda entre consultas, porque o Postgres não garante ordem sem
 * `ORDER BY`. O usuário veria os contatos trocando de lugar sozinhos ao recarregar a
 * ficha, sem nada ter mudado.
 *
 * Devolve um array novo: ordenar no lugar mexeria no cache do TanStack Query, que entrega
 * a mesma referência para todos os componentes que leem a consulta.
 */
export function ordenarContatos(
  contatos: ContatoDaFabrica[],
  funcoes: FuncaoDaFabrica[],
): ContatoDaFabrica[] {
  return [...contatos].sort((a, b) => {
    if (a.principal !== b.principal) return a.principal ? -1 : 1;
    const oa = ordemDaFuncao(a, funcoes);
    const ob = ordemDaFuncao(b, funcoes);
    if (oa !== ob) return oa - ob;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * O que o cartão da fábrica mostra: `Jorge Menezes · Gerente comercial  +3`.
 *
 * Devolve `null` quando não há contato nenhum — e aí o cartão NÃO desenha a linha, como
 * já faz hoje quando `nome_contato` está vazio. Devolver string vazia deixaria um espaço
 * fantasma com o ícone e nada ao lado.
 *
 * Quando ninguém está marcado como principal, usa o primeiro da ordenação em vez de ficar
 * mudo: os 9 contatos migrados nascem principais, mas alguém pode desmarcar ao editar, e
 * o cartão não pode emudecer por causa disso.
 */
export function rotuloDoCartao(
  contatos: ContatoDaFabrica[],
  funcoes: FuncaoDaFabrica[],
): string | null {
  if (contatos.length === 0) return null;
  const [primeiro, ...resto] = ordenarContatos(contatos, funcoes);
  const funcao = funcoes.find((f) => f.id === primeiro.funcao_id);
  const base = funcao ? `${primeiro.nome} · ${funcao.nome}` : primeiro.nome;
  return resto.length > 0 ? `${base}  +${resto.length}` : base;
}

/**
 * O que precisa ser gravado ao marcar alguém como principal.
 *
 * 🔴 Devolve TAMBÉM o desmarque do anterior, e ele vem PRIMEIRO na lista.
 *
 * O banco tem índice único parcial (`fabricante_contatos_um_principal`) e recusa dois
 * principais na mesma fábrica. Mandar só "marca este" faz a gravação ser recusada — e
 * erro do Supabase não é um `Error` (é `{message, details, hint, code}`), então
 * `e instanceof Error` dá falso justamente para esse caso e a tela cai na frase genérica,
 * escondendo o que o banco explicou (CLAUDE.md §4.6).
 *
 * A ordem também importa na gravação: marcar antes de desmarcar bate no índice único no
 * meio do caminho, mesmo que o resultado final fosse válido.
 *
 * Devolve lista vazia quando não há o que mudar, para a tela não gravar à toa.
 */
export function aoMarcarPrincipal(
  contatos: ContatoDaFabrica[],
  idAlvo: string,
): { id: string; principal: boolean }[] {
  const alvo = contatos.find((c) => c.id === idAlvo);
  if (!alvo || alvo.principal) return [];

  const anterior = contatos.find((c) => c.principal && c.id !== idAlvo);
  const mudancas: { id: string; principal: boolean }[] = [];
  if (anterior) mudancas.push({ id: anterior.id, principal: false });
  mudancas.push({ id: idAlvo, principal: true });
  return mudancas;
}

/**
 * A lógica do @ — pura, sem React, para ser testada sem tela.
 *
 * 🔴 A MENÇÃO É A PESSOA ESCOLHIDA NA LISTA, NÃO O NOME ESCRITO (decisão do dono do
 * produto, 11/09/2026). O texto guarda "@Ângela Souza" para ser legível em qualquer
 * lugar, mas quem é avisado sai de `escolhidos` — por id. Duas "Ana" ou alguém que
 * mudou de nome não confundem nada. Se a pessoa apagar o "@Nome" antes de enviar, a
 * menção cai.
 */

export interface PessoaMencionavel {
  id: string;
  nome: string;
  avatar_url?: string | null;
}

export interface MencaoEmCurso {
  /** O que foi digitado depois do "@", até o cursor. */
  consulta: string;
  /** Posição do "@" no texto. */
  inicio: number;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function detectarMencao(texto: string, cursor: number): MencaoEmCurso | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(texto.slice(0, cursor));
  if (!m) return null;
  return { consulta: m[1], inicio: cursor - m[1].length - 1 };
}

export function filtrarPessoas(
  pessoas: readonly PessoaMencionavel[],
  consulta: string,
  limite = 8,
): PessoaMencionavel[] {
  const q = semAcento(consulta.trim());
  if (!q) return pessoas.slice(0, limite);
  const comeca = (p: PessoaMencionavel) => semAcento(p.nome).startsWith(q);
  return pessoas
    .filter((p) => semAcento(p.nome).includes(q))
    .sort((a, b) => Number(!comeca(a)) - Number(!comeca(b)))
    .slice(0, limite);
}

export function inserirMencao(
  texto: string,
  m: MencaoEmCurso,
  rotulo: string,
): { texto: string; cursor: number } {
  const antes = texto.slice(0, m.inicio);
  const depois = texto.slice(m.inicio + 1 + m.consulta.length);
  const insercao = `@${rotulo} `;
  return { texto: antes + insercao + depois, cursor: antes.length + insercao.length };
}

const RE_TODOS = /(?:^|\s)@(?:todos|all)(?=$|[\s.,;:!?])/i;

export function mencionadosNoTexto(
  texto: string,
  escolhidos: ReadonlyMap<string, string>,
): { ids: string[]; todos: boolean } {
  const ids = [...escolhidos].filter(([, nome]) => texto.includes(`@${nome}`)).map(([id]) => id);
  return { ids, todos: RE_TODOS.test(texto) };
}

/** A opção "@todos" aparece enquanto o que foi digitado ainda pode virar "todos" ou "all". */
export function consultaCasaComTodos(consulta: string): boolean {
  const q = semAcento(consulta);
  return 'todos'.startsWith(q) || 'all'.startsWith(q);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parte o texto nos trechos "@Nome" dos mencionados, para a tela destacar. O nome mais
 * longo é tentado primeiro ("@Ana Souza" antes de "@Ana"), e o nome precisa
 * terminar ali ("@Anabela" não é "@Ana").
 */
export function partesComMencao(
  texto: string,
  nomes: readonly string[],
  todos: boolean,
): Array<{ texto: string; mencao: string | null }> {
  const alvos = [...new Set(nomes.filter(Boolean))].sort((a, b) => b.length - a.length).map(escaparRegex);
  if (todos) alvos.push('todos', 'all');
  if (alvos.length === 0) return [{ texto, mencao: null }];

  const re = new RegExp(`@(${alvos.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const partes: Array<{ texto: string; mencao: string | null }> = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i), mencao: null });
    const nome = m[1];
    const ehTodos = /^(todos|all)$/i.test(nome) && todos;
    partes.push({ texto: m[0], mencao: ehTodos ? 'todos' : nome });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), mencao: null });
  return partes;
}

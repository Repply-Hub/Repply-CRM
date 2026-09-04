/**
 * Quem é contato de qual cliente — a regra, num lugar só.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 04/09/2026 a regra estava copiada e escrita à mão em três pontos
 * (`ContatoDetalhe.tsx`, e duas vezes em `ClienteDetalhe.tsx`), e nos três ela comparava o TEXTO do
 * nome da empresa: `c.empresa === cliente.empresa`. Medido em produção: **casava em 0 de 2.013
 * contatos**. Os contatos vieram da importação sem acento ("LMT Construcoes") e os clientes têm
 * acento ("Construções") — nomes que a gente lê como iguais e o computador lê como diferentes.
 *
 * O estrago era silencioso e grande: a ficha do contato mostrava zero negócios, zero tarefas e
 * nenhuma obra marcável; a ficha do cliente mostrava o bloco "Contatos Adicionais" **vazio nas 2.176
 * fichas**; e a lista de "vincular contato existente" oferecia todo mundo, inclusive quem já estava
 * vinculado — que é como nasce cadastro duplicado.
 *
 * A chave `contatos.cliente_id` sempre esteve lá, preenchida em 1.556 dos 2.013.
 *
 * 🔴 AS DUAS LISTAS SÃO COMPLEMENTARES POR CONSTRUÇÃO. Foi o que quebrou antes: mexer numa e
 * esquecer a outra faz um contato aparecer nas duas ao mesmo tempo, ou em nenhuma. Elas vivem neste
 * arquivo lado a lado, com teste que prova a complementaridade, para não se separarem de novo.
 */

/** O mínimo que este módulo precisa saber de um contato. */
export interface ContatoComVinculo {
  cliente_id?: string | null;
}

/** O mínimo que este módulo precisa saber de um cliente. */
export interface ClienteIdentificavel {
  id: string;
}

/**
 * O cliente (a construtora) a que este contato pertence.
 *
 * Devolve `undefined` quando o contato não tem vínculo — que é o estado de 456 contatos hoje, e é
 * uma resposta legítima, não um erro. Quem chama deve mostrar "sem empresa", nunca inventar uma.
 */
export function clienteDoContato<T extends ClienteIdentificavel>(
  clientes: T[] | undefined | null,
  contato: ContatoComVinculo | undefined | null,
): T | undefined {
  const chave = contato?.cliente_id;
  if (!chave) return undefined;
  return (clientes ?? []).find((c) => c.id === chave);
}

/** Os contatos que pertencem a este cliente. */
export function contatosDoCliente<T extends ContatoComVinculo>(
  contatos: T[] | undefined | null,
  clienteId: string | undefined | null,
): T[] {
  if (!clienteId) return [];
  return (contatos ?? []).filter((c) => c.cliente_id === clienteId);
}

/**
 * Os contatos que NÃO pertencem a este cliente — os candidatos a vincular.
 *
 * Contato sem vínculo nenhum entra aqui de propósito: ele é justamente quem mais precisa ser
 * vinculado a alguém.
 */
export function contatosForaDoCliente<T extends ContatoComVinculo>(
  contatos: T[] | undefined | null,
  clienteId: string | undefined | null,
): T[] {
  if (!clienteId) return contatos ?? [];
  return (contatos ?? []).filter((c) => c.cliente_id !== clienteId);
}

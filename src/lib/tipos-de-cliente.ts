/**
 * Funcoes puras do campo "Tipo" do cadastro de cliente.
 *
 * Ficam fora do hook de proposito: assim dao para testar sem mockar o Supabase, e
 * a tela de Clientes pode usar as mesmas regras que o hook usa.
 *
 * `clientes.tipo` e TEXTO LIVRE. A lista de `clientes_tipos` governa o dropdown e o
 * rotulo -- nunca a integridade. Por isso `rotuloDoTipo` sempre tem um caminho de
 * saida para um valor que nao esta na lista.
 */

export interface TipoDeCliente {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

/** Mesma regra que a tela usava antes de a lista ir para o banco. */
export function slugDeTipo(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Cai no proprio valor quando o slug nao esta na lista. Isso e o que mantem legivel
 * o cliente gravado com um tipo que o gestor removeu depois -- e os 19 tipos
 * proprios da MD, que sao rotulo e slug ao mesmo tempo.
 */
export function rotuloDoTipo(
  slug: string,
  tipos: Pick<TipoDeCliente, 'slug' | 'nome'>[],
): string {
  return tipos.find(t => t.slug === slug)?.nome ?? slug;
}

/** Vazio enquanto a lista nao carregou -- o Select fica sem selecao, nao com lixo. */
export function tipoPadrao(tipos: Pick<TipoDeCliente, 'slug'>[]): string {
  return tipos[0]?.slug ?? '';
}

/**
 * Opcoes do FILTRO = a lista da empresa + os tipos realmente gravados que nao estao
 * nela. Sem essa soma, um cliente com tipo fora da lista (importacao, ou tipo
 * removido depois) fica inalcancavel pelo filtro -- defeito que ja existiu e foi
 * consertado antes.
 */
export function opcoesDeFiltro(
  tipos: Pick<TipoDeCliente, 'slug' | 'nome'>[],
  slugsEmUso: string[],
): { value: string; label: string }[] {
  const daLista = tipos.map(t => ({ value: t.slug, label: t.nome }));
  const conhecidos = new Set(tipos.map(t => t.slug));
  const orfaos = Array.from(new Set(slugsEmUso))
    .filter(s => s && !conhecidos.has(s))
    .sort()
    .map(s => ({ value: s, label: s }));
  return [...daLista, ...orfaos];
}

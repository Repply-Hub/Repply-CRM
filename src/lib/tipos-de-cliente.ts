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
 * Decide CPF x CNPJ. O valor gravado no banco tem DUAS grafias: 'pessoa_fisica' (o slug
 * usado pelo codigo) e 'pessoa fisica', com espaco e sem acento -- e o que a importacao
 * de planilha produz, e o que 129 clientes da MD tem gravado hoje. Comparar so com
 * '===' contra uma das duas formas deixa a outra caindo em CNPJ por engano.
 * Reaproveita `slugDeTipo` (mesma normalizacao de acento e separador) em vez de escrever
 * outra regra: as duas grafias, e qualquer variacao de caixa, normalizam para o mesmo slug.
 *
 * `slug ?? ''` porque `cliente.tipo` pode chegar nulo (linha antiga, importacao
 * incompleta) e o projeto esta com strictNullChecks desligado -- nada barra a chamada em
 * tempo de compilacao. Sem a guarda, o '.toLowerCase()' de slugDeTipo estoura TypeError e
 * derruba a ficha do cliente inteira, em vez de so cair no caminho de CNPJ.
 */
export function ehPessoaFisica(slug: string): boolean {
  return slugDeTipo(slug ?? '') === 'pessoa_fisica';
}

/**
 * Decide o que fazer com uma renomeacao de tipo, ANTES de chamar o banco.
 *
 * useCriarTipoDeCliente ja barra nome repetido ('Esse tipo ja existe'); renomear nao
 * barrava nada, e o banco tambem nao -- so ha UNIQUE (empresa_id, slug), nada sobre
 * `nome`. Sem essa checagem, o gestor podia renomear "Loja" para "Construtora" com um
 * tipo "Construtora" ja existindo, e os dois Selects passavam a mostrar duas opcoes com
 * o MESMO rotulo e significados diferentes, sem como distinguir.
 *
 * 🔴 ARMADILHA que uma guarda ingenua cai: a migration semeou `nome = slug` para toda
 * empresa que ja existia. Entao a primeira renomeacao legitima de "construtora" e para
 * "Construtora" -- o nome novo, normalizado, e IGUAL ao slug do PROPRIO tipo. Por isso
 * a comparacao aqui:
 *   - compara NOME com NOME (nunca nome com slug -- o slug nem entra nesta funcao);
 *   - IGNORA o proprio tipo que esta sendo renomeado (filtra por `id`, nao por nome);
 *   - usa `slugDeTipo` so para COMPARAR (maiuscula/minuscula e acento nao contam como
 *     tipo diferente), nunca para decidir o que grava -- quem grava e o hook, com o
 *     texto exatamente como foi digitado.
 * Assim "construtora" -> "Construtora" no proprio tipo passa (mudou so a caixa, e
 * renomeacao valida), mas "Loja" -> "Construtora" com outro tipo chamado "Construtora"
 * cai como duplicado.
 */
export function decidirRenomeacao(
  nomeDigitado: string,
  tipoAtual: Pick<TipoDeCliente, 'id' | 'nome'>,
  tipos: Pick<TipoDeCliente, 'id' | 'nome'>[],
): 'vazio' | 'sem-mudanca' | 'duplicado' | 'renomear' {
  const nome = nomeDigitado.trim();
  if (!nome) return 'vazio';
  if (nome === tipoAtual.nome) return 'sem-mudanca';

  const slugNovo = slugDeTipo(nome);
  const colide = tipos.some(
    t => t.id !== tipoAtual.id && slugDeTipo(t.nome) === slugNovo,
  );
  if (colide) return 'duplicado';

  return 'renomear';
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

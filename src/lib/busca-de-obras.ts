/**
 * A barra de busca da tela de Obras, num lugar só.
 *
 * Antes ela olhava quatro campos (nome, endereço, cliente, marcador) e comparava texto cru.
 * O pedido foi cobrir "o endereço, o CNPJ, etc, todos os campos": a obra tem três campos de
 * texto fixos (nome_obra, spe_cnpj, endereco_entrega) e dois que vêm por vínculo (o nome do
 * cliente e o nome do marcador). São esses cinco que esta busca cobre.
 *
 * 🔴 E os campos PERSONALIZADOS, que cada empresa cria: eles entram, mas só os que a empresa
 * de fato CONFIGUROU — a lista de chaves vem de fora, em `chavesPersonalizadas`.
 *
 * Varrer `obras.campos_extras` inteiro seria o caminho óbvio e estaria errado. Medido na base
 * em 27/08/2026: 80 das 82 obras têm `campos_extras` preenchido, e o conteúdo NÃO é da
 * empresa — é registro de migração escrito pelo próprio sistema, com chaves `migracao` e
 * `duplicata_suspeita`, guardando coisas como o nome do cliente de ORIGEM do cadastro. Buscar
 * ali faria "Casapop" devolver obras que não são da Casapop, e ainda exporia anotação interna
 * de migração como se fosse dado da obra. (Campos configurados para obras hoje: 32 linhas,
 * TODAS `origem = 'padrao'` — nenhuma empresa criou campo personalizado ainda. Então hoje esta
 * lista chega vazia e nada muda; no dia que alguém criar um, ele passa a achar sozinho.)
 *
 * O que este arquivo resolve não é "somar campos" — é fazer os campos ACHAREM.
 */

export interface ObraParaBusca {
  nome_obra?: string | null;
  spe_cnpj?: string | null;
  endereco_entrega?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_at?: string | null;
  clientes?: { empresa?: string | null } | null;
  marcador?: { nome?: string | null } | null;
  /**
   * Os campos personalizados da empresa. Ver o cabeçalho: só as chaves configuradas entram.
   *
   * 🔴 `unknown` e não `Record<string, unknown>`: no banco a coluna é `jsonb`, e o tipo gerado
   * do Supabase a declara como `Json` — que também aceita texto, número e lista soltos. Um
   * molde estreito aqui parece mais seguro e na prática só obriga quem chama a mentir com um
   * `as`, e aí a mentira vale para o objeto inteiro. Melhor aceitar tudo e conferir dentro.
   */
  campos_extras?: unknown;
}

/**
 * 🔴 Sem tirar o acento, "Sao Jose" não acha "Residencial São José" — e metade das obras da MD
 * tem acento no nome. Quem digita rápido não põe acento, e a pessoa concluiria que a obra
 * não está cadastrada. NFD separa a letra do acento; o intervalo ̀-ͯ é o acento
 * solto, que é o que se joga fora.
 */
function normalizarTexto(valor?: string | null): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function apenasDigitos(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * A busca é um pedaço de número de documento?
 *
 * 🔴 Aqui mora a decisão que evita o falso positivo bobo. O CNPJ é gravado com pontuação
 * ("12.345.678/0001-90") e as pessoas buscam de três jeitos: colando com pontuação, digitando
 * só os números ("12345678000190"), ou digitando um pedaço ("0001-90", "12345"). Comparar
 * texto cru acerta SÓ o primeiro caso — o campo entraria na busca e continuaria não achando
 * nada, que é pior do que não ter, porque a pessoa conclui que a obra não existe. Então
 * comparamos também dígito-com-dígito.
 *
 * Mas essa limpeza só pode valer para o CNPJ, e só quando o que foi digitado É um número.
 * Se aplicássemos a limpeza aos outros campos, o endereço "Rua 25 de Março, 100" viraria
 * "25100" e casaria com a busca "25100" — dois números que a pessoa nunca juntou. E se
 * aceitássemos qualquer busca que contenha 2 dígitos, "rua 25" iria comparar "25" contra os
 * dígitos de todos os CNPJs e traria obras de endereço nenhum.
 *
 * A regra que ficou: só entra na comparação por dígitos a busca que, tirados os separadores
 * que a máscara de CNPJ usa (ponto, barra, hífen, espaço), sobra SÓ dígito — e pelo menos
 * dois deles. Um dígito sozinho casaria com quase todo CNPJ e não filtra nada.
 */
function buscaPareceNumeroDeDocumento(buscaNormalizada: string): boolean {
  const semSeparadoresDeMascara = buscaNormalizada.replace(/[.\-/\s]/g, '');
  return /^\d{2,}$/.test(semSeparadoresDeMascara);
}

/**
 * Achou? Busca vazia acha tudo.
 *
 * `chavesPersonalizadas` são as chaves de `campos_extras` que a empresa configurou como campo
 * visível. Só elas são varridas — ver o cabeçalho para o porquê de não varrer o resto.
 */
export function obraBateComBusca(
  obra: ObraParaBusca,
  busca: string,
  chavesPersonalizadas?: string[] | null,
): boolean {
  const termo = normalizarTexto(busca);

  // Busca vazia (ou só espaços) não é um filtro: é a tela em repouso, mostrando tudo.
  if (!termo) return true;

  // A lista pode ter buraco (junção que não veio, item removido em outra aba). Obra que não
  // existe não bate com nada, mas também não pode derrubar a tela inteira.
  if (!obra) return false;

  const camposDeTexto = [
    obra.nome_obra,
    obra.spe_cnpj,
    obra.endereco_entrega,
    obra.clientes?.empresa,
    obra.marcador?.nome,
  ];

  if (camposDeTexto.some((campo) => normalizarTexto(campo).includes(termo))) return true;

  // Os campos personalizados que a empresa configurou. O valor pode ser número, booleano ou
  // objeto (o formulário grava o que o tipo do campo pedir), daí o `String()` — e por isso
  // objeto vira "[object Object]", que não casa com busca nenhuma e é o resultado certo:
  // campo estruturado não é texto para procurar dentro.
  const extras =
    obra.campos_extras && typeof obra.campos_extras === 'object' && !Array.isArray(obra.campos_extras)
      ? (obra.campos_extras as Record<string, unknown>)
      : null;

  if (chavesPersonalizadas?.length && extras) {
    for (const chave of chavesPersonalizadas) {
      const valor = extras[chave];
      if (valor === null || valor === undefined) continue;
      if (typeof valor === 'object') continue;
      if (normalizarTexto(String(valor)).includes(termo)) return true;
    }
  }

  // A segunda passada, só no CNPJ: dígito contra dígito, ignorando a pontuação dos dois lados.
  if (buscaPareceNumeroDeDocumento(termo)) {
    const digitosDoCnpj = apenasDigitos(obra.spe_cnpj);
    if (digitosDoCnpj && digitosDoCnpj.includes(apenasDigitos(termo))) return true;
  }

  return false;
}

export function filtrarObrasPorBusca<T extends ObraParaBusca>(
  obras: T[] | null | undefined,
  busca: string,
  chavesPersonalizadas?: string[] | null,
): T[] {
  if (!obras) return [];

  // 🔴 Busca vazia devolve a lista INTEIRA, nunca vazia. E devolve o mesmo array, não uma
  // cópia: a tela guarda isto num `useMemo`, e um array novo a cada render faria a lista de
  // obras (e o mapa junto) se redesenharem sem nada ter mudado.
  if (!normalizarTexto(busca)) return obras;

  return obras.filter((obra) => obraBateComBusca(obra, busca, chavesPersonalizadas));
}

/**
 * A obra ficou sem ponto no mapa: o serviço de endereço JA TENTOU e não achou.
 * Não confundir com "ainda não tentou" (geocoded_at nulo), que é estado passageiro.
 */
export function obraSemEnderecoNoMapa(obra: ObraParaBusca): boolean {
  if (!obra) return false;

  // `geocoded_at` é o carimbo da tentativa. Vazio quer dizer "a fila ainda não chegou nela" —
  // 🔴 contar essa obra como "sem endereço" acusaria de defeituoso um cadastro que está só
  // esperando, e a pessoa sairia corrigindo endereço que não tem nada de errado.
  const jaTentouGeocodificar = !!String(obra.geocoded_at ?? '').trim();
  if (!jaTentouGeocodificar) return false;

  // Comparação com `null` explícita, e não `!obra.latitude`: latitude 0 é coordenada válida
  // (a linha do Equador) e cairia como falsa num teste de "vazio".
  return obra.latitude == null || obra.longitude == null;
}

export function filtrarSemEndereco<T extends ObraParaBusca>(obras: T[] | null | undefined): T[] {
  if (!obras) return [];
  return obras.filter((obra) => obraSemEnderecoNoMapa(obra));
}

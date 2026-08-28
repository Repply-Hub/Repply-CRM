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
 *
 * ---
 *
 * 28/08/2026 — o pedido voltou pedindo "o endereço e suas partes: logradouro, número,
 * bairro, cidade, UF, CEP". **Essas partes não existem como coluna.** A tabela `obras` tem
 * onze colunas, e de endereço há UMA só: `endereco_entrega`, texto livre. Quem quiser
 * "cidade" está procurando um pedaço de dentro dessa frase. Conferido na base em
 * 28/08/2026: os 82 endereços estão gravados cada um de um jeito — "Natal/RN", "Natal - RN",
 * "Natal, RN", "Natal Rio Grande do Norte".
 *
 * Isso é o que decidiu as duas mudanças desta rodada:
 *
 * 1. **A busca virou "E" de palavras.** Antes o texto digitado era comparado inteiro, como
 *    um pedaço contínuo — então "natal tirol" não achava nada, porque no endereço o bairro
 *    vem antes da cidade, e "solar natal" não achava a obra Solar que fica em Natal, porque
 *    o nome está num campo e a cidade em outro. Agora cada PALAVRA precisa aparecer em
 *    algum campo, podendo ser em campos diferentes. É "E" e não "OU" pelo motivo prático:
 *    quem digita mais palavras está tentando REFINAR. Com "OU", digitar mais devolveria
 *    MAIS obras — o oposto do que a pessoa quer, e o jeito mais rápido de fazer a busca
 *    parecer quebrada.
 *
 * 2. **O CEP entrou**, com o mesmo cuidado de máscara que o CNPJ já tinha. Ver `CEP_NO_TEXTO`.
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
/**
 * Exportada porque a aba Visitas usa a MESMA barra de busca desta tela e precisa casar do
 * mesmo jeito. Até 28/08/2026 ela tinha um `toLowerCase().includes()` próprio: digitar "sao"
 * achava a obra na lista e não achava a visita da mesma obra, com a mesma palavra, na aba do
 * lado. Uma barra que responde de dois jeitos conforme a aba é pior que uma barra ruim.
 */
export function normalizarTexto(valor?: string | null): string {
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
 * Um CEP dentro de um texto qualquer.
 *
 * 🔴 O CEP quebra igual ao CNPJ, mas ao contrário: aqui é o BANCO que tem os dois formatos,
 * porque o CEP não mora em campo próprio — ele veio digitado no meio do endereço. Medido nos
 * 82 endereços da MD em 28/08/2026: uns guardam "59064-430" e outros "59014020", sem hífen,
 * na mesma coluna. Quem confere um CEP completo com hífen não acha o cadastro que foi
 * digitado sem, e vice-versa — e conclui que a obra não está cadastrada.
 *
 * Só o CEP INTEIRO precisa desta passada. Um pedaço ("59020") é substring literal das duas
 * grafias e a comparação de texto já o acha sozinha.
 *
 * A regra é estreita de propósito: cinco dígitos, no máximo um separador, três dígitos, com
 * fronteira de palavra dos dois lados. **A fronteira é o que segura o falso positivo.** Sem
 * ela, os 14 dígitos seguidos de um CNPJ sem máscara — que é como os 78 CNPJs desta base
 * estão gravados — teriam um "CEP" lido lá no meio, e buscar um CEP acharia obra por causa
 * do documento dela. Separador com espaço também ficou de fora: "1500 530" num endereço
 * ("número 1500, algo 530") viraria CEP sem nunca ter sido um.
 */
const CEP_NO_TEXTO = /\b(\d{5})[-.]?(\d{3})\b/g;

function cepsDoTexto(valor: string): string[] {
  const achados: string[] = [];
  for (const achado of valor.matchAll(CEP_NO_TEXTO)) achados.push(achado[1] + achado[2]);
  return achados;
}

/**
 * Todo o texto pelo qual esta obra pode ser achada, já normalizado, num array só.
 *
 * Montar isto UMA vez por obra (em vez de normalizar campo a campo dentro de cada
 * comparação) é o que segura o custo agora que a busca tem várias palavras: sem isso, uma
 * busca de quatro palavras normalizaria os mesmos cinco campos quatro vezes, a cada tecla
 * digitada, para cada obra da lista.
 */
function textosDaObra(obra: ObraParaBusca, chavesPersonalizadas?: string[] | null): string[] {
  const textos = [
    obra.nome_obra,
    obra.spe_cnpj,
    // O endereço inteiro num campo só: logradouro, número, bairro, cidade, UF e CEP estão
    // todos aqui dentro. Não há coluna separada para nenhum deles — ver o cabeçalho.
    obra.endereco_entrega,
    obra.clientes?.empresa,
    obra.marcador?.nome,
  ].map(normalizarTexto);

  // Os campos personalizados que a empresa configurou. O valor pode ser número, booleano ou
  // objeto (o formulário grava o que o tipo do campo pedir), daí o `String()` — e por isso
  // objeto fica de fora: campo estruturado não é texto para procurar dentro, e incluí-lo só
  // acrescentaria "[object Object]", que não casa com busca nenhuma.
  const extras =
    obra.campos_extras && typeof obra.campos_extras === 'object' && !Array.isArray(obra.campos_extras)
      ? (obra.campos_extras as Record<string, unknown>)
      : null;

  if (chavesPersonalizadas?.length && extras) {
    for (const chave of chavesPersonalizadas) {
      const valor = extras[chave];
      if (valor === null || valor === undefined) continue;
      if (typeof valor === 'object') continue;
      textos.push(normalizarTexto(String(valor)));
    }
  }

  // Campo vazio não ajuda a achar nada e ainda seria comparado a cada palavra digitada.
  return textos.filter(Boolean);
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
 *
 * A mesma regra passou a valer para o CEP (28/08/2026) e, de quebra, é o ponto onde a busca
 * decide NÃO quebrar o que foi digitado em palavras: número colado é uma coisa só.
 */
function buscaPareceNumeroDeDocumento(buscaNormalizada: string): boolean {
  const semSeparadoresDeMascara = buscaNormalizada.replace(/[.\-/\s]/g, '');
  return /^\d{2,}$/.test(semSeparadoresDeMascara);
}

/**
 * Achou? Busca vazia acha tudo.
 *
 * São dois caminhos, e o primeiro que se aplica decide sozinho: número colado (CNPJ ou CEP)
 * ou palavras. Ver os comentários dentro da função.
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

  const textos = textosDaObra(obra, chavesPersonalizadas);

  /**
   * Caminho do DOCUMENTO: o que foi digitado é um número inteiro, colado — um CNPJ ou um CEP.
   *
   * 🔴 Ele vem antes da quebra em palavras, e é isso que impede o CNPJ copiado de PDF
   * ("12 345 678 0001 90", com espaço no lugar da pontuação) de ser lido como cinco palavras
   * soltas. Como cinco palavras, "12", "345" e "678" casariam cada uma por conta própria
   * dentro de quase qualquer CNPJ da base, e a busca devolveria obras que não têm nada a ver.
   */
  if (buscaPareceNumeroDeDocumento(termo)) {
    // Primeiro do jeito mais simples: o número como texto, do jeito que foi digitado. É o que
    // acha "0001-90" dentro de um CNPJ gravado com máscara.
    if (textos.some((texto) => texto.includes(termo))) return true;

    const digitosDaBusca = apenasDigitos(termo);

    // Dígito contra dígito, ignorando a pontuação dos dois lados. Vale só para o CNPJ — ver
    // `buscaPareceNumeroDeDocumento` para o porquê de não valer para os outros campos.
    const digitosDoCnpj = apenasDigitos(obra.spe_cnpj);
    if (digitosDoCnpj && digitosDoCnpj.includes(digitosDaBusca)) return true;

    // E o CEP completo, que pode estar gravado com ou sem hífen no meio do endereço.
    if (digitosDaBusca.length === 8) {
      if (textos.some((texto) => cepsDoTexto(texto).includes(digitosDaBusca))) return true;
    }

    return false;
  }

  /**
   * Caminho do TEXTO: cada palavra precisa aparecer em ALGUM campo — não necessariamente no
   * mesmo. É o que faz "solar natal" achar a obra cujo nome tem "Solar" e cujo endereço tem
   * "Natal", e o que faz "natal tirol" achar o endereço que escreve o bairro antes da cidade.
   *
   * `every` é a decisão de ser "E": cada palavra a mais aperta o resultado. Ver o cabeçalho.
   */
  const palavras = termo.split(/\s+/).filter(Boolean);

  return palavras.every((palavra) => textos.some((texto) => texto.includes(palavra)));
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

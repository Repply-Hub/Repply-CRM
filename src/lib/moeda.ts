/**
 * Dinheiro em português do Brasil — uma regra só para o sistema inteiro.
 *
 * Este arquivo não inventa nada: é o formatador que já rodava em produção no
 * campo de meta de venda (`formatMetaInputDisplay` / `parseMetaInputValue` /
 * `numberToMetaDisplay`, antes presos dentro de PlanoVendasSection.tsx), tirado
 * de lá para que o campo de meta e o campo de valor do negócio passem a ser
 * literalmente o mesmo código. Se um dia um for corrigido, o outro é corrigido
 * junto.
 *
 * POR QUE ISTO EXISTE (o estrago que motivou):
 * três negócios foram gravados mil vezes maiores que o certo — o pior deles
 * 106.387.320,00 no lugar de 106.387,32 — e nada na tela indicava erro. A causa
 * é `parseFloat`, que é função de padrão americano: `parseFloat('99.888,47')`
 * devolve 99.888 porque para na vírgula. Nunca leia dinheiro com `parseFloat`;
 * use `parseMoedaBRL`.
 *
 * DUAS REGRAS DIFERENTES, DE PROPÓSITO:
 * - `formatarDigitacaoMoeda` (a cada tecla) trata o ponto SEMPRE como separador
 *   de milhar e o descarta. Tem que ser assim porque o texto que volta do campo
 *   já contém os pontos que nós mesmos colocamos: apagar o último dígito de
 *   "1.234" entrega "1.23", que não pode virar "um vírgula vinte e três".
 * - `normalizarSeparadoresMoeda` (texto COLADO, vindo de planilha, e-mail ou
 *   WhatsApp) decide ponto x vírgula pelo que aparece por último, igual ao que o
 *   importador de planilha já faz em importPedidosUtils.ts.
 */

/**
 * Agrupa milhar com ponto sem passar por `Number`. Feito em texto de propósito:
 * com muitos dígitos digitados, converter para número antes de formatar perde
 * precisão e o campo passa a mostrar um valor que ninguém digitou.
 */
function agruparMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Separa o sinal negativo do resto. Só reconhece o "-" no começo do texto —
 * menos no meio de um valor não significa nada e é descartado adiante.
 */
function separarSinal(bruto: string, permitirNegativo: boolean): { negativo: boolean; corpo: string } {
  if (!permitirNegativo) return { negativo: false, corpo: bruto };
  const negativo = bruto.trimStart().startsWith('-');
  return { negativo, corpo: negativo ? bruto.replace('-', '') : bruto };
}

/**
 * Exibição pronta: `R$ 1.234,56`.
 *
 * É a mesma linha que estava copiada 26 vezes em 16 arquivos. Vazio e nulo
 * viram `R$ 0,00` porque é o que todas as cópias já faziam — trocar isso agora
 * mudaria número em painel.
 */
export function formatarMoedaBRL(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Resolve ponto x vírgula de um texto vindo de FORA (colado, importado).
 * Regra: se vierem os dois, o ÚLTIMO é o decimal.
 *
 * Devolve texto no padrão brasileiro cru — só dígitos e, no máximo, uma vírgula.
 * Não use na digitação: veja o cabeçalho do arquivo.
 */
export function normalizarSeparadoresMoeda(bruto: string, casas = 2): string {
  const limpo = (bruto ?? '').replace(/[^\d.,]/g, '');
  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');

  if (temPonto && temVirgula) {
    return limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '') //                    1.234,56 — padrão BR
      : limpo.replace(/,/g, '').replace('.', ','); //  1,234.56 — padrão EUA
  }

  if (temPonto) {
    const depoisDoPonto = limpo.slice(limpo.lastIndexOf('.') + 1);
    const umPontoSo = limpo.split('.').length === 2;
    // "1234.56" tem cara de centavo; "1.234" e "1.234.567" têm cara de milhar.
    //
    // O teto é `casas`, não 2 fixo, e isso não é detalhe: num campo de QUANTIDADE
    // (3 casas) a planilha americana escreve "0.750", e a regra de 2 dígitos lia
    // isso como milhar — 0,75 virava 750, mil vezes maior. Como `preco_total` é
    // coluna gerada (quantidade x preço) e `pedidos.valor_total` é a soma dela, o
    // negócio inteiro ficava mil vezes maior. É a mesma família do 106.387.320,00
    // que motivou este arquivo, só que entrando pela colagem.
    //
    // O que continua ambíguo, e não tem como resolver sem adivinhar: colar
    // "1.500" num campo de 3 casas é lido como 1,5. Quem quiser mil e quinhentos
    // digita, ou cola sem o ponto. Formato não carrega essa informação.
    return umPontoSo && depoisDoPonto.length > 0 && depoisDoPonto.length <= casas
      ? limpo.replace('.', ',')
      : limpo.replace(/\./g, '');
  }

  return limpo;
}

/**
 * Formata enquanto a pessoa digita, a cada tecla.
 *
 * @param casas 2 para dinheiro; 3 para quantidade (`itens_pedido.quantidade` é
 *              numeric(10,3), para quem vende por metro quadrado ou quilo).
 * @param permitirNegativo desligado por padrão — nenhum campo de dinheiro do
 *              sistema aceita valor negativo.
 */
export function formatarDigitacaoMoeda(bruto: string, casas = 2, permitirNegativo = false): string {
  const { negativo, corpo } = separarSinal(bruto ?? '', permitirNegativo);
  const limpo = corpo.replace(/[^\d,]/g, '');
  const [inteiro, ...decimais] = limpo.split(',');
  const digitos = (inteiro ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const inteiroFormatado = digitos ? agruparMilhar(digitos) : '';
  const sinal = negativo ? '-' : '';

  // A vírgula recém-digitada precisa sobreviver ("1.234," a caminho de
  // "1.234,5"). Sem isso ela sumiria embaixo do dedo de quem está escrevendo.
  if (decimais.length > 0) {
    const digitosDecimais = decimais.join('').replace(/\D/g, '').slice(0, casas);
    return `${sinal}${inteiroFormatado || '0'},${digitosDecimais}`;
  }

  return inteiroFormatado ? `${sinal}${inteiroFormatado}` : sinal;
}

/**
 * Texto do campo → número puro, que é o que vai para o banco.
 *
 * Aceita o que o usuário digita ("1.234,56", "1234,56", "0,"), o que ele cola
 * ("R$ 1.234,56", "1234.56", "1,234.56") e vazio.
 *
 * Campo vazio devolve `null`, NÃO zero: zero é um valor que alguém escolheu,
 * vazio é ausência de escolha — e o banco distingue os dois.
 */
export function parseMoedaBRL(bruto: string, casas = 2, permitirNegativo = false): number | null {
  const { negativo, corpo } = separarSinal(bruto ?? '', permitirNegativo);
  // `casas` NÃO é repassado aqui, de propósito. Esta função lê o texto que JÁ
  // está no campo, e esse texto foi escrito pela nossa própria máscara — nele o
  // ponto é sempre separador de milhar. Repassar `casas` faria "1.500" num campo
  // de 3 casas (mil e quinhentas unidades, agrupadas por nós) ser lido como 1,5.
  // A adivinhação ponto x vírgula só vale para texto vindo de FORA, e o único
  // caminho que traz texto de fora é a colagem — que chama a normalização direto,
  // com `casas`.
  const limpo = normalizarSeparadoresMoeda(corpo);
  if (!/\d/.test(limpo)) return null;

  const [inteiro, ...decimais] = limpo.split(',');
  const digitosInteiros = (inteiro ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const digitosDecimais = decimais.join('').replace(/\D/g, '').slice(0, casas);
  const valor = Number(digitosDecimais ? `${digitosInteiros}.${digitosDecimais}` : digitosInteiros);

  if (!Number.isFinite(valor)) return null;
  return negativo ? -valor : valor;
}

/**
 * Número vindo do banco → texto formatado do campo.
 *
 * Valor REDONDO não ganha casa decimal à toa: 1234 vira "1.234", não
 * "1.234,00". É o comportamento que o campo de meta já tem em produção.
 *
 * Valor QUEBRADO em dinheiro mostra as duas casas: 1234.5 vira "1.234,50".
 * Antes virava "1.234,5", porque a função cortava todo zero à direita — e um
 * negócio de R$ 1.234,50 aberto como "1.234,5" faz quem confere contra o pedido
 * ou a nota ler uma casa faltando e entender 1.234,05. Esconder centavo é
 * exatamente a confusão que este campo nasceu para eliminar.
 *
 * @param completarDecimais completar as casas é comportamento de DINHEIRO, não
 *              de quantidade — por isso o padrão sai de `casas === 2`. Com
 *              `casas = 3` (metro quadrado, quilo) o corte tem que continuar:
 *              uma quantidade de 1,5 escrita como "1,500" é PIOR que o defeito
 *              original, porque brasileiro lê "1,500" e pensa em mil e
 *              quinhentos. Quem chama para dinheiro ganha o comportamento novo
 *              sem mudar nada; quem chama para quantidade continua cortando.
 *
 * Valor negativo é mostrado com o sinal mesmo quando o campo não deixa digitar
 * negativo: se um dia existir um no banco, esconder seria pior que mostrar.
 */
export function numeroParaCampoMoeda(
  n: number | null | undefined,
  casas = 2,
  completarDecimais = casas === 2,
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';

  const negativo = n < 0;
  // `toLocaleString` e não `toFixed`: os dois arredondam diferente em valor que
  // cai no meio do centavo, porque `toFixed` olha o binário exato e o `Intl` olha
  // a representação decimal curta. Meio centavo deixou de ser hipótese quando a
  // quantidade passou a aceitar casa quebrada: 0,5 x R$ 629,13 = 314,565, e o
  // campo mostrava 314,56 enquanto "Preço Total" e "Total dos Itens", na MESMA
  // tela, mostravam R$ 314,57 — que é também o que o banco guarda. Usando o mesmo
  // formatador de `formatarMoedaBRL`, os três passam a concordar sempre.
  const [inteiro, decimal = ''] = Math.abs(n)
    .toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
      useGrouping: false,
    })
    .split(',');

  // Decimal inteiramente zero some inteiro, nos dois modos: é o valor redondo
  // ficando limpo. Só quando existe algum dígito significativo é que a decisão
  // acima entra em cena.
  const temDecimalSignificativo = /[1-9]/.test(decimal);
  let decimalExibido = '';
  if (temDecimalSignificativo) {
    decimalExibido = completarDecimais ? decimal : decimal.replace(/0+$/, '');
  }

  const texto = decimalExibido
    ? `${agruparMilhar(inteiro)},${decimalExibido}`
    : agruparMilhar(inteiro);

  return negativo ? `-${texto}` : texto;
}

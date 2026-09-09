import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * O painel de detalhe do negócio existe UMA vez, em `PainelDoNegocio.tsx`.
 *
 * 🔴 O BUG QUE ISTO IMPEDE, e ele já aconteceu neste projeto. A ficha da empresa e a ficha do
 * contato tinham, cada uma, a sua própria cópia do painel de negócios. As duas divergiram, e o
 * conserto de uma nunca alcançava a outra — a da empresa tinha colunas, filtros, ordenação e
 * paginação; a do contato tinha uma tabela fixa de cinco linhas com um botão que não levava a
 * negócio nenhum. A saída foi juntar as duas num componente só (commit `3069249d`, 06/09/2026).
 *
 * É a mesma lição da leitura de planilha (CLAUDE.md §7.14, e o teste vizinho
 * `uma-leitura-de-planilha-so.test.ts`): **o conserto certo no arquivo errado não conserta
 * nada**, e nenhum teste de comportamento percebe uma segunda cópia — cada uma passa nos seus
 * próprios testes. Só um teste estrutural, como este, vê a segunda nascer.
 *
 * SE ESTE TESTE FALHOU: o caminho certo é montar
 * `<PainelDoNegocio pedidoId={…} onClose={…} />`, não desenhar um `Sheet` novo. Se o arquivo
 * acusado for legítimo — alguém que usa as duas marcas para outra coisa —, acrescente-o a
 * `PODEM_TER_AS_DUAS_MARCAS` com o motivo escrito, em vez de afrouxar a marca.
 */

const RAIZ = join(process.cwd(), 'src');

/**
 * As duas marcas juntas, e por que elas denunciam uma cópia.
 *
 * `CabecalhoDoPainel` só aparece em quem desenha a casca de um painel lateral, e
 * `PedidoWithRelations` só em quem lida com um negócio completo (com as relações embutidas).
 * Separadas, as duas são legítimas em vários lugares — o painel de Obras usa a primeira, a tela
 * de Negócios e `use-pedidos.ts` usam a segunda. Juntas no mesmo arquivo, significam painel de
 * detalhe de negócio desenhado à mão.
 *
 * 🔴 Achado 🟠 A2 da revisão da Tarefa 1: a marca original era `usePedidoPorId`, e ela só pega
 * quem COPIA o arquivo (busca o negócio por conta própria). Uma segunda cópia que receba o
 * negócio PRONTO por `prop` — o caminho que `negocioJaCarregado` tornou natural — não chamaria
 * `usePedidoPorId` e passaria batido. `PedidoWithRelations` pega os dois caminhos: quem busca E
 * quem recebe pronto precisam do formato completo do negócio.
 */
const MARCAS = ['CabecalhoDoPainel', 'PedidoWithRelations'];

/** Quem pode ter as duas marcas, e por quê. Hoje, só o próprio painel. */
const PODEM_TER_AS_DUAS_MARCAS = ['components/pedidos/PainelDoNegocio.tsx'];

/* ---------------------------------------------------------------------------------------------
 * A SEGUNDA MARCA — a cópia POBRE, que a de cima não pega.
 *
 * 🔴 O BURACO QUE ISTO FECHA (achado 🟠 A2 da revisão do Plano A, 09/09/2026). A marca de cima
 * pega quem COPIA o painel: quem busca o negócio ou recebe o formato completo. Ela não pegou a
 * TERCEIRA cópia, que viveu meses dentro de `PainelDeNegocios.tsx` — um diálogo com nome, obra,
 * fabricante, valor, data, etapa e observações, e mais nada. Ela era pobre demais para ter as
 * marcas procuradas: não buscava o negócio nem recebia `PedidoWithRelations`, desenhava o que já
 * estava na linha da tabela. E é assim que a cópia nasce na prática — ninguém copia o painel
 * inteiro, alguém improvisa um detalhe mais pobre com o que tem na mão.
 *
 * A marca abaixo mede DUAS coisas diferentes da de cima:
 *
 * 1. **O BLOCO, não o arquivo.** Recorta o corpo de cada `<Dialog>` / `<Sheet>` / `<Drawer>` e
 *    conta lá dentro. Medir o arquivo inteiro faz qualquer tela que tenha uma tabela de negócios
 *    E, noutro canto, um diálogo de confirmação, casar à toa. Medido na revisão: as marcas "por
 *    arquivo" acusavam de 5 a 11 arquivos legítimos; esta acusa um.
 * 2. **Só campo que SÓ um negócio tem.** Fora ficam `nome_obra`, `endereco_entrega`,
 *    `observacoes` e `campos_extras` — obra e cliente também os têm, e medindo foi de lá que veio
 *    todo o alarme falso (`Obras.tsx` e `ClienteDetalhe.tsx` casavam só por causa deles).
 *
 * 🔴 O QUE ESTA MARCA NÃO PEGA — dito com todas as letras, porque guarda que se anuncia perfeito
 * engana o próximo leitor:
 *
 *   - É varredura de TEXTO, não entendimento do código. Uma quarta cópia ainda mais pobre (só
 *     nome e valor: 2 campos) passa batido. Baixar o LIMITE para 2 traz o ruído de volta.
 *   - `const { valor_total } = negocio` faz o `.valor_total` sumir e a marca não casa. Medido:
 *     hoje ninguém escreve assim nesta base — mas é o jeito de escapar sem querer.
 *   - Um detalhe de negócio desenhado FORA de sobreposição, embutido no meio de uma página, não é
 *     pego nem por esta marca nem pela de cima.
 *   - O recorte do bloco é `indexOf('</Tag>')` a partir da abertura: com sobreposições ANINHADAS
 *     do mesmo tipo, o corpo medido para de cedo. Erra para o lado seguro (mede menos, não mais).
 * ------------------------------------------------------------------------------------------ */

/** Campos que SÓ um negócio tem. */
const CAMPOS_DO_NEGOCIO = [
  /\.valor_total\b/, /\.prazo_resposta\b/, /\.data_pedido\b/, /\.pdf_url\b/,
  /\.origem_lead\b/, /\.funil_id\b/, /\.marcador\b/, /getNomeNegocio\(/,
];
const SOBREPOSICOES = ['Dialog', 'Sheet', 'Drawer'];
/** Quantos campos do negócio no mesmo bloco já significam "isto é um detalhe de negócio". */
const LIMITE = 3;

/**
 * Quantos campos do negócio o MAIOR bloco de sobreposição deste arquivo lê.
 *
 * A abertura casa `<Dialog` seguido de espaço ou `>`, nunca `<DialogContent` — senão o recorte
 * começaria no filho e o corpo medido seria menor que o de verdade.
 */
function camposNoPiorBloco(texto: string): number {
  let pior = 0;
  for (const tag of SOBREPOSICOES) {
    const abertura = new RegExp('<' + tag + '[\\s>]', 'g');
    let m: RegExpExecArray | null;
    while ((m = abertura.exec(texto)) !== null) {
      const fim = texto.indexOf('</' + tag + '>', m.index);
      if (fim === -1) continue;
      const corpo = texto.slice(m.index, fim);
      pior = Math.max(pior, CAMPOS_DO_NEGOCIO.filter((r) => r.test(corpo)).length);
    }
  }
  return pior;
}

/**
 * Quem pode desenhar campos de negócio dentro de uma sobreposição, e por quê.
 *
 * `ImportPedidosDialog` é o ÚNICO falso positivo desta marca em todo o `src/` (medido em
 * 09/09/2026 sobre os 406 arquivos de código): ele casa por `data_pedido` + `pdf_url` +
 * `marcador` porque é a PRÉVIA DA IMPORTAÇÃO — mostra o que vai entrar no banco antes de gravar,
 * lendo as colunas da planilha e não um negócio que existe. É exceção estável: um diálogo de
 * importação não vira detalhe de negócio. Mesmo espírito do `PODEM_LER_PLANILHA` do teste vizinho
 * `uma-leitura-de-planilha-so.test.ts` — a lista é para quem usa as marcas para OUTRA coisa.
 */
const PODEM_DESENHAR_O_NEGOCIO = [
  'components/pedidos/PainelDoNegocio.tsx',       // é ele
  'components/pedidos/ImportPedidosDialog.tsx',   // prévia da importação: mostra o que VAI entrar
];

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, achados);
    } else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe('o painel do negócio é uma peça só', () => {
  // 🟡 Achado A7 da revisão da Tarefa 2 (09/09/2026): este teste falhou por tempo limite (5s,
  // o padrão do Vitest) rodando junto com a suíte inteira, e passou em 226ms sozinho.
  // Diagnóstico medido, não suposto: a varredura em si (`readdirSync`/`readFileSync` síncronos
  // sobre uns 400 arquivos de `src/`) é o que fica lento sob concorrência, não o tempo limite
  // sendo curto demais em termos absolutos — 5s é generoso para um teste unitário comum. Medido
  // nesta máquina: ~130ms em Node puro isolado, ~226-320ms via Vitest isolado, e 651ms rodando
  // junto com os outros 84 arquivos de teste (Windows, disco síncrono disputado com os outros
  // processos). O CÓDIGO tinha uma causa extra e evitável: os dois `it()` abaixo repetiam a
  // MESMA varredura, cada um lendo os ~400 arquivos de novo — dobrando à toa o tempo gasto em
  // disco. `beforeAll` faz a varredura rodar 1 vez por arquivo de teste, não 2, cortando pela
  // metade a exposição ao tempo limite sem tirar cobertura nenhuma (nenhuma pasta ficou de fora:
  // os dois testes continuam vendo TODO `src/`).
  //
  // Mesmo depois do corte, a varredura ainda é synchronous I/O sobre centenas de arquivos — uma
  // categoria diferente de teste unitário comum, e sensível a quanto os OUTROS arquivos de teste
  // estão disputando disco/CPU no momento. Por isso o tempo limite deste bloco é maior que o
  // padrão: não é "afrouxar" o teste (a asserção continua a mesma), é dar à varredura a folga que
  // a natureza dela pede. `beforeAll` tem timeout próprio no Vitest (`hookTimeout`, também 5s por
  // padrão) — por isso o terceiro argumento vai nele, não nos `it()` (que não tocam mais em disco
  // e continuam rápidos).
  const TEMPO_LIMITE_DA_VARREDURA_MS = 20_000;

  let comAsDuasMarcas: string[];
  let desenhamONegocioNumaSobreposicao: string[];

  beforeAll(() => {
    // UMA leitura por arquivo, as duas marcas medidas na mesma passada. Ler os ~400 arquivos duas
    // vezes é exatamente o que o achado A7 acima mandou parar de fazer.
    const duasMarcas: string[] = [];
    const desenhamONegocio: string[] = [];
    for (const caminho of arquivosDeCodigo(RAIZ)) {
      const texto = readFileSync(caminho, 'utf8');
      const relativo = relative(RAIZ, caminho).split('\\').join('/');
      if (MARCAS.every((marca) => texto.includes(marca))) duasMarcas.push(relativo);
      if (camposNoPiorBloco(texto) >= LIMITE) desenhamONegocio.push(relativo);
    }
    comAsDuasMarcas = duasMarcas;
    desenhamONegocioNumaSobreposicao = desenhamONegocio;
  }, TEMPO_LIMITE_DA_VARREDURA_MS);

  it('🔴 só PainelDoNegocio.tsx monta o painel de detalhe do negócio', () => {
    const permitidos = new Set(PODEM_TER_AS_DUAS_MARCAS);
    const culpados = comAsDuasMarcas.filter((relativo) => !permitidos.has(relativo));

    expect(culpados).toEqual([]);
  });

  it('o painel que a lista de permitidos aponta existe de verdade', () => {
    // Sem isto, renomear ou mover `PainelDoNegocio.tsx` deixaria o teste acima passando por
    // vazio — nenhum arquivo teria as duas marcas, e a segunda cópia entraria sem ninguém ver.
    expect(comAsDuasMarcas).toEqual(PODEM_TER_AS_DUAS_MARCAS);
  });

  it('🔴 ninguém desenha o detalhe do negócio à mão dentro de uma sobreposição', () => {
    // Este é o guarda contra a cópia POBRE — a que a marca de cima não pega. Ver o bloco de
    // comentário sobre CAMPOS_DO_NEGOCIO, inclusive o que ele ainda NÃO alcança.
    //
    // SE ESTE TESTE FALHOU: monte `<PainelDoNegocio pedidoId={…} onClose={…} />` em vez de
    // desenhar os campos à mão. Se o arquivo acusado usa esses campos para OUTRA coisa que não
    // mostrar um negócio existente, acrescente-o a `PODEM_DESENHAR_O_NEGOCIO` com o motivo
    // escrito — nunca afrouxe o LIMITE nem tire campo da lista.
    const permitidos = new Set(PODEM_DESENHAR_O_NEGOCIO);
    const culpados = desenhamONegocioNumaSobreposicao.filter((relativo) => !permitidos.has(relativo));

    expect(culpados).toEqual([]);
  });

  it('a lista de permitidos da segunda marca não tem nome morto', () => {
    // Mesmo raciocínio do teste acima do painel: um permitido que deixou de casar (arquivo
    // renomeado, ou que parou de desenhar o negócio) precisa SAIR da lista. Deixá-lo ali abre uma
    // exceção para um caminho que ninguém mais confere.
    expect([...desenhamONegocioNumaSobreposicao].sort()).toEqual([...PODEM_DESENHAR_O_NEGOCIO].sort());
  });
});

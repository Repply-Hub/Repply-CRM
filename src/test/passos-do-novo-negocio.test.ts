import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 POR QUE ESTE TESTE EXISTE.
 *
 * O assistente de Novo Negócio tem dois passos, e QUAL CAMPO PERTENCE A QUAL PASSO não está
 * escrito no código: vem do texto gravado em `configuracoes_campos.etapa`, por empresa,
 * comparado literalmente em `NovoNegocioDialog.tsx`. Só o texto exato
 * `'Valor e orçamento'` cai no passo 2 — e o filtro do passo 1 é o COMPLEMENTO disso, um
 * pega-tudo. Então etapa velha, etapa com acento errado ou etapa nula: tudo cai no passo 1.
 *
 * Esse texto vive em três lugares que nada obriga a concordar:
 *
 *   1. a coluna `etapa`, semeada por `criar_configuracoes_campos_padrao()` no banco;
 *   2. o rótulo do passo 2 na tela;
 *   3. a comparação da validação.
 *
 * Nada no build ligava os três. O resultado, medido:
 *
 *   26/08/2026  o campo "Anexar PDF" mudou do passo 1 para o passo 2 na TELA. A configuração
 *               não foi junto, e o passo 1 passou a exigir um campo que só existe no passo 2.
 *               Botão "Próximo" apagado, sem mensagem. Conserto: migration 20260826234500,
 *               que no próprio texto se chama "a TERCEIRA vez" que este código tropeça no
 *               mesmo buraco.
 *   27/08/2026  o mesmo bug voltou sozinho, e ninguém mexeu em nada. Aquela migration
 *               consertou as LINHAS das 8 empresas existentes e não tocou a FUNÇÃO que
 *               monta essas linhas quando nasce empresa. As duas empresas criadas depois
 *               (uma delas cliente pagante) nasceram com a tela de criar negócio travada, e
 *               assim ficaram por quatro dias.
 *
 * A quarta vez é a que este arquivo existe para impedir. Ele lê o SQL e o TSX e reprova
 * quando os dois deixam de concordar — que é a única coisa que nunca foi verificada.
 *
 * NÃO confere no banco de propósito: não há banco local neste ambiente (CLAUDE.md §6.8).
 * O que dá para garantir aqui é que o que SERÁ semeado combina com o que a tela sabe ler.
 *
 * ⚠️ E não escreva aqui nada que dependa de o botão "Próximo" estar sempre desabilitado:
 * existe uma fresta real — enquanto a configuração não chega do servidor, a lista vem vazia
 * e nada é obrigatório. O contrato que este teste guarda é o dos TEXTOS, não o do botão.
 */

const RAIZ = process.cwd();
const MIGRATIONS = join(RAIZ, 'supabase', 'migrations');
const DIALOGO = join(RAIZ, 'src', 'components', 'pedidos', 'NovoNegocioDialog.tsx');

/** As duas únicas etapas que o assistente sabe interpretar. Qualquer outra cai no passo 1 —
 *  inclusive uma que o autor achava que fosse do passo 2. */
const ETAPAS_CONHECIDAS = ['Informações do Negócio', 'Valor e orçamento'] as const;

/** Campos que a função semeia e que de propósito NÃO aparecem no mapa de valores da tela.
 *  Hoje está vazia, e esse é o estado saudável: campo semeado sem lugar na tela é
 *  exatamente o defeito que derrubou as empresas novas (`itens`). Só acrescente nome aqui
 *  junto com o motivo — e desconfie de si mesmo ao fazê-lo. */
const SEMEADOS_SEM_CAMPO_NA_TELA: string[] = [];

/**
 * A ÚLTIMA definição da função, não a primeira.
 *
 * `create or replace` reescreve a função inteira, e migration não se edita (CLAUDE.md §6.3):
 * a versão que vale é a do arquivo de nome mais alto. Como o nome começa com a data e
 * `readdirSync` devolve em ordem alfabética, o último da lista é o mais recente.
 *
 * É a mesma armadilha que `gate-de-plano.test.ts` documenta: a primeira versão daquele teste
 * procurava por nome de arquivo e congelou numa lista velha, continuando verde enquanto lia
 * o passado.
 */
function ultimaDefinicaoDaFuncao(): { arquivo: string; corpo: string } {
  const arquivos = readdirSync(MIGRATIONS)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nome) => ({ nome, conteudo: readFileSync(join(MIGRATIONS, nome), 'utf-8') }))
    .filter((a) => /function\s+public\.criar_configuracoes_campos_padrao/i.test(a.conteudo));

  // Nunca devolver "nada encontrado" como lista vazia: isso faria o teste passar verde sem
  // ter lido coisa alguma, que é o modo de falha mais perigoso de um teste como este.
  if (arquivos.length === 0) {
    throw new Error(
      'Nenhuma migration define criar_configuracoes_campos_padrao(). Este teste perdeu o alvo — ' +
        'a função foi renomeada ou removida, e o contrato entre o SQL e a tela ficou sem guarda.',
    );
  }

  const ultimo = arquivos[arquivos.length - 1];
  return { arquivo: ultimo.nome, corpo: ultimo.conteudo };
}

interface CampoSemeado {
  campoKey: string;
  etapa: string | null;
}

/**
 * Extrai as tuplas de `entidade = 'pedidos'` semeadas pela função.
 *
 * Formato de cada linha, com os apóstrofos do SQL:
 *   (NEW.id, 'pedidos', 'padrao', 'anexo_pdf', 'Anexar PDF', true, 9, 'Valor e orçamento'),
 *
 * A etapa é o último literal antes do fecha-parênteses, e pode ser NULL (as entidades
 * `contatos` e `obras` semeiam assim) — por isso os dois ramos.
 */
function camposSemeadosDePedidos(corpo: string): CampoSemeado[] {
  const linhas = corpo.split('\n').filter((l) => /\(NEW\.id,\s*'pedidos'/i.test(l));
  return linhas.map((linha) => {
    const literais = [...linha.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
    // literais = [entidade, origem, campo_key, label?, ..., etapa?]
    const campoKey = literais[2];
    const etapa = /,\s*NULL\s*\)/i.test(linha) ? null : (literais[literais.length - 1] ?? null);
    return { campoKey, etapa };
  });
}

/**
 * O ponto do arquivo onde o passo 1 acaba e o passo 2 começa.
 *
 * O formulário inteiro é um ternário `{step === 1 ? ( … ) : ( … )}`. Existem outros ternários
 * aninhados dentro dele (e um segundo, do rodapé, que decide qual botão aparece), então não
 * dá para pegar o primeiro `) : (` que aparecer.
 *
 * O critério que resiste: entre a abertura do formulário e a do rodapé, o `) : (` do ternário
 * de FORA é o de menor indentação — os de dentro estão, por construção, mais recuados. Se
 * houver empate, este teste não adivinha: ele quebra e pede olho humano.
 */
function fronteiraDosPassos(tsx: string): { fronteira: number; fimDoFormulario: number } {
  const aberturas = [...tsx.matchAll(/\{step === 1 \? \(/g)].map((m) => m.index!);
  if (aberturas.length < 2) {
    throw new Error(
      'Esperava dois `{step === 1 ? (` em NovoNegocioDialog.tsx (o formulário e o rodapé) e achei ' +
        `${aberturas.length}. A estrutura da tela mudou; este teste precisa ser reapontado.`,
    );
  }
  const [inicioFormulario, fimDoFormulario] = aberturas;

  const candidatos = [...tsx.matchAll(/\n( *)\) : \(/g)]
    .filter((m) => m.index! > inicioFormulario && m.index! < fimDoFormulario)
    .map((m) => ({ pos: m.index!, indent: m[1].length }));
  if (candidatos.length === 0) {
    throw new Error('Não achei o `) : (` que separa os dois passos do formulário.');
  }

  const menor = Math.min(...candidatos.map((c) => c.indent));
  const externos = candidatos.filter((c) => c.indent === menor);
  if (externos.length > 1) {
    throw new Error(
      `Achei ${externos.length} candidatos a fronteira dos passos com a mesma indentação. ` +
        'Ambíguo demais para decidir sozinho — confira NovoNegocioDialog.tsx à mão.',
    );
  }
  return { fronteira: externos[0].pos, fimDoFormulario };
}

/**
 * Em qual passo o campo é DESENHADO na tela.
 *
 * O marcador é a própria chamada `obrigatorio('<campo_key>'`, que existe exatamente no ponto
 * onde o rótulo do campo é montado — ou seja, é o marcador que não pode dessincronizar do
 * campo, porque é parte dele.
 */
function passoOndeOCampoEDesenhado(tsx: string, campoKey: string): 1 | 2 | null {
  const { fronteira, fimDoFormulario } = fronteiraDosPassos(tsx);
  const marca = `obrigatorio('${campoKey}'`;
  const posicoes: number[] = [];
  for (let i = tsx.indexOf(marca); i !== -1; i = tsx.indexOf(marca, i + 1)) posicoes.push(i);

  const noFormulario = posicoes.filter((p) => p < fimDoFormulario);
  if (noFormulario.length === 0) return null;
  return noFormulario.every((p) => p > fronteira) ? 2 : 1;
}

/** As chaves do mapa `valoresPadrao` do assistente — o que a tela sabe preencher. */
function chavesDoMapaDeValores(tsx: string): string[] {
  const inicio = tsx.indexOf('const valoresPadrao');
  if (inicio === -1) {
    throw new Error(
      'Não achei `const valoresPadrao` em NovoNegocioDialog.tsx. O mapa foi renomeado ou movido; ' +
        'este teste precisa ser reapontado antes de voltar a valer alguma coisa.',
    );
  }
  const fim = tsx.indexOf('\n    };', inicio);
  const bloco = tsx.slice(inicio, fim === -1 ? undefined : fim);
  return [...bloco.matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]);
}

describe('os dois passos do Novo Negócio: o SQL e a tela têm de concordar', () => {
  const { arquivo, corpo } = ultimaDefinicaoDaFuncao();
  const semeados = camposSemeadosDePedidos(corpo);
  const tsx = readFileSync(DIALOGO, 'utf-8');

  it(`achou os campos de pedidos semeados em ${arquivo}`, () => {
    // Se o formato do INSERT mudar, o extrator devolve lista vazia e todos os testes abaixo
    // passariam sem verificar nada. Este é o cinto contra isso.
    expect(semeados.length).toBeGreaterThan(5);
    expect(semeados.every((c) => !!c.campoKey)).toBe(true);
  });

  it('toda etapa semeada é uma das duas que o assistente sabe interpretar', () => {
    const desconhecidas = semeados.filter(
      (c) => c.etapa !== null && !ETAPAS_CONHECIDAS.includes(c.etapa as never),
    );
    // Falha típica: um passo é renomeado na tela e a função continua semeando o nome antigo.
    // Foi assim que `valor_manual` ficou em 'Itens do Negócio' depois de 26/08/2026.
    expect(
      desconhecidas.map((c) => `${c.campoKey} -> ${c.etapa}`),
      'etapa semeada que a tela não reconhece: ela cai no passo 1 em silêncio',
    ).toEqual([]);
  });

  it('os dois nomes de etapa existem literalmente na tela, com os mesmos acentos', () => {
    // A comparação em produção é de texto puro. Um acento perdido de um lado só não quebra
    // nada visível — apenas move o campo de passo, sem aviso.
    for (const etapa of ETAPAS_CONHECIDAS) {
      expect(tsx.includes(etapa), `"${etapa}" sumiu de NovoNegocioDialog.tsx`).toBe(true);
    }
  });

  it('todo campo semeado tem onde ser preenchido na tela', () => {
    const naTela = new Set(chavesDoMapaDeValores(tsx));
    const semLugar = semeados
      .map((c) => c.campoKey)
      .filter((k) => !naTela.has(k) && !SEMEADOS_SEM_CAMPO_NA_TELA.includes(k));
    // Este é o teste que teria pego `itens`: semeado com interruptor de obrigatório em
    // Configurações → Campos, e sem campo nenhum em passo nenhum para satisfazê-lo. Ligado,
    // trava criar E editar negócio para sempre.
    expect(
      semLugar,
      'campo semeado que a tela não sabe preencher: marcado obrigatório, trava o assistente sem saída',
    ).toEqual([]);
  });

  it('cada campo é semeado no MESMO passo em que a tela o desenha', () => {
    // 🔴 ESTE É O TESTE QUE PEGA O BUG DE 26/08 E O DE 27/08.
    //
    // Os outros três olham para etapa desconhecida ou campo sem tela. O defeito que travou a
    // PR & Cocentino não é nenhum dos dois: 'Informações do Negócio' é uma etapa perfeitamente
    // válida — só não para ESTE campo, que é desenhado no passo 2. Mover um campo de passo na
    // tela sem mover a semeadura junto é o erro que já se repetiu, e é exatamente isto aqui.
    const divergentes = semeados
      .map((c) => ({
        campo: c.campoKey,
        semeadoNoPasso: c.etapa === 'Valor e orçamento' ? 2 : 1,
        desenhadoNoPasso: passoOndeOCampoEDesenhado(tsx, c.campoKey),
      }))
      // Campo que a tela não desenha em passo nenhum já é reprovado pelo teste anterior; não
      // vale reprovar duas vezes pela mesma causa.
      .filter((r) => r.desenhadoNoPasso !== null && r.desenhadoNoPasso !== r.semeadoNoPasso)
      .map((r) => `${r.campo}: semeado no passo ${r.semeadoNoPasso}, desenhado no passo ${r.desenhadoNoPasso}`);

    expect(
      divergentes,
      'campo cobrado num passo e preenchível em outro: o botão fica apagado sem mensagem nenhuma',
    ).toEqual([]);
  });
});

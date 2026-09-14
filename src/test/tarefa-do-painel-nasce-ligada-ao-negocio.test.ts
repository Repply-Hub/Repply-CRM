import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alvoDaTarefaDoNegocio } from '@/lib/alvo-da-tarefa-do-negocio';

/**
 * Tarefa aberta pelo botão "Nova Tarefa" do painel nasce PRESA ao negócio.
 *
 * 🔴 O DEFEITO QUE ISTO IMPEDE, conferido na tela e no banco em 10/09/2026. O primeiro clique
 * dentro do formulário de tarefa fechava o painel do negócio; com o painel fechado, `pedidoId`
 * virava nulo, e o `extraFields` — que só é lido no momento do ENVIO — gravava a tarefa com
 * `pedido_id` E `cliente_id` nulos. A ficha da tarefa mostrava "NEGÓCIO: —".
 *
 * Medido, antes do conserto:
 *
 *     titulo                                    | pedido_id | cliente_id
 *     "ZZ TESTE PLANO D T1 - ANTES do conserto" | null      | null
 *
 * 🔴 POR QUE ISSO É PRÉ-REQUISITO, e não arrumação. A fila da tela "Hoje" esconde o negócio que
 * tem tarefa aberta casando `tarefas.pedido_id = pedidos.id`, e a promessa escrita lá é que
 * QUALQUER tarefa aberta esconde — venha de onde vier. Tarefa que nasce solta não casa com nada,
 * e o sistema passa a ter duas regras conforme o caminho pelo qual a tarefa nasceu.
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** COBRE, dito com todas as letras. Ele não simula o clique nem o
 * navegador: o caminho real do defeito (um `pointerdown` num portal fora da árvore do painel,
 * atravessando o `DismissableLayer` do Radix) não existe no jsdom, e montar o painel inteiro
 * pediria servidor, sessão e as sete consultas que ele dispara. O que sobra aqui é o CONTRATO:
 *
 *   1. a função que monta o vínculo nunca devolve objeto pela metade (testes de comportamento);
 *   2. o `extraFields` do painel não volta a depender de um valor que pode ser nulo no envio;
 *   3. a defesa do painel contra o clique-fora continua existindo e continua condicionada.
 *
 * A prova de que o painel PARA de fechar foi feita na tela, com `data-state` lido no navegador
 * antes e depois — está no relatório da tarefa, não aqui.
 *
 * SE ESTE TESTE FALHOU: não afrouxe a asserção. O caminho certo é congelar o vínculo no clique
 * que abre o formulário (`alvoDaTarefaDoNegocio`) e manter o `onInteractOutside` do painel.
 */

const PAINEL = readFileSync(
  join(process.cwd(), 'src', 'components', 'pedidos', 'PainelDoNegocio.tsx'),
  'utf8',
);

/**
 * O mesmo arquivo, sem comentário nenhum.
 *
 * ⚠️ Não é firula: o painel EXPLICA o defeito citando a forma que o causou
 * (`pedidoId!` dentro de `extraFields`), e sem esta limpeza a asserção abaixo acusaria o próprio
 * comentário que existe para ensinar. Aconteceu na primeira rodada deste teste. Documentar o
 * erro não pode custar o guarda contra ele.
 *
 * A limpeza é grosseira de propósito — só precisa apagar prosa, não entender o código.
 */
const PAINEL_SO_CODIGO = PAINEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('o alvo da tarefa é congelado no clique, nunca lido no envio', () => {
  it('devolve o negócio e o cliente quando há negócio em mãos', () => {
    expect(alvoDaTarefaDoNegocio({ id: 'ped-1', cliente_id: 'cli-1' })).toEqual({
      pedido_id: 'ped-1',
      cliente_id: 'cli-1',
    });
  });

  it('🔴 devolve null — nunca um objeto sem negócio — quando o negócio sumiu', () => {
    // Este é o caso do defeito: o painel fechou e o negócio virou nada. Devolver
    // `{ pedido_id: null }` aqui seria repetir o bug com outro nome — o `TarefaFormDialog`
    // esconde o campo "Negócio" sempre que a chave `pedido_id` EXISTE em `extraFields`, mesmo
    // valendo nulo. A pessoa ficaria sem o campo e sem o vínculo.
    expect(alvoDaTarefaDoNegocio(null)).toBeNull();
    expect(alvoDaTarefaDoNegocio(undefined)).toBeNull();
    expect(alvoDaTarefaDoNegocio({})).toBeNull();
    expect(alvoDaTarefaDoNegocio({ id: null, cliente_id: 'cli-1' })).toBeNull();
    expect(alvoDaTarefaDoNegocio({ id: '', cliente_id: 'cli-1' })).toBeNull();
  });

  it('🔴 negócio sem cliente vira `null`, nunca `undefined`', () => {
    // `TarefaFormDialog` decide mostrar o campo "Empresa (cliente)" por
    // `extraFields?.cliente_id !== undefined`. Com `undefined`, o campo APARECIA — e o
    // `...extraFields` do `handleSave` sobrescrevia a escolha da pessoa com `undefined` na hora
    // de gravar. Campo que aceita o clique e joga a resposta fora é pior que campo nenhum.
    expect(alvoDaTarefaDoNegocio({ id: 'ped-1' })).toEqual({
      pedido_id: 'ped-1',
      cliente_id: null,
    });
    expect(alvoDaTarefaDoNegocio({ id: 'ped-1', cliente_id: null })).toEqual({
      pedido_id: 'ped-1',
      cliente_id: null,
    });
  });

  it('🔴 o painel não volta a montar `extraFields` a partir de um valor que pode ser nulo', () => {
    // A forma exata que causou o bug — `extraFields={{ pedido_id: pedidoId!, … }}` — e qualquer
    // parente dela. O `!` é o que cala o compilador sobre o nulo: `pedidoId` é `string | null`,
    // e no instante do envio ele PODE ter virado nulo.
    const extraFieldsDoPainel = [...PAINEL_SO_CODIGO.matchAll(/extraFields=\{([^\n]*)\}/g)]
      .map((m) => m[1]);

    // Sanidade: se o `extraFields` sumir do painel, o teste não pode passar por vazio.
    expect(extraFieldsDoPainel.length).toBeGreaterThanOrEqual(2);
    for (const valor of extraFieldsDoPainel) {
      expect(valor).not.toMatch(/pedidoId/);
      expect(valor).not.toMatch(/!/);
    }
  });

  it('o alvo é congelado nos DOIS gatilhos que abrem o formulário', () => {
    // Criar uma tarefa e abrir uma existente têm de gravar o mesmo vínculo. Se só um congelar,
    // o outro volta a depender do estado do painel.
    expect(PAINEL_SO_CODIGO).toContain('const abrirNovaTarefa');
    expect(PAINEL_SO_CODIGO).toContain('const abrirEdicaoDeTarefa');
    expect(PAINEL_SO_CODIGO).toContain('onClick={abrirNovaTarefa}');
    expect(PAINEL_SO_CODIGO).toContain('abrirEdicaoDeTarefa(tarefa)');
    // Duas chamadas: uma em cada gatilho.
    expect(PAINEL_SO_CODIGO.match(/setAlvoDaTarefa\(alvoDaTarefaDoNegocio\(negocio\)\)/g)).toHaveLength(2);
  });
});

describe('o painel não fecha enquanto o formulário de tarefa está aberto', () => {
  it('🔴 o painel recusa o clique-fora, e só enquanto o formulário está aberto', () => {
    // O sintoma que a pessoa vê. Sem esta guarda, o vínculo até seria gravado (o alvo está
    // congelado), mas o painel sumiria da tela no primeiro clique — que é metade do defeito.
    expect(PAINEL_SO_CODIGO).toContain('onInteractOutside');
    expect(PAINEL_SO_CODIGO).toMatch(/if \(formularioDeTarefaAberto\) evento\.preventDefault\(\)/);

    // 🔴 CONDICIONADA, nunca incondicional. Um `preventDefault()` seco aqui desligaria o
    // clique-fora do painel para sempre — e aí o painel só sairia pelo botão, em toda tela que
    // o monta. O que a condição prende é: só enquanto há formulário de tarefa por cima.
    expect(PAINEL_SO_CODIGO).toContain('const formularioDeTarefaAberto = addTarefaOpen || editingTarefaNegocio !== null');
  });

  it('a guarda está no painel, e não no diálogo de tarefa', () => {
    // 🔴 O `TarefaFormDialog` é `modal={false}` DE PROPÓSITO (a trava de rolagem do Radix mata a
    // roda do mouse dentro dos seletores dele). Tirar esse `modal={false}` "consertaria" o
    // clique-fora e quebraria a rolagem nas QUATRO telas que montam o formulário —
    // PainelDoNegocio, ClienteDetalhe, ContatoDetalhe e Tarefas. Este teste é o lembrete de que
    // a defesa pertence a quem fecha (o painel), não a quem é clicado.
    // Mesma limpeza de comentário do painel, e pelo mesmo motivo: o `TarefaFormDialog` escreve
    // `modal={false}` também na prosa que explica a escolha, e sem tirá-la a asserção passaria
    // com o código já trocado.
    const dialogo = readFileSync(
      join(process.cwd(), 'src', 'components', 'tarefas', 'TarefaFormDialog.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(dialogo).toContain('modal={false}');
  });
});

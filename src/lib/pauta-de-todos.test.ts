import { describe, it, expect } from 'vitest';
import { vePautaDeTodos, type LinhaDePermissao } from '@/lib/pauta-de-todos';

/**
 * Estes casos são o contrato entre a TELA e a função `public.ve_pauta_de_todos(uuid)` do banco.
 * Se um deles mudar aqui sem mudar lá, a tela promete uma coisa e o servidor faz outra — que é
 * o defeito que esta etapa inteira existe para acabar.
 */

/** Uma linha de `permissoes_usuario` do módulo `pedidos`, como ela chega do Supabase. */
function linhaDeNegocios(funcionalidades: Record<string, unknown>): LinhaDePermissao {
  return { modulo: 'pedidos', funcionalidades };
}

/** O que hoje está gravado de verdade nas 12 linhas de `pedidos` — sem `pauta_de_todos`. */
const SEM_A_CHAVE = linhaDeNegocios({
  importar: true,
  whatsapp: true,
  exportar_pdf: true,
  alterar_status: true,
});

describe('vePautaDeTodos — os quatro casos que decidem a tela', () => {
  it('chave LIGADA em vendedor: vê a pauta de todos, mesmo sem ser gestor', () => {
    expect(
      vePautaDeTodos('vendedor', [linhaDeNegocios({ ...SEM_A_CHAVE.funcionalidades, pauta_de_todos: true })]),
    ).toBe(true);
  });

  it('chave DESLIGADA em gestor: volta a ver só os próprios — a chave manda sobre o papel', () => {
    expect(
      vePautaDeTodos('gestor', [linhaDeNegocios({ ...SEM_A_CHAVE.funcionalidades, pauta_de_todos: false })]),
    ).toBe(false);
  });

  it('chave AUSENTE em gestor: cai no papel e vê a pauta de todos', () => {
    expect(vePautaDeTodos('gestor', [SEM_A_CHAVE])).toBe(true);
  });

  it('chave AUSENTE em vendedor: cai no papel e vê só os próprios', () => {
    expect(vePautaDeTodos('vendedor', [SEM_A_CHAVE])).toBe(false);
  });
});

describe('vePautaDeTodos — o papel, quando a chave não está gravada', () => {
  it('aceita os três papéis de `is_gestor()`', () => {
    for (const papel of ['gestor', 'admin', 'empresa']) {
      expect(vePautaDeTodos(papel, [])).toBe(true);
    }
  });

  it('recusa quem não é nenhum dos três', () => {
    expect(vePautaDeTodos('vendedor', [])).toBe(false);
    expect(vePautaDeTodos('financeiro', [])).toBe(false);
  });

  it('papel vazio, nulo ou indefinido não vira gestor por acidente', () => {
    expect(vePautaDeTodos('', [])).toBe(false);
    expect(vePautaDeTodos(null, [])).toBe(false);
    expect(vePautaDeTodos(undefined, [])).toBe(false);
  });
});

describe('vePautaDeTodos — quando não há linha para ler', () => {
  it('pessoa SEM nenhuma linha do módulo pedidos cai no papel', () => {
    // Dois dos cinco gestores da MD estão assim: nenhuma linha de `pedidos`.
    expect(vePautaDeTodos('gestor', [{ modulo: 'clientes', funcionalidades: { importar: true } }])).toBe(true);
    expect(vePautaDeTodos('vendedor', [{ modulo: 'clientes', funcionalidades: { importar: true } }])).toBe(false);
  });

  it('lista vazia cai no papel', () => {
    expect(vePautaDeTodos('gestor', [])).toBe(true);
  });

  it('lista ausente cai no papel — a decisão de esperar o carregamento é do hook, não daqui', () => {
    expect(vePautaDeTodos('gestor', undefined)).toBe(true);
    expect(vePautaDeTodos('vendedor', null)).toBe(false);
  });

  it('linha sem o objeto de funcionalidades cai no papel', () => {
    expect(vePautaDeTodos('gestor', [{ modulo: 'pedidos' }])).toBe(true);
    expect(vePautaDeTodos('vendedor', [{ modulo: 'pedidos', funcionalidades: null }])).toBe(false);
  });

  it('só a linha do módulo `pedidos` conta — a chave de outro módulo é ignorada', () => {
    expect(
      vePautaDeTodos('vendedor', [
        { modulo: 'clientes', funcionalidades: { pauta_de_todos: true } },
        SEM_A_CHAVE,
      ]),
    ).toBe(false);
  });
});

describe('vePautaDeTodos — o que o `jsonb` pode devolver de estranho', () => {
  it('chave gravada como texto "true"/"false" vale como booleano, igual ao cast do banco', () => {
    expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: 'true' })])).toBe(true);
    expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: 'false' })])).toBe(false);
  });

  it('chave gravada como null JSON conta como AUSENTE e cai no papel', () => {
    // No banco: `funcionalidades ? 'pauta_de_todos'` é verdadeiro, mas `->>` devolve NULL e o
    // `coalesce` cai no papel do mesmo jeito.
    expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: null })])).toBe(true);
    expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: null })])).toBe(false);
  });

  it('1 e 0 valem como booleano — é o que o `::boolean` do banco responde', () => {
    // Medido no Postgres: ('{"k":1}'::jsonb ->> 'k')::boolean -> true, e 0 -> false.
    // O JSON pode trazer número ou texto; `->>` entrega os dois como o mesmo texto.
    expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: 1 })])).toBe(true);
    expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: 0 })])).toBe(false);
    expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: '1' })])).toBe(true);
    expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: '0' })])).toBe(false);
  });

  it('as palavras que o Postgres aceita, sem diferenciar maiúscula nem espaço nas pontas', () => {
    // Inclui os prefixos não ambíguos ('tr', 'fals'…), que o cast do banco também aceita.
    for (const sim of ['t', 'tr', 'tru', 'true', 'TRUE', 'True', 'y', 'ye', 'yes', 'YES', 'on', 'ON', ' true ']) {
      expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: sim })])).toBe(true);
    }
    for (const nao of ['f', 'fa', 'fal', 'fals', 'false', 'FALSE', 'n', 'no', 'NO', 'off', 'OFF', ' false ']) {
      expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: nao })])).toBe(false);
    }
  });

  it('o que o Postgres RECUSARIA cai no papel em vez de derrubar a tela', () => {
    // Divergência deliberada e documentada: no banco o `::boolean` estoura `22P02` — e o erro
    // não fica nesta resposta, ele derruba a `pauta_do_dia_de` inteira. Nenhuma tela grava
    // isso; se acontecer, a tela erra para o lado do papel, não para o erro.
    // 'o' está aqui porque é ambíguo entre 'on' e 'off', e o banco o recusa.
    for (const recusado of ['talvez', '', 'o', 2, -1, '01', 'sim', {}, []]) {
      expect(vePautaDeTodos('gestor', [linhaDeNegocios({ pauta_de_todos: recusado })])).toBe(true);
      expect(vePautaDeTodos('vendedor', [linhaDeNegocios({ pauta_de_todos: recusado })])).toBe(false);
    }
  });
});

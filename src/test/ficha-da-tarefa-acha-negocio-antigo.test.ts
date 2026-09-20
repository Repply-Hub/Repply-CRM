import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { negocioParaFichaDaTarefa, getNomeNegocio } from '@/lib/nome-negocio';

/**
 * A ficha de uma tarefa (a folha lateral da tela de Tarefas) mostra a qual NEGÓCIO ela
 * pertence. Ela achava esse negócio só dentro da lista do seletor — e essa lista traz
 * apenas os ~500 negócios mais RECENTES da empresa (`usePedidosOptions`, teto
 * `PEDIDOS_OPTIONS_LIMITE_LISTA`; a MD tem quase 12 mil). Quando a tarefa aponta para um
 * negócio mais antigo que isso, o `find` não achava nada e a ficha mostrava "—", como se o
 * vínculo tivesse sumido.
 *
 * 🔴 O DEFEITO, conferido no banco em 16/09/2026: das 6 tarefas de "Retomar contato" recentes
 * da MD, todas tinham `pedido_id` gravado, nenhuma órfã, todas no dono certo — o vínculo
 * SEMPRE esteve certo. Uma delas apontava para um negócio na posição 857 da fila de recentes
 * (fora das 500), e SÓ essa aparecia sem o nome do negócio. Não é bug de gestor adiar negócio
 * de colega; é a lista curta não alcançar negócio antigo, de quem quer que seja.
 *
 * A saída é a mesma que o `TarefaFormDialog` já usa para o próprio seletor: buscar aquele
 * negócio pelo identificador (`usePedidoOptionPorId`) quando a lista curta não o traz.
 * `negocioParaFichaDaTarefa` é a regra pura dessa escolha, e o teste a prende.
 */
describe('a ficha da tarefa acha o negócio mesmo quando ele é antigo', () => {
  // No formato de PedidoOption: id + nome + cliente + fabricante. Nomes inventados (CLAUDE.md §6.9).
  const recente = {
    id: 'ped-recente',
    nome: 'Obra Exemplo',
    cliente: { id: 'cli-1', empresa: 'Ana Souza' },
    fabricante: { id: 'fab-1', nome: 'Marca X' },
  };
  const antigo = {
    id: 'ped-antigo',
    nome: 'Obra Antiga',
    cliente: { id: 'cli-2', empresa: 'Bruno Lima' },
    fabricante: { id: 'fab-2', nome: 'Marca Y' },
  };

  it('acha na lista curta quando o negócio é recente', () => {
    expect(negocioParaFichaDaTarefa('ped-recente', [recente], null)).toBe(recente);
  });

  it('🔴 acha pelo id quando o negócio NÃO está na lista curta (o bug)', () => {
    // A lista curta só tem `recente`; o negócio antigo veio da busca pelo id.
    const achado = negocioParaFichaDaTarefa('ped-antigo', [recente], antigo);
    expect(achado).toBe(antigo);
    // E o nome exibido sai certo, em vez de "—".
    expect(getNomeNegocio(achado!)).toBe('Obra Antiga');
  });

  it('sem negócio ligado, devolve null', () => {
    expect(negocioParaFichaDaTarefa(null, [recente], null)).toBeNull();
    expect(negocioParaFichaDaTarefa(undefined, [recente], null)).toBeNull();
    expect(negocioParaFichaDaTarefa('', [recente], null)).toBeNull();
  });

  it('🔴 ignora a busca por id defasada, de outra tarefa', () => {
    // `usePedidoOptionPorId` pode, por um instante, ainda trazer o negócio da tarefa aberta
    // ANTES, enquanto a busca do novo id não chegou. Usar isso mostraria o negócio errado —
    // por isso a regra só aceita o resultado quando o id dele bate com o pedido da tarefa atual.
    expect(negocioParaFichaDaTarefa('ped-antigo', [recente], recente)).toBeNull();
  });
});

/**
 * A fiação na tela, que o jsdom não alcança (a página dispara sessão e várias consultas).
 * Espelha o guarda de `tarefa-do-painel-nasce-ligada-ao-negocio.test.ts`: lê o arquivo, tira
 * os comentários (senão a própria prosa que explica o conserto faria a asserção passar) e
 * confere que a ficha resolve o negócio pela regra nova, com a busca pelo id.
 */
const TAREFAS = readFileSync(join(process.cwd(), 'src', 'pages', 'Tarefas.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

describe('a tela de Tarefas resolve o negócio da ficha pela busca por id', () => {
  it('🔴 não volta a resolver o negócio só pela lista curta', () => {
    expect(TAREFAS).toContain('usePedidoOptionPorId');
    expect(TAREFAS).toContain('negocioParaFichaDaTarefa');
  });
});

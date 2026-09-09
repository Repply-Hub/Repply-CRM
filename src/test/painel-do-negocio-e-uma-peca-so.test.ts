import { describe, it, expect } from 'vitest';
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
  it('🔴 só PainelDoNegocio.tsx monta o painel de detalhe do negócio', () => {
    const permitidos = new Set(PODEM_TER_AS_DUAS_MARCAS);

    const culpados = arquivosDeCodigo(RAIZ)
      .filter((caminho) => {
        const texto = readFileSync(caminho, 'utf8');
        return MARCAS.every((marca) => texto.includes(marca));
      })
      .map((caminho) => relative(RAIZ, caminho).split('\\').join('/'))
      .filter((relativo) => !permitidos.has(relativo));

    expect(culpados).toEqual([]);
  });

  it('o painel que a lista de permitidos aponta existe de verdade', () => {
    // Sem isto, renomear ou mover `PainelDoNegocio.tsx` deixaria o teste acima passando por
    // vazio — nenhum arquivo teria as duas marcas, e a segunda cópia entraria sem ninguém ver.
    const comAsDuasMarcas = arquivosDeCodigo(RAIZ)
      .filter((caminho) => {
        const texto = readFileSync(caminho, 'utf8');
        return MARCAS.every((marca) => texto.includes(marca));
      })
      .map((caminho) => relative(RAIZ, caminho).split('\\').join('/'));

    expect(comAsDuasMarcas).toEqual(PODEM_TER_AS_DUAS_MARCAS);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 A ficha do cliente e a do contato desenham `PainelDeNegocios`, alimentado por
 * `usePedidosPorCliente`. Esse gancho JÁ teve um select de `pedidos` escrito à mão, cópia do
 * `montarSelectDeNegocios` da lista principal — e a cópia ficou para trás: sem o embed
 * `anexos:pedido_anexos(...)`, a coluna "Anexo" da ficha mostrava "—" mesmo com anexo, e a
 * ordenação "Com anexo primeiro" morria (medido na revisão da Tarefa 6 do pacote de anexos).
 *
 * Este teste prende a lição do AGENTS.md §2 ("conserte no ponto comum"): a ficha lê pelo select
 * COMPARTILHADO, nunca por uma cópia. Se alguém reintroduzir um select de relações à mão aqui, o
 * teste falha antes de a coluna regredir de novo — em silêncio, que é como esse bug volta.
 */
const USE_PEDIDOS = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'use-pedidos.ts'),
  'utf8',
);

/** O corpo de uma função exportada até a próxima `export` (o mesmo recorte que outras travas usam). */
function corpoDaFuncao(codigo: string, assinatura: string): string {
  const inicio = codigo.indexOf(assinatura);
  if (inicio === -1) throw new Error(`Não achei "${assinatura}" em use-pedidos.ts`);
  const resto = codigo.slice(inicio + assinatura.length);
  const fim = resto.indexOf('\nexport ');
  return resto.slice(0, fim === -1 ? undefined : fim);
}

describe('a ficha do cliente/contato usa o select compartilhado', () => {
  const corpo = corpoDaFuncao(USE_PEDIDOS, 'export function usePedidosPorCliente');

  it('🔴 alimenta a ficha pelo `montarSelectDeNegocios`, não por uma cópia à mão', () => {
    expect(corpo).toContain('montarSelectDeNegocios()');
  });

  it('🔴 não reintroduz um select de relações de pedidos escrito à mão', () => {
    // A assinatura de uma cópia à mão: embutir `marcadores`/`fabricantes` direto no select em vez
    // de deixar isso com a função compartilhada (que é a ÚNICA que deve montar esse embed).
    expect(corpo).not.toMatch(/marcador:marcadores\(/);
    expect(corpo).not.toMatch(/fabricante:fabricantes\(/);
  });
});

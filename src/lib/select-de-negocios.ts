/**
 * Os campos que um negócio completo precisa trazer.
 *
 * Vive aqui, e não dentro de `use-pedidos.ts`, para poder ser conferido por teste sem arrastar
 * o cliente do Supabase junto — ver `select-de-negocios.test.ts`.
 *
 * 🔴 O embed de `usuarios` PRECISA nomear o caminho (`!pedidos_vendedor_id_fkey`). Desde
 * `20260831200000_responsaveis_do_negocio.sql` existe `pedido_responsaveis`, que liga `pedidos`
 * a `usuarios` por um SEGUNDO caminho. Sem nomear, o PostgREST recusa o embed inteiro com
 * `PGRST201 — more than one relationship`, e a lista de Negócios volta VAZIA — enquanto a
 * contagem, que não embute nada, continua achando os registros. Foi assim que o defeito passou:
 * o cabeçalho contava certo e as colunas ficavam a zero.
 */
export type RelacaoInterna = 'cliente' | 'fabricante' | 'vendedor';

export function montarSelectDeNegocios(relacoesInternas: RelacaoInterna[] = []): string {
  const j = (rel: RelacaoInterna) => (relacoesInternas.includes(rel) ? '!inner' : '');
  return `
  id, status, nome, valor_total, data_pedido, created_at, observacoes,
  cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
  cliente:clientes${j('cliente')}(id, empresa),
  fabricante:fabricantes${j('fabricante')}(id, nome),
  vendedor:usuarios!pedidos_vendedor_id_fkey${j('vendedor')}(id, nome, empresa_id),
  obra:obras(id, nome_obra),
  marcador:marcadores(id, nome, cor)
`;
}

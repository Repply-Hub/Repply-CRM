import { describe, it, expect } from 'vitest';
import { montarSelectDeNegocios } from './select-de-negocios';

/**
 * O painel do negócio (o <Sheet> de `src/pages/Negocios.tsx`) lê estes campos. Quando o negócio
 * vem da busca por id — o caminho que a tela "Hoje" usa —, é ESTE select que o alimenta.
 *
 * Um campo que sair daqui não quebra nada visivelmente: o painel simplesmente mostra vazio
 * naquele pedaço. Por isso o contrato é fixado aqui em vez de confiado à leitura.
 */
describe('montarSelectDeNegocios', () => {
  const CAMPOS_QUE_O_PAINEL_LE = [
    'id', 'status', 'nome', 'valor_total', 'data_pedido', 'observacoes',
    'cliente_id', 'fabricante_id', 'usuario_id', 'obra_id', 'funil_id',
    'endereco_entrega', 'campos_extras', 'prazo_resposta', 'pdf_url', 'marcador_id',
  ];

  it('traz todo campo que o painel do negócio lê', () => {
    const select = montarSelectDeNegocios();
    for (const campo of CAMPOS_QUE_O_PAINEL_LE) {
      expect(select, `faltou o campo ${campo}`).toContain(campo);
    }
  });

  // `marcador` é o campo que denuncia a diferença entre este select e o de `usePedidoCompleto`
  // (use-edit-pedido.ts), que NÃO o traz. Reaproveitar aquele aqui deixaria o painel sem a
  // etiqueta colorida, e a falta seria silenciosa.
  it('embute as quatro relações, com marcador entre elas', () => {
    const select = montarSelectDeNegocios();
    expect(select).toContain('cliente:clientes(');
    expect(select).toContain('fabricante:fabricantes(');
    expect(select).toContain('obra:obras(');
    expect(select).toContain('marcador:marcadores(');
  });

  // Sem nomear o caminho, o PostgREST recusa o embed inteiro (PGRST201) e a lista volta vazia.
  it('nomeia o caminho do vendedor, sempre', () => {
    expect(montarSelectDeNegocios()).toContain('usuarios!pedidos_vendedor_id_fkey');
    expect(montarSelectDeNegocios(['vendedor'])).toContain('usuarios!pedidos_vendedor_id_fkey');
  });

  it('marca como obrigatória só a relação pedida', () => {
    const so_cliente = montarSelectDeNegocios(['cliente']);
    expect(so_cliente).toContain('cliente:clientes!inner(');
    expect(so_cliente).toContain('fabricante:fabricantes(');
    expect(so_cliente).not.toContain('fabricante:fabricantes!inner(');
  });

  // A cópia de um negócio (docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md) leva a
  // origem do lead. Era o único campo dela que este select não trazia — e a falta seria
  // silenciosa: a cópia abriria com a origem em branco e ninguém saberia dizer por quê.
  it('traz a origem do lead, que a cópia do negócio leva', () => {
    expect(montarSelectDeNegocios()).toContain('origem_lead');
  });

  // A coluna "Anexo" da lista mostra o primeiro anexo com "+N", e a exportação leva todos — as
  // duas leem esta lista embutida, não mais só o `pdf_url` legado. Sem o embed, a coluna volta a
  // mostrar só o anexo antigo (e a de negócio criado depois da migração ficaria vazia).
  it('embute os anexos do negócio, que a coluna Anexo e a exportação leem', () => {
    expect(montarSelectDeNegocios()).toContain('anexos:pedido_anexos(');
  });
});

/**
 * O que uma cópia de negócio leva do original — e o que ela deixa para trás.
 *
 * Vive separado da tela de propósito: são as regras do desenho de 12/09/2026, e elas se provam
 * sem renderizar nada.
 *
 * 🔴 A CÓPIA NUNCA NASCE NA ETAPA DO ORIGINAL. Um negócio que nasce em `fechamento` ou `perdido`
 * recebe do gatilho `fn_set_pedido_fechado_em` a data de fechamento de hoje — copiar um negócio
 * ganho mantendo a etapa somaria a MESMA venda duas vezes no faturamento do mês, e ninguém
 * perceberia olhando a tela.
 */

export interface NegocioParaCopiar {
  nome: string | null;
  cliente_id: string;
  obra_id: string | null;
  fabricante_id: string;
  usuario_id: string;
  funil_id: string;
  marcador_id: string | null;
  origem_lead: string | null;
  endereco_entrega: string | null;
  valor_total: number | null;
  pdf_url: string | null;
  campos_extras: Record<string, unknown> | null;
}

export interface ResponsavelParaCopiar {
  usuarioId: string;
  principal: boolean;
}

/** O preenchimento da janela de Novo Negócio. Repare no que NÃO existe aqui: observações e datas. */
export interface CopiaDeNegocio {
  /** Como o negócio original se chama na tela — o aviso "Cópia de …". */
  rotuloDoOriginal: string;
  clienteId: string;
  obraId: string;
  fabricanteId: string;
  vendedorId: string;
  participantes: string[];
  funilId: string;
  status: string;
  marcadorId: string;
  origemLead: string;
  enderecoEntrega: string;
  valor: number | null;
  /** O MESMO arquivo do original, pelo link. Não há cópia de arquivo no armazenamento. */
  pdfUrl: string | null;
  nome: string;
  nomeAutomatico: boolean;
  camposExtras: Record<string, string>;
}

/** A etapa de quando não se sabe qual é a primeira do funil. Nunca a etapa do original. */
export const ETAPA_INICIAL_PADRAO = 'novo_lead';

export function montarCopiaDeNegocio({
  negocio,
  responsaveis = [],
  camposDaEmpresa = [],
  primeiraEtapa,
  rotulo,
}: {
  negocio: NegocioParaCopiar;
  responsaveis?: ResponsavelParaCopiar[];
  /** As chaves dos campos que a EMPRESA criou (`configuracoes_campos.origem = 'customizado'`). */
  camposDaEmpresa?: string[];
  primeiraEtapa?: string | null;
  rotulo?: string;
}): CopiaDeNegocio {
  // 🔴 Só o que a empresa criou. O resto de `campos_extras` é rastro da importação do Bitrix
  // ("Negócio", "Contato", "Vendedor Original", "responsavel_corrigido", "_lote", "_demo"): ele
  // conta de onde aquele negócio veio, e a cópia não veio de lá.
  const camposExtras: Record<string, string> = {};
  for (const chave of camposDaEmpresa) {
    const valor = negocio.campos_extras?.[chave];
    if (valor !== undefined && valor !== null && valor !== '') camposExtras[chave] = String(valor);
  }

  return {
    rotuloDoOriginal: rotulo ?? negocio.nome ?? '',
    clienteId: negocio.cliente_id ?? '',
    obraId: negocio.obra_id ?? '',
    fabricanteId: negocio.fabricante_id ?? '',
    vendedorId: negocio.usuario_id ?? '',
    // O principal fica fora: ele é o `vendedorId`, e a gravação o cria por gatilho. Mandá-lo
    // junto violaria a chave primária de `pedido_responsaveis` (ver `useCreatePedidoCompleto`).
    participantes: responsaveis
      .filter((r) => !r.principal && r.usuarioId && r.usuarioId !== negocio.usuario_id)
      .map((r) => r.usuarioId),
    funilId: negocio.funil_id ?? '',
    status: primeiraEtapa || ETAPA_INICIAL_PADRAO,
    marcadorId: negocio.marcador_id ?? '',
    origemLead: negocio.origem_lead ?? '',
    enderecoEntrega: negocio.endereco_entrega ?? '',
    valor: negocio.valor_total ?? null,
    pdfUrl: negocio.pdf_url || null,
    nome: negocio.nome ?? '',
    nomeAutomatico: !negocio.nome,
    camposExtras,
  };
}

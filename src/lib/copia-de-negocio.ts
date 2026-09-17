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

/** Quem está duplicando o negócio — decide a regra D1 (ver comentário em `montarCopiaDeNegocio`). */
export interface QuemDuplica {
  usuarioId: string | null | undefined;
  ehGestor: boolean;
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
  /**
   * As referências para os MESMOS arquivos do original, pelo link — um por anexo. Não há
   * cópia de arquivo no armazenamento (desenho de 12/09/2026, pacote "vários anexos por
   * negócio"): `useHerdarAnexos` insere uma linha por item apontando para o endereço que já
   * está no balde.
   */
  anexos: { url: string; nome: string; tipo: string | null }[];
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
  quemDuplica,
  anexos = [],
}: {
  negocio: NegocioParaCopiar;
  responsaveis?: ResponsavelParaCopiar[];
  /** As chaves dos campos que a EMPRESA criou (`configuracoes_campos.origem = 'customizado'`). */
  camposDaEmpresa?: string[];
  primeiraEtapa?: string | null;
  rotulo?: string;
  /**
   * Quem está duplicando o negócio. Ausente = mantém o comportamento de sempre (nada muda) —
   * é o que protege quem ainda chama esta função sem saber da regra D1 abaixo.
   */
  quemDuplica?: QuemDuplica;
  /** Os anexos do negócio ORIGINAL — quem chama busca (`useAnexosDoNegocio`) e entrega aqui;
   *  esta função só repassa a lista, ela não fala com o banco. */
  anexos?: { url: string; nome: string; tipo: string | null }[];
}): CopiaDeNegocio {
  // 🔴 Só o que a empresa criou. O resto de `campos_extras` é rastro da importação do Bitrix
  // ("Negócio", "Contato", "Vendedor Original", "responsavel_corrigido", "_lote", "_demo"): ele
  // conta de onde aquele negócio veio, e a cópia não veio de lá.
  const camposExtras: Record<string, string> = {};
  for (const chave of camposDaEmpresa) {
    const valor = negocio.campos_extras?.[chave];
    if (valor !== undefined && valor !== null && valor !== '') camposExtras[chave] = String(valor);
  }

  // 🔴 DECISÃO D1 do dono do produto (15/09/2026). A política de segurança do banco
  // (`pedidos_insert`) só deixa quem NÃO é gestor criar negócio em nome de SI MESMO
  // (`usuario_id = get_my_usuario_id()`) — um vendedor comum não pode salvar um negócio cujo
  // principal seja outra pessoa, e o campo Responsável da tela vem travado para ele
  // (`disabled={!isGestor}` em `NovoNegocioDialog.tsx`). Sem esta regra, duplicar o negócio de
  // um colega nascia com um `vendedorId` que a pessoa nem consegue trocar nem consegue salvar:
  // o "Criar" era recusado pelo banco, com uma frase em inglês.
  //
  // Fala literal do dono do produto: "Cópia nasce dele, no entanto o responsável do negócio o
  // qual foi copiado não precisa entrar como responsável secundário, pode ser somente o novo
  // responsável mesmo." Lida como "só o novo responsável, mais ninguém": nem o principal do
  // original nem os outros responsáveis dele entram na cópia.
  //
  // Gestor e "duplicar o próprio negócio" continuam exatamente como antes (decisão 5 do
  // desenho): o principal fica sendo o do original, e os outros responsáveis viajam junto.
  const somenteNovoResponsavel =
    !!quemDuplica && !quemDuplica.ehGestor && quemDuplica.usuarioId !== negocio.usuario_id;

  return {
    rotuloDoOriginal: rotulo ?? negocio.nome ?? '',
    clienteId: negocio.cliente_id ?? '',
    obraId: negocio.obra_id ?? '',
    fabricanteId: negocio.fabricante_id ?? '',
    vendedorId: somenteNovoResponsavel ? (quemDuplica!.usuarioId ?? '') : (negocio.usuario_id ?? ''),
    // O principal fica fora: ele é o `vendedorId`, e a gravação o cria por gatilho. Mandá-lo
    // junto violaria a chave primária de `pedido_responsaveis` (ver `useCreatePedidoCompleto`).
    //
    // Com D1 em vigor (`somenteNovoResponsavel`), nem o principal do original nem os outros
    // responsáveis entram — a cópia nasce só com quem duplicou.
    participantes: somenteNovoResponsavel
      ? []
      : responsaveis
          .filter((r) => !r.principal && r.usuarioId && r.usuarioId !== negocio.usuario_id)
          .map((r) => r.usuarioId),
    funilId: negocio.funil_id ?? '',
    status: primeiraEtapa || ETAPA_INICIAL_PADRAO,
    marcadorId: negocio.marcador_id ?? '',
    origemLead: negocio.origem_lead ?? '',
    enderecoEntrega: negocio.endereco_entrega ?? '',
    valor: negocio.valor_total ?? null,
    anexos,
    nome: negocio.nome ?? '',
    nomeAutomatico: !negocio.nome,
    camposExtras,
  };
}

/**
 * A lista de obras que o seletor do negócio mostra, e o aviso quando ela vem vazia.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 27/08/2026 o campo mostrava só as obras do cliente escolhido, e
 * a lista vinha vazia quase sempre. Medido em produção:
 *
 *   obras cadastradas ....................... 82
 *   clientes da MD .......................... 1.305
 *   clientes com ao menos uma obra ........... 45   (3,4%)
 *   negócios com obra vinculada .............. 0    de 11.910
 *
 * Não era defeito de consulta nem de permissão: a regra "obras deste cliente" estava certa, e
 * o dado é que não existe. O resultado prático é que ninguém nunca conseguiu vincular.
 *
 * Agravante medido: 35 nomes de cliente estão DUPLICADOS na base. "Ecomax Empreendimentos |
 * Condomínio Vila Do Alto" tem 3 obras e "Ecomax Empreendimentos Imobiliários LTDA" tem 0 —
 * escolher a linha errada da mesma construtora dava lista vazia, sem nada explicando.
 *
 * Decisão do Lucas em 27/08/2026: as do cliente vêm primeiro, e as demais ficam alcançáveis
 * logo abaixo — MARCADAS com o nome do dono, para ninguém vincular a obra de outra construtora
 * sem perceber. O selo é o que torna aceitável mostrar todas.
 */

interface ObraCrua {
  id: string;
  nome_obra: string | null;
  cliente_id?: string | null;
  clientes?: { empresa?: string | null } | null;
}

export interface OpcaoDeObra {
  value: string;
  label: string;
  /** Nome do cliente dono, quando a obra NÃO é do cliente escolhido. */
  badge?: string;
}

/**
 * Junta as obras do cliente escolhido com as demais da empresa, sem repetir.
 *
 * A ordem é a mensagem: primeiro as prováveis, depois as possíveis.
 */
export function opcoesDeObra(
  doCliente: ObraCrua[] | undefined | null,
  todas: ObraCrua[] | undefined | null,
  clienteId: string | null | undefined,
): OpcaoDeObra[] {
  const proprias = doCliente ?? [];
  const universo = todas ?? [];

  const jaListadas = new Set(proprias.map((o) => o.id));

  const primeiro: OpcaoDeObra[] = proprias.map((o) => ({
    value: o.id,
    label: o.nome_obra ?? 'Obra sem nome',
  }));

  const depois: OpcaoDeObra[] = universo
    .filter((o) => !jaListadas.has(o.id))
    // Quando não há cliente escolhido, nada é "de outro cliente" — é tudo o que existe.
    .filter((o) => !clienteId || o.cliente_id !== clienteId)
    .map((o) => ({
      value: o.id,
      label: o.nome_obra ?? 'Obra sem nome',
      badge: o.clientes?.empresa ?? undefined,
    }));

  return [...primeiro, ...depois];
}

export interface EstadoDaLista {
  temCliente: boolean;
  temAlguma: boolean;
  carregando?: boolean;
  erro?: boolean;
}

/**
 * A frase que aparece quando a lista está vazia.
 *
 * 🔴 QUATRO SITUAÇÕES DIFERENTES mostravam a MESMA frase — "Nenhuma opção encontrada" — e
 * nenhuma delas dizia o que fazer. Pior: o código descartava `error` e `isLoading` do hook,
 * então falha de rede aparecia idêntica a "este cliente não tem obra". Quem via não tinha como
 * saber se esperava, se cadastrava, ou se algo tinha quebrado.
 */
export function avisoDaListaDeObras({
  temCliente,
  temAlguma,
  carregando,
  erro,
}: EstadoDaLista): string {
  if (temAlguma) return '';
  if (erro) return 'Não foi possível carregar as obras. Tente de novo em instantes.';
  if (carregando) return 'Carregando as obras…';
  if (!temCliente) return 'Escolha o cliente primeiro — as obras dele aparecem aqui.';
  return 'Nenhuma obra cadastrada ainda. Use "Nova Obra" para criar a primeira.';
}

/**
 * Os filtros do painel "No geral" da tela "Hoje", guardados no ENDEREÇO da página.
 *
 * Endereço e não armazenamento local, de propósito: sobrevive ao recarregar, dá para mandar por
 * link, e não fica preso a um navegador. O precedente de filtro guardado no navegador está na
 * tela de Negócios, e é um dos quatro motivos do defeito do painel corrigido em 05/09/2026 —
 * a pessoa chegava pela pauta e caía num recorte que ela nunca escolheu.
 */
export interface FiltrosDoPainel {
  etapas: string[];       // slugs de kanban_colunas, que é o que `pedidos.status` guarda
  fabricantes: string[];  // ids
  responsaveis: string[]; // ids de usuarios.id
  // Período OPCIONAL, por DATA DE CRIAÇÃO do negócio (`data_pedido`), texto `AAAA-MM-DD`. Vazio
  // (undefined) = sem recorte, que é o padrão: o bloco "No geral" nasceu sem período de propósito,
  // para não esconder os parados mais antigos (ver `RadarDeRisco.tsx`). Diferente do responsável, o
  // período NÃO depende da chave `pauta_de_todos` — vale para quem vê a equipe e para quem vê só o seu.
  dataDe?: string;
  dataAte?: string;
}

const CHAVES = ['etapas', 'fabricantes', 'responsaveis'] as const;

function lerLista(params: URLSearchParams, chave: string): string[] {
  return (params.get(chave) ?? '')
    .split(',')
    .map((p) => p.trim())
    // Pedaço vazio viraria filtro por texto vazio, que não casa com nada e esvazia o painel
    // sem explicação nenhuma na tela.
    .filter(Boolean);
}

export function lerFiltrosDoEndereco(params: URLSearchParams): FiltrosDoPainel {
  return {
    etapas: lerLista(params, 'etapas'),
    fabricantes: lerLista(params, 'fabricantes'),
    responsaveis: lerLista(params, 'responsaveis'),
    dataDe: params.get('data_de') ?? undefined,
    dataAte: params.get('data_ate') ?? undefined,
  };
}

/**
 * O recorte como as CONSULTAS o querem — os mesmos filtros, com os nomes que os hooks de
 * `use-dashboard.ts` usam.
 *
 * 🔴 EXISTE PARA HAVER UMA TRADUÇÃO SÓ. Três consultas leem estes filtros (o painel de números,
 * a tabela do time, e a contagem que a tela "Hoje" usa para saber se a fila vazia pode comemorar),
 * e as três precisam mandar exatamente o mesmo recorte — senão a tela mostra um número que a
 * tabela abaixo contradiz. É a mesma lição do CLAUDE.md §7.14: duas cópias da mesma regra viram
 * duas respostas, e a divergência só aparece meses depois.
 *
 * 🔴 `responsaveis` SÓ VAI PARA O SERVIDOR COM A CHAVE `pauta_de_todos`. Os filtros moram no
 * endereço, e revogar a chave de alguém não limpa o `?responsaveis=` que essa pessoa já tinha
 * salvo ou favoritado: sem esta condição, o controle sumia da barra e o recorte continuava
 * valendo, com os cartões mostrando números que não correspondiam a nenhum controle visível.
 *
 * `undefined` (e não `[]`) é o que significa "sem filtro" — array vazio vira `= ANY('{}')`, que
 * não casa com nada e zeraria o painel (CLAUDE.md §7.8). Quem converte de vez é o hook.
 */
export function recorteParaOServidor(
  filtros: FiltrosDoPainel,
  podeFiltrarPorResponsavel: boolean,
): {
  etapas: string[];
  fabricanteIds: string[];
  usuarioIds: string[] | undefined;
  dataDe?: string;
  dataAte?: string;
} {
  return {
    etapas: filtros.etapas,
    fabricanteIds: filtros.fabricantes,
    usuarioIds: podeFiltrarPorResponsavel ? filtros.responsaveis : undefined,
    // O período vai ao servidor para TODOS — não é gated pela chave, ao contrário de `usuarioIds`.
    dataDe: filtros.dataDe,
    dataAte: filtros.dataAte,
  };
}

/** Devolve uma cópia — nunca altera o que recebeu, e preserva parâmetro de terceiros (`negocio`). */
export function escreverFiltrosNoEndereco(
  params: URLSearchParams,
  filtros: FiltrosDoPainel,
): URLSearchParams {
  const saida = new URLSearchParams(params);
  for (const chave of CHAVES) {
    const valores = filtros[chave];
    if (valores.length > 0) saida.set(chave, valores.join(','));
    else saida.delete(chave);
  }
  // As datas são valores únicos, não listas. Vazio some da URL, mesma regra das listas.
  for (const [chave, valor] of [['data_de', filtros.dataDe], ['data_ate', filtros.dataAte]] as const) {
    if (valor) saida.set(chave, valor);
    else saida.delete(chave);
  }
  return saida;
}

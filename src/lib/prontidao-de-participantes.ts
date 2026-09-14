/**
 * Bloco 3, item A (segundo conserto da revisão) — o mecanismo que decide se a lista de
 * participantes de `useEventoParticipantes` pode ser considerada "pronta" (e portanto
 * segura para liberar Salvar e copiar para o formulário), extraído de `EventDialog.tsx`
 * como função PURA.
 *
 * 🔴 POR QUE EXTRAÍDO. A correção original vivia dentro do componente, ajustada durante a
 * própria renderização (não num `useEffect`) — porque um `useEffect` só roda DEPOIS que o
 * navegador já teve chance de pintar a tela, e reabrir um evento com o cache quente (ou
 * trocar de evento) podia pintar UM frame com a marca antiga, antes do efeito corrigi-la.
 * Um revisor apontou que testes com Testing Library não enxergam essa janela: `act()`
 * esvazia os efeitos pendentes antes de qualquer asserção, então o React ali dentro do
 * teste NUNCA chega a "parar" no frame intermediário — o teste passaria mesmo se a
 * correção estivesse só no efeito (errada). A prova de que a correção acontece na MESMA
 * chamada síncrona que detecta a mudança só é possível fora do React: esta função recebe
 * o estado "antes" dos refs e devolve o estado "depois" — tudo numa chamada só, sem
 * `useEffect`, sem `act()`, sem re-render.
 */

/** O recorte de `useQuery` (de `useEventoParticipantes`) que importa para esta decisão. */
export interface ConsultaDeParticipantes {
  isFetching: boolean;
  isSuccess: boolean;
  /** `dataUpdatedAt` do React Query — 0 quando a consulta nunca teve sucesso. */
  dataUpdatedAt: number;
}

/** O que os dois `ref`s do componente guardavam ANTES desta chamada. */
export interface RefsDoCicloDeAbertura {
  /** `grupoId` do ciclo de abertura já processado, ou `null` enquanto fechado. */
  cicloAberto: string | null;
  /** `dataUpdatedAt` de antes de pedir o refetch deste ciclo. */
  marcaAntesDeBuscarDeNovo: number;
}

export interface ResultadoDoCiclo extends RefsDoCicloDeAbertura {
  /** Só considera pronto um sucesso MAIS NOVO que a marca deste mesmo ciclo. */
  participantesProntos: boolean;
}

/**
 * Ajusta os dois refs ao detectar um ciclo de abertura novo (evento diferente, OU o MESMO
 * evento reaberto depois de fechado) e devolve, na MESMA chamada, se a lista já está
 * pronta — nunca com base numa marca de um ciclo anterior.
 *
 * `grupoId` indefinido/nulo (evento novo, sem participantes existentes para buscar) não
 * mexe em nada: o chamador nem liga a trava de Salvar nesse caso.
 */
export function ajustarCicloDeAberturaEProntidao(
  open: boolean,
  grupoId: string | null | undefined,
  consulta: ConsultaDeParticipantes,
  refsAtuais: RefsDoCicloDeAbertura,
): ResultadoDoCiclo {
  let { cicloAberto, marcaAntesDeBuscarDeNovo } = refsAtuais;

  if (!open) {
    // Fechado: esquece o ciclo processado. Sem isto, reabrir o MESMO evento não
    // recapturaria a marca — o `grupoId` "bateria" com o que já tinha sido processado
    // antes de fechar, e a marca ficaria presa no valor de uma abertura anterior.
    cicloAberto = null;
  } else if (grupoId && grupoId !== cicloAberto) {
    // Abriu um evento novo, OU reabriu o mesmo depois de ter sido fechado: recaptura a
    // marca AGORA, com o `dataUpdatedAt` desta mesma chamada — nunca o de um ciclo antigo.
    cicloAberto = grupoId;
    marcaAntesDeBuscarDeNovo = consulta.dataUpdatedAt;
  }

  const participantesProntos =
    consulta.isSuccess && !consulta.isFetching && consulta.dataUpdatedAt > marcaAntesDeBuscarDeNovo;

  return { cicloAberto, marcaAntesDeBuscarDeNovo, participantesProntos };
}

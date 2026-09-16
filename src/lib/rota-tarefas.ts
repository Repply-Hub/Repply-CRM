/**
 * Quais tarefas do próximo passo nascem depois de gravar uma rota de visita.
 *
 * 🔴 POR QUE ISTO É UMA FUNÇÃO PURA, e não código solto dentro do diálogo. A regra que decide
 * quando criar a tarefa tem uma armadilha — a duplicata — e a única forma de fixá-la em teste é
 * separá-la da tela. `NovaRotaVisitaDialog` só junta os dados (o que está na tela + o que estava
 * gravado) e chama isto; a decisão vive aqui.
 *
 * O GATILHO é a visita PASSAR a realizada NESTA gravação — nunca uma que já estava realizada
 * antes. É o mesmo cuidado da Tarefa 7a no painel da obra: reeditar ou remarcar (desmarcar →
 * marcar de novo, que a regra "desmarcar não apaga" tornou comum) traria de volta o próximo
 * passo já gravado, e sem a checagem de transição uma segunda tarefa idêntica nasceria calada.
 *
 * A caixinha `criarTarefa` (campo transitório de `RespostasDaVisita`) é a última palavra: quem
 * não quer a tarefa desmarca, um clique, antes de salvar. `respostasDaVisita` já a traz
 * desmarcada quando a parada reabre com próximo passo + data — outra rede contra a duplicata.
 */
import { tarefaDoProximoPasso, type RespostasDaVisita } from './analise-da-visita';

export interface ParadaParaTarefa {
  /** O `grupo_id` da parada gravada; ausente numa parada acrescentada agora, que nunca é realizada. */
  grupoId?: string | null;
  nomeObra: string;
  /** Cliente dono da obra, para ligar a tarefa a ele. Nulo é aceito (tarefa sem vínculo). */
  clienteId?: string | null;
  /** Como a parada está na tela agora. */
  realizada: boolean;
  respostas: RespostasDaVisita;
}

export interface ParadaGravadaParaTarefa {
  grupoId?: string | null;
  visitaRealizada?: boolean | null;
}

export type EspecificacaoDeTarefa = NonNullable<ReturnType<typeof tarefaDoProximoPasso>>;

/**
 * Devolve uma especificação de tarefa (`{ titulo, descricao, prazo_final, cliente_id }`) por
 * parada que PASSOU a realizada nesta gravação, com próximo passo + data e a caixinha marcada.
 *
 * @param editando  false ao CRIAR a rota (nenhuma parada estava realizada antes), true ao EDITAR.
 * @param jaRealizada  a chave "essas visitas já aconteceram" — só vale ao criar; marca TODAS as
 *   paradas como realizadas de uma vez.
 * @param paradas  as paradas como estão na tela.
 * @param paradasGravadas  as paradas como estavam no banco (só ao editar) — para saber quais já
 *   eram realizadas e NÃO gerar tarefa de novo por elas.
 */
export function tarefasDaRotaConcluida({
  editando,
  jaRealizada,
  paradas,
  paradasGravadas,
}: {
  editando: boolean;
  jaRealizada: boolean;
  paradas: ParadaParaTarefa[];
  paradasGravadas?: ParadaGravadaParaTarefa[];
}): EspecificacaoDeTarefa[] {
  // Quem já estava realizada antes, por grupo. Ao criar, ninguém estava.
  const eraRealizadaPorGrupo = new Map<string, boolean>();
  if (editando) {
    for (const g of paradasGravadas ?? []) {
      if (g.grupoId) eraRealizadaPorGrupo.set(g.grupoId, !!g.visitaRealizada);
    }
  }

  const tarefas: EspecificacaoDeTarefa[] = [];
  for (const parada of paradas ?? []) {
    // Ao criar, a chave do topo manda em todas; ao editar, cada parada tem o seu estado.
    const realizadaAgora = editando ? parada.realizada : jaRealizada;
    if (!realizadaAgora) continue;

    // 🔴 Parada NOVA acrescentada durante a edição (sem `grupoId`) NÃO gera tarefa: ela é gravada
    // pelo caminho de INSERIR, que a força a NÃO realizada (conserto de 16/09 em
    // NovaRotaVisitaDialog). A tela já esconde o "já realizada" dela — esta linha é a rede se a
    // tela regredir, para a função pura nunca criar uma tarefa por uma visita que na verdade
    // ficou planejada. (Ao CRIAR, parada sem grupo é o normal e `jaRealizada` já governa acima.)
    if (editando && !parada.grupoId) continue;

    // A transição: só conta quem NÃO estava realizada antes. Parada gravada olha o que o banco
    // tinha; se o grupo não aparece em `paradasGravadas`, trata como "não era" (transição).
    const eraRealizada = editando ? (eraRealizadaPorGrupo.get(parada.grupoId!) ?? false) : false;
    if (eraRealizada) continue;

    if (!parada.respostas?.criarTarefa) continue;

    const tarefa = tarefaDoProximoPasso({
      nomeObra: parada.nomeObra,
      clienteId: parada.clienteId ?? null,
      proximoPasso: parada.respostas.proximoPasso,
      proximoPassoEm: parada.respostas.proximoPassoEm,
    });
    // `tarefaDoProximoPasso` devolve `null` sem texto+data — sem os dois não há o que cobrar.
    if (tarefa) tarefas.push(tarefa);
  }

  return tarefas;
}

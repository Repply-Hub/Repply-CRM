/**
 * A análise que o vendedor deixa quando marca a visita como realizada.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 12/09/2026 havia UMA pergunta aberta ("O que você viu nesta
 * obra?") — e das 6 visitas marcadas como realizadas, só 2 tinham texto. Pergunta aberta é fácil
 * de pular. O desenho de 12/09/2026 trocou por quatro respostas rápidas, todas opcionais, cada
 * uma escolhida por servir para VENDER DEPOIS:
 *
 *   fase da obra .......... diz o que aquela obra vai comprar, e quando
 *   concorrente visto ..... diz quem está ganhando a obra, e com qual marca
 *   com quem falou ........ sem isso a próxima visita recomeça do zero
 *   próximo passo ......... a única resposta que vira trabalho futuro
 */

/** A ordem é a do canteiro, e é ela que a tela mostra. Vocabulário do ramo, não configuração. */
export const FASES_DA_OBRA = [
  { chave: 'fundacao', rotulo: 'Fundação' },
  { chave: 'estrutura', rotulo: 'Estrutura' },
  { chave: 'alvenaria', rotulo: 'Alvenaria' },
  { chave: 'instalacoes', rotulo: 'Instalações' },
  { chave: 'acabamento', rotulo: 'Acabamento' },
  { chave: 'entrega', rotulo: 'Entrega' },
] as const;

/** Rótulo da fase gravada. Chave desconhecida devolve vazio: melhor calar que inventar fase. */
export function rotuloDaFase(chave?: string | null): string {
  return FASES_DA_OBRA.find((f) => f.chave === (chave ?? '').trim())?.rotulo ?? '';
}

/**
 * O rascunho das respostas na tela — o que `PerguntasDaVisita` lê e escreve, antes de virar
 * as cinco colunas gravadas em `eventos`. Fica aqui, e não no componente: `useMarcarVisitaRealizada`
 * (um hook, não um componente) também precisa do tipo para aceitar `respostas` no `mutate`.
 */
export interface RespostasDaVisita {
  fase: string;
  concorrentes: string;
  contatoId: string;
  proximoPasso: string;
  proximoPassoEm: string;
  observacao: string;
  /**
   * 🔴 CAMPO TRANSITÓRIO — decisão passageira da TELA (criar ou não a tarefa do próximo
   * passo), NUNCA uma coluna do banco. `eventos` guarda só as cinco respostas acima;
   * `useMarcarVisitaRealizada` lê esta chave para decidir se monta `tarefaDoProximoPasso`, mas
   * ela não entra no `payload` de gravação da visita. A visita gravada não guarda esta escolha:
   * `respostasDaVisita` a REDECIDE ao reabrir — marcada quando ainda não havia próximo passo com
   * data (a tarefa é a novidade), desmarcada quando já havia (a tarefa já pôde nascer antes, e
   * remarcar a visita não pode duplicá-la). Ver o comentário em `respostasDaVisita`.
   */
  criarTarefa: boolean;
}

export const RESPOSTAS_VAZIAS: RespostasDaVisita = {
  fase: '',
  concorrentes: '',
  contatoId: '',
  proximoPasso: '',
  proximoPassoEm: '',
  observacao: '',
  // O padrão do produto é criar a tarefa — mesmo espírito da caixinha "Retomar depois"
  // (`DialogoRetorno.tsx`): quem não quer desmarca, um clique, antes de salvar.
  criarTarefa: true,
};

/**
 * Monta o rascunho a partir do que a visita já tem gravado — nulo e indefinido viram string
 * vazia, nunca a palavra "null" (o `<Input>` mostraria isso literalmente na tela).
 */
export function respostasDaVisita(
  v?: {
    visitaFase?: string | null;
    visitaConcorrentes?: string | null;
    visitaContatoId?: string | null;
    visitaProximoPasso?: string | null;
    visitaProximoPassoEm?: string | null;
    visitaObservacao?: string | null;
  } | null,
): RespostasDaVisita {
  return {
    fase: v?.visitaFase ?? '',
    concorrentes: v?.visitaConcorrentes ?? '',
    contatoId: v?.visitaContatoId ?? '',
    proximoPasso: v?.visitaProximoPasso ?? '',
    proximoPassoEm: v?.visitaProximoPassoEm ?? '',
    observacao: v?.visitaObservacao ?? '',
    // 🔴 A CAIXINHA NASCE DESMARCADA quando a visita JÁ TINHA um próximo passo COM DATA — porque
    // então a tarefa já pôde ser criada uma vez, e oferecer marcada de novo duplicaria. O caminho
    // real é desmarcar → remarcar (a regra "desmarcar não apaga" de 16/09 mantém as respostas
    // gravadas): ao remarcar, a data e o passo voltam preenchidos, e uma segunda tarefa idêntica
    // nasceria sem ninguém pedir. Quem quiser mesmo uma nova tarefa remarca a caixinha — um clique.
    // Nasce MARCADA quando ainda não havia próximo passo com data (primeira vez de verdade, ou a
    // visita ganhando a data agora): aí a tarefa é a novidade que este trabalho veio criar.
    criarTarefa: !(v?.visitaProximoPasso && v?.visitaProximoPassoEm),
  };
}

export interface AnaliseDaVisita {
  fase?: string | null;
  concorrentes?: string | null;
  contatoNome?: string | null;
  proximoPasso?: string | null;
  /** `AAAA-MM-DD`, como vem do campo de data. */
  proximoPassoEm?: string | null;
  observacao?: string | null;
}

const texto = (valor?: string | null) => (typeof valor === 'string' ? valor.trim() : '');

/** `AAAA-MM-DD` vira `20/09`. Sem `new Date`: a data é texto e nenhum fuso encosta nela. */
function diaEMes(data?: string | null): string {
  const [ano, mes, dia] = texto(data).split('-');
  return ano && mes && dia ? `${dia}/${mes}` : '';
}

/** As linhas prontas da análise — a mensagem do WhatsApp só as indenta e junta. */
export function resumoDaAnalise(analise?: AnaliseDaVisita | null): string[] {
  if (!analise) return [];
  const linhas: string[] = [];

  const fase = rotuloDaFase(analise.fase);
  if (fase) linhas.push(`Fase: ${fase}`);

  const concorrente = texto(analise.concorrentes);
  if (concorrente) linhas.push(`Concorrente: ${concorrente}`);

  const contato = texto(analise.contatoNome);
  if (contato) linhas.push(`Falou com: ${contato}`);

  const passo = texto(analise.proximoPasso);
  if (passo) {
    const quando = diaEMes(analise.proximoPassoEm);
    linhas.push(quando ? `Próximo passo: ${passo} (até ${quando})` : `Próximo passo: ${passo}`);
  }

  const observacao = texto(analise.observacao);
  if (observacao) linhas.push(`Obs.: ${observacao}`);

  return linhas;
}

/**
 * A tarefa do próximo passo — ou `null` quando não há o que cobrar.
 *
 * 🔴 SÓ COM DATA. Tarefa sem prazo não aparece em lista nenhuma de cobrança e vira registro
 * morto, que é justamente o que este trabalho veio resolver.
 *
 * A tarefa liga ao CLIENTE da obra: `tarefas` não tem coluna de obra (medido em 12/09/2026), e
 * criar uma mexeria na tela de tarefas inteira. O nome da obra vai no título, que é onde quem lê
 * a lista procura.
 */
export function tarefaDoProximoPasso({
  nomeObra,
  clienteId,
  proximoPasso,
  proximoPassoEm,
}: {
  nomeObra?: string | null;
  clienteId?: string | null;
  proximoPasso?: string | null;
  proximoPassoEm?: string | null;
}): { titulo: string; descricao: string; prazo_final: string; cliente_id: string | null } | null {
  const passo = texto(proximoPasso);
  const data = texto(proximoPassoEm);
  if (!passo || !data) return null;

  return {
    titulo: `Próximo passo — ${texto(nomeObra) || 'obra sem nome'}`,
    descricao: passo,
    // Âncora de meio-dia, o padrão da casa para data que vira carimbo (CLAUDE.md §7.12): às
    // 00:00 qualquer deslocamento de fuso joga a tarefa para o dia anterior.
    prazo_final: `${data}T12:00:00`,
    cliente_id: clienteId ?? null,
  };
}

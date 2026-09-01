/**
 * O que mudou entre a rota que está NO BANCO e a rota que a pessoa acabou de editar NA TELA.
 *
 * POR QUE ISTO EXISTE. Até aqui a tela só sabia CRIAR rota. Para poder EDITAR uma rota já
 * salva, alguém precisa decidir, parada por parada, o que virou UPDATE, o que virou DELETE e
 * o que virou INSERT. Esta é a decisão — pura, sem banco, para poder ser fixada em teste.
 *
 * COMO A ROTA VIVE NO BANCO (medido em 27/08/2026):
 *
 *   NÃO existe tabela de rota. Cada parada é uma linha (ou várias) na tabela `eventos`.
 *   Cada parada tem o seu PRÓPRIO `grupo_id`; `grupo_id` quer dizer "mesmo compromisso,
 *   vários participantes" — uma linha por participante, todas com o mesmo `grupo_id`.
 *
 *   linhas de evento .......................... 251
 *   compromissos de verdade ................... 160
 *   compromissos com mais de uma cópia ......... 17
 *   maior número de cópias de um compromisso ... 11
 *
 * É por isso que `remover` devolve GRUPO, não linha: quem chama tem de apagar TODAS as cópias
 * daquele grupo. Apagar só a linha que a tela carregou deixaria as outras 10 órfãs na agenda
 * dos colegas — a parada continuaria aparecendo para eles depois de a pessoa tê-la tirado.
 *
 * 🔴 A REGRA QUE NÃO PODE SER QUEBRADA: editar a rota NÃO PODE APAGAR o que já foi registrado.
 * A parada guarda `visita_realizada` e `visita_observacao`. Se a Fabíola já marcou "Residencial
 * Mares" como visitada e escreveu "cliente pediu orçamento de porcelanato", e depois abre a
 * rota só para corrigir o horário de OUTRA parada, o caminho ingênuo — apagar as paradas todas
 * e recriar — leva junto a observação dela. A perda é SILENCIOSA: nenhum erro na tela, nada no
 * log, e só se descobre semanas depois, quando a anotação faz falta e não está mais lá.
 *
 * A preservação acontece por OMISSÃO: esta diferença não menciona `visitaRealizada` nem
 * `visitaObservacao` em lugar nenhum, e a parada que não mudou não entra em lista nenhuma.
 * Campo que o diff não cita é campo que o UPDATE não escreve. Se um dia alguém acrescentar
 * esses dois campos aqui "só para completar o objeto", o UPDATE passa a sobrescrevê-los com o
 * que a tela tinha em memória — e o registro de campo vira nulo sem ninguém pedir.
 */

/** Uma parada como ela está NO BANCO. */
export interface ParadaGravada {
  grupoId: string;
  obraId: string;
  inicio: Date;
  visitaRealizada: boolean;
  visitaObservacao: string | null;
}

/** Uma parada como ela está NA TELA depois da edição. */
export interface ParadaEditada {
  /** Preenchido quando a linha veio do banco; ausente quando a pessoa acrescentou agora. */
  grupoId?: string | null;
  obraId: string;
  /** "09:00" */
  horario: string;
  /**
   * O registro de campo, quando a pessoa mexeu nele nesta edição.
   *
   * 🔴 AUSENTE (`undefined`) SIGNIFICA "NÃO MEXA", NUNCA "APAGUE". É este contrato que deixa
   * alguém corrigir o horário de uma parada sem passar por cima da anotação escrita em OUTRA —
   * a proteção que o cabeçalho de `useEditarRotaDeVisita` descreve.
   *
   * `null` e `undefined` são coisas DIFERENTES aqui: `null` é apagar de propósito.
   */
  visitaRealizada?: boolean;
  visitaObservacao?: string | null;
}

export interface DiferencaDaRota {
  /**
   * Paradas que continuam, com o que mudou nelas.
   *
   * 🔴 `visitaRealizada` e `visitaObservacao` só APARECEM quando mudaram. Quem grava precisa
   * mandar ao banco exatamente as chaves presentes: escrever as ausentes como `false`/`null`
   * apagaria a anotação de campo de paradas que ninguém tocou.
   */
  alterar: Array<{
    grupoId: string;
    inicio: Date;
    fim: Date;
    visitaRealizada?: boolean;
    visitaObservacao?: string | null;
  }>;
  /** Paradas que saíram da rota: apagar TODAS as cópias destes grupos. */
  remover: string[];
  /** Paradas novas. */
  inserir: Array<{ obraId: string; inicio: Date; fim: Date }>;
  /** Nada mudou de fato — a tela pode fechar sem tocar no banco. */
  semMudanca: boolean;
}

/** Uma visita dura uma hora quando ninguém diz o contrário. */
const DURACAO_PADRAO_MINUTOS = 60;

const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORARIO = /^(\d{1,2}):(\d{2})$/;

const MINUTO_EM_MS = 60 * 1000;

/**
 * Monta o instante da parada a partir da data da rota ("2026-08-27") e do horário digitado
 * ("09:00").
 *
 * 🔴 NUNCA use `new Date('2026-08-27')`. Com data solta o JavaScript lê UTC, e no horário de
 * Brasília (UTC-3) isso devolve 26/08 às 21h — a rota inteira anda um dia para trás, e a
 * parada da manhã de segunda aparece na noite de domingo. Por isso o instante é montado peça
 * por peça com `new Date(ano, mês - 1, dia, hora, minuto)`, que lê o fuso LOCAL, o mesmo em
 * que a pessoa digitou.
 *
 * Devolve `null` — nunca uma Data inválida — quando a entrada não serve. Data inválida é
 * veneno: ela atravessa a função inteira sem reclamar, chega ao banco como `null` ou como
 * "Invalid Date" e só aparece na tela como parada sem horário.
 */
function montarInstante(data: string, horario: string): Date | null {
  const partesData = FORMATO_DATA.exec(String(data ?? '').trim());
  const partesHorario = FORMATO_HORARIO.exec(String(horario ?? '').trim());
  if (!partesData || !partesHorario) return null;

  const ano = Number(partesData[1]);
  const mes = Number(partesData[2]);
  const dia = Number(partesData[3]);
  const hora = Number(partesHorario[1]);
  const minuto = Number(partesHorario[2]);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (hora > 23 || minuto > 59) return null;

  const instante = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);

  // 🔴 "2026-02-31" não vira Data inválida: o JavaScript vira a página do calendário calado e
  // entrega 03/03. Sem esta conferência, um dia que não existe viraria uma parada em março.
  if (
    instante.getFullYear() !== ano ||
    instante.getMonth() !== mes - 1 ||
    instante.getDate() !== dia
  ) {
    return null;
  }

  return instante;
}

/** A parada gravada só entra em `alterar` se o instante dela mudou DE FATO. */
function instanteMudou(gravado: Date, novo: Date): boolean {
  const antes = gravado instanceof Date ? gravado.getTime() : Number.NaN;
  // Parada gravada sem início legível é caso de corrigir, não de ignorar: mandamos o horário
  // novo para ela ganhar hora em vez de continuar solta na agenda.
  if (Number.isNaN(antes)) return true;
  return antes !== novo.getTime();
}

export function diferencaDaRota(
  gravadas: ParadaGravada[],
  editadas: ParadaEditada[],
  /** A data da rota, no formato "yyyy-MM-dd". */
  data: string,
  duracaoMinutos: number = DURACAO_PADRAO_MINUTOS,
): DiferencaDaRota {
  const vazio: DiferencaDaRota = { alterar: [], remover: [], inserir: [], semMudanca: true };

  // Lista nula não pode explodir: a tela chama isto no meio da digitação, com o carregamento
  // ainda pela metade.
  const listaGravada = (Array.isArray(gravadas) ? gravadas : []).filter(Boolean);
  const listaEditada = (Array.isArray(editadas) ? editadas : []).filter(Boolean);

  const duracao =
    Number.isFinite(duracaoMinutos) && duracaoMinutos > 0
      ? duracaoMinutos
      : DURACAO_PADRAO_MINUTOS;

  // 🔴 Data da rota ilegível: devolve "nada a fazer" em vez de seguir em frente. Se seguisse,
  // NENHUMA parada editada viraria instante — todas cairiam no descarte logo abaixo, `alterar` e
  // `inserir` sairiam vazios, e sobraria de pé só a metade DESTRUTIVA do diff: a remoção das
  // paradas que a pessoa tirou da tela. O parâmetro malformado gravaria as exclusões e engoliria
  // caladas, na mesma edição, as correções de horário e as paradas novas.
  //
  // Medido por mutação em 27/08/2026, porque a frase que estava aqui antes mentia: sem esta
  // linha a rota NÃO some inteira. As paradas que continuam na tela são salvas pela preservação
  // do horário ilegível (logo abaixo), que as marca como preservadas mesmo sem instante. O
  // estrago é a metade destrutiva passar sozinha — mais difícil de perceber que a rota vazia,
  // não menor.
  if (!montarInstante(data, '00:00')) return vazio;

  // Uma entrada por COMPROMISSO. As 251 linhas do banco viram 160 grupos aqui, e é por isso
  // que `remover` cita cada grupo uma vez só, mesmo quando ele tem 11 cópias.
  const porGrupo = new Map<string, ParadaGravada>();
  for (const parada of listaGravada) {
    if (parada.grupoId) porGrupo.set(parada.grupoId, parada);
  }

  const alterar: DiferencaDaRota['alterar'] = [];
  const inserir: DiferencaDaRota['inserir'] = [];

  /** Grupos que continuam na rota — mesmo os descartados por horário inválido. */
  const gruposPreservados = new Set<string>();
  /** Grupos que já foram decididos nesta passagem, para a linha repetida não sobrescrevê-los. */
  const gruposDecididos = new Set<string>();

  for (const parada of listaEditada) {
    const grupoId = parada.grupoId || null;
    const instante = montarInstante(data, parada.horario);

    if (!instante) {
      // Horário vazio, "abc" ou "25:00": a parada é DESCARTADA e não entra em lista nenhuma.
      // 🔴 Incluindo a lista de remoção. O grupo dela fica preservado de propósito: mandar
      // para `remover` a parada cujo horário a pessoa deixou pela metade apagaria do banco,
      // junto com a linha, a visita já marcada como realizada e a observação escrita nela —
      // por causa de um campo que ela ainda ia terminar de digitar.
      if (grupoId) gruposPreservados.add(grupoId);
      continue;
    }

    const fim = new Date(instante.getTime() + duracao * MINUTO_EM_MS);
    const gravada = grupoId ? porGrupo.get(grupoId) : undefined;

    // 🔴 grupoId fantasma (veio na tela, não existe no banco) entra como INSERIR, nunca como
    // alterar. Um UPDATE por grupo inexistente afeta 0 linhas e o Postgres não chama isso de
    // erro: a gravação "dá certo", a tela fecha satisfeita e a parada simplesmente não existe
    // — sem nada, em lugar nenhum, dizendo o que houve.
    // O grupo repetido na mesma edição cai aqui pela mesma razão: dois UPDATEs no mesmo grupo
    // deixariam só o último, e a parada duplicada sumiria calada.
    if (!gravada || gruposDecididos.has(grupoId)) {
      inserir.push({ obraId: parada.obraId, inicio: instante, fim });
      continue;
    }

    gruposPreservados.add(grupoId);
    gruposDecididos.add(grupoId);

    // Parada intocada não entra em lugar nenhum: é assim que a observação de campo sobrevive
    // a uma edição que só mexeu no horário de outra parada.
    //
    // 🔴 LIMITE CONHECIDO: só o INSTANTE é comparado. `alterar` não carrega `obraId`, então
    // trocar a OBRA de uma parada que já existe não vira mudança nenhuma aqui — a pessoa
    // trocaria "Residencial Mares" por "Alphaville" na tela e o banco continuaria com Mares.
    // Enquanto isto for verdade, a tela NÃO pode deixar trocar a obra de uma parada já salva:
    // ela tira a parada e põe outra, que aí vira remover + inserir. O teste
    // "trocar a obra de uma parada gravada não vira alteração" fixa este comportamento para
    // que a decisão apareça quando alguém for mudá-la.
    // O registro de campo (realizada / observação) só entra quando a pessoa MUDOU alguma coisa
    // nele nesta edição. As chaves são acrescentadas uma a uma, e não com um objeto de valores
    // `undefined`, porque quem grava monta o UPDATE a partir das chaves PRESENTES — um
    // `visitaObservacao: undefined` viajando junto viraria "apague a observação".
    const registro: { visitaRealizada?: boolean; visitaObservacao?: string | null } = {};
    if (
      parada.visitaRealizada !== undefined &&
      parada.visitaRealizada !== gravada.visitaRealizada
    ) {
      registro.visitaRealizada = parada.visitaRealizada;
    }
    if (
      parada.visitaObservacao !== undefined &&
      // `null` e `''` significam a mesma coisa no banco (a coluna guarda nulo), então
      // comparar sem normalizar faria a tela mandar UPDATE toda vez que alguém abrisse e
      // fechasse a edição de uma parada sem anotação.
      (parada.visitaObservacao || null) !== (gravada.visitaObservacao || null)
    ) {
      registro.visitaObservacao = parada.visitaObservacao;
    }
    const registroMudou = Object.keys(registro).length > 0;

    if (instanteMudou(gravada.inicio, instante) || registroMudou) {
      alterar.push({ grupoId, inicio: instante, fim, ...registro });
    }
  }

  // Editadas vazia com gravadas cheia significa "remover tudo" — é resultado legítimo, a
  // pessoa esvaziou a rota. Quem chama é que precisa confirmar com ela antes de gravar.
  const remover = [...porGrupo.keys()].filter((grupoId) => !gruposPreservados.has(grupoId));

  return {
    alterar,
    remover,
    inserir,
    semMudanca: alterar.length === 0 && remover.length === 0 && inserir.length === 0,
  };
}

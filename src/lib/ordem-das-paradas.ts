/**
 * A ordem das paradas de uma rota de visita — e a garantia de que ela nunca fica sem lógica.
 *
 * 🔴 O DEFEITO QUE ISTO CONSERTA (relatado pelo Lucas em 28/08/2026).
 *
 * O formulário da rota deixa arrastar as paradas e deixa digitar o horário de cada uma, e as
 * duas ações mexiam em coisas diferentes sem se falar:
 *
 *   - arrastar movia a linha na lista e **não tocava nos horários**;
 *   - digitar o horário trocava o número e **não movia a linha**.
 *
 * Bastava arrastar a parada das 11h para o topo para a lista virar `11h, 09h, 10h` — um
 * roteiro que ninguém dirige. E o estrago não parava na tela do formulário: a rota GRAVADA é
 * remontada por horário (`rota-do-dia.ts` ordena por `inicio`), então o que a pessoa via ao
 * montar não era o que ela veria depois de salvar. Duas ordens para a mesma rota.
 *
 * A REGRA, agora, é uma só: **de cima para baixo, do mais cedo para o mais tarde.** Sempre.
 * As duas funções abaixo existem para que as duas ações cheguem nesse mesmo lugar.
 */

export interface ParadaOrdenavel {
  obraId: string;
  /** HH:mm, no fuso local — é o que a pessoa digita na tela. */
  horario: string;
}

/**
 * Minutos desde a meia-noite. Compara horário como NÚMERO, e não como texto.
 *
 * 🔴 Texto quase funciona e é por isso que engana: `'09:00' < '10:00'` é verdadeiro, mas
 * `'9:00' < '10:00'` é **falso** — em ordem alfabética o `9` vem depois do `1`. O campo da
 * tela é `type="time"` e sempre entrega dois dígitos, mas uma rota importada, um valor colado
 * ou um formato futuro não têm essa garantia, e o sintoma seria uma parada teimando em ficar
 * no lugar errado sem ninguém entender por quê.
 */
function emMinutos(horario: string): number {
  const [h, m] = (horario ?? '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + m;
}

/**
 * Ordena as paradas do mais cedo para o mais tarde.
 *
 * Empate mantém a ordem em que já estavam: `Array.prototype.sort` é estável, e duas visitas
 * marcadas para o mesmo horário não podem ficar trocando de lugar a cada tecla digitada.
 *
 * Horário vazio ou inválido vai para o FIM em vez de sumir ou quebrar a comparação — parada
 * que o usuário ainda não terminou de preencher continua visível, no lugar menos atrapalhado.
 */
export function ordenarPorHorario<T extends ParadaOrdenavel>(paradas: readonly T[]): T[] {
  return [...paradas].sort((a, b) => emMinutos(a.horario) - emMinutos(b.horario));
}

/**
 * Move uma parada de posição e **redistribui os horários** para que a ordem visual continue
 * sendo a ordem do relógio.
 *
 * 🔴 OS HORÁRIOS SÃO REDISTRIBUÍDOS, NÃO CARREGADOS JUNTO. Este é o ponto da função, e a
 * decisão que faz o arrastar significar alguma coisa.
 *
 * Arrastar quer dizer *"quero visitar esta obra nesta posição do dia"* — não *"quero levar o
 * horário dela junto"*. Se a parada carregasse o próprio horário, arrastar a das 14h para o
 * topo daria `14h, 09h, 10h`: a lista mudaria e o roteiro continuaria impossível, que é
 * exatamente o defeito de 28/08/2026.
 *
 * O CONJUNTO de horários é preservado — só muda quem ocupa cada faixa. Isso importa para quem
 * marcou horários irregulares de propósito (`09:00, 09:30, 15:00`, porque a terceira obra é
 * longe): a grade continua a mesma, e só a obra de cada faixa muda.
 *
 * Índice fora da lista devolve a lista intacta, em vez de embaralhar: `@hello-pangea/dnd`
 * entrega `destination` nulo quando a pessoa solta fora da área, e um `splice` com índice
 * inválido apagaria a parada errada em silêncio.
 */
export function moverParadaMantendoHorarios<T extends ParadaOrdenavel>(
  paradas: readonly T[],
  de: number,
  para: number,
): T[] {
  const total = paradas.length;
  if (de < 0 || de >= total || para < 0 || para >= total || de === para) {
    return [...paradas];
  }

  // A grade de horários, na ordem em que ela existe hoje — é ela que fica parada.
  const grade = ordenarPorHorario(paradas).map((p) => p.horario);

  const movidas = [...paradas];
  const [movida] = movidas.splice(de, 1);
  movidas.splice(para, 0, movida);

  return movidas.map((parada, indice) => ({ ...parada, horario: grade[indice] }));
}

/**
 * O horário da última parada do dia — ignorando as que estão sem horário preenchido.
 * Devolve `null` quando nenhuma parada tem horário utilizável.
 *
 * 🔴 EXISTE POR CAUSA DE UM DEFEITO MEU, e o sintoma era uma obra nascendo À 1 DA MANHÃ.
 *
 * `adicionarParada` sugere "a última + 1 hora". Quando passou a olhar a lista ORDENADA em vez
 * do fim do array, herdou junto a regra de que parada sem horário vai para o fim — então a
 * parada vazia virava a referência. E `somarMinutos('')` não reclama: `Number('')` é zero, a
 * base vira meia-noite, e a obra nova nasce `01:00`.
 *
 * O caminho é trivial de percorrer sem querer: a pessoa apaga o horário de uma parada para
 * redigitar, lembra de outra obra, adiciona — e a obra nova entra de madrugada, no meio de uma
 * rota das nove às onze.
 *
 * Medido em 28/08/2026: com `[09:00, (vazio), 11:00]`, a parada nova nascia `01:00`. Antes da
 * mudança nascia `12:00`, porque a referência era o fim do array.
 */
export function ultimoHorarioUtilizavel(paradas: readonly ParadaOrdenavel[]): string | null {
  const comHorario = ordenarPorHorario(paradas).filter(
    (p) => emMinutos(p.horario) !== Number.MAX_SAFE_INTEGER,
  );
  return comHorario.length > 0 ? comHorario[comHorario.length - 1].horario : null;
}

/**
 * A lista está em ordem crescente de horário?
 *
 * Serve de guarda: se um dia alguma tela devolver uma ordem que não respeita o relógio, é
 * melhor a gente saber por um teste do que pelo Lucas olhando a tela.
 */
export function estaEmOrdemCrescente(paradas: readonly ParadaOrdenavel[]): boolean {
  for (let i = 1; i < paradas.length; i++) {
    if (emMinutos(paradas[i].horario) < emMinutos(paradas[i - 1].horario)) return false;
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────────
 * A MESMA REGRA, do outro lado: o CARD da aba Visitas.
 *
 * As funções acima cuidam do formulário (horário como texto "HH:mm", digitado pela pessoa).
 * As de baixo cuidam da EXIBIÇÃO da rota já gravada (instante ISO, vindo do banco). São
 * dados diferentes, mas a promessa ao Lucas é uma só: de cima para baixo, do mais cedo para
 * o mais tarde.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface VisitaAgrupavel {
  id: string;
  /** Instante ISO, como o banco devolve. */
  inicio: string;
}

export interface DiaDeVisitas<T> {
  /** `yyyy-MM-dd` — a chave do agrupamento. */
  chave: string;
  dia: Date;
  visitasDoDia: T[];
}

/**
 * Agrupa as visitas por dia: os DIAS do mais recente para o mais antigo, as visitas DENTRO
 * de cada dia do mais cedo para o mais tarde.
 *
 * 🔴 AS DUAS ORDENS SÃO OPOSTAS DE PROPÓSITO, e confundi-las é o defeito que isto conserta
 * (relatado pelo Lucas em 28/08/2026).
 *
 * A consulta pede `inicio` DECRESCENTE (`use-obra-visitas.ts:137`), e o painel só agrupava
 * "preservando a ordem que veio do banco". Para os dias isso é o certo — a agenda abre no que
 * está por vir e no que acabou de acontecer, não em agosto de 2024. Mas dentro do dia a mesma
 * ordem lista a rota DE TRÁS PARA A FRENTE: `16h, 14h, 09h`. O card mostrava o roteiro
 * invertido, e o formulário que o criou mostrava certo.
 *
 * Empate de horário cai no `id` só para a saída não variar entre duas execuções — mesmo
 * critério de `rota-do-dia.ts:207`, que ordena as paradas do mapa.
 *
 * A ordem dos DIAS é cravada aqui, e não herdada da consulta. Herdar era o que estava frágil:
 * quem um dia mexesse no `.order()` do hook remexeria as duas coisas sem perceber, e a
 * metade visível do estrago (o dia errado no topo) esconderia a outra.
 */
export function agruparVisitasPorDia<T extends VisitaAgrupavel>(
  visitas: readonly T[],
  /** Recebe a visita e devolve a chave do dia (`yyyy-MM-dd`) — quem chama traz seu formatador. */
  chaveDoDia: (inicio: Date) => string,
): DiaDeVisitas<T>[] {
  const mapa = new Map<string, DiaDeVisitas<T>>();

  for (const visita of visitas ?? []) {
    const dia = new Date(visita.inicio);
    const chave = chaveDoDia(dia);
    const grupo = mapa.get(chave);
    if (grupo) grupo.visitasDoDia.push(visita);
    else mapa.set(chave, { chave, dia, visitasDoDia: [visita] });
  }

  const dias = [...mapa.values()];

  for (const grupo of dias) {
    grupo.visitasDoDia.sort(
      (a, b) =>
        new Date(a.inicio).getTime() - new Date(b.inicio).getTime() || a.id.localeCompare(b.id),
    );
  }

  // O dia mais recente primeiro. Empate é impossível (a chave é única por dia), mas a
  // comparação por texto `yyyy-MM-dd` ordena certo e não depende de fuso.
  dias.sort((a, b) => b.chave.localeCompare(a.chave));

  return dias;
}

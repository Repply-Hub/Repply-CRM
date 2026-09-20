import {
  format,
  parse,
  isValid,
  addMinutes,
  addDays,
  differenceInMinutes,
  differenceInCalendarDays,
} from 'date-fns';

/**
 * Campo de data/hora dos formulários de Agenda e Tarefas, sempre no fuso de quem usa.
 *
 * O DEFEITO QUE ISTO CONSERTA — medido em produção, mesma família do CLAUDE.md §7.12.
 * `EventDialog` e `TarefaFormDialog` montavam o campo `datetime-local` recortando
 * `Date.toISOString()` (que lê UTC) e, ao salvar, liam esse texto como se fosse hora LOCAL
 * (`new Date(texto).toISOString()`). No Brasil (UTC-3) isso soma 3 horas a cada edição: um
 * evento das 17h aparecia como 20h no campo, e salvar sem mudar nada gravava 20h de verdade.
 * Em evento de dia inteiro, o fim `23:59:59` local virava o dia seguinte em UTC — cada edição
 * empurrava o fim um dia.
 *
 * A regra, igual à de `src/lib/data-local.ts`: escolha uma família só, nunca misture. Aqui é
 * sempre `format()`/`parse()` do date-fns, que leem e escrevem no fuso local — nunca
 * `toISOString()` dentro deste arquivo.
 */

/**
 * Um `Date` como texto de campo `datetime-local` (`yyyy-MM-ddTHH:mm`), no fuso local — o mesmo
 * formato que `defaultForm` do `EventDialog` já usa para o formulário de evento novo.
 */
export function paraCampoDataHora(data: Date): string {
  return format(data, "yyyy-MM-dd'T'HH:mm");
}

/** Um `Date` como texto de campo `date` (`yyyy-MM-dd`), no fuso local. */
export function paraCampoData(data: Date): string {
  return format(data, 'yyyy-MM-dd');
}

/**
 * Lê o texto de um campo (`datetime-local` ou `date`) como hora LOCAL — a mesma leitura que
 * `EventDateTimeField` já faz para decidir se o que a pessoa digitou é uma data válida.
 * Texto vazio ou incompleto (rascunho enquanto a pessoa ainda digita) devolve `null`.
 */
function paraData(texto: string, diaInteiro: boolean): Date | null {
  if (!texto) return null;
  const formato = diaInteiro ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
  const data = parse(texto, formato, new Date());
  return isValid(data) ? data : null;
}

/**
 * O novo texto do campo Fim quando o campo Início muda — "leva o fim junto", como no Google
 * Agenda: o fim mantém a MESMA duração que já havia entre início e fim antigos. Mudar o fim
 * nunca chama esta função (só o `onChange` do Início chama); por isso ela nunca mexe no início.
 *
 * - **Início novo ilegível** (texto parcial, a pessoa ainda está digitando): devolve o fim
 *   atual sem mexer — só quando o texto fecha um valor de verdade é que há o que recalcular.
 * - **Duração válida** (início antigo, início novo e fim atual todos legíveis, e o fim atual
 *   não é anterior ao início antigo): soma essa mesma duração ao início novo — em minutos no
 *   evento com hora, em dias no de dia inteiro.
 * - **Qualquer outro caso** (fim atual vazio, ilegível, ou antes do início antigo — formulário
 *   nasceu assim ou ficou inconsistente): mesmo padrão do `defaultForm` do `EventDialog` — 1h
 *   depois do novo início no evento com hora, a mesma data do novo início em dia inteiro.
 */
export function novoFimAoMudarInicio(
  inicioAntigo: string,
  inicioNovo: string,
  fimAtual: string,
  diaInteiro: boolean,
): string {
  const novoInicio = paraData(inicioNovo, diaInteiro);
  if (!novoInicio) return fimAtual;

  const velhoInicio = paraData(inicioAntigo, diaInteiro);
  const velhoFim = paraData(fimAtual, diaInteiro);
  const duracaoValida = !!velhoInicio && !!velhoFim && velhoFim.getTime() >= velhoInicio.getTime();

  if (duracaoValida) {
    if (diaInteiro) {
      const dias = differenceInCalendarDays(velhoFim as Date, velhoInicio as Date);
      return paraCampoData(addDays(novoInicio, dias));
    }
    const minutos = differenceInMinutes(velhoFim as Date, velhoInicio as Date);
    return paraCampoDataHora(addMinutes(novoInicio, minutos));
  }

  return diaInteiro ? paraCampoData(novoInicio) : paraCampoDataHora(addMinutes(novoInicio, 60));
}

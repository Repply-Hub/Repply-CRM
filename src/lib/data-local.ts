import { format } from 'date-fns';

/**
 * Datas no fuso de quem usa o sistema.
 *
 * O JavaScript converte para UTC sem avisar, e o Brasil está três horas atrás: das 21h à
 * meia-noite, "hoje" em UTC já é amanhã (CLAUDE.md §7.12). As funções daqui existem porque os
 * idiomas mais digitados do projeto caíam nessa conta — ver `data-local.test.ts`.
 */

/**
 * A data de hoje como texto `AAAA-MM-DD`, no fuso de quem usa: o que se grava numa coluna de data
 * e o que vai no nome de um arquivo exportado.
 *
 * No lugar de recortar os 10 primeiros caracteres de `new Date().toISOString()`, que é a hora em
 * UTC — às 22h30 de 11/09 em Natal, o recorte já diz 12/09. `src/test/hoje-no-fuso-local.test.ts`
 * falha se o idioma voltar.
 */
export function hojeLocal(agora: Date = new Date()): string {
  return format(agora, 'yyyy-MM-dd');
}

/**
 * `dd/MM/aaaa` para mostrar na tela, venha a data como vier do banco:
 *
 *   · data seca (`AAAA-MM-DD`: coluna `date`, ou texto importado): só reescrita, SEM passar por
 *     `Date` — `new Date('2026-09-01')` é meia-noite UTC, e no Brasil vira 31/08;
 *   · carimbo com hora (`created_at` e afins): levado ao fuso de quem olha. Recortar o texto
 *     pegaria o dia em UTC, e um cadastro das 22h30 apareceria com o dia seguinte;
 *   · carimbo que o navegador não sabe ler: o recorte, como era antes — melhor um dia que pode
 *     estar adiantado do que o texto cru na tela;
 *   · qualquer outra coisa (texto livre de planilha, "15/03/2024"): volta como veio.
 */
export function formatarDataBR(valor: string | null | undefined): string {
  if (!valor) return '';
  const prefixo = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!prefixo) return valor;
  const [, ano, mes, dia] = prefixo;
  const recorte = `${dia}/${mes}/${ano}`;
  if (valor.length === 10) return recorte;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? recorte : format(instante, 'dd/MM/yyyy');
}

/**
 * A data que a pessoa escolheu, como `Date` posicionado NO DIA CERTO — a "âncora de meio-dia"
 * do CLAUDE.md §7.12.
 *
 * `new Date('2026-09-01')` é meia-noite em UTC, que no Brasil é 21h de 31/08: a data cai na
 * véspera, e no dia 1º cai no mês anterior. Ancorar ao MEIO do dia deixa a data longe das duas
 * bordas de fuso, então ela não escorrega para nenhum lado.
 *
 * Serve para os dois jeitos de guardar uma data sem hora que existem no banco:
 *   · coluna `date` (`prazo_resposta`): chega como `AAAA-MM-DD`;
 *   · carimbo gravado à meia-noite em UTC (`historico_contatos.proximo_contato_em`): chega como
 *     `AAAA-MM-DDT00:00:00+00:00`, e o dia que vale é o da parte da data.
 *
 * NÃO use em carimbo com hora de verdade (`created_at`): ali a hora é informação, e jogá-la para
 * meio-dia apagaria o dado. Para mostrar esses, é `formatarDataBR`.
 */
export function ancoraDoDia(valor: string): Date {
  return new Date(`${valor.slice(0, 10)}T12:00:00`);
}

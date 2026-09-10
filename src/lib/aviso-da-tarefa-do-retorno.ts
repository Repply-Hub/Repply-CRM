/**
 * A frase de ajuda da caixinha "Criar tarefa para o responsável", no diálogo "Retomar depois".
 *
 * Ela responde às duas perguntas que a pessoa faz antes de apertar o botão: **para quem** essa
 * tarefa vai e **quando** ela vence. É a única coisa na tela que diz que o gesto de adiar
 * coloca trabalho na agenda de alguém — e, quando o negócio é de um colega, esse alguém não é
 * quem está clicando.
 *
 * Vive aqui, e não dentro do componente, para poder ser conferida por teste sem montar React —
 * o mesmo motivo de `select-de-negocios.ts`. Ver `aviso-da-tarefa-do-retorno.test.ts`.
 */

/**
 * @param dono  Nome do dono do negócio, **só quando o negócio não é de quem está olhando**.
 *   🔴 NULO SIGNIFICA "É MEU", não "não sei de quem é" — é o mesmo contrato da propriedade
 *   `responsavel` de `DialogoRetorno`. Texto vazio cai no mesmo lado: o campo só se preenche
 *   quando o dono é OUTRA pessoa.
 *
 *   Não existe um terceiro caso "negócio sem dono": `negocios_em_risco_de` junta `usuarios`
 *   por junção interna (negócio órfão não sai na tabela do time), a fila é pessoal desde o
 *   Plano C, e a medição de 10/09/2026 achou **zero** negócio com `usuario_id` nulo na base
 *   inteira. Escrever uma frase para ele seria inventar tela para um estado inexistente.
 *
 * @param retornoEm  A data do retorno em `AAAA-MM-DD` — **a mesma string que o diálogo manda
 *   ao banco**, não um `Date`. É o que impede a frase de prometer um dia e a gravação usar
 *   outro.
 *
 *   🔴 E é por isso que a data é RECORTADA do texto, nunca passada por `new Date(...)`:
 *   `new Date("2026-10-01")` lê o texto como UTC e, no horário de Brasília, devolve 30/09
 *   (CLAUDE.md §7.12). No dia 1º o erro não troca só o dia — troca o MÊS.
 */
export function avisoDaTarefaDoRetorno(dono: string | null, retornoEm: string): string {
  const [, mes, dia] = retornoEm.split('-');
  const quando = `${dia}/${mes}`;

  // Sem o ano de propósito: o botão logo acima já mostra a data por extenso ("15 de setembro
  // de 2026"). O trabalho desta linha é AMARRAR o prazo da tarefa àquela data, não repeti-la.
  //
  // E sem a hora, também de propósito. O banco crava o prazo às 09:00 de São Paulo, mas isso é
  // âncora técnica — existe para a tarefa não cair no dia anterior quando o Postgres, que roda
  // em UTC, converte a data. Dizer "às 9h" faria a pessoa ler compromisso marcado onde há
  // prazo do dia.
  const nome = dono?.trim();
  if (!nome) return `A tarefa fica com você, com prazo em ${quando}.`;
  return `A tarefa vai para ${nome}, com prazo em ${quando}.`;
}

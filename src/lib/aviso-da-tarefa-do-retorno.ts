/**
 * As duas linhas da caixinha "Criar tarefa" no diálogo "Retomar depois": o RÓTULO, que a pessoa
 * lê antes de decidir, e a AJUDA embaixo, que diz o que a tarefa vai carregar.
 *
 * Elas respondem juntas às três perguntas do gesto: **para quem** essa tarefa vai, **quando** ela
 * vence e **o que** vai escrito nela. É a única coisa na tela que diz que adiar um negócio coloca
 * trabalho na agenda de alguém — e, quando o negócio é de um colega, esse alguém não é quem está
 * clicando.
 *
 * Vivem aqui, e não dentro do componente, para poder ser conferidas por teste sem montar React —
 * o mesmo motivo de `select-de-negocios.ts`. Ver `aviso-da-tarefa-do-retorno.test.ts`.
 */

/**
 * O rótulo da caixinha, com o NOME de quem vai receber a tarefa.
 *
 * 🔴 O NOME MORA AQUI, e não só na linha de ajuda, porque o rótulo é a linha que a pessoa lê no
 * instante de decidir — e porque "o responsável", que era o texto até 10/09/2026, fica solto nos
 * dois lados: quando o negócio é seu, "o responsável" é você; e com a caixinha DESMARCADA a
 * ajuda some, deixando o rótulo falando de alguém que a tela não nomeia mais.
 *
 * @param dono Nome do dono do negócio, **só quando o negócio não é de quem está olhando**.
 *   🔴 NULO SIGNIFICA "É MEU", não "não sei de quem é" — é o mesmo contrato da propriedade
 *   `responsavel` de `DialogoRetorno`. Texto vazio cai no mesmo lado: o campo só se preenche
 *   quando o dono é OUTRA pessoa.
 *
 *   Não existe um terceiro caso "negócio sem dono": `negocios_em_risco_de` junta `usuarios` por
 *   junção interna (negócio órfão não sai na tabela do time), a fila é pessoal desde o Plano C,
 *   e a medição de 10/09/2026 achou **zero** negócio com `usuario_id` nulo na base inteira — o
 *   mesmo zero que faz a guarda `v_dono is not null` do banco nunca disparar pela tela.
 */
export function rotuloDaTarefaDoRetorno(dono: string | null): string {
  const nome = dono?.trim();
  if (!nome) return 'Criar uma tarefa para mim';
  return `Criar tarefa para ${nome}`;
}

/**
 * A linha de ajuda, com a caixinha MARCADA: o prazo e o que vai na descrição.
 *
 * @param retornoEm A data do retorno em `AAAA-MM-DD` — **a mesma string que o diálogo manda ao
 *   banco**, não um `Date`. É o que impede a frase de prometer um dia e a gravação usar outro.
 *
 *   🔴 E é por isso que a data é RECORTADA do texto, nunca passada por `new Date(...)`:
 *   `new Date("2026-10-01")` lê o texto como UTC e, no horário de Brasília, devolve 30/09
 *   (CLAUDE.md §7.12). No dia 1º o erro não troca só o dia — troca o MÊS.
 */
export function avisoDaTarefaDoRetorno(retornoEm: string): string {
  const [, mes, dia] = retornoEm.split('-');

  // Sem o ano de propósito: o botão logo acima já mostra a data por extenso ("15 de setembro de
  // 2026"). O trabalho desta linha é AMARRAR o prazo da tarefa àquela data, não repeti-la.
  //
  // E sem a hora, também de propósito. O banco crava o prazo às 09:00 de São Paulo, mas isso é
  // âncora técnica — existe para a tarefa não cair no dia anterior quando o Postgres, que roda em
  // UTC, converte a data. Dizer "às 9h" faria a pessoa ler compromisso marcado onde há prazo do
  // dia.
  //
  // O motivo é citado porque o texto que a pessoa acabou de digitar vai parar na agenda de outra
  // pessoa, e este é o último ponto antes do clique em que dá para reler o que se escreveu.
  return `Prazo em ${dia}/${mes}, e o motivo acima vai na descrição.`;
}

import { useState } from "react";

// Em que mês um calendário abre.
//
// O react-day-picker (v8, o que este projeto usa) decide o mês visível olhando
// só para `month` ?? `defaultMonth` ?? hoje — a data SELECIONADA não entra
// nessa conta. Sem uma das duas propriedades, um filtro em março/2024 reabre em
// agosto/2026 e a pessoa volta 29 meses na setinha. Com quatro anos de
// histórico importado do Bitrix, isso inviabiliza o filtro.
//
// Só Date de verdade conta aqui: texto não é convertido de propósito.
// `new Date("2024-03-01")` é lido como UTC e, no horário de Brasília, vira
// 29/02 às 21h — o calendário abriria em FEVEREIRO. Quem guarda a data em texto
// converte antes, com o mesmo parse que o resto da tela já usa.
function ehDataValida(candidata: unknown): candidata is Date {
  return candidata instanceof Date && !Number.isNaN(candidata.getTime());
}

function chaveDoMes(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}`;
}

/**
 * Mês em que o calendário deve abrir: a primeira data preenchida da lista, na
 * ordem em que forem passadas; se nenhuma estiver, o mês atual.
 *
 * A ordem dos argumentos é a ordem do desempate — primeiro a data do próprio
 * campo, depois a do campo vizinho. É o que faz uma "Data de Fechamento" ainda
 * vazia, num negócio criado em 2022, abrir em 2022 e não em 2026.
 *
 * Em campo único basta jogar no `defaultMonth`: todo popover deste projeto
 * desmonta o conteúdo ao fechar (nenhum usa `forceMount`), então o valor é
 * recalculado a cada reabertura.
 *
 *   <Calendar defaultMonth={mesDoCalendario(prazoResposta, dataPedido)} ... />
 */
export function mesDoCalendario(
  ...candidatas: Array<Date | null | undefined>
): Date {
  return candidatas.find(ehDataValida) ?? new Date();
}

/**
 * Versão controlada, para o calendário que NÃO remonta na hora em que deveria
 * voltar ao mês certo — um mesmo <Calendar> servindo duas abas (De/Até), ou um
 * invólucro que mantém o conteúdo montado depois de fechado. Nesses casos
 * `defaultMonth` não resolve: ele só vale na primeira montagem, e sem
 * desmontagem nunca é recalculado.
 *
 *   const mes = useMesVisivel(mesDoCalendario(dataDoCampo, dataVizinha), `${campo}|${open}`);
 *   <Calendar month={mes.month} onMonthChange={mes.onMonthChange} ... />
 *
 * Com o calendário aberto, quem manda é a pessoa: setinha e seletor de ano
 * navegam livremente e nada aqui puxa a tela de volta. O mês alvo só volta a
 * valer quando `chaveDeReinicio` muda — passe nela o que significa "é outra
 * abertura": a aba em edição, o `open` do popover, ou os dois. Sem isso a
 * pessoa navega até 2019, fecha sem escolher, reabre e continua em 2019.
 *
 * O alvo também volta a valer sozinho quando a data escolhida muda de mês por
 * fora (outro atalho, formulário limpo) — senão o calendário ficaria preso onde
 * estava, mostrando um mês que não tem nada a ver com o que o campo diz.
 */
export function useMesVisivel(
  alvo: Date | null | undefined,
  chaveDeReinicio: string | number = "",
): { month: Date; onMonthChange: (mes: Date) => void } {
  const mesAlvo = mesDoCalendario(alvo);
  const chave = `${chaveDeReinicio}|${chaveDoMes(mesAlvo)}`;

  const [mes, setMes] = useState<Date>(mesAlvo);
  const [chaveAplicada, setChaveAplicada] = useState(chave);

  // Ajuste de estado durante a renderização — é o padrão do React para estado
  // derivado de propriedade. O React descarta esta passada e renderiza de novo
  // ANTES de pintar; num `useEffect`, o mês antigo chegaria a aparecer por um
  // quadro a cada troca de aba.
  const voltarAoAlvo = chave !== chaveAplicada;
  if (voltarAoAlvo) {
    setChaveAplicada(chave);
    setMes(mesAlvo);
  }

  return {
    // Na passada descartada o `mes` ainda é o antigo; devolver o alvo direto
    // mantém a saída coerente mesmo nela.
    month: voltarAoAlvo ? mesAlvo : mes,
    onMonthChange: setMes,
  };
}

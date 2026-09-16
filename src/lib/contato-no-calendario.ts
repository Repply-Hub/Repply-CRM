/**
 * Decide se um `historico_contatos` com `proximo_contato_em` aparece como "Contato" no
 * calendário.
 *
 * O "Retomar depois" da tela Hoje grava um contato de `tipo='retorno'` — e desenhava um marcador
 * na agenda. Decisão do dono do produto (16/09/2026): esse marcador não ajudava, e a
 * sincronização com Tarefas (que o mesmo gesto já faz) basta. Então o calendário deixa de
 * mostrar o `retorno`.
 *
 * 🔴 A coluna `proximo_contato_em` continua gravada de propósito: é ela que faz o negócio sumir
 * da pauta do dia até a data e voltar nela (`pauta_do_dia_de`, CTE `retorno_marcado`). Este
 * filtro é só do que o calendário desenha, não do banco. Os demais tipos seguem aparecendo.
 */
export function contatoApareceNoCalendario(tipo: string | null | undefined): boolean {
  return tipo !== 'retorno';
}

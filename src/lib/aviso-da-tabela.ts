/**
 * A frase do aviso da pauta vazia na tela "Hoje" — pedido do dono do produto em 14/09/2026: quando
 * a pauta está vazia, apontar para a tabela logo abaixo, no mesmo lugar onde a tela diz isso.
 *
 * 🔴 "PEDEM ATENÇÃO", E NÃO "PARADOS". A tabela do time lista `parado OR sem_proxima_acao`
 * (`negocios_em_risco`), e boa parte dela entra só por não ter próxima ação marcada. O título da
 * própria tabela e o e-mail das 7h já tomam o mesmo cuidado.
 *
 * Devolve `null` quando não há negócio na tabela: sem destino, não há aviso.
 */
export function fraseDoAvisoDaTabela(total: number, podeVerDeTodos: boolean): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total === 1) {
    return podeVerDeTodos
      ? 'Quer adiantar? O negócio que pede atenção está na tabela logo abaixo.'
      : 'Quer adiantar? Seu negócio que pede atenção está na tabela logo abaixo.';
  }
  return podeVerDeTodos
    ? `Quer adiantar? Os ${total} negócios que pedem atenção estão na tabela logo abaixo.`
    : `Quer adiantar? Seus ${total} negócios que pedem atenção estão na tabela logo abaixo.`;
}

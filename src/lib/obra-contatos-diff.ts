/**
 * O que precisa ser inserido e apagado para a lista gravada de vínculos virar a
 * lista desejada.
 *
 * Mora aqui, e não junto do hook, por dois motivos: é função pura (não sabe nada
 * de banco) e, principalmente, para poder ser testada — o hook importa o cliente
 * do Supabase, que exige variável de ambiente e derruba a suíte fora do navegador.
 *
 * A regra que mais importa é a menos óbvia: lista desejada VAZIA significa
 * "desvincule todos", não "não faça nada". Por isso a tela precisa distinguir
 * `[]` (o usuário desmarcou tudo) de "ainda não carreguei" — este segundo estado
 * nunca pode chegar até aqui.
 */
export function calcularDiffDeVinculos(atuais: string[], desejados: string[]) {
  const jaTem = new Set(atuais);
  const quer = new Set(desejados);
  return {
    inserir: [...quer].filter((id) => !jaTem.has(id)),
    remover: [...jaTem].filter((id) => !quer.has(id)),
  };
}

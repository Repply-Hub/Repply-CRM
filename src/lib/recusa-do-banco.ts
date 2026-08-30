/**
 * Traduz a recusa do banco para uma frase que explica o que aconteceu.
 *
 * 🔴 O PROBLEMA QUE ISTO RESOLVE. Quando a empresa está bloqueada, o banco recusa a gravação
 * — como deve. Mas o que ele devolve é isto:
 *
 *   new row violates row-level security policy for table "clientes"
 *
 * Uma frase em inglês, sobre um conceito de banco de dados, para alguém que só queria
 * cadastrar um cliente. A pessoa preenche o formulário inteiro, clica em salvar e recebe
 * isso. Não dá para agir sobre uma frase dessas: ela não diz o que houve nem o que fazer.
 *
 * 🔴 E O MESMO ERRO TEM DUAS CAUSAS DIFERENTES. O código 42501 aparece tanto quando a empresa
 * está bloqueada quanto quando a pessoa não tem permissão naquele registro (um vendedor
 * mexendo no cliente de outro). São problemas opostos — um resolve pagando, o outro pedindo
 * a um gestor —, e chutar o errado manda a pessoa para o lugar errado.
 *
 * Por isso este módulo guarda o estado de cobrança que a tela já consultou. Não é uma segunda
 * fonte de verdade: é a MESMA resposta de `meu_estado_de_cobranca()`, deixada onde uma função
 * sem React consegue alcançar. Quando ela não estiver disponível, a frase diz as duas
 * possibilidades em vez de inventar uma.
 */

interface EstadoConhecido {
  bloqueado: boolean;
  encerrada: boolean;
}

let estadoConhecido: EstadoConhecido | null = null;

/**
 * Guarda o estado de cobrança mais recente. Chamado por `useEstadoDeCobranca`, e só por ele
 * — quem escrever daqui de fora cria a divergência que este módulo existe para evitar.
 */
export function registrarEstadoDeCobranca(estado: EstadoConhecido | null): void {
  estadoConhecido = estado;
}

/** Só para os testes: devolve o módulo ao estado de quem nunca consultou nada. */
export function esquecerEstadoDeCobranca(): void {
  estadoConhecido = null;
}

/**
 * A recusa veio das regras de acesso do banco?
 *
 * Confere o código E o texto porque nem todo caminho preserva o código: o PostgREST devolve
 * `42501` no campo `code`, mas erro que passou por função de servidor às vezes chega só com a
 * frase. Perder o caso por causa do formato seria voltar a mostrar o texto em inglês.
 */
function ehRecusaDeAcesso(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;

  const o = e as { code?: unknown; message?: unknown };
  if (o.code === '42501') return true;

  const texto = typeof o.message === 'string' ? o.message.toLowerCase() : '';
  return (
    texto.includes('row-level security') ||
    texto.includes('row level security') ||
    texto.includes('permission denied for table')
  );
}

/**
 * A frase em português para uma recusa das regras de acesso, ou `null` quando o erro é outro
 * — aí quem chamou segue com o tratamento normal.
 */
export function recusaDeAcesso(e: unknown): string | null {
  if (!ehRecusaDeAcesso(e)) return null;

  // Conta encerrada primeiro: quem está aqui não tem o que regularizar sozinho, e mandá-lo
  // para a tela de pagamento seria um beco.
  if (estadoConhecido?.encerrada) {
    return 'Esta conta foi encerrada, então o sistema não aceita mais alterações. Fale com o suporte se isso não era esperado.';
  }

  if (estadoConhecido?.bloqueado) {
    return 'O acesso da sua empresa está bloqueado: dá para consultar tudo, mas nada novo é salvo. O aviso no topo da tela explica como regularizar.';
  }

  if (estadoConhecido) {
    // A empresa está em dia, então sobrou a outra causa — e esta a pessoa resolve pedindo.
    return 'Você não tem permissão para alterar este registro. Peça a um gestor da sua empresa.';
  }

  // Sem saber o estado da empresa, dizer as duas é o honesto. Inventar uma manda metade das
  // pessoas para o lugar errado.
  return 'O banco recusou esta alteração. Isso acontece quando o acesso da empresa está bloqueado, ou quando o seu usuário não tem permissão neste registro.';
}

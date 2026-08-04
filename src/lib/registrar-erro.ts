/**
 * Registro de erros de tela em `app_erros`.
 *
 * POR QUE ISTO EXISTE: até agora, quando o app caía em "Algo deu errado", o
 * erro ia só para o `console.error` — e a mensagem era escondida da tela em
 * produção. Quem estava usando não tinha o que reportar além de "quebrou", e
 * quem fosse investigar precisaria estar com o DevTools aberto no exato
 * momento. O código curto devolvido aqui é o que liga o relato ao erro real.
 */

/**
 * Identifica o build, para separar erro de versão velha de erro de versão nova.
 * Injetado pelo `define` do vite.config.ts; no vitest a constante não existe,
 * daí o typeof.
 */
declare const __BUILD_ID__: string;
const VERSAO_BUILD: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

/**
 * Grava o erro e devolve um código curto para o usuário repassar.
 *
 * Nunca lança: uma falha ao registrar o erro não pode virar um segundo erro em
 * cima da tela que já quebrou. Se não der para gravar, devolve `null` e a tela
 * simplesmente não mostra código.
 *
 * O import do supabase é dinâmico de propósito: este módulo é chamado de dentro
 * do `componentDidCatch`, e o cliente do Supabase pode ser justamente o que não
 * carregou (é o cenário de chunk velho). `await import()` que falhe cai no
 * catch aqui e não derruba nada.
 */
export async function registrarErro(entrada: {
  mensagem: string;
  stack?: string | null;
  componentStack?: string | null;
  rota?: string;
}): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");

    const { data: sessao } = await supabase.auth.getSession();
    const userId = sessao?.session?.user?.id ?? null;

    // empresa_id é conveniência de leitura para o painel de admin. Falhar aqui
    // não impede o registro — o essencial é a mensagem e o stack.
    let empresaId: string | null = null;
    if (userId) {
      const { data } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("user_id", userId)
        .maybeSingle();
      empresaId = data?.empresa_id ?? null;
    }

    // O id é gerado AQUI, e não pelo default da tabela, por um motivo concreto:
    // ninguém tem permissão de SELECT em `app_erros` (só o admin global). Um
    // `.insert().select()` faz a biblioteca pedir `return=representation`, que
    // exige leitura — e o PostgREST reverte a requisição INTEIRA quando não
    // pode devolver a linha. Verificado contra a produção: com `.select()` o
    // insert respondia vazio e nada era gravado. Sabendo o id de antemão, o
    // insert é cego e o código sai daqui mesmo.
    const id = crypto.randomUUID();

    const { error } = await supabase.from("app_erros").insert({
      id,
      user_id: userId,
      empresa_id: empresaId,
      rota: entrada.rota ?? window.location.pathname,
      mensagem: entrada.mensagem.slice(0, 2000),
      stack: entrada.stack?.slice(0, 8000) ?? null,
      component_stack: entrada.componentStack?.slice(0, 8000) ?? null,
      user_agent: navigator.userAgent,
      versao: VERSAO_BUILD,
    });

    if (error) return null;

    // Oito caracteres: curto o bastante para alguém ditar por telefone e
    // suficiente para localizar a linha (`where id::text like 'abc12345%'`).
    return id.slice(0, 8);
  } catch {
    return null;
  }
}

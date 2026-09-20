/**
 * Lê o campo `role` do payload de um JWT — sem conferir a assinatura.
 *
 * Puro de propósito (sem `Deno.*`, sem rede): roda em qualquer função de borda e é
 * testado pelo Vitest (`src/lib/papel-do-token.test.ts`), o mesmo arquivo nos dois,
 * no padrão de `aviso-de-evento.ts`.
 *
 * 🔴 POR QUE É SEGURO NÃO CONFERIR A ASSINATURA AQUI: esta função só existe para ser
 * chamada depois que o GATEWAY do Supabase já validou a assinatura do token
 * (`verify_jwt = true` no `config.toml` da função que chama). Se o token chegou até
 * aqui, o gateway já recusou qualquer assinatura inválida antes da requisição tocar
 * o código — esta leitura só decide QUEM é o chamador, não SE ele é legítimo.
 *
 * 🔴 NUNCA reaproveite esta função numa função com `verify_jwt = false`. Sem o
 * gateway conferindo antes, qualquer texto no formato de JWT — payload forjado,
 * assinatura qualquer — passaria por aqui como se fosse legítimo, porque nada
 * neste código confere nada.
 *
 * Devolve `null` para texto que não tem cara de JWT (não tem as três partes
 * separadas por ponto) ou cujo payload não decodifica como JSON — nunca lança.
 *
 * Limite conhecido: se um dia a chave do cofre virar o formato novo
 * `sb_secret_...`, que não é JWT, o gateway com `verify_jwt = true` já recusa a
 * chamada antes de chegar aqui — e o conserto, se algo quebrar, é outro.
 */
export function papelDoToken(token: string): string | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const comPreenchimento = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(comPreenchimento));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

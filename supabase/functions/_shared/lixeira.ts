/**
 * Acha o id da pasta de LIXEIRA da conta, entre as pastas já espelhadas em
 * `email_pastas`.
 *
 * Puro de propósito (sem `Deno.*`, sem rede): roda em qualquer função de borda e é
 * testado pelo Vitest (`src/lib/lixeira-id.test.ts`), o mesmo arquivo nos dois, no
 * padrão de `papel-do-token.ts`.
 *
 * 🔴 O ATRIBUTO vem ANTES do id literal `TRASH` de propósito: o Microsoft usa id
 * OPAQUE para a lixeira (algo como `AAMkAGI1...`, sem relação nenhuma com a
 * palavra "trash"), e só o atributo `\trash` (igual ao que o Nylas devolve em
 * `PastaNylas.attributes`, ver `_shared/nylas.ts`) identifica a pasta certa nesse
 * provedor. O Gmail devolve a pasta de sistema com o id literal `TRASH` — às vezes
 * sem atributo nenhum gravado (o espelho de `email_pastas` guarda o que o Nylas
 * mandou, e providers variam) — daí o `TRASH` como segunda tentativa, nunca a
 * primeira: se um dia o atributo vier junto, ele é a fonte mais confiável.
 */
export function idDaLixeira(
  pastas: { pasta_id: string; atributos?: string[] | null }[],
): string | null {
  const porAtributo = pastas.find((p) =>
    (p.atributos ?? []).some((a) => a.toLowerCase() === "\\trash"),
  );
  if (porAtributo) return porAtributo.pasta_id;

  const porIdLiteral = pastas.find((p) => p.pasta_id === "TRASH");
  if (porIdLiteral) return porIdLiteral.pasta_id;

  return null;
}

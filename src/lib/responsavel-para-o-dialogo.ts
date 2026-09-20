/**
 * O nome a mostrar no diálogo "Retomar depois" aberto pela tabela do time — ou `null` quando o
 * negócio é de quem está olhando.
 *
 * O diálogo usa esse nome para trocar de texto: "este negócio é de Fulano, e Fulano recebe um
 * aviso" contra "o negócio volta para a sua pauta". A tabela manda o nome do dono em TODA linha,
 * inclusive nas da própria pessoa, então é preciso decidir "é meu?".
 *
 * 🔴 PELO IDENTIFICADOR: `responsavel_id` contra `profile.id`, os dois `usuarios.id` (CLAUDE.md
 * §4.5). Comparando nomes, dois homônimos na mesma empresa faziam o diálogo prometer "volta para a
 * sua pauta" sobre o negócio do colega, enquanto o banco mandava a tarefa e o aviso para o colega
 * (item 69 da dívida técnica). Sem identificador — site novo falando com o banco anterior à
 * migration 20260914153000 —, volta a comparar o nome, como era antes.
 */
export function responsavelParaODialogo(
  linha: { responsavel: string | null; responsavel_id?: string | null },
  eu: { id?: string | null; nome?: string | null } | null | undefined,
): string | null {
  const dono = (linha.responsavel ?? '').trim();
  if (!dono) return null;
  if (linha.responsavel_id && eu?.id) return linha.responsavel_id === eu.id ? null : dono;
  return dono.toLowerCase() === (eu?.nome ?? '').trim().toLowerCase() ? null : dono;
}

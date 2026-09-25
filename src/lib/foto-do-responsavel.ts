/**
 * Decide QUAL foto usar para o responsável, para o `ResponsavelComFoto`.
 *
 * Mora aqui (função pura, não no `.tsx`) por dois motivos: exportar função de um arquivo de
 * componente acende o `react-refresh/only-export-components` do eslint, e no jsdom o
 * `AvatarImage` do Radix não renderiza a `<img>` até a imagem "carregar" — então a única forma
 * de testar a escolha da URL é testando esta função à parte.
 *
 * Regra: `avatarUrl` explícito (mesmo `null`) manda — é o caso de quem já tem a foto em mãos
 * (o objeto do vendedor no negócio). Só quando ele não veio (`undefined`) é que procuramos por
 * NOME na lista de vendedores, como o `UserProfilePopover` já faz.
 */
export function fotoDoResponsavel(
  nome: string | null | undefined,
  avatarUrl: string | null | undefined,
  vendedores: { nome?: string | null; avatar_url?: string | null }[],
): string | null {
  if (avatarUrl !== undefined) return avatarUrl ?? null;
  if (!nome) return null;
  const alvo = nome.trim().toLowerCase();
  return vendedores.find((v) => (v.nome ?? '').trim().toLowerCase() === alvo)?.avatar_url ?? null;
}

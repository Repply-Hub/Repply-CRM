/**
 * Paleta fixa de cores pra diferenciar instâncias de WhatsApp de relance
 * (badge na caixa de entrada), escolhida pela pessoa em Configurações. Cada
 * cor já vem com o par claro/escuro calculado à mão (mesma lógica do badge
 * "Não atribuído" em WhatsAppInbox.tsx), então qualquer cor da paleta lê bem
 * nos dois temas sem precisar validar contraste a cada escolha.
 *
 * `usuarios.cor` também aceita um hex livre (`#rrggbb`, o formato que
 * `<input type="color">` sempre devolve) pra quem quer uma cor fora das 8 da
 * paleta — mas hex livre não tem par claro/escuro calculado, então o badge
 * pra esse caso usa um pontinho da cor + texto na cor neutra de sempre
 * (`CLASSE_BADGE_INSTANCIA_SEM_COR`), em vez de colorir borda e texto
 * inteiros como as cores da paleta fazem. Ver `infoCorInstancia`, que é quem
 * decide qual dos dois casos renderizar.
 */
export const CORES_INSTANCIA = [
  'azul',
  'roxo',
  'verde',
  'ambar',
  'rosa',
  'ciano',
  'indigo',
  'vermelho',
] as const;

export type CorInstancia = (typeof CORES_INSTANCIA)[number];

export const NOME_COR_INSTANCIA: Record<CorInstancia, string> = {
  azul: 'Azul',
  roxo: 'Roxo',
  verde: 'Verde',
  ambar: 'Âmbar',
  rosa: 'Rosa',
  ciano: 'Ciano',
  indigo: 'Índigo',
  vermelho: 'Vermelho',
};

/** Badge outline (mesmo formato do "Não atribuído"), com par claro/escuro. */
export const CLASSES_BADGE_INSTANCIA: Record<CorInstancia, string> = {
  azul: 'border-blue-400 text-blue-600 dark:border-blue-500/60 dark:text-blue-400',
  roxo: 'border-purple-400 text-purple-600 dark:border-purple-500/60 dark:text-purple-400',
  verde: 'border-emerald-400 text-emerald-600 dark:border-emerald-500/60 dark:text-emerald-400',
  ambar: 'border-amber-400 text-amber-600 dark:border-amber-500/60 dark:text-amber-400',
  rosa: 'border-pink-400 text-pink-600 dark:border-pink-500/60 dark:text-pink-400',
  ciano: 'border-cyan-400 text-cyan-600 dark:border-cyan-500/60 dark:text-cyan-400',
  indigo: 'border-indigo-400 text-indigo-600 dark:border-indigo-500/60 dark:text-indigo-400',
  vermelho: 'border-red-400 text-red-600 dark:border-red-500/60 dark:text-red-400',
};

/** Pastilha sólida usada só no seletor de cor, em Configurações. */
export const CLASSES_PASTILHA_INSTANCIA: Record<CorInstancia, string> = {
  azul: 'bg-blue-500',
  roxo: 'bg-purple-500',
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  rosa: 'bg-pink-500',
  ciano: 'bg-cyan-500',
  indigo: 'bg-indigo-500',
  vermelho: 'bg-red-500',
};

/** Classe do badge pra instância sem cor escolhida — o cinza neutro de antes. */
export const CLASSE_BADGE_INSTANCIA_SEM_COR = 'text-muted-foreground';

/** Valida o que veio do banco contra a paleta fixa — nunca confia no texto cru. */
export function corInstanciaValida(cor: string | null | undefined): CorInstancia | null {
  return cor && (CORES_INSTANCIA as readonly string[]).includes(cor)
    ? (cor as CorInstancia)
    : null;
}

const HEX_REGEX = /^#[0-9a-f]{6}$/i;

/** Valida hex livre (formato que `<input type="color">` sempre devolve). */
export function corInstanciaHexValida(cor: string | null | undefined): string | null {
  return cor && HEX_REGEX.test(cor) ? cor.toLowerCase() : null;
}

export type InfoCorInstancia =
  | { tipo: 'preset'; cor: CorInstancia }
  | { tipo: 'hex'; hex: string }
  | { tipo: 'nenhuma' };

/** Único ponto que decide, a partir do que está salvo, qual dos três casos vale. */
export function infoCorInstancia(cor: string | null | undefined): InfoCorInstancia {
  const preset = corInstanciaValida(cor);
  if (preset) return { tipo: 'preset', cor: preset };
  const hex = corInstanciaHexValida(cor);
  if (hex) return { tipo: 'hex', hex };
  return { tipo: 'nenhuma' };
}

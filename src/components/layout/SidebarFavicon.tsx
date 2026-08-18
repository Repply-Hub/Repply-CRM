import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { getFaviconUrl, getFaviconGoogleUrl, getFaviconFallbackUrl } from '@/lib/sidebar-icons';
import { cn } from '@/lib/utils';

interface Props {
  url: string;
  icon?: LucideIcon;
  className?: string;
}

const ORDEM_TENTATIVAS = ['duckduckgo', 'google', 'faviconIco', 'esgotado'] as const;
type Tentativa = (typeof ORDEM_TENTATIVAS)[number];

function proximaTentativa(atual: Tentativa): Tentativa {
  const indice = ORDEM_TENTATIVAS.indexOf(atual);
  return ORDEM_TENTATIVAS[indice + 1] ?? 'esgotado';
}

function srcParaTentativa(tentativa: Tentativa, url: string): string | undefined {
  switch (tentativa) {
    case 'duckduckgo': return getFaviconUrl(url);
    case 'google': return getFaviconGoogleUrl(url);
    case 'faviconIco': return getFaviconFallbackUrl(url);
    case 'esgotado': return undefined;
  }
}

/**
 * Favicon de link externo com cadeia de fallback de verdade. Nenhum serviço
 * público de favicon é confiável sozinho: testado contra sites reais que
 * usuários cadastraram na sidebar (Vercel, portal estadual de sefaz, receita
 * federal), o Google (`s2/favicons?domain_url=`) devolveu 404 pra 2 de 3 e o
 * DuckDuckGo (`icons.duckduckgo.com/ip3/`) pra 1 de 3 — mas nunca os DOIS ao
 * mesmo tempo nesses casos. Nenhum devolve erro de rede quando não tem o site
 * indexado — devolvem HTTP 404 com um ícone genérico no corpo, que o
 * navegador ainda assim trata como falha de `<img>` (dispara `onError`).
 * Sem essa cadeia (e sem o fallback final pro ícone Lucide do item), a
 * tentativa única falhando deixava `visibility: hidden` — um espaço vazio na
 * sidebar em vez de qualquer ícone.
 */
export function SidebarFavicon({ url, icon: Icon, className }: Props) {
  const [tentativa, setTentativa] = useState<Tentativa>('duckduckgo');

  // Reseta ao trocar de URL (ex: usuário edita o link do item) — sem isto, um
  // "esgotado" de uma URL anterior ficaria preso no item reaproveitado.
  useEffect(() => {
    setTentativa('duckduckgo');
  }, [url]);

  const src = srcParaTentativa(tentativa, url);

  if (!src) {
    return Icon ? <Icon className={className} /> : null;
  }

  return (
    <img
      src={src}
      alt=""
      className={cn(className, 'rounded-sm')}
      onError={() => setTentativa(proximaTentativa)}
    />
  );
}

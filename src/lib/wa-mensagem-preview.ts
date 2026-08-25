import {
  FileText,
  Image as ImageIcon,
  Mic,
  Sticker,
  Video,
  type LucideIcon,
} from 'lucide-react';

/**
 * Placeholder textual que o webhook grava em `ultima_mensagem`/`conteudo`
 * quando a mensagem não é texto puro (ver `_shared/whatsapp.ts` do lado do
 * servidor). Compartilhado entre `WhatsAppInbox.tsx` (preview na lista de
 * conversas, citação de mensagem) e `use-whatsapp-inbox.ts` (toast de "nova
 * mensagem") — os dois precisam trocar o texto cru "[Tipo]" pelo mesmo
 * ícone/rótulo, e viviam duplicando essa lista até um dos dois esquecer de
 * atualizar (foi o caso do toast, que continuava mostrando "[Áudio]" cru).
 */
// SEM `as const`: os call sites chamam `.includes(conteudo)` com uma string
// genérica (o texto de qualquer mensagem, não um dos 5 literais) — com
// `as const` o array vira uma tupla de literais e `.includes` passaria a
// exigir um desses literais, rejeitando a comparação normal.
export const MENSAGEM_PLACEHOLDERS: readonly string[] = [
  '[Imagem]',
  '[Áudio]',
  '[Vídeo]',
  '[Documento]',
  '[Sticker]',
];

export const MENSAGEM_PREVIEW_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  '[Imagem]': { icon: ImageIcon, label: 'Foto' },
  '[Áudio]': { icon: Mic, label: 'Áudio' },
  '[Vídeo]': { icon: Video, label: 'Vídeo' },
  '[Documento]': { icon: FileText, label: 'Documento' },
  '[Sticker]': { icon: Sticker, label: 'Figurinha' },
};

/** `undefined` quando `mensagem` é texto normal (não um dos placeholders). */
export function infoPreviewMensagem(
  mensagem: string | null | undefined,
): { icon: LucideIcon; label: string } | undefined {
  return mensagem ? MENSAGEM_PREVIEW_ICONS[mensagem] : undefined;
}

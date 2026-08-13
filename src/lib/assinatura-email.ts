import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';

/**
 * Calculada a partir do client Supabase configurado, não hardcoded: o
 * projeto Supabase deste CRM já foi trocado antes, e a URL antiga (de um
 * projeto que não existe mais) ficou presa aqui e duplicada em Emails.tsx —
 * por isso a logo aparecia sempre quebrada, tanto no preview quanto no
 * e-mail enviado. `getPublicUrl` só monta a string, não faz request.
 */
export const LOGO_EMAIL_URL =
  supabase.storage.from('email-assets').getPublicUrl('logo-email.png').data.publicUrl;

/**
 * Assinatura pessoal roda como HTML digitado pelo próprio usuário (editor de
 * negrito/itálico/sublinhado/link em `AssinaturaEmailEditor`) e vai direto
 * para um e-mail que sai da caixa da EMPRESA — sem isto, colar algo que vire
 * `<img onerror=...>` ou um `javascript:` num link quebraria o e-mail ou
 * rodaria no cliente de quem o recebe. Allowlist enxuta de propósito: é
 * assinatura, não corpo de mensagem.
 */
export function sanitizarAssinaturaEmail(html: string | null | undefined): string {
  return DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'a', 'br'],
    ALLOWED_ATTR: ['href'],
  });
}

/**
 * Assinaturas gravadas antes do editor de formatação existir são texto puro,
 * com `\n` como quebra de linha. As novas já chegam como HTML do editor — o
 * teste de "tem `<`" separa uma da outra sem precisar de coluna nova nem
 * migração de dados existentes.
 */
export function normalizarAssinaturaAntiga(valor: string | null | undefined): string {
  const bruto = valor ?? '';
  if (!bruto || bruto.includes('<')) return bruto;
  return bruto.replace(/\n/g, '<br>');
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rodapé completo do e-mail (logo + nome + assinatura). A MESMA função monta
 * tanto o preview em Configurações quanto o HTML de envio real em
 * `Emails.tsx`, para os dois nunca divergirem.
 */
export function montarRodapeEmailHtml(opts: { nome: string; assinaturaHtml: string; logoUrl: string }): string {
  const assinaturaSegura = sanitizarAssinaturaEmail(opts.assinaturaHtml);
  return `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
      <img src="${opts.logoUrl}" alt="MD Representações" style="max-height: 50px; display: block; margin-bottom: 10px;" />
      <div style="color: #333; font-weight: bold; font-size: 16px;">${escapeHtml(opts.nome) || 'Equipe MD'}</div>
      ${assinaturaSegura ? `<div style="color: #666; font-size: 14px; margin-top: 4px;">${assinaturaSegura}</div>` : ''}
      <div style="color: #94a3b8; font-size: 12px; margin-top: 15px;">
        MD Representações
      </div>
    </div>
  `;
}

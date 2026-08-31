import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';

/**
 * 🔴 A LOGO DO E-MAIL DEIXOU DE TER ENDEREÇO PRÓPRIO, em 31/08/2026.
 *
 * Ela morava em `email-assets/logo-email.png` — um caminho FIXO, o mesmo para as dez empresas
 * assinantes. Uma empresa sobrescrevia e apagava a logo da outra, e a regra do balde permitia
 * isso a qualquer pessoa logada. Conferido antes de mexer: o arquivo nunca chegou a existir,
 * então ninguém perdeu nada na troca.
 *
 * Agora a assinatura usa a MESMA logo do cabeçalho dos PDFs — `empresas.logo_url`, guardada
 * por empresa no balde `branding` e enviada na aba "Empresa" das configurações. Uma logo só,
 * um lugar só para trocar.
 */

/**
 * Assinatura pessoal roda como HTML digitado pelo próprio usuário (editor de
 * negrito/itálico/sublinhado/link em `AssinaturaEmailEditor`, ou o modo
 * "imagem" que grava um único `<img>`) e vai direto para um e-mail que sai da
 * caixa da EMPRESA — sem isto, colar algo que vire `<img onerror=...>` ou um
 * `javascript:` num link quebraria o e-mail ou rodaria no cliente de quem o
 * recebe.
 *
 * As duas allowlists abaixo são deliberadamente separadas, não uma união
 * "b/i/u/a/br/img": o modo imagem grava SÓ a tag `<img>` gerada por
 * `montarAssinaturaImagemHtml`, e o modo texto nunca deve deixar uma imagem
 * colada/injetada se infiltrar no meio do texto — cada uma sai exatamente
 * como o modo correspondente promete (só imagem, ou só texto + suas
 * estilizações), nunca uma mistura dos dois. `ehAssinaturaImagem` decide qual
 * ramo aplicar antes de qualquer sanitização.
 */
export function sanitizarAssinaturaEmail(html: string | null | undefined): string {
  const bruto = html ?? '';
  if (ehAssinaturaImagem(bruto)) {
    return DOMPurify.sanitize(bruto, {
      ALLOWED_TAGS: ['img'],
      ALLOWED_ATTR: ['src', 'alt', 'style'],
    });
  }
  return DOMPurify.sanitize(bruto, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'a', 'br'],
    ALLOWED_ATTR: ['href'],
  });
}

/**
 * Path fixo por usuário no bucket `email-assets` (mesmo bucket da logo da
 * empresa) — `upsert: true` no upload sobrescreve a imagem anterior, então
 * cada usuário tem no máximo uma imagem de assinatura ativa por vez.
 */
export function assinaturaImagemPath(userId: string): string {
  return `assinaturas/${userId}.png`;
}

export function getAssinaturaImagemUrl(userId: string): string {
  return supabase.storage.from('email-assets').getPublicUrl(assinaturaImagemPath(userId)).data.publicUrl;
}

const IMG_UNICO_REGEX = /^<img\b[^>]*>$/i;

/**
 * Distingue o modo "imagem" (assinatura é só uma tag `<img>`) do modo "texto"
 * (rich text digitado) sem precisar de uma coluna nova no banco — reaproveita
 * o mesmo campo `assinatura_email` para os dois casos.
 */
export function ehAssinaturaImagem(html: string | null | undefined): boolean {
  return IMG_UNICO_REGEX.test((html ?? '').trim());
}

export function montarAssinaturaImagemHtml(url: string): string {
  return `<img src="${escapeHtml(url)}" alt="Assinatura" style="max-width:280px;max-height:120px;display:block;" />`;
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
 *
 * `mostrarLogo` (default `true`) some com a logo inteira — usado quando a
 * assinatura já é uma imagem (`ehAssinaturaImagem`), que já é autossuficiente
 * e não precisa da logo da empresa em cima. `logoCarregou` (default `true`)
 * só se aplica quando `mostrarLogo` é `true`: troca o `<img>` por um aviso de
 * texto quando a logo não existe. Só o preview em Configurações sabe disso de
 * antemão (via `onError` do `<img>` já exibido na tela) — o envio real em
 * `Emails.tsx` não faz essa checagem antes de montar o HTML, então continua
 * tentando carregar a URL normalmente.
 *
 * `isolado` (default `false`) tira a margem/borda superior do container: elas
 * existem pra separar o rodapé do CORPO da mensagem que vem acima dele num
 * e-mail real (`Emails.tsx`). No preview de Configurações o rodapé é
 * mostrado sozinho, sem corpo nenhum acima — sem `isolado`, sobrava um vão
 * em branco com uma linha solta no topo, sem servir pra separar nada.
 *
 * `mostrarNome` e `mostrarNomeEmpresa` (default `true` os dois) existem pra
 * quem está no modo imagem e já desenhou seu nome e/ou o nome da empresa
 * DENTRO da imagem: sem eles, o rodapé duplicava essa informação embaixo da
 * imagem. Cada usuário escolhe os dois de forma independente
 * (`usuarios.assinatura_imagem_mostrar_nome` /
 * `assinatura_imagem_mostrar_empresa`) — a imagem pode trazer só um dos
 * dois. No modo texto os dois continuam sempre `true`, o comportamento de
 * antes: quem chama esta função no modo texto nunca passa `false` aqui.
 */
export function montarRodapeEmailHtml(opts: {
  nome: string;
  assinaturaHtml: string;
  logoUrl: string;
  mostrarLogo?: boolean;
  logoCarregou?: boolean;
  isolado?: boolean;
  mostrarNome?: boolean;
  mostrarNomeEmpresa?: boolean;
  /** O nome da empresa de quem envia. Sem ele, o rodapé simplesmente não escreve empresa. */
  nomeDaEmpresa?: string;
}): string {
  const assinaturaSegura = sanitizarAssinaturaEmail(opts.assinaturaHtml);
  const mostrarLogo = opts.mostrarLogo ?? true;
  const mostrarNome = opts.mostrarNome ?? true;
  const mostrarNomeEmpresa = opts.mostrarNomeEmpresa ?? true;
  // O nome da empresa aparece em três lugares deste rodapé, e nos três estava escrito "MD
  // Representações" — para todas as empresas. O `alt` importa mais do que parece: é o que o
  // cliente lê quando o programa de e-mail bloqueia imagens, que é o padrão de muitos deles.
  const nomeDaEmpresa = escapeHtml(opts.nomeDaEmpresa ?? '');

  let logoHtml = '';
  if (mostrarLogo && opts.logoUrl) {
    logoHtml = (opts.logoCarregou ?? true)
      // 🔴 O ENDEREÇO TAMBÉM É ESCAPADO, e não só o nome. `logo_url` é uma coluna de TEXTO
      // que o gestor grava — pela aba Empresa ou direto pela API — e ela entra aqui dentro de
      // um atributo entre aspas. Sem escapar, uma aspa no meio do valor fecha o atributo e o
      // resto vira HTML dentro do e-mail que sai da caixa da empresa.
      ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${nomeDaEmpresa}" style="max-height: 50px; display: block; margin-bottom: 10px;" />`
      : `<div style="font-size: 12px; color: #94a3b8; margin-bottom: 10px;">Nenhum logotipo enviado</div>`;
  }
  const estiloContainer = opts.isolado ? '' : 'margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;';
  // Sem nome de pessoa, cai no nome da EMPRESA — e não num "Equipe MD" que não é de ninguém.
  const nomeHtml = mostrarNome
    ? `<div style="color: #333; font-weight: bold; font-size: 16px;">${escapeHtml(opts.nome) || nomeDaEmpresa}</div>`
    : '';
  const empresaHtml = mostrarNomeEmpresa && nomeDaEmpresa
    ? `<div style="color: #94a3b8; font-size: 12px; margin-top: 15px;">${nomeDaEmpresa}</div>`
    : '';
  return `
    <div style="${estiloContainer}">
      ${logoHtml}
      ${nomeHtml}
      ${assinaturaSegura ? `<div style="color: #666; font-size: 14px; margin-top: 4px;">${assinaturaSegura}</div>` : ''}
      ${empresaHtml}
    </div>
  `;
}

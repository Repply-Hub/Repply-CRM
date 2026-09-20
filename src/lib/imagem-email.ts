import { supabase } from "@/integrations/supabase/client";

/**
 * Envio de imagem para o e-mail (corpo e assinatura). Cada imagem sobe para o
 * bucket público `email-assets` com um path ÚNICO, e volta como URL pública —
 * necessária para o app de quem recebe conseguir carregar a imagem.
 *
 * O path é `inline/{empresaId}/{uuid}.{ext}`: essa é a convenção que a política
 * de gravação do bucket JÁ permite (`email_assets_write` aceita
 * `assinaturas/{uid}.png` OU `inline/{get_my_empresa_id()}/...`). Escopo por
 * empresa casa com a caixa de e-mail compartilhada, e permite VÁRIAS imagens por
 * pessoa — supera o path fixo `assinaturas/{userId}.png` de uma imagem só.
 */

const BUCKET = "email-assets";
export const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024; // 5 MB
export const TIPOS_IMAGEM_ACEITOS = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const EXTENSOES_CONHECIDAS = ["png", "jpg", "jpeg", "gif", "webp"];

export function extensaoValida(tipo: string): boolean {
  return TIPOS_IMAGEM_ACEITOS.includes(tipo);
}

/**
 * Path único no bucket, dentro de `inline/{empresaId}/`, preservando a extensão
 * quando conhecida (jpeg→jpg). Tem de casar com a política de Storage.
 */
export function caminhoImagemEmail(
  empresaId: string,
  nomeArquivo: string,
): string {
  const bruta = (nomeArquivo.split(".").pop() ?? "").toLowerCase();
  let ext = EXTENSOES_CONHECIDAS.includes(bruta) ? bruta : "png";
  if (ext === "jpeg") ext = "jpg";
  return `inline/${empresaId}/${crypto.randomUUID()}.${ext}`;
}

/** Valida, sobe e devolve a URL pública. Lança Error com frase clara ao usuário. */
export async function enviarImagemEmail(
  file: File,
  empresaId: string,
): Promise<string> {
  if (!extensaoValida(file.type)) {
    throw new Error("Formato não aceito. Use PNG, JPG, GIF ou WEBP.");
  }
  if (file.size > TAMANHO_MAX_IMAGEM) {
    throw new Error("Imagem muito grande (máximo 5 MB).");
  }
  const caminho = caminhoImagemEmail(empresaId, file.name);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return data.publicUrl;
}

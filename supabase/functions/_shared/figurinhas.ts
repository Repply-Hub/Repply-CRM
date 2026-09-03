import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Registra uma figurinha na coleção do número (tabela `whatsapp_figurinhas`).
 *
 * Chamado dos DOIS lados do fluxo de mensagem:
 *   · `whatsapp-webhook`  — quando chega uma figurinha de um contato
 *   · `whatsapp-send`     — quando o CRM envia uma figurinha
 *
 * É sempre "faça o seu melhor": qualquer falha aqui é registrada e engolida, para
 * nunca derrubar o processamento da mensagem em si (a mensagem já foi entregue /
 * gravada quando isto roda).
 *
 * Dedupe por CONTEÚDO. `media_hash` é o sha256 dos bytes do arquivo: a mesma
 * figurinha recebida várias vezes gera arquivos distintos no Storage, mas um hash
 * só. Quando o chamador já tem o hash (o frontend calcula antes de subir a
 * imagem), passa em `hashConhecido` e evita-se o download aqui.
 *
 * `removida_em` NUNCA é tocada no conflito: se o atendente tirou a figurinha da
 * grade, ela continua fora mesmo que volte a circular.
 */
export async function registrarFigurinha(
  supabase: SupabaseClient,
  instanciaId: string | null | undefined,
  empresaId: string | null | undefined,
  mediaUrl: string | null | undefined,
  mediaMime: string | null | undefined,
  origem: "recebida" | "enviada",
  hashConhecido?: string | null,
): Promise<void> {
  if (!instanciaId || !empresaId || !mediaUrl) return;

  try {
    let hash = (hashConhecido ?? "").trim() || null;

    if (!hash) {
      const res = await fetch(mediaUrl);
      if (!res.ok) {
        console.error(
          `[figurinhas] não consegui baixar ${mediaUrl} para gerar o hash (${res.status})`,
        );
        return;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      hash = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // upsert por (instancia_id, media_hash): já existe → atualiza url/mime/origem
    // e `ultima_vez_em`; não existe → cria. `removida_em` fica de fora do payload
    // de propósito (ver docstring).
    const { error } = await supabase
      .from("whatsapp_figurinhas")
      .upsert(
        {
          empresa_id: empresaId,
          instancia_id: instanciaId,
          media_url: mediaUrl,
          media_hash: hash,
          media_mime: mediaMime ?? "image/webp",
          origem,
          ultima_vez_em: new Date().toISOString(),
        },
        { onConflict: "instancia_id,media_hash" },
      );

    if (error) {
      console.error("[figurinhas] upsert falhou:", error.message ?? error);
    }
  } catch (e) {
    console.error("[figurinhas] erro inesperado ao registrar:", e);
  }
}

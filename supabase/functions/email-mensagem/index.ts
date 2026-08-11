import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  baixarAnexoNylas,
  chamarNylas,
  corsHeaders,
  erroDoNylas,
  json,
  type MensagemNylas,
} from "../_shared/nylas.ts";

function extensaoPorMime(mime: string | null | undefined, filename?: string): string {
  const doNome = /\.([a-zA-Z0-9]{1,8})$/.exec((filename ?? "").trim());
  if (doNome) return doNome[1].toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  if (m.includes("bmp")) return "bmp";
  return "bin";
}

/**
 * Substitui `src="cid:..."` das imagens embutidas no corpo (logos, assinaturas
 * com foto, etc.) por uma URL pública de verdade.
 *
 * O Nylas expõe essas imagens como anexos comuns marcados `is_inline: true`,
 * com um `content_id` que é exatamente o que aparece depois de `cid:` no HTML.
 * O navegador não tem handler nenhum para o esquema `cid:` — só clientes de
 * e-mail nativos (Outlook, Thunderbird) sabem resolver isso contra os anexos
 * da própria mensagem — então, sem esta troca, toda imagem embutida aparece
 * como ícone quebrado.
 *
 * Baixa cada uma do Nylas e sobe para o bucket público `email-assets` (já
 * existente, usado hoje só para o logo da assinatura de saída). Roda uma vez,
 * no mesmo momento em que `corpo_html` é cacheado — não a cada leitura.
 */
async function resolverImagensInline(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  grantId: string,
  nylasMessageId: string,
  empresaId: string,
  mensagemId: string,
  attachments: NonNullable<MensagemNylas["attachments"]>,
  corpo: string,
): Promise<string> {
  const inline = attachments.filter((a) => a.is_inline && a.id && a.content_id);
  if (!inline.length) return corpo;

  let resultado = corpo;
  // Teto de segurança: uma assinatura com muitas imagens não deve travar a
  // abertura da mensagem numa cascata de downloads.
  for (const anexo of inline.slice(0, 25)) {
    const cid = (anexo.content_id ?? "").replace(/^<|>$/g, "").trim();
    if (!cid || !resultado.includes(`cid:${cid}`)) continue;

    const resp = await baixarAnexoNylas(
      `/v3/grants/${grantId}/attachments/${encodeURIComponent(anexo.id!)}/download` +
        `?message_id=${encodeURIComponent(nylasMessageId)}`,
    );
    if (!resp.ok || !resp.bytes) {
      console.warn(`[email-mensagem] falha ao baixar imagem inline ${anexo.id}: status ${resp.status}`);
      continue;
    }

    const ext = extensaoPorMime(resp.contentType ?? anexo.content_type, anexo.filename);
    const caminho = `inline/${empresaId}/${mensagemId}/${anexo.id}.${ext}`;
    const { error: erroUpload } = await supabase.storage
      .from("email-assets")
      .upload(caminho, resp.bytes, {
        contentType: resp.contentType ?? anexo.content_type ?? "application/octet-stream",
        upsert: true,
      });
    if (erroUpload) {
      console.warn(`[email-mensagem] falha ao subir imagem inline ${anexo.id}:`, erroUpload);
      continue;
    }

    const { data: pub } = supabase.storage.from("email-assets").getPublicUrl(caminho);
    if (!pub?.publicUrl) continue;

    resultado = resultado.split(`cid:${cid}`).join(pub.publicUrl);
  }
  return resultado;
}

/**
 * Busca o corpo completo de uma mensagem, sob demanda.
 *
 * Existe porque `GET /messages` (a listagem) devolve `snippet`, não `body`. Ler
 * o corpo custa uma chamada POR MENSAGEM — num sync de 20 seriam 40 chamadas
 * para um conteúdo que quase ninguém abre. Então o corpo é buscado quando
 * alguém clica, e fica cacheado na linha a partir daí.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão não identificada." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json().catch(() => ({})),
    ]);
    if (authError || !user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const mensagemId = typeof body?.mensagem_id === "string" ? body.mensagem_id : null;
    if (!mensagemId) return json({ error: "mensagem_id obrigatório." }, 400);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("empresa_id, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    // Duas leituras da MESMA linha, com credenciais diferentes.
    //
    // O service_role ignora o RLS, então quem autoriza é a leitura do
    // `userClient`: ela passa por `email_mensagens_select`, que é
    // `tenho_acesso_a_mensagem(conta_id, pastas)` — a regra por MARCADOR.
    //
    // Filtrar só por `empresa_id` era o recorte certo enquanto o acesso era por
    // CAIXA. Deixou de ser no momento em que a unidade virou (conta, usuário,
    // marcador): esta rota é a que devolve `corpo_html` e `anexos`, e sem a
    // segunda leitura ela entregaria o conteúdo de QUALQUER mensagem da
    // empresa a quem tivesse só um marcador — bastando ter guardado o id de
    // quando o acesso era mais amplo. Reduzir a liberação de alguém não teria
    // efeito nenhum aqui.
    const [{ data: mensagem }, { data: autorizada, error: erroAutorizacao }] = await Promise.all([
      supabase
        .from("email_mensagens")
        .select("id, conta_id, corpo_html, anexos, nylas_message_id")
        .eq("id", mensagemId)
        .eq("empresa_id", caller.empresa_id)
        .maybeSingle(),
      userClient
        .from("email_mensagens")
        .select("id")
        .eq("id", mensagemId)
        .maybeSingle(),
    ]);

    // Falha de INFRAESTRUTURA na leitura de autorização não é "não pode": é
    // "não sei". As duas acabam sem linha, e tratá-las igual transformaria um
    // soluço de rede num "Mensagem não encontrada" — a pessoa concluiria que o
    // e-mail sumiu, e o log registraria um acesso negado que nunca houve.
    if (erroAutorizacao) {
      console.error("[email-mensagem] falha ao verificar acesso:", erroAutorizacao);
      return json(
        { error: "Não consegui verificar seu acesso a esta mensagem. Tente de novo." },
        503,
      );
    }

    // Mesma resposta para "não existe" e "não é sua": quem não pode ler também
    // não pode descobrir que a mensagem existe.
    if (!mensagem || !autorizada) {
      if (mensagem && !autorizada) {
        console.warn(
          `[email-mensagem] acesso negado: user=${user.id} mensagem=${mensagemId} empresa=${caller.empresa_id}`,
        );
      }
      return json({ error: "Mensagem não encontrada." }, 404);
    }

    // Cache: uma vez buscado, o corpo não muda — EXCETO para mensagens
    // cacheadas antes de `resolverImagensInline` existir, cujo `corpo_html`
    // ainda carrega `cid:` não resolvido (imagem quebrada). Essas caem no
    // busca-de-novo abaixo, uma única vez; depois disso o `cid:` já não
    // aparece mais e o cache volta a valer normalmente.
    if (mensagem.corpo_html && !mensagem.corpo_html.includes("cid:")) {
      return json({ corpo_html: mensagem.corpo_html, anexos: mensagem.anexos ?? [], cache: true });
    }

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", mensagem.conta_id)
      .maybeSingle();

    if (!grantRow?.grant_id) {
      return json({ error: "Credencial da caixa não encontrada. Reconecte.", code: "sem_grant" }, 409);
    }

    const resp = await chamarNylas<MensagemNylas>(
      `/v3/grants/${grantRow.grant_id}/messages/${encodeURIComponent(mensagem.nylas_message_id)}`,
      { method: "GET", timeoutMs: 30_000 },
    );

    if (!resp.ok || !resp.body.data) {
      const motivo = erroDoNylas(resp.body, resp.texto);
      console.error("[email-mensagem] Nylas recusou:", resp.status, motivo);

      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: motivo.slice(0, 500) })
          .eq("id", mensagem.conta_id);
        return json(
          { error: "A conexão com o e-mail expirou. Reconecte a caixa.", code: "conta_revogada" },
          409,
        );
      }
      // 404 no provedor = a mensagem foi apagada de lá. Não é erro nosso.
      if (resp.status === 404) {
        return json({ error: "Esta mensagem não existe mais na caixa de origem." }, 404);
      }
      return json({ error: `Não foi possível abrir a mensagem: ${motivo}` }, 502);
    }

    const completa = resp.body.data;
    const anexos = (completa.attachments ?? [])
      .filter((a) => !a.is_inline)
      .map((a) => ({ id: a.id, filename: a.filename, content_type: a.content_type, size: a.size }));

    // Corpo vazio é resposta legítima (e-mail só com anexo). Grava assim mesmo,
    // senão toda abertura dessa mensagem gastaria uma chamada nova.
    const corpo = await resolverImagensInline(
      supabase,
      grantRow.grant_id,
      mensagem.nylas_message_id,
      caller.empresa_id,
      mensagem.id,
      completa.attachments ?? [],
      completa.body ?? "",
    );

    const { error: erroUpdate } = await supabase
      .from("email_mensagens")
      .update({ corpo_html: corpo, anexos, tem_anexo: anexos.length > 0 })
      .eq("id", mensagem.id);

    if (erroUpdate) {
      // O corpo foi buscado; falhar agora só perderia o cache. Devolve mesmo assim.
      console.error("[email-mensagem] buscado mas não cacheado:", erroUpdate);
    }

    return json({ corpo_html: corpo, anexos, cache: false });
  } catch (err) {
    console.error("[email-mensagem]", err);
    return json({ error: "Erro inesperado ao abrir a mensagem.", detail: String(err) }, 500);
  }
});

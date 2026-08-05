import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chamarNylas,
  corsHeaders,
  erroDoNylas,
  json,
  type MensagemNylas,
} from "../_shared/nylas.ts";

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
    const [{ data: mensagem }, { data: autorizada }] = await Promise.all([
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

    // Cache: uma vez buscado, o corpo não muda.
    if (mensagem.corpo_html) {
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
    const corpo = completa.body ?? "";

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

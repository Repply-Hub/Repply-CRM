import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renovarAccessToken,
  criarEvento,
  atualizarEvento,
  apagarEvento,
  listarMudancas,
} from "../_shared/calendario-google.ts";
import {
  paraGoogle,
  paraRepply,
  quemVence,
  excedeDisjuntor,
  deveTratarComoRecusa,
} from "../_shared/calendario-nucleo.ts";

/**
 * O motor da sincronização de calendário — Fase 1 (Google). Dois modos, ambos chamados só pelo
 * banco (gatilho e cron), com `service_role`:
 *  - modo 'empurrar': processa a fila `calendario_fila` (mudanças do Repply → Google), na hora.
 *  - modo 'puxar': para cada conexão, traz do Google o que mudou desde o `sync_token` (Google → Repply).
 *
 * 🔴 Só toca em evento que tem "etiqueta" (`evento_sync_externo`) — nunca nos outros eventos pessoais
 * do vendedor. E a etiqueta só existe para eventos cujo DONO (`eventos.user_id`) é o dono da conexão,
 * então a volta só altera eventos que aquele vendedor já poderia editar (a permissão do Repply é
 * respeitada por construção, mesmo o motor rodando como service_role). Não é testável localmente.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KEY_RAW = Deno.env.get("CALENDARIO_TOKEN_KEY")!;
const FUSO = "America/Sao_Paulo";

// ---- Cifra/decifra (mesmo formato da função calendario-conectar: IV 12 bytes + ciphertext, base64)
async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(), new TextEncoder().encode(texto)),
  );
  const junto = new Uint8Array(iv.length + ct.length);
  junto.set(iv);
  junto.set(ct, iv.length);
  return btoa(String.fromCharCode(...junto));
}
async function decifrar(b64: string): Promise<string> {
  const junto = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = junto.slice(0, 12);
  const ct = junto.slice(12);
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await chave(), ct);
  return new TextDecoder().decode(claro);
}

interface ContaCalendario {
  id: string;
  user_id: string;
  calendario_externo_id: string;
  refresh_token: string;
  access_token: string;
  token_expira_em: string | null;
  sync_token: string | null;
}

/** Devolve um access_token válido, renovando (e regravando cifrado) quando estiver perto de expirar. */
async function tokenValido(conta: ContaCalendario): Promise<string> {
  const margem = 60_000; // 1 min de folga
  if (conta.token_expira_em && new Date(conta.token_expira_em).getTime() > Date.now() + margem) {
    return await decifrar(conta.access_token);
  }
  const refresh = await decifrar(conta.refresh_token);
  const nov = await renovarAccessToken(refresh);
  await admin
    .from("calendario_contas")
    .update({
      access_token: await cifrar(nov.access_token),
      token_expira_em: new Date(Date.now() + nov.expires_in * 1000).toISOString(),
    })
    .eq("id", conta.id);
  return nov.access_token;
}

async function contaConectadaDe(userId: string): Promise<ContaCalendario | null> {
  const { data } = await admin
    .from("calendario_contas")
    .select("id, user_id, calendario_externo_id, refresh_token, access_token, token_expira_em, sync_token")
    .eq("user_id", userId)
    .eq("provedor", "google")
    .eq("status", "conectada")
    .maybeSingle();
  return (data as ContaCalendario) ?? null;
}

async function marcarProcessado(id: string) {
  await admin.from("calendario_fila").update({ processado_em: new Date().toISOString() }).eq("id", id);
}

async function marcarContaComErro(userId: string, erro: unknown) {
  await admin
    .from("calendario_contas")
    .update({ status: "erro", ultimo_erro: String(erro).slice(0, 500) })
    .eq("user_id", userId)
    .eq("provedor", "google");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * O evento do Repply já está igual ao que veio do Google? Compara semanticamente (data por instante,
 * não por texto). 🔴 É a trava ANTI-ECO: sem ela, aplicar a volta gravaria no evento, o gatilho
 * enfileiraria um "empurrar", que mudaria o Google de novo, que a próxima volta traria de novo —
 * laço infinito. Se nada mudou de fato, a volta não reescreve (só atualiza a etiqueta) e o eco morre.
 */
function mesmoConteudo(
  ev: { titulo: string; descricao: string | null; inicio: string; fim: string; dia_inteiro: boolean },
  v: { titulo: string; descricao: string | null; inicio: string; fim: string; diaInteiro: boolean },
): boolean {
  return (
    ev.titulo === v.titulo &&
    (ev.descricao ?? null) === (v.descricao ?? null) &&
    ev.dia_inteiro === v.diaInteiro &&
    new Date(ev.inicio).getTime() === new Date(v.inicio).getTime() &&
    new Date(ev.fim).getTime() === new Date(v.fim).getTime()
  );
}

// ---- Saída (Repply → Google): processa a fila ------------------------------------------------
async function empurrar(): Promise<Response> {
  const { data: fila } = await admin
    .from("calendario_fila")
    .select("*")
    .is("processado_em", null)
    .order("criado_em", { ascending: true })
    .limit(200);

  for (const item of fila ?? []) {
    try {
      const conta = await contaConectadaDe(item.user_id);
      if (!conta) { await marcarProcessado(item.id); continue; }
      const token = await tokenValido(conta);

      if (item.operacao === "apagar") {
        // O id externo veio guardado na fila (a etiqueta some com o evento, por cascata).
        if (item.evento_externo_id) {
          await apagarEvento(token, conta.calendario_externo_id, item.evento_externo_id);
        }
      } else {
        const { data: evento } = await admin
          .from("eventos")
          .select("titulo, descricao, inicio, fim, dia_inteiro, updated_at")
          .eq("id", item.evento_id)
          .maybeSingle();
        if (!evento) { await marcarProcessado(item.id); continue; } // evento sumiu antes de subir

        const recurso = paraGoogle(
          { titulo: evento.titulo, descricao: evento.descricao, inicio: evento.inicio, fim: evento.fim, diaInteiro: evento.dia_inteiro },
          FUSO,
        );
        const { data: etiqueta } = await admin
          .from("evento_sync_externo")
          .select("id, evento_externo_id")
          .eq("evento_id", item.evento_id)
          .eq("calendario_conta_id", conta.id)
          .maybeSingle();

        const res = etiqueta
          ? await atualizarEvento(token, conta.calendario_externo_id, etiqueta.evento_externo_id, recurso)
          : await criarEvento(token, conta.calendario_externo_id, recurso);

        await admin.from("evento_sync_externo").upsert(
          {
            evento_id: item.evento_id,
            calendario_conta_id: conta.id,
            evento_externo_id: res.id,
            etag_externo: res.etag,
            atualizado_repply_em: evento.updated_at,
            ultima_sync_em: new Date().toISOString(),
          },
          { onConflict: "evento_id,calendario_conta_id" },
        );
      }
      await marcarProcessado(item.id);
    } catch (e) {
      // Não trava a fila inteira por causa de um item: registra o erro na conta e segue.
      await marcarContaComErro(item.user_id, e);
      await marcarProcessado(item.id);
    }
  }
  return json({ ok: true });
}

// ---- Volta (Google → Repply): traz as mudanças por sync token --------------------------------
async function puxar(): Promise<Response> {
  const { data: contas } = await admin
    .from("calendario_contas")
    .select("id, user_id, calendario_externo_id, refresh_token, access_token, token_expira_em, sync_token")
    .eq("provedor", "google")
    .eq("status", "conectada");

  for (const conta of (contas as ContaCalendario[]) ?? []) {
    let token: string;
    let mudancas: Awaited<ReturnType<typeof listarMudancas>>;
    try {
      token = await tokenValido(conta);
      mudancas = await listarMudancas(token, conta.calendario_externo_id, conta.sync_token);
    } catch (e) {
      // O sync token expirou (410): zera para a próxima passada refazer a leitura do zero.
      if ((e as { syncExpirado?: boolean }).syncExpirado) {
        await admin.from("calendario_contas").update({ sync_token: null }).eq("id", conta.id);
        continue;
      }
      await marcarContaComErro(conta.user_id, e);
      continue;
    }

    // DISJUNTOR: exclusão em massa suspeita → para esta passada sem apagar nada (CLAUDE.md §4.6).
    const exclusoes = mudancas.itens.filter((i) => i.status === "cancelled");
    if (excedeDisjuntor(exclusoes.length)) {
      await admin
        .from("calendario_contas")
        .update({ status: "erro", ultimo_erro: "Sincronização parada: exclusão em massa suspeita no calendário externo." })
        .eq("id", conta.id);
      continue;
    }

    for (const it of mudancas.itens) {
      // Só o que tem etiqueta — o resto da agenda do vendedor é intocável.
      const { data: etiqueta } = await admin
        .from("evento_sync_externo")
        .select("id, evento_id, etag_externo")
        .eq("calendario_conta_id", conta.id)
        .eq("evento_externo_id", it.id)
        .maybeSingle();
      if (!etiqueta) continue;

      if (it.status === "cancelled") {
        // Apaga a ETIQUETA ANTES do evento: assim o gatilho BEFORE DELETE não encontra etiqueta e
        // não reenfileira um 'apagar' de volta ao Google (o evento já foi apagado LÁ — seria eco).
        await admin.from("evento_sync_externo").delete().eq("id", etiqueta.id);
        const { error: erroDel } = await admin.from("eventos").delete().eq("id", etiqueta.evento_id);
        if (erroDel) await marcarContaComErro(conta.user_id, erroDel); // não engole erro (CLAUDE.md §4.6)
        continue;
      }

      const { data: eventoRepply } = await admin
        .from("eventos")
        .select("titulo, descricao, inicio, fim, dia_inteiro, updated_at")
        .eq("id", etiqueta.evento_id)
        .maybeSingle();
      if (!eventoRepply) continue; // o evento sumiu no Repply nesse meio-tempo

      // Conflito: vence o mais recente (empate → Repply, a fonte oficial).
      if (quemVence(eventoRepply.updated_at, it.updated) === "repply") continue;

      const v = paraRepply(it);
      if (mesmoConteudo(eventoRepply, v)) {
        // Nada mudou de fato (provável eco do nosso próprio empurrar): não reescreve o evento —
        // só registra a versão vista, e o eco morre aqui.
        await admin
          .from("evento_sync_externo")
          .update({ etag_externo: it.etag, atualizado_repply_em: it.updated, ultima_sync_em: new Date().toISOString() })
          .eq("id", etiqueta.id);
        continue;
      }

      const { count } = await admin
        .from("eventos")
        .update({ titulo: v.titulo, descricao: v.descricao, inicio: v.inicio, fim: v.fim, dia_inteiro: v.diaInteiro }, { count: "exact" })
        .eq("id", etiqueta.evento_id);
      if (!deveTratarComoRecusa(count)) {
        await admin
          .from("evento_sync_externo")
          .update({ etag_externo: it.etag, atualizado_repply_em: it.updated, ultima_sync_em: new Date().toISOString() })
          .eq("id", etiqueta.id);
      }
    }

    await admin
      .from("calendario_contas")
      .update({ sync_token: mudancas.proximoSyncToken, ultima_sync_em: new Date().toISOString() })
      .eq("id", conta.id);
  }
  return json({ ok: true });
}

serve(async (req) => {
  const { modo } = await req.json().catch(() => ({ modo: "puxar" }));
  return modo === "empurrar" ? await empurrar() : await puxar();
});

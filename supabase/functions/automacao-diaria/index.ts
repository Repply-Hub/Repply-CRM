import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results = {
      followups_gerados: 0,
      inatividade_gerados: 0,
      erros: [] as string[],
    };

    // ========================================================
    // 1. VERIFICAÇÃO DE FOLLOW-UPS ATRASADOS / DO DIA
    // ========================================================
    const { data: followups, error: errFollow } = await supabase
      .from("historico_contatos")
      .select("id, pedido_id, vendedor_id, proximo_contato_em, descricao")
      .not("proximo_contato_em", "is", null)
      .lte("proximo_contato_em", new Date().toISOString());

    if (errFollow) {
      results.erros.push(`followups query: ${errFollow.message}`);
    } else if (followups && followups.length > 0) {
      // Get pedido details for each follow-up
      const pedidoIds = [...new Set(followups.map((f) => f.pedido_id))];
      const { data: pedidos } = await supabase
        .from("pedidos")
        .select("id, cliente_id, status")
        .in("id", pedidoIds)
        .not("status", "in", '("fechado","perdido")');

      const activePedidoMap = new Map(
        (pedidos ?? []).map((p) => [p.id, p])
      );

      for (const f of followups) {
        const pedido = activePedidoMap.get(f.pedido_id);
        if (!pedido) continue; // pedido already closed/lost

        const isAtrasado =
          new Date(f.proximo_contato_em!) < new Date(new Date().toDateString());

        // Check if notification already exists for this follow-up today
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("notificacoes")
          .select("id")
          .eq("pedido_id", f.pedido_id)
          .eq("vendedor_id", f.vendedor_id)
          .eq("tipo", "followup")
          .gte("created_at", `${today}T00:00:00Z`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const titulo = isAtrasado
          ? "⚠️ Follow-up atrasado"
          : "📋 Follow-up agendado para hoje";

        const mensagem = f.descricao
          ? `Contato pendente: ${f.descricao}`
          : "Você tem um contato agendado que precisa de atenção.";

        const { error: insertErr } = await supabase
          .from("notificacoes")
          .insert({
            vendedor_id: f.vendedor_id,
            pedido_id: f.pedido_id,
            cliente_id: pedido.cliente_id,
            tipo: "followup",
            titulo,
            mensagem,
          });

        if (insertErr) {
          results.erros.push(`insert followup notif: ${insertErr.message}`);
        } else {
          results.followups_gerados++;
        }
      }
    }

    // ========================================================
    // 2. VERIFICAÇÃO DE INATIVIDADE DE PEDIDOS
    // ========================================================
    const { data: inativos, error: errInat } = await supabase
      .from("vw_pedidos_inativos")
      .select("*");

    if (errInat) {
      results.erros.push(`inatividade query: ${errInat.message}`);
    } else if (inativos && inativos.length > 0) {
      for (const p of inativos) {
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("notificacoes")
          .select("id")
          .eq("pedido_id", p.pedido_id)
          .eq("vendedor_id", p.vendedor_id)
          .eq("tipo", "inatividade")
          .gte("created_at", `${today}T00:00:00Z`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: insertErr } = await supabase
          .from("notificacoes")
          .insert({
            vendedor_id: p.vendedor_id,
            pedido_id: p.pedido_id,
            cliente_id: p.cliente_id,
            tipo: "inatividade",
            titulo: `🔴 Pedido parado há ${p.dias_parado} dias`,
            mensagem: `O pedido do cliente "${p.cliente_nome}" está no status "${p.status}" sem atualização há ${p.dias_parado} dias.`,
          });

        if (insertErr) {
          results.erros.push(`insert inatividade notif: ${insertErr.message}`);
        } else {
          results.inatividade_gerados++;
        }
      }
    }

    // ========================================================
    // 3. LOG DE AUDITORIA
    // ========================================================
    await supabase.from("automation_logs").insert({
      tipo: "automacao_diaria",
      status: results.erros.length > 0 ? "parcial" : "sucesso",
      detalhes: results,
    });

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatAntecedencia(minutos: number): string {
  if (minutos % 1440 === 0) {
    const dias = minutos / 1440;
    return dias === 1 ? "1 dia" : `${dias} dias`;
  }
  if (minutos % 60 === 0) {
    const horas = minutos / 60;
    return horas === 1 ? "1 hora" : `${horas} horas`;
  }
  return minutos === 1 ? "1 minuto" : `${minutos} minutos`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results = { lembretes_enviados: 0, erros: [] as string[] };

    // Janela limitada só para não varrer a tabela inteira; o filtro real de "está na hora"
    // é feito em memória logo abaixo, já que precisa subtrair lembrete_minutos de inicio.
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: eventos, error: errEventos } = await supabase
      .from("eventos")
      .select("id, user_id, titulo, inicio, lembrete_minutos")
      .not("lembrete_minutos", "is", null)
      .eq("lembrete_enviado", false)
      .lte("inicio", windowEnd.toISOString());

    if (errEventos) {
      results.erros.push(`eventos query: ${errEventos.message}`);
      return new Response(JSON.stringify(results), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const devidos = (eventos ?? []).filter((e) => {
      const disparoEm = new Date(e.inicio).getTime() - e.lembrete_minutos! * 60_000;
      return disparoEm <= now.getTime();
    });

    if (devidos.length === 0) {
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserIds = [...new Set(devidos.map((e) => e.user_id))];
    // `empresa_id` entra no select por causa da seção Calendário: esta rotina roda com
    // service_role e enxerga os eventos de TODAS as empresas, então sem checar cada uma
    // delas uma empresa com o Calendário desligado continuaria recebendo "🔔 Lembrete" de
    // evento que ninguém consegue abrir — a rota recusa e o item sumiu do menu, mas o
    // sininho toca.
    const { data: usuarios, error: errUsuarios } = await supabase
      .from("usuarios")
      .select("id, user_id, empresa_id")
      .in("user_id", authUserIds);

    if (errUsuarios) {
      results.erros.push(`usuarios query: ${errUsuarios.message}`);
      return new Response(JSON.stringify(results), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usuarioIdByAuthId = new Map(
      (usuarios ?? []).map((u) => [u.user_id as string, u.id as string]),
    );
    const empresaIdByAuthId = new Map(
      (usuarios ?? []).map((u) => [u.user_id as string, u.empresa_id as string | null]),
    );

    // Pergunta UMA vez por empresa, não uma por evento: são poucas empresas e podem ser
    // muitos eventos.
    //
    // `empresa_tem_secao_de` e não `empresa_tem_secao`: aqui não há sessão, e a irmã
    // resolveria a empresa por `get_my_empresa_id()` — que devolve nulo com service_role e
    // faria a função liberar todo mundo, dando a impressão de que a checagem existe.
    const temCalendarioPorEmpresa = new Map<string, boolean>();
    for (const empresaId of new Set([...empresaIdByAuthId.values()].filter(Boolean))) {
      const { data, error } = await supabase.rpc("empresa_tem_secao_de", {
        p_empresa_id: empresaId,
        p_secao: "calendario",
      });
      // Na dúvida, ENVIA. Erro de rede não pode calar o lembrete de quem tem a seção — o
      // custo de um lembrete a mais é menor que o de uma reunião perdida.
      temCalendarioPorEmpresa.set(empresaId as string, error ? true : data === true);
    }

    for (const evento of devidos) {
      const usuarioId = usuarioIdByAuthId.get(evento.user_id);
      if (!usuarioId) continue; // sem usuário interno correspondente (ex.: conta órfã)

      // Empresa sem a seção Calendário: pula SEM marcar `lembrete_enviado`.
      //
      // Não marcar é o ponto todo: se marcasse, religar a seção deixaria o lembrete
      // perdido para sempre, porque a consulta lá em cima só pega `lembrete_enviado = false`.
      const empresaDoEvento = empresaIdByAuthId.get(evento.user_id);
      if (empresaDoEvento && temCalendarioPorEmpresa.get(empresaDoEvento) === false) continue;

      const horario = new Date(evento.inicio).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const { error: insertErr } = await supabase.from("notificacoes").insert({
        usuario_id: usuarioId,
        tipo: "evento_lembrete",
        titulo: `🔔 Lembrete: ${evento.titulo}`,
        mensagem: `Começa às ${horario} (em ${formatAntecedencia(evento.lembrete_minutos!)}).`,
      });

      if (insertErr) {
        results.erros.push(`insert notificacao (evento ${evento.id}): ${insertErr.message}`);
        continue;
      }

      const { error: updateErr } = await supabase
        .from("eventos")
        .update({ lembrete_enviado: true })
        .eq("id", evento.id);

      if (updateErr) {
        results.erros.push(`update evento ${evento.id}: ${updateErr.message}`);
        continue;
      }

      results.lembretes_enviados++;
    }

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

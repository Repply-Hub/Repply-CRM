import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assuntoDoEmail,
  htmlDoEmail,
  linkDaAgenda,
  mensagemDoSininho,
  textoDoChat,
  tituloDoSininho,
  type AvisoDeEvento,
  type DadosDoEvento,
  type TipoDeAviso,
} from "../_shared/aviso-de-evento.ts";

/**
 * O robô da agenda. Roda a cada 5 min (cron) e também é chamado na hora pelo banco
 * (gatilho `eventos_chama_envio`) sempre que um aviso é anotado.
 *
 * 1. Gera na fila os lembretes que ficaram devidos (`gerar_lembretes_devidos`, idempotente).
 * 2. Reserva até 50 itens da fila sem repetir (`reservar_avisos_de_evento`, SKIP LOCKED).
 * 3. Para cada item, cumpre os canais que faltam — sininho sempre; mensagem direta e e-mail
 *    quando quem criou ligou "avisar participantes". Cada canal tem sua marca: se o e-mail
 *    falhar e o chat não, a próxima tentativa manda só o e-mail. Desiste em 5 tentativas.
 *
 * 🔴 Nenhum erro guardado leva segredo. O corpo da resposta do Resend é cortado em 300.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinhaDoAviso {
  id: string;
  empresa_id: string;
  destinatario_id: string;
  remetente_id: string | null;
  tipo: TipoDeAviso;
  minutos: number | null;
  avisar: boolean;
  dados: DadosDoEvento;
  sininho_em: string | null;
  chat_em: string | null;
  email_em: string | null;
}

const NOME_CANONICO = "RESEND_API_KEY";
function lerChaveDoResend(): string | undefined {
  const exato = Deno.env.get(NOME_CANONICO);
  if (exato) return exato;
  const outraCaixa = Object.keys(Deno.env.toObject()).find((n) => n.toUpperCase() === NOME_CANONICO);
  return outraCaixa ? Deno.env.get(outraCaixa) : undefined;
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const resultado = { lembretes_gerados: 0, avisos: 0, concluidos: 0, erros: [] as string[] };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: gerados, error: eGerar } = await supabase.rpc("gerar_lembretes_devidos");
    if (eGerar) resultado.erros.push(`gerar_lembretes_devidos: ${eGerar.message}`);
    else resultado.lembretes_gerados = (gerados as number) ?? 0;

    const { data: reservados, error: eReservar } = await supabase.rpc("reservar_avisos_de_evento", {
      p_limite: 50,
    });
    if (eReservar) {
      resultado.erros.push(`reservar_avisos_de_evento: ${eReservar.message}`);
      return json(resultado, 500);
    }
    const lista = (reservados ?? []) as LinhaDoAviso[];
    if (lista.length === 0) return json(resultado);

    const ids = [...new Set(lista.flatMap((a) => [a.destinatario_id, a.remetente_id]).filter(Boolean))] as string[];
    const { data: pessoas } = await supabase.from("usuarios").select("id, email").in("id", ids);
    const emailPorId = new Map((pessoas ?? []).map((p) => [p.id as string, p.email as string | null]));

    // Chat desligado na empresa: a mensagem direta não sai; sininho e e-mail, sim.
    const chatPorEmpresa = new Map<string, boolean>();
    for (const empresaId of new Set(lista.map((a) => a.empresa_id))) {
      const { data, error } = await supabase.rpc("empresa_tem_secao_de", {
        p_empresa_id: empresaId,
        p_secao: "chat",
      });
      chatPorEmpresa.set(empresaId, error ? true : data === true);
    }

    const apiKey = lerChaveDoResend();
    const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Repply <nao-responda@repplyhub.com.br>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://crm.repplyhub.com.br";

    for (const a of lista) {
      resultado.avisos++;
      const aviso: AvisoDeEvento = { tipo: a.tipo, minutos: a.minutos, dados: a.dados };
      const marcas: Record<string, string> = {};
      const erros: string[] = [];
      const agora = () => new Date().toISOString();

      if (!a.sininho_em) {
        const { error } = await supabase.from("notificacoes").insert({
          usuario_id: a.destinatario_id,
          tipo: `evento_${a.tipo}`,
          titulo: tituloDoSininho(aviso),
          mensagem: mensagemDoSininho(aviso),
        });
        if (error) erros.push(`sininho: ${error.message}`);
        else marcas.sininho_em = agora();
      }

      const querChat =
        a.avisar && !!a.remetente_id && a.remetente_id !== a.destinatario_id &&
        chatPorEmpresa.get(a.empresa_id) !== false;
      if (querChat && !a.chat_em) {
        const { error } = await supabase.from("chat_mensagens").insert({
          conteudo: textoDoChat(aviso),
          usuario_id: a.remetente_id,
          empresa_id: a.empresa_id,
          recipient_id: a.destinatario_id,
        });
        if (error) erros.push(`chat: ${error.message}`);
        else marcas.chat_em = agora();
      }

      const email = emailPorId.get(a.destinatario_id);
      const querEmail = a.avisar && !!email;
      if (querEmail && !a.email_em) {
        if (!apiKey) {
          erros.push("email: chave do Resend ausente");
        } else {
          try {
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: remetente,
                to: [email],
                subject: assuntoDoEmail(aviso),
                html: htmlDoEmail(aviso, linkDaAgenda(appUrl, a.dados.inicio)),
              }),
            });
            if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
            marcas.email_em = agora();
          } catch (e) {
            erros.push(`email: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const faltaSininho = !a.sininho_em && !marcas.sininho_em;
      const faltaChat = querChat && !a.chat_em && !marcas.chat_em;
      const faltaEmail = querEmail && !a.email_em && !marcas.email_em;
      const concluido = !faltaSininho && !faltaChat && !faltaEmail;
      const ultimoErro = erros.length ? erros.join(" | ").slice(0, 500) : null;

      const { error: eMarcar } = await supabase
        .from("evento_avisos")
        .update({
          ...marcas,
          processando_desde: null,
          ultimo_erro: ultimoErro,
          concluido_em: concluido ? agora() : null,
        })
        .eq("id", a.id);
      if (eMarcar) erros.push(`marcar: ${eMarcar.message}`);

      if (concluido) resultado.concluidos++;
      if (ultimoErro) resultado.erros.push(`${a.id}: ${ultimoErro}`);
    }

    return json(resultado);
  } catch (error) {
    resultado.erros.push(error instanceof Error ? error.message : String(error));
    return json(resultado, 500);
  }
});

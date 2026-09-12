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

      // Cada canal é contido no próprio try/catch, não só o do Resend (achado 2 da
      // revisão). Um INSERT que LANÇA (queda de rede, DNS) em vez de devolver {error}
      // não pode pular os outros canais deste item nem escapar do loop e abandonar o
      // resto do lote — vira erro registrado, igual a qualquer outra falha de envio.
      if (!a.sininho_em) {
        try {
          const { error } = await supabase.from("notificacoes").insert({
            usuario_id: a.destinatario_id,
            tipo: `evento_${a.tipo}`,
            titulo: tituloDoSininho(aviso),
            mensagem: mensagemDoSininho(aviso),
          });
          if (error) erros.push(`sininho: ${error.message}`);
          else marcas.sininho_em = agora();
        } catch (e) {
          erros.push(`sininho: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const querChat =
        a.avisar && !!a.remetente_id && a.remetente_id !== a.destinatario_id &&
        chatPorEmpresa.get(a.empresa_id) !== false;
      if (querChat && !a.chat_em) {
        try {
          const { error } = await supabase.from("chat_mensagens").insert({
            conteudo: textoDoChat(aviso),
            usuario_id: a.remetente_id,
            empresa_id: a.empresa_id,
            recipient_id: a.destinatario_id,
          });
          if (error) erros.push(`chat: ${error.message}`);
          else marcas.chat_em = agora();
        } catch (e) {
          erros.push(`chat: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const email = emailPorId.get(a.destinatario_id);
      const querEmail = a.avisar && !!email;
      if (querEmail && !a.email_em) {
        if (!apiKey) {
          erros.push("email: chave do Resend ausente");
        } else {
          // Teto de tempo para o Resend (achado 3): sem isto, uma chamada travada prende
          // o loop sequencial pelo resto do lote — os itens seguintes nem chegam a ser
          // tentados dentro da janela do cron. Tempo esgotado conta como qualquer outra
          // falha de envio: fica em `erros`, não marca `email_em`, e a próxima passada
          // tenta de novo — nunca marca como enviado o que só travou.
          const TEMPO_LIMITE_RESEND_MS = 10_000;
          const controle = new AbortController();
          const disparoDoLimite = setTimeout(() => controle.abort(), TEMPO_LIMITE_RESEND_MS);
          try {
            // Cancelamento e retirado nunca mostram o botão da agenda no e-mail
            // (`htmlDoEmail` descarta o link para esses dois tipos) — monta o link só
            // quando o e-mail vai usá-lo (achado 4, custo zero nos outros três tipos).
            const link = a.tipo === "cancelamento" || a.tipo === "retirado"
              ? ""
              : linkDaAgenda(appUrl, a.dados.inicio);
            // Chave de idempotência do Resend: estável para "esta linha da fila, este
            // canal" (o `-email` no fim) e única entre linhas (`a.id` é a chave primária
            // de `evento_avisos`, nunca se repete). É o que fecha a lacuna do achado 3 —
            // um envio que travou e teve a resposta perdida pelo tempo limite não pode
            // virar um SEGUNDO e-mail quando a próxima passada tentar de novo com a MESMA
            // linha: o Resend reconhece a chave repetida (janela de 24h, folga de sobra
            // sobre o teto de 5 tentativas) e devolve o resultado do envio original, sem
            // despachar de novo.
            const chaveDeIdempotencia = `evento-aviso-${a.id}-email`;
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": chaveDeIdempotencia,
              },
              body: JSON.stringify({
                from: remetente,
                to: [email],
                subject: assuntoDoEmail(aviso),
                html: htmlDoEmail(aviso, link),
              }),
              signal: controle.signal,
            });
            if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
            marcas.email_em = agora();
          } catch (e) {
            const foiTempoLimite = e instanceof Error && e.name === "AbortError";
            erros.push(`email: ${foiTempoLimite ? `tempo limite (${TEMPO_LIMITE_RESEND_MS}ms)` : (e instanceof Error ? e.message : String(e))}`);
          } finally {
            clearTimeout(disparoDoLimite);
          }
        }
      }

      const faltaSininho = !a.sininho_em && !marcas.sininho_em;
      const faltaChat = querChat && !a.chat_em && !marcas.chat_em;
      const faltaEmail = querEmail && !a.email_em && !marcas.email_em;
      // Isto é só o resultado EM MEMÓRIA desta passada pelos canais — ainda não é o que
      // vale de verdade. Só a gravação abaixo decide o que fica valendo (achado 1): sem
      // ela persistir, `sininho_em`/`chat_em`/`email_em` continuam nulos no banco e a
      // próxima reserva manda os três de novo, não importa o que aconteceu aqui em cima.
      const concluidoNestaPassada = !faltaSininho && !faltaChat && !faltaEmail;
      const erroDosCanais = erros.length ? erros.join(" | ").slice(0, 500) : null;

      try {
        const { error: eMarcar } = await supabase
          .from("evento_avisos")
          .update({
            ...marcas,
            processando_desde: null,
            ultimo_erro: erroDosCanais,
            concluido_em: concluidoNestaPassada ? agora() : null,
          })
          .eq("id", a.id);

        if (eMarcar) {
          // 🔴 A gravação falhou: nada do que os canais fizeram nesta passada ficou no
          // banco — nem as marcas de tempo, nem `concluido_em`. A linha real continua
          // exatamente como estava antes desta passada. Contar como concluído aqui seria
          // reportar um sucesso que não aconteceu, e quem lesse o relatório confiaria
          // numa fila que, por dentro, ainda tem os três canais em branco — pronta para
          // reenviar sininho, chat e e-mail inteiros na próxima reserva. Por isso NUNCA
          // soma em `concluidos` quando a gravação falha, e o erro entra no relatório
          // mesmo quando nenhum canal falhou.
          const detalhe = erroDosCanais ? `${erroDosCanais} | marcar: ${eMarcar.message}` : `marcar: ${eMarcar.message}`;
          resultado.erros.push(`${a.id}: ${detalhe.slice(0, 500)}`);
        } else {
          if (erroDosCanais) resultado.erros.push(`${a.id}: ${erroDosCanais}`);
          if (concluidoNestaPassada) resultado.concluidos++;
        }
      } catch (e) {
        // A própria gravação pode lançar em vez de devolver {error} — mesma classe de
        // falha do achado 2. Contida aqui, item por item: não conta como concluído (a
        // razão é a mesma de cima) e não abandona o resto do lote.
        const msg = e instanceof Error ? e.message : String(e);
        const detalhe = erroDosCanais ? `${erroDosCanais} | marcar: ${msg}` : `marcar: ${msg}`;
        resultado.erros.push(`${a.id}: ${detalhe.slice(0, 500)}`);
      }
    }

    return json(resultado);
  } catch (error) {
    resultado.erros.push(error instanceof Error ? error.message : String(error));
    return json(resultado, 500);
  }
});

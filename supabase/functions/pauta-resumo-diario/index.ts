import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODELO_RESUMO, MODELO_ITEM } from "./modelo.ts";

/**
 * O resumo diário da pauta, às 7h de Brasília.
 *
 * ESTA FUNÇÃO NÃO DECIDE NADA. Ela pergunta ao banco duas coisas e manda o e-mail:
 *
 *   pauta_resumo_destinatarios()  quem deve receber HOJE (seção ligada, resumo ligado,
 *                                 hoje entre os dias escolhidos pelo gestor)
 *   pauta_do_dia_de(usuario)      a pauta de cada um — a MESMA função que a tela usa
 *
 * É por isso que existe: se a regra fosse reimplementada aqui em TypeScript, a tela diria
 * "5 orçamentos parados" e o e-mail diria 7, e ninguém confiaria em nenhum dos dois. Esse
 * tipo de divergência leva meses até alguém notar.
 *
 * 🔴 PAUTA VAZIA NÃO GERA E-MAIL. "Você não tem nada hoje", todo dia, é o caminho mais rápido
 * para a pessoa criar uma regra de filtro e nunca mais ver a mensagem. Medido em 25/08/2026:
 * com o resumo ligado na MD, 13 pessoas passam pelas três condições e só 8 têm item na pauta.
 *
 * O agendamento chama uma vez por dia (`0 10 * * *` em UTC = 7h em Natal). Se falhar num dia,
 * o resumo daquele dia passou — repetir tentaria mandar duas vezes, o que é pior.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ItemDaPauta {
  tipo: string;
  selo: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  quando: string | null;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Escapa o que vai para dentro do HTML. Nome de cliente com "&" ou "<" quebraria o e-mail. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function montarItens(itens: ItemDaPauta[]): string {
  return itens
    .map((i) => {
      // Compromisso mostra a HORA no lugar do valor: é o que decide a ordem do dia dele.
      // A hora vem em UTC do banco; o fuso é fixado aqui, senão o das 21h aparece como 00h.
      const direita = i.quando
        ? new Date(i.quando).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })
        : i.valor !== null
        ? BRL.format(Number(i.valor))
        : "";

      return MODELO_ITEM
        .replaceAll("ITEM_SELO", esc(i.selo))
        .replaceAll("ITEM_VALOR", esc(direita))
        .replaceAll("ITEM_TITULO", esc(i.titulo))
        .replaceAll("ITEM_DETALHE", esc(i.detalhe));
    })
    .join("\n");
}

function montarEmail(nome: string, itens: ItemDaPauta[], link: string): string {
  const total = itens.length;
  const valor = itens.reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

  return MODELO_RESUMO
    // Primeiro nome só: "Bom dia, Érika" soa como pessoa; o nome completo soa como cadastro.
    .replaceAll("{{PAUTA_NOME}}", esc(nome.trim().split(/\s+/)[0] ?? ""))
    .replaceAll(
      "{{PAUTA_MANCHETE}}",
      total === 1 ? "1 coisa espera você" : `${total} coisas esperam você`,
    )
    .replaceAll("{{PAUTA_VALOR}}", valor > 0 ? `${BRL.format(valor)} em jogo` : "")
    .replaceAll("{{PAUTA_ITENS}}", montarItens(itens))
    .replaceAll("{{PAUTA_LINK}}", link);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const inicio = Date.now();
  const resultado = { destinatarios: 0, enviados: 0, pauta_vazia: 0, erros: [] as string[] };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Repply <nao-responda@repplyhub.com.br>";
    const linkDaPauta = (Deno.env.get("APP_URL") ?? "https://crm.repplyhub.com.br") + "/hoje";

    // A LISTA VEM ANTES DA CHAVE, de propósito.
    //
    // O resumo nasce DESLIGADO em toda empresa. Conferir a chave primeiro faria esta função
    // registrar um erro todo dia às 7h enquanto ninguém tivesse ligado nada — e registro de
    // erro que acontece todo dia sem consequência é o jeito mais rápido de ensinar a equipe
    // a ignorar registro de erro.
    const { data: destinatarios, error: erroDest } = await supabase.rpc(
      "pauta_resumo_destinatarios",
    );
    if (erroDest) throw erroDest;

    resultado.destinatarios = destinatarios?.length ?? 0;

    if (resultado.destinatarios === 0) {
      // Ninguém para receber hoje: nenhuma empresa ligou o resumo, ou hoje não é um dos dias
      // escolhidos. É o caminho normal, não uma falha.
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "ok",
        detalhes: { ...resultado, motivo: "ninguém para receber hoje" },
      });
      return new Response(JSON.stringify(resultado), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      // Aqui a falha é ALTA e explicada: existe gente esperando o resumo e não há por onde
      // mandar. Sem isto, a ausência da chave viraria "o resumo simplesmente não chega" e
      // alguém procuraria o defeito na pauta.
      const msg = "RESEND_API_KEY não está configurada nos secrets do projeto";
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "erro",
        detalhes: { erro: msg, ...resultado },
      });
      return new Response(JSON.stringify({ erro: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const pessoa of destinatarios ?? []) {
      try {
        const { data: pauta, error: erroPauta } = await supabase.rpc("pauta_do_dia_de", {
          p_usuario_id: pessoa.usuario_id,
        });
        if (erroPauta) throw erroPauta;

        const itens = (pauta ?? []) as ItemDaPauta[];
        if (itens.length === 0) {
          resultado.pauta_vazia++;
          continue;
        }

        const html = montarEmail(pessoa.nome ?? "", itens, linkDaPauta);
        const assunto =
          itens.length === 1 ? "1 coisa espera você hoje" : `${itens.length} coisas esperam você hoje`;

        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: remetente,
            to: [pessoa.email],
            subject: assunto,
            html,
          }),
        });

        if (!resp.ok) {
          // O corpo da resposta traz o motivo (domínio não verificado, teto do plano,
          // endereço recusado). Guardar só o código deixaria o diagnóstico no escuro.
          const corpo = await resp.text();
          throw new Error(`Resend ${resp.status}: ${corpo.slice(0, 300)}`);
        }

        resultado.enviados++;
      } catch (e) {
        // Um destinatário que falha não derruba os outros. É a diferença entre "duas pessoas
        // não receberam" e "ninguém recebeu porque o e-mail de alguém estava recusado".
        resultado.erros.push(
          `${pessoa.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    await supabase.from("automation_logs").insert({
      tipo: "pauta_resumo_diario",
      status: resultado.erros.length > 0 ? "parcial" : "ok",
      detalhes: { ...resultado, duracao_ms: Date.now() - inicio },
    });

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "erro",
        detalhes: { erro: msg, ...resultado },
      });
    } catch {
      // Se nem o registro do erro grava, não há mais o que fazer aqui — a resposta abaixo
      // ainda diz o que houve para quem chamou.
    }
    return new Response(JSON.stringify({ erro: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

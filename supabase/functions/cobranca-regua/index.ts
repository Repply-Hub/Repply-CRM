import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { montarAviso, type Degrau } from "./modelo.ts";

/**
 * A rotina diária da régua de cobrança. Etapa 4 do desenho aprovado em 29/08/2026.
 *
 * Faz três coisas, nesta ordem:
 *   1. marca quem começou a falhar e DESMARCA quem regularizou (`atualizar_inadimplencia`)
 *   2. manda o e-mail do dia, se hoje for um dia de aviso e ele ainda não tiver saído
 *   3. cria o aviso dentro do sistema, para todo mundo da empresa
 *
 * 🔴 O QUE ELA NÃO FAZ: bloquear. O bloqueio é DERIVADO de `inadimplente_desde` pela função
 * `empresa_plano_ativo()`, avaliada a cada comando. Se esta rotina escrevesse o estado,
 * a próxima retentativa de cobrança do Stripe o desfaria — ver o cabeçalho da migration
 * `20260830160000_a_regua_de_cobranca.sql`.
 *
 * 🔴 E ELA NUNCA EXCLUI NADA. No dia 90 a empresa só aparece no painel para a equipe decidir.
 * Decisão do Lucas: o sistema avisa, o humano confirma.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Os dias em que sai e-mail. OITO em noventa dias, nunca dois seguidos.
 *
 * 🔴 O DIA 83 É DE PROPÓSITO: uma semana antes do prazo final, é a última chance de alguém
 * reagir antes de a empresa aparecer para exclusão.
 *
 * A rotina roda TODO DIA, mas só manda nestes. E `assinatura_avisos` tem chave única por
 * (empresa, dia), então rodar duas vezes no mesmo dia não reenvia — sem isso, um cron diário
 * manda o mesmo e-mail 90 vezes, que é o erro clássico deste tipo de rotina.
 */
const DIAS_DE_AVISO = [1, 10, 15, 23, 30, 45, 60, 83];

/**
 * 🔴 ERRO DO SUPABASE NÃO É UM `Error`. É um objeto simples (`{ message, details, hint, code }`),
 * então `e instanceof Error` dá FALSO justamente para os erros que interessam, e o `String(e)`
 * do `else` devolve **"[object Object]"** — escondendo a explicação que o banco mandou junto.
 *
 * Aconteceu na primeira execução desta função, em 30/08/2026: ela quebrou com um erro real
 * (colisão de nome numa função do banco) e o registro em `automation_logs` guardou só
 * "[object Object]". Sem isto, todo erro futuro desta rotina seria igualmente mudo — e ela
 * roda de madrugada, sem ninguém olhando.
 *
 * O `CLAUDE.md` §4.6 documenta a armadilha, e o projeto tem `mensagemDeErro` para o navegador.
 * Aqui é Deno, sem acesso a `src/`, então a mesma regra vive nesta cópia curta.
 */
function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const partes = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (partes.length > 0) return partes.join(" · ");
    try {
      return JSON.stringify(e).slice(0, 400);
    } catch {
      // Objeto com referência circular: cai no String(e) lá embaixo, que ao menos não lança.
    }
  }
  return String(e);
}

const NOME_CANONICO = "RESEND_API_KEY";

/**
 * A chave do Resend, tolerando a CAIXA do nome do segredo.
 *
 * Mesma tolerância de `pauta-resumo-diario`, pelo mesmo motivo medido em 26/08/2026: nome de
 * variável de ambiente diferencia maiúscula de minúscula, e `Deno.env.get` do nome certo
 * devolve `undefined` sem erro quando o que existe é o outro. E o segredo vai em
 * `Project Settings → Edge Functions → Secrets`, NÃO no Vault (que é o cofre do banco).
 */
function lerChaveDoResend(): { valor?: string; nomeUsado?: string } {
  const exato = Deno.env.get(NOME_CANONICO);
  if (exato) return { valor: exato, nomeUsado: NOME_CANONICO };

  const outraCaixa = Object.keys(Deno.env.toObject()).find(
    (n) => n.toUpperCase() === NOME_CANONICO && n !== NOME_CANONICO,
  );
  return outraCaixa
    ? { valor: Deno.env.get(outraCaixa), nomeUsado: outraCaixa }
    : {};
}

interface EmpresaNaRegua {
  empresa_id: string;
  nome: string;
  dias: number;
  degrau: Degrau;
  desde: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const resultado = {
    marcadas: 0,
    regularizadas: 0,
    na_regua: 0,
    avisos_enviados: 0,
    avisos_ja_enviados: 0,
    sem_destinatario: 0,
    prazo_esgotado: 0,
    falhas: [] as string[],
  };

  try {
    // ── 1. Marca e desmarca ────────────────────────────────────────────────────────────
    const { data: mudancas, error: erroMudancas } = await supabase.rpc("atualizar_inadimplencia");
    if (erroMudancas) throw erroMudancas;

    // A RPC devolve `id_da_empresa` (e nao `empresa_id`): o nome de saida colidia com a
    // coluna dentro do CTE e a funcao quebrava ao ser chamada. Aqui so o `acao` interessa.
    for (const m of (mudancas ?? []) as { acao: string }[]) {
      if (m.acao === "comecou") resultado.marcadas++;
      else resultado.regularizadas++;
    }

    // ── 2. Quem está na régua hoje ─────────────────────────────────────────────────────
    const { data: naRegua, error: erroRegua } = await supabase.rpc("empresas_na_regua");
    if (erroRegua) throw erroRegua;

    const empresas = (naRegua ?? []) as EmpresaNaRegua[];
    resultado.na_regua = empresas.length;

    if (empresas.length === 0) {
      await registrar(supabase, "ok", resultado);
      return responder(resultado);
    }

    const { valor: apiKey, nomeUsado } = lerChaveDoResend();
    const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Repply <nao-responda@repplyhub.com.br>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://crm.repplyhub.com.br";

    for (const empresa of empresas) {
      try {
        if (empresa.degrau === "prazo_esgotado") resultado.prazo_esgotado++;

        // Hoje não é dia de aviso: a empresa continua na régua, só não recebe nada.
        if (!DIAS_DE_AVISO.includes(empresa.dias)) continue;

        // 🔴 A CHAVE ÚNICA É A GARANTIA, não este `select`. Ele só evita trabalho à toa; se
        // duas execuções correrem juntas, quem perde a corrida leva erro de chave duplicada
        // e é tratado como "já enviado" no `catch` abaixo.
        const { data: jaEnviado } = await supabase
          .from("assinatura_avisos")
          .select("id")
          .eq("empresa_id", empresa.empresa_id)
          .eq("dia_da_regua", empresa.dias)
          .maybeSingle();

        if (jaEnviado) {
          resultado.avisos_ja_enviados++;
          continue;
        }

        // ── Os gestores da empresa: são eles que respondem pela assinatura ─────────────
        const { data: gestores } = await supabase
          .from("usuarios")
          .select("id, nome, email")
          .eq("empresa_id", empresa.empresa_id)
          .in("role", ["gestor", "empresa", "admin"])
          .is("deleted_at", null);

        const destinatarios = (gestores ?? []).filter(
          (g: { email: string | null }) => g.email && g.email.includes("@"),
        );

        if (destinatarios.length === 0) {
          // 🔴 REGISTRA O AVISO MESMO SEM ENVIAR. Sem isso a rotina tentaria de novo amanhã,
          // e todo dia, para uma empresa que não tem a quem escrever — e o painel nunca
          // mostraria que ninguém foi avisado.
          resultado.sem_destinatario++;
          await supabase.from("assinatura_avisos").insert({
            empresa_id: empresa.empresa_id,
            dia_da_regua: empresa.dias,
            degrau: empresa.degrau,
            destinatarios: 0,
          });
          continue;
        }

        if (!apiKey) throw new Error("RESEND_API_KEY não está configurada nos secrets");

        const { assunto, html } = montarAviso({
          degrau: empresa.degrau,
          dias: empresa.dias,
          nomeDaEmpresa: empresa.nome,
          link: `${appUrl}/configuracoes?tab=pagamentos`,
        });

        let enviados = 0;
        for (const pessoa of destinatarios) {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: remetente, to: [pessoa.email], subject: assunto, html }),
          });
          // Um destinatário recusado não derruba os outros — é a diferença entre "um gestor
          // não recebeu" e "ninguém recebeu porque o e-mail de alguém estava errado".
          if (resp.ok) enviados++;
          else resultado.falhas.push(`${empresa.nome}/${pessoa.email}: ${resp.status}`);
        }

        await supabase.from("assinatura_avisos").insert({
          empresa_id: empresa.empresa_id,
          dia_da_regua: empresa.dias,
          degrau: empresa.degrau,
          destinatarios: enviados,
        });
        resultado.avisos_enviados++;

        // ── 3. O aviso dentro do sistema, para TODA a equipe ───────────────────────────
        // 🔴 Não só os gestores. Quem usa precisa saber por que vai parar de conseguir
        // salvar — descobrir isso pelo erro é o que a etapa 2 veio consertar.
        // A tabela é por usuário (não tem empresa_id), então é uma linha por pessoa.
        const { data: equipe } = await supabase
          .from("usuarios")
          .select("id")
          .eq("empresa_id", empresa.empresa_id)
          .is("deleted_at", null);

        if (equipe?.length) {
          await supabase.from("notificacoes").insert(
            equipe.map((p: { id: string }) => ({
              usuario_id: p.id,
              tipo: "cobranca",
              titulo: assunto,
              mensagem: "Abra Configurações → Pagamentos para resolver.",
            })),
          );
        }
      } catch (e) {
        const msg = mensagem(e);
        // Chave duplicada = outra execução ganhou a corrida. Não é falha.
        if (msg.includes("duplicate key")) resultado.avisos_ja_enviados++;
        else resultado.falhas.push(`${empresa.nome}: ${msg.slice(0, 200)}`);
      }
    }

    if (nomeUsado && nomeUsado !== NOME_CANONICO) {
      resultado.falhas.push(`aviso: segredo lido como "${nomeUsado}", fora do padrão`);
    }

    await registrar(supabase, resultado.falhas.length ? "parcial" : "ok", resultado);
    return responder(resultado);
  } catch (e) {
    const msg = mensagem(e);
    await registrar(supabase, "erro", { ...resultado, erro: msg });
    return new Response(JSON.stringify({ erro: msg, ...resultado }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Deixa rastro em `automation_logs`, como as outras rotinas deste projeto. */
async function registrar(
  supabase: ReturnType<typeof createClient>,
  status: string,
  detalhes: Record<string, unknown>,
) {
  await supabase.from("automation_logs").insert({ tipo: "cobranca_regua", status, detalhes });
}

function responder(resultado: Record<string, unknown>) {
  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

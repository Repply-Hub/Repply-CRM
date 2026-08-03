import { useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Lock,
  LogOut,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { TelaBloqueio } from "@/components/shared/TelaBloqueio";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/Logo";
import { formatarPrecoBRL, rotuloIntervalo } from "@/lib/planos";
import { usePlanos } from "@/hooks/use-planos";
import {
  PAYWALL_ATIVO,
  nomeDaEmpresa,
  planoBloqueado,
  podeGerenciarAssinatura,
} from "@/lib/plano-gate";
import { corpoDoErroDaFunction, erroLegivelDaFunction } from "@/lib/erro-edge-function";
import { toast } from "sonner";


/**
 * Saída para quem não consegue resolver sozinho: funcionário sem gestor
 * disponível, ou um segundo gestor que não é o dono registrado da empresa e
 * portanto não vê o botão de pagar. Sem isto essas pessoas ficam sem caminho.
 */
function ContatoSuporte() {
  return (
    <p>
      Precisa de ajuda?{" "}
      <a
        href="mailto:suporte@repply.com.br"
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        Fale com o suporte
      </a>
    </p>
  );
}

export default function Assinar() {
  const { profile, session, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const status = params.get("status");
  const [verificando, setVerificando] = useState(false);
  const [processando, setProcessando] = useState<"checkout" | "portal" | null>(null);
  const { planos } = usePlanos();
  const plano = planos[0];

  // Para onde voltar depois de reativar: o gate guarda no state a página que o
  // usuário tentava abrir. Só aceita caminho interno — um valor vindo do
  // histórico não pode virar redirecionamento para fora do site.
  const de = (location.state as { de?: string } | null)?.de;
  const destino = de && de.startsWith("/") && !de.startsWith("//") ? de : "/app";

  const sair = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Erro ao sair:", err);
    } finally {
      window.location.replace("/");
    }
  };

  /** Chama a Edge Function e manda o usuário para o checkout hospedado. */
  const assinar = async () => {
    setProcessando("checkout");
    try {
      const { data: { session: sessaoAtual } } = await supabase.auth.getSession();
      if (!sessaoAtual) {
        toast.error("Sua sessão expirou. Entre novamente.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { plano: plano.slug },
        headers: { Authorization: `Bearer ${sessaoAtual.access_token}` },
      });

      // Quando a função responde com status de erro, a biblioteca devolve `data`
      // nulo e joga tudo em `error` — então os códigos de diagnóstico precisam
      // ser lidos do corpo do erro, e não de `data`.
      if (error) {
        const corpo = await corpoDoErroDaFunction(error);
        if (corpo?.code === "ja_ativa") {
          toast.info("Esta empresa já tem assinatura ativa.");
          await verificarAgora();
          return;
        }
        if (corpo?.code === "sem_price_id") {
          toast.error("O plano ainda não está configurado para cobrança. Fale com o suporte.");
          return;
        }
        throw await erroLegivelDaFunction(error, "Não foi possível abrir o pagamento.");
      }
      if (!data?.url) throw new Error("Resposta inesperada do servidor.");

      window.location.href = data.url;
    } catch (err) {
      console.error("[assinar] checkout:", err);
      toast.error(
        err instanceof Error ? err.message : "Não foi possível abrir o pagamento.",
      );
    } finally {
      setProcessando(null);
    }
  };

  /** Portal do Stripe: trocar cartão, ver faturas, cancelar. */
  const gerenciarAssinatura = async () => {
    setProcessando("portal");
    try {
      const { data: { session: sessaoAtual } } = await supabase.auth.getSession();
      if (!sessaoAtual) {
        toast.error("Sua sessão expirou. Entre novamente.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        headers: { Authorization: `Bearer ${sessaoAtual.access_token}` },
      });

      if (error) {
        const corpo = await corpoDoErroDaFunction(error);
        // Sem cliente no provedor não há o que gerenciar — o caminho é assinar.
        if (corpo?.code === "sem_customer") {
          toast.info("Ainda não há assinatura para gerenciar. Assine o plano primeiro.");
          return;
        }
        throw await erroLegivelDaFunction(error, "Não foi possível abrir a gestão da assinatura.");
      }
      if (!data?.url) throw new Error("Resposta inesperada do servidor.");

      window.location.href = data.url;
    } catch (err) {
      console.error("[assinar] portal:", err);
      toast.error(
        err instanceof Error ? err.message : "Não foi possível abrir a gestão da assinatura.",
      );
    } finally {
      setProcessando(null);
    }
  };

  // Rebusca o perfil para ver se a assinatura já foi ativada. Sem isto o usuário
  // ficaria preso no paywall mesmo depois de pagar, porque o perfil em memória
  // nunca é atualizado durante a vida da página.
  //
  // O recarregamento total é intencional: o AuthQuerySync só invalida o cache do
  // react-query quando a sessão muda, não quando o perfil muda. Uma navegação
  // comum levaria o usuário para dentro do app carregando o cache montado
  // enquanto ele estava bloqueado.
  const verificarAgora = async () => {
    setVerificando(true);
    try {
      const atualizado = await refreshProfile();
      if (atualizado && !planoBloqueado(atualizado)) {
        toast.success("Assinatura ativa! Redirecionando...");
        window.location.replace(destino);
        return;
      }
      toast.info("A assinatura ainda consta como inativa.");
    } catch {
      // refreshProfile preserva o perfil atual em falha, então aqui é só avisar
      // em vez de deixar o usuário achando que a verificação deu negativo.
      toast.error("Não foi possível verificar agora. Tente de novo em instantes.");
    } finally {
      setVerificando(false);
    }
  };

  const nomeEmpresa = nomeDaEmpresa(profile);

  // Quem já está em dia não tem o que fazer aqui, e veria um "assinatura
  // pendente" que não corresponde à situação dele. Sem risco de loop: /app só
  // manda para cá quando o plano está de fato bloqueado.
  //
  // Condicionado ao paywall estar ligado porque a coluna plan_status ainda não
  // existe: sem essa guarda, `planoBloqueado` seria falso para todo mundo e a
  // tela ficaria inalcançável — inclusive para revisá-la.
  if (PAYWALL_ATIVO && !planoBloqueado(profile)) return <Navigate to={destino} replace />;

  // Funcionário não paga: a assinatura é da empresa. Mostrar preço e botão de
  // pagamento para ele seria pedir que resolvesse algo que não está nas mãos dele.
  if (!podeGerenciarAssinatura(profile, session)) {
    return (
      <TelaBloqueio
        titulo="Assinatura inativa"
        descricao={
          <>
            A assinatura de <strong className="text-foreground">{nomeEmpresa}</strong> está inativa, então
            o acesso ao sistema ficou suspenso. Peça ao gestor responsável para reativar — você não paga
            nada.
          </>
        }
        icone={Lock}
        rodape={<ContatoSuporte />}
      >
        <Button onClick={verificarAgora} className="w-full" disabled={verificando}>
          <RefreshCw className={verificando ? "animate-spin" : undefined} />
          {verificando ? "Verificando..." : "Já reativaram, verificar"}
        </Button>
        <Button onClick={sair} variant="outline" className="w-full">
          <LogOut />
          Sair
        </Button>
      </TelaBloqueio>
    );
  }

  return (
    // h-screen e não min-h-screen: com min-height a div cresce junto com o
    // conteúdo, o overflow-y-auto dela nunca tem o que rolar e quem corta é o
    // #root (que é overflow:hidden). Em tela de celular isso deixava os botões
    // do rodapé — inclusive o "Sair" — fora de alcance, prendendo justamente o
    // usuário que está bloqueado.
    <div className="h-screen overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-6 py-12">
        {/* Sem link: para quem está bloqueado, "/" só devolveria a esta mesma
            tela depois de dois redirecionamentos. */}
        <Logo className="mb-8 h-16 w-16" />

        {status === "success" && (
          <Banner tom="sucesso" icone={CheckCircle2}>
            <strong className="font-semibold">Pagamento confirmado.</strong> A liberação acontece em alguns
            segundos.
          </Banner>
        )}
        {status === "cancelled" && (
          <Banner tom="neutro" icone={AlertCircle}>
            Pagamento cancelado — nenhum valor foi cobrado.
          </Banner>
        )}
        {/* Só quando não há retorno de pagamento: com ?status=cancelled este
            banner empilhava embaixo do de cancelamento, dizendo duas coisas
            sobre o mesmo evento. */}
        {!status && (
          <Banner tom="alerta" icone={Lock}>
            <strong className="font-semibold">Assinatura pendente.</strong> Ative o plano para liberar o
            acesso da {nomeEmpresa} ao sistema.
          </Banner>
        )}

        <div className="w-full rounded-2xl border border-primary/30 bg-card p-8 text-center shadow-card">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.06em] text-primary-foreground">
            {plano.selo}
          </span>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-card-foreground">
            {plano.nome}
          </h1>

          <p className="mt-4 flex items-baseline justify-center gap-1.5">
            <span className="font-display text-5xl font-bold tabular-nums text-card-foreground">
              {formatarPrecoBRL(plano.preco)}
            </span>
            <span className="text-sm text-muted-foreground">{rotuloIntervalo(plano.intervalo)}</span>
          </p>

          <ul className="mt-7 space-y-3 text-left">
            {plano.beneficios.map((b) => (
              <li key={b} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                <span className="text-sm text-card-foreground">{b}</span>
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            onClick={assinar}
            disabled={processando !== null}
            className="mt-8 h-12 w-full rounded-full text-base font-semibold shadow-brand"
          >
            {processando === "checkout" ? "Abrindo pagamento..." : "Assinar agora"}
            {processando !== "checkout" && <ArrowRight />}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Pagamento no cartão, processado pelo Stripe. Cancele quando quiser.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={verificarAgora} variant="ghost" size="sm" disabled={verificando}>
            <RefreshCw className={verificando ? "animate-spin" : undefined} />
            {verificando ? "Verificando..." : "Já paguei, verificar"}
          </Button>
          <Button
            onClick={gerenciarAssinatura}
            variant="ghost"
            size="sm"
            disabled={processando !== null}
            className="text-muted-foreground"
          >
            <Settings />
            {processando === "portal" ? "Abrindo..." : "Gerenciar assinatura"}
          </Button>
          {/* Sob esta rota a barra lateral não é renderizada: sem uma saída
              própria, um usuário bloqueado ficaria preso na tela. */}
          <Button onClick={sair} variant="ghost" size="sm" className="text-muted-foreground">
            <LogOut />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

function Banner({
  tom,
  icone: Icone,
  children,
}: {
  tom: "sucesso" | "alerta" | "neutro";
  icone: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const tons = {
    sucesso: "border-success/30 bg-success/10 text-success",
    alerta: "border-primary/30 bg-primary/10 text-foreground",
    neutro: "border-border bg-muted text-muted-foreground",
  };
  return (
    <div className={`mb-6 flex w-full items-start gap-3 rounded-xl border p-4 text-sm ${tons[tom]}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

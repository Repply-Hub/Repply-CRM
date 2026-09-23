import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { traduzirErroAuth } from "@/lib/erros-auth";
import {
  erroDoEndereco,
  estadoDaRedefinicao,
  explicacaoDoErroDoLink,
} from "@/lib/link-de-recuperacao";

/**
 * 🔴 ESTA TELA NÃO DESENHA O FORMULÁRIO PARA QUALQUER UM — e isso é o conserto, não zelo.
 *
 * O link do e-mail vale no máximo uma hora, e antivírus de e-mail corporativo abre o endereço
 * sozinho para checar segurança, queimando o link antes de a pessoa clicar. Quando o link falha,
 * a biblioteca do Supabase PRESERVA a sessão que já existia no navegador ("Don't remove existing
 * session on URL login failure", em GoTrueClient). Num computador compartilhado do escritório
 * isso fazia o `updateUser` trocar a senha do COLEGA que estava logado, e a tela anunciava
 * sucesso. Ver `src/lib/link-de-recuperacao.ts` para a mecânica inteira.
 *
 * Por isso: erro no endereço manda em tudo, e sem sinal de que a pessoa veio do link o
 * formulário não aparece.
 */

/**
 * A marca fica na ABA, não no navegador: o colega logado noutra aba não a tem. Ela existe porque
 * a biblioteca limpa o endereço assim que o link dá certo — numa recarga não sobraria sinal
 * nenhum, e quem veio pelo link legítimo seria mandado embora.
 */
const MARCA_DA_ABA = "repply:veio-do-link-de-recuperacao";

function lerMarcaDaAba(): boolean {
  try {
    return sessionStorage.getItem(MARCA_DA_ABA) === "1";
  } catch {
    // Janela anônima ou armazenamento bloqueado: seguimos sem a marca.
    return false;
  }
}

function escreverMarcaDaAba(valor: boolean) {
  try {
    if (valor) sessionStorage.setItem(MARCA_DA_ABA, "1");
    else sessionStorage.removeItem(MARCA_DA_ABA);
  } catch {
    /* idem */
  }
}

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Lido na montagem, antes de qualquer navegação nossa mexer no endereço.
  const [erro] = useState(() => erroDoEndereco(window.location.href));
  const [veioDoLink, setVeioDoLink] = useState(lerMarcaDaAba);
  const [apuracaoTerminou, setApuracaoTerminou] = useState(false);
  /** O servidor recusou a troca: a pessoa precisa de saída sem digitar endereço na mão. */
  const [recusado, setRecusado] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") {
        escreverMarcaDaAba(true);
        setVeioDoLink(true);
      }
      // Qualquer evento significa que o cliente terminou de processar o endereço. O aviso de
      // recuperação sai numa tarefa que a biblioteca enfileira ANTES desta, então adiar um passo
      // garante que ele chegue primeiro — sem isso a tela pisca "sem link" para quem veio do link.
      setTimeout(() => setApuracaoTerminou(true), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const estado = estadoDaRedefinicao({ erro, veioDoLink, apuracaoTerminou });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirmPassword = form.get("confirm_password") as string;

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      // A frase do servidor traduzida, nunca "o link pode ter expirado" para tudo: com a
      // proteção contra senha vazada ligada, culpar o link faz a pessoa pedir link novo para
      // sempre sem descobrir que o problema é a senha.
      toast.error(traduzirErroAuth(error.message));
      setRecusado(true);
    } else {
      escreverMarcaDaAba(false);
      toast.success("Senha redefinida com sucesso!");
      navigate("/app");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-20 w-20" />
        </div>

        {estado === "apurando" && (
          <p className="text-sm text-muted-foreground text-center">Verificando o link…</p>
        )}

        {estado === "link-invalido" && (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-1">Link indisponível</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {explicacaoDoErroDoLink(erro!)}
            </p>
            <Button asChild className="w-full h-11 font-semibold shadow-brand">
              <Link to="/esqueci-senha">Pedir um link novo</Link>
            </Button>
          </>
        )}

        {estado === "sem-link" && (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-1">Redefinir senha</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Abra o link que enviamos por e-mail para escolher uma nova senha. Ele vale por 1 hora.
            </p>
            <Button asChild className="w-full h-11 font-semibold shadow-brand">
              <Link to="/esqueci-senha">Pedir um link novo</Link>
            </Button>
          </>
        )}

        {estado === "pronto" && (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-1">Redefinir senha</h2>
            <p className="text-sm text-muted-foreground mb-6">Escolha uma nova senha para sua conta.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nova senha</Label>
                <div className="relative">
                  <Input
                    name="password"
                    type={showPw ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Confirmar nova senha</Label>
                <div className="relative">
                  <Input
                    name="confirm_password"
                    type={showConfirmPw ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Repita a senha"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </Button>
            </form>
          </>
        )}

        {estado === "pronto" && recusado && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link to="/esqueci-senha" className="text-primary hover:underline">
              Pedir um link novo
            </Link>
          </p>
        )}

        {estado !== "apurando" && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            <Link to="/login" className="text-primary hover:underline">
              Voltar ao login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

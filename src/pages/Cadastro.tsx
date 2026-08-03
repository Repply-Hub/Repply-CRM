import { useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { traduzirErroAuth } from "@/lib/erros-auth";
import { formatarPrecoBRL } from "@/lib/planos";
import { usePlanos } from "@/hooks/use-planos";
import { toast } from "sonner";

type Caminho = "empresa" | "funcionario" | null;

/** Resultado da RPC validar_codigo_empresa: objeto da empresa, ou null. */
type EmpresaDoCodigo = { id: string; nome: string | null } | null;

export default function Cadastro() {
  const [params] = useSearchParams();
  const tipoInicial = params.get("tipo");
  const [caminho, setCaminho] = useState<Caminho>(
    tipoInicial === "empresa" || tipoInicial === "funcionario" ? tipoInicial : null,
  );

  return (
    <AuthShell
      titulo={caminho === null ? "Criar conta" : caminho === "empresa" ? "Nova empresa" : "Entrar na empresa"}
      subtitulo={
        caminho === null
          ? "Escolha como você vai usar o Repply"
          : caminho === "empresa"
            ? "Você será o gestor e responsável pela assinatura"
            : "Use o código que o gestor da sua empresa passou"
      }
    >
      {caminho === null && <EscolhaCaminho onEscolher={setCaminho} />}
      {caminho === "empresa" && <FormEmpresa onVoltar={() => setCaminho(null)} />}
      {caminho === "funcionario" && <FormFuncionario onVoltar={() => setCaminho(null)} />}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}

/**
 * Os dois cards são deliberadamente assimétricos: um cobra e o outro não, e isso
 * precisa ficar claro antes do clique, não depois do formulário preenchido.
 */
function EscolhaCaminho({ onEscolher }: { onEscolher: (c: Caminho) => void }) {
  const { planos } = usePlanos();
  const plano = planos[0];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onEscolher("empresa")}
        className="w-full rounded-lg border-2 border-primary/40 bg-primary/5 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Building2 className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">Cadastrar minha empresa</p>
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                Assinatura
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Você vira o gestor, convida o time e assina o plano de{" "}
              {formatarPrecoBRL(plano.precoMensal)}/mês.
            </p>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onEscolher("funcionario")}
        className="w-full rounded-lg border-2 border-border p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">Entrar com código da empresa</p>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                Grátis
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua empresa já usa o Repply e o gestor te passou um código. Você não paga nada.
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}

/** Estado final do cadastro: diz o que aconteceu e qual é o passo seguinte. */
function ConfirmacaoCadastro({ email, proximoPasso }: { email: string; proximoPasso: string }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
        <MailCheck className="h-7 w-7 text-success" strokeWidth={1.75} />
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-lg font-bold text-foreground">Conta criada</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enviamos um link de confirmação para{" "}
          <strong className="text-foreground">{email}</strong>. {proximoPasso}
        </p>
      </div>
      <Button asChild className="h-11 w-full font-semibold">
        <Link to="/login">Ir para o login</Link>
      </Button>
      <p className="text-xs text-muted-foreground">
        Não recebeu? Confira a caixa de spam antes de tentar de novo.
      </p>
    </div>
  );
}

function BotaoVoltar({ onVoltar }: { onVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={onVoltar}
      className="mb-1 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3 w-3" />
      Voltar
    </button>
  );
}

/**
 * Campo de texto com rótulo associado por id. O `Label` do shadcn não recebe
 * `htmlFor` sozinho, então sem isto clicar no rótulo não foca o campo e o leitor
 * de tela anuncia um campo sem nome.
 */
function Campo({
  rotulo,
  name,
  ajuda,
  ...props
}: React.ComponentProps<typeof Input> & { rotulo: React.ReactNode; name: string; ajuda?: string }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </Label>
      <Input id={id} name={name} className="h-11" aria-describedby={ajuda ? `${id}-ajuda` : undefined} {...props} />
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
    </div>
  );
}

function CampoSenha({ mostrar, onAlternar }: { mostrar: boolean; onAlternar: () => void }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        Senha
      </Label>
      <div className="relative">
        <Input
          id={id}
          name="password"
          type={mostrar ? "text" : "password"}
          required
          minLength={6}
          // new-password evita que o navegador ofereça uma senha já salva num
          // formulário que está criando conta.
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
          className="h-11 pr-10"
        />
        <button
          type="button"
          onClick={onAlternar}
          aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function FormEmpresa({ onVoltar }: { onVoltar: () => void }) {
  const { signUpEmpresa } = useAuth();
  const { planos } = usePlanos();
  const plano = planos[0];
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const form = new FormData(e.currentTarget);
      const email = form.get("email") as string;
      const { error } = await signUpEmpresa(
        email,
        form.get("password") as string,
        form.get("nome") as string,
        form.get("nome_empresa") as string,
        form.get("cnpj") as string,
      );
      if (error) toast.error(traduzirErroAuth(error.message));
      else setEmailEnviado(email);
    } catch (err) {
      toast.error(
        traduzirErroAuth(err instanceof Error ? err.message : "Erro inesperado. Tente novamente."),
      );
    } finally {
      setLoading(false);
    }
  };

  // Um toast que some em segundos não bastava: o formulário continuava
  // preenchido e habilitado, então reenviar parecia o caminho natural — e o
  // segundo envio devolve "este email já está cadastrado", que lê como falha.
  if (emailEnviado) {
    return (
      <ConfirmacaoCadastro
        email={emailEnviado}
        proximoPasso="Depois de confirmar, entre na sua conta para ativar a assinatura da empresa."
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <BotaoVoltar onVoltar={onVoltar} />

      <Campo
        rotulo="Nome da empresa"
        name="nome_empresa"
        required
        autoComplete="organization"
        placeholder="Ex: Construtora Meridiano"
      />
      <Campo
        rotulo={
          <>
            CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
          </>
        }
        name="cnpj"
        inputMode="numeric"
        placeholder="00.000.000/0001-00"
      />
      <Campo rotulo="Seu nome" name="nome" required autoComplete="name" placeholder="Nome do responsável" />
      <Campo
        rotulo="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="seu@email.com"
      />
      <CampoSenha mostrar={mostrarSenha} onAlternar={() => setMostrarSenha(!mostrarSenha)} />

      <Button type="submit" className="h-11 w-full font-semibold shadow-brand" disabled={loading}>
        {loading ? "Cadastrando..." : "Criar conta da empresa"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Plano de {formatarPrecoBRL(plano.precoMensal)}/mês com usuários ilimitados. Cancele quando quiser.
      </p>
    </form>
  );
}

function FormFuncionario({ onVoltar }: { onVoltar: () => void }) {
  const { signUpFuncionario } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // O resultado guarda junto o código que o produziu. Sem esse par, uma consulta
  // lenta que voltasse depois de o usuário corrigir o campo exibiria o nome da
  // empresa antiga ao lado do código novo — e o cadastro seguiria com um código
  // que nunca foi validado.
  const [validado, setValidado] = useState<{ codigo: string; empresa: EmpresaDoCodigo } | null>(null);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  // Descarta respostas fora de ordem: só a consulta mais recente pode escrever.
  const consultaRef = useRef(0);
  const idCodigo = useId();
  const [confirmado, setConfirmado] = useState<{ email: string; empresa: string | null } | null>(null);

  /**
   * Consulta a empresa pelo código. Diferente do que a tela antiga fazia, o erro
   * da RPC não é descartado: sem isso, uma falha de rede aparecia para o usuário
   * como "código inválido" e ele ficava tentando corrigir um código correto.
   */
  const verificarCodigo = async (codigoBruto: string): Promise<EmpresaDoCodigo | "erro"> => {
    const codigo = codigoBruto.trim().toUpperCase();
    const minhaConsulta = ++consultaRef.current;
    const aindaAtual = () => consultaRef.current === minhaConsulta;

    setVerificando(true);
    setErroCodigo(null);
    setValidado(null);
    try {
      const { data, error } = await supabase.rpc("validar_codigo_empresa", { p_codigo: codigo });
      if (!aindaAtual()) return "erro";

      if (error) {
        setErroCodigo("Não foi possível verificar o código agora. Tente de novo em instantes.");
        return "erro";
      }
      const achada = (data as unknown as EmpresaDoCodigo) ?? null;
      if (!achada) {
        setErroCodigo("Código não encontrado. Confira com o gestor da sua empresa.");
        return null;
      }
      setValidado({ codigo, empresa: achada });
      return achada;
    } catch {
      if (aindaAtual()) {
        setErroCodigo("Não foi possível verificar o código agora. Tente de novo em instantes.");
      }
      return "erro";
    } finally {
      if (aindaAtual()) setVerificando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const form = new FormData(e.currentTarget);
      const codigo = (form.get("codigo_empresa") as string).trim().toUpperCase();

      // Só reaproveita a validação anterior se ela foi feita para ESTE código.
      // Caso contrário revalida — inclusive quando o envio vem de um Enter no
      // campo, que não passa pelo blur.
      const resultado =
        validado?.codigo === codigo ? validado.empresa : await verificarCodigo(codigo);

      if (resultado === "erro" || !resultado) {
        // Sem este aviso o botão parecia morto: a mensagem fica ao lado do campo,
        // que no celular está fora da tela na hora do envio.
        toast.error(
          erroCodigo ?? "Confira o código da empresa antes de continuar.",
        );
        return;
      }

      const { error } = await signUpFuncionario(
        form.get("email") as string,
        form.get("password") as string,
        form.get("nome") as string,
        codigo,
      );
      if (error) toast.error(traduzirErroAuth(error.message));
      else setConfirmado({ email: form.get("email") as string, empresa: resultado.nome });
    } catch (err) {
      toast.error(
        traduzirErroAuth(err instanceof Error ? err.message : "Erro inesperado. Tente novamente."),
      );
    } finally {
      setLoading(false);
    }
  };

  if (confirmado) {
    return (
      <ConfirmacaoCadastro
        email={confirmado.email}
        proximoPasso={`Depois de confirmar, entre na sua conta para começar a usar o Repply${
          confirmado.empresa ? ` na ${confirmado.empresa}` : ""
        }.`}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <BotaoVoltar onVoltar={onVoltar} />

      <div className="space-y-2">
        <Label htmlFor={idCodigo} className="text-sm font-medium">
          Código da empresa
        </Label>
        <div className="relative">
          <Input
            id={idCodigo}
            name="codigo_empresa"
            required
            autoComplete="off"
            autoCapitalize="characters"
            aria-describedby={`${idCodigo}-ajuda`}
            aria-invalid={erroCodigo ? true : undefined}
            placeholder="Ex: AB12CD34"
            className="h-11 pr-10 uppercase"
            style={{ textTransform: "uppercase" }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) void verificarCodigo(v);
            }}
            onChange={() => {
              // Invalida sem condição: qualquer digitação torna o resultado
              // anterior obsoleto, e a versão condicional deixava passar o caso
              // em que a consulta ainda estava em voo.
              consultaRef.current += 1;
              setValidado(null);
              setErroCodigo(null);
              setVerificando(false);
            }}
          />
          {verificando && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {!verificando && validado && (
            <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" strokeWidth={3} />
          )}
        </div>
        {validado ? (
          <p id={`${idCodigo}-ajuda`} className="text-xs font-medium text-success">
            Você vai entrar em: {validado.empresa?.nome ?? "empresa encontrada"}
          </p>
        ) : erroCodigo ? (
          <p id={`${idCodigo}-ajuda`} className="text-xs text-destructive" role="alert">
            {erroCodigo}
          </p>
        ) : (
          <p id={`${idCodigo}-ajuda`} className="text-xs text-muted-foreground">
            Solicite este código ao gestor da sua empresa
          </p>
        )}
      </div>

      <Campo rotulo="Seu nome" name="nome" required autoComplete="name" placeholder="Seu nome completo" />
      <Campo
        rotulo="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="seu@email.com"
      />
      <CampoSenha mostrar={mostrarSenha} onAlternar={() => setMostrarSenha(!mostrarSenha)} />

      <Button type="submit" className="h-11 w-full font-semibold shadow-brand" disabled={loading}>
        {loading ? "Cadastrando..." : "Entrar na empresa"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Entrar pelo código é gratuito — a assinatura é da empresa.
      </p>
    </form>
  );
}

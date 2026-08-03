import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { traduzirErroAuth } from "@/lib/erros-auth";
import { toast } from "sonner";

export default function Login() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const idEmail = useId();
  const idSenha = useId();

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const form = new FormData(e.currentTarget);
      const { error } = await signIn(
        form.get("email") as string,
        form.get("password") as string,
      );
      if (error) toast.error(traduzirErroAuth(error.message));
      // Em caso de sucesso quem redireciona é o AuthRoute, ao ver a sessão.
    } catch (err) {
      toast.error(
        traduzirErroAuth(err instanceof Error ? err.message : "Erro inesperado. Tente novamente."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell titulo="Bem-vindo de volta" subtitulo="Entre na sua conta para continuar">
      <form onSubmit={handleSignIn} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={idEmail} className="text-sm font-medium">
            Email
          </Label>
          <Input
            id={idEmail}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={idSenha} className="text-sm font-medium">
            Senha
          </Label>
          <div className="relative">
            <Input
              id={idSenha}
              name="password"
              type={mostrarSenha ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(!mostrarSenha)}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link to="/esqueci-senha" className="text-xs text-primary hover:underline">
            Esqueceu sua senha?
          </Link>
        </div>

        <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}

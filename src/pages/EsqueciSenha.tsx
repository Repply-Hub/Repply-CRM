import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function EsqueciSenha() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    if (error) {
      toast.error("Erro ao enviar email de redefinição. Tente novamente.");
    } else {
      setSent(true);
      toast.success("Email enviado! Verifique sua caixa de entrada.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-20 w-20" />
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-foreground font-bold text-lg">Email enviado!</h2>
            <p className="text-sm text-muted-foreground">
              Se o email informado estiver cadastrado, você receberá um link para redefinir sua senha.
              Verifique também a pasta de spam.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full h-11 mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-1">Esqueceu sua senha?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Informe seu email e enviaremos um link para redefinir sua senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <Input name="email" type="email" required placeholder="seu@email.com" className="h-11" />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
                {loading ? "Enviando..." : "Enviar link de redefinição"}
              </Button>
            </form>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

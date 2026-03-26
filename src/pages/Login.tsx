import { useState } from "react";
import { Eye, EyeOff, Building2, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoSidebar from "@/assets/logo-sidebar.svg";
import logoLogin from "@/assets/logo-login.svg";

type RegisterType = "empresa" | "funcionario" | null;

export default function Login() {
  const { signIn, signUpEmpresa, signUpFuncionario } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegisterPw, setShowRegisterPw] = useState(false);
  const [registerType, setRegisterType] = useState<RegisterType>(null);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignUpEmpresa = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signUpEmpresa(
      form.get("email") as string,
      form.get("password") as string,
      form.get("nome") as string,
      form.get("nome_empresa") as string,
      form.get("cnpj") as string,
    );
    if (error) toast.error(error.message);
    else toast.success("Empresa cadastrada! Verifique seu email para confirmar.");
    setLoading(false);
  };

  const handleSignUpFuncionario = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const codigoEmpresa = (form.get("codigo_empresa") as string).toUpperCase();

    // Valida o código da empresa antes de criar o usuário
    const { data: empresa } = await supabase
      .from("empresas" as any)
      .select("id, nome")
      .eq("codigo_acesso", codigoEmpresa)
      .maybeSingle();

    if (!empresa) {
      toast.error("Código de empresa inválido. Solicite o código ao seu gestor.");
      setLoading(false);
      return;
    }

    const { error } = await signUpFuncionario(
      form.get("email") as string,
      form.get("password") as string,
      form.get("nome") as string,
      codigoEmpresa,
    );
    if (error) toast.error(error.message);
    else toast.success(`Cadastro realizado na empresa "${(empresa as any).nome}"! Verifique seu email para confirmar.`);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side — brand panel */}
      <div className="hidden lg:flex lg:w-[45%] gradient-brand relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-white/[0.06]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-white/[0.04]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full bg-white/[0.03]" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <img src={logoLogin} alt="MD Representações" className="h-40 w-40 object-contain" />
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
              Gestão comercial
              <br />
              <span className="text-white/80">inteligente e ágil</span>
            </h1>
            <p className="text-base text-white/70 max-w-sm leading-relaxed">
              Pipeline de vendas, controle de orçamentos e dashboards — tudo em um só lugar para sua representação
              comercial.
            </p>

            <div className="flex gap-8 pt-4">
              <div>
                <p className="text-2xl font-bold">100%</p>
                <p className="text-xs text-white/60">Digital</p>
              </div>
              <div>
                <p className="text-2xl font-bold">5x</p>
                <p className="text-xs text-white/60">Mais rápido</p>
              </div>
              <div>
                <p className="text-2xl font-bold">360°</p>
                <p className="text-xs text-white/60">Visão completa</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/40">© {new Date().getFullYear()} MD Representações</p>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <img src={logoLogin} alt="MD Representações" className="h-40 w-40 object-contain mt-6 -mb-6" />
            <p className="text-sm text-muted-foreground relative z-10">Gestão comercial inteligente e ágil</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground mt-1">Entre na sua conta para continuar</p>
          </div>

          <Tabs defaultValue="login" onValueChange={() => setRegisterType(null)}>
            <TabsList className="w-full mb-6">
              <TabsTrigger value="login" className="flex-1">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1">
                Cadastrar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input name="email" type="email" required placeholder="seu@email.com" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Senha</Label>
                  <div className="relative">
                    <Input
                      name="password"
                      type={showLoginPw ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPw(!showLoginPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              {/* Seleção do tipo de cadastro */}
              {!registerType && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center mb-4">Como deseja se cadastrar?</p>
                  <button
                    type="button"
                    onClick={() => setRegisterType("empresa")}
                    className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Cadastrar empresa</p>
                      <p className="text-xs text-muted-foreground">Registre sua empresa e gerencie sua equipe</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegisterType("funcionario")}
                    className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserRound className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Entrar como funcionário</p>
                      <p className="text-xs text-muted-foreground">Use o código fornecido pelo seu gestor</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Formulário de cadastro de empresa */}
              {registerType === "empresa" && (
                <form onSubmit={handleSignUpEmpresa} className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setRegisterType(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                  >
                    ← Voltar
                  </button>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Nome da empresa</Label>
                    <Input name="nome_empresa" required placeholder="Ex: MD Representações" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">CNPJ <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <Input name="cnpj" placeholder="00.000.000/0001-00" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Seu nome</Label>
                    <Input name="nome" required placeholder="Nome do responsável" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Email</Label>
                    <Input name="email" type="email" required placeholder="seu@email.com" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Senha</Label>
                    <div className="relative">
                      <Input
                        name="password"
                        type={showRegisterPw ? "text" : "password"}
                        required
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPw(!showRegisterPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showRegisterPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
                    {loading ? "Cadastrando..." : "Cadastrar empresa"}
                  </Button>
                </form>
              )}

              {/* Formulário de cadastro de funcionário */}
              {registerType === "funcionario" && (
                <form onSubmit={handleSignUpFuncionario} className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setRegisterType(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                  >
                    ← Voltar
                  </button>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Código da empresa</Label>
                    <Input
                      name="codigo_empresa"
                      required
                      placeholder="Ex: AB12CD34"
                      className="h-11 uppercase"
                      style={{ textTransform: "uppercase" }}
                    />
                    <p className="text-xs text-muted-foreground">Solicite este código ao seu gestor</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Seu nome</Label>
                    <Input name="nome" required placeholder="Seu nome completo" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Email</Label>
                    <Input name="email" type="email" required placeholder="seu@email.com" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Senha</Label>
                    <div className="relative">
                      <Input
                        name="password"
                        type={showRegisterPw ? "text" : "password"}
                        required
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPw(!showRegisterPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showRegisterPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold shadow-brand" disabled={loading}>
                    {loading ? "Cadastrando..." : "Entrar na empresa"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

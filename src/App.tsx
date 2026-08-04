import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { TelaBloqueio } from "@/components/shared/TelaBloqueio";
import { Button } from "@/components/ui/button";
import { PAYWALL_ATIVO, planoBloqueado } from "@/lib/plano-gate";

const Negocios = lazy(() => import("./pages/Negocios"));
const Clientes = lazy(() => import("./pages/Clientes"));
const ClienteDetalhe = lazy(() => import("./pages/ClienteDetalhe"));
const ContatoDetalhe = lazy(() => import("./pages/ContatoDetalhe"));
const NovoPedido = lazy(() => import("./pages/NovoPedido"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Obras = lazy(() => import("./pages/Obras"));
const Fabricantes = lazy(() => import("./pages/Fabricantes"));
const Portal = lazy(() => import("./pages/Portal"));
const EditarPedido = lazy(() => import("./pages/EditarPedido"));
const Calendario = lazy(() => import("./pages/Calendario"));
const Tarefas = lazy(() => import("./pages/Tarefas"));
const Chat = lazy(() => import("./pages/Chat"));
const Emails = lazy(() => import("./pages/Emails"));
const WhatsAppInbox = lazy(() => import("./pages/WhatsAppInbox"));
const LinhasIgnoradas = lazy(() => import("./pages/LinhasIgnoradas"));
const AdminWhatsAppInstancias = lazy(
  () => import("./pages/AdminWhatsAppInstancias"),
);
const HistoricoAlteracoes = lazy(() => import("./pages/HistoricoAlteracoes"));
const AdminEmpresas = lazy(() => import("./pages/AdminEmpresas"));

const Landing = lazy(() => import("./pages/Landing"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Assinar = lazy(() => import("./pages/Assinar"));
const Login = lazy(() => import("./pages/Login"));
const EsqueciSenha = lazy(() => import("./pages/EsqueciSenha"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60_000,
    },
  },
});

function ProtectedRoute({
  children,
  requerPlano = true,
}: {
  children: React.ReactNode;
  /**
   * false = rota autenticada, porém fora do gate de plano. Só /assinar usa:
   * gatear a própria tela de assinatura criaria um loop de redirecionamento.
   * O padrão é true para que qualquer rota nova nasça protegida por omissão.
   */
  requerPlano?: boolean;
}) {
  const { session, profile, loading, profileLoaded, profileAttempted } =
    useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    // O finally é obrigatório: se o signOut rejeitar (rede caindo, por exemplo),
    // sem ele a navegação nunca aconteceria e o usuário ficaria preso na tela
    // "Redirecionando..." do caminho de sessão órfã. replace em vez de href para
    // não deixar a tela anterior no histórico, já que ela não é mais acessível.
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Erro ao sair:", err);
    } finally {
      window.location.replace("/");
    }
  };

  // Sessão órfã (usuário deletado do banco mas sessão ainda no localStorage): faz logout automático.
  // profileAttempted só vira true dentro do finally de fetchProfile (sucesso ou erro real) — o
  // safetyTimer do AuthProvider nunca seta esse flag, então um timeout genérico de rede/deadlock
  // não dispara este auto-signout indevidamente.
  if (profileAttempted && session && profile === null) {
    handleSignOut();
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Redirecionando...
      </div>
    );
  }

  if (loading || (session && !profileLoaded))
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  if (!session) return <Navigate to="/login" replace />;

  // Usuário soft-deletado: perfil existe mas foi suspenso pelo admin
  if (profileAttempted && session && profile && profile.deleted_at) {
    return (
      <TelaBloqueio
        titulo="Conta suspensa"
        descricao="Sua conta foi desativada pelo administrador. Entre em contato para reativar o acesso."
      >
        <Button onClick={handleSignOut} className="w-full">
          Sair e entrar com outra conta
        </Button>
      </TelaBloqueio>
    );
  }

  // Se o usuário está logado e o perfil existe mas não tem empresa vinculada
  if (
    profileAttempted &&
    session &&
    profile &&
    !profile.empresa_id &&
    profile.role !== "admin"
  ) {
    return (
      <TelaBloqueio
        titulo="Acesso restrito"
        descricao="Sua conta foi criada mas ainda não está vinculada a uma empresa. Peça o código de acesso ao gestor da sua empresa ou fale com o suporte."
      >
        <Button onClick={handleSignOut} className="w-full">
          Sair
        </Button>
      </TelaBloqueio>
    );
  }

  // Gate de plano.
  //
  // Libera por construção: planoBloqueado é denylist, então só barra com um
  // plan_status explicitamente ruim. Coluna ausente (front no ar antes da
  // migration, que é o estado de hoje), null ou valor desconhecido liberam —
  // com allowlist, um descompasso entre o deploy do front e o `supabase db
  // push` trancaria toda a base pagante de uma vez.
  //
  // Quando o safetyTimer dispara temos profileLoaded=true e profile=null, e o
  // fluxo chega até aqui porque todos os blocos acima exigem profileAttempted.
  // Nesse caso libera, via o `profile &&`: sem perfil não há informação alguma
  // sobre a assinatura, e bloquear jogaria um cliente pagante no paywall por
  // dez segundos de rede ruim. O estado não sobrevive a um reload, o app fica
  // degradado (quase toda query depende de empresa_id) e a barreira real dos
  // dados é a RLS, não este if — que é conveniência de navegação.
  //
  // <Navigate> retornado no render, e não navigate() em efeito, para a página
  // protegida não chegar a pintar um frame antes do redirecionamento.
  if (PAYWALL_ATIVO && requerPlano && profile && planoBloqueado(profile)) {
    // O destino original vai no state para a tela de assinatura devolver o
    // usuário ao lugar de onde ele veio depois de reativar.
    return (
      <Navigate to="/assinar" replace state={{ de: location.pathname + location.search }} />
    );
  }

  // Key no ErrorBoundary força remount quando o perfil ou sessão muda —
  // evita que um ErrorBoundary previamente com estado de erro continue mostrando o fallback
  const ebKey = profile?.id ?? session?.user?.id ?? "anon";

  return (
    <ErrorBoundary
      key={ebKey}
      fallback={(error) => (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-8">
          <p className="text-lg font-semibold text-destructive">
            Algo deu errado
          </p>
          {process.env.NODE_ENV !== "production" && error && (
            <p className="text-xs text-muted-foreground max-w-lg font-mono bg-muted/30 px-3 py-2 rounded">
              {error.message}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                const sep = window.location.search ? "&" : "?";
                window.location.href =
                  window.location.pathname +
                  window.location.search +
                  sep +
                  `_r=${Date.now()}`;
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Recarregar (forçado)
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/90 transition-colors border"
            >
              Sair
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileLoaded } = useAuth();
  // Só redireciona quando o estado do perfil está assentado, para não entrar no
  // app com dados parciais e quebrar a renderização.
  if (!loading && profileLoaded && session) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * A raiz é pública, mas quem já tem sessão vai direto para dentro do sistema.
 *
 * Enquanto a sessão existe e o perfil ainda está carregando, mostra o fallback
 * neutro em vez da landing. Isso importa porque "/" ERA a home do app: a base
 * inteira tem esse endereço em favoritos e no histórico, e renderizar a página
 * de vendas nesse intervalo faria um cliente pagante encarar marketing por
 * centenas de milissegundos — ou pelos 10 segundos do safetyTimer, se a busca do
 * perfil travar. O visitante anônimo não é afetado: para ele `session` é nula e
 * a landing aparece de imediato.
 *
 * Não avalia o plano aqui de propósito — quem decide entre /app e /assinar é o
 * gate do ProtectedRoute, num lugar só.
 */
const LandingRoute = () => {
  const { session, loading, profileLoaded } = useAuth();
  if (session && (loading || !profileLoaded)) return <PageFallback />;
  if (!loading && profileLoaded && session) return <Navigate to="/app" replace />;
  return <Landing />;
};

const DashboardWrapper = () => {
  const { profile } = useAuth();
  if (profile?.role === "admin") {
    return <AdminEmpresas />;
  }
  return <Dashboard />;
};

// Admin master não tem acesso à página de Negócios (ver AppSidebar), então a
// home do app cai no painel de empresas em vez do pipeline.
const RootRoute = () => {
  const { profile } = useAuth();
  if (profile?.role === "admin") {
    return <AdminEmpresas />;
  }
  return <Negocios defaultView="pipeline" />;
};

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  // Nega quando NÃO confirmou ser admin — inclusive com profile nulo. A versão
  // anterior era `profile && profile.role !== 'admin'`, que libera quando o
  // perfil não carregou: é o estado em que o safetyTimer de 10s do use-auth
  // dispara sem perfil. Enquanto isso só expunha a tela de instâncias o dano
  // era pequeno; agora que há uma tela listando todos os clientes e alterando
  // plano, a dúvida tem que negar.
  if (profile?.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function GestorRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const isGestor = profile?.role === "admin" || profile?.role === "gestor" || profile?.role === "empresa";
  if (profile && !isGestor) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    {/* Landing pública na raiz. Quem já tem sessão é levado para /app. */}
    <Route path="/" element={<LandingRoute />} />
    <Route
      path="/login"
      element={
        <AuthRoute>
          <Login />
        </AuthRoute>
      }
    />
    {/* Com AuthRoute como as demais telas de entrada: sem ele, um usuário já
        logado veria o formulário e, ao enviá-lo, o signUp trocaria a sessão
        atual pela da conta nova — deslogando a pessoa da própria empresa sem
        aviso. Quando o cadastro passar a fazer login automático (junto do
        checkout), o redirecionamento terá de ser explícito no handler. */}
    <Route
      path="/cadastro"
      element={
        <AuthRoute>
          <Cadastro />
        </AuthRoute>
      }
    />
    <Route
      path="/esqueci-senha"
      element={
        <AuthRoute>
          <EsqueciSenha />
        </AuthRoute>
      }
    />
    <Route path="/redefinir-senha" element={<RedefinirSenha />} />
    {/* Autenticada, mas fora do gate de plano — senão o paywall redirecionaria
        para si mesmo indefinidamente. */}
    <Route
      path="/assinar"
      element={
        <ProtectedRoute requerPlano={false}>
          <Assinar />
        </ProtectedRoute>
      }
    />
    {/* Home do app: saiu de "/" para dar lugar à landing. */}
    <Route
      path="/app"
      element={
        <ProtectedRoute>
          <RootRoute />
        </ProtectedRoute>
      }
    />
    <Route
      path="/clientes"
      element={
        <ProtectedRoute>
          <Clientes />
        </ProtectedRoute>
      }
    />
    <Route
      path="/clientes/:slug"
      element={
        <ProtectedRoute>
          <ClienteDetalhe />
        </ProtectedRoute>
      }
    />
    <Route
      path="/contatos/:slug"
      element={
        <ProtectedRoute>
          <ContatoDetalhe />
        </ProtectedRoute>
      }
    />
    <Route path="/pedidos" element={<Navigate to="/app" replace />} />
    <Route
      path="/pedidos/novo"
      element={
        <ProtectedRoute>
          <NovoPedido />
        </ProtectedRoute>
      }
    />
    <Route
      path="/pedidos/:id/editar"
      element={
        <ProtectedRoute>
          <EditarPedido />
        </ProtectedRoute>
      }
    />
    <Route
      path="/obras"
      element={
        <ProtectedRoute>
          <Obras />
        </ProtectedRoute>
      }
    />
    <Route
      path="/fabricantes"
      element={
        <ProtectedRoute>
          <Fabricantes />
        </ProtectedRoute>
      }
    />
    <Route
      path="/portal"
      element={
        <ProtectedRoute>
          <Portal />
        </ProtectedRoute>
      }
    />
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <DashboardWrapper />
        </ProtectedRoute>
      }
    />
    <Route
      path="/calendario"
      element={
        <ProtectedRoute>
          <Calendario />
        </ProtectedRoute>
      }
    />
    <Route
      path="/tarefas"
      element={
        <ProtectedRoute>
          <Tarefas />
        </ProtectedRoute>
      }
    />
    <Route
      path="/configuracoes"
      element={
        <ProtectedRoute>
          <Configuracoes />
        </ProtectedRoute>
      }
    />
    <Route
      path="/chat"
      element={
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      }
    />
    <Route
      path="/whatsapp"
      element={
        <ProtectedRoute>
          <WhatsAppInbox />
        </ProtectedRoute>
      }
    />
    <Route
      path="/emails"
      element={
        <ProtectedRoute>
          <Emails />
        </ProtectedRoute>
      }
    />
    <Route
      path="/importacao/ignoradas"
      element={
        <ProtectedRoute>
          <LinhasIgnoradas />
        </ProtectedRoute>
      }
    />
    <Route
      path="/historico"
      element={
        <ProtectedRoute>
          <GestorRoute>
            <HistoricoAlteracoes />
          </GestorRoute>
        </ProtectedRoute>
      }
    />

    <Route
      path="/admin/instancias-whatsapp"
      element={
        <ProtectedRoute>
          <AdminRoute>
            <AdminWhatsAppInstancias />
          </AdminRoute>
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/empresas"
      element={
        <ProtectedRoute>
          <AdminRoute>
            <AdminEmpresas />
          </AdminRoute>
        </ProtectedRoute>
      }
    />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

function UrlCleaner() {
  const { profileLoaded } = useAuth();
  useEffect(() => {
    if (!profileLoaded) return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("_r")) return;
      const newParams = new URLSearchParams();
      url.searchParams.forEach((value, key) => {
        if (key !== "_r") newParams.append(key, value);
      });
      const newUrl =
        url.pathname +
        (newParams.toString() ? `?${newParams.toString()}` : "") +
        url.hash;
      window.history.replaceState({}, document.title, newUrl);
    } catch (e) {
      // ignore
    }
  }, [profileLoaded]);
  return null;
}

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">
    Carregando...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <UrlCleaner />
            <Suspense fallback={<PageFallback />}>
              <AppRoutes />
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileLoaded, profileAttempted } =
    useAuth();

  const handleSignOut = async () => {
    await import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.auth.signOut(),
    );
    window.location.href = "/";
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
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg border text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Conta Suspensa
            </h2>
            <p className="text-muted-foreground">
              Sua conta foi desativada pelo administrador. Entre em contato para
              reativar o acesso.
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
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
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg border text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Acesso Restrito
            </h2>
            <p className="text-muted-foreground">
              Sua conta foi criada mas ainda não está vinculada a uma empresa.
              Entre em contato com o suporte.
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
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
  // Only redirect to / when we're sure profile state is settled to avoid
  // navigating into app with partial profile data which can cause render errors.
  if (!loading && profileLoaded && session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const DashboardWrapper = () => {
  const { profile } = useAuth();
  if (profile?.role === "admin") {
    return <AdminDashboard />;
  }
  return <Dashboard />;
};

// Admin master não tem acesso à página de Negócios (ver AppSidebar), então a
// rota raiz precisa cair no dashboard administrativo em vez do pipeline.
const RootRoute = () => {
  const { profile } = useAuth();
  if (profile?.role === "admin") {
    return <AdminDashboard />;
  }
  return <Negocios defaultView="pipeline" />;
};

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (profile && profile.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GestorRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const isGestor = profile?.role === "admin" || profile?.role === "gestor" || profile?.role === "empresa";
  if (profile && !isGestor) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <AuthRoute>
          <Login />
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
    <Route
      path="/"
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
    <Route path="/pedidos" element={<Navigate to="/" replace />} />
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

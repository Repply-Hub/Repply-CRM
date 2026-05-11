import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Negocios from "./pages/Negocios";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import ContatoDetalhe from "./pages/ContatoDetalhe";
import NovoPedido from "./pages/NovoPedido";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Configuracoes from "./pages/Configuracoes";
import Obras from "./pages/Obras";
import Fabricantes from "./pages/Fabricantes";
import Portal from "./pages/Portal";
import EditarPedido from "./pages/EditarPedido";
import Calendario from "./pages/Calendario";
import Tarefas from "./pages/Tarefas";
import Chat from "./pages/Chat";
import Emails from "./pages/Emails";
import LinhasIgnoradas from "./pages/LinhasIgnoradas";

import Login from "./pages/Login";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  
  // Se o usuário está logado mas não tem perfil ou empresa vinculada
  // Só mostramos o bloqueio se o profile realmente foi retornado como nulo após o loading E a sessão existir
  if (session && profile === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg border text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Esta conta não está vinculada a nenhuma empresa ou foi removida pelo administrador.
            </p>
          </div>
          <button 
            onClick={() => signOut()}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
    );
  }

  // Se o usuário está logado e o perfil existe mas não tem empresa vinculada
  if (session && profile && !profile.empresa_id && profile.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg border text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Sua conta foi criada mas ainda não está vinculada a uma empresa. Entre em contato com o suporte.
            </p>
          </div>
          <button 
            onClick={() => signOut()}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const DashboardWrapper = () => {
  const { profile } = useAuth();
  if (profile?.role === 'admin') {
    return <AdminDashboard />;
  }
  return <Dashboard />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
    <Route path="/esqueci-senha" element={<AuthRoute><EsqueciSenha /></AuthRoute>} />
    <Route path="/redefinir-senha" element={<RedefinirSenha />} />
    <Route path="/" element={<ProtectedRoute><Negocios defaultView="pipeline" /></ProtectedRoute>} />
    <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
    <Route path="/clientes/:slug" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />
    <Route path="/contatos/:slug" element={<ProtectedRoute><ContatoDetalhe /></ProtectedRoute>} />
    <Route path="/pedidos" element={<Navigate to="/" replace />} />
    <Route path="/pedidos/novo" element={<ProtectedRoute><NovoPedido /></ProtectedRoute>} />
    <Route path="/pedidos/:id/editar" element={<ProtectedRoute><EditarPedido /></ProtectedRoute>} />
    <Route path="/obras" element={<ProtectedRoute><Obras /></ProtectedRoute>} />
    <Route path="/fabricantes" element={<ProtectedRoute><Fabricantes /></ProtectedRoute>} />
    <Route path="/portal" element={<ProtectedRoute><Portal /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><DashboardWrapper /></ProtectedRoute>} />
    <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
    <Route path="/tarefas" element={<ProtectedRoute><Tarefas /></ProtectedRoute>} />
    <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
    <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
    <Route path="/emails" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
    <Route path="/importacao/ignoradas" element={<ProtectedRoute><LinhasIgnoradas /></ProtectedRoute>} />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

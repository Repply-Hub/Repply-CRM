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
import NovoPedido from "./pages/NovoPedido";
import Dashboard from "./pages/Dashboard";
import Configuracoes from "./pages/Configuracoes";
import Obras from "./pages/Obras";
import Fabricantes from "./pages/Fabricantes";
import Portal from "./pages/Portal";
import EditarPedido from "./pages/EditarPedido";
import Calendario from "./pages/Calendario";
import Tarefas from "./pages/Tarefas";
import Chat from "./pages/Chat";

import Login from "./pages/Login";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
    <Route path="/esqueci-senha" element={<AuthRoute><EsqueciSenha /></AuthRoute>} />
    <Route path="/redefinir-senha" element={<RedefinirSenha />} />
    <Route path="/" element={<ProtectedRoute><Negocios defaultView="pipeline" /></ProtectedRoute>} />
    <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
    <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />
    <Route path="/pedidos" element={<Navigate to="/" replace />} />
    <Route path="/pedidos/novo" element={<ProtectedRoute><NovoPedido /></ProtectedRoute>} />
    <Route path="/pedidos/:id/editar" element={<ProtectedRoute><EditarPedido /></ProtectedRoute>} />
    <Route path="/obras" element={<ProtectedRoute><Obras /></ProtectedRoute>} />
    <Route path="/fabricantes" element={<ProtectedRoute><Fabricantes /></ProtectedRoute>} />
    <Route path="/portal" element={<ProtectedRoute><Portal /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
    <Route path="/tarefas" element={<ProtectedRoute><Tarefas /></ProtectedRoute>} />
    <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
    <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
    
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

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PresenceProvider } from "@/hooks/use-presence";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { TelaBloqueio } from "@/components/shared/TelaBloqueio";
import { Button } from "@/components/ui/button";
import { PAYWALL_ATIVO, planoBloqueado } from "@/lib/plano-gate";
// Todas as páginas entram por aqui, e não pelo `lazy` do React: o wrapper
// traduz "o arquivo desta página sumiu do servidor depois de um deploy" num
// erro reconhecível, em vez de deixar virar o "Algo deu errado" genérico.
import { lazyComRetry, ErroDeVersao } from "@/lib/lazy-com-retry";

const Negocios = lazyComRetry(() => import("./pages/Negocios"));
const Clientes = lazyComRetry(() => import("./pages/Clientes"));
const ClienteDetalhe = lazyComRetry(() => import("./pages/ClienteDetalhe"));
const ContatoDetalhe = lazyComRetry(() => import("./pages/ContatoDetalhe"));
const NovoPedido = lazyComRetry(() => import("./pages/NovoPedido"));
const Dashboard = lazyComRetry(() => import("./pages/Dashboard"));
const AdminDashboard = lazyComRetry(() => import("./pages/AdminDashboard"));
const Configuracoes = lazyComRetry(() => import("./pages/Configuracoes"));
const Obras = lazyComRetry(() => import("./pages/Obras"));
const Fabricantes = lazyComRetry(() => import("./pages/Fabricantes"));
const Portal = lazyComRetry(() => import("./pages/Portal"));
const EditarPedido = lazyComRetry(() => import("./pages/EditarPedido"));
const Calendario = lazyComRetry(() => import("./pages/Calendario"));
const Tarefas = lazyComRetry(() => import("./pages/Tarefas"));
const Chat = lazyComRetry(() => import("./pages/Chat"));
const Emails = lazyComRetry(() => import("./pages/Emails"));
const WhatsAppInbox = lazyComRetry(() => import("./pages/WhatsAppInbox"));
const LinhasIgnoradas = lazyComRetry(() => import("./pages/LinhasIgnoradas"));
const AdminWhatsAppInstancias = lazyComRetry(
  () => import("./pages/AdminWhatsAppInstancias"),
);
const HistoricoAlteracoes = lazyComRetry(() => import("./pages/HistoricoAlteracoes"));
const AdminEmpresas = lazyComRetry(() => import("./pages/AdminEmpresas"));
const AdminSecoes = lazyComRetry(() => import("./pages/AdminSecoes"));

const Landing = lazyComRetry(() => import("./pages/Landing"));
const Cadastro = lazyComRetry(() => import("./pages/Cadastro"));
const Assinar = lazyComRetry(() => import("./pages/Assinar"));
const Login = lazyComRetry(() => import("./pages/Login"));
const EsqueciSenha = lazyComRetry(() => import("./pages/EsqueciSenha"));
const RedefinirSenha = lazyComRetry(() => import("./pages/RedefinirSenha"));
const NotFound = lazyComRetry(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60_000,
    },
  },
});

/** Sai da sessão e volta para a raiz, aconteça o que acontecer. */
async function sairEVoltarParaRaiz() {
  // O finally é obrigatório: se o signOut rejeitar (rede caindo, por exemplo),
  // sem ele a navegação nunca aconteceria e o usuário ficaria preso na tela
  // "Redirecionando...". replace em vez de href para não deixar a tela anterior
  // no histórico, já que ela não é mais acessível.
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Erro ao sair:", err);
  } finally {
    window.location.replace("/");
  }
}

/**
 * Tela de erro — usada pelo boundary da raiz e pelo das páginas.
 *
 * Distingue dois casos que antes caíam no mesmo "Algo deu errado":
 *
 * 1. `ErroDeVersao` — a página que a pessoa tentou abrir pertence a uma versão
 *    anterior do sistema, porque saiu um deploy com a aba aberta. Não é bug: é
 *    o app pedindo para recarregar. Dizer "algo deu errado" aqui era assustar
 *    à toa e não indicava a saída.
 * 2. Erro de verdade — mostra a mensagem (que antes ficava escondida em
 *    produção) e o código curto de `app_erros`, para o suporte conseguir achar
 *    o que houve em vez de depender de print de tela.
 */
function TelaDeErro({ error, codigo }: { error: Error | null; codigo: string | null }) {
  const ehVersao = error instanceof ErroDeVersao || error?.name === "ErroDeVersao";

  const recarregar = () => {
    // Navegação completa com cache-buster: só isso recria os módulos que o
    // React guardou como rejeitados. O `_r` é retirado da URL depois pelo
    // UrlCleaner. Uso `replace` para não empilhar histórico a cada tentativa —
    // com `href`, clicar duas vezes gerava `?_r=1&_r=2`.
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-8">
      <p className="text-lg font-semibold text-foreground">
        {ehVersao ? "Saiu uma versão nova do sistema" : "Algo deu errado"}
      </p>

      <p className="max-w-md text-sm text-muted-foreground">
        {ehVersao
          ? "Esta aba está aberta desde antes da última atualização. Recarregue para continuar — nada do seu trabalho foi perdido."
          : "A tela não conseguiu carregar. Recarregar costuma resolver."}
      </p>

      {!ehVersao && error?.message && (
        <p className="max-w-lg rounded bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
      )}

      {!ehVersao && codigo && (
        <p className="text-xs text-muted-foreground">
          Código do erro:{" "}
          <span className="font-mono font-semibold text-foreground">{codigo}</span>
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={recarregar}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {ehVersao ? "Recarregar" : "Recarregar (forçado)"}
        </button>
        <button
          onClick={sairEVoltarParaRaiz}
          className="px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/90 transition-colors border"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

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

  const handleSignOut = sairEVoltarParaRaiz;

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

  // O administrador global não opera o CRM de ninguém — fica nas telas dele.
  //
  // Esconder os itens do menu (AppSidebar) não bastaria: as rotas continuam
  // alcançáveis digitando a URL, por um link antigo ou pelo histórico do
  // navegador. E as telas de dados, ao montar, disparam as consultas da empresa
  // — que hoje voltam vazias por RLS, mas tela vazia com spinner eterno é pior
  // do que não entrar.
  //
  // /configuracoes está LIBERADA, e a primeira versão desta guarda estava errada
  // ao bloqueá-la. Aquela tela não tem conteúdo de cliente — tem administração
  // de conta — e concentra três coisas que só existem ali:
  //   · o próprio perfil do admin: é o único lugar do app que chama
  //     updateUser({ email }) e updateUser({ password }). Sem ela, o avatar do
  //     cabeçalho e o do rodapé da sidebar viravam links mortos e o admin não
  //     trocava a própria senha nem o próprio e-mail estando logado;
  //   · reativar usuário removido por engano (aba Usuários, em modo admin) —
  //     a tela de Empresas só LÊ os usuários de cada assinante;
  //   · editar nome, CNPJ e código de acesso de uma empresa (aba Empresa).
  // São justamente as ferramentas de suporte do admin. O banco sempre permitiu
  // (usuarios e empresas mantiveram is_admin()); quem havia tirado o acesso era
  // esta guarda.
  //
  // Isto é navegação, não segurança: quem impede a leitura de conteúdo são as
  // policies (migration 20260804195019).
  const ROTAS_DO_ADMIN_GERAL = ["/admin", "/configuracoes"];
  if (
    profileAttempted &&
    profile?.role === "admin" &&
    !ROTAS_DO_ADMIN_GERAL.some((r) => location.pathname.startsWith(r))
  ) {
    return <Navigate to="/admin/empresas" replace />;
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

  // A `key` inclui a ROTA, e essa é a correção mais importante deste arquivo.
  //
  // Antes ela era só `profile?.id ?? session?.user?.id ?? "anon"`, que não muda
  // ao navegar. E o react-router não põe key nos elementos de rota: como toda
  // rota protegida renderiza o mesmo componente `ProtectedRoute` na mesma
  // posição da árvore, o React reconcilia como UPDATE, não como mount. O fiber
  // do ErrorBoundary sobrevivia à troca de rota com `hasError: true` grudado.
  //
  // Na prática: um único erro em QUALQUER página travava todas as outras. Como
  // a sidebar mora dentro da página, ela sumia junto, e a pessoa ficava sem
  // conteúdo e sem menu — só o F5 devolvia o app. Era o "cliquei na aba e não
  // apareceu nada" relatado.
  const ebKey = `${profile?.id ?? session?.user?.id ?? "anon"}|${location.pathname}`;

  return (
    <ErrorBoundary
      key={ebKey}
      fallback={(error, _reset, codigo) => <TelaDeErro error={error} codigo={codigo} />}
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

// Antes estes dois desviavam o admin para <AdminEmpresas/> renderizando-o
// dentro de /dashboard e /app. Agora quem faz isso é a guarda do ProtectedRoute,
// que redireciona para /admin/empresas — uma URL só, em vez da mesma tela
// aparecendo em três endereços diferentes. Estes componentes voltam a ser só o
// que o nome diz.
const DashboardWrapper = () => <Dashboard />;

// Admin master não tem acesso à página de Negócios (ver AppSidebar), então a
// home do app cai no painel de empresas em vez do pipeline.
const RootRoute = () => <Negocios defaultView="pipeline" />;

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
    {/* /admin já está em ROTAS_DO_ADMIN_GERAL por PREFIXO, então esta rota nova já é
        alcançável pelo admin sem tocar naquela lista. E secaoDaRota('/admin/secoes')
        devolve null, então a guarda de seção não se auto-bloqueia. */}
    <Route
      path="/admin/secoes"
      element={
        <ProtectedRoute>
          <AdminRoute>
            <AdminSecoes />
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
        <PresenceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <UrlCleaner />
              {/* Boundary da RAIZ. O único ErrorBoundary do app ficava dentro do
                  ProtectedRoute, então as rotas públicas — `/`, `/login`,
                  `/cadastro`, `/redefinir-senha` e o 404 — não tinham nenhum. Lá
                  um erro subia até o topo e o React 18 desmontava a árvore
                  inteira: página branca, sem nem a tela de erro.

                  Isso importa especialmente no logout, que leva justamente para
                  `/login`: se o chunk dessa página fosse de uma versão anterior,
                  sair do sistema deixava a tela em branco. Era o "faço logout e
                  preciso atualizar a página".

                  Fica DENTRO dos providers para a tela de erro poder usar tema e
                  tokens, e ACIMA do Suspense para pegar também a rejeição do
                  import de uma página. */}
              <ErrorBoundary
                fallback={(error, _reset, codigo) => (
                  <TelaDeErro error={error} codigo={codigo} />
                )}
              >
                <Suspense fallback={<PageFallback />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </PresenceProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: any | null;
  loading: boolean;
  profileLoaded: boolean;
  profileAttempted: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signUpEmpresa: (email: string, password: string, nome: string, nomeEmpresa: string, cnpjEmpresa?: string) => Promise<{ error: Error | null }>;
  signUpFuncionario: (email: string, password: string, nome: string, codigoEmpresa: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileAttempted, setProfileAttempted] = useState(false);
  const profileLoadedRef = useRef(false);
  const fetchingRef = useRef(false);

  const isJwtExpiredError = (err: any) =>
    !!err && (err.message?.includes("JWT expired") || err.code === "PGRST301" || err.status === 401);

  const fetchProfile = async (userId: string) => {
    console.log("[AUTH] fetchProfile ENTER — fetchingRef:", fetchingRef.current, "profileLoadedRef:", profileLoadedRef.current);
    if (fetchingRef.current) {
      console.log("[AUTH] fetchProfile EARLY RETURN — já está buscando");
      return;
    }
    fetchingRef.current = true;
    try {
      console.log("[AUTH] fetchProfile — iniciando query para userId:", userId);
      let { data, error } = await supabase
        .from("usuarios")
        .select("*, empresas(*)")
        .eq("user_id", userId)
        .maybeSingle();

      console.log("[AUTH] fetchProfile — resposta recebida:", { data: !!data, error: error?.message });

      if (error && isJwtExpiredError(error)) {
        console.log("[AUTH] fetchProfile — JWT expirado, forçando refreshSession() e tentando novamente");
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          const retry = await supabase
            .from("usuarios")
            .select("*, empresas(*)")
            .eq("user_id", userId)
            .maybeSingle();
          data = retry.data;
          error = retry.error;
          console.log("[AUTH] fetchProfile — retry após refresh:", { data: !!data, error: error?.message });
        } else {
          console.log("[AUTH] fetchProfile — refreshSession falhou:", refreshError.message);
        }
      }

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error("Exceção ao buscar perfil:", err);
      setProfile(null);
    } finally {
      console.log("[AUTH] fetchProfile FINALLY — setProfileLoaded(true), setLoading(false)");
      setProfileLoaded(true);
      setProfileAttempted(true);
      profileLoadedRef.current = true;
      fetchingRef.current = false;
      setLoading(false);
      console.log("[AUTH] fetchProfile EXIT");
    }
  };

  useEffect(() => {
    let mounted = true;

    // Timeout de segurança: libera a UI do estado de loading visual mesmo se
    // fetchProfile nunca resolver (deadlock, rede travada, etc). NÃO marca
    // profileAttempted=true — esse flag só pode vir de uma tentativa real de
    // fetchProfile (sucesso ou erro), para não disparar o auto-signout de
    // "sessão órfã" em App.tsx por causa de um timeout genérico.
    const safetyTimer = setTimeout(() => {
      if (mounted && !profileLoadedRef.current) {
        console.log("[AUTH] safetyTimer disparado — fetchProfile não concluiu em 10s, liberando loading visual sem marcar profileAttempted");
        setLoading(false);
        setProfileLoaded(true);
      }
    }, 10000);

    // Usa onAuthStateChange como única fonte de verdade.
    // O evento INITIAL_SESSION é disparado automaticamente na inicialização
    // com a sessão do localStorage, sem race condition.
    // IMPORTANTE: o callback NÃO usa await em fetchProfile — dispara fire-and-forget
    // e retorna imediatamente. Isso evita bloquear o dispatcher de eventos do Supabase
    // (ex: TOKEN_REFRESHED chegando enquanto INITIAL_SESSION ainda estava em andamento).
    // loading/profileLoaded são geridos inteiramente dentro do finally de fetchProfile.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log("[AUTH] onAuthStateChange EVENTO:", _event, "| session:", !!session?.user, "| mounted:", mounted);
        if (!mounted) {
          console.log("[AUTH] onAuthStateChange IGNORADO — componente desmontado");
          return;
        }

        if (session?.user) {
          setSession(session);
          console.log("[AUTH] onAuthStateChange — session set, profileLoadedRef:", profileLoadedRef.current, "| fetchingRef:", fetchingRef.current);
          if (!profileLoadedRef.current) {
            console.log("[AUTH] onAuthStateChange — disparando fetchProfile (fire-and-forget)");
            fetchProfile(session.user.id);
          } else {
            console.log("[AUTH] onAuthStateChange — fetchProfile já concluído anteriormente, nada a fazer");
          }
        } else {
          console.log("[AUTH] onAuthStateChange — sem sessão, limpando estado e setLoading(false)");
          setSession(null);
          setProfile(null);
          setProfileLoaded(false);
          setProfileAttempted(false);
          profileLoadedRef.current = false;
          fetchingRef.current = false;
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        (window as any).__APP_AUTH_STATE__ = { session, profile, loading, profileLoaded };
      } catch (e) {}
    }
  }, [session, profile, loading, profileLoaded]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { nome } } });
    return { error: error as Error | null };
  };

  const signUpEmpresa = async (email: string, password: string, nome: string, nomeEmpresa: string, cnpjEmpresa?: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nome, role: "empresa", nome_empresa: nomeEmpresa, cnpj_empresa: cnpjEmpresa ?? "" } },
    });
    return { error: error as Error | null };
  };

  const signUpFuncionario = async (email: string, password: string, nome: string, codigoEmpresa: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nome, role: "vendedor", codigo_empresa: codigoEmpresa.toUpperCase() } },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoaded,
      profileAttempted,
      signIn,
      signUp,
      signUpEmpresa,
      signUpFuncionario,
      signOut,
    }}>
      {children}
      <AuthQuerySync />
    </AuthContext.Provider>
  );
}

function AuthQuerySync() {
  const qc = useQueryClient();
  const ctx = useContext(AuthContext);

  useEffect(() => {
    try {
      if (ctx?.session && ctx.profileLoaded) {
        qc.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return key !== 'usuario_perfil_negocios' && key !== 'usuario_perfil';
          },
        });
      } else if (!ctx?.session) {
        qc.clear();
      }
    } catch (e) {}
  }, [ctx?.session, ctx?.profileLoaded, qc]);

  return null;
}

try {
  if (typeof window !== "undefined") {
    (window as any).__APP_AUTH_STATE__ = { session: null, profile: null, loading: true, profileLoaded: false };
  }
} catch (e) {}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

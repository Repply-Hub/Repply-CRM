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

  const fetchProfile = async (userId: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*, empresas(*)")
        .eq("user_id", userId)
        .maybeSingle();

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
      setProfileLoaded(true);
      setProfileAttempted(true);
      profileLoadedRef.current = true;
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted && !profileLoadedRef.current) {
        setLoading(false);
        setProfileLoaded(true);
        setProfileAttempted(true);
      }
    }, 10000);

    // Usa onAuthStateChange como única fonte de verdade.
    // O evento INITIAL_SESSION é disparado automaticamente na inicialização
    // com a sessão do localStorage, sem race condition.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        if (session?.user) {
          setSession(session);
          if (!profileLoadedRef.current) {
            await fetchProfile(session.user.id);
          }
          if (mounted) setLoading(false);
        } else {
          setSession(null);
          setProfile(null);
          setProfileLoaded(false);
          profileLoadedRef.current = false;
          fetchingRef.current = false;
          if (mounted) setLoading(false);
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

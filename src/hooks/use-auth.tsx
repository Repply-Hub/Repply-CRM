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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    nome: string,
  ) => Promise<{ error: Error | null }>;
  signUpEmpresa: (
    email: string,
    password: string,
    nome: string,
    nomeEmpresa: string,
    cnpjEmpresa?: string,
  ) => Promise<{ error: Error | null }>;
  signUpFuncionario: (
    email: string,
    password: string,
    nome: string,
    codigoEmpresa: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Refs para manter os valores mais recentes acessíveis dentro dos callbacks de subscrição
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<any | null>(null);

  const updateSession = (newSession: Session | null) => {
    sessionRef.current = newSession;
    setSession(newSession);
  };

  const updateProfile = (newProfile: any | null) => {
    profileRef.current = newProfile;
    setProfile(newProfile);
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*, empresas(*)")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        updateProfile(null);
      } else {
        updateProfile(data);
      }
    } catch (err) {
      console.error("Exceção ao buscar perfil:", err);
      updateProfile(null);
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      updateSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      const currentSession = sessionRef.current;
      const currentProfile = profileRef.current;

      // Se a sessão for a mesma (mesmo token), ignoramos para evitar loops e buscas repetidas
      if (
        currentSession?.access_token === session?.access_token &&
        event === "SIGNED_IN"
      ) {
        return;
      }

      if (session?.user) {
        // Só buscamos o perfil se ele ainda não existir ou se for uma mudança real de usuário
        if (!currentProfile || currentProfile.user_id !== session.user.id) {
          // setLoading BEFORE updateSession: evita render intermediário com
          // session=set + loading=false + profile=null → "Acesso Restrito" piscando
          setLoading(true);
          updateSession(session);
          await fetchProfile(session.user.id);
          if (mounted) setLoading(false);
        } else {
          updateSession(session);
          if (mounted) setLoading(false);
        }
      } else {
        updateProfile(null);
        updateSession(session);
        setProfileLoaded(false);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Mantém um snapshot global para debugging em dev (atualiza sempre que o auth muda)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        (window as any).__APP_AUTH_STATE__ = {
          session,
          profile,
          loading,
          profileLoaded,
        };
      } catch (e) {
        // noop
      }
    }
  }, [session, profile, loading, profileLoaded]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });
    return { error: error as Error | null };
  };

  const signUpEmpresa = async (
    email: string,
    password: string,
    nome: string,
    nomeEmpresa: string,
    cnpjEmpresa?: string,
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          role: "empresa",
          nome_empresa: nomeEmpresa,
          cnpj_empresa: cnpjEmpresa ?? "",
        },
      },
    });
    return { error: error as Error | null };
  };

  const signUpFuncionario = async (
    email: string,
    password: string,
    nome: string,
    codigoEmpresa: string,
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          role: "vendedor",
          codigo_empresa: codigoEmpresa.toUpperCase(),
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoaded,
        signIn,
        signUp,
        signUpEmpresa,
        signUpFuncionario,
        signOut,
      }}
    >
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
      // only invalidate when profile is loaded to avoid races where components
      // refetch too early and receive partial state
      if (ctx?.session && ctx.profileLoaded) {
        qc.invalidateQueries();
      } else if (!ctx?.session) {
        // clear to avoid leaking previous user's cache
        qc.clear();
      }
    } catch (e) {
      // non critical
      // console.warn('AuthQuerySync error', e);
    }
  }, [ctx?.session, ctx?.profileLoaded, qc]);

  return null;
}

// Expose auth snapshot for easier debugging in dev
try {
  if (typeof window !== "undefined") {
    (window as any).__APP_AUTH_STATE__ = {
      session: null,
      profile: null,
      loading: true,
      profileLoaded: false,
    };
  }
} catch (e) {
  // noop
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import {
  createContext,
  useCallback,
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
  /**
   * Rebusca o perfil sob demanda (voltar do checkout, polling da tela de
   * assinatura). Difere do fetchProfile interno em três pontos deliberados:
   *  - funciona DEPOIS do load inicial, quando o fetchProfile já não roda mais;
   *  - NUNCA seta profile = null, nem em erro nem em "zero linhas", porque zerar
   *    o perfil com sessão viva dispara o auto-signout de sessão órfã no
   *    ProtectedRoute;
   *  - não toca em nenhum ref ou flag do fetchProfile.
   * Retorna o perfil mais recente que conseguiu: o novo em caso de sucesso, o
   * atual (inalterado) em qualquer falha.
   */
  refreshProfile: () => Promise<any | null>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signUpEmpresa: (email: string, password: string, nome: string, nomeEmpresa: string, cnpjEmpresa?: string) => Promise<{ error: Error | null }>;
  signUpFuncionario: (email: string, password: string, nome: string, codigoEmpresa: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isJwtExpiredError = (err: any) =>
  !!err && (err.message?.includes("JWT expired") || err.code === "PGRST301" || err.status === 401);

// O embed da assinatura é o que alimenta o gate de plano. Com plano B porque o
// deploy do front e o `supabase db push` são independentes: enquanto a tabela
// não existir — ou enquanto o cache de esquema do PostgREST estiver frio — a
// consulta com embed falha, e sem a alternativa o perfil viria nulo, o que o
// ProtectedRoute trata como sessão órfã e desloga TODA a base de uma vez.
const SELECT_COM_ASSINATURA = "*, empresas(*, empresa_assinaturas(*))";
const SELECT_SIMPLES = "*, empresas(*)";

// Fora do componente de propósito: não depende de nada do estado, e definida
// aqui ela tem identidade estável — o refreshProfile é um useCallback com
// dependências vazias, e uma função recriada a cada render viraria uma captura
// silenciosa da primeira versão.
const buscarPerfil = async (userId: string) => {
  const comEmbed = await supabase
    .from("usuarios")
    .select(SELECT_COM_ASSINATURA)
    .eq("user_id", userId)
    .maybeSingle();

  if (!comEmbed.error) return comEmbed;

  // Erro de JWT é tratado por quem chama (com refresh e nova tentativa); não
  // adianta cair para a consulta simples, que falharia igual.
  if (isJwtExpiredError(comEmbed.error)) return comEmbed;

  console.warn("[AUTH] embed de assinatura indisponível, seguindo sem ele:", comEmbed.error.message);
  return supabase.from("usuarios").select(SELECT_SIMPLES).eq("user_id", userId).maybeSingle();
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileAttempted, setProfileAttempted] = useState(false);
  const profileLoadedRef = useRef(false);
  const fetchingRef = useRef(false);
  // Espelhos síncronos de profile/session: o refreshProfile é chamado de dentro
  // de intervalos e callbacks que capturam closure antiga, e ler o state por
  // closure devolveria valor obsoleto.
  const profileRef = useRef<any | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const refreshEmVooRef = useRef<Promise<any | null> | null>(null);
  // Cada escrita bem-sucedida do perfil incrementa esta versão. Serve para uma
  // resposta lenta não sobrescrever outra mais recente que já chegou.
  const versaoPerfilRef = useRef(0);

  const fetchProfile = async (userId: string) => {
    console.log("[AUTH] fetchProfile ENTER — fetchingRef:", fetchingRef.current, "profileLoadedRef:", profileLoadedRef.current);
    if (fetchingRef.current) {
      console.log("[AUTH] fetchProfile EARLY RETURN — já está buscando");
      return;
    }
    fetchingRef.current = true;
    const versaoInicial = versaoPerfilRef.current;
    // Só vira true quando a resposta é de fato aproveitada. É o que distingue
    // "terminei de carregar o perfil" de "a resposta chegou tarde e foi jogada
    // fora" — os dois marcavam profileLoaded antes.
    let concluiu = false;
    try {
      console.log("[AUTH] fetchProfile — iniciando query para userId:", userId);
      let { data, error } = await buscarPerfil(userId);

      console.log("[AUTH] fetchProfile — resposta recebida:", { data: !!data, error: error?.message });

      if (error && isJwtExpiredError(error)) {
        console.log("[AUTH] fetchProfile — JWT expirado, forçando refreshSession() e tentando novamente");
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          const retry = await buscarPerfil(userId);
          data = retry.data;
          error = retry.error;
          console.log("[AUTH] fetchProfile — retry após refresh:", { data: !!data, error: error?.message });
        } else {
          console.log("[AUTH] fetchProfile — refreshSession falhou:", refreshError.message);
        }
      }

      // Esta busca pode ter demorado tanto que um refreshProfile já resgatou o
      // perfil no meio do caminho (é o cenário do safetyTimer). Nesse caso o
      // dado aqui é mais velho que o que está na tela, e escrevê-lo faria o
      // perfil regredir — inclusive devolvendo ao paywall alguém que acabou de
      // pagar, ou deslogando um usuário válido se a resposta vier vazia.
      if (versaoPerfilRef.current !== versaoInicial) {
        console.log("[AUTH] fetchProfile — resposta obsoleta, descartada em favor de um refresh mais recente");
        return;
      }

      // A sessão pode ter trocado (ou acabado) enquanto esta busca voava.
      // Escrever aqui colocaria o perfil de um usuário sobre a sessão de outro
      // — é a mesma checagem que refreshProfile já faz antes de gravar.
      if (sessionRef.current?.user?.id !== userId) {
        console.log("[AUTH] fetchProfile — a sessão mudou durante a busca, resposta descartada");
        return;
      }

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        // Não zera um perfil que já existe: zerar setaria profile=null junto com
        // profileAttempted=true, e o ProtectedRoute deslogaria o usuário tratando
        // como sessão órfã. Sem perfil anterior (órfã de verdade), o
        // comportamento continua idêntico ao anterior.
        setProfile((anterior) => anterior ?? null);
      } else {
        versaoPerfilRef.current += 1;
        profileRef.current = data;
        setProfile(data);
      }
      concluiu = true;
    } catch (err) {
      console.error("Exceção ao buscar perfil:", err);
      if (versaoPerfilRef.current !== versaoInicial) return;
      if (sessionRef.current?.user?.id !== userId) return;
      setProfile((anterior) => anterior ?? null);
      concluiu = true;
    } finally {
      // `fetchingRef` sempre é liberado — senão um fetch que morreu no meio
      // trancaria todos os seguintes.
      fetchingRef.current = false;

      // O RESTO só vale se a resposta foi realmente aproveitada. Antes este
      // bloco rodava incondicionalmente, e era esse o bug do logout:
      //
      // 1. a pessoa sai; o ramo SIGNED_OUT zera profileLoadedRef...
      // 2. ...mas não cancela um fetchProfile já em voo;
      // 3. a resposta atrasada chegava aqui e regravava profileLoadedRef=true,
      //    mesmo tendo sido descartada logo acima;
      // 4. no login seguinte, o onAuthStateChange via profileLoadedRef=true e
      //    registrava "fetchProfile já concluído anteriormente, nada a fazer" —
      //    o perfil do NOVO usuário nunca era buscado.
      //
      // Daí o "saio e entro de novo e preciso atualizar a página".
      if (concluiu) {
        console.log("[AUTH] fetchProfile FINALLY — setProfileLoaded(true), setLoading(false)");
        setProfileLoaded(true);
        setProfileAttempted(true);
        profileLoadedRef.current = true;
        setLoading(false);
      } else {
        console.log("[AUTH] fetchProfile FINALLY — resposta descartada, estado preservado");
      }
      console.log("[AUTH] fetchProfile EXIT");
    }
  };

  /**
   * Ver a documentação completa na interface AuthContextType.
   *
   * useCallback com dependências vazias é proposital: a tela de assinatura põe
   * esta função em array de dependências de efeito para fazer polling. Se a
   * identidade mudasse a cada render, o intervalo seria destruído e recriado a
   * cada tick — por isso a função lê sessão e perfil por ref, nunca por closure.
   *
   * Não consulta fetchingRef de propósito: quando o safetyTimer dispara, a busca
   * travada deixa fetchingRef em true para sempre e nenhuma tentativa volta a
   * rodar. Este refresh é a única saída desse estado; respeitar o guard herdaria
   * o impasse.
   */
  const refreshProfile = useCallback(async (): Promise<any | null> => {
    // Um clique em "já paguei" somado a um tick do polling não podem virar duas
    // queries: quem chega depois compartilha a mesma promessa.
    if (refreshEmVooRef.current) return refreshEmVooRef.current;

    const userId = sessionRef.current?.user?.id;
    if (!userId) {
      console.log("[AUTH] refreshProfile — sem sessão, nada a fazer");
      return profileRef.current;
    }

    const executar = async (): Promise<any | null> => {
      try {
        let { data, error } = await buscarPerfil(userId);

        if (error && isJwtExpiredError(error)) {
          // Caso clássico do retorno do checkout: o usuário passou minutos fora
          // da aba e o token expirou enquanto estava no provedor de pagamento.
          const { error: erroRefresh } = await supabase.auth.refreshSession();
          if (!erroRefresh) {
            const retry = await buscarPerfil(userId);
            data = retry.data;
            error = retry.error;
          }
        }

        if (error) {
          console.error("[AUTH] refreshProfile — erro, preservando perfil atual:", error.message);
          return profileRef.current;
        }

        if (!data) {
          // Query bem-sucedida com zero linhas. Pode ser usuário realmente
          // removido, mas também pode ser uma policy de RLS nova filtrando
          // demais. Decidir que a sessão é órfã é responsabilidade exclusiva da
          // busca de boot, onde a ausência é inequívoca.
          console.warn("[AUTH] refreshProfile — zero linhas, preservando perfil atual");
          return profileRef.current;
        }

        // A sessão pode ter trocado enquanto a query voava — logout em outra
        // aba, ou troca de conta. Escrever aqui colocaria o perfil de um usuário
        // em cima da sessão de outro.
        if (sessionRef.current?.user?.id !== userId) {
          console.warn("[AUTH] refreshProfile — a sessão mudou durante a busca, resultado descartado");
          return profileRef.current;
        }

        versaoPerfilRef.current += 1;
        profileRef.current = data;
        setProfile(data);
        return data;
      } catch (err) {
        console.error("[AUTH] refreshProfile — exceção, preservando perfil atual:", err);
        return profileRef.current;
      }
    };

    const promessa = executar();
    refreshEmVooRef.current = promessa;
    promessa.finally(() => {
      // Só limpa se ainda for este o voo corrente, para não apagar um refresh novo.
      if (refreshEmVooRef.current === promessa) refreshEmVooRef.current = null;
    });
    return promessa;
  }, []);

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
          sessionRef.current = session;
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
          // Invalida qualquer fetchProfile em voo. Sem isto, a guarda de
          // obsolescência lá em cima não cobria o logout (ela compara a versão,
          // que ninguém incrementava aqui), e uma resposta atrasada ressuscitava
          // o perfil do usuário que acabou de sair.
          versaoPerfilRef.current += 1;
          sessionRef.current = null;
          profileRef.current = null;
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

  /**
   * Sai da sessão.
   *
   * Devolve o erro em vez de engoli-lo. O SDK do Supabase, quando a chamada de
   * signOut falha por rede (offline, timeout, 5xx), NÃO remove a sessão local e
   * NÃO emite o evento SIGNED_OUT — ele apenas devolve `{ error }`. Como aqui o
   * retorno era descartado e o app depende do SIGNED_OUT para trocar de tela,
   * o clique em "Sair" ficava silenciosamente sem efeito nenhum: nada mudava
   * até a pessoa atualizar a página. Quem chama agora consegue avisar.
   */
  const signOut = async (): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[AUTH] signOut falhou:", error.message);
    return { error: (error as Error) ?? null };
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoaded,
      profileAttempted,
      refreshProfile,
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

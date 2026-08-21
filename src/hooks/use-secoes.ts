import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { SECOES, type SecaoId } from '@/lib/secoes';

/**
 * Quais seções a empresa do usuário logado tem.
 *
 * Uma chamada só para as 12 seções (RPC `minhas_secoes`), em vez de uma por seção: a
 * cascata pergunta em dezenas de pontos de tela, e uma consulta por ponto multiplicaria a
 * conta por nada.
 *
 * A resposta do banco é a MESMA que as políticas de RLS usam (`empresa_tem_secao`), então
 * tela e banco não têm como divergir. Sem isso, o menu esconde e a rota deixa entrar — ou
 * o contrário — e ninguém descobre até um cliente ver o que não devia.
 *
 * EIXO: isto é POR EMPRESA (o que existe). Quem VÊ, dentro do que existe, continua sendo
 * `permissoes_usuario` — outro eixo, outro hook, e os dois convivem.
 */
export function useSecoesDaEmpresa() {
  const { profile, profileLoaded } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? null;

  const q = useQuery({
    queryKey: ['secoes_da_empresa', empresaId],
    // Sem empresa não há o que perguntar. O admin global cai aqui e não usa telas de CRM
    // (o ProtectedRoute o manda para /admin/empresas).
    enabled: profileLoaded && !!empresaId,

    // 30 segundos, e recarrega ao voltar para a aba.
    //
    // A primeira versão usava 5 minutos, com o argumento de que "a cascata pergunta em
    // dezenas de pontos". O argumento estava ERRADO: o TanStack Query agrupa por
    // queryKey, então os dezenas de consumidores compartilham UMA busca. O custo real de
    // um prazo curto é uma consulta pequena por navegação — barato.
    //
    // E o prazo longo tinha um custo alto, relatado em 21/08/2026: o admin desligou o
    // Portal da MD e o item continuou na tela de quem estava logado lá. A invalidação
    // feita em use-admin-secoes.ts só alcança o navegador DO ADMIN — o da outra pessoa é
    // outra sessão e não fica sabendo. Somado ao `refetchOnWindowFocus: false` global
    // (App.tsx), o navegador dela podia ficar indefinidamente com a resposta velha.
    //
    // O override de refetchOnWindowFocus é deliberado e vale só para esta consulta: voltar
    // para a aba é o momento natural de descobrir que o acesso mudou.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minhas_secoes');
      if (error) throw error;
      const mapa = new Map<string, boolean>();
      for (const linha of data ?? []) {
        mapa.set(linha.secao, linha.habilitada);
      }
      return mapa;
    },
  });

  return { mapa: q.data, carregando: q.isLoading, erro: q.error };
}

/**
 * Uma seção está ligada para esta empresa?
 *
 * `ligada === undefined` significa **"ainda não sei"** — não significa "não". Quem chama
 * decide o que fazer com a dúvida, e os dois casos têm respostas OPOSTAS:
 *
 *  - guarda de rota: ESPERA (mostra "Carregando"). Negar piscaria "sem acesso" na cara de
 *    quem tem acesso;
 *  - cascata dentro de uma tela: ESCONDE. Um campo que aparece e some é pior de usar que
 *    um campo que demora a aparecer.
 *
 * Seção não desligável responde `true` na hora, sem esperar o banco: o produto não
 * funciona sem ela, então não há resposta possível além de sim.
 */
export function useSecaoLigada(id: SecaoId) {
  const { mapa, carregando, erro } = useSecoesDaEmpresa();

  const desligavel = SECOES.find((s) => s.id === id)?.desligavel ?? true;
  if (!desligavel) return { ligada: true, carregando: false };

  // Erro de rede não pode trancar quem paga. A barreira real dos dados é a RLS — este
  // hook é conveniência de navegação. É o mesmo argumento que o gate de plano usa em
  // App.tsx para liberar quando não sabe.
  if (erro) return { ligada: true, carregando: false };

  return { ligada: mapa?.get(id), carregando };
}

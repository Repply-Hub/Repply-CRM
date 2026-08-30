import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/**
 * A conta desta empresa foi encerrada?
 *
 * 🔴 VEM DE UMA CONSULTA, e não do perfil, porque o registro da exclusão é só do admin. A
 * função de banco `minha_empresa_foi_encerrada()` devolve um booleano e nada mais — sem data,
 * sem motivo, sem quem decidiu. É o mínimo que a tela precisa para avisar.
 *
 * 🔴 O PADRÃO É `false` ENQUANTO CARREGA, e não `true`. Um instante de "conta encerrada" na
 * tela de quem está em dia é bem pior que um instante a mais de app normal para quem foi
 * encerrado: o primeiro faz cliente pagante ligar em pânico.
 */
export function useContaEncerrada(): boolean {
  const { profile } = useAuth();

  const { data } = useQuery({
    queryKey: ['minha_empresa_foi_encerrada', profile?.empresa_id ?? profile?.empresas?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minha_empresa_foi_encerrada' as never);
      if (error) throw error;
      return Boolean(data);
    },
    // Só faz sentido perguntar para quem tem empresa. Admin global não tem, e nunca é
    // encerrado.
    enabled: !!(profile?.empresa_id ?? profile?.empresas?.id) && profile?.role !== 'admin',
    // Cinco minutos: o encerramento é um evento raro e a resposta não muda sozinha. Consultar
    // a cada foco de janela seria uma ida ao banco por nada, em todas as telas.
    staleTime: 5 * 60_000,
    retry: false,
  });

  return data === true;
}

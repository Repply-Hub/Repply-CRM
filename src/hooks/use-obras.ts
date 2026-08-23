import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export function useObras() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['obras', profile?.id, profile?.role],
    queryFn: async () => {
      // Se for admin, não deve ver os dados das obras
      if (isAdmin) {
        return [];
      }

      // 🔴 `marcador` NUNCA leva `!inner`. A junção nomeada traz o nome e a cor junto com a
      // obra; a junção INTERNA (`!inner`) mudaria QUAIS linhas voltam, e como `marcador_id`
      // é nulável — obra sem marcador é estado válido, o marcador é opcional — a lista
      // perderia em silêncio todas as obras que ainda não foram etiquetadas. Mesmo cuidado
      // já registrado em `use-pedidos.ts`, onde `marcador_id` é nulo em 8.526 de 11.911
      // negócios.
      const { data, error } = await supabase
        .from('obras')
        .select(
          '*, latitude, longitude, geocoded_at, clientes(empresa, tipo), marcador:marcadores_obras(id, nome, cor)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

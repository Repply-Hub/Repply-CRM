import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PLANOS, type IntervaloPlano, type Plano } from '@/lib/planos';

/**
 * Catálogo de planos vindo do banco, com o conteúdo estático de `lib/planos.ts`
 * como reserva.
 *
 * A reserva importa porque a landing é pública e precisa mostrar preço mesmo se
 * a tabela ainda não existir (o deploy do front não é sincronizado com o
 * `supabase db push`) ou se a consulta falhar. Uma página de vendas sem preço é
 * pior que um preço vindo de constante.
 */
export function usePlanos() {
  const { data, isLoading } = useQuery({
    queryKey: ['planos'],
    queryFn: async (): Promise<Plano[] | null> => {
      const { data, error } = await supabase
        .from('planos')
        .select('slug, nome, descricao, preco_centavos, intervalo, beneficios, selo, visivel, ordem')
        .eq('visivel', true)
        .order('ordem');

      if (error) {
        console.warn('[planos] catálogo indisponível, usando o estático:', error.message);
        return null;
      }
      if (!data?.length) return null;

      return data.map((linha) => ({
        slug: linha.slug,
        nome: linha.nome,
        descricao: linha.descricao ?? '',
        // O banco guarda em centavos para não depender de ponto flutuante.
        preco: linha.preco_centavos / 100,
        // Só 'month' e 'year' são renderizáveis; qualquer outro valor cai em
        // 'year', que é o ciclo vigente — melhor que exibir um rótulo vazio.
        intervalo: (linha.intervalo === 'month' ? 'month' : 'year') as IntervaloPlano,
        destaque: true,
        selo: linha.selo ?? undefined,
        beneficios: Array.isArray(linha.beneficios) ? (linha.beneficios as string[]) : [],
      }));
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { planos: data ?? PLANOS, carregando: isLoading };
}

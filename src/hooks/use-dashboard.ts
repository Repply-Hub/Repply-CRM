import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFaturamentoMensal() {
  return useQuery({
    queryKey: ['vw_faturamento_mensal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_faturamento_mensal')
        .select('*')
        .order('mes', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useIndicadoresVendedor() {
  return useQuery({
    queryKey: ['vw_indicadores_usuario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_indicadores_usuario')
        .select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useVelocidadeFabricante() {
  return useQuery({
    queryKey: ['vw_velocidade_por_fabricante'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_velocidade_por_fabricante')
        .select('*');
      if (error) throw error;
      return data;
    },
  });
}

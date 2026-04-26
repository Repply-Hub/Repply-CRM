import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFaturamentoMensal(empresaId?: string) {
  return useQuery({
    queryKey: ['vw_faturamento_mensal', empresaId],
    queryFn: async () => {
      let query = supabase
        .from('vw_faturamento_mensal')
        .select('*');
      
      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }
      
      const { data, error } = await query.order('mes', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useIndicadoresVendedor(empresaId?: string) {
  return useQuery({
    queryKey: ['vw_indicadores_usuario', empresaId],
    queryFn: async () => {
      let query = supabase
        .from('vw_indicadores_usuario')
        .select('*');
      
      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useVelocidadeFabricante(empresaId?: string) {
  return useQuery({
    queryKey: ['vw_velocidade_por_fabricante', empresaId],
    queryFn: async () => {
      let query = supabase
        .from('vw_velocidade_por_fabricante')
        .select('*');
      
      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

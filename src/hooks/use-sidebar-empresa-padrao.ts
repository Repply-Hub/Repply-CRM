import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { SidebarItem } from '@/hooks/use-sidebar-preferences';

export function useSidebarEmpresaPadrao(empresaId?: string) {
  return useQuery({
    queryKey: ['sidebar-empresa-padrao', empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sidebar_empresa_padrao')
        .select('items')
        .eq('empresa_id', empresaId!)
        .maybeSingle();

      if (!data || !Array.isArray(data.items) || data.items.length === 0) return null;
      return data.items as unknown as SidebarItem[];
    },
    enabled: !!empresaId,
  });
}

export interface SidebarEmpresaPadraoHistoricoEntry {
  id: string;
  empresa_id: string;
  items: SidebarItem[];
  salvo_por: string | null;
  created_at: string;
}

export function useSidebarEmpresaPadraoHistorico(empresaId?: string) {
  return useQuery({
    queryKey: ['sidebar-empresa-padrao-historico', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sidebar_empresa_padrao_historico')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as SidebarEmpresaPadraoHistoricoEntry[];
    },
    enabled: !!empresaId,
  });
}

export function useSaveSidebarEmpresaPadrao() {
  const { user, profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: SidebarItem[]) => {
      if (!empresaId) throw new Error('Empresa não identificada');
      const { data: existing } = await supabase
        .from('sidebar_empresa_padrao')
        .select('id')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('sidebar_empresa_padrao')
          .update({ items: items as any, updated_by: user?.id, updated_at: new Date().toISOString() })
          .eq('empresa_id', empresaId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sidebar_empresa_padrao')
          .insert({ empresa_id: empresaId, items: items as any, updated_by: user?.id });
        if (error) throw error;
      }

      // Registra a versão salva no histórico (log append-only, mesma linha da mudança).
      const { error: historicoError } = await supabase
        .from('sidebar_empresa_padrao_historico')
        .insert({ empresa_id: empresaId, items: items as any, salvo_por: user?.id });
      if (historicoError) throw historicoError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar-empresa-padrao'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-empresa-padrao-historico'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Permissao {
  id: string;
  vendedor_id: string;
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
}

const MODULOS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'contatos', label: 'Contatos' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'obras', label: 'Obras' },
  { key: 'fabricantes', label: 'Fabricantes' },
  { key: 'portal', label: 'Portal' },
  { key: 'calendario', label: 'Calendário' },
  { key: 'tarefas', label: 'Tarefas' },
  { key: 'configuracoes', label: 'Configurações' },
];

export { MODULOS };

export function usePermissoes(vendedorId?: string) {
  return useQuery({
    queryKey: ['permissoes_vendedor', vendedorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes_vendedor')
        .select('*')
        .eq('vendedor_id', vendedorId!);
      if (error) throw error;
      return data as Permissao[];
    },
    enabled: !!vendedorId,
  });
}

export function useUpsertPermissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      vendedor_id: string;
      modulo: string;
      pode_ver: boolean;
      pode_criar: boolean;
      pode_editar: boolean;
      pode_excluir: boolean;
    }) => {
      const { error } = await supabase
        .from('permissoes_vendedor')
        .upsert(data, { onConflict: 'vendedor_id,modulo' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permissoes_vendedor', vars.vendedor_id] });
    },
  });
}

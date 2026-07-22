import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Funil {
  id: string;
  empresa_id: string;
  nome: string;
  is_padrao: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
}

// empresaId é opcional: sem ele, a RLS já restringe a busca aos funis da empresa do usuário
// logado (mesmo padrão de useKanbanColunas/useClientes/useFabricantes).
export function useFunis(empresaId?: string | null) {
  return useQuery<Funil[]>({
    queryKey: ['funis', empresaId ?? null],
    queryFn: async () => {
      const base = supabase.from('funis').select('*').order('ordem', { ascending: true });
      const { data, error } = await (empresaId ? base.eq('empresa_id', empresaId) : base);
      if (error) throw error;
      return (data ?? []) as Funil[];
    },
  });
}

export function useCreateFunil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.rpc('criar_funil', { p_nome: nome.trim() });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funis'] });
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Funil criado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar funil'),
  });
}

export function useRenameFunil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome: string }) => {
      const { error } = await supabase.from('funis').update({ nome: input.nome.trim() }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funis'] });
      toast.success('Funil atualizado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar funil'),
  });
}

function friendlyDeleteError(message: string): string {
  if (message.includes('foreign key constraint') || message.includes('violates foreign key')) {
    return 'Este funil ainda tem negócios vinculados. Mova ou exclua os negócios do funil antes de excluí-lo.';
  }
  if (message.includes('funil padrão') || message.includes('padrão do sistema')) {
    return message;
  }
  return message || 'Erro ao excluir funil';
}

export function useDeleteFunil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('funis').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funis'] });
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Funil excluído');
    },
    onError: (err: any) => toast.error(friendlyDeleteError(err?.message || '')),
  });
}

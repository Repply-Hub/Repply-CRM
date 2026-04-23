import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prazo_final: string | null;
  responsavel: string | null;
  criado_por: string | null;
  participantes: string | null;
  observadores: string | null;
  projeto: string | null;
  marcadores: string | null;
  usuario_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useTarefas() {
  return useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Tarefa[]) ?? [];
    },
  });
}

export function useCreateTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tarefa: Partial<Tarefa>) => {
      // Garante que o usuario_id seja o do usuário logado (exigido pela RLS)
      const { data: usuarioRow, error: usuarioErr } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (usuarioErr) throw usuarioErr;
      if (!usuarioRow?.id) throw new Error('Usuário não encontrado. Faça login novamente.');

      const payload = {
        ...tarefa,
        usuario_id: usuarioRow.id,
        criado_por: tarefa.criado_por ?? usuarioRow.nome ?? null,
      };
      const { error } = await supabase.from('tarefas' as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  });
}

export function useUpdateTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tarefa> & { id: string }) => {
      const { error } = await supabase
        .from('tarefas' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  });
}

export function useDeleteTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tarefas' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  });
}

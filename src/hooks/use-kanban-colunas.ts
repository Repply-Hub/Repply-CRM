import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface KanbanColuna {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

export const KANBAN_COR_OPCOES = [
  { value: 'kanban-new', label: 'Laranja', class: 'bg-kanban-new' },
  { value: 'kanban-budget', label: 'Amarelo', class: 'bg-kanban-budget' },
  { value: 'kanban-sent', label: 'Roxo', class: 'bg-kanban-sent' },
  { value: 'kanban-negotiation', label: 'Azul', class: 'bg-kanban-negotiation' },
  { value: 'kanban-closed', label: 'Verde', class: 'bg-kanban-closed' },
  { value: 'destructive', label: 'Vermelho', class: 'bg-destructive' },
  { value: 'muted-foreground', label: 'Cinza', class: 'bg-muted-foreground' },
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || `coluna ${Date.now()}`;
}

export function useKanbanColunas() {
  return useQuery<KanbanColuna[]>({
    queryKey: ['kanban_colunas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_colunas')
        .select('*')
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as KanbanColuna[];
    },
  });
}

export function useCreateKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor: string }) => {
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('kanban_colunas')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id);

      let baseSlug = slugify(input.nome);
      const slugs = new Set((existentes ?? []).map(e => e.slug));
      let slug = baseSlug;
      let i = 2;
      while (slugs.has(slug)) {
        slug = `${baseSlug} ${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('kanban_colunas').insert({
        empresa_id: usuario.empresa_id,
        slug,
        nome: input.nome.trim(),
        cor: input.cor,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Coluna criada');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar coluna'),
  });
}

export function useUpdateKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; cor?: string }) => {
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome.trim();
      if (input.cor !== undefined) patch.cor = input.cor;
      const { error } = await supabase.from('kanban_colunas').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Coluna atualizada');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar coluna'),
  });
}

export function useDeleteKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; slug: string; targetSlug: string }) => {
      // Move pedidos da coluna excluída para a coluna alvo
      const { error: pErr } = await supabase
        .from('pedidos')
        .update({ status: input.targetSlug })
        .eq('status', input.slug);
      if (pErr) throw pErr;
      const { error } = await supabase.from('kanban_colunas').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Coluna excluída e pedidos remanejados');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao excluir coluna'),
  });
}

export function useReorderKanbanColunas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('kanban_colunas').update({ ordem: idx }).eq('id', id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban_colunas'] }),
    onError: (err: any) => toast.error(err?.message || 'Erro ao reordenar'),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

// A lista de cargos de contato, por empresa. Substitui o array fixo `BASE_CARGOS` +
// localStorage que o CargoSelect usava. Escrita é gate de gestor pela RLS
// (migration 20260903140000) — aqui a gente só espelha na UI.

export interface CargoContato {
  id: string;
  empresa_id: string;
  nome: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

export function useCargosContato(empresaId?: string | null) {
  return useQuery<CargoContato[]>({
    queryKey: ['cargos_contato', empresaId ?? null],
    queryFn: async () => {
      const base = supabase
        .from('cargos_contato')
        .select('*')
        .order('ordem', { ascending: true });
      const { data, error } = await (empresaId ? base.eq('empresa_id', empresaId) : base);
      if (error) throw error;
      return (data ?? []) as CargoContato[];
    },
  });
}

async function minhaEmpresaId(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle();
  if (error) throw error;
  if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');
  return usuario.empresa_id;
}

export function useCriarCargoContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const empresaId = await minhaEmpresaId();
      const { data: existentes } = await supabase
        .from('cargos_contato')
        .select('nome, ordem')
        .eq('empresa_id', empresaId);

      const rows = (existentes ?? []) as { nome: string; ordem: number }[];
      const limpo = nome.trim();
      if (rows.some((r) => r.nome.toLowerCase() === limpo.toLowerCase())) {
        throw new Error('Esse cargo já existe');
      }
      const maxOrdem = rows.reduce((m, r) => Math.max(m, r.ordem), -1);
      const { error } = await supabase.from('cargos_contato').insert({
        empresa_id: empresaId,
        nome: limpo,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargos_contato'] });
      toast.success('Cargo criado');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao criar cargo')),
  });
}

export function useRenomearCargoContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome: string }) => {
      const { error } = await supabase
        .from('cargos_contato')
        .update({ nome: input.nome.trim() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargos_contato'] });
      toast.success('Cargo atualizado');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao renomear cargo')),
  });
}

export function useExcluirCargoContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // O campo `contatos.cargo` é texto livre e NÃO é tocado: quem tinha esse cargo
      // continua exibindo o texto (o CargoSelect trata valor fora da lista).
      const { error } = await supabase.from('cargos_contato').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargos_contato'] });
      toast.success('Cargo removido da lista');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao excluir cargo')),
  });
}

export function useReordenarCargosContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('cargos_contato').update({ ordem: idx }).eq('id', id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cargos_contato'] }),
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao reordenar')),
  });
}

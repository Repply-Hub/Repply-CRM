import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

// A lista de origens do negócio (campo "Origem"), por empresa. Substitui o array fixo
// `DEFAULT_ORIGENS` + `localStorage['custom_origens']` que NovoNegocioDialog / EditarPedido
// usavam. Escrita é gate de gestor pela RLS (migration 20260903150000) — aqui a gente só
// espelha na UI.
//
// `valor` é o slug gravado em `pedidos.origem_lead`. É estável: renomear a origem NÃO muda
// o `valor`, então negócio antigo continua casando.

export interface OrigemPedido {
  id: string;
  empresa_id: string;
  nome: string;
  valor: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

/** Slug para gravar em `pedidos.origem_lead`. Sem acento, só [a-z0-9_]. */
export function slugDeOrigem(nome: string): string {
  const base = nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos que o NFD separou
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `origem_${Date.now()}`;
}

export function useOrigensPedido(empresaId?: string | null) {
  return useQuery<OrigemPedido[]>({
    queryKey: ['origens_pedido', empresaId ?? null],
    queryFn: async () => {
      const base = supabase
        .from('origens_pedido')
        .select('*')
        .order('ordem', { ascending: true });
      const { data, error } = await (empresaId ? base.eq('empresa_id', empresaId) : base);
      if (error) throw error;
      return (data ?? []) as OrigemPedido[];
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

export function useCriarOrigemPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const empresaId = await minhaEmpresaId();
      const { data: existentes } = await supabase
        .from('origens_pedido')
        .select('nome, valor, ordem')
        .eq('empresa_id', empresaId);

      const rows = (existentes ?? []) as { nome: string; valor: string; ordem: number }[];
      const limpo = nome.trim();
      if (rows.some((r) => r.nome.toLowerCase() === limpo.toLowerCase())) {
        throw new Error('Essa origem já existe');
      }

      // Slug único na empresa: se colidir, vai somando sufixo (_2, _3…).
      const base = slugDeOrigem(limpo);
      let valor = base;
      let n = 2;
      while (rows.some((r) => r.valor === valor)) {
        valor = `${base}_${n}`;
        n += 1;
      }

      const maxOrdem = rows.reduce((m, r) => Math.max(m, r.ordem), -1);
      const { error } = await supabase.from('origens_pedido').insert({
        empresa_id: empresaId,
        nome: limpo,
        valor,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
      return valor;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['origens_pedido'] });
      toast.success('Origem criada');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao criar origem')),
  });
}

export function useRenomearOrigemPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome: string }) => {
      // Só o `nome` muda. O `valor` (slug) fica como está — é o que os negócios já gravaram.
      const { error } = await supabase
        .from('origens_pedido')
        .update({ nome: input.nome.trim() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['origens_pedido'] });
      toast.success('Origem atualizada');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao renomear origem')),
  });
}

export function useExcluirOrigemPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // O campo `pedidos.origem_lead` é texto e NÃO é tocado: quem tinha essa origem
      // continua exibindo o valor (o OrigemLeadSelect trata valor fora da lista).
      const { error } = await supabase.from('origens_pedido').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['origens_pedido'] });
      toast.success('Origem removida da lista');
    },
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao excluir origem')),
  });
}

export function useReordenarOrigensPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('origens_pedido').update({ ordem: idx }).eq('id', id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens_pedido'] }),
    onError: (err: unknown) => toast.error(mensagemDeErro(err, 'Erro ao reordenar')),
  });
}

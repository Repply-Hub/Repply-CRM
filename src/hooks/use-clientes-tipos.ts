import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { slugDeTipo, type TipoDeCliente } from '@/lib/tipos-de-cliente';

/**
 * Lista de tipos/segmentos de cliente da empresa. Molde: use-marcadores.ts.
 *
 * A escrita e recusada pela RLS para quem nao e gestor -- a trava da tela e so
 * cosmetica. Por isso o onError mostra a frase que o BANCO devolveu, via
 * mensagemDeErro: erro do Supabase nao e um Error, e `e instanceof Error` da falso
 * justamente para os erros que interessam.
 */
export function useClientesTipos(empresaId?: string | null) {
  return useQuery<TipoDeCliente[]>({
    queryKey: ['clientes_tipos', empresaId ?? null],
    queryFn: async () => {
      // A RLS libera "is_admin() OR empresa_id = get_my_empresa_id()": para conta
      // admin da plataforma (suporte, sem ser membro da empresa) isso devolve os
      // tipos de TODAS as empresas. O filtro aqui garante que a lista respeite o
      // empresaId pedido mesmo nesse caso.
      let query = supabase.from('clientes_tipos').select('*').order('ordem', { ascending: true });
      if (empresaId) query = query.eq('empresa_id', empresaId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TipoDeCliente[];
    },
    enabled: !!empresaId,
  });
}

export function useCriarTipoDeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string }): Promise<string> => {
      const nome = input.nome.trim();
      if (!nome) throw new Error('Informe um nome para o tipo');

      // A empresa vem do banco, nunca do estado do React: numa sessao meio
      // carregada o profile pode estar nulo e gravaria um tipo sem dono.
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Usuário sem empresa. Faça login novamente.');

      const { data: existentes, error: eErr } = await supabase
        .from('clientes_tipos')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id);
      if (eErr) throw eErr;

      const base = slugDeTipo(nome);
      if (!base) throw new Error('Nome inválido');
      const usados = new Set((existentes ?? []).map(e => e.slug));
      if (usados.has(base)) throw new Error('Esse tipo já existe');

      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('clientes_tipos').insert({
        empresa_id: usuario.empresa_id,
        slug: base,
        nome,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
      return base;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes_tipos'] });
      toast.success('Tipo criado');
    },
    onError: (err) => toast.error(mensagemDeErro(err, 'Não foi possível criar o tipo')),
  });
}

export function useExcluirTipoDeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      // So tira do dropdown. Cliente ja gravado com esse valor continua com ele e
      // segue legivel (rotuloDoTipo cai no proprio valor) e alcancavel pelo filtro
      // (opcoesDeFiltro soma os tipos em uso). Nao ha chave estrangeira para limpar.
      const { error } = await supabase.from('clientes_tipos').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes_tipos'] });
      toast.success('Tipo excluído');
    },
    onError: (err) => toast.error(mensagemDeErro(err, 'Não foi possível excluir o tipo')),
  });
}

/**
 * Renomeia um tipo -- e SO o nome.
 *
 * 🔴 O `slug` NUNCA MUDA, de proposito. `clientes.tipo` guarda o SLUG, nao o id do
 * tipo: nao ha chave estrangeira entre as duas tabelas. Se a renomeacao tambem
 * recalculasse o slug, todo cliente ja classificado continuaria gravado com o slug
 * VELHO -- que sumiria da lista -- e passaria a exibir um valor orfao (rotuloDoTipo
 * cai no proprio valor quando nao acha na lista). O gestor veria "Construtora" virar
 * "construtora" em centenas de fichas, sem erro nenhum na tela.
 *
 * E exatamente por isso que renomear e seguro e resolve o pedido do dono do produto:
 * trocar o rotulo de um tipo NAO exige excluir e reclassificar os clientes. O slug
 * segue sendo o identificador estavel; o nome e so a etiqueta que aparece.
 */
export function useRenomearTipoDeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome: string }) => {
      const nome = input.nome.trim();
      if (!nome) throw new Error('Informe um nome para o tipo');

      // Só `nome` no update. Nenhuma outra coluna entra aqui -- ver o bloco acima.
      const { error } = await supabase
        .from('clientes_tipos')
        .update({ nome })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes_tipos'] });
      toast.success('Tipo renomeado');
    },
    onError: (err) => toast.error(mensagemDeErro(err, 'Não foi possível renomear o tipo')),
  });
}

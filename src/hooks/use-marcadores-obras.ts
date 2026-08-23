import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { toast } from 'sonner';

export interface MarcadorObra {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  is_sistema: boolean;
}

/**
 * Marcadores de obra — a etiqueta livre que substituiu o "Status Inicial".
 *
 * Molde copiado de `use-marcadores.ts` (marcador de negócio), que é o padrão bom deste
 * sistema. NÃO confundir com o "marcador" de Tarefas: aquele é texto separado por vírgula
 * com as categorias no `localStorage` de cada navegador — cada pessoa vê uma lista
 * diferente e nada disso existe no banco.
 *
 * DIFERENÇA DE PROPÓSITO EM RELAÇÃO AO MOLDE: aqui a lista **nasce vazia**. Não há gatilho
 * de semeadura, por decisão do dono do produto em 23/08/2026 — cada empresa cria as suas.
 * Isso obriga a tela a tratar o caso vazio explicitamente, que é justamente o que faltava no
 * `status_obras` e o deixou intransponível: um campo obrigatório com dropdown em branco.
 */
export function useMarcadoresObras() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id;

  return useQuery({
    queryKey: ['marcadores_obras', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marcadores_obras')
        .select('*')
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as MarcadorObra[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Slug a partir do nome — copiado de `use-marcadores.ts` para os dois formatos não
 * divergirem. Mantém acento fora, corta em 40 caracteres e nunca devolve vazio.
 */
function slugificar(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function useCriarMarcadorObra() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id;

  return useMutation({
    mutationFn: async (p: { nome: string; cor: string }) => {
      if (!empresaId) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('marcadores_obras')
        .select('slug, ordem')
        .eq('empresa_id', empresaId);

      // Nome repetido NÃO é recusado: o slug ganha um número e os dois convivem, igual ao
      // marcador de negócio. Recusar seria divergir do molde por nada — o que identifica a
      // linha é o slug, e quem lê a tela lê o nome.
      const base = slugificar(p.nome) || `marcador ${existentes?.length ?? 0}`;
      const usados = new Set((existentes ?? []).map((e) => e.slug));
      let slug = base;
      let i = 2;
      while (usados.has(slug)) slug = `${base} ${i++}`;

      // Ordem pelo MÁXIMO, não pela contagem: excluir um marcador do meio deixa buraco na
      // numeração, e contar linhas devolveria uma ordem já ocupada.
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), 0);

      const { error } = await supabase.from('marcadores_obras').insert({
        empresa_id: empresaId,
        slug,
        nome: p.nome.trim(),
        cor: p.cor,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores_obras'] });
      toast.success('Marcador criado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar o marcador');
    },
  });
}

export function useAtualizarMarcadorObra() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { id: string; nome?: string; cor?: string }) => {
      const mudancas: Record<string, string> = {};
      if (p.nome !== undefined) mudancas.nome = p.nome.trim();
      if (p.cor !== undefined) mudancas.cor = p.cor;

      const { error } = await supabase
        .from('marcadores_obras')
        .update(mudancas)
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores_obras'] });
      // As obras carregam o nome e a cor do marcador por junção — sem esta invalidação, a
      // lista continua mostrando o nome antigo até a próxima recarga.
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Marcador atualizado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar o marcador');
    },
  });
}

/**
 * Exclui um marcador. As obras que o usavam ficam SEM marcador.
 *
 * Isso é do banco, não daqui: `obras.marcador_id` tem `on delete set null`. É de propósito e
 * é o mesmo comportamento do marcador de negócio — diferente da etapa do funil, que exige
 * realocação obrigatória. Marcador é opcional; obra sem marcador é um estado válido.
 */
export function useExcluirMarcadorObra() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marcadores_obras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores_obras'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Marcador excluído — as obras que o usavam ficaram sem marcador');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir o marcador');
    },
  });
}

/** Grava a ordem escolhida no arrastar-e-soltar, uma linha por vez. */
export function useReordenarMarcadoresObras() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase
          .from('marcadores_obras')
          .update({ ordem: i + 1 })
          .eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores_obras'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível reordenar');
    },
  });
}

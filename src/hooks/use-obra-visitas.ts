import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ObraVisita {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  visitaRealizada: boolean;
  visitaObservacao: string | null;
  criadoPor: string;
}

interface EventoVisitaRow {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  visita_realizada: boolean;
  visita_observacao: string | null;
  criado_por: string;
}

/**
 * Histórico de visitas de uma obra: eventos de calendário com `obra_id`
 * apontando para ela. Não é agregação (soma/contagem) — é uma lista simples
 * filtrada por `obra_id`, então uma query direta basta; não precisa da RPC
 * `SECURITY DEFINER` que `use-obra-vendas.ts` usa para números somados no
 * banco (CLAUDE.md §6.4). A visibilidade já vem certa da RLS de `eventos`:
 * toda visita é criada com `tipo_calendario = 'empresa'`, visível para
 * qualquer um da mesma empresa (ver migration `20260825170000_visitas_obra.sql`).
 */
export function useObraVisitas(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_visitas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos')
        .select('id, titulo, inicio, fim, dia_inteiro, visita_realizada, visita_observacao, criado_por')
        .eq('obra_id', obraId!)
        .order('inicio', { ascending: false });
      if (error) throw error;
      return (data as EventoVisitaRow[]).map((e) => ({
        id: e.id,
        titulo: e.titulo,
        inicio: e.inicio,
        fim: e.fim,
        diaInteiro: e.dia_inteiro,
        visitaRealizada: e.visita_realizada,
        visitaObservacao: e.visita_observacao,
        criadoPor: e.criado_por,
      })) as ObraVisita[];
    },
    enabled: !!obraId,
  });
}

/**
 * Marcar (ou desmarcar) uma visita como realizada, com observação opcional.
 * Não usa `useUpdateEvento` porque aquele hook, quando o usuário é o
 * organizador, propaga a alteração para todas as linhas do `grupo_id` — aqui
 * queremos mexer só nesta linha, sempre.
 */
export function useMarcarVisitaRealizada() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      obraId,
      realizada,
      observacao,
    }: {
      id: string;
      obraId: string;
      realizada: boolean;
      observacao?: string | null;
    }) => {
      const { error } = await supabase
        .from('eventos')
        .update({ visita_realizada: realizada, visita_observacao: observacao || null })
        .eq('id', id);
      if (error) throw error;
      return obraId;
    },
    onSuccess: (obraId) => {
      qc.invalidateQueries({ queryKey: ['obra_visitas', obraId] });
      qc.invalidateQueries({ queryKey: ['eventos'] });
    },
  });
}

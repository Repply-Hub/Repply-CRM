import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ObraVisita {
  id: string;
  grupoId: string;
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
  grupo_id: string;
  user_id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  visita_realizada: boolean;
  visita_observacao: string | null;
  criado_por: string;
}

/**
 * Cada parada da rota pode ter mais de um participante (ver
 * `useCreateRotaVisita`), o que gera uma linha por pessoa no mesmo
 * `grupo_id` — igual a um evento comum com vários participantes. Sem isso a
 * mesma visita apareceria duplicada, uma vez por participante. Fica só uma
 * linha por grupo — não importa qual das cópias, porque
 * `visita_realizada`/`visita_observacao`/horário nunca divergem entre elas
 * (todas nascem iguais em `useCreateRotaVisita`, e `useMarcarVisitaRealizada`
 * sempre atualiza o grupo inteiro de uma vez).
 */
function dedupPorGrupo<T extends { grupoId: string; id: string }>(linhas: T[]): T[] {
  const porGrupo = new Map<string, T>();
  for (const linha of linhas) {
    const atual = porGrupo.get(linha.grupoId);
    if (!atual) {
      porGrupo.set(linha.grupoId, linha);
    }
  }
  return Array.from(porGrupo.values());
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
        .select('id, grupo_id, user_id, titulo, inicio, fim, dia_inteiro, visita_realizada, visita_observacao, criado_por')
        .eq('obra_id', obraId!)
        .order('inicio', { ascending: false });
      if (error) throw error;
      const linhas = (data as EventoVisitaRow[]).map((e) => ({
        id: e.id,
        grupoId: e.grupo_id,
        titulo: e.titulo,
        inicio: e.inicio,
        fim: e.fim,
        diaInteiro: e.dia_inteiro,
        visitaRealizada: e.visita_realizada,
        visitaObservacao: e.visita_observacao,
        criadoPor: e.criado_por,
      })) as ObraVisita[];
      return dedupPorGrupo(linhas);
    },
    enabled: !!obraId,
  });
}

export interface VisitaObraListagem extends ObraVisita {
  obraId: string;
  nomeObra: string;
  clienteEmpresa: string | null;
}

interface EventoVisitaComObraRow extends EventoVisitaRow {
  obra_id: string;
  obras: { nome_obra: string | null; clientes: { empresa: string | null } | null } | null;
}

/**
 * Todas as visitas (planejadas ou realizadas) de todas as obras da empresa —
 * usado na aba "Visitas" da tela de Obras. Mesma base de `useObraVisitas`,
 * sem o filtro por `obra_id`; a RLS de `eventos` já limita à empresa de quem
 * está logado.
 */
export function useTodasVisitasObras() {
  return useQuery({
    queryKey: ['obra_visitas_todas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos')
        .select(
          'id, grupo_id, user_id, titulo, inicio, fim, dia_inteiro, visita_realizada, visita_observacao, criado_por, obra_id, obras(nome_obra, clientes(empresa))',
        )
        .not('obra_id', 'is', null)
        .order('inicio', { ascending: false });
      if (error) throw error;
      const linhas = (data as unknown as EventoVisitaComObraRow[]).map((e) => ({
        id: e.id,
        grupoId: e.grupo_id,
        titulo: e.titulo,
        inicio: e.inicio,
        fim: e.fim,
        diaInteiro: e.dia_inteiro,
        visitaRealizada: e.visita_realizada,
        visitaObservacao: e.visita_observacao,
        criadoPor: e.criado_por,
        obraId: e.obra_id,
        nomeObra: e.obras?.nome_obra || 'Obra sem nome',
        clienteEmpresa: e.obras?.clientes?.empresa ?? null,
      })) as VisitaObraListagem[];
      return dedupPorGrupo(linhas);
    },
  });
}

/**
 * Marcar (ou desmarcar) uma visita como realizada, com observação opcional.
 * Atualiza o `grupo_id` inteiro (todas as cópias por participante) — uma
 * visita com 3 participantes tem que virar "realizada" para os 3 ao mesmo
 * tempo, não só para a linha que a busca trouxe primeiro.
 */
export function useMarcarVisitaRealizada() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      grupoId,
      obraId,
      realizada,
      observacao,
    }: {
      grupoId: string;
      obraId: string;
      realizada: boolean;
      observacao?: string | null;
    }) => {
      const { error } = await supabase
        .from('eventos')
        .update({ visita_realizada: realizada, visita_observacao: observacao || null })
        .eq('grupo_id', grupoId);
      if (error) throw error;
      return obraId;
    },
    onSuccess: (obraId) => {
      qc.invalidateQueries({ queryKey: ['obra_visitas', obraId] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
      qc.invalidateQueries({ queryKey: ['eventos'] });
    },
  });
}

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import type { CalendarEvent, CalendarType, EventoForm } from '@/components/calendar/types';

// Estrutura local para mapear a row do banco
interface EventoRow {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  tipo_calendario: string;
  cor: string;
  lembrete_minutos: number | null;
  grupo_id: string;
  criado_por: string;
  updated_at?: string;
}

// Tipagem local para as queries de calendário
interface PedidoCalendario {
  id: string;
  status: string;
  prazo_resposta: string | null;
  valor_total: number | null;
  clientes: { empresa: string } | null;
  fabricantes: { nome: string } | null;
}

interface ContatoCalendario {
  id: string;
  tipo: string;
  descricao: string | null;
  proximo_contato_em: string | null;
  pedidos: { clientes: { empresa: string } | null } | null;
}

// --- Queries ---

export function useCalendarEvents(visibleCalendars: Set<CalendarType>) {
  const { user } = useAuth();

  const { data: eventos } = useQuery({
    queryKey: ['eventos', user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      const allEvents: EventoRow[] = [];

      while (hasMore) {
        const { data, error } = await supabase
          .from('eventos')
          .select('*')
          .eq('user_id', user!.id)
          .order('inicio')
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('[useCalendarEvents] erro ao buscar eventos:', error);
          throw error;
        }

        const batch = (data as EventoRow[] | null) ?? [];
        allEvents.push(...batch);
        hasMore = batch.length === pageSize;
        from += pageSize;
      }

      return allEvents;
    },
  });

  const { data: pedidos } = useQuery({
    queryKey: ['pedidos-calendario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, status, prazo_resposta, valor_total, clientes(empresa), fabricantes(nome)')
        .not('prazo_resposta', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: contatos } = useQuery({
    queryKey: ['contatos-calendario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_contatos')
        .select('id, tipo, descricao, proximo_contato_em, pedidos(clientes(empresa))')
        .not('proximo_contato_em', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    // Eventos manuais
    eventos?.forEach((e) => {
      if (visibleCalendars.has(e.tipo_calendario as CalendarType)) {
        result.push({
          id: e.id,
          titulo: e.titulo,
          descricao: e.descricao,
          inicio: new Date(e.inicio),
          fim: new Date(e.fim),
          diaInteiro: e.dia_inteiro,
          tipoCalendario: e.tipo_calendario as CalendarType,
          cor: e.cor,
          editavel: true,
          lembreteMinutos: e.lembrete_minutos,
          grupoId: e.grupo_id,
          criadoPor: e.criado_por,
        });
      }
    });

    // Prazos de pedidos (somente se "pessoal" visível)
    if (visibleCalendars.has('pessoal')) {
      (pedidos as unknown as PedidoCalendario[])?.forEach((p) => {
        if (!p.prazo_resposta) return;
        const date = new Date(p.prazo_resposta);
        result.push({
          id: `prazo-${p.id}`,
          titulo: `Prazo: ${p.clientes?.empresa || 'Cliente'}`,
          descricao: `${p.fabricantes?.nome || ''} — ${p.status}`,
          inicio: date,
          fim: new Date(date.getTime() + 60 * 60 * 1000),
          diaInteiro: true,
          tipoCalendario: 'pessoal',
          cor: '#f97316',
          editavel: false,
        });
      });

      // Próximos contatos
      (contatos as unknown as ContatoCalendario[])?.forEach((c) => {
        if (!c.proximo_contato_em) return;
        const start = new Date(c.proximo_contato_em);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        result.push({
          id: `contato-${c.id}`,
          titulo: `Contato: ${c.pedidos?.clientes?.empresa || 'Cliente'}`,
          descricao: c.descricao || c.tipo,
          inicio: start,
          fim: end,
          diaInteiro: false,
          tipoCalendario: 'pessoal',
          cor: '#6b7280',
          editavel: false,
        });
      });
    }

    return result;
  }, [eventos, pedidos, contatos, visibleCalendars]);

  return events;
}

// Ids dos participantes (linhas-irmãs) de um evento, para popular o campo
// "Participantes" ao abrir a edição de um evento já cadastrado.
export function useEventoParticipantes(grupoId: string | null | undefined) {
  return useQuery({
    queryKey: ['evento-participantes', grupoId],
    enabled: !!grupoId,
    // Evita refetch automático (ex.: foco de janela) enquanto o diálogo de
    // edição está aberto, o que sobrescreveria seleções feitas pelo usuário
    // antes de salvar. A invalidação explícita em useUpdateEvento cobre a
    // única mudança real dessa lista.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos')
        .select('user_id')
        .eq('grupo_id', grupoId!);
      if (error) throw error;
      return (data as { user_id: string }[]).map((r) => r.user_id);
    },
  });
}

// --- Mutations ---

export function useCreateEvento() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (form: EventoForm) => {
      const inicio = form.diaInteiro
        ? new Date(form.inicio + 'T00:00:00').toISOString()
        : new Date(form.inicio).toISOString();
      const fim = form.diaInteiro
        ? new Date(form.fim + 'T23:59:59').toISOString()
        : new Date(form.fim).toISOString();

      // Cria uma linha por participante selecionado no formulário (o próprio
      // usuário pode se incluir ou se remover explicitamente). Se ninguém
      // ficar selecionado, cai de volta para o criador, evitando um evento
      // órfão que não aparece em calendário nenhum. Todas as linhas
      // compartilham o mesmo grupo_id, o que permite editar os participantes
      // depois — quem cria é registrado em criado_por e é quem poderá
      // gerenciar o grupo na edição.
      const selecionados = form.participantes ?? [];
      const targets = new Set<string>(selecionados.length > 0 ? selecionados : [user!.id]);
      const grupoId = crypto.randomUUID();

      const rows = Array.from(targets).map((uid) => ({
        user_id: uid,
        grupo_id: grupoId,
        criado_por: user!.id,
        titulo: form.titulo,
        descricao: form.descricao || null,
        inicio,
        fim,
        dia_inteiro: form.diaInteiro,
        tipo_calendario: form.tipoCalendario,
        cor: form.cor,
        lembrete_minutos: form.lembreteMinutos,
      }));

      const { error } = await supabase.from('eventos').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

export function useBulkCreateEventos() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (forms: EventoForm[]) => {
      const rows = forms.map((form) => ({
        user_id: user!.id,
        titulo: form.titulo,
        descricao: form.descricao || null,
        inicio: form.diaInteiro
          ? new Date(form.inicio + 'T00:00:00').toISOString()
          : new Date(form.inicio).toISOString(),
        fim: form.diaInteiro
          ? new Date(form.fim + 'T23:59:59').toISOString()
          : new Date(form.fim).toISOString(),
        dia_inteiro: form.diaInteiro,
        tipo_calendario: form.tipoCalendario,
        cor: form.cor,
        lembrete_minutos: form.lembreteMinutos,
      }));

      // Insere em lotes de 500 para evitar limites do PostgREST
      const CHUNK = 500;
      let totalInserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data: inserted, error } = await supabase
          .from('eventos')
          .insert(rows.slice(i, i + CHUNK))
          .select('id');
        if (error) throw error;
        totalInserted += (inserted as { id: string }[] | null)?.length ?? 0;
      }
      return totalInserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.refetchQueries({ queryKey: ['eventos'], type: 'active' });
    },
  });
}

export function useUpdateEvento() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      form,
      grupoId,
      criadoPor,
    }: {
      id: string;
      form: EventoForm;
      grupoId?: string;
      criadoPor?: string;
    }) => {
      const inicio = form.diaInteiro
        ? new Date(form.inicio + 'T00:00:00').toISOString()
        : new Date(form.inicio).toISOString();
      const fim = form.diaInteiro
        ? new Date(form.fim + 'T23:59:59').toISOString()
        : new Date(form.fim).toISOString();

      const campos = {
        titulo: form.titulo,
        descricao: form.descricao || null,
        inicio,
        fim,
        dia_inteiro: form.diaInteiro,
        tipo_calendario: form.tipoCalendario,
        cor: form.cor,
        lembrete_minutos: form.lembreteMinutos,
        updated_at: new Date().toISOString(),
      };

      const souOrganizador = !!grupoId && criadoPor === user!.id;

      if (!souOrganizador) {
        // Participante comum: só pode alterar a própria cópia do evento.
        const { error } = await supabase.from('eventos').update(campos).eq('id', id);
        if (error) throw error;
        return;
      }

      // Organizador: propaga os campos comuns para todas as linhas do grupo
      // e reconcilia os participantes (adiciona/remove linhas).
      const { data: existentes, error: fetchError } = await supabase
        .from('eventos')
        .select('user_id')
        .eq('grupo_id', grupoId!);
      if (fetchError) throw fetchError;

      const existentesIds = new Set((existentes as { user_id: string }[]).map((r) => r.user_id));
      const selecionados = form.participantes ?? [];
      const alvo = new Set<string>(selecionados.length > 0 ? selecionados : [criadoPor!]);

      const { error: updateError } = await supabase.from('eventos').update(campos).eq('grupo_id', grupoId!);
      if (updateError) throw updateError;

      const remover = [...existentesIds].filter((uid) => !alvo.has(uid));
      if (remover.length > 0) {
        const { error: delError } = await supabase
          .from('eventos')
          .delete()
          .eq('grupo_id', grupoId!)
          .in('user_id', remover);
        if (delError) throw delError;
      }

      const adicionar = [...alvo].filter((uid) => !existentesIds.has(uid));
      if (adicionar.length > 0) {
        const rows = adicionar.map((uid) => ({
          user_id: uid,
          grupo_id: grupoId!,
          criado_por: criadoPor!,
          ...campos,
        }));
        const { error: insError } = await supabase.from('eventos').insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['evento-participantes'] });
    },
  });
}

export function useDeleteEvento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('eventos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

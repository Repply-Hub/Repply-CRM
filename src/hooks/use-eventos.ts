import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import type { CalendarEvent, CalendarType, EventoForm } from '@/components/calendar/types';

// --- Queries ---

export function useCalendarEvents(visibleCalendars: Set<CalendarType>) {
  const { user } = useAuth();

  const { data: eventos } = useQuery({
    queryKey: ['eventos'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos' as any)
        .select('*')
        .order('inicio');
      if (error) throw error;
      return data as any[];
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
        });
      }
    });

    // Prazos de pedidos (somente se "pessoal" visível)
    if (visibleCalendars.has('pessoal')) {
      pedidos?.forEach((p: any) => {
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
      contatos?.forEach((c: any) => {
        if (!c.proximo_contato_em) return;
        const start = new Date(c.proximo_contato_em);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        result.push({
          id: `contato-${c.id}`,
          titulo: `Contato: ${(c as any).pedidos?.clientes?.empresa || 'Cliente'}`,
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

      const { error } = await supabase.from('eventos' as any).insert({
        user_id: user!.id,
        titulo: form.titulo,
        descricao: form.descricao || null,
        inicio,
        fim,
        dia_inteiro: form.diaInteiro,
        tipo_calendario: form.tipoCalendario,
        cor: form.cor,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

export function useUpdateEvento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, form }: { id: string; form: EventoForm }) => {
      const inicio = form.diaInteiro
        ? new Date(form.inicio + 'T00:00:00').toISOString()
        : new Date(form.inicio).toISOString();
      const fim = form.diaInteiro
        ? new Date(form.fim + 'T23:59:59').toISOString()
        : new Date(form.fim).toISOString();

      const { error } = await supabase
        .from('eventos' as any)
        .update({
          titulo: form.titulo,
          descricao: form.descricao || null,
          inicio,
          fim,
          dia_inteiro: form.diaInteiro,
          tipo_calendario: form.tipoCalendario,
          cor: form.cor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

export function useDeleteEvento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('eventos' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DiferencaDaRota } from '@/lib/rota-em-edicao';
import type { PeriodoDoCalendario } from '@/lib/periodo-do-calendario';
import { useAuth } from './use-auth';
import type { CalendarEvent, CalendarType, EventoForm } from '@/components/calendar/types';
import { CALENDAR_COLORS } from '@/components/calendar/types';

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
  obra_id: string | null;
  visita_realizada: boolean;
  visita_observacao: string | null;
  obras: { nome_obra: string | null } | null;
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

/**
 * 🔴 O PERÍODO NÃO É OPCIONAL, e a razão está medida.
 *
 * Até 27/08/2026 as duas consultas de baixo buscavam a base inteira, sem recorte e sem
 * limite. Em produção: 11.906 negócios com data de fechamento, contra o teto de mil linhas do
 * PostgREST — o calendário mostrava **um em cada doze prazos, em silêncio**, e sem `order` as
 * mil nem eram as mais recentes.
 *
 * Era também a causa de "não dá para rolar": cada prazo vira um item na faixa de dia inteiro,
 * que não tem teto de altura. O pior dia da base (31/07/2024) tem 458 prazos — uma faixa de
 * uns 7.800px, que esmaga a grade de horas até não sobrar o que rolar.
 */
export function useCalendarEvents(visibleCalendars: Set<CalendarType>, periodo: PeriodoDoCalendario) {
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

      // Eventos "empresa" devem aparecer para todo mundo da empresa, mesmo sem
      // estar marcado como participante — "responsáveis" é só informativo, não
      // controle de acesso (a RLS libera o SELECT nesse caso; ver migration
      // 20260806110000). Eventos "pessoal" continuam restritos a quem é
      // participante (linha própria).
      while (hasMore) {
        const { data, error } = await supabase
          .from('eventos')
          .select('*, obras(nome_obra)')
          .or(`user_id.eq.${user!.id},tipo_calendario.eq.empresa`)
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

      // Eventos "empresa" com vários participantes geram uma linha por pessoa
      // (mesmo grupo_id) — sem isso o mesmo evento apareceria duplicado no
      // calendário, uma vez por responsável. Mantém 1 linha por grupo,
      // preferindo a própria cópia do usuário (para refletir seu lembrete e
      // permissão de edição) quando ele for um dos participantes.
      const porGrupo = new Map<string, EventoRow>();
      for (const row of allEvents) {
        const chave = row.grupo_id ?? row.id;
        const atual = porGrupo.get(chave);
        if (!atual || row.user_id === user!.id) {
          porGrupo.set(chave, row);
        }
      }

      return Array.from(porGrupo.values());
    },
  });

  const { data: pedidos } = useQuery({
    // O período entra na CHAVE: sem isso, navegar de agosto para setembro reaproveitaria o
    // resultado de agosto e a tela mostraria o mês errado.
    queryKey: ['pedidos-calendario', periodo.deTexto, periodo.ateTexto],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, status, prazo_resposta, valor_total, clientes(empresa), fabricantes(nome)')
        .not('prazo_resposta', 'is', null)
        .gte('prazo_resposta', periodo.deTexto)
        .lte('prazo_resposta', periodo.ateTexto);
      if (error) throw error;
      return data;
    },
  });

  const { data: contatos } = useQuery({
    queryKey: ['contatos-calendario', periodo.deTexto, periodo.ateTexto],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_contatos')
        .select('id, tipo, descricao, proximo_contato_em, pedidos(clientes(empresa))')
        .not('proximo_contato_em', 'is', null)
        .gte('proximo_contato_em', periodo.deTexto)
        .lte('proximo_contato_em', periodo.ateTexto);
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
          // Quem só está vendo um evento "empresa" por transparência (não é
          // participante nem organizador) pode abrir e ler, mas não salvar —
          // a RLS de update/delete já exige user_id/criado_por = auth.uid(),
          // então isso só evita chamadas que a policy rejeitaria de qualquer forma.
          podeEditar: e.user_id === user!.id || e.criado_por === user!.id,
          lembreteMinutos: e.lembrete_minutos,
          grupoId: e.grupo_id,
          criadoPor: e.criado_por,
          obraId: e.obra_id,
          obraNome: e.obras?.nome_obra ?? null,
          visitaRealizada: e.visita_realizada,
          visitaObservacao: e.visita_observacao,
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
  }, [eventos, pedidos, contatos, visibleCalendars, user]);

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
        obra_id: form.obraId || null,
        visita_realizada: form.visitaRealizada ?? false,
        visita_observacao: form.visitaObservacao || null,
      }));

      const { error } = await supabase.from('eventos').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

export interface ParadaRotaVisita {
  obraId: string;
  nomeObra: string;
  observacao?: string;
  horario: string; // HH:mm — cada parada tem seu próprio horário, editado à mão
}

export interface ConflitoVisita {
  userId: string;
  obraNome: string;
  inicio: string; // ISO
  fim: string; // ISO
}

/**
 * Verifica, ANTES de criar/editar uma visita, se algum dos participantes já
 * tem outra visita (a qualquer obra) que colide de horário. Não bloqueia —
 * quem chama decide se avisa e deixa confirmar mesmo assim.
 *
 * A busca no banco recorta só pelo intervalo [menor início, maior fim] entre
 * todas as janelas pedidas (mais largo que cada parada isolada), e o filtro
 * fino — cada janela contra cada linha — é feito aqui, porque paradas de uma
 * mesma rota costumam ter horários bem espaçados dentro do dia e não faz
 * sentido barrar por uma colisão em outra parada que nem se sobrepõe.
 */
export async function buscarConflitosDeVisita({
  participantes,
  janelas,
  excluirGrupoId,
}: {
  participantes: string[];
  janelas: { inicio: string; fim: string }[]; // ISO
  /** Ao editar uma visita existente, não conflitar com ela mesma. */
  excluirGrupoId?: string;
}): Promise<ConflitoVisita[]> {
  if (participantes.length === 0 || janelas.length === 0) return [];

  const inicioMin = janelas.reduce((min, j) => (j.inicio < min ? j.inicio : min), janelas[0].inicio);
  const fimMax = janelas.reduce((max, j) => (j.fim > max ? j.fim : max), janelas[0].fim);

  let query = supabase
    .from('eventos')
    .select('user_id, grupo_id, inicio, fim, obras(nome_obra)')
    .not('obra_id', 'is', null)
    .in('user_id', participantes)
    .lt('inicio', fimMax)
    .gt('fim', inicioMin);

  if (excluirGrupoId) {
    query = query.neq('grupo_id', excluirGrupoId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const linhas = (data ?? []) as unknown as {
    user_id: string;
    grupo_id: string;
    inicio: string;
    fim: string;
    obras: { nome_obra: string | null } | null;
  }[];

  return linhas
    .filter((linha) => janelas.some((j) => linha.inicio < j.fim && linha.fim > j.inicio))
    .map((linha) => ({
      userId: linha.user_id,
      obraNome: linha.obras?.nome_obra || 'obra sem nome',
      inicio: linha.inicio,
      fim: linha.fim,
    }));
}

// Cria uma "rota de visita": um evento de calendário por obra selecionada,
// todos do tipo 'empresa' (visita nunca é pessoal — decisão de produto de
// 25/08/2026) e ligados à obra via obra_id. Cada parada recebe seu próprio
// grupo_id (não um grupo_id compartilhado pela rota inteira): se todas as
// paradas dividissem o mesmo grupo_id, editar uma delas depois via
// useUpdateEvento propagaria data/horário/observação para as outras, porque
// esse hook trata "mesmo grupo_id" como "mesmo evento com vários
// participantes" e sincroniza o grupo inteiro. A rota é só uma conveniência
// de criação em lote — cada parada segue independente depois de criada.
export function useCreateRotaVisita() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      duracaoMinutos = 60,
      paradas,
      jaRealizada,
      participantes,
    }: {
      data: string; // yyyy-MM-dd
      duracaoMinutos?: number;
      paradas: ParadaRotaVisita[];
      jaRealizada: boolean;
      /** user_ids (auth) que vão participar de TODAS as paradas da rota. Vazio cai para o próprio criador. */
      participantes?: string[];
    }) => {
      if (paradas.length === 0) {
        throw new Error('Selecione ao menos uma obra para a rota de visita.');
      }

      // Mesma lógica de `useCreateEvento`: uma linha por participante,
      // compartilhando o grupo_id — mas aqui o grupo_id é por PARADA, não da
      // rota inteira (ver comentário acima da função).
      const alvos = new Set<string>(
        participantes && participantes.length > 0 ? participantes : [user!.id],
      );

      const rows = paradas.flatMap((parada) => {
        const inicio = new Date(`${data}T${parada.horario}:00`);
        const fim = new Date(inicio.getTime() + duracaoMinutos * 60 * 1000);
        const grupoId = crypto.randomUUID();
        return Array.from(alvos).map((uid) => ({
          user_id: uid,
          grupo_id: grupoId,
          criado_por: user!.id,
          titulo: `Visita: ${parada.nomeObra}`,
          descricao: null,
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          dia_inteiro: false,
          tipo_calendario: 'empresa',
          cor: CALENDAR_COLORS.empresa,
          lembrete_minutos: null,
          obra_id: parada.obraId,
          visita_realizada: jaRealizada,
          visita_observacao: parada.observacao || null,
        }));
      });

      const { error } = await supabase.from('eventos').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
    },
  });
}

/**
 * Editar uma rota de visita já criada.
 *
 * 🔴 NÃO APAGA E RECRIA. O caminho curto — limpar a rota e gravar de novo — perderia
 * `visita_realizada` e `visita_observacao` de toda parada que já tinha sido visitada. Essa
 * observação é escrita NO CAMPO, depois da visita ("cliente pediu orçamento de porcelanato"), e
 * é a única coisa aqui que é trabalho e não agendamento. Alguém corrigir o horário de UMA parada
 * e apagar em silêncio a anotação de OUTRA é o tipo de perda que só se descobre semanas depois.
 *
 * Por isso a edição é uma DIFERENÇA (`src/lib/rota-em-edicao.ts`): quem continua é ALTERADO —
 * e a alteração toca só `inicio` e `fim` —, quem saiu é removido, quem chegou é inserido.
 *
 * 🔴 A ORDEM É INSERIR → ALTERAR → REMOVER, e não é arbitrária. O cliente do Supabase não abre
 * transação: são três idas ao banco, e uma pode falhar no meio. Removendo por ÚLTIMO, uma falha
 * deixa paradas A MAIS — visíveis na tela, e a pessoa apaga. Na ordem inversa, a mesma falha
 * deixaria paradas A MENOS, ou seja apagaria compromisso sem colocar o substituto. Sobrar é
 * conserto de um clique; faltar é perda silenciosa.
 *
 * (O certo mesmo seria uma função de banco fazendo as três numa transação só. Fica anotado: é
 * mudança de banco, e mudança de banco passa pelo Lucas.)
 */
export function useEditarRotaDeVisita() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      diferenca,
      participantes,
      nomeDaObraPorId,
    }: {
      diferenca: DiferencaDaRota;
      /** user_ids (auth) das paradas NOVAS. Vazio cai para o próprio criador. */
      participantes?: string[];
      /** Para montar o título das paradas novas ("Visita: <obra>"). */
      nomeDaObraPorId: (obraId: string) => string;
    }) => {
      if (diferenca.semMudanca) return { mudou: false as const };

      const alvos = new Set<string>(
        participantes && participantes.length > 0 ? participantes : [user!.id],
      );

      // ── 1. INSERIR ────────────────────────────────────────────────────────
      if (diferenca.inserir.length > 0) {
        const linhas = diferenca.inserir.flatMap((nova) => {
          const grupoId = crypto.randomUUID();
          return Array.from(alvos).map((uid) => ({
            user_id: uid,
            grupo_id: grupoId,
            criado_por: user!.id,
            titulo: `Visita: ${nomeDaObraPorId(nova.obraId)}`,
            descricao: null,
            inicio: nova.inicio.toISOString(),
            fim: nova.fim.toISOString(),
            dia_inteiro: false,
            tipo_calendario: 'empresa',
            cor: CALENDAR_COLORS.empresa,
            lembrete_minutos: null,
            obra_id: nova.obraId,
            // Parada nova nasce não realizada. Marcar como feita é gesto separado, na lista.
            visita_realizada: false,
            visita_observacao: null,
          }));
        });
        const { error } = await supabase.from('eventos').insert(linhas);
        if (error) throw error;
      }

      // ── 2. ALTERAR ────────────────────────────────────────────────────────
      //
      // 🔴 SÓ `inicio` e `fim`. `visita_realizada` e `visita_observacao` não aparecem aqui de
      // propósito: a preservação acontece por NÃO tocar nesses campos. Se um dia alguém
      // acrescentar um deles neste update "para deixar consistente", apaga a anotação de campo
      // de toda parada já visitada, e nada na tela vai indicar isso.
      for (const parada of diferenca.alterar) {
        const { error } = await supabase
          .from('eventos')
          .update({ inicio: parada.inicio.toISOString(), fim: parada.fim.toISOString() })
          // Por GRUPO: uma parada com participantes é uma linha por pessoa, e mudar só uma
          // deixaria os colegas com o horário velho.
          .eq('grupo_id', parada.grupoId);
        if (error) throw error;
      }

      // ── 3. REMOVER ────────────────────────────────────────────────────────
      if (diferenca.remover.length > 0) {
        const { error } = await supabase
          .from('eventos')
          .delete()
          .in('grupo_id', diferenca.remover);
        if (error) throw error;
      }

      return {
        mudou: true as const,
        inseridas: diferenca.inserir.length,
        alteradas: diferenca.alterar.length,
        removidas: diferenca.remover.length,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
    },
  });
}

export function useBulkCreateEventos() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (forms: EventoForm[]) => {
      const rows = forms.map((form) => ({
        user_id: user!.id,
        // `eventos.criado_por` é NOT NULL sem valor padrão, e nada no banco o
        // preenche sozinho. Sem esta linha o banco recusava o lote inteiro com
        // 23502 (not-null violation) e a importação de calendário NUNCA gravou
        // um evento sequer. O cadastro avulso (useCreateEvento) já fazia certo;
        // este caminho ficou para trás quando a coluna foi criada.
        criado_por: user!.id,
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
        visita_realizada: form.visitaRealizada ?? false,
        visita_observacao: form.visitaObservacao || null,
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

/**
 * Excluir um compromisso.
 *
 * 🔴 UM COMPROMISSO PODE SER VÁRIAS LINHAS. Quando há participantes, existe uma linha por
 * pessoa, todas com o mesmo `grupo_id` — todo o resto deste arquivo já opera por grupo
 * (`:237`, `:538`, `:545`, `:553`). Só a exclusão apagava pelo `id`, ou seja UMA cópia.
 *
 * Medido na base em 27/08/2026: 251 linhas para 160 compromissos de verdade; **17 têm mais de
 * uma cópia, e o maior tem 11**. Quem organizava esse compromisso de 11 pessoas clicava em
 * excluir, ele sumia da agenda dela — e as outras 10 continuavam com ele marcado. Iam à reunião
 * cancelada, sem nada em lugar nenhum indicando o que houve.
 *
 * A regra agora distingue os dois gestos, que são coisas diferentes:
 *
 *   QUEM ORGANIZOU  -> cancela para TODO MUNDO (apaga o grupo).
 *   QUEM PARTICIPA  -> sai do compromisso (apaga só a própria linha), e ele continua de pé
 *                      para os demais.
 *
 * A RLS já sustenta exatamente isso — `user_id = auth.uid() OR criado_por = auth.uid()` —, então
 * a decisão daqui é sobre o que a pessoa QUIS fazer, não sobre o que ela PODE fazer. Sem essa
 * distinção, a exclusão de um participante apagaria a reunião da empresa inteira.
 */
export function useDeleteEvento() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (alvo: string | { id: string; grupoId?: string | null; criadoPor?: string | null }) => {
      // Assinatura antiga (só o id) continua aceita: apaga a linha, como sempre fez.
      const evento = typeof alvo === 'string' ? { id: alvo } : alvo;
      const organizou = !!evento.criadoPor && evento.criadoPor === user?.id;

      const consulta = organizou && evento.grupoId
        ? supabase.from('eventos').delete().eq('grupo_id', evento.grupoId)
        : supabase.from('eventos').delete().eq('id', evento.id);

      const { error } = await consulta;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
    },
  });
}

/**
 * Excluir uma ROTA DE VISITA inteira — todas as paradas do dia.
 *
 * 🔴 ISSO JÁ TIRA DO CALENDÁRIO, e não por acaso: a visita de obra E o compromisso do
 * calendário são A MESMA LINHA da tabela `eventos` (uma visita é um evento com `obra_id`
 * preenchido). Não existe uma segunda gravação a limpar — apagar aqui é apagar lá.
 *
 * Recebe os `grupo_id` das paradas porque não existe tabela de rota: a rota é o conjunto de
 * paradas do mesmo dia da mesma pessoa (ver `src/lib/rota-do-dia.ts`).
 *
 * 🔴 CONFERE O QUE FOI DE FATO APAGADO. A RLS permite apagar onde `user_id = auth.uid() OR
 * criado_por = auth.uid()`: quem NÃO organizou a rota consegue apagar só as próprias linhas, e
 * o `delete` volta SEM ERRO tendo removido menos do que devia — a tela diria "rota excluída" e
 * metade dela continuaria na agenda dos colegas. Por isso o `select()` e a contagem.
 */
export function useExcluirRotaDeVisita() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoIds }: { grupoIds: string[] }) => {
      if (!grupoIds.length) throw new Error('Nenhuma parada para excluir.');

      const { data, error } = await supabase
        .from('eventos')
        .delete()
        .in('grupo_id', grupoIds)
        .select('grupo_id');
      if (error) throw error;

      const apagados = new Set((data ?? []).map((linha) => linha.grupo_id));
      const faltaram = grupoIds.filter((g) => !apagados.has(g));
      if (faltaram.length > 0) {
        throw new Error(
          faltaram.length === grupoIds.length
            ? 'Você não pode excluir esta rota — ela foi criada por outra pessoa.'
            : `Só parte da rota foi excluída: ${faltaram.length} de ${grupoIds.length} paradas não saíram, porque foram criadas por outra pessoa.`,
        );
      }

      return { paradas: grupoIds.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas'] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
    },
  });
}

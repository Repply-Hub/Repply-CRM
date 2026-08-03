import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';

const MENSAGEM_TOAST_MAX_CHARS = 100;

// WhatsApp/uazapi às vezes usa o JID de celulares BR sem o 9º dígito (número antigo).
// Normaliza para o formato canônico (55 + DDD + 9 + número), igual ao whatsapp-webhook,
// para casar com conversas já existentes do mesmo contato e evitar duplicidade.
function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

export interface WaResponsavel {
  id: string;
  nome: string;
  avatar_url: string | null;
}

export interface WaConversa {
  id: string;
  empresa_id: string;
  telefone: string;
  nome_contato: string | null;
  cliente_id: string | null;
  contato_id: string | null;
  foto_perfil_url: string | null;
  foto_perfil_expires_at: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  nao_lidas: number;
  // Marcação manual de "não lida" via menu "..." — sobrepõe a supressão automática
  // do estado "não lida" em conversas já atribuídas (ver `conversaNaoLida` em
  // WhatsAppInbox.tsx).
  nao_lidas_forcada: boolean;
  arquivada: boolean;
  is_group: boolean;
  participantes: { nome: string | null; telefone: string }[];
  created_at: string;
  updated_at: string;
  instancia_id: string | null;
  responsaveis?: WaResponsavel[];
}

function compareConversas(a: WaConversa, b: WaConversa): number {
  const ta = a.ultima_mensagem_at ?? a.created_at;
  const tb = b.ultima_mensagem_at ?? b.created_at;
  return tb.localeCompare(ta);
}

export interface WaReacao {
  emoji: string;
  autor: string; // telefone do contato, ou "eu" para reações da própria instância
  nome: string;
  at: string;
}

export interface WaMensagem {
  id: string;
  conversa_id: string;
  empresa_id: string;
  direcao: 'entrada' | 'saida';
  conteudo: string;
  tipo: string;
  media_url: string | null;
  media_mime: string | null;
  wamid: string | null;
  status: string;
  usuario_id: string | null;
  lida: boolean;
  created_at: string;
  // Nota de sistema (ex: "Fulano assumiu esta conversa") — nunca enviada ao
  // WhatsApp, renderizada como chip central em vez de bolha de mensagem.
  is_nota_interna?: boolean;
  // Notas fixadas aparecem numa faixa fixa no topo do chat, além da posição
  // cronológica normal — só tem efeito quando is_nota_interna também é true.
  fixada?: boolean;
  // Preenchido só em mensagens de entrada vindas de grupo — quem enviou dentro do grupo
  // (o nome/telefone da conversa em si é o do grupo, não de um participante específico).
  remetente_nome?: string | null;
  remetente_telefone?: string | null;
  // Snapshot da mensagem citada (reply) — guardado por valor em vez de referenciar o
  // id da mensagem original, para a citação sobreviver mesmo se a original for apagada.
  quoted_wamid?: string | null;
  quoted_conteudo?: string | null;
  quoted_tipo?: string | null;
  quoted_remetente_nome?: string | null;
  // Reações (emoji) à mensagem — um item por "autor" (telefone do contato, ou o
  // literal "eu" para reações da própria instância).
  reacoes?: WaReacao[];
  // Mensagem excluída via edge function whatsapp-delete-message: reflete no
  // WhatsApp real (POST /message/delete da uazapi, que só tem esse modo — sempre
  // "para todos", não existe apagar só localmente sem afetar o outro lado) e some
  // para todo mundo no CRM.
  apagada_para_todos?: boolean;
  usuario?: {
    id: string;
    nome: string;
    avatar_url: string | null;
    email: string | null;
    role: string | null;
    telefone: string | null;
  } | null;
}

export interface WaConfig {
  id: string;
  empresa_id: string;
  instance_url: string;
  api_key: string;
  instance_name: string;
  apelido: string | null;
  status: 'connected' | 'disconnected' | 'connecting';
  webhook_secret: string | null;
  provisionada: boolean;
}

export interface WaInstanciaOption {
  id: string;
  instance_name: string;
  apelido: string | null;
}

async function getEmpresaId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('usuarios').select('empresa_id').eq('user_id', user.id).single();
  return data?.empresa_id ?? null;
}

async function getUsuarioId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// --- Conversas ---

export function useWaConversas() {
  const qc = useQueryClient();

  const query = useQuery<WaConversa[]>({
    queryKey: ['wa_conversas'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .select('*, responsaveis:whatsapp_conversa_responsaveis(usuario:usuarios(id, nome, avatar_url))')
        .eq('empresa_id', empresaId);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map(c => ({
          ...c,
          responsaveis: (c.responsaveis ?? []).map((r: any) => r.usuario).filter(Boolean),
        }) as WaConversa)
        .sort(compareConversas);
    },
    // Rede de segurança caso o Realtime caia sem disparar reconexão perceptível —
    // ver mesmo comentário em useWaMensagens. React Query pausa isso sozinho com
    // a aba em segundo plano.
    refetchInterval: 20_000,
  });

  useEffect(() => {
    // Depois da primeira conexão, qualquer novo "SUBSCRIBED" é uma reconexão —
    // força um refetch pra recuperar conversas/mensagens que podem ter mudado
    // durante a janela sem conexão, já que o Realtime não faz replay.
    let jaConectouUmaVez = false;
    const channel = supabase
      .channel(`wa-conversas-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) => {
          const prev = old ?? [];
          const exists = prev.some((c) => c.id === (payload.new as WaConversa).id);
          return exists ? prev : [...prev, payload.new as WaConversa].sort(compareConversas);
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        const updated = payload.new as WaConversa;

        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
          (old ?? [])
            // O payload do realtime só traz as colunas da própria tabela — sem o
            // join de responsaveis — então preserva o que já estava no cache para
            // não sumir com a conversa dos filtros "Meu"/"Geral".
            .map((c) => c.id === updated.id ? { ...updated, responsaveis: c.responsaveis } : c)
            .sort(compareConversas)
        );
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
      })
      .subscribe((status, err) => {
        if (err) console.error('[wa_conversas] falha na subscription realtime:', status, err);
        if (status === 'SUBSCRIBED') {
          if (jaConectouUmaVez) {
            qc.invalidateQueries({ queryKey: ['wa_conversas'] });
          }
          jaConectouUmaVez = true;
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

// --- Instâncias WhatsApp da empresa (para o filtro "Instância" na caixa de entrada) ---

export function useWaInstancias() {
  return useQuery<WaInstanciaOption[]>({
    queryKey: ['wa_instancias'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('configuracoes_wapi')
        .select('id, instance_name, apelido')
        .eq('empresa_id', empresaId)
        .eq('provisionada', true)
        .order('instance_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// --- Mensagens de uma conversa ---

const WA_MENSAGENS_PAGE_SIZE = 200;
// Página menor pro "carregar mais" ao rolar pro topo — a primeira carga usa uma
// janela maior (200) porque é o que a maioria das conversas precisa pra caber a
// tela toda; as páginas seguintes podem ser mais leves.
const WA_MENSAGENS_OLDER_PAGE_SIZE = 50;

const MENSAGEM_SELECT = '*, usuario:usuarios(id, nome, avatar_url, email, role, telefone)';

// Payloads do Realtime (`postgres_changes`) trazem a linha crua da tabela, sem o join
// `usuario:usuarios(...)` do MENSAGEM_SELECT — por isso mensagens de saída recém-chegadas
// via Realtime ficavam sem nome/avatar do remetente até a conversa ser recarregada.
// Preenche a partir do usuário logado nesta aba (caso comum: eu mesmo, em outra sessão) ou
// do cache de `['usuarios']` (lista de usuários da empresa, já carregada pela página do
// inbox via `useVendedores`) — cobre o caso de a mensagem ter sido enviada por um colega.
function buscarUsuarioNoCache(
  qc: ReturnType<typeof useQueryClient>,
  usuarioId: string,
  profile: { id: string; nome: string; avatar_url?: string | null; email?: string | null; role?: string | null; telefone?: string | null } | null | undefined,
): WaMensagem['usuario'] {
  if (profile && usuarioId === profile.id) {
    return {
      id: profile.id,
      nome: profile.nome,
      avatar_url: profile.avatar_url ?? null,
      email: profile.email ?? null,
      role: profile.role ?? null,
      telefone: profile.telefone ?? null,
    };
  }
  const usuarios = qc.getQueryData<Array<{
    id: string; nome: string; avatar_url: string | null; email: string | null; role: string | null; telefone: string | null;
  }>>(['usuarios']);
  const encontrado = usuarios?.find((u) => u.id === usuarioId);
  return encontrado
    ? {
        id: encontrado.id,
        nome: encontrado.nome,
        avatar_url: encontrado.avatar_url ?? null,
        email: encontrado.email ?? null,
        role: encontrado.role ?? null,
        telefone: encontrado.telefone ?? null,
      }
    : null;
}

export function useWaMensagens(conversaId: string | null) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  // Se a última página buscada (inicial ou "carregar mais") veio com menos do
  // que o tamanho pedido, não existe mensagem mais antiga que essa no banco —
  // não faz sentido continuar tentando carregar mais ao rolar pro topo.
  const [hasOlderMensagens, setHasOlderMensagens] = useState(true);
  const [loadingOlderMensagens, setLoadingOlderMensagens] = useState(false);

  useEffect(() => {
    setHasOlderMensagens(true);
    setLoadingOlderMensagens(false);
  }, [conversaId]);

  const query = useQuery<WaMensagem[]>({
    queryKey: ['wa_mensagens', conversaId],
    queryFn: async () => {
      if (!conversaId) return [];

      // Se já existe histórico em cache (reconexão do Realtime, refetch
      // periódico, ou reabrir uma conversa já visitada), busca só o que é mais
      // NOVO que a última mensagem carregada e anexa — nunca substitui o array
      // inteiro, senão qualquer página antiga carregada via "carregar mais"
      // seria descartada a cada refetch automático.
      const cache = qc.getQueryData<WaMensagem[]>(['wa_mensagens', conversaId]);
      if (cache && cache.length > 0) {
        // Ignora otimistas (id local, created_at do relógio do cliente) ao achar o
        // corte: usar o timestamp de uma otimista aqui é instável (relógio do
        // cliente pode estar adiantado em relação ao servidor) e, se a otimista
        // correspondente nunca chegar via Realtime, ela ficava presa pra sempre —
        // esse refetch nunca a substituía porque o corte também vinha dela.
        const maisRecente = [...cache].reverse().find((m) => !m.id.startsWith('otimista-'));
        const { data, error } = await supabase
          .from('whatsapp_mensagens')
          .select(MENSAGEM_SELECT)
          .eq('conversa_id', conversaId)
          .gt('created_at', maisRecente?.created_at ?? '1970-01-01')
          .order('created_at', { ascending: true });
        if (error) throw error;
        const novas = ((data as any) ?? []) as WaMensagem[];
        if (novas.length === 0) return cache;
        const idsExistentes = new Set(cache.map((m) => m.id));
        // As "novas" já vindas do banco confirmam o envio — remove qualquer
        // otimista correspondente em vez de deixá-la duplicada ao lado da mensagem
        // real (mesma lógica de match do handler de Realtime INSERT abaixo: mídia
        // compara por media_url, que é sempre idêntico, pois conteudo pode divergir
        // entre a legenda vazia da otimista e o placeholder da mensagem real).
        const enviadasConfirmadas = novas.filter((m) => m.direcao === 'saida');
        const semOtimistasConfirmadas = cache.filter((m) => {
          if (!m.id.startsWith('otimista-')) return true;
          const confirmada = enviadasConfirmadas.some((n) =>
            m.media_url && n.media_url ? m.media_url === n.media_url : m.conteudo === n.conteudo
          );
          return !confirmada;
        });
        return [...semOtimistasConfirmadas, ...novas.filter((m) => !idsExistentes.has(m.id))];
      }

      // Primeira carga da conversa: as mais RECENTES (desc + limit) e inverte
      // pra exibir em ordem cronológica — buscar em ordem ascendente com limit
      // trazia as mais ANTIGAS da conversa, então qualquer chat com mais
      // mensagens do que o limite nunca carregava as mensagens novas (só
      // apareciam se chegassem via Realtime com a tela já aberta).
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select(MENSAGEM_SELECT)
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: false })
        .limit(WA_MENSAGENS_PAGE_SIZE);
      if (error) throw error;
      const pagina = (((data as any) ?? []) as WaMensagem[]).reverse();
      setHasOlderMensagens(pagina.length === WA_MENSAGENS_PAGE_SIZE);
      return pagina;
    },
    enabled: !!conversaId,
    // Rede de segurança caso o Realtime caia sem disparar reconexão perceptível
    // (rede instável, aba em segundo plano no celular) — React Query já pausa
    // isso sozinho quando a aba está oculta (refetchIntervalInBackground: false).
    // Seguro rodar em intervalo porque o queryFn acima só anexa mensagens novas
    // quando já existe cache, nunca trunca o que já foi carregado.
    refetchInterval: conversaId ? 20_000 : false,
  });

  // Busca uma leva mais antiga (rolar pro topo do chat) e insere no início do
  // array em cache, sem tocar no que já está carregado.
  const fetchOlderMensagens = useCallback(async () => {
    if (!conversaId || loadingOlderMensagens || !hasOlderMensagens) return;
    const cache = qc.getQueryData<WaMensagem[]>(['wa_mensagens', conversaId]) ?? [];
    const maisAntiga = cache[0];
    if (!maisAntiga) return;

    setLoadingOlderMensagens(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select(MENSAGEM_SELECT)
        .eq('conversa_id', conversaId)
        .lt('created_at', maisAntiga.created_at)
        .order('created_at', { ascending: false })
        .limit(WA_MENSAGENS_OLDER_PAGE_SIZE);
      if (error) throw error;
      const pagina = (((data as any) ?? []) as WaMensagem[]).reverse();
      setHasOlderMensagens(pagina.length === WA_MENSAGENS_OLDER_PAGE_SIZE);
      if (pagina.length > 0) {
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], (old) => [...pagina, ...(old ?? [])]);
      }
    } catch (err) {
      console.error('[wa] erro ao carregar mensagens antigas:', err);
      toast.error('Erro ao carregar mensagens antigas');
    } finally {
      setLoadingOlderMensagens(false);
    }
  }, [conversaId, hasOlderMensagens, loadingOlderMensagens, qc]);

  useEffect(() => {
    if (!conversaId) return;
    // Depois da primeira conexão, qualquer novo "SUBSCRIBED" é uma reconexão
    // (rede caiu e voltou) — força um refetch pra recuperar mensagens que podem
    // ter chegado durante a janela sem conexão, já que o Realtime não faz replay.
    let jaConectouUmaVez = false;
    const channel = supabase
      .channel(`wa-msgs-rt-${conversaId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_mensagens',
        filter: `conversa_id=eq.${conversaId}`,
      }, (payload) => {
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], (old) => {
          const prev = old ?? [];
          const newMsg = payload.new as WaMensagem;

          // Já existe pelo id real do banco
          if (prev.some((m) => m.id === newMsg.id)) return prev;

          // Mensagem de saída: substitui o otimista correspondente (se ainda existir).
          // Mídia compara por media_url (sempre idêntico, já que a otimista usa a
          // mesma URL já enviada pro upload) em vez de conteudo — a legenda pode ficar
          // vazia na otimista e virar um placeholder tipo "[Imagem]" na mensagem real,
          // o que faria esse match falhar e duplicar a bolha.
          if (newMsg.direcao === 'saida') {
            const idx = prev.findIndex((m) => {
              if (!m.id.startsWith('otimista-')) return false;
              if (m.media_url && newMsg.media_url) return m.media_url === newMsg.media_url;
              return m.conteudo === newMsg.conteudo;
            });
            if (idx !== -1) {
              const updated = [...prev];
              // O payload do realtime (postgres_changes) vem sem relacionamentos —
              // sem isso o nome do remetente sumiria da bolha assim que o otimista
              // fosse substituído pela mensagem real.
              updated[idx] = { ...newMsg, usuario: newMsg.usuario ?? prev[idx].usuario };
              return updated;
            }
            // Otimista já foi removido pelo onSuccess — a mensagem real está como wamid ou não existe ainda
            // Verifica pelo wamid para evitar duplicata
            if (newMsg.wamid && prev.some((m) => m.wamid === newMsg.wamid)) return prev;
          }

          // Mesmo sem otimista correspondente (ex: outra aba/sessão do mesmo usuário
          // já removeu o otimista antes do evento chegar, ou a mensagem foi enviada
          // por OUTRO usuário da empresa), tenta preencher o remetente: primeiro pelo
          // usuário logado nesta aba, senão pelo cache de `['usuarios']` (já carregado
          // pela página do inbox via useVendedores) — sem isso, mensagens enviadas por
          // colegas em outra sessão ficavam sem nome/avatar até a conversa ser recarregada.
          const usuarioInferido =
            newMsg.direcao === 'saida' && !newMsg.usuario && newMsg.usuario_id
              ? buscarUsuarioNoCache(qc, newMsg.usuario_id, profile)
              : newMsg.usuario;

          return [...prev, { ...newMsg, usuario: usuarioInferido }];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_mensagens',
        filter: `conversa_id=eq.${conversaId}`,
      }, (payload) => {
        // Cobre tanto reações (coluna `reacoes`) quanto qualquer outro update de
        // status/conteúdo — preserva os relacionamentos já carregados (o payload do
        // realtime não traz joins).
        const updated = payload.new as WaMensagem;
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], (old) =>
          (old ?? []).map((m) => (m.id === updated.id ? { ...m, ...updated, usuario: m.usuario } : m))
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (jaConectouUmaVez) {
            qc.invalidateQueries({ queryKey: ['wa_mensagens', conversaId] });
          }
          jaConectouUmaVez = true;
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [conversaId, qc]);

  return { ...query, fetchOlderMensagens, hasOlderMensagens, loadingOlderMensagens };
}

// --- Busca de mensagens por texto + período, em todas as conversas ---

export interface WaMensagemBusca {
  id: string;
  conversa_id: string;
  conteudo: string;
  created_at: string;
  direcao: 'entrada' | 'saida';
  conversa: {
    id: string;
    nome_contato: string | null;
    telefone: string;
    foto_perfil_url: string | null;
    is_group: boolean;
  } | null;
}

// RLS de whatsapp_mensagens (wa_mensagens_access) já restringe o resultado às
// conversas que o usuário pode acessar — não precisa filtrar usuário aqui.
export function useWaBuscarMensagens() {
  return useMutation({
    mutationFn: async ({ termo, from, to }: { termo: string; from?: Date; to?: Date }) => {
      const empresaId = await getEmpresaId();
      if (!empresaId || !termo.trim()) return [] as WaMensagemBusca[];

      let query = supabase
        .from('whatsapp_mensagens')
        .select('id, conversa_id, conteudo, created_at, direcao, conversa:whatsapp_conversas(id, nome_contato, telefone, foto_perfil_url, is_group)')
        .eq('empresa_id', empresaId)
        .eq('is_nota_interna', false)
        .ilike('conteudo', `%${termo.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (from) {
        const inicio = new Date(from);
        inicio.setHours(0, 0, 0, 0);
        query = query.gte('created_at', inicio.toISOString());
      }
      if (to) {
        const fim = new Date(to);
        fim.setHours(23, 59, 59, 999);
        query = query.lte('created_at', fim.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as WaMensagemBusca[];
    },
  });
}

// --- Upload de mídia para Storage ---

// Alguns navegadores/SOs não reconhecem `File.type` para formatos de documento
// (ex.: .docx retorna ""), o que fazia o objeto ser salvo no Storage com um
// Content-Type genérico mesmo com a extensão correta no nome do arquivo.
const EXT_TO_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
};

export function mimeForFile(file: File): string | null {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? EXT_TO_MIME[ext] ?? null : null;
}

export async function uploadWaMedia(file: File, conversaId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${conversaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, file, { upsert: false, contentType: mimeForFile(file) ?? undefined });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(data.path);
  return publicUrl;
}

export type WaMidiaTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';

// --- Enviar mensagem (com update otimista) ---

export function useWaSendMessage() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      telefone: string;
      mensagem: string;
      conversa_id?: string;
      tipo?: WaMidiaTipo;
      media_url?: string | null;
      media_mime?: string | null;
      nome_arquivo?: string;
      ptt?: boolean;
      quoted_wamid?: string | null;
      quoted_conteudo?: string | null;
      quoted_tipo?: string | null;
      quoted_remetente_nome?: string | null;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      // Sem isso, uma requisição travada (rede instável, function fria) nunca
      // resolve nem rejeita: a bolha otimista fica em "enviando" pra sempre até
      // um refetch qualquer sobrescrever a lista e ela sumir sem nenhum toast de
      // erro (o onError abaixo nunca chega a rodar porque a Promise não resolveu).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      let res: Awaited<ReturnType<typeof supabase.functions.invoke>>;
      try {
        res = await supabase.functions.invoke('whatsapp-send', {
          body: {
            telefone: params.telefone,
            mensagem: params.mensagem,
            conversa_id: params.conversa_id,
            tipo: params.tipo ?? 'texto',
            media_url: params.media_url ?? null,
            media_mime: params.media_mime ?? null,
            nome_arquivo: params.nome_arquivo ?? null,
            ptt: params.ptt ?? false,
            quoted_wamid: params.quoted_wamid ?? null,
            quoted_conteudo: params.quoted_conteudo ?? null,
            quoted_tipo: params.quoted_tipo ?? null,
            quoted_remetente_nome: params.quoted_remetente_nome ?? null,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) {
          throw new Error('Tempo esgotado ao enviar mensagem. Verifique sua conexão e tente novamente.');
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }

      // A biblioteca lança um erro genérico ANTES de ler o corpo da resposta; a
      // explicação real da função vem em error.context. Sem isto, "instância
      // desconectada", "número não tem WhatsApp" e mais oito causas distintas
      // apareceriam todas como a mesma frase em inglês.
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao enviar mensagem');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },

    onMutate: async (vars) => {
      if (!vars.conversa_id) return;

      // Cancela refetch pendente para não sobrescrever o otimista
      await qc.cancelQueries({ queryKey: ['wa_mensagens', vars.conversa_id] });

      const msgOtimista: WaMensagem = {
        id: `otimista-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conversa_id: vars.conversa_id,
        empresa_id: '',
        direcao: 'saida',
        conteudo: vars.mensagem,
        tipo: vars.tipo ?? 'texto',
        media_url: vars.media_url ?? null,
        media_mime: vars.media_mime ?? null,
        wamid: null,
        status: 'enviando',
        usuario_id: profile?.id ?? null,
        lida: true,
        created_at: new Date().toISOString(),
        quoted_wamid: vars.quoted_wamid ?? null,
        quoted_conteudo: vars.quoted_conteudo ?? null,
        quoted_tipo: vars.quoted_tipo ?? null,
        quoted_remetente_nome: vars.quoted_remetente_nome ?? null,
        // O evento realtime de INSERT chega sem os relacionamentos (postgres_changes
        // não faz join), então guardamos o usuário aqui pra não perder o nome do
        // remetente quando essa mensagem otimista for substituída pela real (ver
        // useWaMensagens abaixo).
        usuario: profile
          ? {
              id: profile.id,
              nome: profile.nome,
              avatar_url: profile.avatar_url ?? null,
              email: profile.email ?? null,
              role: profile.role ?? null,
              telefone: profile.telefone ?? null,
            }
          : null,
      };

      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) => [
        ...(old ?? []),
        msgOtimista,
      ]);

      // Atualiza preview da conversa imediatamente — e garante que quem enviou a
      // mensagem apareça em "Meus chats" sem esperar o refetch (o servidor também
      // grava isso em whatsapp_conversa_responsaveis, isso aqui é só otimista).
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? [])
          .map((c) => {
            if (c.id !== vars.conversa_id) return c;
            const jaResponsavel = profile?.id && c.responsaveis?.some((r) => r.id === profile.id);
            const responsaveis = profile?.id && !jaResponsavel
              ? [...(c.responsaveis ?? []), { id: profile.id, nome: profile.nome, avatar_url: profile.avatar_url ?? null }]
              : c.responsaveis;
            return { ...c, ultima_mensagem: vars.mensagem, ultima_mensagem_at: new Date().toISOString(), responsaveis };
          })
          .sort(compareConversas)
      );

      return { msgOtimista };
    },

    onSuccess: (data, vars, context) => {
      if (!vars.conversa_id || !context?.msgOtimista) return;
      // Atualiza só o status — não muda o id, para o Realtime conseguir substituir o otimista
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) => {
        const stillOptimistic = (old ?? []).some(m => m.id === context.msgOtimista.id);
        if (!stillOptimistic) return old ?? []; // Realtime já substituiu, não faz nada
        return (old ?? []).map((m) =>
          m.id === context.msgOtimista.id ? { ...m, status: 'enviado' } : m
        );
      });
    },

    onError: (err: any, vars, context) => {
      // Remove mensagem otimista em caso de erro
      if (vars.conversa_id && context?.msgOtimista) {
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) =>
          (old ?? []).filter((m) => m.id !== context.msgOtimista.id)
        );
      }
      toast.error(err?.message ?? 'Erro ao enviar mensagem');
    },
  });
}

// --- Reagir a uma mensagem com emoji ---
// `emoji` vazio remove a reação atual (toggle, igual ao WhatsApp: clicar de novo no
// mesmo emoji tira a reação).

export function useWaReagir() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      conversaId: string;
      mensagemId: string;
      wamid: string;
      telefone: string;
      emoji: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-send-reaction', {
        body: { wamid: params.wamid, telefone: params.telefone, emoji: params.emoji },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao reagir à mensagem');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversaId], (old) =>
        (old ?? []).map((m) => {
          if (m.id !== vars.mensagemId) return m;
          const semAutor = (m.reacoes ?? []).filter((r) => r.autor !== 'eu');
          const novasReacoes = vars.emoji
            ? [...semAutor, { emoji: vars.emoji, autor: 'eu', nome: 'Você', at: new Date().toISOString() }]
            : semAutor;
          return { ...m, reacoes: novasReacoes };
        })
      );
    },

    onError: (err: any, vars) => {
      qc.invalidateQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      toast.error(err?.message ?? 'Erro ao reagir à mensagem');
    },
  });
}

// --- Excluir mensagem: chama a edge function que apaga na uazapi (POST
// /message/delete) e só depois marca `apagada_para_todos` no banco. A uazapi só
// tem esse único modo de exclusão — sempre reflete no WhatsApp real para todos os
// participantes, não existe "apagar só para mim" na API deles (ver validação em
// whatsapp-delete-message). ---

export function useWaExcluirMensagem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { conversaId: string; mensagemId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-delete-message', {
        body: { mensagemId: params.mensagemId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao excluir mensagem');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversaId], (old) =>
        (old ?? []).map((m) => (m.id === vars.mensagemId ? { ...m, apagada_para_todos: true } : m))
      );
    },

    onError: (err: any, vars) => {
      qc.invalidateQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      toast.error(err?.message ?? 'Erro ao excluir mensagem');
    },
  });
}

// --- Marcar conversa como lida ---

export function useWaMarcarLida() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      await supabase
        .from('whatsapp_mensagens')
        .update({ lida: true })
        .eq('conversa_id', conversaId)
        .eq('direcao', 'entrada');

      await supabase
        .from('whatsapp_conversas')
        .update({ nao_lidas: 0, nao_lidas_forcada: false })
        .eq('id', conversaId);
    },
    onSuccess: (_, conversaId) => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_mensagens', conversaId] });
      qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
    },
  });
}

// Marcação manual de "não lida" via menu "..." — única forma de uma conversa já
// atribuída a um responsável voltar a exibir o estado "não lida" (ver
// `conversaNaoLida` em WhatsAppInbox.tsx). Some sozinha quando o usuário
// responde a conversa ou clica em "marcar como lida" de novo.
export function useWaMarcarNaoLida() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      await supabase
        .from('whatsapp_conversas')
        .update({ nao_lidas_forcada: true })
        .eq('id', conversaId);
    },
    onSuccess: (_, conversaId) => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
    },
  });
}

// --- Configuração uazapi ---

export function useWaConfig() {
  return useQuery<WaConfig | null>({
    queryKey: ['wa_config'],
    queryFn: async () => {
      const usuarioId = await getUsuarioId();
      if (!usuarioId) return null;
      const { data } = await supabase
        .from('wapi_instancia_usuarios')
        .select('instancia:configuracoes_wapi(*)')
        .eq('usuario_auth_id', usuarioId)
        .limit(1)
        .maybeSingle();
      return (data?.instancia as WaConfig | null) ?? null;
    },
    // Este dado decide se a tela deixa a pessoa digitar e enviar. Com o padrão
    // global (1 minuto de validade e sem revalidar ao focar a janela), uma aba
    // aberta há horas seguia acreditando que o WhatsApp estava conectado: a
    // verificação da tela passava, o envio saía e só a função — que lê o banco na
    // hora — recusava, já com a mensagem digitada perdida. A consulta é barata e
    // o custo de errar é uma mensagem que não sai.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

// --- Provisionar instância (cria instância uazapi para o usuário atual) ---

export function useWaProvision() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-provision', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao ativar o WhatsApp');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data as { success: boolean; instanceName: string; alreadyProvisioned?: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao ativar WhatsApp');
    },
  });

  return { provision: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error };
}

// --- Contagem não lidas (para badge no sidebar) ---

export function useUnreadWaMessages() {
  const qc = useQueryClient();
  // Guarda o último nao_lidas conhecido por conversa para detectar incrementos
  // (chegada de mensagem nova) mesmo com a tela de WhatsApp fechada.
  const prevNaoLidasRef = useRef<Record<string, number>>({});

  const query = useQuery<number>({
    queryKey: ['unread_wa_count'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return 0;
      const { data } = await supabase
        .from('whatsapp_conversas')
        .select('id, nao_lidas')
        .eq('empresa_id', empresaId)
        .eq('arquivada', false)
        .gt('nao_lidas', 0);
      (data ?? []).forEach((r) => {
        prevNaoLidasRef.current[r.id] = r.nao_lidas ?? 0;
      });
      return (data ?? []).reduce((sum, r) => sum + (r.nao_lidas ?? 0), 0);
    },
  });

  // Assinatura global (sempre montada via AppSidebar) para garantir que o toast
  // dispare mesmo se o usuário não estiver com a tela de WhatsApp aberta no momento.
  useEffect(() => {
    const channel = supabase
      .channel(`wa-unread-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });

        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const row = payload.new as WaConversa;
          const prevCount = prevNaoLidasRef.current[row.id] ?? 0;
          const currentCount = row.nao_lidas ?? 0;

          if (currentCount > prevCount) {
            const nomeConversa = row.nome_contato || row.telefone;
            const ultimaMensagem = row.ultima_mensagem?.trim();
            const descricao = ultimaMensagem
              ? ultimaMensagem.length > MENSAGEM_TOAST_MAX_CHARS
                ? `${ultimaMensagem.slice(0, MENSAGEM_TOAST_MAX_CHARS)}...`
                : ultimaMensagem
              : 'Nova mensagem';
            toast(() => createElement('span', null, createElement('b', null, nomeConversa), ' enviou uma mensagem'), {
              description: descricao,
              style: { background: '#f97316', color: '#fff', border: 'none' },
              descriptionClassName: '!text-white/90',
            });
          }

          prevNaoLidasRef.current[row.id] = currentCount;
        }
      })
      .subscribe((status, err) => {
        if (err) console.error('[unread_wa_count] falha na subscription realtime:', status, err);
      });
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

// --- Limpar conversa (apaga todas as mensagens) ---

export function useWaLimparConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { error } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .eq('conversa_id', conversaId);
      if (error) throw error;

      await supabase
        .from('whatsapp_conversas')
        .update({ ultima_mensagem: null, ultima_mensagem_at: null, nao_lidas: 0 })
        .eq('id', conversaId);
    },
    onSuccess: (_, conversaId) => {
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], []);
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao limpar conversa');
    },
  });
}

// --- Deletar conversa (apaga mensagens + registro da conversa) ---

export function useWaDeletarConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { error: errMsgs } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .eq('conversa_id', conversaId);
      if (errMsgs) throw errMsgs;

      const { error } = await supabase
        .from('whatsapp_conversas')
        .delete()
        .eq('id', conversaId);
      if (error) throw error;
    },
    onSuccess: (_, conversaId) => {
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).filter((c) => c.id !== conversaId)
      );
      qc.removeQueries({ queryKey: ['wa_mensagens', conversaId] });
      toast.success('Conversa deletada');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao deletar conversa');
    },
  });
}

// --- Deletar múltiplas conversas em massa ---

export function useWaDeletarConversasEmMassa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error: errMsgs } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .in('conversa_id', ids);
      if (errMsgs) throw errMsgs;

      const { error } = await supabase
        .from('whatsapp_conversas')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      if (!ids) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).filter((c) => !ids.includes(c.id))
      );
      ids.forEach((id) => qc.removeQueries({ queryKey: ['wa_mensagens', id] }));
      toast.success(`${ids.length} conversa${ids.length > 1 ? 's' : ''} deletada${ids.length > 1 ? 's' : ''}`);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao deletar conversas');
    },
  });
}

// --- Definir responsáveis de uma conversa ---

export function useWaSetResponsaveis() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversaId, usuarioIds }: { conversaId: string; usuarioIds: string[] }) => {
      // Faz diff em vez de apagar tudo e reinserir: um usuário não-admin só continua
      // com permissão para editar essa conversa (RLS) enquanto ele mesmo seguir como
      // responsável, então remover-e-recriar em massa derrubaria a própria permissão
      // no meio da operação sempre que ele não estivesse se auto-removendo.
      const { data: existentes, error: fetchErr } = await supabase
        .from('whatsapp_conversa_responsaveis')
        .select('usuario_id')
        .eq('conversa_id', conversaId);
      if (fetchErr) throw fetchErr;

      const existentesIds = new Set((existentes ?? []).map(r => r.usuario_id));
      const novosIds = new Set(usuarioIds);
      const paraRemover = [...existentesIds].filter(id => !novosIds.has(id));
      const paraAdicionar = [...novosIds].filter(id => !existentesIds.has(id));

      if (paraRemover.length > 0) {
        const { error: delErr } = await supabase
          .from('whatsapp_conversa_responsaveis')
          .delete()
          .eq('conversa_id', conversaId)
          .in('usuario_id', paraRemover);
        if (delErr) throw delErr;
      }

      if (paraAdicionar.length > 0) {
        const { error: insErr } = await supabase
          .from('whatsapp_conversa_responsaveis')
          .insert(paraAdicionar.map(uid => ({ conversa_id: conversaId, usuario_id: uid })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar responsáveis');
    },
  });
}

// Nota de sistema no timeline do chat (ex: "Fulano assumiu esta conversa") — grava
// direto em whatsapp_mensagens com is_nota_interna=true, sem passar pela edge function
// whatsapp-send, então nunca é entregue ao WhatsApp. A RLS de whatsapp_mensagens já
// restringe leitura a usuários internos da empresa (ver can_access_wa_conversa), então
// não precisa de tratamento extra pra esconder de um lead/portal.
export function useWaAddNota() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (
      { conversaId, texto, fixada = false }: { conversaId: string; texto: string; fixada?: boolean },
    ) => {
      if (!profile?.empresa_id) throw new Error('Empresa não identificada');
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .insert({
          conversa_id: conversaId,
          empresa_id: profile.empresa_id,
          direcao: 'saida',
          conteudo: texto,
          tipo: 'texto',
          status: 'enviado',
          usuario_id: profile.id,
          lida: true,
          is_nota_interna: true,
          fixada,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WaMensagem;
    },
    onSuccess: (nota) => {
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', nota.conversa_id], (old) =>
        old ? [...old, nota] : old,
      );
    },
    onError: (err: any) => {
      console.error('[wa] erro ao registrar nota interna:', err);
    },
  });
}

// Fixa/desfixa uma nota interna já existente no topo do chat.
export function useWaSetNotaFixada() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notaId, fixada }: { notaId: string; fixada: boolean }) => {
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .update({ fixada })
        .eq('id', notaId)
        .select()
        .single();
      if (error) throw error;
      return data as WaMensagem;
    },
    onSuccess: (nota) => {
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', nota.conversa_id], (old) =>
        (old ?? []).map((m) => (m.id === nota.id ? nota : m)),
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar nota');
    },
  });
}

// --- Arquivar / reabrir conversa ---

export function useWaArquivarConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { conversaId: string; arquivada: boolean }) => {
      const { error } = await supabase
        .from('whatsapp_conversas')
        .update({ arquivada: params.arquivada })
        .eq('id', params.conversaId);
      if (error) throw error;
      return params;
    },
    onSuccess: ({ conversaId, arquivada }) => {
      // Fechar a conversa dispara um trigger no banco que remove todos os
      // responsáveis atribuídos (trg_wa_conversa_remove_responsaveis_ao_fechar) —
      // reflete isso no cache local junto com o próprio campo `arquivada`.
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId
          ? { ...c, arquivada, ...(arquivada ? { responsaveis: [] } : {}) }
          : c
        )
      );
      toast.success(arquivada ? 'Conversa marcada como fechada' : 'Conversa reaberta');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar conversa');
    },
  });
}

// --- Foto de perfil do contato ---

export function useWaFetchContactPhoto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-contact-photo', {
        body: { conversa_id: conversaId },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao carregar a foto do contato');
      return {
        conversaId,
        fotoPerfilUrl: data?.foto_perfil_url as string | null,
        fotoPerfilExpiresAt: data?.foto_perfil_expires_at as string | null,
      };
    },
    onSuccess: ({ conversaId, fotoPerfilUrl, fotoPerfilExpiresAt }) => {
      if (!fotoPerfilUrl) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId
          ? { ...c, foto_perfil_url: fotoPerfilUrl, foto_perfil_expires_at: fotoPerfilExpiresAt }
          : c)
      );
    },
  });
}

// --- Renomear contato (reflete tanto no CRM quanto na agenda real do WhatsApp,
// via POST /contact/add da uazapi — grupos não têm agenda equivalente, então
// nesse caso a edge function só atualiza o nome local) ---

export function useWaRenomearContato() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversaId, nome }: { conversaId: string; nome: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-contact-rename', {
        body: { conversa_id: conversaId, nome },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao renomear o contato');
      return { conversaId, nomeContato: data?.nome_contato as string };
    },
    onSuccess: ({ conversaId, nomeContato }) => {
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId ? { ...c, nome_contato: nomeContato } : c)
      );
      toast.success('Nome do contato atualizado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao renomear contato');
    },
  });
}

// --- Participantes de grupo (backfill para grupos criados antes do rastreio, ou
// fora do CRM, cuja uazapi só devolve a lista completa via /group/list) ---

export function useWaFetchGroupParticipantes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-group-participants', {
        body: { conversa_id: conversaId },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao carregar os participantes');
      return { conversaId, participantes: (data?.participantes ?? []) as { nome: string | null; telefone: string }[] };
    },
    onSuccess: ({ conversaId, participantes }) => {
      if (participantes.length === 0) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId ? { ...c, participantes } : c)
      );
    },
  });
}

// --- Foto de perfil por número (participantes de grupo, cacheada no back-end por
// telefone em vez de por conversa) ---

export function useWaParticipantePhoto(telefone: string | null | undefined) {
  return useQuery({
    queryKey: ['wa_participante_foto', telefone],
    enabled: !!telefone,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-participant-photo', {
        body: { telefone },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao carregar a foto do participante');
      return (data?.foto_perfil_url ?? null) as string | null;
    },
  });
}

// --- Conectar instância via QR code ---

export function useWaConnect() {
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      // Body is empty — instance is identified by the `token` header alone
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);
      let data: Record<string, any> = {};
      try { data = JSON.parse(text); } catch { /* ok */ }

      // uazapi returns QR in data.instance.qrcode (base64 PNG). Normaliza string
      // vazia ("") para null — a uazapi retorna qrcode: "" quando não há QR a
      // gerar (ex.: instância já conectada), e "??" não trata "" como nulo.
      const rawQr: string | null =
        data?.instance?.qrcode ??
        data?.qrcode?.base64 ??
        (typeof data?.qrcode === 'string' ? data.qrcode : null) ??
        data?.base64 ??
        null;
      const qr = rawQr && rawQr.length > 0 ? rawQr : null;

      // Detecta "já conectado" para diferenciar de uma falha real ao gerar QR
      const alreadyConnected: boolean =
        data?.connected === true ||
        data?.status?.connected === true ||
        data?.status?.loggedIn === true ||
        data?.instance?.status === 'connected' ||
        (typeof data?.response === 'string' && data.response.toLowerCase().includes('already connected'));

      if (!qr) {
        // Loga a resposta completa da uazapi sempre que não há QR, para
        // diagnosticar formatos de payload não previstos no parsing acima.
        console.log('[useWaConnect] sem QR na resposta da uazapi', {
          instanceName: config.instance_name, alreadyConnected, response: data,
        });
      }

      return { qr, alreadyConnected, data };
    },
  });
}

export function useWaSyncStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      // GET /instance/status — instance identified by token header
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: 'GET',
        headers: { token: config.api_key },
      });
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const data = await res.json();
      // Response: { status: { connected: bool, loggedIn: bool } }
      const isConnected: boolean =
        (data?.status?.connected === true && data?.status?.loggedIn === true) ||
        data?.connected === true;
      const dbStatus: WaConfig['status'] = isConnected ? 'connected' : 'disconnected';
      await supabase
        .from('configuracoes_wapi')
        .update({ status: dbStatus })
        .eq('id', config.id);
      return { isConnected, dbStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
    },
  });
}

// --- Desconectar instância ---

export function useWaDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);
      await supabase
        .from('configuracoes_wapi')
        .update({ status: 'disconnected' })
        .eq('id', config.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao desconectar');
    },
  });
}

// --- Nova conversa (iniciar chat) ---

export function useWaNovaConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { telefone: string; nome_contato?: string; cliente_id?: string }) => {
      const telefone = normalizeWhatsappPhone(params.telefone);

      // RPC (SECURITY DEFINER) em vez de upsert client-side: se já existe conversa
      // para esse telefone atribuída a outra pessoa, o upsert direto caía no caminho
      // ON CONFLICT DO UPDATE e era barrado pela policy de RLS (USING
      // can_access_wa_conversa) antes de chegar no WITH CHECK — a function trata
      // esse caso com uma mensagem de erro clara em vez de "RLS violation".
      const { data, error } = await supabase.rpc('wa_iniciar_conversa', {
        p_telefone: telefone,
        p_nome_contato: params.nome_contato ?? undefined,
        p_cliente_id: params.cliente_id ?? undefined,
      });

      if (error) throw error;
      return data as WaConversa;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao iniciar conversa');
    },
  });
}

// --- Criar grupo ---

export function useWaCriarGrupo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { nome: string; participantes: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-group-create', {
        body: { nome: params.nome, participantes: params.participantes },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao criar o grupo');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data.conversa as WaConversa;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao criar grupo');
    },
  });
}

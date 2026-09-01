import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';
import { infoPreviewMensagem } from '@/lib/wa-mensagem-preview';

const MENSAGEM_TOAST_MAX_CHARS = 100;

// WhatsApp/uazapi às vezes usa o JID de celulares BR sem o 9º dígito (número antigo).
// Normaliza para o formato canônico, igual ao _shared/whatsapp.ts das edge functions
// (cópia local porque o frontend não importa de supabase/) — as duas pontas PRECISAM
// concordar, senão a mesma pessoa vira duas conversas.
//
// O 9 só entra na faixa de celular ([6-9]): fixo começa com 2-5, e fixo com WhatsApp
// existe (comum em empresa). A versão antiga enfiava o 9 em qualquer número de 10
// dígitos, e isso criou conversas com números que não existem no WhatsApp — recebiam
// normalmente (o webhook re-normalizava do mesmo jeito) e falhavam TODO envio.
export function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10 && /^[6-9]$/.test(digits[2])) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

// A variante alternativa de um número ambíguo (9+[2-5] pode ser fixo com 9 espúrio;
// [2-5] pode ser conta que usa o 9) — ou null quando o formato é inequívoco.
// Espelha `varianteDoNumero` de _shared/whatsapp.ts.
export function varianteDoNumero(numero: string): string | null {
  if (/^55\d{2}9[2-5]\d{7}$/.test(numero)) return numero.slice(0, 4) + numero.slice(5);
  if (/^55\d{2}[2-5]\d{7}$/.test(numero)) return numero.slice(0, 4) + '9' + numero.slice(4);
  return null;
}

export interface WaResponsavel {
  id: string;
  nome: string;
  avatar_url: string | null;
}

export interface WaVisualizador extends WaResponsavel {
  visualizado_em: string;
  // Quantas vezes este usuário visualizou a conversa sem assumir, somando
  // ciclos sucessivos de "ficou sem responsável" — não é só a última vez
  // (ver migration wa_conversa_visualizacoes_quantidade e comentário de
  // useWaRegistrarVisualizacao sobre quando soma versus só atualiza a data).
  quantidade: number;
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
  // Direção ('entrada'/'saida') da última mensagem — só para exibição na lista.
  // NÃO usar para decidir se a conversa precisa de responsável: ver
  // `precisa_atribuicao` e o comentário de `precisaAssumir` em WhatsAppInbox.tsx.
  ultima_mensagem_direcao: string | null;
  // true quando a conversa foi reaberta (arquivada true -> false) por algo que
  // não passou por um responsável de verdade — mensagem do cliente ou mensagem
  // de saída refletida do celular físico/WhatsApp Web, ambas via
  // whatsapp-webhook. Fica false de novo assim que alguém é atribuído
  // (useWaSetResponsaveis). Nunca setado por mensagem enviada pelo CRM
  // (whatsapp-send já garante um responsável via ensureResponsavel).
  precisa_atribuicao: boolean;
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
  // Quem do time já abriu esta conversa enquanto ela estava sem responsável —
  // só populado/exibido pra conversas "Não atribuídas" (ver
  // whatsapp_conversa_visualizacoes). Não tem relação com o estado de
  // lida/não lida.
  visualizadores?: WaVisualizador[];
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
  // Cartão de contato (tipo === 'contato'): nome + telefone das pessoas
  // compartilhadas. Preenchido no envio (whatsapp-send) e no recebimento
  // (whatsapp-webhook, lendo o vCard).
  contato_payload?: { itens: { nome: string; telefone: string }[] } | null;
  // Mensagem excluída via edge function whatsapp-delete-message: reflete no
  // WhatsApp real (POST /message/delete da uazapi, que só tem esse modo — sempre
  // "para todos", não existe apagar só localmente sem afetar o outro lado) e some
  // para todo mundo no CRM.
  apagada_para_todos?: boolean;
  // Mensagem de texto de saída editada — via edge function whatsapp-edit-message
  // (edição feita no CRM) ou via whatsapp-webhook (o cliente editou pelo celular).
  // `conteudo` já traz o texto novo; a bolha mostra "· editada" ao lado da hora.
  editada?: boolean;
  editada_at?: string | null;
  // Texto antes da primeira edição (gravado uma vez só). Não é exibido hoje,
  // mas fica guardado para um eventual "ver original".
  conteudo_original?: string | null;
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
  cor: string | null;
  status: 'connected' | 'disconnected' | 'connecting';
  webhook_secret: string | null;
  provisionada: boolean;
}

export interface WaInstanciaOption {
  id: string;
  instance_name: string;
  apelido: string | null;
  cor: string | null;
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
        .select('*, responsaveis:whatsapp_conversa_responsaveis(usuario:usuarios(id, nome, avatar_url)), visualizadores:whatsapp_conversa_visualizacoes(visualizado_em, quantidade, usuario:usuarios(id, nome, avatar_url))')
        .eq('empresa_id', empresaId);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map(c => ({
          ...c,
          responsaveis: (c.responsaveis ?? []).map((r: any) => r.usuario).filter(Boolean),
          // `visualizado_em` vem da linha de junção (não do usuário), então
          // não dá pra só extrair `v.usuario` como o campo de responsáveis
          // faz — precisa juntar os dois na mesma hora que filtra usuário nulo.
          visualizadores: (c.visualizadores ?? [])
            .map((v: { usuario: WaResponsavel | null; visualizado_em: string; quantidade: number }) =>
              v.usuario ? { ...v.usuario, visualizado_em: v.visualizado_em, quantidade: v.quantidade } : null,
            )
            .filter(Boolean),
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
            // O payload do realtime só traz as colunas da própria tabela — sem os
            // joins de responsaveis/visualizadores — então preserva o que já estava
            // no cache para não sumir com a conversa dos filtros "Meu"/"Geral" nem
            // com a pilha de quem já visualizou.
            .map((c) => c.id === updated.id ? { ...updated, responsaveis: c.responsaveis, visualizadores: c.visualizadores } : c)
            .sort(compareConversas)
        );
        // A invalidação de `unread_wa_count` que existia aqui era DUPLICADA:
        // `useUnreadWaMessages` tem a própria assinatura na mesma tabela e
        // reagia ao mesmo evento. Com a tela de WhatsApp aberta, cada UPDATE de
        // conversa disparava dois refetches da consulta mais cara do sistema.
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
        .select('id, instance_name, apelido, cor')
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

// --- Exportar histórico de uma conversa ---

const WA_MENSAGENS_EXPORT_PAGE_SIZE = 1000;

// Busca TODAS as mensagens de uma conversa num intervalo de datas, paginando
// com `.range()` até esgotar — não reaproveita `useWaMensagens` porque aquele
// hook só mantém as últimas 200 mensagens em cache (carregamento incremental
// pra tela de chat), o que não serve pra exportar "todo o período".
export async function fetchMensagensParaExportar(
  conversaId: string,
  from: Date,
  to: Date,
): Promise<WaMensagem[]> {
  const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
  const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).toISOString();

  const todas: WaMensagem[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('whatsapp_mensagens')
      .select(MENSAGEM_SELECT)
      .eq('conversa_id', conversaId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + WA_MENSAGENS_EXPORT_PAGE_SIZE - 1);
    if (error) throw error;
    const pagina = ((data ?? []) as unknown) as WaMensagem[];
    todas.push(...pagina);
    if (pagina.length < WA_MENSAGENS_EXPORT_PAGE_SIZE) break;
    offset += WA_MENSAGENS_EXPORT_PAGE_SIZE;
  }
  return todas;
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

/**
 * Busca por texto nas mensagens — via RPC, e não por consulta direta.
 *
 * A consulta direta com `.ilike()` NUNCA conseguia usar o índice trigram: sob
 * RLS o Postgres não pode avaliar o `ilike` antes das cláusulas da policy,
 * porque `texticlike` não é leakproof. O texto virava filtro DEPOIS de
 * `can_access_wa_conversa()`, e o custo passava a ser proporcional a quantas
 * linhas era preciso varrer até juntar 100 resultados — quanto mais RARO o
 * termo, pior. Medido na sessão de um vendedor real:
 *
 *   '%pedido%'  ->   2.063 ms   (820 ocorrências, enche o limite logo)
 *   '%obra%'    ->   4.376 ms
 *   '%zxqwvk%'  ->  12.013 ms   -> morria no statement_timeout de 8 s
 *
 * Ou seja: procurar por algo que não existe — exatamente quando a pessoa mais
 * espera a tela responder — dava erro.
 *
 * `wa_buscar_mensagens` é SECURITY DEFINER e aplica as MESMAS duas cláusulas da
 * policy (`empresa_id = get_my_empresa_id()` e `can_access_wa_conversa`)
 * explicitamente, só que com o trigram cortando primeiro. Mesmo resultado,
 * verificado lado a lado: 22 ms para o termo raro.
 */
export function useWaBuscarMensagens() {
  return useMutation({
    mutationFn: async ({ termo, from, to }: { termo: string; from?: Date; to?: Date }) => {
      if (!termo.trim()) return [] as WaMensagemBusca[];

      const inicio = from ? new Date(from) : null;
      inicio?.setHours(0, 0, 0, 0);
      const fim = to ? new Date(to) : null;
      fim?.setHours(23, 59, 59, 999);

      const { data, error } = await supabase.rpc('wa_buscar_mensagens', {
        p_termo: termo.trim(),
        p_de: inicio ? inicio.toISOString() : undefined,
        p_ate: fim ? fim.toISOString() : undefined,
        p_limite: 100,
      });
      if (error) throw error;

      // A RPC devolve as colunas da conversa achatadas (o PostgREST não aninha
      // resultado de função); a tela consome o formato aninhado de antes.
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        conversa_id: r.conversa_id,
        conteudo: r.conteudo,
        created_at: r.created_at,
        direcao: r.direcao,
        conversa: {
          id: r.conversa_id,
          nome_contato: r.conversa_nome_contato,
          telefone: r.conversa_telefone,
          foto_perfil_url: r.conversa_foto_perfil_url,
          is_group: r.conversa_is_group,
        },
      })) as WaMensagemBusca[];
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
      mentions?: string;
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
            mentions: params.mentions ?? null,
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
            return { ...c, ultima_mensagem: vars.mensagem, ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_direcao: 'saida', responsaveis };
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

// --- Editar uma mensagem de texto já enviada ---
// Chama whatsapp-edit-message, que troca o texto na uazapi (POST /message/edit) e
// grava `conteudo`/`editada` no banco. O WhatsApp só deixa editar as mensagens de
// TEXTO que a própria conta enviou, e só nos ~15 primeiros minutos — o botão
// "Editar" no WhatsAppInbox.tsx já respeita isso, e a edge function refaz a
// checagem. Otimista: mostra o texto novo na hora e marca "editada".

export function useWaEditarMensagem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { conversaId: string; mensagemId: string; novoTexto: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-edit-message', {
        body: { mensagemId: params.mensagemId, novoTexto: params.novoTexto },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao editar mensagem');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      const texto = vars.novoTexto.trim();
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversaId], (old) =>
        (old ?? []).map((m) =>
          m.id === vars.mensagemId
            ? {
                ...m,
                conteudo: texto,
                editada: true,
                editada_at: new Date().toISOString(),
                conteudo_original: m.conteudo_original ?? m.conteudo,
              }
            : m,
        ),
      );
    },

    onError: (err: Error, vars) => {
      qc.invalidateQueries({ queryKey: ['wa_mensagens', vars.conversaId] });
      toast.error(err?.message ?? 'Erro ao editar mensagem');
    },
  });
}

// --- Encaminhar uma mensagem para outras conversas ---
// Encaminhar no WhatsApp é, na prática, reenviar o mesmo conteúdo: reaproveita a
// edge function whatsapp-send (texto ou mídia) uma vez por conversa de destino.
// Sequencial e com uma pausa curta entre envios para não estourar o limite da
// operadora. Devolve quantas deram certo e quais falharam.

// Placeholders que o whatsapp-send grava em `conteudo` quando a mídia vem sem
// legenda — não devem ser reenviados como se fossem texto digitado.
const PLACEHOLDERS_MIDIA = new Set(['[Imagem]', '[Áudio]', '[Vídeo]', '[Documento]', '[Sticker]', '[mensagem]']);

// Prefixo que marca a mensagem como encaminhada. Como o encaminhamento é um
// reenvio (não existe "forward" nativo na uazapi que a gente use), o aviso vai
// no próprio texto/legenda, numa linha separada acima do conteúdo. Texto puro,
// sem marcação de itálico — o CRM não renderiza `_x_` e mostraria os underscores.
export const MARCADOR_ENCAMINHADA = '↪ Encaminhada';

export function ehEncaminhada(conteudo: string | null | undefined): boolean {
  return (conteudo ?? '').startsWith(MARCADOR_ENCAMINHADA);
}

// Junta a marca ao texto. Se o texto já vem com a marca (ex: editar uma mensagem
// que já era encaminhada), não duplica.
export function comMarcadorEncaminhada(texto: string): string {
  const t = semMarcadorEncaminhada(texto);
  return t ? `${MARCADOR_ENCAMINHADA}\n${t}` : MARCADOR_ENCAMINHADA;
}

// Tira a linha da marca, devolvendo só o conteúdo de verdade — é o que o campo
// de edição mostra, para ninguém editar (nem apagar sem querer) o "Encaminhada".
export function semMarcadorEncaminhada(conteudo: string | null | undefined): string {
  const c = conteudo ?? '';
  if (!ehEncaminhada(c)) return c.trim();
  const resto = c.slice(MARCADOR_ENCAMINHADA.length);
  return resto.replace(/^\r?\n/, '').trim();
}

export function useWaEncaminharMensagem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      mensagem: WaMensagem;
      destinos: { id: string; telefone: string }[];
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');
      if (params.destinos.length === 0) throw new Error('Escolha ao menos uma conversa.');

      const m = params.mensagem;
      const ehMidia = !!m.media_url && m.tipo !== 'texto';
      const legenda = m.conteudo && !PLACEHOLDERS_MIDIA.has(m.conteudo) ? m.conteudo : '';

      // Cartão de contato: reenvia como cartão (um por vez), não como texto.
      const itensContato = m.tipo === 'contato' ? (m.contato_payload?.itens ?? []) : [];

      const corpoBase: Record<string, unknown> = itensContato.length > 0
        ? { tipo: 'contato' }
        : ehMidia
        ? {
            tipo: m.tipo,
            media_url: m.media_url,
            media_mime: m.media_mime ?? null,
            // Em documento, `conteudo` guarda o nome do arquivo (ver whatsapp-send),
            // então a marca vai sozinha na legenda; nos demais tipos, acima da legenda.
            mensagem: m.tipo === 'documento'
              ? MARCADOR_ENCAMINHADA
              : comMarcadorEncaminhada(legenda),
            nome_arquivo: m.tipo === 'documento' ? m.conteudo : null,
            ptt: m.tipo === 'audio',
          }
        : { tipo: 'texto', mensagem: comMarcadorEncaminhada(m.conteudo) };

      // Uma mensagem normal = um envio por destino; um cartão de contato com N
      // pessoas = N envios por destino (a uazapi manda um vCard por chamada).
      const corpos: Record<string, unknown>[] = itensContato.length > 0
        ? itensContato.map((it) => ({
            tipo: 'contato',
            contato_nome: it.nome,
            contato_telefone: it.telefone,
          }))
        : [corpoBase];

      const falhas: string[] = [];
      let ok = 0;
      for (const destino of params.destinos) {
        try {
          for (const corpo of corpos) {
            const res = await supabase.functions.invoke('whatsapp-send', {
              body: { ...corpo, telefone: destino.telefone, conversa_id: destino.id },
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.error) throw await erroLegivelDaFunction(res.error, 'Falha ao encaminhar');
            if (res.data?.error) throw new Error(res.data.error);
          }
          ok += 1;
        } catch (e) {
          falhas.push(e instanceof Error ? e.message : 'erro desconhecido');
        }
        // Pausa curta entre envios consecutivos.
        if (params.destinos.length > 1) await new Promise((r) => setTimeout(r, 400));
      }

      return { ok, falhas, total: params.destinos.length };
    },

    onSuccess: (r, vars) => {
      // Atualiza a lista e as mensagens das conversas que receberam o encaminhamento.
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      for (const d of vars.destinos) {
        qc.invalidateQueries({ queryKey: ['wa_mensagens', d.id] });
      }
      if (r.falhas.length === 0) {
        toast.success(r.total === 1 ? 'Mensagem encaminhada' : `Encaminhada para ${r.ok} conversas`);
      } else if (r.ok === 0) {
        toast.error(`Não foi possível encaminhar: ${r.falhas[0]}`);
      } else {
        toast.warning(`Encaminhada para ${r.ok} de ${r.total}. ${r.falhas.length} falhou.`);
      }
    },

    onError: (err: Error) => {
      toast.error(err?.message ?? 'Erro ao encaminhar mensagem');
    },
  });
}

// --- Enviar cartão(ões) de contato para a conversa aberta ---
// Um cartão por chamada à whatsapp-send (a uazapi manda um vCard por vez);
// sequencial, com pausa curta entre eles, igual ao encaminhar.
export function useWaEnviarContatos() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      conversa: { id: string; telefone: string };
      contatos: { nome: string; telefone: string }[];
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');
      const contatos = params.contatos.filter((c) => c.nome?.trim() && c.telefone?.trim());
      if (contatos.length === 0) throw new Error('Escolha ao menos um contato com telefone.');

      const falhas: string[] = [];
      let ok = 0;
      for (const c of contatos) {
        try {
          const res = await supabase.functions.invoke('whatsapp-send', {
            body: {
              tipo: 'contato',
              telefone: params.conversa.telefone,
              conversa_id: params.conversa.id,
              contato_nome: c.nome.trim(),
              contato_telefone: c.telefone.trim(),
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.error) throw await erroLegivelDaFunction(res.error, 'Falha ao enviar contato');
          if (res.data?.error) throw new Error(res.data.error);
          ok += 1;
        } catch (e) {
          falhas.push(e instanceof Error ? e.message : 'erro desconhecido');
        }
        if (contatos.length > 1) await new Promise((r) => setTimeout(r, 400));
      }
      return { ok, falhas, total: contatos.length };
    },

    onSuccess: (r, vars) => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_mensagens', vars.conversa.id] });
      if (r.falhas.length === 0) {
        toast.success(r.total === 1 ? 'Contato enviado' : `${r.ok} contatos enviados`);
      } else if (r.ok === 0) {
        toast.error(`Não foi possível enviar: ${r.falhas[0]}`);
      } else {
        toast.warning(`${r.ok} de ${r.total} enviados. ${r.falhas.length} falhou.`);
      }
    },

    onError: (err: Error) => {
      toast.error(err?.message ?? 'Erro ao enviar contato');
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
        // 🔴 `.eq('lida', false)` NÃO é otimização, é o conserto de um desperdício medido.
        //
        // Sem ele, abrir uma conversa REESCREVIA todas as mensagens recebidas dela — inclusive
        // as lidas há semanas. Medido em 25/08/2026, na conversa mais pesada (1.574 recebidas,
        // ZERO não lidas): 2.155 ms e 1.196 páginas de disco sujas, para não mudar nada. Com o
        // filtro: 6,7 ms e ZERO páginas. As páginas sujas são o que consome o orçamento de
        // disco do Supabase, e isso rodou 17.382 vezes.
        //
        // Média por abertura: 38 linhas reescritas, das quais ~4% precisavam mudar.
        //
        // O chat interno já fazia certo (`use-chat.ts:658`); só este tinha ficado sem.
        .eq('direcao', 'entrada')
        .eq('lida', false);

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
  const { profile } = useAuth();
  const navigate = useNavigate();
  const empresaId = profile?.empresa_id ?? null;
  // Guarda o último nao_lidas conhecido por conversa para detectar incrementos
  // (chegada de mensagem nova) mesmo com a tela de WhatsApp fechada.
  const prevNaoLidasRef = useRef<Record<string, number>>({});

  const query = useQuery<number>({
    // A empresa entra na chave: sem isso, trocar de conta na mesma aba reaproveita
    // a contagem da anterior até o próximo refetch.
    queryKey: ['unread_wa_count', empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_conversas')
        .select('id, nao_lidas')
        .eq('empresa_id', empresaId!)
        .eq('arquivada', false)
        .gt('nao_lidas', 0);
      (data ?? []).forEach((r) => {
        prevNaoLidasRef.current[r.id] = r.nao_lidas ?? 0;
      });
      return (data ?? []).reduce((sum, r) => sum + (r.nao_lidas ?? 0), 0);
    },
    // `getEmpresaId()` fazia `auth.getUser()` + um `select` em usuarios A CADA
    // execução — 3 idas ao servidor por refetch, numa consulta que já acumulou
    // 213 mil chamadas. O `profile` já está em memória.
    enabled: !!empresaId,
    // Este número é um badge. Não justifica refazer a consulta mais de uma vez
    // por meio minuto, mesmo que algo peça.
    staleTime: 30_000,
  });

  /**
   * Coalescência das invalidações.
   *
   * Antes, CADA evento de `whatsapp_conversas` chamava `invalidateQueries`, e
   * `invalidateQueries` ignora `staleTime` — então cada evento virava um refetch
   * imediato. Numa rajada de webhook (dezenas de conversas atualizadas em
   * segundos) isso vira dezenas de consultas idênticas em sequência.
   *
   * O resultado medido: 213.738 chamadas, 7,98 h de CPU de banco — 21% do banco
   * inteiro gasto num contador de badge, que é a consulta nº 1 do sistema.
   *
   * Uma janela de 3 s transforma a rajada inteira num refetch só. O badge não
   * precisa de precisão ao segundo.
   */
  const invalidacaoPendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarInvalidacao = useCallback(() => {
    if (invalidacaoPendente.current) return;
    invalidacaoPendente.current = setTimeout(() => {
      invalidacaoPendente.current = null;
      qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
    }, 3_000);
  }, [qc]);

  // Assinatura global (sempre montada via AppSidebar) para garantir que o toast
  // dispare mesmo se o usuário não estiver com a tela de WhatsApp aberta no momento.
  useEffect(() => {
    if (!empresaId) return;
    const channel = supabase
      .channel(`wa-unread-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      // `filter` de empresa: sem ele, TODO cliente de TODA empresa recebia TODO
      // evento de conversa e reagia a ele — inclusive disparando o toast de
      // "nova mensagem" a partir de dados de outra empresa.
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'whatsapp_conversas',
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        agendarInvalidacao();

        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const row = payload.new as WaConversa;
          const prevCount = prevNaoLidasRef.current[row.id] ?? 0;
          const currentCount = row.nao_lidas ?? 0;

          if (currentCount > prevCount) {
            const nomeConversa = row.nome_contato || row.telefone;
            const ultimaMensagem = row.ultima_mensagem?.trim();
            // `ultima_mensagem` vem como placeholder cru ("[Áudio]", "[Imagem]"...)
            // quando não é texto — `infoPreviewMensagem` troca isso por ícone +
            // rótulo (mesma tradução usada no preview da lista de conversas em
            // WhatsAppInbox.tsx). Sem isto o toast mostrava o texto cru mesmo.
            const infoTipo = infoPreviewMensagem(ultimaMensagem);
            const descricao = infoTipo
              ? createElement(
                  'span',
                  { className: 'inline-flex items-center gap-1' },
                  createElement(infoTipo.icon, { size: 14, className: 'shrink-0' }),
                  infoTipo.label,
                )
              : ultimaMensagem
                ? ultimaMensagem.length > MENSAGEM_TOAST_MAX_CHARS
                  ? `${ultimaMensagem.slice(0, MENSAGEM_TOAST_MAX_CHARS)}...`
                  : ultimaMensagem
                : 'Nova mensagem';
            toast(() => createElement('span', null, createElement('b', null, nomeConversa), ' enviou uma mensagem'), {
              description: descricao,
              style: { background: '#f97316', color: '#fff', border: 'none' },
              descriptionClassName: '!text-white/90',
              // Leva direto para a conversa que gerou o toast — `row.id` já veio no
              // payload do realtime, sem precisar de consulta extra.
              action: {
                label: 'Abrir conversa',
                onClick: () => navigate(`/whatsapp?conversaId=${row.id}`),
              },
              actionButtonStyle: { background: 'rgba(255,255,255,0.2)', color: '#fff' },
            });
          }

          prevNaoLidasRef.current[row.id] = currentCount;
        }
      })
      .subscribe((status, err) => {
        if (err) console.error('[unread_wa_count] falha na subscription realtime:', status, err);
      });
    return () => {
      // Cancela a invalidação em voo junto com o canal: sem isto, desmontar e
      // remontar (troca de rota) deixa um timer órfão pedindo refetch de uma
      // query que pode nem existir mais.
      if (invalidacaoPendente.current) {
        clearTimeout(invalidacaoPendente.current);
        invalidacaoPendente.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [qc, empresaId, agendarInvalidacao, navigate]);

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

        // Alguém sendo atribuído desarma o alarme de "precisa assumir" — único
        // ponto de escrita desta coluna no sentido inverso do webhook. Ver
        // `precisa_atribuicao` em WaConversa.
        const { error: flagErr } = await supabase
          .from('whatsapp_conversas')
          .update({ precisa_atribuicao: false })
          .eq('id', conversaId);
        if (flagErr) throw flagErr;
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

// Registra que o usuário logado abriu uma conversa "Não atribuída" — só serve
// pro gestor enxergar quem do time está entrando na conversa e não está
// assumindo (pilha de avatares na lista). Não mexe em lida/não lida, que já
// tem o próprio mecanismo (useWaMarcarLida). Upsert: reabrir a mesma conversa
// não duplica linha, só atualiza `visualizado_em`.
export function useWaRegistrarVisualizacao() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    // Chama a função de banco em vez de fazer upsert direto: a REST API do
    // PostgREST só aceita valor literal no payload, não "quantidade =
    // quantidade + 1" — sem RPC, duas visualizações quase simultâneas leriam
    // o mesmo valor antigo e uma pisaria na outra. wa_registrar_visualizacao
    // (migration wa_conversa_visualizacoes_quantidade) resolve isso num único
    // INSERT ... ON CONFLICT atômico, e só soma quantidade quando a conversa
    // reabriu (precisa_atribuicao=true) depois da última vez que este usuário
    // olhou — nunca a cada vez que a mesma aba é reaberta sem nada mudar.
    mutationFn: async (conversaId: string) => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .rpc('wa_registrar_visualizacao', { _conversa_id: conversaId })
        .single();
      if (error) throw error;
      return data as { quantidade: number; visualizado_em: string } | null;
    },
    onSuccess: (data, conversaId) => {
      if (!profile?.id || !data) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => {
          if (c.id !== conversaId) return c;
          const jaVisualizou = c.visualizadores?.some((v) => v.id === profile.id);
          const visualizadores = jaVisualizou
            ? (c.visualizadores ?? []).map((v) =>
                v.id === profile.id
                  ? { ...v, visualizado_em: data.visualizado_em, quantidade: data.quantidade }
                  : v,
              )
            : [
                ...(c.visualizadores ?? []),
                {
                  id: profile.id,
                  nome: profile.nome,
                  avatar_url: profile.avatar_url ?? null,
                  visualizado_em: data.visualizado_em,
                  quantidade: data.quantidade,
                },
              ];
          return { ...c, visualizadores };
        }),
      );
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
      return data as unknown as WaMensagem;
    },
    // O `.insert().select()` devolve só as colunas de `whatsapp_mensagens`,
    // sem o join `usuario:usuarios(...)` do MENSAGEM_SELECT (ver
    // `buscarUsuarioNoCache`) — sem preencher isso aqui, a nota nascia no
    // cache do autor sem `usuario.nome`, e a UI de "nota interna" usa
    // exatamente esse campo pra diferenciar nota digitada (âmbar) de nota de
    // sistema (cinza): sem nome, caía sempre em cinza pra quem acabou de
    // criar, mesmo a nota sendo âmbar pra todo mundo depois de recarregar.
    onSuccess: (nota) => {
      const usuario = buscarUsuarioNoCache(qc, nota.usuario_id ?? profile?.id ?? '', profile);
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', nota.conversa_id], (old) =>
        old ? [...old, { ...nota, usuario }] : old,
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
      return data as unknown as WaMensagem;
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
      let telefone = normalizeWhatsappPhone(params.telefone);

      // Número ambíguo (fixo × conta que usa o 9): se JÁ existe conversa em
      // qualquer uma das variantes, reaproveita a existente em vez de criar uma
      // segunda — o histórico do contato não pode rachar em duas conversas por
      // causa de um dígito. Quem decide qual variante é a verdadeira, quando
      // nenhuma existe ainda, é o fallback do whatsapp-send no primeiro envio.
      const alternativa = varianteDoNumero(telefone);
      if (alternativa) {
        const { data: existentes } = await supabase
          .from('whatsapp_conversas')
          .select('telefone')
          .in('telefone', [telefone, alternativa])
          .limit(2);
        const exata = existentes?.find((c) => c.telefone === telefone);
        if (!exata && existentes?.length) telefone = existentes[0].telefone;
      }

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

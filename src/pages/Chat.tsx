import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useChatMessages, useSendMessage, useChatGrupos, useClearChat, useUpdateChatGrupo, ChatGrupo, ChatMessage, useMarkChatAsRead } from '@/hooks/use-chat';
import { useUnreadChatByTarget } from '@/hooks/use-notificacoes';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Send, Loader2, MessageCircle, Users, Circle, PanelLeftClose, PanelLeftOpen,
  Paperclip, FileText, Image, X, Download, Users2, Calendar, Eraser, ChevronDown,
  Video, Link2, ExternalLink, Play, Camera, Pencil, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, autoResizeTextarea } from '@/lib/utils';
import { CreateGroupDialog } from '@/components/chat/CreateGroupDialog';
import { validateFile } from '@/lib/file-validation';
import { FilePreviewDialog, isPreviewable, type FilePreviewTarget } from '@/components/FilePreviewDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CHAT_ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const CHAT_ALLOWED_MIME = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'application/vnd.ms-excel', 'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed'];

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = [
  'bg-primary', 'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5',
];

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Vendedor {
  id: string;
  nome: string;
  email: string;
  role: string;
  avatar_url?: string | null;
}

type ChatTarget = { type: 'geral' } | { type: 'dm'; memberId: string; recipientId: string } | { type: 'grupo'; grupoId: string };

function MembersList({
  members,
  myId,
  target,
  onSelect,
  collapsed,
  onToggle,
  grupos,
  unreadCounts,
}: {
  members: Vendedor[];
  myId: string | null;
  target: ChatTarget;
  onSelect: (t: ChatTarget) => void;
  collapsed: boolean;
  onToggle: () => void;
  grupos: ChatGrupo[];
  unreadCounts: Record<string, number>;
}) {
  if (collapsed) {
    return (
      <div className="w-12 border-r border-border flex flex-col h-full shrink-0 items-center gap-1">
        <div className="relative">
          <button
            onClick={() => onSelect({ type: 'geral' })}
            className={cn('p-1 rounded-lg transition-colors', target.type === 'geral' ? 'bg-primary/10' : 'hover:bg-muted/50')}
            title="Chat Geral"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-[8px]">
                <Users className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
          </button>
          {unreadCounts['geral'] > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-destructive-foreground ring-1 ring-background">
              {unreadCounts['geral']}
            </span>
          )}
        </div>
        {grupos.map(g => {
          const count = unreadCounts[`grupo_${g.id}`];
          return (
            <div key={g.id} className="relative">
              <button
                onClick={() => onSelect({ type: 'grupo', grupoId: g.id })}
                className={cn('p-1 rounded-lg transition-colors', target.type === 'grupo' && target.grupoId === g.id ? 'bg-primary/10' : 'hover:bg-muted/50')}
                title={g.nome}
              >
                <Avatar className="h-7 w-7">
                  {g.foto_url && (
                    <img src={g.foto_url} alt={g.nome} className="h-full w-full object-cover" />
                  )}
                  <AvatarFallback className="bg-chart-2 text-white text-[8px] font-semibold">
                    <Users2 className="h-3.5 w-3.5" />
                  </AvatarFallback>
                </Avatar>
              </button>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-destructive-foreground ring-1 ring-background">
                  {count}
                </span>
              )}
            </div>
          );
        })}
        {members.map((m) => {
          const count = unreadCounts[`dm_${m.id}`];
          return (
            <div key={m.id} className="relative">
              <button
                onClick={() => onSelect({ type: 'dm', memberId: m.id, recipientId: m.id })}
                className={cn('p-1 rounded-lg transition-colors', target.type === 'dm' && target.memberId === m.id ? 'bg-primary/10' : 'hover:bg-muted/50')}
                title={m.nome}
              >
                <Avatar className="h-7 w-7 border border-primary/10">
                  {m.avatar_url && (
                    <img src={m.avatar_url} alt={m.nome} className="h-full w-full object-cover" />
                  )}
                  <AvatarFallback className={`${colorForId(m.id)} text-white text-[8px] font-semibold`}>
                    {getInitials(m.nome)}
                  </AvatarFallback>
                </Avatar>
              </button>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-destructive-foreground ring-1 ring-background">
                  {count}
                </span>
              )}
            </div>
          );
        })}
        <div className="mt-auto border-t border-border w-full flex justify-center py-2 h-[4rem] items-center bg-muted/30">
          <button onClick={onToggle} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" title="Expandir equipe">
            <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border flex flex-col h-full shrink-0">
      <div className="px-4 py-3 border-b border-border flex items-center h-[4rem]">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-1">
          <Users className="h-4 w-4 text-primary" />
          Equipe
          <span className="text-[10px] text-muted-foreground font-normal">{members.length}</span>
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {/* Chat geral */}
          <button
            onClick={() => onSelect({ type: 'geral' })}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left',
              target.type === 'geral' ? 'bg-primary/10' : 'hover:bg-muted/50'
            )}
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
                <Users className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">Chat Geral</p>
              <p className="text-[10px] text-muted-foreground">Toda a equipe</p>
            </div>
            {unreadCounts['geral'] > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {unreadCounts['geral']}
              </span>
            )}
          </button>

          {/* Grupos */}
          {grupos.length > 0 && (
            <div className="pt-2 pb-1 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Grupos</p>
            </div>
          )}
          {grupos.map(g => (
            <button
              key={g.id}
              onClick={() => onSelect({ type: 'grupo', grupoId: g.id })}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left',
                target.type === 'grupo' && target.grupoId === g.id ? 'bg-primary/10' : 'hover:bg-muted/50'
              )}
            >
              <Avatar className="h-8 w-8">
                {g.foto_url && (
                  <img src={g.foto_url} alt={g.nome} className="h-full w-full object-cover" />
                )}
                <AvatarFallback className="bg-chart-2 text-white text-[10px] font-semibold">
                  <Users2 className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{g.nome}</p>
                <p className="text-[10px] text-muted-foreground">Grupo</p>
              </div>
              {unreadCounts[`grupo_${g.id}`] > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {unreadCounts[`grupo_${g.id}`]}
                </span>
              )}
            </button>
          ))}

          {/* Criar grupo */}
          <div className="pt-1">
            <CreateGroupDialog members={members} myId={myId} />
          </div>

          {/* Membros */}
          <div className="pt-2 pb-1 px-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Membros</p>
          </div>
          {members.filter(m => m.id !== myId).map((m) => {
            const isMe = m.id === myId;
            const isSelected = target.type === 'dm' && target.memberId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect({ type: 'dm', memberId: m.id, recipientId: m.id })}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
              >
                <div className="relative">
                  <Avatar className="h-8 w-8 border border-primary/10">
                    {m.avatar_url && (
                      <img src={m.avatar_url} alt={m.nome} className="h-full w-full object-cover" />
                    )}
                    <AvatarFallback className={`${colorForId(m.id)} text-white text-[10px] font-semibold`}>
                      {getInitials(m.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-emerald-500 text-background stroke-[3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {m.nome} {isMe && <span className="text-muted-foreground font-normal">(você)</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize truncate">{m.role}</p>
                </div>
                {unreadCounts[`dm_${m.id}`] > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {unreadCounts[`dm_${m.id}`]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t border-border px-3 py-2 mt-auto bg-muted/30 h-[4rem] flex items-center">
        <button onClick={onToggle} className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground" title="Recolher equipe">
          <PanelLeftClose className="h-4 w-4" />
          <span className="text-[10px]">Recolher</span>
        </button>
      </div>
    </div>
  );
}

const Chat = () => {
  const [target, setTarget] = useState<ChatTarget>({ type: 'geral' });
  const [teamCollapsed, setTeamCollapsed] = useState(false);
  const [text, setText] = useState('');
  const [previewFile, setPreviewFile] = useState<FilePreviewTarget | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    autoResizeTextarea(inputRef.current);
  }, [text]);

  const activeGrupoId = target.type === 'grupo' ? target.grupoId : null;
  const activeRecipientId = target.type === 'dm' ? target.recipientId : null;
  const { data: messages, isLoading } = useChatMessages(activeGrupoId, activeRecipientId);
  const { send, sending } = useSendMessage();
  const clearChat = useClearChat();
  const { data: grupos = [] } = useChatGrupos();
  const updateGrupo = useUpdateChatGrupo();
  const [editingGrupoNome, setEditingGrupoNome] = useState(false);
  const [grupoNomeInput, setGrupoNomeInput] = useState('');
  const grupoFotoInputRef = useRef<HTMLInputElement>(null);
  const markAsRead = useMarkChatAsRead();
  const { data: unreadCounts = {} } = useUnreadChatByTarget();
  const [expandedMediaTab, setExpandedMediaTab] = useState<
    'imagens' | 'videos' | 'documentos' | 'links' | null
  >(null);

  const MEDIA_PREVIEW_LIMIT = 3;

  const midia = useMemo(() => {
    const imagens = (messages ?? []).filter((m) => m.arquivo_url && m.arquivo_tipo?.startsWith('image/'));
    const videos = (messages ?? []).filter((m) => m.arquivo_url && m.arquivo_tipo?.startsWith('video/'));
    const documentos = (messages ?? []).filter(
      (m) => m.arquivo_url && !m.arquivo_tipo?.startsWith('image/') && !m.arquivo_tipo?.startsWith('video/')
    );

    const urlRegex = /https?:\/\/[^\s]+/g;
    const links: { id: string; url: string; created_at: string }[] = [];
    for (const m of messages ?? []) {
      if (m.arquivo_url || !m.conteudo) continue;
      const matches = m.conteudo.match(urlRegex);
      if (!matches) continue;
      matches.forEach((raw, i) => {
        const url = raw.replace(/[.,;:!?)\]]+$/, '');
        links.push({ id: `${m.id}-${i}`, url, created_at: m.created_at });
      });
    }

    return { imagens, videos, documentos, links };
  }, [messages]);

  const renderImagens = (items: typeof midia.imagens) => (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((m) => (
        <a
          key={m.id}
          href={m.arquivo_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="aspect-square rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity"
          title={format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
        >
          <img src={m.arquivo_url!} alt={m.arquivo_nome ?? 'imagem'} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );

  const renderVideos = (items: typeof midia.videos) => (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((m) => (
        <a
          key={m.id}
          href={m.arquivo_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="relative aspect-square rounded-md overflow-hidden border border-border bg-black/5 hover:opacity-80 transition-opacity"
          title={format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
        >
          <video src={m.arquivo_url!} className="h-full w-full object-cover" muted />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="h-5 w-5 text-white fill-white" />
          </span>
        </a>
      ))}
    </div>
  );

  const renderDocumentos = (items: typeof midia.documentos) => (
    <div className="space-y-2">
      {items.map((m) => {
        const isPreviewableDoc = isPreviewable(m.arquivo_nome ?? 'arquivo', m.arquivo_tipo);
        return (
          <div
            key={m.id}
            className={cn(
              'flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors',
              isPreviewableDoc && 'cursor-pointer'
            )}
            onClick={
              isPreviewableDoc
                ? () => setPreviewFile({ url: m.arquivo_url!, nome: m.arquivo_nome ?? 'Arquivo', mime: m.arquivo_tipo })
                : undefined
            }
          >
            <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" title={m.arquivo_nome ?? 'Arquivo'}>
                {m.arquivo_nome ?? 'Arquivo'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {m.vendedor?.nome} • {format(new Date(m.created_at), 'dd MMM, HH:mm', { locale: ptBR })}
              </p>
            </div>
            <a
              href={m.arquivo_url!}
              download={m.arquivo_nome!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        );
      })}
    </div>
  );

  const renderLinks = (items: typeof midia.links) => (
    <ul className="space-y-1.5">
      {items.map((l) => {
        let host = l.url;
        try {
          host = new URL(l.url).hostname.replace(/^www\./, '');
        } catch {
          // mantém a URL bruta se não for parseável
        }
        return (
          <li key={l.id}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
                <Link2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" title={l.url}>
                  {host}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{l.url}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
          </li>
        );
      })}
    </ul>
  );

  const MEDIA_TAB_LABELS: Record<'imagens' | 'videos' | 'documentos' | 'links', string> = {
    imagens: 'Imagens',
    videos: 'Vídeos',
    documentos: 'Documentos',
    links: 'Links',
  };

  const { data: myVendedor } = useQuery({
    queryKey: ['my-vendedor'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_my_vendedor_id');
      return data as string;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['chat-members'],
    queryFn: async () => {
      const { data: me } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single();
      if (!me?.empresa_id) return [];
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, role, avatar_url')
        .eq('empresa_id', me.empresa_id)
        .order('nome');
      if (error) throw error;
      return (data as Vendedor[]) ?? [];
    },
  });

  const { data: grupoMembros = [] } = useQuery({
    queryKey: ['chat-grupo-membros', activeGrupoId],
    enabled: !!activeGrupoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_grupo_membros')
        .select('usuario:usuarios(id, nome, email, role, avatar_url)')
        .eq('grupo_id', activeGrupoId!);
      if (error) throw error;
      return ((data ?? []) as unknown as { usuario: Vendedor | null }[])
        .map((r) => r.usuario)
        .filter((u): u is Vendedor => !!u);
    },
  });

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    // Mark messages as read when they are loaded in the view
    markAsRead.mutate({ grupoId: activeGrupoId, recipientId: activeRecipientId });

    // Only auto-scroll to bottom if we are already near the bottom or it's the initial load
    // For simplicity, we just scroll down when new messages arrive.
    // If the user scrolled up, showing the button is better.
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      setTimeout(() => {
        const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 150;
        if (isNearBottom || messages.length > 0) { // always auto scroll on new message for now
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 50);
    }
  }, [messages?.length, activeGrupoId, activeRecipientId]);

  const scrollToBottom = () => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
    setShowScrollBottom(!isNearBottom);
  };

  useEffect(() => {
    // Focus input when changing chat target
    inputRef.current?.focus();
    // Also mark as read when switching chat
    markAsRead.mutate({ grupoId: activeGrupoId, recipientId: activeRecipientId });
  }, [target]);

  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (target.type !== 'geral') {
          setTarget({ type: 'geral' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
    };
  }, [target]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && selectedFiles.length === 0) return;
    setText('');
    const files = [...selectedFiles];
    setSelectedFiles([]);
    await send(trimmed, files, activeGrupoId, activeRecipientId);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => 
      validateFile(file, { allowedExtensions: CHAT_ALLOWED_EXT, allowedMimePrefixes: CHAT_ALLOWED_MIME })
    );
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleGrupoFotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeGrupoId) return;
    updateGrupo.mutate({ grupoId: activeGrupoId, foto: file });
  };

  const handleSaveGrupoNome = () => {
    if (!activeGrupoId) return;
    const nome = grupoNomeInput.trim();
    if (!nome) return;
    updateGrupo.mutate({ grupoId: activeGrupoId, nome });
    setEditingGrupoNome(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const grouped = useMemo(() => {
    if (!messages) return [];
    const groups: { date: string; msgs: typeof messages }[] = [];
    let currentDate = '';
    for (const msg of messages) {
      const d = format(new Date(msg.created_at), 'dd/MM/yyyy');
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, msgs: [] });
      }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  }, [messages]);

  // Resolve header info
  const activeGrupo = grupos.find(g => g.id === activeGrupoId);
  const selectedMemberData = target.type === 'dm' ? members.find(m => m.id === target.memberId) : null;
  
  let chatHeaderName = 'Chat Geral';
  let chatHeaderSub = `${members.length} membros`;
  if (target.type === 'grupo' && activeGrupo) {
    chatHeaderName = activeGrupo.nome;
    chatHeaderSub = 'Grupo';
  } else if (target.type === 'dm' && selectedMemberData) {
    chatHeaderName = selectedMemberData.nome;
    chatHeaderSub = selectedMemberData.role;
  }

  const headerContent = (
    <div className="flex items-center gap-3">
      <MessageCircle className="h-5 w-5 text-primary" />
      <div>
        <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight md:text-xl">Chat Interno</h1>
        <p className="text-[10px] sm:text-sm text-muted-foreground">Converse com sua equipe em tempo real</p>
      </div>
    </div>
  );

  return (
    <AppLayout headerContent={headerContent} mainClassName="flex-1 overflow-hidden">
      <div className="flex h-full">
        <MembersList
          members={members}
          myId={myVendedor ?? null}
          target={target}
          onSelect={setTarget}
          collapsed={teamCollapsed}
          onToggle={() => setTeamCollapsed(prev => !prev)}
          grupos={grupos}
          unreadCounts={unreadCounts}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 h-[4rem]">
            <Sheet onOpenChange={(v) => { if (v && target.type === 'grupo') setGrupoNomeInput(activeGrupo?.nome ?? ''); if (!v) setEditingGrupoNome(false); }}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 rounded-lg -mx-2 px-2 py-1.5 hover:bg-muted/50 transition-colors text-left"
                  title="Ver detalhes da conversa"
                >
                  {target.type === 'grupo' ? (
                    <>
                      <Avatar className="h-8 w-8">
                        {activeGrupo?.foto_url && (
                          <img src={activeGrupo.foto_url} alt={chatHeaderName} className="h-full w-full object-cover" />
                        )}
                        <AvatarFallback className="bg-chart-2 text-white text-xs">
                          <Users2 className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{chatHeaderName}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{chatHeaderSub}</p>
                      </div>
                    </>
                  ) : target.type === 'dm' ? (
                    <>
                      <Avatar className="h-8 w-8 border border-primary/10">
                        {selectedMemberData.avatar_url && (
                          <img src={selectedMemberData.avatar_url} alt={selectedMemberData.nome} className="h-full w-full object-cover" />
                        )}
                        <AvatarFallback className={`${colorForId(target.memberId)} text-white text-xs`}>
                          {getInitials(chatHeaderName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{chatHeaderName}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{chatHeaderSub}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <Users className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">Chat Geral</p>
                        <p className="text-[10px] text-muted-foreground">{chatHeaderSub}</p>
                      </div>
                    </>
                  )}
                </button>
              </SheetTrigger>

              <div className="ml-auto flex items-center gap-1">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Limpar chat">
                      <Eraser className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso removerá permanentemente todas as mensagens deste chat para todos os participantes. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearChat.mutate({ grupoId: activeGrupoId, recipientId: activeRecipientId })}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Limpar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    Mídia, links e documentos
                  </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {target.type === 'grupo' && (
                      <>
                        <div className="flex items-center gap-3 mb-4">
                          <input
                            ref={grupoFotoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleGrupoFotoSelect}
                          />
                          <button
                            type="button"
                            onClick={() => grupoFotoInputRef.current?.click()}
                            className="relative group shrink-0"
                            title="Trocar foto do grupo"
                          >
                            <Avatar className="h-14 w-14">
                              {activeGrupo?.foto_url && (
                                <img src={activeGrupo.foto_url} alt={chatHeaderName} className="h-full w-full object-cover" />
                              )}
                              <AvatarFallback className="bg-chart-2 text-white">
                                <Users2 className="h-6 w-6" />
                              </AvatarFallback>
                            </Avatar>
                            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Camera className="h-4 w-4 text-white" />
                            </span>
                          </button>
                          <div className="min-w-0 flex-1">
                            {editingGrupoNome ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  autoFocus
                                  value={grupoNomeInput}
                                  onChange={(e) => setGrupoNomeInput(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveGrupoNome()}
                                  className="h-8 text-sm"
                                />
                                <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSaveGrupoNome}>
                                  <Check className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setGrupoNomeInput(activeGrupo?.nome ?? ''); setEditingGrupoNome(true); }}
                                className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                              >
                                <span className="truncate">{chatHeaderName}</span>
                                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                              </button>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">Grupo</p>
                          </div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Users2 className="h-3 w-3" /> Participantes do grupo
                              {grupoMembros.length > 0 && ` (${grupoMembros.length})`}
                            </p>
                            {grupoMembros.length > 0 ? (
                              <ul className="space-y-0.5">
                                {grupoMembros.map((m) => (
                                  <li
                                    key={m.id}
                                    className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
                                  >
                                    <Avatar className="h-6 w-6 shrink-0 border border-primary/10">
                                      {m.avatar_url && (
                                        <img src={m.avatar_url} alt={m.nome} className="h-full w-full object-cover" />
                                      )}
                                      <AvatarFallback className={`${colorForId(m.id)} text-white text-[8px] font-semibold`}>
                                        {getInitials(m.nome)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="flex-1 truncate">
                                      {m.nome} {m.id === myVendedor && <span className="text-muted-foreground font-normal">(você)</span>}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground capitalize shrink-0">{m.role}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground px-1">Nenhum participante encontrado.</p>
                            )}
                          </div>
                          <Separator className="mb-4" />
                        </>
                      )}
                      <Tabs defaultValue="imagens" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 h-8">
                          <TabsTrigger value="imagens" className="text-[10px] px-1">
                            Imagens{midia.imagens.length > 0 && ` (${midia.imagens.length})`}
                          </TabsTrigger>
                          <TabsTrigger value="videos" className="text-[10px] px-1">
                            Vídeos{midia.videos.length > 0 && ` (${midia.videos.length})`}
                          </TabsTrigger>
                          <TabsTrigger value="documentos" className="text-[10px] px-1">
                            Docs{midia.documentos.length > 0 && ` (${midia.documentos.length})`}
                          </TabsTrigger>
                          <TabsTrigger value="links" className="text-[10px] px-1">
                            Links{midia.links.length > 0 && ` (${midia.links.length})`}
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="imagens" className="mt-3">
                          {midia.imagens.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                              Nenhuma imagem trocada nesta conversa.
                            </p>
                          ) : (
                            <>
                              {renderImagens(midia.imagens.slice(0, MEDIA_PREVIEW_LIMIT))}
                              {midia.imagens.length > MEDIA_PREVIEW_LIMIT && (
                                <button
                                  type="button"
                                  className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                                  onClick={() => setExpandedMediaTab('imagens')}
                                >
                                  +{midia.imagens.length - MEDIA_PREVIEW_LIMIT} mais
                                </button>
                              )}
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="videos" className="mt-3">
                          {midia.videos.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                              Nenhum vídeo trocado nesta conversa.
                            </p>
                          ) : (
                            <>
                              {renderVideos(midia.videos.slice(0, MEDIA_PREVIEW_LIMIT))}
                              {midia.videos.length > MEDIA_PREVIEW_LIMIT && (
                                <button
                                  type="button"
                                  className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                                  onClick={() => setExpandedMediaTab('videos')}
                                >
                                  +{midia.videos.length - MEDIA_PREVIEW_LIMIT} mais
                                </button>
                              )}
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="documentos" className="mt-3">
                          {midia.documentos.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                              Nenhum documento trocado nesta conversa.
                            </p>
                          ) : (
                            <>
                              {renderDocumentos(midia.documentos.slice(0, MEDIA_PREVIEW_LIMIT))}
                              {midia.documentos.length > MEDIA_PREVIEW_LIMIT && (
                                <button
                                  type="button"
                                  className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                                  onClick={() => setExpandedMediaTab('documentos')}
                                >
                                  +{midia.documentos.length - MEDIA_PREVIEW_LIMIT} mais
                                </button>
                              )}
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="links" className="mt-3">
                          {midia.links.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                              Nenhum link compartilhado nesta conversa.
                            </p>
                          ) : (
                            <>
                              {renderLinks(midia.links.slice(0, MEDIA_PREVIEW_LIMIT))}
                              {midia.links.length > MEDIA_PREVIEW_LIMIT && (
                                <button
                                  type="button"
                                  className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                                  onClick={() => setExpandedMediaTab('links')}
                                >
                                  +{midia.links.length - MEDIA_PREVIEW_LIMIT} mais
                                </button>
                              )}
                            </>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>

              <Dialog open={!!expandedMediaTab} onOpenChange={(v) => !v && setExpandedMediaTab(null)}>
                <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>{expandedMediaTab ? MEDIA_TAB_LABELS[expandedMediaTab] : ''}</DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto pr-1">
                    {expandedMediaTab === 'imagens' && renderImagens(midia.imagens)}
                    {expandedMediaTab === 'videos' && renderVideos(midia.videos)}
                    {expandedMediaTab === 'documentos' && renderDocumentos(midia.documentos)}
                    {expandedMediaTab === 'links' && renderLinks(midia.links)}
                  </div>
                </DialogContent>
              </Dialog>
          </div>

          {/* Messages */}
          <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            <ScrollArea className="flex-1 px-4" onScroll={handleScroll}>
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !messages?.length ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 pt-16">
                  <MessageCircle className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda. Comece a conversa!</p>
                </div>
              ) : (
                <div className="py-4 space-y-1">
                  {grouped.map((group) => (
                    <div key={group.date}>
                      <div className="flex items-center justify-center my-4">
                        <span className="text-[10px] bg-muted text-muted-foreground px-3 py-1 rounded-full">
                          {group.date}
                        </span>
                      </div>
                      {group.msgs.map((msg, i) => {
                        const isMe = msg.usuario_id === myVendedor;
                        const name = msg.vendedor?.nome ?? 'Desconhecido';
                        const showAvatar = i === 0 || group.msgs[i - 1].usuario_id !== msg.usuario_id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
                          >
                            {showAvatar ? (
                              <Avatar className="h-8 w-8 shrink-0 border border-primary/10">
                                {msg.vendedor?.avatar_url && (
                                  <img src={msg.vendedor.avatar_url} alt={name} className="h-full w-full object-cover" />
                                )}
                                <AvatarFallback className={`${colorForId(msg.usuario_id)} text-white text-xs`}>
                                  {getInitials(name)}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="w-8 shrink-0" />
                            )}
                            <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                              {showAvatar && !isMe && (
                                <p className="text-[10px] font-medium text-muted-foreground mb-0.5 ml-1">{name}</p>
                              )}
                              <div
                                className={`px-3 py-2 rounded-2xl text-sm break-words ${
                                  isMe
                                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                    : 'bg-muted text-foreground rounded-tl-sm'
                                } ${msg.id.startsWith('temp-') ? 'opacity-50 grayscale-[0.5]' : ''}`}
                              >
                                {msg.arquivo_url && (
                                  <div className="mb-1">
                                    {msg.arquivo_tipo?.startsWith('image/') ? (
                                      <div className="relative group/img">
                                        <a href={msg.arquivo_url} target="_blank" rel="noopener noreferrer">
                                          <img
                                            src={msg.arquivo_url}
                                            alt={msg.arquivo_nome || 'imagem'}
                                            className="max-w-[240px] max-h-[200px] rounded-lg object-cover"
                                          />
                                        </a>
                                        <a
                                          href={msg.arquivo_url}
                                          download={msg.arquivo_nome || 'imagem'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="absolute top-2 right-2 p-1.5 bg-background/80 hover:bg-background rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                          title="Baixar imagem"
                                        >
                                          <Download className="h-3.5 w-3.5 text-foreground" />
                                        </a>
                                      </div>
                                    ) : isPreviewable(msg.arquivo_nome || 'arquivo', msg.arquivo_tipo) ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewFile({ url: msg.arquivo_url!, nome: msg.arquivo_nome || 'Arquivo', mime: msg.arquivo_tipo })}
                                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors w-full text-left ${
                                          isMe ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-background/50 hover:bg-background/80'
                                        }`}
                                      >
                                        <FileText className="h-5 w-5 shrink-0" />
                                        <span className="text-xs truncate max-w-[180px]">{msg.arquivo_nome || 'Arquivo'}</span>
                                      </button>
                                    ) : (
                                      <a
                                        href={msg.arquivo_url}
                                        download={msg.arquivo_nome || 'Arquivo'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                          isMe ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-background/50 hover:bg-background/80'
                                        }`}
                                      >
                                        <FileText className="h-5 w-5 shrink-0" />
                                        <span className="text-xs truncate max-w-[180px]">{msg.arquivo_nome || 'Arquivo'}</span>
                                        <Download className="h-4 w-4 shrink-0 ml-auto" />
                                      </a>
                                    )}
                                  </div>
                                )}
                                {msg.conteudo && !(msg.arquivo_url && msg.conteudo === msg.arquivo_nome) && msg.conteudo}
                              </div>
                              <p className={`text-[9px] text-muted-foreground mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                                {format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>
            {showScrollBottom && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute bottom-4 right-8 rounded-full shadow-lg z-10 h-10 w-10 border border-border opacity-90 hover:opacity-100 transition-opacity"
                onClick={scrollToBottom}
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div className="border-t border-border px-4 py-3">
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-lg text-sm max-w-[200px]">
                    {file.type.startsWith('image/') ? (
                      <Image className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <span className="truncate flex-1 text-xs text-foreground">{file.name}</span>
                    <button 
                      onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} 
                      className="p-0.5 hover:bg-background rounded"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="shrink-0"
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                className="flex-1 min-h-9 resize-none py-2 overflow-hidden"
                rows={1}
                disabled={sending}
                autoFocus
              />
              <Button onClick={handleSend} disabled={sending || (!text.trim() && selectedFiles.length === 0)} size="icon">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </AppLayout>
  );
};

export default Chat;

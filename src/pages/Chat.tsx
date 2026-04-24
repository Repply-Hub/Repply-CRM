import { useState, useRef, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useChatMessages, useSendMessage, useChatGrupos, ChatGrupo, ChatMessage } from '@/hooks/use-chat';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Send, Loader2, MessageCircle, Users, Circle, PanelLeftClose, PanelLeftOpen, 
  Paperclip, FileText, Image, X, Download, Users2, Info, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CreateGroupDialog } from '@/components/chat/CreateGroupDialog';
import { validateFile } from '@/lib/file-validation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
}: {
  members: Vendedor[];
  myId: string | null;
  target: ChatTarget;
  onSelect: (t: ChatTarget) => void;
  collapsed: boolean;
  onToggle: () => void;
  grupos: ChatGrupo[];
}) {
  if (collapsed) {
    return (
      <div className="w-12 border-r border-border flex flex-col h-full shrink-0 items-center py-2 gap-1">
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
        {grupos.map(g => (
          <button
            key={g.id}
            onClick={() => onSelect({ type: 'grupo', grupoId: g.id })}
            className={cn('p-1 rounded-lg transition-colors', target.type === 'grupo' && target.grupoId === g.id ? 'bg-primary/10' : 'hover:bg-muted/50')}
            title={g.nome}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-chart-2 text-white text-[8px] font-semibold">
                <Users2 className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
          </button>
        ))}
        {members.map((m) => (
          <button
            key={m.id}
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
        ))}
        <div className="mt-auto pt-2">
          <button onClick={onToggle} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" title="Expandir equipe">
            <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border flex flex-col h-full shrink-0">
      <div className="px-4 py-3 border-b border-border flex items-center">
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
                <AvatarFallback className="bg-chart-2 text-white text-[10px] font-semibold">
                  <Users2 className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{g.nome}</p>
                <p className="text-[10px] text-muted-foreground">Grupo</p>
              </div>
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
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t border-border px-3 py-2">
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeGrupoId = target.type === 'grupo' ? target.grupoId : null;
  const activeRecipientId = target.type === 'dm' ? target.recipientId : null;
  const { data: messages, isLoading } = useChatMessages(activeGrupoId, activeRecipientId);
  const { send, sending } = useSendMessage();
  const { data: grupos = [] } = useChatGrupos();

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

  useEffect(() => {
    if (!messages) return;
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      setTimeout(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }, 50);
    }
  }, [messages, target]);

  useEffect(() => {
    // Focus input when changing chat target
    inputRef.current?.focus();
  }, [target]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;
    setText('');
    const file = selectedFile;
    setSelectedFile(null);
    await send(trimmed, file ?? undefined, activeGrupoId, activeRecipientId);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!validateFile(file, { allowedExtensions: CHAT_ALLOWED_EXT, allowedMimePrefixes: CHAT_ALLOWED_MIME })) return;
    setSelectedFile(file);
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
        <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight">Chat Interno</h1>
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
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-muted/30">
            {target.type === 'grupo' ? (
              <>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-chart-2 text-white text-xs">
                    <Users2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">{chatHeaderName}</p>
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
                <div>
                  <p className="text-sm font-semibold text-foreground">{chatHeaderName}</p>
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
                <div>
                  <p className="text-sm font-semibold text-foreground">Chat Geral</p>
                  <p className="text-[10px] text-muted-foreground">{chatHeaderSub}</p>
                </div>
              </>
            )}
            
            <div className="ml-auto">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <Info className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
                  <SheetHeader className="p-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-primary" />
                      Arquivos da Conversa
                    </SheetTitle>
                  </SheetHeader>
                  
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      {messages?.filter(m => m.arquivo_url).length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p className="text-sm">Nenhum arquivo enviado nesta conversa.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {messages?.filter(m => m.arquivo_url).map((msg) => {
                            const isImage = msg.arquivo_tipo?.startsWith('image/');
                            return (
                              <div key={msg.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30 group hover:bg-muted/50 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="h-10 w-10 shrink-0 rounded bg-background border flex items-center justify-center text-primary overflow-hidden">
                                    {isImage ? (
                                      <img src={msg.arquivo_url!} alt={msg.arquivo_nome!} className="h-full w-full object-cover" />
                                    ) : (
                                      <FileText className="h-5 w-5" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate" title={msg.arquivo_nome ?? 'Arquivo'}>
                                      {msg.arquivo_nome ?? 'Arquivo'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Avatar className="h-4 w-4 shrink-0">
                                        {msg.vendedor?.avatar_url && <img src={msg.vendedor.avatar_url} className="object-cover" />}
                                        <AvatarFallback className="text-[6px]">{getInitials(msg.vendedor?.nome || '?')}</AvatarFallback>
                                      </Avatar>
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        {msg.vendedor?.nome} • {format(new Date(msg.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                                      </p>
                                    </div>
                                  </div>
                                  <a 
                                    href={msg.arquivo_url!} 
                                    download={msg.arquivo_nome!} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4">
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

          {/* Input */}
          <div className="border-t border-border px-4 py-3">
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted rounded-lg text-sm">
                {selectedFile.type.startsWith('image/') ? (
                  <Image className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                )}
                <span className="truncate flex-1 text-xs text-foreground">{selectedFile.name}</span>
                <button onClick={() => setSelectedFile(null)} className="p-0.5 hover:bg-background rounded">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
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
              <Input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                className="flex-1"
                disabled={sending}
                autoFocus
              />
              <Button onClick={handleSend} disabled={sending || (!text.trim() && !selectedFile)} size="icon">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Chat;

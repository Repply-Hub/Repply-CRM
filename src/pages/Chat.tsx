import { useState, useRef, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useChatMessages, useSendMessage } from '@/hooks/use-chat';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = [
  'bg-primary', 'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5',
];

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

const Chat = () => {
  const { data: messages, isLoading } = useChatMessages();
  const { send, sending } = useSendMessage();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Get current vendedor id
  const { data: myVendedor } = useQuery({
    queryKey: ['my-vendedor'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_my_vendedor_id');
      return data as string;
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await send(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
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

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Chat Interno</h1>
            <p className="text-xs text-muted-foreground">Converse com sua equipe em tempo real</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !messages?.length ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
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
                    const isMe = msg.vendedor_id === myVendedor;
                    const name = msg.vendedor?.nome ?? 'Desconhecido';
                    const showAvatar = i === 0 || group.msgs[i - 1].vendedor_id !== msg.vendedor_id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
                      >
                        {showAvatar ? (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className={`${colorForId(msg.vendedor_id)} text-white text-xs`}>
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
                            }`}
                          >
                            {msg.conteudo}
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
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              className="flex-1"
              disabled={sending}
            />
            <Button onClick={handleSend} disabled={sending || !text.trim()} size="icon">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Chat;

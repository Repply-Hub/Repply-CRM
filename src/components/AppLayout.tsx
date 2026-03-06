import { useEffect, useRef, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Bell, CheckCheck, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificacoes, useUnreadCount, useMarkAsRead, useMarkAllAsRead, type Notificacao } from '@/hooks/use-notificacoes';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { buildWhatsAppUrl, getMessageTemplate } from '@/hooks/use-whatsapp';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

async function openWhatsAppForNotification(n: Notificacao, tipo: 'cobranca' | 'relacionamento') {
  if (!n.cliente_id) {
    toast.error('Cliente não associado a esta notificação.');
    return;
  }

  const { data: cliente } = await supabase
    .from('clientes')
    .select('empresa, telefone')
    .eq('id', n.cliente_id)
    .single();

  if (!cliente?.telefone) {
    toast.error('Cliente sem telefone cadastrado.');
    return;
  }

  const msg = getMessageTemplate(tipo, cliente.empresa);
  const url = buildWhatsAppUrl(cliente.telefone, msg);
  window.open(url, '_blank');

  // Log the message
  const { data: vendedor } = await supabase.rpc('get_my_vendedor_id');
  if (vendedor) {
    await supabase.from('mensagens_whatsapp').insert({
      vendedor_id: vendedor,
      pedido_id: n.pedido_id,
      cliente_id: n.cliente_id,
      telefone_destino: cliente.telefone,
      tipo_mensagem: tipo,
      conteudo: msg,
      metodo: 'wa_me_link',
    });
  }

  toast.success('WhatsApp aberto! Mensagem registrada.');
}

function NotificationCenter() {
  const { data: notificacoes } = useNotificacoes();
  const unreadCount = useUnreadCount();
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const navigate = useNavigate();
  const toastShown = useRef(false);

  // Smart toast on first load with pending notifications
  useEffect(() => {
    if (toastShown.current || !notificacoes) return;
    const unread = notificacoes.filter(n => !n.lida);
    if (unread.length > 0) {
      toastShown.current = true;
      const followups = unread.filter(n => n.tipo === 'followup').length;
      const inativos = unread.filter(n => n.tipo === 'inatividade').length;
      const parts: string[] = [];
      if (followups > 0) parts.push(`${followups} contato${followups > 1 ? 's' : ''} agendado${followups > 1 ? 's' : ''}`);
      if (inativos > 0) parts.push(`${inativos} pedido${inativos > 1 ? 's' : ''} parado${inativos > 1 ? 's' : ''}`);
      const summary = parts.join(' · ') || `${unread.length} pendência${unread.length > 1 ? 's' : ''}`;

      toast.info(`📋 ${summary}`, {
        description: 'Clique para ver suas tarefas',
        duration: 6000,
        action: {
          label: 'Ver Tarefas',
          onClick: () => navigate('/'),
        },
      });
    }
  }, [notificacoes, navigate]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  };

  const isFollowupType = (n: Notificacao) => n.tipo === 'followup' || n.tipo === 'inatividade';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full hover:bg-accent shrink-0">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {(!notificacoes || notificacoes.length === 0) ? (
            <p className="text-xs text-muted-foreground p-4 text-center">Nenhuma notificação no momento.</p>
          ) : (
            <div className="divide-y divide-border">
              {notificacoes.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors",
                    !n.lida && "bg-primary/5"
                  )}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      if (!n.lida) markRead.mutate(n.id);
                      if (n.pedido_id) navigate(`/pedidos/${n.pedido_id}/editar`);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm leading-tight", !n.lida && "font-medium")}>{n.titulo}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    {n.mensagem && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.mensagem}</p>
                    )}
                  </button>

                  {/* WhatsApp quick actions for follow-up notifications */}
                  {isFollowupType(n) && n.cliente_id && (
                    <div className="flex gap-1.5 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          openWhatsAppForNotification(n, 'cobranca');
                        }}
                      >
                        <MessageCircle className="h-3 w-3" /> Cobrança
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          openWhatsAppForNotification(n, 'relacionamento');
                        }}
                      >
                        <MessageCircle className="h-3 w-3" /> Relacionamento
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between px-6 shrink-0 pt-2">
            <div className="min-w-0">
              {title && <h1 className="text-2xl font-extrabold text-foreground tracking-tight truncate">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            <NotificationCenter />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

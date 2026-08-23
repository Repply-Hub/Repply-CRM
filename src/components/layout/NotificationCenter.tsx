import { useEffect, useRef } from 'react';
import { Bell, CheckCheck, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificacoes, useUnreadCount, useMarkAsRead, useMarkAllAsRead, useUnreadEmails, type Notificacao } from '@/hooks/use-notificacoes';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { buildWhatsAppUrl, getMessageTemplate } from '@/hooks/use-whatsapp';

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

  const { data: vendedor } = await supabase.rpc('get_my_vendedor_id');
  if (vendedor) {
    await supabase.from('mensagens_whatsapp').insert({
      usuario_id: vendedor,
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

export function NotificationCenter() {
  const { data: notificacoes } = useNotificacoes();
  const { ligada: temEmails } = useSecaoLigada('emails');
  const { data: unreadEmailsBruto = 0 } = useUnreadEmails();
  // Empresa sem a seção de E-mails não tem para onde ir: tanto o aviso quanto o
  // cartão levam para /emails, que a guarda de rota recusa — avisar de algo que
  // não se pode abrir é pior que não avisar. Zerar aqui, num lugar só, resolve
  // os TRÊS pontos que dependem deste número (o aviso, o cartão do topo e a
  // condição do "Nenhuma notificação"); gatear bloco a bloco esqueceria o
  // último e o popover nunca mais mostraria o estado vazio.
  const unreadEmails = temEmails === true ? unreadEmailsBruto : 0;
  const unreadCount = useUnreadCount();
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const navigate = useNavigate();
  const lastToastTime = useRef<number>(localStorage.getItem('last_notif_toast') ? parseInt(localStorage.getItem('last_notif_toast')!) : 0);
  const lastEmailCount = useRef<number>(parseInt(localStorage.getItem('last_email_count') || '0'));

  useEffect(() => {
    // Notify about unread emails if count increased
    if (unreadEmails > lastEmailCount.current) {
      toast.info(`📧 Você tem ${unreadEmails} e-mail${unreadEmails > 1 ? 's' : ''} não lido${unreadEmails > 1 ? 's' : ''}`, {
        description: 'Clique para abrir sua caixa de entrada',
        duration: 6000,
        action: {
          label: 'Ver e-mails',
          onClick: () => navigate('/emails'),
        },
      });
    }
    lastEmailCount.current = unreadEmails;
    localStorage.setItem('last_email_count', unreadEmails.toString());
  }, [unreadEmails, navigate]);

  useEffect(() => {
    if (!notificacoes) return;
    const unread = notificacoes.filter(n => !n.lida);
    if (unread.length === 0) return;

    // Apenas mostrar se passaram mais de 10 minutos desde o último toast
    const now = Date.now();
    if (now - lastToastTime.current < 10 * 60 * 1000) return;

    lastToastTime.current = now;
    localStorage.setItem('last_notif_toast', now.toString());
    const followups = unread.filter(n => n.tipo === 'followup').length;
    const inativos = unread.filter(n => n.tipo === 'inatividade').length;
    const parts: string[] = [];
    if (followups > 0) parts.push(`${followups} contato${followups > 1 ? 's' : ''} agendado${followups > 1 ? 's' : ''}`);
    if (inativos > 0) parts.push(`${inativos} negócio${inativos > 1 ? 's' : ''} parado${inativos > 1 ? 's' : ''}`);
    const summary = parts.join(' · ') || `${unread.length} pendência${unread.length > 1 ? 's' : ''}`;

    toast.info(`📋 ${summary}`, {
      description: 'Clique para ver as notificações',
      duration: 6000,
    });
  }, [notificacoes, navigate]);

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
        <ScrollArea className="h-96">
          {unreadEmails > 0 && (
            <div className="px-4 py-3 bg-primary/5 border-b border-border">
              <button 
                className="w-full text-left flex items-center gap-3"
                onClick={() => navigate('/emails')}
              >
                <div className="bg-primary/10 p-2 rounded-full">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">E-mails não lidos</p>
                  <p className="text-xs text-muted-foreground">Você tem {unreadEmails} nova(s) mensagem(ns)</p>
                </div>
              </button>
            </div>
          )}
          {(!notificacoes || notificacoes.length === 0) && unreadEmails === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">Nenhuma notificação no momento.</p>
          ) : (
            <div className="divide-y divide-border">
              {(notificacoes || []).map(n => (
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
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                          {formatTime(n.created_at)}
                        </span>
                        {!n.lida && (
                          <span
                            role="button"
                            aria-label="Fechar notificação"
                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              markRead.mutate(n.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    {n.mensagem && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.mensagem}</p>
                    )}
                  </button>

                  {isFollowupType(n) && n.pedido_id && (
                    <div className="flex gap-1.5 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-full text-[11px] gap-1.5 hover:bg-primary/5 border-primary/20"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (!n.lida) markRead.mutate(n.id);
                          navigate(`/pedidos/${n.pedido_id}/editar`);
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Informações do negócio
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

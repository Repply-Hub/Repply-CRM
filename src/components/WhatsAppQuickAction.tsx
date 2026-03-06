import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendWhatsApp, getMessageTemplate, buildWhatsAppUrl, type TipoMensagem } from '@/hooks/use-whatsapp';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WhatsAppQuickActionProps {
  vendedorId: string;
  pedidoId?: string;
  clienteId?: string;
  clienteNome: string;
  telefone: string | null;
  className?: string;
}

export function WhatsAppQuickAction({
  vendedorId,
  pedidoId,
  clienteId,
  clienteNome,
  telefone,
  className,
}: WhatsAppQuickActionProps) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoMensagem>('cobranca');
  const [mensagem, setMensagem] = useState('');
  const sendWa = useSendWhatsApp();

  if (!telefone) return null;

  const handleOpen = () => {
    setMensagem(getMessageTemplate(tipo, clienteNome));
    setOpen(true);
  };

  const handleTipoChange = (newTipo: TipoMensagem) => {
    setTipo(newTipo);
    setMensagem(getMessageTemplate(newTipo, clienteNome));
  };

  const handleSend = async () => {
    try {
      // Abrir link wa.me com mensagem customizada
      const url = buildWhatsAppUrl(telefone, mensagem);
      window.open(url, '_blank');

      // Registrar no banco
      await sendWa.mutateAsync({
        vendedor_id: vendedorId,
        pedido_id: pedidoId,
        cliente_id: clienteId,
        telefone,
        tipo,
        clienteNome,
      });

      toast.success('WhatsApp aberto! Mensagem registrada.');
      setOpen(false);
    } catch {
      toast.error('Erro ao registrar mensagem.');
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30", className)}
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Enviar WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Destinatário</Label>
              <p className="text-sm font-medium">{clienteNome} · {telefone}</p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Tipo de mensagem</Label>
              <div className="flex gap-2">
                <Button
                  variant={tipo === 'cobranca' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTipoChange('cobranca')}
                >
                  Cobrança
                </Button>
                <Button
                  variant={tipo === 'relacionamento' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTipoChange('relacionamento')}
                >
                  Relacionamento
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Mensagem</Label>
              <Textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSend}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={sendWa.isPending}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

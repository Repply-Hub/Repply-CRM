import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { usePedidoComentarios, useAddPedidoComentario } from '@/hooks/use-pedido-comentarios';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

interface Props {
  pedidoId: string | null;
}

export function ComentariosNegocio({ pedidoId }: Props) {
  const { profile } = useAuth();
  const { data: comentarios, isLoading } = usePedidoComentarios(pedidoId);
  const addComentario = useAddPedidoComentario();
  const [texto, setTexto] = useState('');

  const handleAdicionar = () => {
    const textoLimpo = texto.trim();
    if (!textoLimpo || !pedidoId || !profile?.id) return;

    addComentario.mutate(
      { pedidoId, usuarioId: profile.id, texto: textoLimpo },
      {
        onSuccess: () => setTexto(''),
        onError: () => toast.error('Não foi possível salvar o comentário. Tente novamente.'),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva um comentário sobre este negócio…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleAdicionar}
            disabled={!texto.trim() || addComentario.isPending}
          >
            {addComentario.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Adicionar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando comentários…</p>
      ) : !comentarios || comentarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <ol className="space-y-3">
          {comentarios.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {c.usuario?.nome ?? 'Usuário'} ·{' '}
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

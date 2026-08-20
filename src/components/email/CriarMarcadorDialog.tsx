import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCriarMarcador } from '@/hooks/use-email-pastas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId?: string | null;
}

/**
 * Cria um marcador na caixa real (Gmail), não uma tag interna do CRM — por
 * isso não tem campo de cor: quem escolhe a cor da etiqueta é o próprio Gmail,
 * a Edge Function só manda o nome.
 */
export function CriarMarcadorDialog({ open, onOpenChange, contaId }: Props) {
  const [nome, setNome] = useState('');
  const criarMut = useCriarMarcador(contaId);

  const handleCreate = async () => {
    if (!nome.trim()) return;
    await criarMut.mutateAsync(nome.trim());
    setNome('');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNome('');
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo marcador</DialogTitle>
          <DialogDescription>
            Cria um marcador direto na caixa de e-mail conectada — o mesmo que aparece se você criar um rótulo no Gmail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="novo-marcador-nome">Nome</Label>
          <Input
            id="novo-marcador-nome"
            placeholder="Ex: 011 - NOVO CLIENTE"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!nome.trim() || criarMut.isPending}>
            {criarMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

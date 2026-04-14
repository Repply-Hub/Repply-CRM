import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Loader2, Users2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['bg-primary', 'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Member {
  id: string;
  nome: string;
  email: string;
  role: string;
}

interface CreateGroupDialogProps {
  members: Member[];
  myId: string | null;
}

export function CreateGroupDialog({ members, myId }: CreateGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!nome.trim()) {
      toast.error('Informe o nome do grupo');
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error('Selecione ao menos um membro');
      return;
    }

    setCreating(true);
    try {
      const { data: vendedor } = await supabase
        .from('vendedores')
        .select('id, empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single();
      if (!vendedor) throw new Error('Vendedor não encontrado');

      const { data: grupo, error: gErr } = await supabase
        .from('chat_grupos')
        .insert({
          nome: nome.trim(),
          empresa_id: vendedor.empresa_id!,
          criado_por: vendedor.id,
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // Add creator + selected members
      const allMembers = [...new Set([vendedor.id, ...selectedMembers])];
      const { error: mErr } = await supabase
        .from('chat_grupo_membros')
        .insert(allMembers.map(vid => ({
          grupo_id: (grupo as any).id,
          vendedor_id: vid,
        })) as any);
      if (mErr) throw mErr;

      toast.success('Grupo criado com sucesso!');
      qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      setOpen(false);
      setNome('');
      setSelectedMembers([]);
    } catch (err: any) {
      toast.error('Erro ao criar grupo: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Criar grupo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Criar Grupo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <Input
              id="group-name"
              placeholder="Ex: Vendas Norte"
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Membros</Label>
             <ScrollArea className="h-[220px] border rounded-lg p-2">
              <div className="space-y-1">
                {members.filter(m => m.id !== myId).length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <Users2 className="h-8 w-8 opacity-30" />
                    <p className="text-xs text-center">Nenhum outro membro na sua empresa. Cadastre funcionários primeiro.</p>
                  </div>
                )}
                {members.filter(m => m.id !== myId).map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedMembers.includes(m.id)}
                      onCheckedChange={() => toggleMember(m.id)}
                    />
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className={`${colorForId(m.id)} text-white text-[9px] font-semibold`}>
                        {getInitials(m.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{m.nome}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
            {selectedMembers.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {selectedMembers.length} selecionado(s) + você
              </p>
            )}
          </div>
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Criar Grupo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

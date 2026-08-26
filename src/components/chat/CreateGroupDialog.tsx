import { useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Loader2, Users2, Camera, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sanitizeFileName } from '@/lib/file-validation';

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['bg-primary', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500'];
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
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleFotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const otherMembers = members.filter(m => m.id !== myId);
  const allSelected = otherMembers.length > 0 && otherMembers.every(m => selectedMembers.includes(m.id));

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
        .from('usuarios')
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

      if (foto) {
        const userId = (await supabase.auth.getUser()).data.user?.id ?? '';
        const safeName = sanitizeFileName(foto.name);
        const path = `${userId}/group-photos/${(grupo as any).id}-${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, foto, { contentType: foto.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);

        const { error: updateError } = await supabase
          .from('chat_grupos')
          .update({ foto_url: urlData.publicUrl } as any)
          .eq('id', (grupo as any).id);
        if (updateError) throw updateError;
      }

      // Add creator + selected members
      const allMembers = [...new Set([vendedor.id, ...selectedMembers])];
      const { error: mErr } = await supabase
        .from('chat_grupo_membros')
        .insert(allMembers.map(vid => ({
          grupo_id: (grupo as any).id,
          usuario_id: vid,
        })) as any);
      if (mErr) throw mErr;

      toast.success('Grupo criado com sucesso!');
      qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      setOpen(false);
      setNome('');
      setSelectedMembers([]);
      setFoto(null);
      setFotoPreview(null);
      setMemberSearch('');
    } catch (err: any) {
      toast.error('Erro ao criar grupo: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMemberSearch(''); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Criar grupo
        </Button>
      </DialogTrigger>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Criar Grupo
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-4">
          <div className="flex justify-center">
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFotoSelect}
            />
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              className="relative group"
              title="Adicionar foto do grupo"
            >
              <Avatar className="h-16 w-16">
                {fotoPreview && <img src={fotoPreview} alt="Foto do grupo" className="h-full w-full object-cover" />}
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Users2 className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </span>
            </button>
          </div>
          <p className="-mt-2 text-center text-[11px] text-muted-foreground">
            Clique no ícone para adicionar uma foto do grupo (opcional)
          </p>
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
            <div className="flex items-center justify-between">
              <Label>Membros</Label>
              {otherMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMembers(allSelected ? [] : otherMembers.map(m => m.id))}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {allSelected ? 'Remover todos' : 'Selecionar todos'}
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar membro..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
             <ScrollArea className="h-[220px] border rounded-lg p-2">
              <div className="space-y-1">
                {members.filter(m => m.id !== myId).length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <Users2 className="h-8 w-8 opacity-30" />
                    <p className="text-xs text-center">Nenhum outro membro na sua empresa. Cadastre funcionários primeiro.</p>
                  </div>
                )}
                {members.filter(m => m.id !== myId).filter(m => m.nome.toLowerCase().includes(memberSearch.trim().toLowerCase())).length === 0 && members.filter(m => m.id !== myId).length > 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <Search className="h-8 w-8 opacity-30" />
                    <p className="text-xs text-center">Nenhum membro encontrado para "{memberSearch}".</p>
                  </div>
                )}
                {members.filter(m => m.id !== myId).filter(m => m.nome.toLowerCase().includes(memberSearch.trim().toLowerCase())).map(m => (
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
        </CorpoDialogo>
        <RodapeDialogo>
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Criar Grupo
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

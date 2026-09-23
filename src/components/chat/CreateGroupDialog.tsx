import { useState } from 'react';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Users2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sanitizeFileName } from '@/lib/file-validation';
import { SeletorDeAparencia } from '@/components/chat/SeletorDeAparencia';
import { SeletorDeMembros } from '@/components/chat/SeletorDeMembros';

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
  const [aparencia, setAparencia] = useState<{ icone: string | null; corFundo: string | null; corIcone: string | null }>({ icone: null, corFundo: null, corIcone: null });
  const qc = useQueryClient();

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
          icone: aparencia.icone,
          cor_fundo: aparencia.corFundo,
          cor_icone: aparencia.corIcone,
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
      setAparencia({ icone: null, corFundo: null, corIcone: null });
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
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Criar Grupo
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-4">
          <SeletorDeAparencia
            nome={nome || 'Grupo'}
            IconePadrao={Users2}
            valor={{ icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, fotoUrl: fotoPreview }}
            onChange={(v) => { setAparencia({ icone: v.icone, corFundo: v.corFundo, corIcone: v.corIcone }); if (v.icone) { setFoto(null); setFotoPreview(null); } }}
            onEscolherImagem={(file) => { setFoto(file); setFotoPreview(URL.createObjectURL(file)); setAparencia((a) => ({ ...a, icone: null })); }}
          />
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
            <SeletorDeMembros
              titulo="Membros"
              membros={members}
              meuId={myId}
              selecionados={selectedMembers}
              onChange={setSelectedMembers}
            />
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

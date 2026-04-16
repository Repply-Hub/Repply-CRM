import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const DEFAULT_PERFIS = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'gestor', label: 'Gestor' },
];

export function PerfilSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  const { data: customPerfis } = useQuery({
    queryKey: ['perfis_customizados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis_customizados').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const qc = useQueryClient();
  const [value, setValue] = useState(defaultValue);
  const [adding, setAdding] = useState(false);
  const [newPerfil, setNewPerfil] = useState('');
  const [editing, setEditing] = useState<{ id: string; nome: string } | null>(null);
  const [editNome, setEditNome] = useState('');

  const allPerfis = useMemo(() => {
    const custom = (customPerfis ?? []).map(p => ({ value: p.slug, label: p.nome, id: p.id, isCustom: true }));
    return [...DEFAULT_PERFIS.map(p => ({ ...p, id: '', isCustom: false })), ...custom];
  }, [customPerfis]);

  const handleAddPerfil = async () => {
    const trimmed = newPerfil.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '_');
    if (allPerfis.some(p => p.value === slug)) { toast.error('Esse perfil já existe'); return; }
    const { error } = await supabase.from('perfis_customizados').insert({ nome: trimmed, slug });
    if (error) { toast.error('Erro ao criar perfil'); return; }
    qc.invalidateQueries({ queryKey: ['perfis_customizados'] });
    setValue(slug);
    setNewPerfil('');
    setAdding(false);
    toast.success('Perfil criado!');
  };

  const handleEditPerfil = async () => {
    if (!editing) return;
    const trimmed = editNome.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '_');
    const { error } = await supabase.from('perfis_customizados').update({ nome: trimmed, slug }).eq('id', editing.id);
    if (error) { toast.error('Erro ao editar perfil'); return; }
    qc.invalidateQueries({ queryKey: ['perfis_customizados'] });
    if (value === editing.nome.toLowerCase().replace(/\s+/g, '_')) setValue(slug);
    setEditing(null);
    setEditNome('');
    toast.success('Perfil atualizado!');
  };

  const handleDeletePerfil = async (id: string) => {
    const { error } = await supabase.from('perfis_customizados').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir perfil'); return; }
    qc.invalidateQueries({ queryKey: ['perfis_customizados'] });
    toast.success('Perfil excluído!');
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={(v) => {
        if (v === '__add_new__') { setAdding(true); } else { setValue(v); setAdding(false); }
      }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {allPerfis.map(p => (
            <div key={p.value} className="flex items-center group">
              <SelectItem value={p.value} className="flex-1">{p.label}</SelectItem>
              {p.isCustom && (
                <div className="flex gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setEditing({ id: p.id, nome: p.label }); setEditNome(p.label); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir perfil "{p.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletePerfil(p.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
          <SelectItem value="__add_new__" className="focus:bg-muted focus:text-foreground">
            <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Novo perfil...</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-2">
          <Input placeholder="Nome do perfil" value={newPerfil} onChange={e => setNewPerfil(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddPerfil())} className="h-8 text-sm" autoFocus />
          <Button type="button" size="sm" className="h-8" onClick={handleAddPerfil}>Adicionar</Button>
        </div>
      )}
      {editing && (
        <div className="flex gap-2">
          <Input placeholder="Novo nome" value={editNome} onChange={e => setEditNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleEditPerfil())} className="h-8 text-sm" autoFocus />
          <Button type="button" size="sm" className="h-8" onClick={handleEditPerfil}>Salvar</Button>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setEditing(null)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

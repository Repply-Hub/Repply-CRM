import { useState, useMemo } from 'react';
import { Check, ChevronDown, Plus, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface MarcadorCategoria {
  id: string;
  nome: string;
  marcadores: string[];
}

const STORAGE_KEY = 'tarefas_marcador_categorias';

const DEFAULT_CATEGORIAS: MarcadorCategoria[] = [
  { id: 'prioridade', nome: 'Prioridade', marcadores: ['Urgente', 'Alta', 'Média', 'Baixa'] },
  { id: 'comercial', nome: 'Comercial', marcadores: ['Proposta', 'Negociação', 'Follow-up'] },
  { id: 'pos_venda', nome: 'Pós-venda', marcadores: ['Suporte', 'Garantia', 'Satisfação'] },
];

function loadCategorias(): MarcadorCategoria[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CATEGORIAS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CATEGORIAS;
    return parsed;
  } catch {
    return DEFAULT_CATEGORIAS;
  }
}

function saveCategorias(cats: MarcadorCategoria[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

interface Props {
  value: string; // CSV
  onChange: (value: string) => void;
}

export function MarcadoresMultiSelect({ value, onChange }: Props) {
  const [categorias, setCategorias] = useState<MarcadorCategoria[]>(loadCategorias);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newCategoriaNome, setNewCategoriaNome] = useState('');
  const [newMarcadorPorCategoria, setNewMarcadorPorCategoria] = useState<Record<string, string>>({});
  const [confirmDeleteCategoria, setConfirmDeleteCategoria] = useState<MarcadorCategoria | null>(null);

  const selected = useMemo(
    () => value.split(',').map(s => s.trim()).filter(Boolean),
    [value]
  );

  const toggleMarcador = (m: string) => {
    const next = selected.includes(m)
      ? selected.filter(x => x !== m)
      : [...selected, m];
    onChange(next.join(', '));
  };

  const removeMarcador = (m: string) => {
    onChange(selected.filter(x => x !== m).join(', '));
  };

  const persistCategorias = (next: MarcadorCategoria[]) => {
    setCategorias(next);
    saveCategorias(next);
  };

  const handleCreateCategoria = () => {
    const nome = newCategoriaNome.trim();
    if (!nome) {
      toast.error('Informe um nome para a categoria');
      return;
    }
    const id = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) {
      toast.error('Nome inválido');
      return;
    }
    if (categorias.some(c => c.id === id)) {
      toast.error('Já existe uma categoria com esse nome');
      return;
    }
    persistCategorias([...categorias, { id, nome, marcadores: [] }]);
    setNewCategoriaNome('');
    toast.success(`Categoria "${nome}" criada`);
  };

  const handleDeleteCategoria = (cat: MarcadorCategoria) => {
    persistCategorias(categorias.filter(c => c.id !== cat.id));
    // Remove marcadores dessa categoria das tarefas selecionadas
    const remaining = selected.filter(m => !cat.marcadores.includes(m));
    if (remaining.length !== selected.length) onChange(remaining.join(', '));
    toast.success(`Categoria "${cat.nome}" excluída`);
    setConfirmDeleteCategoria(null);
  };

  const handleAddMarcador = (catId: string) => {
    const m = (newMarcadorPorCategoria[catId] || '').trim();
    if (!m) return;
    const cat = categorias.find(c => c.id === catId);
    if (!cat) return;
    if (cat.marcadores.some(x => x.toLowerCase() === m.toLowerCase())) {
      toast.error('Esse marcador já existe na categoria');
      return;
    }
    persistCategorias(categorias.map(c =>
      c.id === catId ? { ...c, marcadores: [...c.marcadores, m] } : c
    ));
    setNewMarcadorPorCategoria(prev => ({ ...prev, [catId]: '' }));
  };

  const handleDeleteMarcador = (catId: string, marcador: string) => {
    persistCategorias(categorias.map(c =>
      c.id === catId ? { ...c, marcadores: c.marcadores.filter(m => m !== marcador) } : c
    ));
    if (selected.includes(marcador)) {
      onChange(selected.filter(x => x !== marcador).join(', '));
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <div className="flex flex-1 flex-wrap items-center gap-1 text-left">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">Selecione marcadores...</span>
              ) : (
                selected.map(m => (
                  <Badge key={m} variant="secondary" className="gap-1 pr-1">
                    {m}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); removeMarcador(m); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeMarcador(m); } }}
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                ))
              )}
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marcadores</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => { setOpen(false); setManageOpen(true); }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            <div className="p-2 space-y-3">
              {categorias.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                  Nenhuma categoria. Clique em "Gerenciar" para criar.
                </p>
              )}
              {categorias.map(cat => (
                <div key={cat.id}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                    {cat.nome}
                  </p>
                  {cat.marcadores.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 italic">Sem marcadores</p>
                  ) : (
                    <div className="space-y-0.5">
                      {cat.marcadores.map(m => {
                        const isSel = selected.includes(m);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggleMarcador(m)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                              isSel && 'bg-accent/60'
                            )}
                          >
                            <span>{m}</span>
                            {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal de gerenciamento */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar categorias de marcadores</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Criar nova categoria */}
            <div className="space-y-2 pb-3 border-b">
              <Label className="text-sm">Nova categoria</Label>
              <div className="flex gap-2">
                <Input
                  value={newCategoriaNome}
                  onChange={e => setNewCategoriaNome(e.target.value)}
                  placeholder="Ex: Atendimento"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategoria(); } }}
                />
                <Button type="button" size="sm" onClick={handleCreateCategoria}>
                  <Plus className="h-4 w-4 mr-1" /> Criar
                </Button>
              </div>
            </div>

            {/* Lista de categorias */}
            <div className="space-y-3">
              {categorias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria cadastrada</p>
              ) : categorias.map(cat => (
                <div key={cat.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{cat.nome}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteCategoria(cat)}
                      title="Excluir categoria"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.marcadores.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">Nenhum marcador</span>
                    )}
                    {cat.marcadores.map(m => (
                      <div key={m} className="inline-flex items-center gap-1 rounded-full bg-muted/60 pl-2.5 pr-1 py-0.5 text-xs">
                        <span>{m}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMarcador(cat.id, m)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title={`Excluir "${m}"`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newMarcadorPorCategoria[cat.id] || ''}
                      onChange={e => setNewMarcadorPorCategoria(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      placeholder="Adicionar marcador..."
                      className="h-8 text-xs"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMarcador(cat.id); } }}
                    />
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => handleAddMarcador(cat.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de categoria */}
      <AlertDialog open={!!confirmDeleteCategoria} onOpenChange={(o) => !o && setConfirmDeleteCategoria(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{confirmDeleteCategoria?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria e todos os seus marcadores ({confirmDeleteCategoria?.marcadores.length ?? 0}) serão removidos. Tarefas existentes manterão os marcadores no campo, mas eles não aparecerão mais nos seletores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteCategoria && handleDeleteCategoria(confirmDeleteCategoria)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

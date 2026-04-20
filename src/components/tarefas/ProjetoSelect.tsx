import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Plus, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const STORAGE_KEY = 'tarefas_projetos';

const DEFAULT_PROJETOS: string[] = ['Tarefas-Gestão'];

function loadProjetos(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROJETOS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PROJETOS;
    // Garante que o padrão sempre exista
    const merged = Array.from(new Set([...DEFAULT_PROJETOS, ...parsed.filter(p => typeof p === 'string')]));
    return merged;
  } catch {
    return DEFAULT_PROJETOS;
  }
}

function saveProjetos(list: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function ProjetoSelect({ value, onChange }: Props) {
  const { user } = useAuth();
  const [projetos, setProjetos] = useState<string[]>(loadProjetos);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newProjeto, setNewProjeto] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Busca o role do usuário logado para liberar gestão (admin/empresa/gestor)
  const { data: roleData } = useQuery({
    queryKey: ['my-role-projetos', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('role')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data?.role ?? 'vendedor';
    },
  });

  const canManage = useMemo(() => {
    return ['admin', 'empresa', 'gestor'].includes(roleData ?? '');
  }, [roleData]);

  const persist = (list: string[]) => {
    setProjetos(list);
    saveProjetos(list);
  };

  const handleCreate = () => {
    const nome = newProjeto.trim();
    if (!nome) {
      toast.error('Informe o nome do projeto');
      return;
    }
    if (projetos.some(p => p.toLowerCase() === nome.toLowerCase())) {
      toast.error('Já existe um projeto com esse nome');
      return;
    }
    persist([...projetos, nome]);
    setNewProjeto('');
    toast.success(`Projeto "${nome}" criado`);
  };

  const handleDelete = (nome: string) => {
    if (DEFAULT_PROJETOS.includes(nome)) {
      toast.error('Projetos padrão não podem ser excluídos');
      setConfirmDelete(null);
      return;
    }
    persist(projetos.filter(p => p !== nome));
    if (value === nome) onChange('');
    toast.success(`Projeto "${nome}" excluído`);
    setConfirmDelete(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className={cn('flex-1 text-left truncate', !value && 'text-muted-foreground')}>
              {value || 'Selecione um projeto'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {canManage && (
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projetos</span>
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
          )}
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            <div className="p-1">
              {projetos.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                  Nenhum projeto disponível
                </p>
              ) : (
                projetos.map(p => {
                  const isSel = value === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { onChange(p); setOpen(false); }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                        isSel && 'bg-accent/60'
                      )}
                    >
                      <span className="truncate">{p}</span>
                      {isSel && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Gerenciamento (somente admin/empresa/gestor) */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar projetos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2 pb-3 border-b">
              <Label className="text-sm">Novo projeto</Label>
              <div className="flex gap-2">
                <Input
                  value={newProjeto}
                  onChange={e => setNewProjeto(e.target.value)}
                  placeholder="Ex: Comercial-Vendas"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                />
                <Button type="button" size="sm" onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Criar
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              {projetos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum projeto cadastrado</p>
              ) : projetos.map(p => {
                const isPadrao = DEFAULT_PROJETOS.includes(p);
                return (
                  <div
                    key={p}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{p}</span>
                      {isPadrao && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          padrão
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                      onClick={() => setConfirmDelete(p)}
                      disabled={isPadrao}
                      title={isPadrao ? 'Projetos padrão não podem ser excluídos' : 'Excluir projeto'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto "{confirmDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto será removido da lista de seleção. Tarefas existentes manterão a referência no campo, mas o nome não aparecerá mais como opção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
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

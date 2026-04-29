import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCatalogoGlobal, useDeleteCategoria } from '@/hooks/use-fabricantes';
import { useFabricantes } from '@/hooks/use-clientes';
import { Search, Package, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/SearchableSelect';

const Catalogo = () => {
  const { data: produtos, isLoading } = useCatalogoGlobal();
  const { data: fabricantes } = useFabricantes();
  const deleteCategoria = useDeleteCategoria();
  const [busca, setBusca] = useState('');
  const [fabricanteId, setFabricanteId] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    (produtos ?? []).forEach((p: any) => p.categoria && set.add(p.categoria));
    return Array.from(set).sort();
  }, [produtos]);

  const countByCategoria = useMemo(() => {
    const map = new Map<string, number>();
    (produtos ?? []).forEach((p: any) => {
      if (p.categoria) map.set(p.categoria, (map.get(p.categoria) ?? 0) + 1);
    });
    return map;
  }, [produtos]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (produtos ?? []).filter((p: any) => {
      if (fabricanteId !== 'todos' && p.fabricante_id !== fabricanteId) return false;
      if (categoria !== 'todas' && p.categoria !== categoria) return false;
      if (!q) return true;
      return (
        p.descricao_material?.toLowerCase().includes(q) ||
        p.referencia?.toLowerCase().includes(q) ||
        p.fabricantes?.nome?.toLowerCase().includes(q)
      );
    });
  }, [produtos, busca, fabricanteId, categoria]);

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await deleteCategoria.mutateAsync(confirmDelete);
      toast.success(`Categoria "${confirmDelete}" excluída (${res.affected} produto(s) atualizado(s))`);
      if (categoria === confirmDelete) setCategoria('todas');
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error('Erro ao excluir categoria', { description: err?.message });
    }
  };

  return (
    <AppLayout title="Catálogo de Produtos" subtitle={`${filtered.length} produto(s)`}>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
        <Card className="rounded-xl border-border/60">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por descrição, referência ou fabricante..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
            </div>
            
            <SearchableSelect
              options={[
                { value: "todos", label: "Todos fabricantes" },
                ...(fabricantes ?? []).map(f => ({ value: f.id, label: f.nome }))
              ]}
              value={fabricanteId}
              onValueChange={setFabricanteId}
              placeholder="Fabricante"
              className="w-52"
            />

            <div className="flex items-center gap-1">
              <SearchableSelect
                options={[
                  { value: "todas", label: "Todas categorias" },
                  ...categorias.map(c => ({ value: c, label: c }))
                ]}
                value={categoria}
                onValueChange={setCategoria}
                placeholder="Categoria"
                className="w-52"
              />
              {categoria !== 'todas' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(categoria)}
                  title={`Excluir categoria "${categoria}"`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {categorias.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Gerenciar categorias</p>
              <div className="flex flex-wrap gap-2">
                {categorias.map(c => (
                  <div key={c} className="inline-flex items-center gap-1 rounded-full bg-muted/60 pl-3 pr-1 py-1 text-xs">
                    <span className="font-medium">{c}</span>
                    <span className="text-muted-foreground">({countByCategoria.get(c) ?? 0})</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(c)}
                      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title={`Excluir categoria "${c}"`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="rounded-xl border-border/60">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Nenhum produto encontrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Ajuste os filtros ou cadastre produtos em Fabricantes</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((p: any) => (
              <Card key={p.id} className="rounded-xl border-border/60 overflow-hidden hover:shadow-[var(--shadow-card-hover)] transition-shadow">
                <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt={p.descricao_material} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                  )}
                </div>
                <CardContent className="p-3 space-y-1">
                  <p className="text-sm font-semibold line-clamp-2" title={p.descricao_material}>{p.descricao_material}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.fabricantes?.nome ?? '-'}</p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-sm font-bold text-primary">
                      {Number(p.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      {p.unidade && <span className="text-[10px] text-muted-foreground font-normal"> /{p.unidade}</span>}
                    </p>
                    {p.categoria && <Badge variant="secondary" className="text-[10px] font-normal">{p.categoria}</Badge>}
                  </div>
                  {p.referencia && <p className="text-[10px] text-muted-foreground">Ref: {p.referencia}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{confirmDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && countByCategoria.get(confirmDelete)
                ? `${countByCategoria.get(confirmDelete)} produto(s) ficarão sem categoria. Os produtos NÃO serão excluídos.`
                : 'Esta ação removerá a categoria do sistema.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteCategoria.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategoria.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Catalogo;

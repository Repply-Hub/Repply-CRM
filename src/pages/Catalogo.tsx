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
import { Search, Package, ImageIcon, Loader2, Trash2, Folder, ChevronLeft, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/SearchableSelect';
import { SearchWithRecent } from '@/components/SearchWithRecent';

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
      
      if (categoria === 'sem-categoria') {
        if (p.categoria) return false;
      } else if (categoria !== 'todas' && p.categoria !== categoria) {
        return false;
      }

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

  const showFolders = categoria === 'todas' && busca.trim() === '';

  return (
    <AppLayout 
      title="Catálogo de Produtos" 
      subtitle={showFolders ? `${categorias.length} categoria(s)` : `${filtered.length} produto(s)`}
    >
      <div className="p-4 md:p-6 w-full space-y-6">
        <Card className="rounded-xl border-border/60">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <SearchWithRecent
              placeholder="Buscar por descrição, referência ou fabricante..."
              value={busca}
              onValueChange={setBusca}
              storageKey="catalogo_recent_searches"
            />
            
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

            <div className="flex items-center gap-2">
              <SearchableSelect
                options={[
                  { value: "todas", label: "Todas categorias" },
                  ...categorias.map(c => ({ value: c, label: c })),
                  ...((produtos ?? []).some((p: any) => !p.categoria) ? [{ value: "sem-categoria", label: "Sem categoria" }] : [])
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

        {!showFolders && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setCategoria('todas');
              setBusca('');
            }}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para todas as categorias
          </Button>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : showFolders ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {categorias.map(c => (
              <Card 
                key={c} 
                className="rounded-xl border-border/60 overflow-hidden hover:shadow-md transition-all cursor-pointer group bg-card/50"
                onClick={() => setCategoria(c)}
              >
                <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Folder className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base line-clamp-1">{c}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {countByCategoria.get(c) ?? 0} produtos
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoria(c);
                      }}
                    >
                      Abrir pasta
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(c);
                      }}
                      title={`Excluir categoria "${c}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {/* Folder for items without category if they exist */}
            {(produtos ?? []).some((p: any) => !p.categoria) && (
              <Card 
                className="rounded-xl border-border/60 overflow-hidden hover:shadow-md transition-all cursor-pointer group bg-card/50"
                onClick={() => setCategoria('sem-categoria')}
              >
                <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                  <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-base line-clamp-1 italic">Sem categoria</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {(produtos ?? []).filter((p: any) => !p.categoria).length} produtos
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
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
                  <div className="flex flex-col gap-1 pt-1">
                    <p className="text-sm font-bold text-primary">
                      {Number(p.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      {p.unidade && <span className="text-[10px] text-muted-foreground font-normal"> / {p.unidade}</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Estoque: {p.estoque_disponivel ?? 0}</p>
                    {p.categoria && <Badge variant="secondary" className="text-[10px] font-normal self-start">{p.categoria}</Badge>}
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

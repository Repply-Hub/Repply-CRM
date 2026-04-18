import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogoGlobal } from '@/hooks/use-fabricantes';
import { useFabricantes } from '@/hooks/use-clientes';
import { Search, Package, ImageIcon, Loader2 } from 'lucide-react';

const Catalogo = () => {
  const { data: produtos, isLoading } = useCatalogoGlobal();
  const { data: fabricantes } = useFabricantes();
  const [busca, setBusca] = useState('');
  const [fabricanteId, setFabricanteId] = useState('todos');
  const [categoria, setCategoria] = useState('todas');

  const categorias = useMemo(() => {
    const set = new Set<string>();
    (produtos ?? []).forEach((p: any) => p.categoria && set.add(p.categoria));
    return Array.from(set).sort();
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

  return (
    <AppLayout title="Catálogo de Produtos" subtitle={`${filtered.length} produto(s)`}>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
        <Card className="rounded-xl border-border/60">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por descrição, referência ou fabricante..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
            </div>
            <Select value={fabricanteId} onValueChange={setFabricanteId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Fabricante" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos fabricantes</SelectItem>
                {(fabricantes ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

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
    </AppLayout>
  );
};

export default Catalogo;

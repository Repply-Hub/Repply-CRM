import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePreco, useUpdatePreco, useCategorias } from '@/hooks/use-fabricantes';
import { ProductImageUpload } from './ProductImageUpload';

interface ProductFormProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId: string;
  editData?: { 
    id: string; 
    descricao_material: string; 
    referencia?: string | null; 
    preco_unitario: number; 
    unidade?: string | null; 
    vigente: boolean; 
    categoria?: string | null; 
    imagem_url?: string | null; 
    estoque_disponivel?: number | null 
  };
  initialCategory?: string;
  onDeleteClick?: (id: string) => void;
}

export function ProductForm({ open, onOpenChange, fabricanteId, editData, initialCategory, onDeleteClick }: ProductFormProps) {
  const createPreco = useCreatePreco();
  const updatePreco = useUpdatePreco();
  const { data: todasCategorias } = useCategorias();
  
  const [desc, setDesc] = useState('');
  const [ref, setRef] = useState('');
  const [preco, setPreco] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [vigente, setVigente] = useState(true);
  const [categoria, setCategoria] = useState('');
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [estoque, setEstoque] = useState('0');
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Reset form when opening/closing or changing editData
  useEffect(() => {
    if (open) {
      setDesc(editData?.descricao_material ?? '');
      setRef(editData?.referencia ?? '');
      setPreco(editData?.preco_unitario?.toString() ?? '');
      setUnidade(editData?.unidade ?? 'un');
      setVigente(editData?.vigente ?? true);
      setCategoria(editData?.categoria ?? initialCategory ?? '');
      setImagemUrl(editData?.imagem_url ?? null);
      setEstoque(editData?.estoque_disponivel?.toString() ?? '0');
    }
  }, [open, editData, initialCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fabricanteId) {
      toast.error('Fabricante é obrigatório');
      return;
    }

    const payload = {
      descricao_material: desc,
      referencia: ref || undefined,
      preco_unitario: parseFloat(preco),
      unidade,
      vigente,
      categoria: categoria.trim() || null,
      imagem_url: imagemUrl,
      estoque_disponivel: parseFloat(estoque) || 0,
    };
    
    try {
      if (editData) {
        await updatePreco.mutateAsync({ id: editData.id, ...payload });
        toast.success('Produto atualizado!');
      } else {
        await createPreco.mutateAsync({ fabricante_id: fabricanteId, ...payload });
        toast.success('Produto cadastrado!');
      }
      onOpenChange(false);
    } catch (err: any) { 
      toast.error(err.message); 
    }
  };

  const isPending = createPreco.isPending || updatePreco.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>{editData ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="mb-2 block">Imagem</Label>
            <ProductImageUpload value={imagemUrl} onChange={setImagemUrl} fabricanteId={fabricanteId} />
          </div>
          <div><Label>Descrição do Material</Label><Input value={desc} onChange={e => setDesc(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Referência</Label><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="Código" /></div>
            <div>
              <Label>Categoria</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    list="categorias-list"
                    placeholder="Ex: Pisos, Louças"
                  />
                  <datalist id="categorias-list">
                    {(todasCategorias ?? []).map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setNewCategoryOpen(true)}
                  title="Criar nova categoria"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
            <DialogContent className="w-[90vw] sm:max-w-[300px] p-4 sm:p-6 rounded-xl sm:rounded-lg">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">Nova Categoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="new-category-input" className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Nome</Label>
                  <Input 
                    id="new-category-input"
                    placeholder="Ex: Pisos, Louças..." 
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    autoFocus
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button 
                    type="button"
                    variant="ghost"
                    className="flex-1 h-9 text-xs" 
                    onClick={() => setNewCategoryOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    className="flex-[2] h-9 text-xs" 
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        setCategoria(newCategoryName.trim());
                        setNewCategoryName('');
                        setNewCategoryOpen(false);
                      }
                    }}
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço de Varejo (R$)</Label><Input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} required /></div>
            <div><Label>Estoque Disponível</Label><Input type="number" step="0.01" value={estoque} onChange={e => setEstoque(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">un</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                  <SelectItem value="m²">m²</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="cx">cx</SelectItem>
                  <SelectItem value="pç">pç</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="vigente" checked={vigente} onChange={e => setVigente(e.target.checked)} className="rounded border-input" />
              <Label htmlFor="vigente">Produto vigente (disponível)</Label>
            </div>
            
            {editData && onDeleteClick && (
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                onClick={() => onDeleteClick(editData.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir</span>
              </Button>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
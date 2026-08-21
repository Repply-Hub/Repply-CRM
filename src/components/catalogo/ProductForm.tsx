import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePreco, useUpdatePreco, useCategorias } from '@/hooks/use-fabricantes';
import { useFabricantes } from '@/hooks/use-clientes';
import { ProductImageUpload } from './ProductImageUpload';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { CampoMoeda } from '@/components/shared/CampoMoeda';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';

interface ProductFormProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId?: string;
  editData?: { 
    id: string; 
    descricao_material: string; 
    referencia?: string | null; 
    preco_unitario: number; 
    unidade?: string | null; 
    vigente: boolean; 
    categoria?: string | null; 
    imagem_url?: string | null; 
    estoque_disponivel?: number | null;
    fabricante_id?: string;
  };
  initialCategory?: string;
  onDeleteClick?: (id: string) => void;
}

export function ProductForm({ open, onOpenChange, fabricanteId: initialFabId, editData, initialCategory, onDeleteClick }: ProductFormProps) {
  const createPreco = useCreatePreco();
  const updatePreco = useUpdatePreco();
  const { data: todasCategorias } = useCategorias();
  const { data: fabricantes } = useFabricantes();
  
  const [fabricanteId, setFabricanteId] = useState('');
  const [desc, setDesc] = useState('');
  const [ref, setRef] = useState('');
  // Preço e estoque guardam NÚMERO, não texto. Antes guardavam texto e o
  // salvamento chamava `parseFloat` — função de padrão americano, que lê
  // "1.234,56" como 1.234 e devolve NaN quando o campo está vazio.
  const [preco, setPreco] = useState<number | null>(null);
  const [unidade, setUnidade] = useState('un');
  const [vigente, setVigente] = useState(true);
  const [categoria, setCategoria] = useState('');
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [estoque, setEstoque] = useState<number | null>(0);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Reset form when opening/closing or changing editData
  useEffect(() => {
    if (open) {
      setFabricanteId(initialFabId ?? editData?.fabricante_id ?? '');
      setDesc(editData?.descricao_material ?? '');
      setRef(editData?.referencia ?? '');
      setPreco(editData?.preco_unitario ?? null);
      setUnidade(editData?.unidade ?? 'un');
      setVigente(editData?.vigente ?? true);
      setCategoria(editData?.categoria ?? initialCategory ?? '');
      setImagemUrl(editData?.imagem_url ?? null);
      setEstoque(editData?.estoque_disponivel ?? 0);
    }
  }, [open, editData, initialCategory, initialFabId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fabricanteId) {
      toast.error('Fabricante é obrigatório');
      return;
    }
    // Checagem no código, não só no `required` do HTML: o `required` depende do
    // envio passar pelo <form>, e some no dia em que alguém trocar o botão de
    // salvar. Sem ele, campo vazio gravava NaN no preço da tabela — e é dele que
    // todo item de orçamento é preenchido daí em diante.
    if (preco === null) {
      toast.error('Informe o preço de varejo.');
      return;
    }

    const payload = {
      descricao_material: desc,
      referencia: ref || undefined,
      preco_unitario: preco,
      unidade,
      vigente,
      categoria: categoria.trim() || null,
      imagem_url: imagemUrl,
      estoque_disponivel: estoque ?? 0,
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
      {/* Este formulário pede ~700px de altura e o notebook comum de 1366x768
          oferece ~610px: sem teto de altura, "Salvar" ficava abaixo da borda da
          tela e o "X" acima dela ao mesmo tempo, e como Esc e clique-fora estão
          desligados a única saída era recarregar a página, perdendo tudo.
          Agora só o miolo rola; título e botão de salvar ficam parados. */}
      <ConteudoDialogo className="sm:max-w-[500px]">
        <CabecalhoDialogo><DialogTitle>{editData ? 'Editar' : 'Novo'} Produto</DialogTitle></CabecalhoDialogo>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <CorpoDialogo className="space-y-4 py-2">
            {!initialFabId && !editData && (
              <div className="space-y-2">
                <Label>Fabricante</Label>
                <SearchableSelect
                  options={(fabricantes ?? []).map(f => ({ value: f.id, label: f.nome }))}
                  value={fabricanteId}
                  onValueChange={setFabricanteId}
                  placeholder="Selecione um fabricante"
                />
              </div>
            )}
          
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
              {/* Teto de altura também aqui: em zoom alto até este diálogo curto
                  passa da tela, e aí "Criar Categoria" fica fora do alcance. */}
              <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[calc(100dvh-2rem)] p-0 overflow-y-auto rounded-2xl sm:rounded-xl border-none shadow-2xl">
                <div className="bg-gradient-to-br from-primary/5 to-background p-6">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-primary" />
                      </div>
                      Nova Categoria
                    </DialogTitle>
                  </DialogHeader>
                
                  <div className="space-y-6 pt-6">
                    <div className="space-y-3">
                      <Label htmlFor="new-category-input" className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                        Nome da Categoria
                      </Label>
                      <Input 
                        id="new-category-input"
                        placeholder="Ex: Pisos, Louças, Tintas..." 
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        autoFocus
                        className="h-12 text-base rounded-xl border-muted-foreground/20 focus-visible:ring-primary/30"
                      />
                    </div>
                  
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button 
                        type="button"
                        variant="outline"
                        className="flex-1 h-12 rounded-xl font-semibold order-2 sm:order-1" 
                        onClick={() => {
                          setNewCategoryOpen(false);
                          setNewCategoryName('');
                        }}
                      >
                        Cancelar
                      </Button>
                      {/* `type="button"` explícito: o botão do shadcn não define
                          tipo, e este diálogo mora DENTRO do <form> do produto —
                          sem isto ele conta como botão de envio. */}
                      <Button
                        type="button"
                        className="flex-[2] h-12 rounded-xl font-bold shadow-lg shadow-primary/20 order-1 sm:order-2"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            setCategoria(newCategoryName.trim());
                            setNewCategoryName('');
                            setNewCategoryOpen(false);
                          } else {
                            toast.error("Por favor, digite um nome para a categoria");
                          }
                        }}
                      >
                        Criar Categoria
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Nada de `type="number"` aqui: com ele a roda do mouse altera o valor
                sozinha quando o cursor passa por cima, e o navegador descarta
                "1.234,56" devolvendo texto VAZIO. O CampoMoeda é campo de texto com
                máscara brasileira e entrega número puro já convertido. */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço de Varejo</Label><CampoMoeda value={preco} onChange={setPreco} required /></div>
              {/* `casasDecimais={3}`: estoque é QUANTIDADE, não dinheiro. Sem isto ele herda
                  as 2 casas do padrão e passa a completar zero — um estoque de 10,5 abriria
                  como "10,50", sugerindo centavo onde a unidade é peça, metro ou saco. */}
              <div><Label>Estoque Disponível</Label><CampoMoeda comPrefixo={false} casasDecimais={3} value={estoque} onChange={setEstoque} /></div>
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
          </CorpoDialogo>
          <RodapeDialogo className="mt-4 border-t pt-4">
            <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Salvando...' : 'Salvar'}</Button>
          </RodapeDialogo>
        </form>
      </ConteudoDialogo>
    </Dialog>
  );
}
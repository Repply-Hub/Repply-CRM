import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useObrasByCliente, useTabelaPrecos, useMyVendedorId, useIsGestor, useCreatePedidoCompleto, useCreateFabricanteCompleto } from '@/hooks/use-novo-pedido';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Save, Check, ChevronsUpDown, FileText, Upload } from 'lucide-react';
import { EmpresaSelector } from '@/components/EmpresaSelector';
import { FabricanteSelector } from '@/components/FabricanteSelector';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const ORIGENS = [
  { value: 'recompra', label: 'Recompra' },
  { value: 'prospeccao_ativa', label: 'Prospecção Ativa' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'obra_nova', label: 'Obra Nova' },
];

interface ItemPedido {
  id: string;
  descricao_material: string;
  referencia_fabricante: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number;
}

const NovoPedido = () => {
  const navigate = useNavigate();
  const { data: clientes } = useClientes();
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();
  const { data: myVendedorId } = useMyVendedorId();
  const { data: isGestor } = useIsGestor();
  const createPedido = useCreatePedidoCompleto();

  const [clienteOpen, setClienteOpen] = useState(false);
  const [fabricanteOpen, setFabricanteOpen] = useState(false);

  const [step, setStep] = useState(1);

  // Step 1 fields
  const [clienteId, setClienteId] = useState('');
  const [obraId, setObraId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [dataPedido, setDataPedido] = useState<Date>(new Date());
  const [prazoResposta, setPrazoResposta] = useState<Date | undefined>();
  const [origemLead, setOrigemLead] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Step 2 fields
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [proximoContato, setProximoContato] = useState<Date | undefined>();
  const [proximoContatoHora, setProximoContatoHora] = useState('09:00');

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  const isConstrutora = selectedCliente?.tipo === 'construtora' || !clienteId;
  const { data: obras } = useObrasByCliente(clienteId || null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);

  const valorTotal = useMemo(() => itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0), [itens]);

  // Set default vendedor when data loads
  useEffect(() => {
    if (myVendedorId && !vendedorId) setVendedorId(myVendedorId);
  }, [myVendedorId]);

  // Handle obra selection
  const handleObraChange = (id: string) => {
    setObraId(id);
    const obra = obras?.find(o => o.id === id);
    if (obra?.endereco_entrega) setEnderecoEntrega(obra.endereco_entrega);
  };

  // Handle cliente change
  const handleClienteChange = (id: string) => {
    setClienteId(id);
    setObraId('');
    setEnderecoEntrega('');
  };

  // Items
  const addItem = () => {
    setItens(prev => [...prev, {
      id: crypto.randomUUID(),
      descricao_material: '',
      referencia_fabricante: '',
      quantidade: 1,
      unidade: '',
      preco_unitario: 0,
    }]);
  };

  const updateItem = (id: string, field: keyof ItemPedido, value: any) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const selectFromTabela = (itemId: string, tabelaId: string) => {
    const tp = tabelaPrecos?.find(t => t.id === tabelaId);
    if (!tp) return;
    setItens(prev => prev.map(i => i.id === itemId ? {
      ...i,
      descricao_material: tp.descricao_material,
      referencia_fabricante: tp.referencia || '',
      preco_unitario: tp.preco_unitario,
      unidade: tp.unidade || '',
    } : i));
  };

  // Validation
  const validateStep1 = () => {
    if (!clienteId) { toast.error('Selecione um cliente'); return false; }
    
    if (!fabricanteId) { toast.error('Selecione um fabricante'); return false; }
    if (!vendedorId) { toast.error('Selecione o responsável'); return false; }
    if (!pdfFile) { toast.error('Anexe o PDF do pedido (obrigatório)'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (itens.length === 0) { toast.error('Adicione pelo menos 1 item'); return false; }
    for (const item of itens) {
      if (!item.descricao_material.trim()) { toast.error('Preencha a descrição de todos os itens'); return false; }
      if (item.quantidade <= 0) { toast.error('Quantidade deve ser maior que 0'); return false; }
      if (item.preco_unitario <= 0) { toast.error('Preço unitário deve ser maior que 0'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    if (!pdfFile) { toast.error('Anexe o PDF do pedido (obrigatório)'); return false; }

    setIsUploading(true);
    let pdfUrl = '';

    try {
      // 1. Upload PDF
      const fileExt = pdfFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('pedido-anexos')
        .upload(filePath, pdfFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('pedido-anexos')
        .getPublicUrl(filePath);
      
      pdfUrl = publicUrl;

      // 2. Create Pedido
      let proximoContatoISO: string | undefined;
      if (proximoContato) {
        const dt = new Date(proximoContato);
        const [h, m] = proximoContatoHora.split(':').map(Number);
        dt.setHours(h, m, 0, 0);
        proximoContatoISO = dt.toISOString();
      }

      await createPedido.mutateAsync({
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        usuario_id: vendedorId,
        obra_id: obraId || undefined,
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        pdf_url: pdfUrl,
        itens: itens.map(i => ({
          descricao_material: i.descricao_material,
          referencia_fabricante: i.referencia_fabricante || undefined,
          quantidade: i.quantidade,
          unidade: i.unidade || undefined,
          preco_unitario: i.preco_unitario,
        })),
        proximo_contato: proximoContatoISO,
      });
      toast.success('Pedido criado com sucesso!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight truncate">Novo Pedido</h1>
        </div>
      }
    >
      <div className="p-6 max-w-4xl mx-auto">

        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors", step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <span className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">1</span>
            Informações do Pedido
          </div>
          <div className="h-px w-8 bg-border" />
          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors", step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <span className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">2</span>
            Itens do Pedido
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {step === 1 ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Cliente */}
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <EmpresaSelector 
                      value={clienteId} 
                      onValueChange={handleClienteChange} 
                    />
                  </div>

                  {/* Fabricante */}
                  <div className="space-y-2">
                    <Label>Fabricante *</Label>
                    <FabricanteSelector 
                      value={fabricanteId} 
                      onValueChange={setFabricanteId} 
                    />
                  </div>
                </div>

                {/* Obra */}
                <div className="space-y-2">
                  <Label>Obra</Label>
                  <Select 
                    value={obraId} 
                    onValueChange={handleObraChange}
                    disabled={!clienteId}
                  >
                    <SelectTrigger><SelectValue placeholder={clienteId ? "Selecionar obra" : "Selecione um cliente primeiro"} /></SelectTrigger>
                    <SelectContent>
                      {(obras ?? []).map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.nome_obra}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedObra?.spe_cnpj && (
                    <p className="text-xs text-muted-foreground">SPE/CNPJ: {selectedObra.spe_cnpj}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Vendedor */}
                  <div className="space-y-2">
                    <Label>Responsável *</Label>
                    <Select value={vendedorId} onValueChange={setVendedorId} disabled={!isGestor}>
                      <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                      <SelectContent>
                        {(vendedores ?? []).map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Origem */}
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select value={origemLead} onValueChange={setOrigemLead}>
                      <SelectTrigger><SelectValue placeholder="Selecionar origem" /></SelectTrigger>
                      <SelectContent>
                        {ORIGENS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Anexo PDF */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Anexar PDF *
                    <span className="text-xs font-normal text-muted-foreground">(Obrigatório)</span>
                  </Label>
                  <div className={cn(
                    "relative border-2 border-dashed rounded-lg p-4 transition-colors",
                    pdfFile ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30"
                  )}>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center justify-center gap-3">
                      {pdfFile ? (
                        <>
                          <FileText className="h-6 w-6 text-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive" 
                            onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-muted-foreground" />
                          <div className="text-center">
                            <p className="text-sm font-medium">Clique ou arraste o PDF aqui</p>
                            <p className="text-xs text-muted-foreground">Apenas arquivos PDF são aceitos</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Data de Criação */}
                  <div className="space-y-2">
                    <Label>Data de Criação *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(dataPedido, "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dataPedido}
                          onSelect={(d) => d && setDataPedido(d)}
                          locale={ptBR}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">Padrão: data atual. Pode ser alterada manualmente.</p>
                  </div>

                  {/* Data de Fechamento */}
                  <div className="space-y-2">
                    <Label>Data de Fechamento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {prazoResposta ? format(prazoResposta, "dd/MM/yyyy") : <span className="text-muted-foreground">Selecionar (opcional)</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={prazoResposta}
                          onSelect={setPrazoResposta}
                          locale={ptBR}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                        {prazoResposta && (
                          <div className="p-2 border-t">
                            <Button variant="ghost" size="sm" className="w-full" onClick={() => setPrazoResposta(undefined)}>
                              Limpar
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">Se vazia, será preenchida automaticamente ao mover para Fechamento.</p>
                  </div>
                </div>

                {/* Endereço de entrega */}
                <div className="space-y-2">
                  <Label>Endereço de Entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} placeholder="Endereço de entrega" />
                </div>

                {/* Descrição do Pedido */}
                <div className="space-y-2">
                  <Label>Descrição do Pedido</Label>
                  <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações ou descrição geral do pedido" rows={3} />
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleNext}>
                    Próximo <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">Itens do Pedido</Label>
                    <Button size="sm" variant="outline" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar Item
                    </Button>
                  </div>

                  {itens.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">Nenhum item adicionado</p>
                      <Button size="sm" variant="outline" onClick={addItem}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro item
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="min-w-[200px]">Descrição do Material</TableHead>
                            <TableHead className="w-28">Referência</TableHead>
                            <TableHead className="w-20">Qtd</TableHead>
                            <TableHead className="w-20">Unidade</TableHead>
                            <TableHead className="w-28">Preço Unit.</TableHead>
                            <TableHead className="w-28">Preço Total</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itens.map(item => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <ItemDescricaoField
                                  value={item.descricao_material}
                                  onChange={(v) => updateItem(item.id, 'descricao_material', v)}
                                  tabelaPrecos={tabelaPrecos ?? []}
                                  onSelect={(tpId) => selectFromTabela(item.id, tpId)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 text-xs" value={item.referencia_fabricante} onChange={e => updateItem(item.id, 'referencia_fabricante', e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 text-xs" type="number" min="0" step="1" value={item.quantidade} onChange={e => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 text-xs" value={item.unidade} onChange={e => updateItem(item.id, 'unidade', e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.preco_unitario} onChange={e => updateItem(item.id, 'preco_unitario', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell className="text-right font-medium text-sm">
                                {(item.quantidade * item.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="flex justify-end px-4 py-3 bg-muted/30 border-t border-border">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Valor Total</p>
                          <p className="text-lg font-bold text-foreground">
                            {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>



                {/* Próximo contato */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Próximo Contato Agendado</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !proximoContato && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {proximoContato ? format(proximoContato, "dd/MM/yyyy") : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={proximoContato} onSelect={setProximoContato} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {proximoContato && (
                    <div className="space-y-2">
                      <Label>Horário</Label>
                      <Input type="time" value={proximoContatoHora} onChange={e => setProximoContatoHora(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <Button onClick={handleSubmit} disabled={createPedido.isPending || isUploading}>
                    <Save className="h-4 w-4 mr-1" />
                    {isUploading ? 'Enviando PDF...' : createPedido.isPending ? 'Criando...' : 'Criar Pedido'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

// Autocomplete component for item description
function ItemDescricaoField({
  value,
  onChange,
  tabelaPrecos,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  tabelaPrecos: any[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value.trim()) return tabelaPrecos.slice(0, 10);
    return tabelaPrecos.filter(tp =>
      tp.descricao_material.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
  }, [value, tabelaPrecos]);

  return (
    <div className="relative">
      <Input
        className="h-8 text-xs"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Descrição..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-md border bg-popover text-popover-foreground shadow-md">
          <Command>
            <CommandList>
              <CommandGroup>
                {filtered.map(tp => (
                  <CommandItem
                    key={tp.id}
                    onSelect={() => {
                      onSelect(tp.id);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <div>
                      <p>{tp.descricao_material}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {tp.referencia && `Ref: ${tp.referencia} · `}
                        {tp.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {tp.unidade && ` / ${tp.unidade}`}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

export default NovoPedido;

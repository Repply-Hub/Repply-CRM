import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useObrasByCliente, useTabelaPrecos, useMyVendedorId, useIsGestor } from '@/hooks/use-novo-pedido';
import { usePedidoCompleto, useUpdatePedidoCompleto } from '@/hooks/use-edit-pedido';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const ORIGENS = [
  { value: 'recompra', label: 'Recompra' },
  { value: 'prospeccao_ativa', label: 'Prospecção Ativa' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'obra_nova', label: 'Obra Nova' },
];

const STATUS_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  elaboracao: 'Em Elaboração',
  enviado: 'Enviado',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
  perdido: 'Perdido',
};

interface ItemPedido {
  id: string;
  descricao_material: string;
  referencia_fabricante: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number;
}

const EditarPedido = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pedidoData, isLoading: loadingPedido } = usePedidoCompleto(id ?? null);
  const { data: clientes } = useClientes();
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();
  const { data: isGestor } = useIsGestor();
  const updatePedido = useUpdatePedidoCompleto();

  const [initialized, setInitialized] = useState(false);
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

  // Step 2 fields
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');

  // Populate form when data loads
  useEffect(() => {
    if (pedidoData && !initialized) {
      const p = pedidoData.pedido;
      setClienteId(p.cliente_id);
      setObraId(p.obra_id || '');
      setFabricanteId(p.fabricante_id);
      setVendedorId(p.usuario_id);
      setDataPedido(parseISO(p.data_pedido));
      setPrazoResposta(p.prazo_resposta ? parseISO(p.prazo_resposta) : undefined);
      setOrigemLead(p.origem_lead || '');
      setEnderecoEntrega(p.endereco_entrega || '');
      setObservacoes(p.observacoes || '');
      setPdfUrl(p.pdf_url || '');
      setItens(pedidoData.itens.map(i => ({
        id: i.id,
        descricao_material: i.descricao_material,
        referencia_fabricante: i.referencia_fabricante || '',
        quantidade: Number(i.quantidade),
        unidade: i.unidade || '',
        preco_unitario: Number(i.preco_unitario),
      })));
      setInitialized(true);
    }
  }, [pedidoData, initialized]);

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  const isConstrutora = selectedCliente?.tipo === 'construtora';
  const { data: obras } = useObrasByCliente(isConstrutora ? clienteId : null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);

  const valorTotal = useMemo(() => itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0), [itens]);

  const pedidoStatus = pedidoData?.pedido?.status || '';
  const isClosedStatus = ['fechamento', 'perdido'].includes(pedidoStatus);

  const handleObraChange = (oid: string) => {
    setObraId(oid);
    const obra = obras?.find(o => o.id === oid);
    if (obra?.endereco_entrega) setEnderecoEntrega(obra.endereco_entrega);
  };

  const handleClienteChange = (cid: string) => {
    setClienteId(cid);
    setObraId('');
    setEnderecoEntrega('');
  };

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

  const updateItem = (itemId: string, field: keyof ItemPedido, value: any) => {
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  };

  const removeItem = (itemId: string) => {
    setItens(prev => prev.filter(i => i.id !== itemId));
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

  const validateStep1 = () => {
    if (!clienteId) { toast.error('Selecione um cliente'); return false; }
    if (isConstrutora && !obraId) { toast.error('Selecione uma obra'); return false; }
    if (!fabricanteId) { toast.error('Selecione um fabricante'); return false; }
    if (!vendedorId) { toast.error('Selecione o responsável'); return false; }
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
    if (!validateStep2() || !id) return;

    try {
      await updatePedido.mutateAsync({
        pedido_id: id,
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        usuario_id: vendedorId,
        obra_id: obraId || undefined,
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        itens: itens.map(i => ({
          descricao_material: i.descricao_material,
          referencia_fabricante: i.referencia_fabricante || undefined,
          quantidade: i.quantidade,
          unidade: i.unidade || undefined,
          preco_unitario: i.preco_unitario,
        })),
      });
      toast.success('Pedido atualizado com sucesso!');
      navigate('/pedidos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loadingPedido) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!pedidoData) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">Pedido não encontrado.</div>
      </AppLayout>
    );
  }

  const headerContent = (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
      <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
      <Button variant="ghost" size="icon" className="shrink-0 -ml-1 h-8 w-8" onClick={() => navigate('/pedidos')}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      
      <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate">Editar Pedido</h1>
      <Badge variant={isClosedStatus ? 'secondary' : 'default'} className="shrink-0">
        {STATUS_LABELS[pedidoStatus] || pedidoStatus}
      </Badge>
    </div>
  );

  return (
    <AppLayout headerContent={headerContent}>
      <div className="p-6 max-w-4xl mx-auto">

        {isClosedStatus && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3 mb-4">
            ⚠️ Este pedido está em status "{STATUS_LABELS[pedidoStatus]}". Alterações podem impactar o fluxo.
          </div>
        )}

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
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select value={clienteId} onValueChange={handleClienteChange}>
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>
                        {(clientes ?? []).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fabricante *</Label>
                    <Select value={fabricanteId} onValueChange={setFabricanteId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar fabricante" /></SelectTrigger>
                      <SelectContent>
                        {(fabricantes ?? []).map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isConstrutora && (
                  <div className="space-y-2">
                    <Label>Obra *</Label>
                    <Select value={obraId} onValueChange={handleObraChange}>
                      <SelectTrigger><SelectValue placeholder="Selecionar obra" /></SelectTrigger>
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
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Fechamento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {prazoResposta ? format(prazoResposta, "dd/MM/yyyy") : <span className="text-muted-foreground">Selecionar data</span>}
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

                <div className="space-y-2">
                  <Label>Endereço de Entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} placeholder="Endereço de entrega" />
                </div>

                {pdfUrl && (
                  <div className="space-y-2">
                    <Label>Arquivo PDF</Label>
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium flex-1 truncate">PDF do Pedido</span>
                      <Button variant="outline" size="sm" asChild>
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                          Ver PDF
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button onClick={handleNext}>
                    Próximo <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
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

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações internas sobre o pedido" rows={3} />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <Button onClick={handleSubmit} disabled={updatePedido.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    {updatePedido.isPending ? 'Salvando...' : 'Salvar Alterações'}
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          className="h-8 text-xs"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Descrição..."
        />
      </PopoverTrigger>
      {filtered.length > 0 && (
        <PopoverContent className="w-72 p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
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
        </PopoverContent>
      )}
    </Popover>
  );
}

export default EditarPedido;

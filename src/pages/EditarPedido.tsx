import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useMarcadores } from '@/hooks/use-marcadores';
import { useObrasByCliente, useTabelaPrecos, useIsGestor } from '@/hooks/use-novo-pedido';
import { useCreateObra } from '@/hooks/use-mutations';
import { usePedidoCompleto, useUpdatePedidoCompleto } from '@/hooks/use-edit-pedido';
import { usePedidoHistoricoStatus } from '@/hooks/use-pedidos';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos, resolveFieldLabel, isCampoObrigatorioNaEtapa } from '@/hooks/use-configuracoes-campos';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/file-validation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Save, Loader2, FileText, Upload, History } from 'lucide-react';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { FabricanteSelector } from '@/components/pedidos/FabricanteSelector';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { filenameFromUrl } from '@/lib/download-file';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';

const DEFAULT_ORIGENS = [
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
  // Volta pra tela anterior (preservando filtros/busca da URL de Negócios, ex.: período e
  // etapas selecionadas) em vez de sempre mandar pra "/app" sem parâmetros — só cai no
  // fallback se não houver histórico de navegação dentro do app (ex.: link direto/nova aba).
  const closeEditor = () => (window.history.length > 1 ? navigate(-1) : navigate('/app'));
  const { data: pedidoData, isLoading: loadingPedido } = usePedidoCompleto(id ?? null);
  const { data: clientes } = useClientes();
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();
  const { data: isGestor } = useIsGestor();
  const { data: kanbanColunas } = useKanbanColunas(undefined, pedidoData?.pedido?.funil_id);
  const { data: historicoStatus } = usePedidoHistoricoStatus(id ?? null);
  const updatePedido = useUpdatePedidoCompleto();
  const createObraMutation = useCreateObra();

  const [initialized, setInitialized] = useState(false);
  const [step, setStep] = useState(1);

  const [obraDialogOpen, setObraDialogOpen] = useState(false);
  const [newObraNome, setNewObraNome] = useState('');

  const [origens, setOrigens] = useState(() => {
    const saved = localStorage.getItem('custom_origens');
    if (saved) {
      try {
        return [...DEFAULT_ORIGENS, ...JSON.parse(saved)];
      } catch (e) {
        return DEFAULT_ORIGENS;
      }
    }
    return DEFAULT_ORIGENS;
  });
  const [origemDialogOpen, setOrigemDialogOpen] = useState(false);
  const [newOrigemLabel, setNewOrigemLabel] = useState('');

  // Step 1 fields
  const [clienteId, setClienteId] = useState('');
  const [obraId, setObraId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [status, setStatus] = useState('novo_lead');
  const [marcadorId, setMarcadorId] = useState('');
  const [dataPedido, setDataPedido] = useState<Date>(new Date());
  const [prazoResposta, setPrazoResposta] = useState<Date | undefined>();
  const [origemLead, setOrigemLead] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');

  // Step 2 fields
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);
  const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});
  const { profile } = useAuth();
  const { data: camposConfig } = useConfiguracoesCampos('pedidos', profile?.empresa_id);
  const { data: marcadores } = useMarcadores(profile?.empresa_id);

  // Populate form when data loads
  useEffect(() => {
    if (pedidoData && !initialized) {
      const p = pedidoData.pedido;
      setClienteId(p.cliente_id);
      setObraId(p.obra_id || '');
      setFabricanteId(p.fabricante_id);
      setVendedorId(p.usuario_id);
      setStatus(p.status || 'novo_lead');
      setMarcadorId(p.marcador_id || '');
      setDataPedido(new Date(p.data_pedido + 'T12:00:00'));
      setPrazoResposta(p.prazo_resposta ? new Date(p.prazo_resposta + 'T12:00:00') : undefined);
      setOrigemLead(p.origem_lead || '');
      setEnderecoEntrega(p.endereco_entrega || '');
      setObservacoes(p.observacoes || '');
      setPdfUrl(p.pdf_url || '');
      setCamposExtras((p.campos_extras as Record<string, string> | null) || {});
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
  const { data: obras } = useObrasByCliente(clienteId || null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);

  const valorTotal = useMemo(() => itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0), [itens]);

  const pedidoStatus = pedidoData?.pedido?.status || '';
  const isClosedStatus = ['fechamento', 'perdido'].includes(pedidoStatus);

  const getStatusLabel = (slug: string) =>
    kanbanColunas?.find(c => c.slug === slug)?.nome || STATUS_LABELS[slug] || slug;

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
    if (!fabricanteId) { toast.error('Selecione um fabricante'); return false; }
    if (!vendedorId) { toast.error('Selecione o responsável'); return false; }
    return true;
  };

  // Etapa do KANBAN em que o negócio está sendo salvo — usada para saber se campos com
  // obrigatoriedade restrita a etapas se aplicam ao status atualmente selecionado.
  const currentKanbanColunaId = kanbanColunas?.find(c => c.slug === status)?.id;

  const validateStep2 = () => {
    const valoresPadrao: Record<string, string | undefined> = {
      cliente_id: clienteId,
      fabricante_id: fabricanteId,
      vendedor_id: vendedorId,
      status: status,
      anexo_pdf: (pdfFile || pdfUrl) ? 'ok' : undefined,
      data_pedido: dataPedido ? 'ok' : undefined,
      obra_id: obraId,
      origem_lead: origemLead,
      endereco_entrega: enderecoEntrega,
      prazo_resposta: prazoResposta ? 'ok' : undefined,
      observacoes: observacoes,
      itens: itens.length > 0 ? 'ok' : undefined,
    };
    for (const campo of camposConfig ?? []) {
      if (!isCampoObrigatorioNaEtapa(campo, currentKanbanColunaId)) continue;
      const valor = campo.origem === 'padrao' ? valoresPadrao[campo.campo_key] : camposExtras[campo.campo_key];
      if (!valor || !valor.trim()) {
        const label = campo.origem === 'padrao' ? resolveFieldLabel(campo) : campo.label;
        toast.error(`Preencha o campo obrigatório: ${label}`);
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async () => {
    if (!validateStep2() || !id) return;

    setIsUploadingPdf(true);
    try {
      let newPdfUrl = pdfUrl;

      if (pdfFile) {
        const filePath = `${crypto.randomUUID()}/${sanitizeFileName(pdfFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from('pedido-anexos')
          .upload(filePath, pdfFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('pedido-anexos')
          .getPublicUrl(filePath);
        newPdfUrl = publicUrl;
      }

      await updatePedido.mutateAsync({
        pedido_id: id,
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        usuario_id: vendedorId,
        obra_id: obraId || undefined,
        status: status,
        marcador_id: marcadorId || null,
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        pdf_url: newPdfUrl,
        campos_extras: camposExtras,
        itens: itens.map(i => ({
          id: i.id,
          descricao_material: i.descricao_material,
          referencia_fabricante: i.referencia_fabricante || undefined,
          quantidade: i.quantidade,
          unidade: i.unidade || undefined,
          preco_unitario: i.preco_unitario,
        })),
      });
      setPdfUrl(newPdfUrl);
      setPdfFile(null);
      toast.success('Negócio atualizado com sucesso!');
      closeEditor();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleCreateObra = async () => {
    if (!clienteId) {
      toast.error('Selecione um cliente primeiro');
      return;
    }
    if (!newObraNome.trim()) {
      toast.error('Informe o nome da obra');
      return;
    }

    try {
      await createObraMutation.mutateAsync({
        nome_obra: newObraNome,
        cliente_id: clienteId,
      });
      toast.success('Obra criada com sucesso!');
      setObraDialogOpen(false);
      setNewObraNome('');
    } catch (err: any) {
      toast.error('Erro ao criar obra: ' + err.message);
    }
  };

  const handleCreateOrigem = () => {
    if (!newOrigemLabel.trim()) {
      toast.error('Informe o nome da origem');
      return;
    }

    const newValue = newOrigemLabel.toLowerCase().replace(/\s+/g, '_');
    const newOrigem = { value: newValue, label: newOrigemLabel };

    const updatedOrigens = [...origens, newOrigem];
    setOrigens(updatedOrigens);

    const customOnly = updatedOrigens.filter(o => !DEFAULT_ORIGENS.some(d => d.value === o.value));
    localStorage.setItem('custom_origens', JSON.stringify(customOnly));

    setOrigemLead(newValue);
    setOrigemDialogOpen(false);
    setNewOrigemLabel('');
    toast.success('Nova origem adicionada!');
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
        <div className="p-6 text-center text-muted-foreground">Negócio não encontrado.</div>
      </AppLayout>
    );
  }

  const headerContent = (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
      <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
      <Button variant="ghost" size="icon" className="shrink-0 -ml-1 h-8 w-8" onClick={closeEditor}>
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate">Editar Negócio</h1>
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
            ⚠️ Este negócio está em status "{STATUS_LABELS[pedidoStatus]}". Alterações podem impactar o fluxo.
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors", step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <span className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">1</span>
            Informações do Negócio
          </div>
          <div className="h-px w-8 bg-border" />
          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors", step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <span className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">2</span>
            Itens do Negócio
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {step === 1 ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <EmpresaSelector
                      value={clienteId}
                      onValueChange={handleClienteChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Fase do Negócio</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar fase" />
                      </SelectTrigger>
                      <SelectContent className="z-[1200]">
                        {(kanbanColunas ?? []).length > 0 ? (
                          (kanbanColunas ?? []).map((col) => (
                            <SelectItem key={col.id} value={col.slug}>
                              {col.nome}
                            </SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="novo_lead">Novo Lead</SelectItem>
                            <SelectItem value="negociacao">Negociação</SelectItem>
                            <SelectItem value="fechamento">Fechamento</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Marcador</Label>
                    <Select value={marcadorId || 'nenhum'} onValueChange={(v) => setMarcadorId(v === 'nenhum' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar marcador" />
                      </SelectTrigger>
                      <SelectContent className="z-[1200]">
                        <SelectItem value="nenhum">Nenhum</SelectItem>
                        {(marcadores ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fabricante *</Label>
                    <FabricanteSelector
                      value={fabricanteId}
                      onValueChange={setFabricanteId}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Obra</Label>
                    <SearchableSelect
                      options={(obras ?? []).map(o => ({ value: o.id, label: o.nome_obra }))}
                      value={obraId}
                      onValueChange={handleObraChange}
                      placeholder="Selecionar obra"
                      onActionClick={() => setObraDialogOpen(true)}
                      actionLabel="Nova Obra"
                    />
                    {selectedObra?.spe_cnpj && (
                      <p className="text-xs text-muted-foreground">SPE/CNPJ: {selectedObra.spe_cnpj}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsável *</Label>
                    <SearchableSelect
                      options={(vendedores ?? []).map(v => ({ value: v.id, label: v.nome }))}
                      value={vendedorId}
                      onValueChange={setVendedorId}
                      placeholder="Selecionar responsável"
                      className={!isGestor ? "opacity-50 pointer-events-none" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select value={origemLead} onValueChange={setOrigemLead}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecionar origem" />
                      </SelectTrigger>
                      <SelectContent className="z-[1200]">
                        <div className="max-h-[200px] overflow-y-auto">
                          {origens.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </div>
                        <div className="p-1 border-t mt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 h-8"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOrigemDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-2" /> Nova Origem
                          </Button>
                        </div>
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
                          onSelect={(d) => {
                            if (d) {
                              const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
                              setDataPedido(localDate);
                            }
                          }}
                          locale={ptBR}
                          initialFocus
                          captionLayout="dropdown-buttons"
                          fromYear={1950}
                          toYear={new Date().getFullYear() + 1}
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
                          onSelect={(d) => {
                            if (d) {
                              const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
                              setPrazoResposta(localDate);
                            } else {
                              setPrazoResposta(undefined);
                            }
                          }}
                          locale={ptBR}
                          initialFocus
                          captionLayout="dropdown-buttons"
                          fromYear={1950}
                          toYear={new Date().getFullYear() + 1}
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

                <div className="space-y-2">
                  <Label>Descrição do Negócio</Label>
                  <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações ou descrição geral do negócio" rows={3} />
                </div>

                <div className="space-y-2">
                  <Label>Arquivo PDF</Label>
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
                            <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB · substituirá o PDF atual</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="relative z-10 h-8 w-8 text-destructive"
                            onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : pdfUrl ? (
                        <>
                          <FileText className="h-6 w-6 text-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">PDF do Negócio</p>
                            <p className="text-xs text-muted-foreground">Clique ou arraste um novo arquivo para substituir</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = repairCorruptedBitrixUrl(pdfUrl);
                              setPdfPreview({ url, nome: filenameFromUrl(url, 'anexo.pdf') });
                            }}
                          >
                            Ver PDF
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

                {(camposConfig ?? []).filter(c => c.origem === 'customizado').map(campo => (
                  <div key={campo.id} className="space-y-2">
                    <Label>{campo.label}{isCampoObrigatorioNaEtapa(campo, currentKanbanColunaId) && ' *'}</Label>
                    <Input
                      value={camposExtras[campo.campo_key] ?? ''}
                      onChange={e => setCamposExtras(prev => ({ ...prev, [campo.campo_key]: e.target.value }))}
                      placeholder={campo.label ?? ''}
                    />
                  </div>
                ))}

                {Object.entries((pedidoData.pedido.campos_extras as Record<string, string> | null) || {}).map(([key, value]) => {
                  if (!value) return null;
                  if (key === 'pdf_url') return null; // já exibido acima em "Arquivo PDF", com correção de link corrompido
                  if ((camposConfig ?? []).some(c => c.origem === 'customizado' && c.campo_key === key)) return null;
                  const strValue = String(value).trim();
                  const isUrl = /^https?:\/\//i.test(strValue);
                  return (
                    <div key={key} className="space-y-2">
                      <Label>{key}</Label>
                      {isUrl ? (
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                          <FileText className="h-5 w-5 text-primary" />
                          <span className="text-sm font-medium flex-1 truncate">{key}</span>
                          <Button variant="outline" size="sm" asChild>
                            <a href={strValue} target="_blank" rel="noopener noreferrer">
                              Abrir
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <Input value={strValue} disabled />
                      )}
                    </div>
                  );
                })}

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
                    <Label className="text-base font-semibold">Itens do Negócio</Label>
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
                            <TableHead className="w-32">Unidade</TableHead>
                            <TableHead className="w-20">Qtd</TableHead>
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
                                <Select
                                  value={item.unidade}
                                  onValueChange={(v) => updateItem(item.id, 'unidade', v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Un." />
                                  </SelectTrigger>
                                  <SelectContent className="z-[1200]">
                                    <SelectItem value="Litro">Litro</SelectItem>
                                    <SelectItem value="Grama">Grama</SelectItem>
                                    <SelectItem value="Quilograma">Quilograma</SelectItem>
                                    <SelectItem value="Peça">Peça</SelectItem>
                                    <SelectItem value="Metro quadrado">Metro quadrado</SelectItem>
                                    <SelectItem value="Balde">Balde</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 text-xs" type="number" min="0" step="1" value={item.quantidade} onChange={e => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)} />
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

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <Button onClick={handleSubmit} disabled={updatePedido.isPending || isUploadingPdf}>
                    <Save className="h-4 w-4 mr-1" />
                    {updatePedido.isPending || isUploadingPdf ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Histórico de Movimentação</h2>
            </div>

            <HistoricoMovimentacaoNegocio historico={historicoStatus} stageLabel={getStatusLabel} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={obraDialogOpen} onOpenChange={setObraDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Obra *</Label>
              <Input
                value={newObraNome}
                onChange={(e) => setNewObraNome(e.target.value)}
                placeholder="Ex: Edifício Horizonte"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <p className="text-sm font-medium">{selectedCliente?.empresa || 'Cliente selecionado'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObraDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateObra} disabled={createObraMutation.isPending}>
              {createObraMutation.isPending ? 'Criando...' : 'Criar Obra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={origemDialogOpen} onOpenChange={setOrigemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Origem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Origem *</Label>
              <Input
                value={newOrigemLabel}
                onChange={(e) => setNewOrigemLabel(e.target.value)}
                placeholder="Ex: Evento de Construção"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrigemDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateOrigem}>
              Criar Origem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
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
        <div className="absolute top-full left-0 z-[1200] mt-1 w-72 rounded-md border bg-popover text-popover-foreground shadow-md">
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
                        {tp.estoque_disponivel !== undefined && ` · Estoque: ${tp.estoque_disponivel}`}
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

export default EditarPedido;

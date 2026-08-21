import { useState, useMemo, useEffect } from 'react';
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
import { useFunis } from '@/hooks/use-funis';
import { useObrasByCliente, useTabelaPrecos, useMyVendedorId, useIsGestor, useCreatePedidoCompleto } from '@/hooks/use-novo-pedido';
import { useCreateObra } from '@/hooks/use-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos, resolveFieldLabel, isCampoObrigatorioNaEtapa } from '@/hooks/use-configuracoes-campos';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/file-validation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Save, FileText, Upload } from 'lucide-react';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { FabricanteSelector } from '@/components/pedidos/FabricanteSelector';
import { NomeNegocioField } from '@/components/pedidos/NomeNegocioField';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { CampoMoeda } from '@/components/shared/CampoMoeda';
import { formatarMoedaBRL } from '@/lib/moeda';
import { getNomeNegocioAutomatico } from '@/lib/nome-negocio';

const DEFAULT_ORIGENS = [
  { value: 'recompra', label: 'Recompra' },
  { value: 'prospeccao_ativa', label: 'Prospecção Ativa' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'obra_nova', label: 'Obra Nova' },
];

const DEFAULT_UNIDADES = ['Litro', 'Grama', 'Quilograma', 'Peça', 'Metro quadrado', 'Balde'];

interface ItemPedido {
  id: string;
  descricao_material: string;
  referencia_fabricante: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number;
}

export interface NovoNegocioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-seleciona o cliente (ex.: aberto a partir da página de detalhes do cliente). */
  clienteId?: string;
  /** Fase inicial do negócio. Padrão: 'novo_lead'. */
  status?: string;
  /** Funil de destino. Sem isso, cai no funil padrão da empresa. */
  funilId?: string;
  /** Chamado após criação bem-sucedida. */
  onCreated?: (pedidoId?: string) => void;
}

export function NovoNegocioDialog({ open, onOpenChange, clienteId, status, funilId, onCreated }: NovoNegocioDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <NovoNegocioFormContent
          onOpenChange={onOpenChange}
          clienteId={clienteId}
          status={status}
          funilId={funilId}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  );
}

function NovoNegocioFormContent({
  onOpenChange,
  clienteId: clienteIdProp,
  status: statusProp,
  funilId: funilIdProp,
  onCreated,
}: Omit<NovoNegocioDialogProps, 'open'>) {
  const { data: clientes } = useClientes();
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();
  const { data: myVendedorId } = useMyVendedorId();
  const { data: isGestor } = useIsGestor();
  const { data: funis } = useFunis();
  // Funil vem do link de origem (ex: "+" numa coluna do Kanban de um funil específico);
  // sem isso, cai no funil padrão da empresa assim que a lista de funis carrega.
  const resolvedFunilId = funilIdProp || funis?.find(f => f.is_padrao)?.id;
  const { data: kanbanColunas } = useKanbanColunas(undefined, resolvedFunilId);
  const createPedido = useCreatePedidoCompleto();
  const createObraMutation = useCreateObra();

  const [clienteOpen, setClienteOpen] = useState(false);
  const [fabricanteOpen, setFabricanteOpen] = useState(false);
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

  const [unidades, setUnidades] = useState<string[]>(() => {
    const saved = localStorage.getItem('custom_unidades');
    if (saved) {
      try { return [...DEFAULT_UNIDADES, ...JSON.parse(saved)]; } catch { return DEFAULT_UNIDADES; }
    }
    return DEFAULT_UNIDADES;
  });
  const [unidadeDialogOpen, setUnidadeDialogOpen] = useState(false);
  const [unidadeDialogItemId, setUnidadeDialogItemId] = useState<string | null>(null);
  const [newUnidadeLabel, setNewUnidadeLabel] = useState('');

  const handleAddUnidade = () => {
    const nome = newUnidadeLabel.trim();
    if (!nome) { toast.error('Informe o nome da unidade'); return; }
    if (unidades.some(u => u.toLowerCase() === nome.toLowerCase())) {
      toast.error('Esta unidade já existe');
      return;
    }
    const novas = [...unidades, nome];
    setUnidades(novas);
    const customs = novas.filter(u => !DEFAULT_UNIDADES.includes(u));
    localStorage.setItem('custom_unidades', JSON.stringify(customs));
    if (unidadeDialogItemId) updateItem(unidadeDialogItemId, 'unidade', nome);
    setNewUnidadeLabel('');
    setUnidadeDialogOpen(false);
    setUnidadeDialogItemId(null);
    toast.success('Unidade adicionada');
  };

  const [step, setStep] = useState(1);

  // Step 1 fields
  const [clienteId, setClienteId] = useState(clienteIdProp ?? '');
  const [obraId, setObraId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [dataPedido, setDataPedido] = useState<Date>(new Date());
  const [prazoResposta, setPrazoResposta] = useState<Date | undefined>();
  const [origemLead, setOrigemLead] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState(statusProp ?? 'novo_lead');
  const [marcadorId, setMarcadorId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [nome, setNome] = useState('');
  const [nomeAutomatico, setNomeAutomatico] = useState(true);

  // Step 2 fields
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const { profile } = useAuth();
  const { data: camposConfig } = useConfiguracoesCampos('pedidos', profile?.empresa_id);
  const { data: marcadores } = useMarcadores(profile?.empresa_id);
  const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});
  const [proximoContato, setProximoContato] = useState<Date | undefined>();
  const [proximoContatoHora, setProximoContatoHora] = useState('09:00');
  const [valorManual, setValorManual] = useState<number | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  const isConstrutora = selectedCliente?.tipo === 'construtora' || !clienteId;
  const { data: obras } = useObrasByCliente(clienteId || null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);
  const selectedFabricante = useMemo(() => fabricantes?.find(f => f.id === fabricanteId), [fabricantes, fabricanteId]);
  const nomeAutomaticoPreview = useMemo(
    () => getNomeNegocioAutomatico(selectedCliente, selectedFabricante),
    [selectedCliente, selectedFabricante],
  );

  const valorTotalItens = useMemo(() => itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0), [itens]);
  const valorFinal = isManualMode ? (valorManual || 0) : valorTotalItens;

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
  // Etapa do KANBAN em que o negócio está sendo criado (não confundir com `step`, que é
  // o passo do wizard) — resolve qual kanban_coluna_id corresponde ao `status` escolhido,
  // usado para saber se campos com obrigatoriedade restrita a etapas se aplicam aqui.
  const currentKanbanColunaId = kanbanColunas?.find(c => c.slug === status)?.id;

  // Helper de leitura da config: campos que ainda não têm linha na config
  // (empresas antigas antes desta migration) caem no `fallback`, que reflete o
  // comportamento hardcoded que esses campos tinham antes de virarem configuráveis.
  const obrigatorio = (key: string, fallback: boolean) => {
    const campo = camposConfig?.find(c => c.campo_key === key);
    return campo ? isCampoObrigatorioNaEtapa(campo, currentKanbanColunaId) : fallback;
  };

  // Um único mapa de valores cobre os campos das duas etapas do wizard; qual
  // etapa cada campo pertence vem da própria config (`etapa`), então não
  // precisa duplicar essa lista aqui.
  const getMissingField = (etapaAlvo: 'step1' | 'step2') => {
    const valoresPadrao: Record<string, string | undefined> = {
      cliente_id: clienteId,
      fabricante_id: fabricanteId,
      vendedor_id: vendedorId,
      status: status,
      anexo_pdf: pdfFile ? 'ok' : undefined,
      data_pedido: dataPedido ? 'ok' : undefined,
      obra_id: obraId,
      origem_lead: origemLead,
      endereco_entrega: enderecoEntrega,
      prazo_resposta: prazoResposta ? 'ok' : undefined,
      observacoes: observacoes,
      itens: itens.length > 0 ? 'ok' : undefined,
      // Valor manual só é exigível quando o modo manual está ativo — fora dele,
      // o valor vem do somatório dos itens.
      valor_manual: (!isManualMode || valorManual != null) ? 'ok' : undefined,
      proximo_contato: proximoContato ? 'ok' : undefined,
    };
    const camposDaEtapa = (camposConfig ?? []).filter(c =>
      etapaAlvo === 'step2' ? c.etapa === 'Itens do Negócio' : c.etapa !== 'Itens do Negócio'
    );
    for (const campo of camposDaEtapa) {
      if (!isCampoObrigatorioNaEtapa(campo, currentKanbanColunaId)) continue;
      const valor = campo.origem === 'padrao' ? valoresPadrao[campo.campo_key] : camposExtras[campo.campo_key];
      if (!valor || !valor.trim()) {
        return resolveFieldLabel(campo);
      }
    }
    return null;
  };

  const missingStep1Field = getMissingField('step1');
  const missingStep2Field = getMissingField('step2');
  const isStep1Complete = missingStep1Field === null;
  const isStep2Complete = missingStep2Field === null;

  const validateStep1 = () => {
    if (missingStep1Field) {
      toast.error(`Preencha o campo obrigatório: ${missingStep1Field}`);
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (missingStep2Field) {
      toast.error(`Preencha o campo obrigatório: ${missingStep2Field}`);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep1() && validateStep2()) setStep(2);
  };

  const handleSubmit = async () => {
    if (!validateStep1() || !validateStep2()) return;
    if (!resolvedFunilId) { toast.error('Não foi possível identificar o funil de destino. Tente novamente em instantes.'); return false; }

    setIsUploading(true);
    let pdfUrl = '';

    try {
      if (pdfFile) {
        // 1. Upload PDF (nome sanitizado — o Storage rejeita chaves com acentos/
        // espaços — isolado numa pasta aleatória para evitar colisão entre uploads)
        const filePath = `${crypto.randomUUID()}/${sanitizeFileName(pdfFile.name)}`;

        const { error: uploadError } = await supabase.storage
          .from('pedido-anexos')
          .upload(filePath, pdfFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('pedido-anexos')
          .getPublicUrl(filePath);

        pdfUrl = publicUrl;
      }

      // 2. Create Pedido
      let proximoContatoISO: string | undefined;
      if (proximoContato) {
        const dt = new Date(proximoContato);
        const [h, m] = proximoContatoHora.split(':').map(Number);
        dt.setHours(h, m, 0, 0);
        proximoContatoISO = dt.toISOString();
      }

      const created = await createPedido.mutateAsync({
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        usuario_id: vendedorId,
        funil_id: resolvedFunilId,
        obra_id: obraId || undefined,
        status: status,
        marcador_id: marcadorId || undefined,
        nome: nomeAutomatico ? null : (nome.trim() || null),
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        pdf_url: pdfUrl,
        campos_extras: camposExtras,
        itens: itens.map(i => ({
          descricao_material: i.descricao_material,
          referencia_fabricante: i.referencia_fabricante || undefined,
          quantidade: i.quantidade,
          unidade: i.unidade || undefined,
          preco_unitario: i.preco_unitario,
        })),
        proximo_contato: proximoContatoISO,
        valor_total: valorFinal,
      });
      toast.success('Negócio criado com sucesso!');
      onCreated?.(created?.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
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
      // Verificar se já existe uma obra com este nome para este cliente (evitar duplicados)
      const normalizedNewName = newObraNome.trim().toLowerCase();
      const existingObra = obras?.find(o => o.nome_obra.trim().toLowerCase() === normalizedNewName);

      if (existingObra) {
        setObraId(existingObra.id);
        if (existingObra.endereco_entrega) setEnderecoEntrega(existingObra.endereco_entrega);
        toast.info('Esta obra já existia e foi selecionada automaticamente.');
        setObraDialogOpen(false);
        setNewObraNome('');
        return;
      }

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

  return (
    <>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Novo Negócio</DialogTitle>

          {/* Progress */}
          <div className="flex items-center gap-3 pt-2">
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
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
        {step === 1 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Cliente */}
                <div className="space-y-2">
                  <Label>Cliente{obrigatorio('cliente_id', true) && ' *'}</Label>
                  <EmpresaSelector
                    value={clienteId}
                    onValueChange={handleClienteChange}
                  />
                </div>

                {/* Fabricante */}
                <div className="space-y-2">
                  <Label>Fabricante{obrigatorio('fabricante_id', true) && ' *'}</Label>
                  <FabricanteSelector
                    value={fabricanteId}
                    onValueChange={setFabricanteId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome do Negócio */}
                <NomeNegocioField
                  nome={nome}
                  onNomeChange={setNome}
                  automatico={nomeAutomatico}
                  onAutomaticoChange={setNomeAutomatico}
                  nomeAutomaticoPreview={nomeAutomaticoPreview}
                />

                {/* Fase do Pedido */}
                <div className="space-y-2">
                  <Label>Fase do Negócio{obrigatorio('status', false) && ' *'}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar fase" />
                    </SelectTrigger>
                    <SelectContent>
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
                {/* Marcador */}
                <div className="space-y-2">
                  <Label>Marcador</Label>
                  {/* Era o único campo deste formulário sem busca: Cliente, Fabricante,
                      Obra e Responsável já têm. Com a lista de marcadores passando de
                      uma dezena, rolar até achar custa mais que digitar duas letras. */}
                  <SearchableSelect
                    options={[
                      { value: 'nenhum', label: 'Nenhum' },
                      ...(marcadores ?? []).map((m) => ({ value: m.id, label: m.nome })),
                    ]}
                    value={marcadorId || 'nenhum'}
                    onValueChange={(v) => setMarcadorId(v === 'nenhum' ? '' : v)}
                    placeholder="Selecionar marcador"
                    searchPlaceholder="Buscar marcador..."
                    emptyMessage="Nenhum marcador encontrado."
                  />
                </div>

                {/* Obra */}
                <div className="space-y-2">
                  <Label>Obra{obrigatorio('obra_id', false) && ' *'}</Label>
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
                {/* Vendedor */}
                <div className="space-y-2">
                  <Label>Responsável{obrigatorio('vendedor_id', true) && ' *'}</Label>
                  <SearchableSelect
                    options={(vendedores ?? []).map(v => ({ value: v.id, label: v.nome }))}
                    value={vendedorId}
                    onValueChange={setVendedorId}
                    placeholder="Selecionar responsável"
                    className={!isGestor ? "opacity-50 pointer-events-none" : ""}
                  />
                </div>

                {/* Origem */}
                <div className="space-y-2">
                  <Label>Origem{obrigatorio('origem_lead', false) && ' *'}</Label>
                  <Select value={origemLead} onValueChange={setOrigemLead}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecionar origem" />
                    </SelectTrigger>
                    <SelectContent>
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
              {/* Anexo PDF */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Anexar PDF{obrigatorio('anexo_pdf', true) && ' *'}
                  {obrigatorio('anexo_pdf', true) && (
                    <span className="text-xs font-normal text-muted-foreground">(Obrigatório)</span>
                  )}
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
                  <Label>Data de Criação{obrigatorio('data_pedido', true) && ' *'}</Label>
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
                  <p className="text-xs text-muted-foreground">Padrão: data atual. Pode ser alterada manualmente.</p>
                </div>

                {/* Data de Fechamento */}
                <div className="space-y-2">
                  <Label>Data de Fechamento{obrigatorio('prazo_resposta', false) && ' *'}</Label>
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

              {/* Endereço de entrega */}
              <div className="space-y-2">
                <Label>Endereço de Entrega{obrigatorio('endereco_entrega', false) && ' *'}</Label>
                <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} placeholder="Endereço de entrega" />
              </div>

              {/* Descrição do Pedido */}
              <div className="space-y-2">
                <Label>Descrição do Negócio{obrigatorio('observacoes', false) && ' *'}</Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações ou descrição geral do negócio" rows={3} />
              </div>

              {/* Campos customizados */}
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

            </div>
          ) : (
            <div className="space-y-5">
              {/* Items table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Itens do Negócio{obrigatorio('itens', false) && ' *'}</Label>
                  {itens.length > 0 && (
                    <Button size="sm" variant="outline" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar Item
                    </Button>
                  )}
                </div>

                {itens.length === 0 ? (
                  <div className="space-y-6">
                    <div className="border border-dashed border-border rounded-lg p-12 text-center bg-muted/5">
                      <p className="text-sm text-muted-foreground mb-4">Ainda não há itens neste negócio.</p>
                      <Button size="sm" onClick={addItem}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro item
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 p-4 border rounded-xl bg-muted/10">
                        <Label className="text-sm font-semibold">Valor de Negociação</Label>
                        {/* CampoMoeda no lugar do <input type="number"> antigo. Dois defeitos
                            morreram aqui de uma vez:
                            1. o campo era do padrão dos EUA e a leitura usava parseFloat —
                               parseFloat("99.888,47") devolve 99.888, MIL VEZES MENOS, sem
                               erro nenhum. Foi o que gravou 106.387.320,00 no lugar de
                               106.387,32 em produção;
                            2. em type="number" a roda do mouse altera o valor sozinha quando
                               o cursor está por cima do campo — a pessoa rola a página para
                               ver o resto do formulário e o valor muda sem ela ver.
                            O CampoMoeda entrega número puro no onChange, então nada de
                            parseFloat volta aqui. */}
                        <CampoMoeda
                          className="h-10 text-base font-bold"
                          value={valorManual}
                          onChange={(v) => {
                            setValorManual(v);
                            setIsManualMode(true);
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">Defina o valor manualmente caso não queira listar itens individuais.</p>
                      </div>

                      <div className="space-y-2 p-4 border rounded-xl bg-muted/10">
                        <Label className="text-sm font-semibold">Próximo Contato Agendado</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-10 justify-start text-left font-normal bg-background", !proximoContato && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {proximoContato ? format(proximoContato, "dd/MM/yyyy") : "Selecionar data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={proximoContato} onSelect={setProximoContato} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                          </PopoverContent>
                        </Popover>
                        {proximoContato && (
                          <div className="mt-2">
                            <Input type="time" className="h-8 text-xs" value={proximoContatoHora} onChange={e => setProximoContatoHora(e.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
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
                                <SelectContent>
                                  {unidades.map(u => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                  ))}
                                  <div className="border-t mt-1 pt-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 h-8"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setUnidadeDialogItemId(item.id);
                                        setUnidadeDialogOpen(true);
                                      }}
                                    >
                                      <Plus className="mr-2 h-3 w-3" />
                                      Nova unidade
                                    </Button>
                                  </div>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {/* Quantidade não é dinheiro, mas também não é campo do
                                  navegador: o step="0.001" PROMETIA quantidade quebrada que o
                                  type="number" não deixava digitar. Ao teclar a vírgula o
                                  navegador considera o valor inválido e devolve string VAZIA;
                                  o parseFloat('') || 0 gravava zero e o campo controlado
                                  reescrevia "0" por cima de quem estava escrevendo. Vender
                                  1,5 m² ou 0,75 tonelada ficava impossível pelo caminho que o
                                  brasileiro usa.
                                  casasDecimais={3} porque itens_pedido.quantidade é
                                  numeric(10,3) — é o TETO do que dá para digitar, não ordem de
                                  exibir três casas: 1,5 continua "1,5", porque "1,500" se lê
                                  como mil e quinhentos.
                                  Sem type="number", o onWheel e o min="0" saem juntos: roda de
                                  mouse não mexe em campo de texto, e o CampoMoeda já recusa
                                  negativo por padrão. O placeholder é "0" na mão porque o
                                  padrão do componente é "0,00", que é cara de dinheiro em
                                  coluna de quantidade. */}
                              <CampoMoeda
                                comPrefixo={false}
                                casasDecimais={3}
                                placeholder="0"
                                className="h-8 text-xs"
                                value={item.quantidade}
                                onChange={(v) => updateItem(item.id, 'quantidade', v ?? 0)}
                              />
                            </TableCell>
                            <TableCell>
                              {/* Sem "R$" porque a coluna já se chama "Preço Unit." e o espaço
                                  é curto. Erro aqui é pior que no valor total: preço unitário
                                  errado é multiplicado pela quantidade. */}
                              <CampoMoeda
                                comPrefixo={false}
                                className="h-8 text-xs"
                                value={item.preco_unitario}
                                onChange={(v) => updateItem(item.id, 'preco_unitario', v ?? 0)}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              {formatarMoedaBRL(item.quantidade * item.preco_unitario)}
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
                    <div className="flex justify-between items-center px-4 py-3 bg-muted/30 border-t border-border">
                      <div className="flex-1 max-w-[200px] space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Valor de Negociação</Label>
                        {/* A <div relative> de fora fica: é ela que ancora o botão
                            "Automático" por cima do campo. O CampoMoeda traz a sua própria
                            caixa e o seu próprio "R$" — aninhar as duas não quebra nada.
                            O valor passa cru (pode ser null): converter null para 0 aqui
                            faria o campo se reescrever com "0" no instante em que a pessoa
                            apagasse o conteúdo, o que parece defeito. */}
                        <div className="relative">
                          <CampoMoeda
                            className={cn("h-9 text-sm font-bold transition-all", isManualMode ? "border-primary ring-1 ring-primary bg-background" : "bg-muted/30 border-transparent")}
                            value={isManualMode ? valorManual : valorTotalItens}
                            onChange={(v) => {
                              setValorManual(v);
                              setIsManualMode(true);
                            }}
                          />
                          {isManualMode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-1 top-1 h-7 px-2 text-[10px] text-primary"
                              onClick={() => {
                                setIsManualMode(false);
                                setValorManual(null);
                              }}
                            >
                              Automático
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{isManualMode ? 'Valor Manual' : 'Total dos Itens'}</p>
                        <p className="text-lg font-bold text-foreground">
                          {formatarMoedaBRL(valorFinal)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Próximo contato - Somente se houver itens, caso contrário já aparece acima */}
              {itens.length > 0 && (
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
              )}

            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4 sm:justify-between">
          {step === 2 ? (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          ) : (
            <div />
          )}
          {step === 1 ? (
            <Button onClick={handleNext} disabled={!isStep1Complete || !isStep2Complete}>
              Próximo <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createPedido.isPending || isUploading || !isStep2Complete}>
              <Save className="h-4 w-4 mr-1" />
              {isUploading ? 'Enviando PDF...' : createPedido.isPending ? 'Criando...' : 'Criar Negócio'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

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
      <Dialog open={unidadeDialogOpen} onOpenChange={(o) => { setUnidadeDialogOpen(o); if (!o) setUnidadeDialogItemId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova unidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da unidade</Label>
            <Input
              value={newUnidadeLabel}
              onChange={(e) => setNewUnidadeLabel(e.target.value)}
              placeholder="Ex.: Caixa, Saco, Rolo..."
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUnidade(); } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnidadeDialogOpen(false); setNewUnidadeLabel(''); setUnidadeDialogItemId(null); }}>Cancelar</Button>
            <Button onClick={handleAddUnidade}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Quantas sugestões do catálogo cabem na listinha sem virar rolagem infinita.
// O corte já existia; o que faltava era AVISAR que ele existe — sem aviso, quem
// digita um termo genérico acha que a fábrica só tem 10 produtos.
const MAX_SUGESTOES_CATALOGO = 10;

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

  // A tela do Catálogo promete busca por referência, mas aqui só a descrição era
  // procurada. Quem sabe o código do produto de cabeça não achava nada e acabava
  // digitando o item na mão — perdendo o preço que veio da tabela da fábrica.
  const encontrados = useMemo(() => {
    const termo = value.trim().toLowerCase();
    if (!termo) return tabelaPrecos;
    return tabelaPrecos.filter(tp =>
      (tp.descricao_material ?? '').toLowerCase().includes(termo) ||
      (tp.referencia ?? '').toLowerCase().includes(termo)
    );
  }, [value, tabelaPrecos]);

  const filtered = encontrados.slice(0, MAX_SUGESTOES_CATALOGO);
  const ocultos = encontrados.length - filtered.length;

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
                        {formatarMoedaBRL(tp.preco_unitario)}
                        {tp.unidade && ` / ${tp.unidade}`}
                        {tp.estoque_disponivel !== undefined && ` · Estoque: ${tp.estoque_disponivel}`}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {ocultos > 0 && (
            <p className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
              Mais {ocultos} {ocultos === 1 ? 'item encontrado' : 'itens encontrados'} — escreva mais da descrição ou a referência.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

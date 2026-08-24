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
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useMarcadores } from '@/hooks/use-marcadores';
import { useObrasByCliente, useTabelaPrecos, useIsGestor } from '@/hooks/use-novo-pedido';
import { useCreateObra } from '@/hooks/use-mutations';
import { usePedidoCompleto, useUpdatePedidoCompleto } from '@/hooks/use-edit-pedido';
import { usePedidoHistoricoStatus } from '@/hooks/use-pedidos';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos, resolveFieldLabel, isCampoObrigatorioNaEtapa } from '@/hooks/use-configuracoes-campos';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/file-validation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Save, Loader2, FileText, Upload, History } from 'lucide-react';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { FabricanteSelector } from '@/components/pedidos/FabricanteSelector';
import { NomeNegocioField } from '@/components/pedidos/NomeNegocioField';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { getNomeNegocioAutomatico } from '@/lib/nome-negocio';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { filenameFromUrl } from '@/lib/download-file';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { CampoMoeda } from '@/components/shared/CampoMoeda';
import { CampoCnpj } from '@/components/shared/CampoCnpj';
import { SeletorMarcadorObra } from '@/components/obras/SeletorMarcadorObra';
import { validarCnpjDaObra } from '@/lib/obra-cnpj';
import type { CnpjData } from '@/lib/cnpj';
import { formatarMoedaBRL } from '@/lib/moeda';

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
  // Cascata da secao Obras. `=== true` e deliberado: enquanto a resposta nao chega, o
  // campo fica escondido — campo que aparece e some no meio da edicao e pior de usar que
  // campo que demora a aparecer.
  const { ligada: temObras } = useSecaoLigada('obras');

  const [initialized, setInitialized] = useState(false);
  const [step, setStep] = useState(1);

  const [obraDialogOpen, setObraDialogOpen] = useState(false);
  const [newObraNome, setNewObraNome] = useState('');
  // O CNPJ fica guardado COM máscara (é o contrato do <CampoCnpj>); só vira dígito puro na
  // hora de salvar. Marcador vazio = obra sem marcador, que é o padrão e um estado válido.
  const [newObraCnpj, setNewObraCnpj] = useState('');
  const [newObraMarcadorId, setNewObraMarcadorId] = useState('');
  const [newObraCnpjErro, setNewObraCnpjErro] = useState<string | null>(null);
  const [newObraNomeVeioDoCnpj, setNewObraNomeVeioDoCnpj] = useState(false);

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
  const [nome, setNome] = useState('');
  const [nomeAutomatico, setNomeAutomatico] = useState(true);

  // Step 2 fields
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);
  // Confirmação de remoção do anexo já salvo. Remover aqui apenas DESVINCULA: grava
  // pdf_url = null no negócio. O arquivo continua no bucket "pedido-anexos" e o link
  // antigo fica registrado no Histórico de Alterações, então um clique errado é
  // reversível.
  const [removerAnexoOpen, setRemoverAnexoOpen] = useState(false);
  const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});
  // Valor de negociação: por padrão espelha a soma dos itens; quando o usuário digita,
  // passa a valer o número digitado. Mesmo par de estados do cadastro novo
  // (NovoNegocioDialog.tsx).
  const [valorManual, setValorManual] = useState<number | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
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
      setNome(p.nome || '');
      setNomeAutomatico(!p.nome);
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
      // O banco guarda so um numero, sem dizer se veio da soma dos itens ou se foi
      // digitado. Deduzimos: valor salvo diferente da soma dos itens = alguem digitou,
      // entao o campo abre em modo manual. E isso que faz o valor dos negocios
      // importados (que tem valor e nenhum item) reaparecer em vez de zerar.
      const somaItens = pedidoData.itens.reduce((sum, i) => sum + Number(i.quantidade) * Number(i.preco_unitario), 0);
      const valorSalvo = Number(p.valor_total ?? 0);
      if (Math.abs(valorSalvo - somaItens) >= 0.01) {
        setValorManual(valorSalvo);
        setIsManualMode(true);
      }
      setInitialized(true);
    }
  }, [pedidoData, initialized]);

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  const { data: obras } = useObrasByCliente(clienteId || null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);
  const selectedFabricante = useMemo(() => fabricantes?.find(f => f.id === fabricanteId), [fabricantes, fabricanteId]);
  const nomeAutomaticoPreview = useMemo(
    () => getNomeNegocioAutomatico(selectedCliente, selectedFabricante),
    [selectedCliente, selectedFabricante],
  );

  const valorTotal = useMemo(() => itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0), [itens]);
  // Valor que vale para exibição e para gravação: o digitado, quando houver;
  // senão, a soma dos itens.
  const valorFinal = isManualMode ? (valorManual || 0) : valorTotal;

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
      // "Valor de Negociacao" e campo padrao configuravel (campo_key `valor_manual`).
      // Sem esta linha, a empresa que o marcasse como obrigatorio nunca conseguia salvar
      // a edicao: a chave nao existia no mapa e a validacao reprovava sempre.
      valor_manual: valorFinal > 0 ? 'ok' : undefined,
    };
    for (const campo of camposConfig ?? []) {
      // Com a seção Obras desligada o campo Obra não é desenhado nesta tela. Cobrá-lo
      // aqui impediria salvar qualquer negócio sem obra vinculada, num campo que ninguém
      // consegue preencher. A configuração continua gravada e volta a valer se a seção
      // for religada.
      if (campo.campo_key === 'obra_id' && temObras !== true) continue;
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
        nome: nomeAutomatico ? null : (nome.trim() || null),
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        pdf_url: newPdfUrl,
        campos_extras: camposExtras,
        // So manda o valor quando o usuario digitou. Fora disso o campo nem vai no
        // payload, e o gatilho do banco segue calculando pela soma dos itens - que e
        // exatamente o comportamento de hoje, sem risco de zerar valor importado.
        valor_total: isManualMode ? valorFinal : undefined,
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

  /**
   * Limpa o atalho inteiro ao sair dele. Com três campos (CNPJ, nome e marcador) deixar
   * resto do preenchimento anterior — inclusive a mensagem de erro do CNPJ — faria a
   * próxima obra nascer com dado que ninguém digitou de novo.
   */
  const fecharDialogoObra = () => {
    setObraDialogOpen(false);
    setNewObraNome('');
    setNewObraCnpj('');
    setNewObraMarcadorId('');
    setNewObraCnpjErro(null);
    setNewObraNomeVeioDoCnpj(false);
  };

  /**
   * A consulta da Receita NUNCA sobrescreve o que a pessoa já digitou — só preenche campo
   * vazio. É a mesma regra que já existe em Clientes, e é o que impede o nome da obra de
   * trocar sozinho depois de escrito.
   *
   * Só o NOME é preenchido aqui. O endereço que a Receita devolve é o da SEDE da empresa,
   * que costuma ser o escritório da construtora e não o canteiro — e este atalho nem tem
   * campo de endereço de obra: o `endereco_entrega` desta tela é do NEGÓCIO.
   */
  const preencherObraComDadosDoCnpj = (dados: CnpjData) => {
    const nomeDaReceita = (dados.razao_social || dados.nome_fantasia || '').trim();
    if (!nomeDaReceita || newObraNome.trim()) return;
    setNewObraNome(nomeDaReceita);
    setNewObraNomeVeioDoCnpj(true);
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

    // O `false` é a regra do produto: nem toda obra é uma SPE com CNPJ próprio, então o
    // campo é OPCIONAL aqui. Campo vazio passa; preenchido pela metade, não.
    const erroCnpj = validarCnpjDaObra(newObraCnpj, false);
    setNewObraCnpjErro(erroCnpj);
    if (erroCnpj) {
      toast.error(erroCnpj);
      return;
    }

    try {
      await createObraMutation.mutateAsync({
        nome_obra: newObraNome,
        cliente_id: clienteId,
        // O banco guarda só os 14 dígitos; a máscara existe apenas na tela.
        spe_cnpj: newObraCnpj.replace(/\D/g, ""),
        // String vazia NÃO serve: a coluna é uuid, e `marcador_id = ''` faz o banco recusar
        // a linha inteira. "Sem marcador" é null.
        marcador_id: newObraMarcadorId || null,
      });
      toast.success('Obra criada com sucesso!');
      fecharDialogoObra();
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

                <NomeNegocioField
                  nome={nome}
                  onNomeChange={setNome}
                  automatico={nomeAutomatico}
                  onAutomaticoChange={setNomeAutomatico}
                  nomeAutomaticoPreview={nomeAutomaticoPreview}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fabricante *</Label>
                    <FabricanteSelector
                      value={fabricanteId}
                      onValueChange={setFabricanteId}
                    />
                  </div>

                  {/* Obra — some junto com a seção. Anda de par com a exceção de
                      `obra_id` na varredura de obrigatórios (validateStep2): esconder aqui
                      sem tirar de lá impediria salvar negócio sem obra. O `obraId` já
                      gravado continua sendo enviado no salvamento de propósito — apagar
                      vínculo existente só porque a tela não mostra mais o campo destruiria
                      dado de quem religasse a seção depois. */}
                  {temObras === true && (
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
                  )}
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
                        {/* defaultMonth: sem ele o react-day-picker abre sempre no mês de hoje —
                            corrigir a data de um negócio importado de 2022 exigia clicar na seta
                            dezenas de vezes. Como o PopoverContent do Radix desmonta o conteúdo
                            ao fechar, o calendário monta de novo a cada abertura e recalcula o
                            mês: o defaultMonth (não controlado) basta, sem month/onMonthChange.
                            Passamos exatamente o mesmo valor de `selected`, pra abrir sempre no
                            mês do dia que está marcado. */}
                        <Calendar
                          mode="single"
                          selected={dataPedido}
                          defaultMonth={dataPedido}
                          onSelect={(d) => {
                            if (d) {
                              // Sem conversão de fuso: o calendário já entrega meia-noite
                              // LOCAL, e é o fuso local que `format(d,'yyyy-MM-dd')` lê na
                              // hora de gravar. A conta antiga subtraía o deslocamento do
                              // fuso (+180 min no Brasil) e recuava a data um dia inteiro:
                              // clicar no 15/03 gravava 14/03, e clicar no 1º/03 gravava
                              // 29/02. Medido, não suposto.
                              setDataPedido(d);
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
                        {/* Fechamento vazio abre no mês da Data de Criação, não no mês de hoje:
                            negócio criado em 2022 fecha por volta de 2022. Isso é só o mês em que
                            o calendário ABRE — continua livre escolher qualquer dia, inclusive
                            ANTERIOR à criação (fecha-mês: a venda é do mês passado e o cadastro
                            atrasou). Nada de fromDate/disabled aqui — ver SPEC.md §10. */}
                        <Calendar
                          mode="single"
                          selected={prazoResposta}
                          defaultMonth={prazoResposta ?? dataPedido}
                          onSelect={(d) => {
                            if (d) {
                              // Ver o comentário do campo de Data de Criação: a conversão de
                              // fuso que existia aqui recuava a data escolhida em um dia.
                              setPrazoResposta(d);
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="relative z-10 h-8 w-8 text-destructive"
                            title="Remover anexo"
                            aria-label="Remover anexo"
                            onClick={(e) => { e.stopPropagation(); setRemoverAnexoOpen(true); }}
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
                    <div className="space-y-6">
                      <div className="border border-dashed border-border rounded-lg p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">Nenhum item adicionado</p>
                        <Button size="sm" variant="outline" onClick={addItem}>
                          <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro item
                        </Button>
                      </div>

                      <div className="space-y-2 p-4 border rounded-xl bg-muted/10 max-w-sm">
                        <Label className="text-sm font-semibold">Valor de Negociacao</Label>
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
                        <p className="text-[10px] text-muted-foreground">Defina o valor manualmente caso nao queira listar itens individuais.</p>
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
                                {/* Quantidade não é dinheiro, mas também não é campo do
                                    navegador: o step="0.001" PROMETIA quantidade quebrada que
                                    o type="number" não deixava digitar. Ao teclar a vírgula o
                                    navegador considera o valor inválido e devolve string
                                    VAZIA; o parseFloat('') || 0 gravava zero e o campo
                                    controlado reescrevia "0" por cima de quem estava
                                    escrevendo. Vender 1,5 m² ou 0,75 tonelada ficava
                                    impossível pelo caminho que o brasileiro usa.
                                    casasDecimais={3} porque itens_pedido.quantidade é
                                    numeric(10,3) — é o TETO do que dá para digitar, não ordem
                                    de exibir três casas: 1,5 continua "1,5", porque "1,500" se
                                    lê como mil e quinhentos.
                                    Sem type="number", o onWheel e o min="0" saem juntos: roda
                                    de mouse não mexe em campo de texto, e o CampoMoeda já
                                    recusa negativo por padrão. O placeholder é "0" na mão
                                    porque o padrão do componente é "0,00", que é cara de
                                    dinheiro em coluna de quantidade. */}
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
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Valor de Negociacao</Label>
                          {/* A <div relative> de fora fica: é ela que ancora o botão
                              "Automatico" por cima do campo. O CampoMoeda traz a sua própria
                              caixa e o seu próprio "R$" — aninhar as duas não quebra nada.
                              O valor passa cru (pode ser null): converter null para 0 aqui
                              faria o campo se reescrever com "0" no instante em que a pessoa
                              apagasse o conteúdo, o que parece defeito. */}
                          <div className="relative">
                            <CampoMoeda
                              className={cn("h-9 text-sm font-bold transition-all", isManualMode ? "border-primary ring-1 ring-primary bg-background" : "bg-muted/30 border-transparent")}
                              value={isManualMode ? valorManual : valorTotal}
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
                                Automatico
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

      {/* Atalho "Nova Obra". Usa <ConteudoDialogo> (e não <DialogContent> cru) porque agora
          é um formulário de três campos: sem teto de altura e sem rolagem, num notebook
          1366x768 o botão Criar some por baixo e o "X" some por cima ao mesmo tempo — e
          este projeto desligou Esc e clique-fora, então a pessoa fica sem saída. */}
      <Dialog open={obraDialogOpen} onOpenChange={(aberto) => (aberto ? setObraDialogOpen(true) : fecharDialogoObra())}>
        <ConteudoDialogo>
          <CabecalhoDialogo>
            <DialogTitle>Nova Obra</DialogTitle>
          </CabecalhoDialogo>
          <CorpoDialogo>
            <div className="space-y-4 py-4">
              {/* O CNPJ vem ANTES do nome de propósito: quando a obra é uma SPE, a consulta
                  já traz a razão social e o nome sai de graça. */}
              <CampoCnpj
                label="CNPJ da Obra"
                value={newObraCnpj}
                onChange={(comMascara) => {
                  setNewObraCnpj(comMascara);
                  setNewObraCnpjErro(null);
                }}
                onDadosEncontrados={preencherObraComDadosDoCnpj}
                erro={newObraCnpjErro ?? undefined}
                descricao="Opcional — só quando a obra tem CNPJ próprio (SPE). Preenchendo, o nome vem da Receita."
              />
              <div className="space-y-2">
                <Label>Nome da Obra *</Label>
                <Input
                  value={newObraNome}
                  onChange={(e) => {
                    setNewObraNome(e.target.value);
                    setNewObraNomeVeioDoCnpj(false);
                  }}
                  placeholder="Ex: Edifício Horizonte"
                />
                {newObraNomeVeioDoCnpj && (
                  <p className="text-xs text-muted-foreground">
                    Preenchido pela consulta do CNPJ na Receita Federal. Confira antes de criar.
                  </p>
                )}
              </div>
              {/* Sem `onGerenciar`: a tela de gerenciar marcadores não está à mão aqui, e o
                  componente ajusta a frase do estado vazio sozinho. */}
              <SeletorMarcadorObra value={newObraMarcadorId} onChange={setNewObraMarcadorId} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cliente</Label>
                <p className="text-sm font-medium">{selectedCliente?.empresa || 'Cliente selecionado'}</p>
              </div>
            </div>
          </CorpoDialogo>
          <RodapeDialogo>
            <Button variant="outline" onClick={fecharDialogoObra}>Cancelar</Button>
            <Button onClick={handleCreateObra} disabled={createObraMutation.isPending}>
              {createObraMutation.isPending ? 'Criando...' : 'Criar Obra'}
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
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

      <Dialog open={removerAnexoOpen} onOpenChange={setRemoverAnexoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover o anexo deste negócio?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>O negócio vai ficar sem anexo assim que você salvar as alterações.</p>
            <p>O arquivo não é apagado do sistema — ele só deixa de ficar ligado a este negócio.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoverAnexoOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setPdfUrl('');
                setPdfFile(null);
                setRemoverAnexoOpen(false);
                toast.success('Anexo removido. Salve as alterações para confirmar.');
              }}
            >
              Remover anexo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
    </AppLayout>
  );
};

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

export default EditarPedido;

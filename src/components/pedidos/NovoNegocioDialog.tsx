import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo, CabecalhoAssistente, RodapeAssistente } from '@/components/shared/DialogoResponsivo';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useMarcadores } from '@/hooks/use-marcadores';
import { useFunis } from '@/hooks/use-funis';
import { useObrasByCliente, useMyVendedorId, useIsGestor, useCreatePedidoCompleto } from '@/hooks/use-novo-pedido';
import { useCreateObra } from '@/hooks/use-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos, resolveFieldLabel, isCampoObrigatorioNaEtapa } from '@/hooks/use-configuracoes-campos';
import { useSecaoLigada } from '@/hooks/use-secoes';
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
import { CampoCnpj } from '@/components/shared/CampoCnpj';
import { SeletorMarcadorObra } from '@/components/obras/SeletorMarcadorObra';
import { validarCnpjDaObra } from '@/lib/obra-cnpj';
import type { CnpjData } from '@/lib/cnpj';

import { getNomeNegocioAutomatico } from '@/lib/nome-negocio';

const DEFAULT_ORIGENS = [
  { value: 'recompra', label: 'Recompra' },
  { value: 'prospeccao_ativa', label: 'Prospecção Ativa' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'obra_nova', label: 'Obra Nova' },
];

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
  // Cascata da secao Obras: a empresa que nao contrata Obras nao pode ver campo de obra
  // aqui. `=== true` e deliberado — enquanto a resposta nao chega, o campo fica escondido:
  // campo que aparece e some no meio do preenchimento e pior de usar que campo que demora.
  const { ligada: temObras } = useSecaoLigada('obras');

  const [clienteOpen, setClienteOpen] = useState(false);
  const [fabricanteOpen, setFabricanteOpen] = useState(false);
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
  const [observacoes, setObservacoes] = useState('');
  const { profile } = useAuth();
  const { data: camposConfig } = useConfiguracoesCampos('pedidos', profile?.empresa_id);
  const { data: marcadores } = useMarcadores(profile?.empresa_id);
  const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});
  const [valorManual, setValorManual] = useState<number | null>(null);

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  const isConstrutora = selectedCliente?.tipo === 'construtora' || !clienteId;
  const { data: obras } = useObrasByCliente(clienteId || null);
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const selectedFabricante = useMemo(() => fabricantes?.find(f => f.id === fabricanteId), [fabricantes, fabricanteId]);
  const nomeAutomaticoPreview = useMemo(
    () => getNomeNegocioAutomatico(selectedCliente, selectedFabricante),
    [selectedCliente, selectedFabricante],
  );

  // Sem itens, o valor é sempre o que a pessoa digitou. A chave "modo manual" que existia
  // aqui só escolhia entre somar os itens e aceitar o número — virou pergunta sem sentido.
  const valorFinal = valorManual || 0;

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
      // Desde 26/08/2026 não há somatório de itens: o valor é sempre digitado, então
      // basta estar preenchido.
      valor_manual: valorManual != null ? 'ok' : undefined,
    };
    const camposDaEtapa = (camposConfig ?? []).filter(c =>
      // "Próximo Contato Agendado" tinha saído da tela e a linha continuava na
      // configuração de campos por empresa e ainda pode estar (ou vir a ser)
      // marcada como obrigatória lá. Sem esta exceção, a empresa que marcasse
      // ficaria sem nenhum lugar onde preencher: a validação reprovaria sempre e
      // o botão "Criar Negócio" nunca mais habilitaria. Se o campo um dia voltar,
      // basta apagar esta linha.
      c.campo_key !== 'proximo_contato' &&
      // Mesmo raciocínio para a Obra, por outro motivo: com a seção Obras desligada o
      // campo não é desenhado na tela. Cobrá-lo aqui travaria o assistente inteiro —
      // "Preencha o campo obrigatório: Obra vinculada" num campo que ninguém consegue
      // preencher, e o botão "Criar Negócio" nunca habilitaria. A linha continua gravada
      // na configuração de campos e volta a valer se a seção for religada.
      (temObras === true || c.campo_key !== 'obra_id') &&
      // 🔴 Este texto casa LITERALMENTE com `configuracoes_campos.etapa` no banco. Foi
      // renomeado de "Itens do Negócio" para cá na migration 20260826180000, e os dois lados
      // precisam mudar juntos — mudar só um faz o passo 2 deixar de reconhecer os próprios
      // campos, em silêncio.
      (etapaAlvo === 'step2' ? c.etapa === 'Valor e orçamento' : c.etapa !== 'Valor e orçamento')
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
        // Sem `itens`: o módulo de catálogo de produtos saiu em 26/08/2026 e o negócio passou
        // a ter só o valor e o PDF do orçamento. A tabela `itens_pedido` CONTINUA existindo,
        // com a única linha real que ela sempre teve — ela só não recebe linha nova. Ver
        // docs/operacao/catalogo-de-produtos-removido.md.
        // `proximo_contato` saiu do payload junto com o campo da tela. Omitir é seguro:
        // o hook só criava a linha em historico_contatos QUANDO o valor vinha preenchido
        // (use-novo-pedido.ts), então não mandar nada não apaga nem sobrescreve nada.
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
      // Verificar se já existe uma obra com este nome para este cliente (evitar duplicados)
      const normalizedNewName = newObraNome.trim().toLowerCase();
      const existingObra = obras?.find(o => o.nome_obra.trim().toLowerCase() === normalizedNewName);

      if (existingObra) {
        setObraId(existingObra.id);
        if (existingObra.endereco_entrega) setEnderecoEntrega(existingObra.endereco_entrega);
        // Selecionar a que já existe não altera o cadastro dela. Se a pessoa tinha digitado
        // CNPJ ou marcador, dizer que eles ficaram de fora evita a impressão de que a obra
        // antiga foi atualizada em silêncio.
        const tinhaDadosNovos = newObraCnpj.trim() !== '' || newObraMarcadorId !== '';
        toast.info(
          'Esta obra já existia e foi selecionada automaticamente.',
          tinhaDadosNovos
            ? { description: 'O CNPJ e o marcador digitados não foram aplicados na obra existente.' }
            : undefined,
        );
        fecharDialogoObra();
        return;
      }

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

  return (
    <>
      <ConteudoDialogo className="sm:max-w-4xl p-0">
        <CabecalhoAssistente
          className="border-b px-6 py-4"
          titulo="Novo Negócio"
          etapas={[
            { id: 1, label: 'Informações do Negócio' },
            { id: 2, label: 'Valor e orçamento' },
          ]}
          etapaAtual={step}
        />

        <CorpoDialogo className="mx-0 px-6 py-5">
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

                {/* Obra — some junto com a seção. Anda de par com a exceção de `obra_id`
                    na varredura de campos obrigatórios (getMissingField): esconder aqui
                    sem tirar de lá trava o assistente. */}
                {temObras === true && (
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
                )}
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
                      {/* defaultMonth: sem ele o react-day-picker abre sempre no mês de hoje,
                          ignorando a data já escolhida — quem recuava pra 2024, fechava o
                          calendário e reabria pra ajustar o dia voltava pro mês atual. O
                          PopoverContent do Radix desmonta ao fechar, então o calendário monta de
                          novo a cada abertura e recalcula o mês: defaultMonth (não controlado)
                          resolve, sem precisar de month/onMonthChange. */}
                      <Calendar
                        mode="single"
                        selected={dataPedido}
                        defaultMonth={dataPedido}
                        onSelect={(d) => {
                          if (d) {
                            // O calendário entrega meia-noite local e `format` grava em fuso
                            // local: converter aqui recuava a data um dia (15/03 virava 14/03).
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
                      {/* Fechamento vazio abre no mês da Data de Criação, não no de hoje —
                          cadastrando um negócio antigo, o fechamento também é antigo. É só o mês
                          de ABERTURA do calendário: escolher data anterior à criação continua
                          permitido (fecha-mês), então nada de fromDate/disabled — SPEC.md §10. */}
                      <Calendar
                        mode="single"
                        selected={prazoResposta}
                        defaultMonth={prazoResposta ?? dataPedido}
                        onSelect={(d) => {
                          if (d) {
                            // O calendário entrega meia-noite local e `format` grava em fuso
                            // local: converter aqui recuava a data um dia (15/03 virava 14/03).
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
            <div className="space-y-6">
              {/* O passo 2 era "Itens do Negócio": uma tabela de produtos vinda do catálogo,
                  com o valor escondido no rodapé dela. O catálogo de produtos saiu em
                  26/08/2026 (nunca teve dado real: 1 item em 11.910 negócios, nenhum criado
                  dentro do CRM), e o passo virou o que o representante realmente faz — anexar
                  o orçamento e dizer quanto é.

                  O anexo vem ANTES do valor de propósito: é a ordem do trabalho real, em que
                  a pessoa olha o PDF que montou e então digita o número. */}
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

              <div className="space-y-2 p-4 border rounded-xl bg-muted/10 max-w-sm">
                <Label className="text-sm font-semibold">Valor de Negociação{obrigatorio('valor_manual', false) && ' *'}</Label>
                {/* CampoMoeda, nunca <input type="number"> nem parseFloat. Dois defeitos
                    morreram aqui de uma vez e os dois eram silenciosos:
                    1. parseFloat("99.888,47") devolve 99.888 — MIL VEZES MENOS, sem erro. Foi
                       o que gravou 106.387.320,00 no lugar de 106.387,32 em produção;
                    2. em type="number" a roda do mouse altera o valor quando o cursor está
                       por cima — a pessoa rola a página e o valor muda sem ela ver.
                    O CampoMoeda entrega número puro no onChange. Ver CLAUDE.md §7.10. */}
                <CampoMoeda
                  className="h-10 text-base font-bold"
                  value={valorManual}
                  onChange={setValorManual}
                />
              </div>
            </div>
          )}
        </CorpoDialogo>

        <RodapeAssistente
          className="border-t px-6 py-4"
          esquerda={step === 2 ? (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          ) : undefined}
        >
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
        </RodapeAssistente>
      </ConteudoDialogo>

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
        <ConteudoDialogo>
          <CabecalhoDialogo>
            <DialogTitle>Nova Origem</DialogTitle>
          </CabecalhoDialogo>
          <CorpoDialogo>
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
          </CorpoDialogo>
          <RodapeDialogo>
            <Button variant="outline" onClick={() => setOrigemDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateOrigem}>
              Criar Origem
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>
    </>
  );
}

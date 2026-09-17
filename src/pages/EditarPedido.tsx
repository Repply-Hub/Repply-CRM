import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { useClientes, useFabricantes, useVendedores } from '@/hooks/use-clientes';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useMarcadores } from '@/hooks/use-marcadores';
import { useObrasByCliente, useIsGestor } from '@/hooks/use-novo-pedido';
import { useObras } from '@/hooks/use-obras';
import { opcoesDeObra, avisoDaListaDeObras } from '@/lib/opcoes-de-obra';
import { useCreateObra } from '@/hooks/use-mutations';
import { usePedidoCompleto, useUpdatePedidoCompleto } from '@/hooks/use-edit-pedido';
import { usePedidoHistoricoStatus } from '@/hooks/use-pedidos';
import { useAnexosDoNegocio, useAdicionarAnexo, useRemoverAnexo } from '@/hooks/use-pedido-anexos';
import { useAuth } from '@/hooks/use-auth';
import { useConfiguracoesCampos, resolveFieldLabel, isCampoObrigatorioNaEtapa } from '@/hooks/use-configuracoes-campos';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Save, Loader2, FileText, History, MessageSquare } from 'lucide-react';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { FabricanteSelector } from '@/components/pedidos/FabricanteSelector';
import { NomeNegocioField } from '@/components/pedidos/NomeNegocioField';
import { CampoDeAnexos } from '@/components/pedidos/CampoDeAnexos';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { ComentariosNegocio } from '@/components/pedidos/ComentariosNegocio';
import { getNomeNegocioAutomatico } from '@/lib/nome-negocio';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { CampoDeResponsaveis, type ResponsavelSelecionado } from '@/components/pedidos/CampoDeResponsaveis';
import { useResponsaveisDoNegocio } from '@/hooks/use-responsaveis-do-negocio';
import { CampoMoeda } from '@/components/shared/CampoMoeda';
import { CampoCnpj } from '@/components/shared/CampoCnpj';
import { SeletorMarcadorObra } from '@/components/obras/SeletorMarcadorObra';
import { validarCnpjDaObra } from '@/lib/obra-cnpj';
import type { CnpjData } from '@/lib/cnpj';
import { OrigemLeadSelect } from '@/components/shared/OrigemLeadSelect';

const STATUS_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  elaboracao: 'Em Elaboração',
  enviado: 'Enviado',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
  perdido: 'Perdido',
};

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
  const { data: responsaveisGravados } = useResponsaveisDoNegocio(id ?? null);
  // Os anexos do negócio (Tarefa 3): aqui o negócio já existe, então cada gesto (acrescentar ou
  // remover) grava na hora pelos ganchos próprios — igual à ficha (PainelDoNegocio.tsx) — em vez
  // de esperar o botão "Salvar Alterações", que só grava os campos do negócio em si.
  const { data: anexos } = useAnexosDoNegocio(id ?? null);
  const adicionarAnexo = useAdicionarAnexo(id ?? '');
  const removerAnexo = useRemoverAnexo(id ?? '');
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

  // Step 1 fields
  const [clienteId, setClienteId] = useState('');
  const [obraId, setObraId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');

  /**
   * Os responsáveis ALÉM do principal. Como no cadastro, `vendedorId` continua sendo o
   * principal — é ele que a validação exige e que vai em `usuario_id`.
   */
  const [participantes, setParticipantes] = useState<string[]>([]);

  const responsaveis = useMemo<ResponsavelSelecionado[]>(
    () => [
      ...(vendedorId ? [{ usuarioId: vendedorId, principal: true }] : []),
      ...participantes.map((uid) => ({ usuarioId: uid, principal: false })),
    ],
    [vendedorId, participantes],
  );

  const aplicarResponsaveis = (proximo: ResponsavelSelecionado[]) => {
    const principal = proximo.find((r) => r.principal);
    setVendedorId(principal?.usuarioId ?? '');
    setParticipantes(proximo.filter((r) => !r.principal).map((r) => r.usuarioId));
  };
  const [status, setStatus] = useState('novo_lead');
  const [marcadorId, setMarcadorId] = useState('');
  const [dataPedido, setDataPedido] = useState<Date>(new Date());
  const [prazoResposta, setPrazoResposta] = useState<Date | undefined>();
  const [origemLead, setOrigemLead] = useState('');
  const [enderecoEntrega, setEnderecoEntrega] = useState('');
  const [nome, setNome] = useState('');
  const [nomeAutomatico, setNomeAutomatico] = useState(true);

  // Step 2 fields
  const [observacoes, setObservacoes] = useState('');
  const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});
  // Valor de negociação: por padrão espelha a soma dos itens; quando o usuário digita,
  // passa a valer o número digitado. Mesmo par de estados do cadastro novo
  // (NovoNegocioDialog.tsx).
  const [valorManual, setValorManual] = useState<number | null>(null);
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
      setCamposExtras((p.campos_extras as Record<string, string> | null) || {});
      // 🔴 O valor salvo É o valor. Ponto.
      //
      // Aqui existia uma DEDUÇÃO: o banco guardava só um número, sem dizer se ele viera da
      // soma dos itens ou de alguém digitando, e o código comparava os dois para decidir em
      // que modo abrir o campo. Sem itens, não há o que deduzir — e some com ela o risco de a
      // conta dar quase igual e o valor digitado ser tratado como automático.
      setValorManual(Number(p.valor_total ?? 0));
      setInitialized(true);
    }
  }, [pedidoData, initialized]);

  // Os participantes gravados entram no estado quando a lista chega. Só o principal NÃO vem
  // por aqui: ele já vem de `pedidos.usuario_id`, no efeito acima, e as duas fontes concordam
  // porque o banco espelha uma na outra.
  //
  // 🔴 SEMEIA UMA VEZ SÓ. A consulta é refeita sozinha quando a pessoa volta o foco para a
  // janela, e a cada vez ela devolve um array novo — sem esta trava, alguém que acrescentasse
  // um responsável, fosse olhar outra aba e voltasse encontraria a mudança desfeita, sem aviso.
  const semeouResponsaveis = useRef(false);
  useEffect(() => {
    if (!responsaveisGravados || semeouResponsaveis.current) return;
    semeouResponsaveis.current = true;
    setParticipantes(responsaveisGravados.filter((r) => !r.principal).map((r) => r.usuarioId));
  }, [responsaveisGravados]);

  // Derived
  const selectedCliente = useMemo(() => clientes?.find(c => c.id === clienteId), [clientes, clienteId]);
  // Mesma composição do NovoNegocioDialog: as obras do cliente primeiro, as demais logo
  // abaixo e marcadas com o dono. As duas telas contam a mesma história sobre o mesmo campo.
  const {
    data: obras,
    isLoading: carregandoObrasDoCliente,
    isError: erroObrasDoCliente,
  } = useObrasByCliente(clienteId || null);
  const { data: todasAsObras } = useObras();
  const opcoesDeObraDoCampo = useMemo(
    () => opcoesDeObra(obras, todasAsObras as never, clienteId || null),
    [obras, todasAsObras, clienteId],
  );
  const selectedObra = useMemo(() => obras?.find(o => o.id === obraId), [obras, obraId]);
  const selectedFabricante = useMemo(() => fabricantes?.find(f => f.id === fabricanteId), [fabricantes, fabricanteId]);
  const nomeAutomaticoPreview = useMemo(
    () => getNomeNegocioAutomatico(selectedCliente, selectedFabricante),
    [selectedCliente, selectedFabricante],
  );

  // Valor que vale para exibição e para gravação: o digitado, quando houver;
  // senão, a soma dos itens.
  // Sem itens, o valor é sempre o que está no campo — não há soma para comparar.
  const valorFinal = valorManual || 0;

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
      anexo_pdf: (anexos?.length ?? 0) > 0 ? 'ok' : undefined,
      data_pedido: dataPedido ? 'ok' : undefined,
      obra_id: obraId,
      origem_lead: origemLead,
      endereco_entrega: enderecoEntrega,
      prazo_resposta: prazoResposta ? 'ok' : undefined,
      observacoes: observacoes,
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

    try {
      await updatePedido.mutateAsync({
        pedido_id: id,
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        usuario_id: vendedorId,
        participantes,
        obra_id: obraId || undefined,
        status: status,
        marcador_id: marcadorId || null,
        nome: nomeAutomatico ? null : (nome.trim() || null),
        data_pedido: format(dataPedido, 'yyyy-MM-dd'),
        prazo_resposta: prazoResposta ? format(prazoResposta, 'yyyy-MM-dd') : undefined,
        origem_lead: origemLead || undefined,
        endereco_entrega: enderecoEntrega || undefined,
        observacoes: observacoes || undefined,
        // Sem `pdf_url`: os anexos agora têm tabela própria (`pedido_anexos`) e cada gesto do
        // <CampoDeAnexos> abaixo grava na hora, pelos ganchos da Tarefa 3 — não pelo Salvar.
        campos_extras: camposExtras,
        // Vai SEMPRE. O gatilho `trg_recalcular_valor_total` só dispara por escrita em
        // `itens_pedido`, e esta tela não escreve mais lá — então não há mais a corrida que
        // obrigava a mandar o valor só às vezes, e depois de tudo. Ver use-edit-pedido.ts.
        valor_total: valorFinal,
        // Sem `itens`: o catálogo de produtos saiu em 26/08/2026. A tabela `itens_pedido`
        // continua existindo com a única linha real que sempre teve — esta tela apenas
        // deixou de escrever nela, o que também desarmou o gatilho que recalculava o valor.
        // Ver use-edit-pedido.ts e docs/operacao/catalogo-de-produtos-removido.md.
      });
      toast.success('Negócio atualizado com sucesso!');
      closeEditor();
    } catch (err: any) {
      toast.error(err.message);
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
            Valor e orçamento
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
                        options={opcoesDeObraDoCampo}
                        value={obraId}
                        onValueChange={handleObraChange}
                        placeholder="Selecionar obra"
                        emptyMessage={avisoDaListaDeObras({
                          temCliente: !!clienteId,
                          temAlguma: opcoesDeObraDoCampo.length > 0,
                          carregando: carregandoObrasDoCliente,
                          erro: erroObrasDoCliente,
                        })}
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
                    <CampoDeResponsaveis
                      pessoas={(vendedores ?? []).map(v => ({ id: v.id, nome: v.nome, avatarUrl: v.avatar_url }))}
                      value={responsaveis}
                      onChange={aplicarResponsaveis}
                      disabled={!isGestor}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <OrigemLeadSelect
                      value={origemLead}
                      onValueChange={setOrigemLead}
                      className="w-full"
                    />
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
                  // pdf_url legado: a coluna continua no banco (decisão 4), mas nenhuma tela
                  // escreve mais nela — os anexos vêm da lista em "Anexos", não daqui.
                  if (key === 'pdf_url') return null;
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
              <div className="space-y-6">
                {/* O passo 2 era "Itens do Negócio", com o valor escondido no rodapé da tabela
                    de produtos. O catálogo saiu em 26/08/2026 (nunca teve dado real) e o passo
                    virou o que o representante faz de verdade: anexar o orçamento e dizer
                    quanto é. Mesma mudança do NovoNegocioDialog — as duas telas têm que contar
                    a mesma história sobre o mesmo negócio.

                    Cada anexo grava (ou some) na hora, pelos ganchos da Tarefa 3 — igual à ficha
                    (PainelDoNegocio.tsx). Não depende do botão "Salvar Alterações" lá embaixo,
                    que só grava os campos do negócio em si. */}
                <div className="space-y-2">
                  <Label>Anexos</Label>
                  <CampoDeAnexos
                    anexos={anexos ?? []}
                    onAdicionar={(arquivo) => adicionarAnexo.mutate(arquivo)}
                    onRemover={(anexoId) => removerAnexo.mutate(anexoId)}
                    enviando={adicionarAnexo.isPending}
                  />
                </div>

                <div className="space-y-2 p-4 border rounded-xl bg-muted/10 max-w-sm">
                  <Label className="text-sm font-semibold">Valor de Negociação</Label>
                  {/* CampoMoeda, nunca type="number" nem parseFloat — ver CLAUDE.md §7.10. */}
                  <CampoMoeda
                    className="h-10 text-base font-bold"
                    value={valorManual}
                    onChange={setValorManual}
                  />
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

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Histórico de Movimentação</h2>
            </div>

            <HistoricoMovimentacaoNegocio historico={historicoStatus} stageLabel={getStatusLabel} />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Comentários</h2>
            </div>

            <ComentariosNegocio pedidoId={id ?? null} />
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
    </AppLayout>
  );
};
export default EditarPedido;

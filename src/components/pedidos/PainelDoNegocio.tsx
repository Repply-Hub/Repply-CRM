import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2, CalendarIcon, ClipboardList, Clock, DollarSign, Factory, FileText, History,
  Loader2, MessageSquare, Pencil, Plus, Tag, Trash2, User,
} from 'lucide-react';
import { Sheet, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConteudoDoPainel, CabecalhoDoPainel, CorpoDoPainel, RodapeDoPainel } from '@/components/shared/PainelDeDetalhes';
import { PainelDeResponsaveis } from '@/components/pedidos/PainelDeResponsaveis';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { ComentariosNegocio } from '@/components/pedidos/ComentariosNegocio';
import { ContatosDoNegocio } from '@/components/pedidos/ContatosDoNegocio';
import { HistoricoDoNegocio } from '@/components/pedidos/HistoricoDoNegocio';
import { UserProfilePopover } from '@/components/layout/UserProfilePopover';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { usePedidoPorId, usePedidoHistoricoStatus, type PedidoWithRelations } from '@/hooks/use-pedidos';
import { useTarefasPorPedido, type Tarefa } from '@/hooks/use-tarefas';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useMinhaPermissao } from '@/hooks/use-minha-permissao';
import { useAuth } from '@/hooks/use-auth';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { alvoDaTarefaDoNegocio, type AlvoDaTarefaDoNegocio } from '@/lib/alvo-da-tarefa-do-negocio';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';
import { filenameFromUrl } from '@/lib/download-file';
import { enderecoDoArquivo } from '@/lib/arquivo-privado';

// Cópia da mesma linha de `Negocios.tsx`. É uma função pura de uma linha, e trazê-la para cá é o
// que permite ao painel desenhar o crachá da etapa sem depender da tela que o monta.
const getStageBadgeClass = (corToken: string) => `bg-${corToken} text-white`;

/** Um campo extra (coluna criada na importação) que o painel deve mostrar. */
export interface CampoExtraDoNegocio {
  /** Id da coluna, do jeito que está em `campos_extras`. */
  id: string;
  /** Rótulo na tela — importações antigas gravaram o valor sob o RÓTULO, não sob o id. */
  rotulo: string;
}

export interface PainelDoNegocioProps {
  /** Identificador do negócio. `null` mantém o painel fechado. */
  pedidoId: string | null;
  /** Chamado ao fechar por qualquer caminho: botão Fechar, Esc, clique fora. */
  onClose: () => void;
  /**
   * Exclusão. Quando NÃO for passada, o botão Excluir não é desenhado.
   * Só a tela de Negócios passa: a exclusão de lá reaproveita a máquina de seleção em massa
   * (`setSelected` + `setConfirmDeleteOpen`), que não existe nas outras telas.
   */
  onExcluir?: (pedidoId: string) => void;
  /**
   * O negócio, quando quem monta o painel JÁ o tem em mãos.
   *
   * Só a tela de Negócios passa: ela já carregou as linhas da lista, e sem isto clicar num card
   * dispararia uma requisição que hoje não existe. Quando não vem, o painel busca sozinho — que
   * é o caso da pauta e da tabela de risco, onde o negócio quase nunca está carregado.
   */
  negocioJaCarregado?: PedidoWithRelations;
  /**
   * Campos extras a mostrar, na ordem. Quando não vem, nenhum é desenhado.
   *
   * 🔴 Por que é `prop` e não um hook daqui: a lista sai de `useTableSettings({ key: 'pedidos' })`,
   * que é a configuração de colunas DA LISTA de Negócios. Esse hook lê `configuracoes_tabelas` no
   * servidor ao montar e a regrava (com atraso) a cada mudança de estado. Duas instâncias da
   * MESMA chave na mesma árvore dobrariam a leitura e passariam a disputar a mesma linha: a
   * segunda não enxerga o que a primeira mudou (o evento `storage` não dispara para a própria
   * aba) e regravaria por cima a configuração velha. Quem já tem o hook manda a lista pronta.
   */
  camposExtras?: CampoExtraDoNegocio[];
}

/**
 * O painel de detalhe do negócio — o mesmo em qualquer tela.
 *
 * 🔴 POR QUE ISTO VIROU UM COMPONENTE, em 07/09/2026. O painel morava inteiro dentro de
 * `Negocios.tsx`, e por isso ver um negócio a partir da tela "Hoje" significava SAIR da tela e
 * cair na lista de Negócios. Quem quisesse abri-lo de outro lugar teria de copiar o bloco — que
 * é exatamente como as fichas de empresa e de contato acabaram com dois painéis de negócios
 * divergentes, e o conserto de um não alcançava o outro (commit 3069249d, 06/09/2026).
 *
 * `src/test/painel-do-negocio-e-uma-peca-so.test.ts` é o guarda contra a segunda cópia.
 *
 * O que o painel NÃO decide: de onde vem o negócio (a tela pode mandá-lo pronto), o que a
 * exclusão faz, e quais campos extras aparecem. O porquê de cada um está em
 * `PainelDoNegocioProps`.
 */
export function PainelDoNegocio({
  pedidoId,
  onClose,
  onExcluir,
  negocioJaCarregado,
  camposExtras,
}: PainelDoNegocioProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;

  // 🔴 A busca por id é o que faz o botão "Abrir negócio" da tela "Hoje" funcionar. Ela só sai
  // quando quem monta o painel NÃO mandou o negócio pronto.
  //
  // O que `negocioJaCarregado` poupa é UMA requisição — esta —, não todas. Medido na tela em
  // 09/09/2026: abrir o painel na tela de Negócios dispara 8 requisições na primeira vez e 6 em
  // regime; as outras (tarefas, histórico de status, responsáveis, histórico de contato,
  // comentários) saem com ou sem a propriedade. O ganho é real e barato, mas quem ler "abre de
  // graça" vai decidir sem medir. Ver `usePedidoPorId`.
  const {
    data: negocioBuscado,
    isLoading,
    error: erroDaBusca,
  } = usePedidoPorId(pedidoId, !negocioJaCarregado);

  // O que a tela já tem em mãos tem prioridade: depois de arrastar um card no Kanban, a linha
  // local já reflete a etapa nova, enquanto a busca por id ainda devolveria a anterior.
  const negocio = negocioJaCarregado ?? negocioBuscado ?? undefined;

  const { data: tarefasNegocio } = useTarefasPorPedido(pedidoId);
  const { data: historicoStatusNegocio } = usePedidoHistoricoStatus(pedidoId);
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = useMemo(
    () => tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome })),
    [tarefasKanbanColunas]
  );

  // Espelho da política de UPDATE do banco. Não protege nada — quem recusa é o Postgres.
  const { permitido: podeEditar } = useMinhaPermissao('pedidos', 'editar');

  // As etapas saem do funil DO PRÓPRIO NEGÓCIO (`pedidos.funil_id`), nunca do funil que a tela
  // que montou o painel está mostrando. Achado 🟠 A1 da revisão da Tarefa 1: a versão anterior
  // resolvia pelo funil do QUADRO (guardado no navegador, com fallback pro padrão da empresa) —
  // igual a `Negocios.tsx`. Isso é fiel só enquanto todo negócio aberto pertence ao funil
  // corrente, o que é verdade na tela de Negócios (a lista já é filtrada por `funilId`) mas não
  // na pauta "Hoje" nem na tabela de risco, que podem abrir um negócio de OUTRO funil — e aí o
  // crachá mostrava o slug cru ("negociacao") em vez do nome e da cor da etapa.
  //
  // 🔴 O casamento da etapa precisa das TRÊS colunas — slug, empresa_id e funil_id — nunca só o
  // slug: uma empresa com dois funis pode repetir o mesmo slug em etapas diferentes (já causou
  // bug duas vezes neste projeto: migrations 20260905140000 e a da Etapa 3). `useKanbanColunas`
  // já filtra por `empresa_id` e `funil_id` na consulta; o `.find` do `stageLabel` casa o slug
  // só DENTRO desse recorte — nunca solto.
  //
  // Por que continua sendo `useKanbanColunas` (e não `useKanbanColunasEmpresa`, o padrão de
  // `BarraDeFiltros.tsx`): na tela de Negócios todo negócio listado já tem
  // `funil_id === funilId` (a lista é filtrada por `.eq('funil_id', funilId)`), então esta chave
  // de consulta é IDÊNTICA à que a própria tela usa (`['kanban_colunas', empresaId, funilId]`) —
  // montar o painel lá não gera requisição nova, os dois leem a mesma entrada do cache.
  // `useKanbanColunasEmpresa` tem chave própria (`['kanban_colunas_empresa', empresaId]`) e hoje
  // só divide cache com a barra de filtros da pauta — trocar para ela criaria uma requisição
  // nova bem na tela mais usada do sistema. Medido, não suposto.
  const { data: kanbanColunas } = useKanbanColunas(empresaId, negocio?.funil_id);
  const etapas = useMemo(
    () => (kanbanColunas ?? []).map(c => ({ key: c.slug, label: c.nome, color: c.cor })),
    [kanbanColunas]
  );
  // Sem `funil_id` no negócio, ou com a etapa não encontrada no funil dele, cai no texto cru do
  // status — o comportamento de sempre, não um vazio novo.
  const stageLabel = (key: string) => etapas.find(s => s.key === key)?.label || (key || '');

  // `=== true` em todo uso, nunca `!== false`: enquanto a resposta não chega, a cascata esconde.
  // Bloco que aparece e some meio segundo depois é pior de usar que bloco que demora.
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  const { ligada: temObras } = useSecaoLigada('obras');

  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [editingTarefaNegocio, setEditingTarefaNegocio] = useState<Tarefa | null>(null);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);

  // O negócio a que a tarefa deste formulário pertence, congelado no clique que o abriu.
  // Ver `alvoDaTarefaDoNegocio`.
  const [alvoDaTarefa, setAlvoDaTarefa] = useState<AlvoDaTarefaDoNegocio | null>(null);

  const abrirNovaTarefa = () => {
    setAlvoDaTarefa(alvoDaTarefaDoNegocio(negocio));
    setAddTarefaOpen(true);
  };
  const abrirEdicaoDeTarefa = (tarefa: Tarefa) => {
    setAlvoDaTarefa(alvoDaTarefaDoNegocio(negocio));
    setEditingTarefaNegocio(tarefa);
  };

  // Enquanto o formulário de tarefa está por cima, NADA fecha o painel por clique fora.
  const formularioDeTarefaAberto = addTarefaOpen || editingTarefaNegocio !== null;

  return (
    <>
      <Sheet
        open={!!pedidoId}
        onOpenChange={(open) => {
          if (open) return;
          onClose();
        }}
      >
        <ConteudoDoPainel
          className="sm:max-w-xl"
          /*
            🔴 O DEFEITO QUE ISTO CONSERTA, conferido na tela em 09 e 10/09/2026: o PRIMEIRO
            clique dentro do formulário de "Nova Tarefa" fechava o painel do negócio inteiro.

            A causa é a soma de duas escolhas legítimas. O painel é um `Sheet` — que é o Dialog
            do Radix — e, sendo modal, o `DismissableLayer` dele continua sendo o layer mais alto
            "com ponteiros de fora desligados". O `TarefaFormDialog`, por outro lado, é
            `modal={false}` DE PROPÓSITO (senão a trava de rolagem do Radix mata a roda do mouse
            dentro dos seletores dele — está escrito lá, em TarefaFormDialog.tsx:170). Um diálogo
            não-modal não assume esse posto, então o painel segue ouvindo cliques do lado de fora
            da própria árvore — e o formulário vive noutro portal. Resultado: clicar no formulário
            contava como "clicou fora do painel", `pedidoId` virava nulo e a tarefa nascia solta.

            🔴 POR QUE A CONDIÇÃO É O ESTADO, e não "o alvo está dentro do diálogo de tarefa".
            Medido no DOM em 10/09/2026: os seletores do formulário (Responsável, Empresa,
            Negócio, Participantes, Marcadores, Status e o calendário do Prazo) são portais
            pendurados DIRETO no `<body>` — `dialogoDaTarefa.contains(alvo)` deu `false` para o
            popover de Responsável. Uma checagem por `closest()` no conteúdo do diálogo
            consertaria o clique no campo de texto e deixaria sete buracos: escolher um
            responsável na lista continuaria fechando o painel.

            O que isto NÃO desliga: o botão Fechar, o "X", o Esc e o clique fora quando não há
            formulário de tarefa aberto — tudo segue igual. E o Esc com o formulário aberto já
            era do formulário, não do painel: o Radix só entrega a tecla ao layer mais alto.
          */
          onInteractOutside={(evento) => {
            if (formularioDeTarefaAberto) evento.preventDefault();
          }}
        >
          <CabecalhoDoPainel className="border-b pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <SheetTitle className="text-foreground font-bold text-lg">
                  {negocio ? getNomeNegocio(negocio) : 'Detalhes do Negócio'}
                </SheetTitle>
                {/* O <SheetDescription> continua montado mesmo sem a seção, e só o texto some:
                    é ele que o painel usa como descrição acessível (aria-describedby), e tirar o
                    elemento deixaria o leitor de tela sem referência. Sem Obras, a frase "Sem obra
                    vinculada" seria pior que o silêncio — fala de algo que a empresa não tem. */}
                <SheetDescription>
                  {temObras === true && (negocio?.obra?.nome_obra ?? 'Sem obra vinculada')}
                </SheetDescription>
              </div>
              {negocio && (
                <Badge className={getStageBadgeClass(etapas.find(s => s.key === negocio.status)?.color ?? 'muted-foreground')}>
                  {stageLabel(negocio.status)}
                </Badge>
              )}
            </div>
          </CabecalhoDoPainel>

          <CorpoDoPainel className="pt-6">
          {negocio ? (
            <div className="space-y-8">
              {/* Grid de Dados */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> Cliente
                  </p>
                  {negocio.cliente ? (
                    <button 
                      onClick={() => navigate(`/clientes/${negocio.cliente?.id}`)}
                      className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                    >
                      {negocio.cliente.empresa}
                      <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <p className="text-sm font-medium">-</p>
                  )}
                </div>
                {/* Sem a seção, o quadro de Obra some inteiro — rótulo e valor. O botão levaria
                    para /obras, que a guarda de rota já barra: mostrar um caminho fechado é pior
                    que não mostrar caminho nenhum. A grade é de duas colunas fixas, então os
                    outros quadros só se reacomodam. */}
                {temObras === true && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" /> Obra
                    </p>
                    {negocio.obra ? (
                      <button
                        // `/obras/{id}` NÃO existe como rota (App.tsx só tem `/obras`), então
                        // este clique caía no curinga e abria "página não encontrada". O
                        // caminho certo já existia em ClienteDetalhe.tsx:720: navega para
                        // `/obras` levando o id no estado, e a tela de Obras o lê e abre a
                        // obra (Obras.tsx:138).
                        onClick={() =>
                          navigate('/obras', {
                            state: { selectedObraId: negocio.obra?.id },
                          })
                        }
                        className="text-sm font-medium hover:text-primary transition-colors text-left flex items-center gap-1 group"
                      >
                        {negocio.obra.nome_obra}
                        <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ) : (
                      <p className="text-sm font-medium">{negocio.obra?.nome_obra ?? '-'}</p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Factory className="h-3 w-3" /> Fabricante
                  </p>
                  <p className="text-sm font-medium">{negocio.fabricante?.nome ?? '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Marcador
                  </p>
                  {negocio.marcador ? (
                    <Badge className={getStageBadgeClass(negocio.marcador.cor)}>
                      {negocio.marcador.nome}
                    </Badge>
                  ) : (
                    <p className="text-sm font-medium">-</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3" /> Valor Total
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {(negocio.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Responsáveis
                  </p>
                  {/*
                    Aqui a estrela grava NA HORA: este painel não tem botão de salvar, e um clique
                    que não valesse na hora faria a pessoa fechar o painel achando que mudou algo.
                    Toda troca de estrela entra no histórico de atividades do negócio.

                    🔴 O nome deixou de ser um atalho para a ficha da pessoa. Com vários
                    responsáveis, um link só teria de escolher um deles — e o painel passaria a
                    responder "quem é o titular" em vez de "quem toca este negócio", que é a
                    pergunta que o campo único existe para responder. A ficha da pessoa continua
                    a um clique em Usuários.
                  */}
                  <PainelDeResponsaveis pedidoId={negocio.id} somenteLeitura={!podeEditar} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Data de Criação
                  </p>
                  <p className="text-sm font-medium">
                    {negocio.data_pedido ? (() => {
                      const dateParts = negocio.data_pedido.split('-');
                      return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    })() : '-'}
                  </p>
                </div>
                {negocio.prazo_resposta && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarIcon className="h-3 w-3" /> Data de Fechamento
                    </p>
                    <p className="text-sm font-medium">
                      {(() => {
                        const dateParts = negocio.prazo_resposta.split('-');
                        return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                      })()}
                    </p>
                  </div>
                )}
                {negocio.pdf_url && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Anexo
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const original = repairCorruptedBitrixUrl(negocio.pdf_url);
                        const nome = filenameFromUrl(original, 'anexo.pdf');
                        // Assina no clique, não ao desenhar a lista: só paga pelo anexo que alguém
                        // de fato abre. O nome sai do endereço ORIGINAL, onde o caminho está limpo.
                        setPdfPreview({ url: (await enderecoDoArquivo(original)) ?? original, nome });
                      }}
                      className="inline-flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                    >
                      <FileText className="h-4 w-4" /> Ver PDF anexado
                    </button>
                  </div>
                )}
                {/* Renderização de Campos Extras dinâmicos */}
                {(camposExtras ?? []).map(({ id: colId, rotulo }) => {
                  // Quais colunas chegam aqui (as extras visíveis, já sem as padrão, sem "acoes"
                  // e sem `pdf_url`, que aparece acima em "Anexo") é decisão de quem monta o
                  // painel — ver `camposExtras` em PainelDoNegocioProps.
                  const value = negocio.campos_extras?.[colId] ?? negocio.campos_extras?.[rotulo];
                  if (!value) return null;

                  // Evita duplicar a exibição quando o mesmo link já aparece na seção "Anexo"
                  // estruturada abaixo (importações antigas guardavam o PDF só como campo extra).
                  // Compara após reparo, pois o valor bruto em campos_extras pode ter a corrupção
                  // de locale (pontos trocados por vírgulas) que o pdf_url estruturado já corrige.
                  if (
                    negocio.pdf_url &&
                    typeof value === 'string' &&
                    repairCorruptedBitrixUrl(value.trim()) === repairCorruptedBitrixUrl(negocio.pdf_url.trim())
                  ) return null;

                  const isUrl = typeof value === 'string' && /^https?:\/\//i.test(value.trim());

                  return (
                    <div key={colId} className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> {rotulo}
                      </p>
                      {isUrl ? (
                        <a
                          href={value.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 text-sm font-medium text-primary hover:underline w-fit"
                        >
                          <FileText className="h-4 w-4" /> Abrir {rotulo}
                        </a>
                      ) : (
                        <p className="text-sm font-medium">{value}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Endereço */}
              {negocio.endereco_entrega && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Endereço de Entrega</p>
                  <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{negocio.endereco_entrega}</p>
                  </div>
                </div>
              )}

              {/* Observações — o texto livre do negócio.
                  🔴 POR QUE ELE PRECISA ESTAR AQUI (achado 🟠 A1 da revisão do Plano A,
                  09/09/2026). Até 09/09/2026 o único detalhe do sistema que mostrava
                  `pedidos.observacoes` era o diálogo próprio da ficha do cliente — e ele saiu
                  quando as fichas passaram a abrir este painel. A lista de Negócios tem a coluna
                  "Observações", mas ela NÃO vem ligada por padrão (`NEGOCIOS_DEFAULT_VISIBLE`),
                  então o campo ficou sem lugar nenhum na tela.
                  Medido em produção: 442 dos 12.473 negócios têm o campo preenchido — mas o
                  número geral engana. Na JHS Representações são 277 de 277 (100%), e o texto de
                  lá é `"Pedido 100867/26 | Produtos: …"`. Como `itens_pedido` está VAZIA no
                  sistema inteiro, este campo é o único lugar onde os produtos do pedido existem
                  para aquela empresa. E entre os negócios criados dentro do CRM (não importados)
                  são 165 de 211 (78%).

                  `whitespace-pre-wrap` porque o texto da JHS traz quebras de linha que separam
                  os itens — colapsá-las embaralharia a lista de produtos numa parede de texto.
                  `break-words` porque o painel tem largura fixa (`sm:max-w-xl`) e código de
                  produto ou endereço longo sem espaço transbordaria a lateral.

                  O `trim()` é o `nullif(trim(...))` do lado do JS: a importação gravou campo só
                  com espaço em algumas linhas, e um bloco vazio com rótulo ocupa espaço sem
                  informar nada. */}
              {negocio.observacoes?.trim() && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Observações</p>
                  <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
                    <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                      {negocio.observacoes.trim()}
                    </p>
                  </div>
                </div>
              )}

              {/* As pessoas da construtora, com o atalho para a conversa de cada uma. Até
                  04/09/2026 o negócio não tinha lista de contatos em lugar nenhum — a coluna
                  "Contato" da lista é texto solto vindo da importação, sem id nem telefone. */}
              <ContatosDoNegocio
                clienteId={negocio.cliente_id}
                empresaNome={negocio.cliente?.empresa}
              />

              {/* O que aconteceu com este negócio: o que alguém anotou à mão, e um resumo por
                  conversa de WhatsApp. O card antigo dependia de um `selectedOrder` que ninguém
                  preenchia, e a consulta dele quebraria se rodasse. */}
              <HistoricoDoNegocio
                pedidoId={pedidoId}
                clienteId={negocio.cliente_id}
                empresaNome={negocio.cliente?.empresa}
                dataPedido={negocio.data_pedido}
                prazoResposta={negocio.prazo_resposta}
                status={negocio.status}
              />

              {/* Tarefas / Observações do negócio — some quando a empresa não contratou a
                  seção. Os irmãos acima e abaixo são blocos independentes no mesmo
                  empilhamento, então o espaçamento se fecha sozinho. */}
              {temTarefas === true && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tarefas</p>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={abrirNovaTarefa}>
                    <Plus className="h-3.5 w-3.5" /> Nova Tarefa
                  </Button>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Tarefa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Prazo Final</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!tarefasNegocio?.length ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            Nenhuma tarefa vinculada a este negócio
                          </TableCell>
                        </TableRow>
                      ) : (
                        tarefasNegocio.map(tarefa => (
                          <TableRow key={tarefa.id} className="cursor-pointer hover:bg-muted/30" onClick={() => abrirEdicaoDeTarefa(tarefa)}>
                            <TableCell className="font-medium text-sm">{tarefa.titulo}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{tarefa.status.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="text-sm" onClick={(e) => tarefa.responsavel && e.stopPropagation()}>
                              {tarefa.responsavel ? <UserProfilePopover name={tarefa.responsavel} /> : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {tarefa.prazo_final
                                ? format(new Date(tarefa.prazo_final), 'dd/MM/yyyy', { locale: ptBR })
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {/* Histórico de Movimentação no Kanban */}
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <History className="h-3 w-3" /> Histórico de Movimentação
                </p>
                <HistoricoMovimentacaoNegocio historico={historicoStatusNegocio} stageLabel={stageLabel} />
              </div>

              {/* Comentários manuais — separado do log automático acima */}
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3" /> Comentários
                </p>
                <ComentariosNegocio pedidoId={pedidoId} />
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : erroDaBusca ? (
            /* Quarto estado, achado da revisão de 06/09/2026: FALHA AO CARREGAR não é a mesma
               coisa que "não existe mais". Queda de rede, tempo limite de 8s do Postgres (ver
               CLAUDE.md §7.15) ou identificador malformado no endereço caem aqui — depois de
               3 tentativas do TanStack Query — e o negócio pode estar intacto. Confundir os dois
               manda a pessoa procurar um negócio que nunca sumiu. `mensagemDeErro` porque erro do
               Supabase não é um `Error`: `e instanceof Error` daria falso aqui. */
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <p className="text-sm font-medium text-card-foreground">
                Não foi possível carregar este negócio.
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {mensagemDeErro(erroDaBusca, 'Falha ao buscar. Tente novamente em instantes.')}
              </p>
            </div>
          ) : (
            /* Terceiro estado: negócio apagado, de outra empresa, ou identificador que não existe
               mais — sem erro nenhum na busca. Sem ele o painel gira para sempre e nada chega ao
               registro de erros — o painel não lança exceção nenhuma. */
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <p className="text-sm font-medium text-card-foreground">
                Este negócio não está mais disponível.
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Ele pode ter sido excluído, ou o link que você abriu é de outra empresa.
              </p>
            </div>
          )}
          </CorpoDoPainel>

          {/* Rodapé CONGELADO e no MESMO padrão do painel de Obras, a pedido do Lucas: à esquerda
              o que se usa todo dia (Editar, Fechar), à direita a exclusão, sozinha.

              O botão "Exportar" saiu. Ele abria a exportação de UM negócio, coisa que a tela de
              Negócios já faz pela seleção da lista — e ficava colado nas duas ações que a pessoa
              de fato usa aqui. */}
          <RodapeDoPainel
            esquerda={
              <>
                {/* Achado da revisão de 06/09/2026: os dois botões ficam SEMPRE montados, com
                    `disabled` no lugar de sumir/aparecer. Montar "Editar" só quando o dado chega
                    empurrava "Fechar" para a direita no meio do gesto — quem mirava em Fechar
                    enquanto a busca corria caía em Editar. */}
                <Button disabled={!negocio} onClick={() => navigate(`/pedidos/${pedidoId}/editar`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </>
            }
          >
            {/* Sem `onExcluir` o botão nem é desenhado: o que a exclusão faz depende da tela
                (ver PainelDoNegocioProps), e um botão que não age é pior que botão nenhum. */}
            {onExcluir && (
              <Button
                variant="ghost"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={!negocio}
                onClick={() => onExcluir(pedidoId!)}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
          </RodapeDoPainel>
        </ConteudoDoPainel>
      </Sheet>

      {/* Cinto e suspensório: os dois únicos gatilhos que abrem estes diálogos já estão
          dentro do bloco escondido acima, então eles nasceriam com `open={false}` de
          qualquer jeito. Vale mesmo assim — impede que um gatilho novo, colado ali no
          futuro, ressuscite a tela de tarefas numa empresa que não contratou. */}
      {temTarefas === true && (
        <>
          {/* 🔴 `extraFields` sai do alvo CONGELADO no clique, nunca de `pedidoId` — que é
              `string | null` e cujo `!` escondia justamente o nulo que gravava a tarefa solta.
              Ver `alvoDaTarefaDoNegocio`, e o teste
              `src/test/tarefa-do-painel-nasce-ligada-ao-negocio.test.ts`. */}
          <TarefaFormDialog
            open={addTarefaOpen}
            onOpenChange={setAddTarefaOpen}
            editingTarefa={null}
            kanbanStages={tarefaKanbanStages}
            extraFields={alvoDaTarefa ?? undefined}
          />
          <TarefaFormDialog
            open={!!editingTarefaNegocio}
            onOpenChange={(open) => { if (!open) setEditingTarefaNegocio(null); }}
            editingTarefa={editingTarefaNegocio}
            kanbanStages={tarefaKanbanStages}
            extraFields={alvoDaTarefa ?? undefined}
          />
        </>
      )}
      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
    </>
  );
}

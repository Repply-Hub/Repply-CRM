import { useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
// Casca de modal com teto de altura e rolagem própria — sem ela este diálogo
// fica mais alto que a janela (precisa de ~930px) e o botão "Salvar alterações"
// some para fora da tela, sem barra de rolagem para alcançá-lo. Ver
// src/components/shared/DialogoResponsivo.tsx.
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TOGGLE_LIST_CLASS, TOGGLE_ITEM_CLASS } from '@/lib/toggle-group-styles';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { CampoMoeda } from '@/components/shared/CampoMoeda';
import { formatarMoedaBRL } from '@/lib/moeda';
import { Goal, Pencil, Plus, Trash2, Loader2, Copy, Users, User, GripVertical, Info, Search, Factory, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlanoVendasProgresso,
  usePlanoVendasProgressoPorVendedor,
  useMetasVendas,
  useMetasIndividuaisAlocadas,
  useUpsertMetaVenda,
  useDeleteMetaVenda,
  useFabricantesOrdemPlanoVendas,
  useReorderFabricantesPlanoVendas,
} from '@/hooks/use-plano-vendas';
import { usePodeFazer } from '@/hooks/use-permissoes';
import {
  compararNomeDeFabricante,
  compararStatusDeFabricante,
  fabricanteEstaAtivo,
} from '@/lib/ordem-de-fabricantes';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MOSTRAR_DETALHADO_KEY = 'md-plano-vendas-detalhado';
const VISUALIZACAO_KEY = 'md-plano-vendas-visualizacao';

// A máscara de dinheiro deste arquivo (formatMetaInputDisplay/parseMetaInputValue/
// numberToMetaDisplay e o MetaValorInput) foi promovida a peça compartilhada em
// src/lib/moeda.ts + src/components/shared/CampoMoeda.tsx, para o campo de meta e
// o campo de valor do negócio serem literalmente o mesmo código. De brinde o
// cursor parou de pular para o fim ao editar o meio de um número já digitado.
const formatCurrency = formatarMoedaBRL;

// O rascunho da edição guarda NÚMERO puro (ou null quando o campo está vazio),
// não mais o texto formatado. Vazio e zero passam a ser coisas distintas: zero é
// uma meta que alguém escolheu, vazio é a ausência dela — e limpar um campo que
// tinha meta salva agora significa remover a meta, como já era a intenção.
type ValorMeta = number | null;

// Cabeçalho de coluna com um "i" que explica o que ela significa em tooltip — as
// colunas de meta geral/restante/individual não são autoexplicativas na primeira
// olhada, diferente do resto da UI.
function ColunaHeaderInfo({ label, info, className }: { label: string; info: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center gap-1 text-center ${className ?? ''}`}>
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label={`O que é ${label}`}>
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs normal-case font-normal">{info}</TooltipContent>
      </Tooltip>
    </span>
  );
}

interface Vendedor {
  usuario_id: string;
  usuario_nome: string;
}

interface Fabricante {
  id: string;
  nome: string;
  /** Status "Ativa / Inativa" — marca que a empresa não representa mais. Opcional porque
   *  as RPCs desta seção devolvem fabricante sem essa coluna; ausente conta como ativa. */
  ativo?: boolean;
}

interface PlanoVendasSectionProps {
  empresaId: string;
  currentUsuarioId?: string;
  // Segue o filtro "Responsável" do topo da página (array vazio = "Todos", vê o
  // progresso agregado/por vendedor da empresa) — antes esta seção tinha um
  // seletor de vendedor próprio, solto do resto dos cards. Como o filtro agora
  // aceita mais de uma seleção, "editar metas" só faz sentido quando exatamente
  // UM vendedor está selecionado (ver `vendedorUnico` no corpo do componente) —
  // com 0 ou 2+, a seção mostra a visão agregada/por vendedor, sem alvo único
  // pra editar.
  //
  // Vale IGUAL pra gestor e pra vendedor comum: o Dashboard não trava mais o
  // vendedor comum nele mesmo (ver Dashboard.tsx, onde esta propriedade é
  // montada). Sem filtro escolhido, todo mundo abre na visão da EMPRESA.
  vendedorIds: string[];
  // Segue o filtro "Fabricante" do topo da página (array vazio = "Todos").
  fabricanteIds: string[];
  vendedores: Vendedor[];
  fabricantes: Fabricante[];
  // O período INTEIRO do filtro do topo da página, em 'yyyy-MM-dd' — antes esta
  // seção recebia só `ano` e `mes` da data INICIAL, então um filtro de "01/jan a
  // 31/dez" fazia o Plano de Vendas mostrar janeiro e chamar aquilo de "total do
  // período", sem nenhum aviso de que os outros onze meses tinham ficado de fora.
  dateFrom: string;
  dateTo: string;
  // Avisa o Dashboard que as setas de mês pediram outro período. Quem é dono do
  // estado de data é o Dashboard (é ele que alimenta o DateRangePicker e TODAS
  // as métricas da página), então esta seção não guarda data nenhuma: ela só
  // pede a troca e recebe o novo período de volta por dateFrom/dateTo. Sem esta
  // propriedade, as setas simplesmente não aparecem.
  onPeriodoChange?: (range: { from: Date; to: Date }) => void;
}

/**
 * As RPCs desta seção devolvem `fabricante_id`/`fabricante_nome`, sem o status
 * Ativa/Inativa. Isto embrulha o id no formato que os comparadores de
 * `src/lib/ordem-de-fabricantes.ts` esperam, consultando o índice montado a partir da
 * lista que o Dashboard passa por propriedade.
 *
 * Marca ausente do índice conta como ATIVA — pode ser uma fábrica que a lista do filtro
 * ainda não trouxe, e ausência de informação não desativa ninguém.
 */
function statusDoFabricante(indice: Map<string, boolean> | undefined, fabricanteId: string) {
  return { ativo: indice?.get(fabricanteId) ?? true };
}

function progressoCor(pct: number) {
  if (pct >= 100) return 'text-[hsl(var(--success))]';
  if (pct >= 60) return 'text-primary';
  return 'text-muted-foreground';
}

export function PlanoVendasSection({ empresaId, currentUsuarioId, vendedorIds, fabricanteIds, vendedores, fabricantes, dateFrom, dateTo, onPeriodoChange }: PlanoVendasSectionProps) {
  // Controle de acesso granular (módulo `plano_vendas` em `permissoes_usuario`)
  // — `isGestor` era usado nos quatro pontos abaixo e saiu por completo desta
  // seção; quem renderiza (Dashboard.tsx) continua com seu próprio `isGestor`
  // pra decidir OUTRAS coisas da página, sem relação com este componente.
  const podeVerMetasFabrica = usePodeFazer('plano_vendas', 'ver', 'ver_metas_fabrica');
  const podeVerMetasVendedor = usePodeFazer('plano_vendas', 'ver', 'ver_metas_vendedor');
  const podeCriarMeta = usePodeFazer('plano_vendas', 'criar');
  const podeEditarMeta = usePodeFazer('plano_vendas', 'editar');

  const [editOpen, setEditOpen] = useState(false);
  const [mostrarDetalhado, setMostrarDetalhado] = useState(
    () => localStorage.getItem(MOSTRAR_DETALHADO_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(MOSTRAR_DETALHADO_KEY, mostrarDetalhado ? '1' : '0');
  }, [mostrarDetalhado]);

  // Alterna a visão detalhada entre "por fabricante" (padrão) e "por vendedor"
  // — só faz sentido quando a seção "Por vendedor" existe (ver
  // `mostrarPorVendedor` abaixo); nos demais casos só a visão por fabricante é
  // renderizada, independente deste estado.
  const [visualizacao, setVisualizacao] = useState<'fabricante' | 'vendedor'>(
    () => (localStorage.getItem(VISUALIZACAO_KEY) === 'vendedor' ? 'vendedor' : 'fabricante'),
  );

  useEffect(() => {
    localStorage.setItem(VISUALIZACAO_KEY, visualizacao);
  }, [visualizacao]);

  // Quem tem `ver_metas_vendedor` mas não `ver_metas_fabrica` (configuração
  // incomum, mas possível desde que o gestor pode restringir as duas
  // funcionalidades de forma independente) nunca deveria ficar preso em
  // "fabricante" — a visão padrão/guardada no localStorage pode ter sido
  // escolhida antes da permissão mudar, e sem este ajuste o switch "Mostrar
  // vendas detalhado" abriria uma seção vazia.
  useEffect(() => {
    if (!podeVerMetasFabrica && podeVerMetasVendedor && visualizacao === 'fabricante') {
      setVisualizacao('vendedor');
    }
  }, [podeVerMetasFabrica, podeVerMetasVendedor, visualizacao]);

  // "Editar metas" e o resumo "Meta x realizado — Fulano" só existem quando dá
  // pra apontar pra UMA pessoa específica — com 0 (Todos) ou 2+ selecionados,
  // vira visão agregada/por vendedor (mostrarPorVendedor abaixo).
  const vendedorUnico = vendedorIds.length === 1 ? vendedorIds[0] : undefined;

  // O diálogo "Editar metas" continua trabalhando MÊS a MÊS (meta é compromisso
  // mensal e a tabela metas_vendas é por ano/mês), então ele abre no primeiro mês
  // do período — mas navega livremente lá dentro.
  const anoInicial = Number(dateFrom.slice(0, 4));
  const mesInicial = Number(dateFrom.slice(5, 7));
  const anoFinal = Number(dateTo.slice(0, 4));
  const mesFinal = Number(dateTo.slice(5, 7));
  // Rótulo do período: "Agosto de 2026" quando é um mês só, "Janeiro a Dezembro
  // de 2026" dentro do mesmo ano, "Nov/2025 a Fev/2026" quando cruza o ano. O
  // rótulo precisa dizer a verdade — era ele que sustentava a impressão de que o
  // número embaixo se referia ao filtro escolhido.
  const periodoLabel = useMemo(() => {
    if (anoInicial === anoFinal && mesInicial === mesFinal) return `${MESES[mesInicial - 1]} de ${anoInicial}`;
    if (anoInicial === anoFinal) return `${MESES[mesInicial - 1]} a ${MESES[mesFinal - 1]} de ${anoInicial}`;
    return `${MESES[mesInicial - 1].slice(0, 3)}/${anoInicial} a ${MESES[mesFinal - 1].slice(0, 3)}/${anoFinal}`;
  }, [anoInicial, mesInicial, anoFinal, mesFinal]);

  // Setas ao lado do rótulo do mês. Elas NÃO são um filtro próprio desta seção:
  // mudam o filtro "Período" do topo do Dashboard, então a página inteira (KPIs,
  // gráficos, tudo) anda junto — é o mesmo mês em todo lugar, sem dois períodos
  // discordando na mesma tela.
  //
  // REGRA quando o período atual NÃO é um mês fechado (alguém escolheu à mão
  // 10/03 a 25/07, por exemplo): a seta vale sobre o MÊS DA DATA INICIAL e o
  // resultado é SEMPRE um mês inteiro. De "10/03 a 25/07", a seta da direita
  // leva a "01/04 a 30/04". É previsível e é o único formato que se compara com
  // a meta, que é um compromisso mensal — voltar "30 dias" deixaria o período
  // pisando em dois meses e a meta somaria os dois.
  const irParaMes = (delta: number) => {
    if (!onPeriodoChange) return;
    // Montado a partir de ano/mês em número, não de `new Date(dateFrom)`: uma
    // string 'yyyy-MM-dd' é lida como UTC pelo construtor e, no fuso do Brasil,
    // voltaria um dia — cairia no mês anterior quando o dia é 1º (CLAUDE.md §7.12).
    const alvo = addMonths(new Date(anoInicial, mesInicial - 1, 1), delta);
    onPeriodoChange({ from: startOfMonth(alvo), to: endOfMonth(alvo) });
  };

  const { data: progresso, isLoading } = usePlanoVendasProgresso(
    dateFrom,
    dateTo,
    vendedorIds.length > 0 ? vendedorIds : undefined,
    fabricanteIds.length > 0 ? fabricanteIds : undefined,
    // Só na visão de 1 vendedor: fábrica sem meta individual some da lista/total
    // (mesma regra da seção "Por vendedor" abaixo). Na visão "Todos" (agregada)
    // continua somando as metas de equipe normalmente.
    !!vendedorUnico,
  );

  const temMetas = !!progresso && progresso.length > 0;

  // As duas RPCs desta seção devolvem `fabricante_id` e `fabricante_nome`, sem o status
  // Ativa/Inativa. Quem sabe o status é a lista que o Dashboard passa por propriedade —
  // daí este índice, para as ordenações abaixo consultarem por id.
  const fabricanteAtivoPorId = useMemo(
    () => new Map(fabricantes.map(f => [f.id, fabricanteEstaAtivo(f)])),
    [fabricantes],
  );

  // A RPC `plano_vendas_progresso` ordena por meta desc / vendido desc — ela NÃO usa a
  // ordem arrastada à mão (`fo.ordem`), diferente da RPC "por vendedor". Aqui só se
  // acrescenta o status na frente: `sort` é estável, então tudo que tem o mesmo status
  // mantém exatamente a ordem que o servidor mandou. É a única forma de a marca
  // desativada não abrir o Plano de Vendas só porque tinha a maior meta.
  const progressoOrdenado = useMemo(() => {
    if (!progresso) return progresso;
    return [...progresso].sort((a, b) =>
      compararStatusDeFabricante(
        statusDoFabricante(fabricanteAtivoPorId, a.fabricante_id),
        statusDoFabricante(fabricanteAtivoPorId, b.fabricante_id),
      ),
    );
  }, [progresso, fabricanteAtivoPorId]);

  const totalMeta = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.meta_valor, 0), [progresso]);
  const totalVendido = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.vendido_valor, 0), [progresso]);
  const totalPct = totalMeta > 0 ? (totalVendido / totalMeta) * 100 : 0;

  // O `!!vendedorUnico` antes da comparação não é decoração: na visão da empresa
  // (sem filtro) `vendedorUnico` é undefined, e `undefined === currentUsuarioId`
  // seria verdade se o id do usuário também chegasse vazio — o título diria
  // "Você" em cima de um número que é da empresa inteira.
  const vendedorNome = vendedores.find(v => v.usuario_id === vendedorUnico)?.usuario_nome
    ?? (!!vendedorUnico && vendedorUnico === currentUsuarioId ? 'Você' : '');

  // Ordem customizada dos fabricantes (definida em "Editar metas") — a RPC
  // principal já ordena por ela, mas o agrupamento "Por vendedor" abaixo é
  // montado no cliente, então precisa reaplicar aqui.
  const { data: fabricantesOrdemMap } = useFabricantesOrdemPlanoVendas(empresaId);

  // Detalhamento por vendedor — busca/mostra sempre que não há exatamente um
  // vendedor selecionado (0 = Todos, 2+ = um subconjunto) pra quem tem a
  // funcionalidade `ver_metas_vendedor`: antes só existia a soma da empresa
  // aqui, e tinha que trocar o filtro "Responsável" um vendedor de cada vez
  // pra inspecionar o plano de cada um.
  const mostrarPorVendedor = podeVerMetasVendedor && vendedorIds.length !== 1;
  const { data: progressoPorVendedorRaw } = usePlanoVendasProgressoPorVendedor(
    dateFrom,
    dateTo,
    mostrarPorVendedor,
    vendedorIds.length > 0 ? vendedorIds : undefined,
    fabricanteIds.length > 0 ? fabricanteIds : undefined,
  );
  // A RPC já só traz (vendedor, fabricante) com meta INDIVIDUAL > 0 (ver
  // plano_vendas_progresso_por_vendedor) — o agrupamento abaixo mantém essas linhas
  // por fábrica dentro de cada vendedor (não só a soma), pra listar embaixo do nome
  // dele só as fábricas em que o gestor de fato definiu uma meta individual.
  const porVendedor = useMemo(() => {
    const porId = new Map<string, {
      usuario_id: string;
      usuario_nome: string;
      meta_valor: number;
      vendido_valor: number;
      fabricas: { fabricante_id: string; fabricante_nome: string; meta_valor: number; vendido_valor: number }[];
    }>();
    for (const linha of progressoPorVendedorRaw ?? []) {
      const atual = porId.get(linha.usuario_id) ?? {
        usuario_id: linha.usuario_id,
        usuario_nome: linha.usuario_nome,
        meta_valor: 0,
        vendido_valor: 0,
        fabricas: [],
      };
      atual.meta_valor += linha.meta_valor;
      atual.vendido_valor += linha.vendido_valor;
      atual.fabricas.push({
        fabricante_id: linha.fabricante_id,
        fabricante_nome: linha.fabricante_nome,
        meta_valor: linha.meta_valor,
        vendido_valor: linha.vendido_valor,
      });
      porId.set(linha.usuario_id, atual);
    }
    const resultado = Array.from(porId.values());
    resultado.forEach(v => v.fabricas.sort((a, b) => {
      // 🔴 O status vem ANTES da ordem arrastada à mão: uma marca que alguém arrastou
      // para o topo e só depois deixou de representar continuaria no topo para sempre.
      const porStatus = compararStatusDeFabricante(
        statusDoFabricante(fabricanteAtivoPorId, a.fabricante_id),
        statusDoFabricante(fabricanteAtivoPorId, b.fabricante_id),
      );
      if (porStatus !== 0) return porStatus;
      const oa = fabricantesOrdemMap?.get(a.fabricante_id) ?? Number.MAX_SAFE_INTEGER;
      const ob = fabricantesOrdemMap?.get(b.fabricante_id) ?? Number.MAX_SAFE_INTEGER;
      return oa !== ob ? oa - ob : b.meta_valor - a.meta_valor;
    }));
    return resultado.sort((a, b) => b.vendido_valor - a.vendido_valor);
  }, [progressoPorVendedorRaw, fabricantesOrdemMap, fabricanteAtivoPorId]);

  return (
    <Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300 mb-8">
      <CardHeader className="pb-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Goal className="h-4 w-4 text-primary" /> Plano de Vendas
            </CardTitle>
            <CardDescription className="text-xs">
              Meta x realizado por fabricante{vendedorNome ? ` — ${vendedorNome}` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* O período segue o filtro do topo da página — ver
                PlanoVendasSectionProps.dateFrom/dateTo. As setas mudam AQUELE
                filtro (ver irParaMes), não um período só desta seção; o rótulo
                do meio acompanha sozinho, porque ele é calculado a partir do
                dateFrom/dateTo que o Dashboard devolve. */}
            <div className="flex items-center gap-0.5">
              {onPeriodoChange && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Mês anterior"
                  onClick={() => irParaMes(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="h-8 flex items-center px-2.5 rounded-md border border-border/60 bg-muted/40 text-xs font-medium text-muted-foreground">
                {periodoLabel}
              </span>
              {onPeriodoChange && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Próximo mês"
                  onClick={() => irParaMes(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            {(temMetas ? podeEditarMeta : podeCriarMeta) && (
              <Button
                size="sm"
                variant={temMetas ? 'outline' : 'default'}
                className="h-8 text-xs gap-1.5"
                onClick={() => setEditOpen(true)}
              >
                {temMetas ? (
                  <><Pencil className="h-3.5 w-3.5" /> Editar metas</>
                ) : (
                  <><Plus className="h-3.5 w-3.5" /> Criar nova meta</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !progresso || progresso.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {podeCriarMeta
              ? 'Nenhuma meta definida para este período. Use "Criar nova meta" para começar.'
              : 'Nenhuma meta definida para este período.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total do período</p>
                  <p className="text-sm font-bold">
                    {formatCurrency(totalVendido)} <span className="text-muted-foreground font-medium">/ {formatCurrency(totalMeta)}</span>
                  </p>
                </div>
                <span className={`text-lg font-extrabold ${progressoCor(totalPct)}`}>{totalPct.toFixed(0)}%</span>
              </div>
              {totalMeta > 0 ? (
                <Progress
                  value={Math.min(totalPct, 100)}
                  className="h-2.5"
                  indicatorClassName="bg-[hsl(var(--success))]"
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">Meta não definida para o período.</p>
              )}
            </div>

            {/* Sem nenhuma das duas funcionalidades (fabricante/vendedor), não há nada
                pra revelar por trás do switch — some a linha inteira em vez de deixar
                um controle que abre uma seção vazia. */}
            {(podeVerMetasFabrica || mostrarPorVendedor) && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label htmlFor="mostrar-detalhado" className="text-xs font-medium text-muted-foreground cursor-pointer">
                  Mostrar vendas detalhado
                </Label>
                <div className="flex items-center gap-2">
                  {mostrarDetalhado && podeVerMetasFabrica && mostrarPorVendedor && (
                    <ToggleGroup
                      type="single"
                      value={visualizacao}
                      onValueChange={(v) => v && setVisualizacao(v as 'fabricante' | 'vendedor')}
                      className={TOGGLE_LIST_CLASS}
                    >
                      <ToggleGroupItem value="fabricante" className={`${TOGGLE_ITEM_CLASS} gap-1.5`}>
                        <Factory className="h-3.5 w-3.5" /> Fabricante
                      </ToggleGroupItem>
                      <ToggleGroupItem value="vendedor" className={`${TOGGLE_ITEM_CLASS} gap-1.5`}>
                        <Users className="h-3.5 w-3.5" /> Vendedor
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                  <Switch id="mostrar-detalhado" checked={mostrarDetalhado} onCheckedChange={setMostrarDetalhado} />
                </div>
              </div>
            )}

            {mostrarDetalhado && podeVerMetasFabrica && (!mostrarPorVendedor || visualizacao === 'fabricante') && (
              <div className="space-y-4">
                {progressoOrdenado.map(p => {
                  const temMeta = p.meta_valor > 0;
                  const marcaInativa = fabricanteAtivoPorId.get(p.fabricante_id) === false;
                  const pct = temMeta ? (p.vendido_valor / p.meta_valor) * 100 : 0;
                  // Só faz sentido distinguir "meta da equipe" de "minha fatia" numa
                  // visão de 1 pessoa só — o card do usuário comum (travado nele mesmo)
                  // ou um gestor filtrando "Responsável" pra um único vendedor. Sem
                  // isso, quem não é gestor não tinha como ver essa quebra em lugar
                  // nenhum (o diálogo "Editar metas" que já mostra é gestor-only).
                  const mostrarQuebraMeta = !!vendedorUnico && p.meta_equipe_valor > 0;
                  const temMetaIndividual = mostrarQuebraMeta && p.meta_individual_valor > 0;
                  const pctIndividual = temMetaIndividual ? (p.vendido_valor / p.meta_individual_valor) * 100 : 0;
                  return (
                    <div key={p.fabricante_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-card-foreground flex items-center gap-1.5">
                          {p.fabricante_nome}
                          {/* A meta e o vendido dela continuam contando no total — o selo
                              explica só por que ela caiu para o fim da lista. */}
                          {marcaInativa && (
                            <span className="rounded border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                              Inativa
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {formatCurrency(p.vendido_valor)}
                          {temMeta ? (
                            <>
                              {' '}/ {formatCurrency(p.meta_valor)}{' '}
                              <span className={`font-bold ${progressoCor(pct)}`}>({pct.toFixed(0)}%)</span>
                            </>
                          ) : (
                            <span className="italic"> — meta não definida</span>
                          )}
                        </span>
                      </div>
                      {mostrarQuebraMeta && (
                        <p className="text-[10px] text-muted-foreground">Meta geral da equipe: {formatCurrency(p.meta_equipe_valor)}</p>
                      )}
                      {temMeta && <Progress value={Math.min(pct, 100)} className="h-2.5" />}

                      {/* Barra própria pra "sua meta": comparar vendas pessoais contra o
                          alvo do TIME (acima) já é útil, mas não mostra o progresso dele
                          em relação à fatia que É dele dentro dessa meta geral. */}
                      {temMetaIndividual && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Sua meta</span>
                            <span className="text-muted-foreground">
                              {formatCurrency(p.vendido_valor)} / {formatCurrency(p.meta_individual_valor)}{' '}
                              <span className={`font-bold ${progressoCor(pctIndividual)}`}>({pctIndividual.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <Progress value={Math.min(pctIndividual, 100)} className="h-2" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {mostrarDetalhado && mostrarPorVendedor && visualizacao === 'vendedor' && porVendedor.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma meta individual definida para este período.
              </p>
            )}

            {mostrarDetalhado && mostrarPorVendedor && visualizacao === 'vendedor' && porVendedor.length > 0 && (
              <div className="space-y-3">
                {porVendedor.map(v => {
                  const temMeta = v.meta_valor > 0;
                  const pct = temMeta ? (v.vendido_valor / v.meta_valor) * 100 : 0;
                  return (
                    <div key={v.usuario_id} className="space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-card-foreground">{v.usuario_nome}</span>
                          <span className="text-muted-foreground">
                            {formatCurrency(v.vendido_valor)}
                            {temMeta ? (
                              <>
                                {' '}/ {formatCurrency(v.meta_valor)}{' '}
                                <span className={`font-bold ${progressoCor(pct)}`}>({pct.toFixed(0)}%)</span>
                              </>
                            ) : (
                              <span className="italic"> — meta não definida</span>
                            )}
                          </span>
                        </div>
                        {temMeta && <Progress value={Math.min(pct, 100)} className="h-2.5" />}
                      </div>

                      {/* Só as fábricas com meta INDIVIDUAL definida por este vendedor —
                          nunca uma fábrica onde ele só é coberto pela meta de equipe. */}
                      {v.fabricas.length > 0 && (
                        <div className="pl-3 border-l-2 border-border/50 space-y-2">
                          {v.fabricas.map(f => {
                            const fPct = f.meta_valor > 0 ? (f.vendido_valor / f.meta_valor) * 100 : 0;
                            return (
                              <div key={f.fabricante_id} className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    {f.fabricante_nome}
                                    {fabricanteAtivoPorId.get(f.fabricante_id) === false && (
                                      <span className="rounded border border-border px-1 text-[9px] font-medium uppercase tracking-wide">
                                        Inativa
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {formatCurrency(f.vendido_valor)} / {formatCurrency(f.meta_valor)}{' '}
                                    <span className={`font-semibold ${progressoCor(fPct)}`}>({fPct.toFixed(0)}%)</span>
                                  </span>
                                </div>
                                <Progress value={Math.min(fPct, 100)} className="h-1.5" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {(podeCriarMeta || podeEditarMeta) && (
        <EditarMetasDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          empresaId={empresaId}
          vendedores={vendedores}
          initialUsuarioId={vendedorUnico ?? currentUsuarioId}
          ano={anoInicial}
          mes={mesInicial}
          fabricantes={fabricantes}
        />
      )}
    </Card>
  );
}

interface EditarMetasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  vendedores: Vendedor[];
  // Pré-seleciona o vendedor com base no filtro "Responsável" do topo da
  // página quando ele apontar pra exatamente 1 pessoa (ou o próprio usuário,
  // se não-gestor) — o seletor abaixo permite trocar livremente depois, já
  // que "Editar metas" agora fica visível pra qualquer gestor independente
  // do filtro.
  initialUsuarioId?: string;
  ano: number;
  mes: number;
  fabricantes: Fabricante[];
}

function EditarMetasDialog({ open, onOpenChange, empresaId, vendedores, initialUsuarioId, ano, mes, fabricantes }: EditarMetasDialogProps) {
  // "Individual" edita a meta do vendedor selecionado; "Equipe" edita uma meta
  // que não é de ninguém em particular (usuario_id NULL), somada à visão
  // agregada da empresa no Dashboard sem entrar na conta de nenhum vendedor
  // específico. Equipe é o escopo principal — a meta individual é uma extensão
  // dela (ver metaEquipePorFabricante abaixo) — por isso é o padrão ao abrir o
  // dialog e vem primeiro (à esquerda) no toggle.
  const [escopo, setEscopo] = useState<'individual' | 'equipe'>('equipe');
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<string | undefined>(
    initialUsuarioId ?? vendedores[0]?.usuario_id,
  );
  const scopedUsuarioId = escopo === 'individual' ? selectedUsuarioId ?? null : null;
  const vendedorNome = vendedores.find(v => v.usuario_id === selectedUsuarioId)?.usuario_nome ?? '';

  // Período navegável dentro do próprio dialog — antes ficava preso ao mês/ano
  // do filtro "Período" do topo do Dashboard, obrigando trocar o filtro da
  // página inteira só pra cadastrar meta de um mês passado ou futuro.
  const [periodo, setPeriodo] = useState({ ano, mes });
  const { ano: selectedAno, mes: selectedMes } = periodo;
  const hoje = new Date();
  const ehMesAtual = selectedAno === hoje.getFullYear() && selectedMes === hoje.getMonth() + 1;

  const irParaMesAtual = () => setPeriodo({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });

  // Janela de anos do seletor — de 2000 até 2099 (lista longa demais pra um
  // <Select> simples ser usável, por isso o combobox com busca abaixo) e, se
  // o período selecionado (ex: vindo de um filtro antigo) cair fora dessa
  // janela, estica pra incluí-lo também.
  const anosDisponiveis = useMemo(() => {
    const min = Math.min(2000, selectedAno);
    const max = Math.max(2099, selectedAno);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [selectedAno]);

  // Reabrir o dialog sempre volta pro escopo equipe (o principal), reaplica a
  // pré-seleção de vendedor e reinicia a navegação no mês/ano do filtro do
  // topo — evita reabrir "preso" no modo Individual, num vendedor ou num mês
  // de uma edição anterior.
  useEffect(() => {
    if (open) {
      setEscopo('equipe');
      setSelectedUsuarioId(initialUsuarioId ?? vendedores[0]?.usuario_id);
      setPeriodo({ ano, mes });
      setPendingDeletionIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUsuarioId]);

  const { data: metas } = useMetasVendas(open ? scopedUsuarioId : undefined, selectedAno, selectedMes);
  const temMetas = !!metas && metas.length > 0;
  const anoAnterior = selectedMes === 1 ? selectedAno - 1 : selectedAno;
  const mesAnterior = selectedMes === 1 ? 12 : selectedMes - 1;
  const { data: metasMesAnterior } = useMetasVendas(open ? scopedUsuarioId : undefined, anoAnterior, mesAnterior);
  // Meta individual é uma extensão da meta de equipe: buscada sempre que o dialog está
  // aberto (independente do escopo atual — react-query dedupa com a busca de `metas`
  // quando o escopo já é "equipe", mesma queryKey) pra servir de referência no escopo
  // individual (ver `metaEquipePorFabricante`/placeholder abaixo).
  const { data: metasEquipe } = useMetasVendas(open ? null : undefined, selectedAno, selectedMes);
  const metaEquipePorFabricante = useMemo(
    () => new Map((metasEquipe ?? []).map(m => [m.fabricante_id, m.meta_valor])),
    [metasEquipe],
  );
  // Soma das metas individuais de TODOS os vendedores por fabricante (não só o que
  // está sendo editado agora) — usada pra calcular quanto da meta de equipe ainda não
  // foi distribuído pra ninguém (ver `restantePorFabricante` abaixo).
  const { data: metasIndividuaisAlocadas } = useMetasIndividuaisAlocadas(empresaId, selectedAno, selectedMes, open);
  const totalAlocadoPorFabricante = useMemo(() => {
    const mapa = new Map<string, number>();
    (metasIndividuaisAlocadas ?? []).forEach(m => {
      mapa.set(m.fabricante_id, (mapa.get(m.fabricante_id) ?? 0) + m.meta_valor);
    });
    return mapa;
  }, [metasIndividuaisAlocadas]);
  // Quantidade de fabricantes com meta individual já preenchida, por vendedor — só pro
  // badge "x/x" no seletor de vendedor abaixo (x = quantos ele já preencheu, sobre o
  // total de fabricantes com meta de equipe nesse período — é o universo do que dá
  // pra distribuir).
  const qtdMetasPorVendedor = useMemo(() => {
    const porVendedor = new Map<string, Set<string>>();
    (metasIndividuaisAlocadas ?? []).forEach(m => {
      if (!porVendedor.has(m.usuario_id)) porVendedor.set(m.usuario_id, new Set());
      porVendedor.get(m.usuario_id)!.add(m.fabricante_id);
    });
    return new Map(Array.from(porVendedor, ([usuarioId, fabricanteIds]) => [usuarioId, fabricanteIds.size]));
  }, [metasIndividuaisAlocadas]);
  const totalFabricantesComMetaGeral = metaEquipePorFabricante.size;
  const upsertMeta = useUpsertMetaVenda();
  const deleteMeta = useDeleteMetaVenda();

  // Ordem customizada dos fabricantes no Plano de Vendas (arrastar pra reordenar
  // abaixo). Guardada por empresa, não por vendedor/mês — reordenar aqui muda a
  // ordem em qualquer escopo/período.
  const { data: fabricantesOrdemMap } = useFabricantesOrdemPlanoVendas(empresaId);
  const reorderFabricantes = useReorderFabricantesPlanoVendas();
  // Lista completa de fabricantes da empresa na ordem atual — base pra mesclar o
  // resultado do drag (ver handleDragEnd): fabricantes fora da lista visível do
  // diálogo (sem meta neste escopo/período) mantêm a posição relativa.
  const fabricantesOrdenados = useMemo(() => {
    return [...fabricantes].sort((a, b) => {
      // 🔴 O status vem ANTES de `fo.ordem`. A ordem arrastada é uma escolha antiga: uma
      // marca que alguém colocou na primeira posição e só depois deixou de representar
      // continuaria abrindo a lista, e nem reordenar resolveria — a inativa voltaria ao
      // topo na próxima vez que a ordem fosse salva.
      const porStatus = compararStatusDeFabricante(a, b);
      if (porStatus !== 0) return porStatus;
      const oa = fabricantesOrdemMap?.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const ob = fabricantesOrdemMap?.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return oa !== ob ? oa - ob : compararNomeDeFabricante(a, b);
    });
  }, [fabricantes, fabricantesOrdemMap]);
  const posicaoFabricante = useMemo(
    () => new Map(fabricantesOrdenados.map((f, idx) => [f.id, idx])),
    [fabricantesOrdenados],
  );

  const [valores, setValores] = useState<Record<string, ValorMeta>>({});
  const [fabricantesCopiados, setFabricantesCopiados] = useState<Set<string>>(new Set());
  // Fábricas trazidas só como referência da meta de equipe (sem meta individual
  // ainda) que o usuário dispensou da lista sem preencher nada — não existe nada pra
  // apagar no banco, é só um "esconder" local (reaparece se reabrir o dialog).
  const [fabricantesEquipeOcultas, setFabricantesEquipeOcultas] = useState<Set<string>>(new Set());
  const [novoFabricanteId, setNovoFabricanteId] = useState<string>('');
  const [novoValor, setNovoValor] = useState<ValorMeta>(null);
  const [buscaFabrica, setBuscaFabrica] = useState('');
  // Linhas existentes marcadas pra excluir na Lixeira: some da lista na hora
  // (não faz sentido continuar mostrando o que a pessoa acabou de mandar
  // remover), mas o DELETE só roda no banco quando "Salvar alterações" for
  // clicado — reaparece inteira se a pessoa escolher "Descartar" depois.
  const [pendingDeletionIds, setPendingDeletionIds] = useState<Set<string>>(new Set());
  // Nada aqui persiste sozinho: todo campo é rascunho local até "Salvar
  // alterações" (ou até o aviso de fechar com pendências escolher salvar).
  const [salvandoTudo, setSalvandoTudo] = useState(false);
  const [pedindoConfirmacaoFechar, setPedindoConfirmacaoFechar] = useState(false);

  // Sincroniza `valores` com o banco (`metas`) e detecta troca de vendedor/escopo/
  // período numa ÚNICA effect — precisa ser atômico: separadas (sync num `useEffect`,
  // reset noutro), quando os dois disparam no mesmo ciclo (ex: reabrir o diálogo com
  // dados já em cache, ou voltar pra um vendedor já visto antes nesta sessão) a ordem
  // de declaração faz o reset rodar DEPOIS do sync e apagar o valor recém-carregado —
  // o campo aparecia vazio mesmo com a meta já salva no banco. `contextoRef` (não
  // state) resolve isso sem depender de ordem entre effects: dentro do MESMO
  // contexto, mescla em cima do que já está em `valores` (preserva cópia do mês
  // anterior ainda não salva); ao trocar de contexto, começa do zero a partir de
  // `metas`, sem herdar nada do vendedor/escopo anterior.
  const contextoValoresRef = useRef('');
  useEffect(() => {
    const contextoAtual = `${scopedUsuarioId ?? 'equipe'}|${selectedAno}|${selectedMes}`;
    const mudouContexto = contextoValoresRef.current !== contextoAtual;
    if (mudouContexto) {
      contextoValoresRef.current = contextoAtual;
      setFabricantesCopiados(new Set());
      setFabricantesEquipeOcultas(new Set());
      setBuscaFabrica('');
    }
    if (!metas) {
      if (mudouContexto) setValores({});
      return;
    }
    setValores(prev => {
      const base = mudouContexto ? {} : prev;
      const novo: Record<string, ValorMeta> = { ...base };
      metas.forEach(m => {
        novo[m.fabricante_id] = m.meta_valor;
      });
      return novo;
    });
  }, [metas, scopedUsuarioId, selectedAno, selectedMes]);

  const linhas = useMemo(() => {
    const existentes = (metas ?? [])
      .filter(m => !pendingDeletionIds.has(m.id))
      .map(m => ({ id: m.id as string | undefined, fabricanteId: m.fabricante_id, origem: 'existente' as const }));
    const idsExistentes = new Set(existentes.map(l => l.fabricanteId));
    const extras = Array.from(fabricantesCopiados)
      .filter(id => !idsExistentes.has(id))
      .map(fabricanteId => ({ id: undefined as string | undefined, fabricanteId, origem: 'copiado' as const }));
    const cobertas = new Set([...idsExistentes, ...extras.map(l => l.fabricanteId)]);
    // No escopo individual, toda fábrica com meta de equipe já entra na lista (mesmo
    // sem valor individual ainda) — é a extensão da meta de equipe que o gestor pode
    // preencher em cima, com o valor da equipe como referência (placeholder abaixo).
    const daEquipe = escopo === 'individual'
      ? Array.from(metaEquipePorFabricante.keys())
          .filter(fabricanteId => !cobertas.has(fabricanteId) && !fabricantesEquipeOcultas.has(fabricanteId))
          .map(fabricanteId => ({ id: undefined as string | undefined, fabricanteId, origem: 'equipe' as const }))
      : [];
    return [...existentes, ...extras, ...daEquipe].sort(
      (a, b) => (posicaoFabricante.get(a.fabricanteId) ?? 0) - (posicaoFabricante.get(b.fabricanteId) ?? 0),
    );
  }, [metas, pendingDeletionIds, fabricantesCopiados, escopo, metaEquipePorFabricante, fabricantesEquipeOcultas, posicaoFabricante]);

  // Só filtra o que é MOSTRADO/arrastável — `linhas` (sem filtro) continua sendo a base
  // de `fabricantesComMeta`/`fabricantesDisponiveis` abaixo, senão buscar escondia
  // fabricantes da lista e eles reapareceriam à toa no dropdown "Novo fabricante".
  const linhasFiltradas = useMemo(() => {
    const termo = buscaFabrica.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter(l => (fabricantes.find(f => f.id === l.fabricanteId)?.nome ?? '').toLowerCase().includes(termo));
  }, [linhas, buscaFabrica, fabricantes]);

  const fabricantesComMeta = useMemo(() => new Set(linhas.map(l => l.fabricanteId)), [linhas]);
  const fabricantesDisponiveis = useMemo(
    () => fabricantes.filter(f => !fabricantesComMeta.has(f.id)),
    [fabricantes, fabricantesComMeta],
  );

  // Última versão confirmada pelo banco — base de comparação pra saber o que
  // é rascunho ainda não salvo, tanto pro botão "Salvar alterações" quanto
  // pro aviso ao tentar fechar o dialog.
  const valoresSalvos = useMemo(() => {
    const mapa: Record<string, ValorMeta> = {};
    (metas ?? []).forEach(m => { mapa[m.fabricante_id] = m.meta_valor; });
    return mapa;
  }, [metas]);

  // Diferente do "vazio não conta" de antes (quando o blur salvava sozinho):
  // aqui nada persiste sem clicar em "Salvar", então limpar um campo que
  // TINHA valor salvo também é uma alteração pendente — só ignora quando o
  // campo já nasceu vazio (linha de referência da meta de equipe nunca
  // preenchida) e continua vazio.
  const isDirty = useMemo(() => {
    const camposAlterados = linhas.some(l => {
      const atual = valores[l.fabricanteId] ?? null;
      const salvo = valoresSalvos[l.fabricanteId] ?? null;
      return atual !== salvo;
    });
    const novoPendente = !!novoFabricanteId && novoValor !== null;
    return camposAlterados || novoPendente || pendingDeletionIds.size > 0;
  }, [linhas, valores, valoresSalvos, novoFabricanteId, novoValor, pendingDeletionIds]);

  // Validação compartilhada entre a linha existente e o mini-form "Novo
  // fabricante" — a mesma regra (meta individual não pode passar da meta de
  // equipe) vale nos dois casos.
  const validarValorMeta = (fabricanteId: string, valor: number): string | null => {
    if (valor < 0) return 'Informe um valor válido';
    if (escopo === 'individual') {
      const metaEquipe = metaEquipePorFabricante.get(fabricanteId);
      if (metaEquipe !== undefined && valor > metaEquipe) {
        return `A meta do usuário não pode ser maior que a meta geral (${formatCurrency(metaEquipe)}).`;
      }
    }
    return null;
  };

  // Grava no banco. Só é chamado de dentro de `salvarAlteracoesPendentes` —
  // nenhum campo persiste sozinho mais (nem onBlur, nem "Adicionar"), tudo
  // fica em `valores`/`fabricantesCopiados` até a pessoa clicar em salvar.
  const persistirMeta = async (fabricanteId: string, valor: number): Promise<boolean> => {
    const erro = validarValorMeta(fabricanteId, valor);
    if (erro) {
      toast.error(erro);
      return false;
    }
    try {
      await upsertMeta.mutateAsync({ empresaId, usuarioId: scopedUsuarioId, fabricanteId, ano: selectedAno, mes: selectedMes, metaValor: valor });
      return true;
    } catch {
      toast.error('Erro ao salvar meta');
      return false;
    }
  };

  const removerPendente = (fabricanteId: string) => {
    setFabricantesCopiados(prev => {
      const novo = new Set(prev);
      novo.delete(fabricanteId);
      return novo;
    });
    setValores(prev => {
      const { [fabricanteId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  // Dispensa uma linha trazida só como referência da meta de equipe (sem meta
  // individual salva) — não há nada pra apagar no banco, só sai da lista local.
  const ocultarReferenciaEquipe = (fabricanteId: string) => {
    setFabricantesEquipeOcultas(prev => new Set(prev).add(fabricanteId));
    setValores(prev => {
      const { [fabricanteId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  const copiarMetaMesAnterior = () => {
    if (!metasMesAnterior || metasMesAnterior.length === 0) {
      toast.info(`Nenhuma meta encontrada em ${MESES[mesAnterior - 1]}/${anoAnterior}.`);
      return;
    }
    setValores(prev => {
      const novo: Record<string, ValorMeta> = { ...prev };
      metasMesAnterior.forEach(m => {
        novo[m.fabricante_id] = m.meta_valor;
      });
      return novo;
    });
    setFabricantesCopiados(new Set(metasMesAnterior.map(m => m.fabricante_id)));
    toast.success('Valores preenchidos a partir do mês anterior — revise e salve.');
  };

  // Persiste o mini-form "Novo fabricante" — só usado dentro de
  // `salvarAlteracoesPendentes`, pro caso da pessoa deixar esses dois campos
  // preenchidos sem clicar em "Adicionar" e ir direto pra "Salvar alterações".
  const persistirNovoFabricante = async (): Promise<boolean> => {
    if (!novoFabricanteId) {
      toast.error('Selecione um fabricante');
      return false;
    }
    const valor = novoValor ?? 0;
    const erro = validarValorMeta(novoFabricanteId, valor);
    if (erro) {
      toast.error(erro);
      return false;
    }
    try {
      await upsertMeta.mutateAsync({ empresaId, usuarioId: scopedUsuarioId, fabricanteId: novoFabricanteId, ano: selectedAno, mes: selectedMes, metaValor: valor });
      setNovoFabricanteId('');
      setNovoValor(null);
      return true;
    } catch {
      toast.error('Erro ao adicionar meta');
      return false;
    }
  };

  // "Adicionar" NÃO grava no banco — só move o fabricante pro rascunho da
  // tabela principal (mesmo mecanismo de "Copiar meta do mês anterior"),
  // pra ficar sujeito ao mesmo "Salvar alterações"/aviso de fechar que as
  // demais linhas, em vez de persistir na hora.
  const adicionarMeta = () => {
    if (!novoFabricanteId) {
      toast.error('Selecione um fabricante');
      return;
    }
    const valor = novoValor ?? 0;
    const erro = validarValorMeta(novoFabricanteId, valor);
    if (erro) {
      toast.error(erro);
      return;
    }
    setFabricantesCopiados(prev => new Set(prev).add(novoFabricanteId));
    setValores(prev => ({ ...prev, [novoFabricanteId]: novoValor }));
    setNovoFabricanteId('');
    setNovoValor(null);
  };

  // Persiste TUDO que está só em rascunho local: linhas marcadas pra excluir
  // (Lixeira), campos com valor digitado diferente do salvo — inclusive
  // limpos de propósito, tratado como remover a meta — e o mini-form "Novo
  // fabricante" se ainda estiver preenchido. É o único lugar do dialog que
  // efetivamente grava no banco. Usado pelo botão "Salvar alterações" e pelo
  // "Salvar" do aviso de fechar com pendências. Para no primeiro erro (o
  // toast já foi disparado por `persistirMeta`/`persistirNovoFabricante`/
  // `deleteMeta`) pra não mascarar qual campo falhou.
  const salvarAlteracoesPendentes = async (): Promise<boolean> => {
    setSalvandoTudo(true);
    try {
      for (const id of pendingDeletionIds) {
        try {
          await deleteMeta.mutateAsync(id);
        } catch {
          toast.error('Erro ao remover meta');
          return false;
        }
      }

      for (const l of linhas) {
        const atual = valores[l.fabricanteId] ?? null;
        const salvo = valoresSalvos[l.fabricanteId] ?? null;
        if (atual === salvo) continue;
        if (atual === null) {
          // Campo existente foi limpo de propósito — equivale a remover a meta.
          if (l.id) {
            try {
              await deleteMeta.mutateAsync(l.id);
            } catch {
              toast.error('Erro ao remover meta');
              return false;
            }
          }
          continue;
        }
        const ok = await persistirMeta(l.fabricanteId, atual);
        if (!ok) return false;
      }

      if (novoFabricanteId && novoValor !== null) {
        const ok = await persistirNovoFabricante();
        if (!ok) return false;
      }

      setPendingDeletionIds(new Set());
      toast.success('Metas salvas.');
      return true;
    } finally {
      setSalvandoTudo(false);
    }
  };

  // Volta `valores` pro que já está no banco, limpa o mini-form e desfaz as
  // marcações de exclusão pendente — usado só pela opção "Descartar
  // alterações" do aviso de fechar. Também esvazia `fabricantesCopiados`: sem
  // isto, uma linha trazida por "Copiar meta do mês anterior"/"Adicionar" e
  // nunca salva continuaria aparecendo na lista, só que vazia, em vez de
  // sumir junto com o valor descartado.
  const descartarAlteracoesPendentes = () => {
    setValores(() => {
      const novo: Record<string, ValorMeta> = {};
      (metas ?? []).forEach(m => { novo[m.fabricante_id] = m.meta_valor; });
      return novo;
    });
    setFabricantesCopiados(new Set());
    setPendingDeletionIds(new Set());
    setNovoFabricanteId('');
    setNovoValor(null);
  };

  const requestClose = (proximoEstado: boolean) => {
    if (!proximoEstado && isDirty && !salvandoTudo) {
      setPedindoConfirmacaoFechar(true);
      return;
    }
    onOpenChange(proximoEstado);
  };

  // Reordena arrastando: reordena a lista visível localmente e mescla de volta
  // na lista completa de fabricantes da empresa, preservando a posição de quem
  // não aparece neste escopo/período (ver fabricantesOrdenados acima).
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const visibleIds = linhasFiltradas.map(l => l.fabricanteId);
    const reorderedVisible = [...visibleIds];
    const [moved] = reorderedVisible.splice(source.index, 1);
    reorderedVisible.splice(destination.index, 0, moved);

    const fullOrder = fabricantesOrdenados.map(f => f.id);
    const visibleSet = new Set(visibleIds);
    const slots = fullOrder.reduce<number[]>((acc, id, idx) => {
      if (visibleSet.has(id)) acc.push(idx);
      return acc;
    }, []);
    const novoFullOrder = [...fullOrder];
    slots.forEach((slotIdx, i) => { novoFullOrder[slotIdx] = reorderedVisible[i]; });

    reorderFabricantes.mutate(
      { empresaId, orderedFabricanteIds: novoFullOrder },
      { onError: () => toast.error('Erro ao reordenar fabricantes') },
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={requestClose}>
      {/* Título e botões ficam parados; TODO o miolo (escopo, período, vendedor,
          "novo fabricante", busca e a lista) rola junto dentro do CorpoDialogo.
          Antes o diálogo tinha ~467px de moldura fixa MAIS uma lista de 50vh, o
          que exigia uma janela de ~930px de altura — com a escala do Windows em
          125% sobram ~760px e o botão "Salvar alterações" ficava fora da tela,
          sem barra de rolagem para alcançá-lo. */}
      <ConteudoDialogo className="sm:max-w-2xl">
        <CabecalhoDialogo>
          <DialogTitle>
            {temMetas ? 'Editar' : 'Criar'} metas — {escopo === 'individual' ? vendedorNome : 'Toda a equipe'}
          </DialogTitle>
          <DialogDescription>Meta de vendas por fabricante</DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo>
        <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={escopo}
            onValueChange={(v) => v && setEscopo(v as 'individual' | 'equipe')}
            className={TOGGLE_LIST_CLASS}
          >
            <ToggleGroupItem value="equipe" className={`${TOGGLE_ITEM_CLASS} gap-1.5`}>
              <Users className="h-3.5 w-3.5" /> Toda a equipe
            </ToggleGroupItem>
            <ToggleGroupItem value="individual" className={`${TOGGLE_ITEM_CLASS} gap-1.5`}>
              <User className="h-3.5 w-3.5" /> Individual
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-2">
            <Select
              value={String(selectedMes)}
              onValueChange={(v) => setPeriodo(prev => ({ ...prev, mes: Number(v) }))}
            >
              <SelectTrigger className="h-8 w-fit min-w-[120px] rounded-lg border border-border/60 bg-muted/30 px-2.5 text-sm font-semibold capitalize focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {MESES.map((nome, i) => (
                  <SelectItem key={nome} value={String(i + 1)} className="capitalize">{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchableSelect
              className="h-8 w-[92px] shrink-0 rounded-lg border border-border/60 bg-muted/30 px-2.5 text-sm font-semibold"
              contentClassName="w-[120px]"
              options={anosDisponiveis.map((a) => ({ value: String(a), label: String(a) })).reverse()}
              value={String(selectedAno)}
              onValueChange={(v) => setPeriodo(prev => ({ ...prev, ano: Number(v) }))}
              placeholder="Ano"
              emptyMessage="Nenhum ano encontrado."
              scrollToLabel={String(hoje.getFullYear())}
            />
            {!ehMesAtual && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-[11px] text-primary hover:text-primary"
                onClick={irParaMesAtual}
              >
                Hoje
              </Button>
            )}
          </div>
        </div>

        {escopo === 'individual' && (
          <SearchableSelect
            className="h-9 text-sm"
            options={vendedores.map(v => ({
              value: v.usuario_id,
              label: v.usuario_nome,
              badge: totalFabricantesComMetaGeral > 0
                ? `${qtdMetasPorVendedor.get(v.usuario_id) ?? 0}/${totalFabricantesComMetaGeral}`
                : undefined,
            }))}
            value={selectedUsuarioId ?? ''}
            onValueChange={setSelectedUsuarioId}
            placeholder="Selecione o vendedor"
            searchPlaceholder="busque por um usuário..."
            emptyMessage="Nenhum vendedor encontrado."
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {metasMesAnterior && metasMesAnterior.length > 0
              ? `${MESES[mesAnterior - 1]}/${anoAnterior}: ${metasMesAnterior.length} meta(s) definida(s)`
              : `Sem metas em ${MESES[mesAnterior - 1]}/${anoAnterior}`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            disabled={!metasMesAnterior || metasMesAnterior.length === 0}
            onClick={copiarMetaMesAnterior}
          >
            <Copy className="h-3.5 w-3.5" /> Copiar meta do mês anterior
          </Button>
        </div>

        {fabricantesDisponiveis.length > 0 && (
          <div className="flex items-center gap-2">
            <SearchableSelect
              className="h-9 flex-1 text-sm"
              // A lista já chega do Dashboard com as inativas por último (a consulta
              // ordena por `ativo desc, nome`), e `filter` não reordena. O selo é o que
              // avisa que aquela marca não é mais representada — dá para definir meta
              // para ela, mas de olho aberto.
              options={fabricantesDisponiveis.map(f => ({
                value: f.id,
                label: f.nome,
                badge: fabricanteEstaAtivo(f) ? undefined : 'Inativa',
              }))}
              value={novoFabricanteId}
              onValueChange={setNovoFabricanteId}
              placeholder="Novo fabricante"
              emptyMessage="Nenhum fabricante encontrado."
            />
            <CampoMoeda
              comPrefixo={false}
              placeholder="Meta R$"
              className="h-9 w-24 sm:w-32 text-sm"
              value={novoValor}
              onChange={setNovoValor}
            />
            <Button size="sm" className="h-9" onClick={adicionarMeta}>Adicionar</Button>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={buscaFabrica}
              onChange={e => setBuscaFabrica(e.target.value)}
              placeholder="Buscar fábrica já adicionada..."
              className="h-9 pl-8 text-sm"
            />
          </div>
        )}
        </div>

        {/* Cabeçalho das colunas: fica DENTRO do mesmo container que rola (o
            CorpoDialogo), por isso tem exatamente a mesma largura útil das
            linhas. Antes ele ficava fora, e a barra de rolagem da lista comia
            ~15px só das linhas — os títulos não paravam em cima das colunas.
            `sticky` mantém os títulos à vista enquanto se rola a lista. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-background pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className="flex-1">Fábrica</span>
          {escopo === 'individual' ? (
            <>
              <ColunaHeaderInfo
                className="w-20 sm:w-28"
                label="Meta geral"
                info="Alvo definido para toda a equipe nesta fábrica."
              />
              <ColunaHeaderInfo
                className="w-20 sm:w-28"
                label="Restante da meta geral"
                info="Quanto da meta geral ainda não foi distribuído a nenhum vendedor."
              />
              <ColunaHeaderInfo
                className="w-24 sm:w-32"
                label="Meta individual"
                info="A fatia deste vendedor dentro da meta geral."
              />
            </>
          ) : (
            <span className="flex w-24 sm:w-32 shrink-0 items-center justify-center text-center">Meta</span>
          )}
          <span className="w-9 shrink-0" />
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="plano-vendas-fabricantes">
            {(provided) => (
              // Sem rolagem própria: quem rola é o CorpoDialogo. Duas áreas de
              // rolagem aninhadas era o que desalinhava o cabeçalho e ainda
              // reservava metade da janela para uma lista que podia estar vazia.
              <div
                className="space-y-3"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {linhasFiltradas.length === 0 && buscaFabrica.trim() && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma fábrica encontrada para "{buscaFabrica}".</p>
                )}
                {linhasFiltradas.map(({ id, fabricanteId, origem }, idx) => {
                  const fabricante = fabricantes.find(f => f.id === fabricanteId);
                  // No escopo individual, mostra a meta de equipe como referência fixa ao
                  // lado do campo — pro gestor ver, ao preencher a meta de UM vendedor,
                  // quanto disso já é o alvo do time inteiro. Fica visível mesmo depois de
                  // salvo (não só enquanto `origem === 'equipe'`, ainda sem valor individual),
                  // senão a referência some assim que a primeira meta individual é gravada.
                  const metaEquipe = escopo === 'individual' ? metaEquipePorFabricante.get(fabricanteId) : undefined;
                  // Quanto da meta de equipe ainda não foi atribuído a nenhum vendedor — reage
                  // ao que está sendo digitado AGORA neste campo (não só ao último valor salvo):
                  // tira a contribuição salva deste vendedor do total (totalAlocadoPorFabricante
                  // soma todo mundo, incluindo o valor salvo dele) e recoloca a versão ao vivo do
                  // que está no input, mesmo antes de sair do campo (onBlur).
                  const restante = metaEquipe !== undefined
                    ? metaEquipe
                      - (totalAlocadoPorFabricante.get(fabricanteId) ?? 0)
                      + (metas?.find(m => m.fabricante_id === fabricanteId)?.meta_valor ?? 0)
                      - (valores[fabricanteId] ?? 0)
                    : undefined;
                  // As duas colunas de referência só existem no escopo individual.
                  // Quando uma fábrica entra na lista sem meta de equipe (copiada do
                  // mês anterior, por exemplo), entra um espaçador do mesmo tamanho:
                  // sem ele a linha inteira pulava ~240px para a esquerda e o campo
                  // de digitação saía de baixo do próprio título de coluna.
                  const mostrarColunasEquipe = escopo === 'individual';
                  const handleRemover = () => {
                    // Linha existente: só marca pra excluir (some da lista agora,
                    // mas o DELETE no banco só roda em "Salvar alterações").
                    if (id) setPendingDeletionIds(prev => new Set(prev).add(id));
                    else if (origem === 'equipe') ocultarReferenciaEquipe(fabricanteId);
                    else removerPendente(fabricanteId);
                  };
                  return (
                    <Draggable key={fabricanteId} draggableId={fabricanteId} index={idx}>
                      {(dragProvided, dragSnapshot) => {
                        const row = (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`flex items-center gap-2 ${dragSnapshot.isDragging ? 'bg-background rounded-md shadow-lg' : ''}`}
                          >
                            <div
                              {...dragProvided.dragHandleProps}
                              className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                              aria-label="Arrastar para reordenar"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <span className="flex-1 flex items-center gap-1.5 text-sm truncate">
                              <span className="truncate">{fabricante?.nome ?? '—'}</span>
                              {/* Sem o selo, a marca desativada só apareceria no fim de uma
                                  lista que a pessoa acabou de arrastar à mão — e ela
                                  concluiria que a própria ordem dela foi desfeita. */}
                              {fabricante && !fabricanteEstaAtivo(fabricante) && (
                                <span className="shrink-0 rounded border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Inativa
                                </span>
                              )}
                            </span>
                            {/* Encolhem em tela estreita em vez de sumirem: escondidas,
                                o gestor digitava no escuro e ainda levava a recusa
                                "não pode ser maior que a meta geral (R$ X)" citando
                                justamente o número que não estava na tela. */}
                            {mostrarColunasEquipe && (metaEquipe !== undefined ? (
                              <span
                                className="flex h-9 w-20 sm:w-28 shrink-0 flex-col items-center justify-center rounded-md border border-border/60 bg-muted/30 px-1.5 text-center leading-tight"
                                title={`Meta de equipe para este fabricante: ${formatCurrency(metaEquipe)}`}
                              >
                                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Meta geral</span>
                                <span className="text-[11px] font-semibold tabular-nums truncate w-full">{formatCurrency(metaEquipe)}</span>
                              </span>
                            ) : (
                              <span className="w-20 sm:w-28 shrink-0" />
                            ))}
                            {mostrarColunasEquipe && (restante !== undefined ? (
                              <span
                                className={`flex h-9 w-20 sm:w-28 shrink-0 flex-col items-center justify-center rounded-md border px-1.5 text-center leading-tight ${
                                  restante < 0
                                    ? 'border-destructive/40 bg-destructive/10'
                                    : 'border-border/60 bg-muted/30'
                                }`}
                                title={`Ainda não atribuído a nenhum vendedor: ${formatCurrency(restante)}`}
                              >
                                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Restante</span>
                                <span className={`text-[11px] font-semibold tabular-nums truncate w-full ${restante < 0 ? 'text-destructive' : ''}`}>
                                  {formatCurrency(restante)}
                                </span>
                              </span>
                            ) : (
                              <span className="w-20 sm:w-28 shrink-0" />
                            ))}
                            <CampoMoeda
                              comPrefixo={false}
                              className="h-9 w-24 sm:w-32 text-sm border-border/60 focus-visible:ring-1 focus-visible:ring-offset-0"
                              value={valores[fabricanteId] ?? null}
                              onChange={valor => setValores(prev => ({ ...prev, [fabricanteId]: valor }))}
                              placeholder={metaEquipe !== undefined ? 'Meta do usuário' : 'Meta R$'}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-destructive/70 hover:text-destructive"
                              onClick={handleRemover}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                        return dragSnapshot.isDragging ? createPortal(row, document.body) : row;
                      }}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={salvandoTudo}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={async () => { if (await salvarAlteracoesPendentes()) onOpenChange(false); }}
            disabled={!isDirty || salvandoTudo}
          >
            {salvandoTudo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>

    {/* Nada neste diálogo persiste sozinho: tudo é rascunho local até "Salvar
        alterações". Este aviso é o que impede a pessoa de fechar a tela e perder
        o que digitou (inclusive o mini-form "Novo fabricante" preenchido). */}
    <AlertDialog open={pedindoConfirmacaoFechar} onOpenChange={setPedindoConfirmacaoFechar}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Há valores digitados que ainda não foram salvos. Deseja salvá-los antes de sair, ou descartar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Três botões não cabem lado a lado na largura do aviso (512px): sem o
            flex-wrap eles se espremem e "Descartar" encosta em "Salvar" — clique
            errado apaga o que a pessoa acabou de digitar. */}
        <AlertDialogFooter className="flex-wrap gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={salvandoTudo}>Continuar editando</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            disabled={salvandoTudo}
            onClick={() => {
              descartarAlteracoesPendentes();
              setPedindoConfirmacaoFechar(false);
              onOpenChange(false);
            }}
          >
            Descartar
          </Button>
          <Button
            type="button"
            disabled={salvandoTudo}
            onClick={async () => {
              const ok = await salvarAlteracoesPendentes();
              if (ok) {
                setPedindoConfirmacaoFechar(false);
                onOpenChange(false);
              }
            }}
          >
            {salvandoTudo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

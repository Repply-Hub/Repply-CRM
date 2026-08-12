import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TOGGLE_LIST_CLASS, TOGGLE_ITEM_CLASS } from '@/lib/toggle-group-styles';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Goal, Pencil, Plus, Trash2, Loader2, Copy, Users, User, GripVertical, Info } from 'lucide-react';
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

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MOSTRAR_DETALHADO_KEY = 'md-plano-vendas-detalhado';

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Formata em tempo real como o usuário digita (separador de milhar pt-BR),
// mantendo no máximo uma vírgula decimal. Não bloqueia digitação: cada
// keystroke é uma reformatação síncrona e barata, sem debounce.
function formatMetaInputDisplay(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const [intPart, ...decParts] = cleaned.split(',');
  const intDigits = (intPart ?? '').replace(/^0+(?=\d)/, '');
  const formattedInt = intDigits ? Number(intDigits).toLocaleString('pt-BR') : '';
  if (decParts.length > 0) {
    return `${formattedInt || '0'},${decParts.join('').slice(0, 2)}`;
  }
  return formattedInt;
}

// Extrai o número puro (sem máscara) do texto exibido, para persistir no banco.
function parseMetaInputValue(raw: string): number {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const [intPart, ...decParts] = cleaned.split(',');
  const intDigits = (intPart ?? '').replace(/^0+(?=\d)/, '') || '0';
  const decDigits = decParts.length > 0 ? decParts.join('').slice(0, 2) : '';
  const value = Number(decDigits ? `${intDigits}.${decDigits}` : intDigits);
  return Number.isNaN(value) ? 0 : value;
}

// Converte um número vindo do banco para o texto formatado do input.
function numberToMetaDisplay(n: number): string {
  if (!n) return '';
  const [intPart, decPart] = n.toString().split('.');
  const formattedInt = Number(intPart).toLocaleString('pt-BR');
  return decPart ? `${formattedInt},${decPart.slice(0, 2)}` : formattedInt;
}

interface MetaValorInputProps {
  value: string;
  onChangeValue: (display: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

function MetaValorInput({ value, onChangeValue, onBlur, placeholder, className }: MetaValorInputProps) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={value}
      onChange={e => onChangeValue(formatMetaInputDisplay(e.target.value))}
      onBlur={onBlur}
    />
  );
}

// Cabeçalho de coluna com um "i" que explica o que ela significa em tooltip — as
// colunas de meta geral/restante/individual não são autoexplicativas na primeira
// olhada, diferente do resto da UI.
function ColunaHeaderInfo({ label, info, className }: { label: string; info: string; className?: string }) {
  return (
    <span className={`hidden sm:flex shrink-0 items-center justify-center gap-1 text-center ${className ?? ''}`}>
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
}

interface PlanoVendasSectionProps {
  empresaId: string;
  isGestor: boolean;
  currentUsuarioId?: string;
  // Segue o filtro "Responsável" do topo da página (array vazio = "Todos", vê o
  // progresso agregado/por vendedor da empresa) — antes esta seção tinha um
  // seletor de vendedor próprio, solto do resto dos cards. Como o filtro agora
  // aceita mais de uma seleção, "editar metas" só faz sentido quando exatamente
  // UM vendedor está selecionado (ver `vendedorUnico` no corpo do componente) —
  // com 0 ou 2+, a seção mostra a visão agregada/por vendedor, sem alvo único
  // pra editar.
  vendedorIds: string[];
  // Segue o filtro "Fabricante" do topo da página (array vazio = "Todos").
  fabricanteIds: string[];
  vendedores: Vendedor[];
  fabricantes: Fabricante[];
  // Mês/ano derivados do filtro de Período do topo da página (dateRange.from) —
  // antes esta seção tinha seletores de Mês/Ano próprios, soltos do resto dos
  // cards, então dava pra mostrar aqui um mês bem diferente do que os outros
  // cards estavam exibindo.
  ano: number;
  mes: number;
}

function progressoCor(pct: number) {
  if (pct >= 100) return 'text-[hsl(var(--success))]';
  if (pct >= 60) return 'text-primary';
  return 'text-muted-foreground';
}

export function PlanoVendasSection({ empresaId, isGestor, currentUsuarioId, vendedorIds, fabricanteIds, vendedores, fabricantes, ano, mes }: PlanoVendasSectionProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [mostrarDetalhado, setMostrarDetalhado] = useState(
    () => localStorage.getItem(MOSTRAR_DETALHADO_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(MOSTRAR_DETALHADO_KEY, mostrarDetalhado ? '1' : '0');
  }, [mostrarDetalhado]);

  // "Editar metas" e o resumo "Meta x realizado — Fulano" só existem quando dá
  // pra apontar pra UMA pessoa específica — com 0 (Todos) ou 2+ selecionados,
  // vira visão agregada/por vendedor (mostrarPorVendedor abaixo).
  const vendedorUnico = vendedorIds.length === 1 ? vendedorIds[0] : undefined;

  const { data: progresso, isLoading } = usePlanoVendasProgresso(
    ano,
    mes,
    vendedorIds.length > 0 ? vendedorIds : undefined,
    fabricanteIds.length > 0 ? fabricanteIds : undefined,
    // Só na visão de 1 vendedor: fábrica sem meta individual some da lista/total
    // (mesma regra da seção "Por vendedor" abaixo). Na visão "Todos" (agregada)
    // continua somando as metas de equipe normalmente.
    !!vendedorUnico,
  );

  const temMetas = !!progresso && progresso.length > 0;

  const totalMeta = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.meta_valor, 0), [progresso]);
  const totalVendido = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.vendido_valor, 0), [progresso]);
  const totalPct = totalMeta > 0 ? (totalVendido / totalMeta) * 100 : 0;

  const vendedorNome = vendedores.find(v => v.usuario_id === vendedorUnico)?.usuario_nome
    ?? (vendedorUnico === currentUsuarioId ? 'Você' : '');

  // Ordem customizada dos fabricantes (definida em "Editar metas") — a RPC
  // principal já ordena por ela, mas o agrupamento "Por vendedor" abaixo é
  // montado no cliente, então precisa reaplicar aqui.
  const { data: fabricantesOrdemMap } = useFabricantesOrdemPlanoVendas(empresaId);

  // Detalhamento por vendedor — busca/mostra sempre que não há exatamente um
  // vendedor selecionado (0 = Todos, 2+ = um subconjunto) pro gestor: antes só
  // existia a soma da empresa aqui, e tinha que trocar o filtro "Responsável"
  // um vendedor de cada vez pra inspecionar o plano de cada um.
  const mostrarPorVendedor = isGestor && vendedorIds.length !== 1;
  const { data: progressoPorVendedorRaw } = usePlanoVendasProgressoPorVendedor(
    ano,
    mes,
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
      const oa = fabricantesOrdemMap?.get(a.fabricante_id) ?? Number.MAX_SAFE_INTEGER;
      const ob = fabricantesOrdemMap?.get(b.fabricante_id) ?? Number.MAX_SAFE_INTEGER;
      return oa !== ob ? oa - ob : b.meta_valor - a.meta_valor;
    }));
    return resultado.sort((a, b) => b.vendido_valor - a.vendido_valor);
  }, [progressoPorVendedorRaw, fabricantesOrdemMap]);

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
            {/* Mês/ano seguem o filtro de Período do topo da página — ver
                PlanoVendasSectionProps.ano/mes. */}
            <span className="h-8 flex items-center px-2.5 rounded-md border border-border/60 bg-muted/40 text-xs font-medium text-muted-foreground">
              {MESES[mes - 1]} de {ano}
            </span>
            {isGestor && (
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
            {isGestor
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

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="mostrar-detalhado" className="text-xs font-medium text-muted-foreground cursor-pointer">
                Mostrar vendas detalhado
              </Label>
              <Switch id="mostrar-detalhado" checked={mostrarDetalhado} onCheckedChange={setMostrarDetalhado} />
            </div>

            {mostrarDetalhado && (
              <div className="space-y-4">
                {progresso.map(p => {
                  const temMeta = p.meta_valor > 0;
                  const pct = temMeta ? (p.vendido_valor / p.meta_valor) * 100 : 0;
                  return (
                    <div key={p.fabricante_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-card-foreground">{p.fabricante_nome}</span>
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
                      {temMeta && <Progress value={Math.min(pct, 100)} className="h-2.5" />}
                    </div>
                  );
                })}
              </div>
            )}

            {mostrarDetalhado && mostrarPorVendedor && porVendedor.length > 0 && (
              <div className="space-y-3 pt-1 border-t border-border/60">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-3">
                  Por vendedor
                </p>
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
                                  <span className="text-muted-foreground">{f.fabricante_nome}</span>
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

      {isGestor && (
        <EditarMetasDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          empresaId={empresaId}
          vendedores={vendedores}
          initialUsuarioId={vendedorUnico ?? currentUsuarioId}
          ano={ano}
          mes={mes}
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
      const oa = fabricantesOrdemMap?.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const ob = fabricantesOrdemMap?.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return oa !== ob ? oa - ob : a.nome.localeCompare(b.nome);
    });
  }, [fabricantes, fabricantesOrdemMap]);
  const posicaoFabricante = useMemo(
    () => new Map(fabricantesOrdenados.map((f, idx) => [f.id, idx])),
    [fabricantesOrdenados],
  );

  const [valores, setValores] = useState<Record<string, string>>({});
  const [fabricantesCopiados, setFabricantesCopiados] = useState<Set<string>>(new Set());
  // Fábricas trazidas só como referência da meta de equipe (sem meta individual
  // ainda) que o usuário dispensou da lista sem preencher nada — não existe nada pra
  // apagar no banco, é só um "esconder" local (reaparece se reabrir o dialog).
  const [fabricantesEquipeOcultas, setFabricantesEquipeOcultas] = useState<Set<string>>(new Set());
  const [novoFabricanteId, setNovoFabricanteId] = useState<string>('');
  const [novoValor, setNovoValor] = useState('');

  // Mescla os valores confirmados no banco no estado local, sem apagar
  // fabricantes copiados do mês anterior que ainda não foram salvos.
  useEffect(() => {
    if (!metas) return;
    setValores(prev => {
      const novo = { ...prev };
      metas.forEach(m => {
        novo[m.fabricante_id] = numberToMetaDisplay(m.meta_valor);
      });
      return novo;
    });
  }, [metas]);

  // Troca de vendedor/escopo/período: descarta valores e cópia pendente do mês
  // anterior — senão um valor da meta individual ficava "vazando" visualmente
  // ao trocar pra Equipe (ou vice-versa) até a query nova responder.
  useEffect(() => {
    setValores({});
    setFabricantesCopiados(new Set());
    setFabricantesEquipeOcultas(new Set());
  }, [scopedUsuarioId, selectedAno, selectedMes]);

  const linhas = useMemo(() => {
    const existentes = (metas ?? []).map(m => ({ id: m.id as string | undefined, fabricanteId: m.fabricante_id, origem: 'existente' as const }));
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
  }, [metas, fabricantesCopiados, escopo, metaEquipePorFabricante, fabricantesEquipeOcultas, posicaoFabricante]);

  const fabricantesComMeta = useMemo(() => new Set(linhas.map(l => l.fabricanteId)), [linhas]);
  const fabricantesDisponiveis = useMemo(
    () => fabricantes.filter(f => !fabricantesComMeta.has(f.id)),
    [fabricantes, fabricantesComMeta],
  );

  const salvarMeta = (fabricanteId: string) => {
    const display = valores[fabricanteId] ?? '';
    // Linha vazia — nada digitado. Cobre principalmente as linhas trazidas só como
    // referência da meta de equipe (ver `daEquipe` em `linhas`): passar o mouse/focar
    // e sair sem digitar nada não pode criar uma meta individual "zero" do nada.
    if (!display.trim()) return;
    const valor = parseMetaInputValue(display);
    if (valor < 0) {
      toast.error('Informe um valor válido');
      return;
    }
    // Meta individual não pode ultrapassar a meta de equipe daquela fábrica — ela é
    // uma fatia da meta geral, não um valor à parte.
    if (escopo === 'individual') {
      const metaEquipe = metaEquipePorFabricante.get(fabricanteId);
      if (metaEquipe !== undefined && valor > metaEquipe) {
        toast.error(`A meta do usuário não pode ser maior que a meta geral (${formatCurrency(metaEquipe)}).`);
        return;
      }
    }
    upsertMeta.mutate(
      { empresaId, usuarioId: scopedUsuarioId, fabricanteId, ano: selectedAno, mes: selectedMes, metaValor: valor },
      { onError: () => toast.error('Erro ao salvar meta') },
    );
  };

  const removerMeta = (id: string) => {
    deleteMeta.mutate(id, { onError: () => toast.error('Erro ao remover meta') });
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
      const novo = { ...prev };
      metasMesAnterior.forEach(m => {
        novo[m.fabricante_id] = numberToMetaDisplay(m.meta_valor);
      });
      return novo;
    });
    setFabricantesCopiados(new Set(metasMesAnterior.map(m => m.fabricante_id)));
    toast.success('Valores preenchidos a partir do mês anterior — revise e salve.');
  };

  const adicionarMeta = () => {
    const valor = parseMetaInputValue(novoValor);
    if (!novoFabricanteId) {
      toast.error('Selecione um fabricante');
      return;
    }
    if (valor < 0) {
      toast.error('Informe um valor válido');
      return;
    }
    if (escopo === 'individual') {
      const metaEquipe = metaEquipePorFabricante.get(novoFabricanteId);
      if (metaEquipe !== undefined && valor > metaEquipe) {
        toast.error(`A meta do usuário não pode ser maior que a meta geral (${formatCurrency(metaEquipe)}).`);
        return;
      }
    }
    upsertMeta.mutate(
      { empresaId, usuarioId: scopedUsuarioId, fabricanteId: novoFabricanteId, ano: selectedAno, mes: selectedMes, metaValor: valor },
      {
        onSuccess: () => {
          setNovoFabricanteId('');
          setNovoValor('');
        },
        onError: () => toast.error('Erro ao adicionar meta'),
      },
    );
  };

  // Reordena arrastando: reordena a lista visível localmente e mescla de volta
  // na lista completa de fabricantes da empresa, preservando a posição de quem
  // não aparece neste escopo/período (ver fabricantesOrdenados acima).
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const visibleIds = linhas.map(l => l.fabricanteId);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {temMetas ? 'Editar' : 'Criar'} metas — {escopo === 'individual' ? vendedorNome : 'Toda a equipe'}
          </DialogTitle>
          <DialogDescription>Meta de vendas por fabricante</DialogDescription>
        </DialogHeader>

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

        <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className="flex-1">Fábrica</span>
          {escopo === 'individual' ? (
            <>
              <ColunaHeaderInfo
                className="w-28"
                label="Meta geral"
                info="Alvo definido para toda a equipe nesta fábrica."
              />
              <ColunaHeaderInfo
                className="w-28"
                label="Restante da meta geral"
                info="Quanto da meta geral ainda não foi distribuído a nenhum vendedor."
              />
              <ColunaHeaderInfo
                className="w-32"
                label="Meta individual"
                info="A fatia deste vendedor dentro da meta geral."
              />
            </>
          ) : (
            <span className="hidden sm:flex w-32 shrink-0 items-center justify-center text-center">Meta</span>
          )}
          <span className="w-9 shrink-0" />
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="plano-vendas-fabricantes">
            {(provided) => (
              <div
                className="space-y-3 max-h-[50vh] overflow-y-auto pr-1"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {linhas.map(({ id, fabricanteId, origem }, idx) => {
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
                      - parseMetaInputValue(valores[fabricanteId] ?? '')
                    : undefined;
                  const handleRemover = () => {
                    if (id) removerMeta(id);
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
                            <span className="flex-1 text-sm truncate">{fabricante?.nome ?? '—'}</span>
                            {metaEquipe !== undefined && (
                              <span
                                className="hidden sm:flex h-9 w-28 shrink-0 flex-col items-center justify-center rounded-md border border-border/60 bg-muted/30 px-1.5 text-center leading-tight"
                                title={`Meta de equipe para este fabricante: ${formatCurrency(metaEquipe)}`}
                              >
                                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Meta geral</span>
                                <span className="text-xs font-semibold truncate w-full">{formatCurrency(metaEquipe)}</span>
                              </span>
                            )}
                            {restante !== undefined && (
                              <span
                                className={`hidden sm:flex h-9 w-28 shrink-0 flex-col items-center justify-center rounded-md border px-1.5 text-center leading-tight ${
                                  restante < 0
                                    ? 'border-destructive/40 bg-destructive/10'
                                    : 'border-border/60 bg-muted/30'
                                }`}
                                title={`Ainda não atribuído a nenhum vendedor: ${formatCurrency(restante)}`}
                              >
                                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Restante</span>
                                <span className={`text-xs font-semibold truncate w-full ${restante < 0 ? 'text-destructive' : ''}`}>
                                  {formatCurrency(restante)}
                                </span>
                              </span>
                            )}
                            <MetaValorInput
                              className="h-9 w-32 text-sm border-border/60 focus-visible:ring-1 focus-visible:ring-offset-0"
                              value={valores[fabricanteId] ?? ''}
                              onChangeValue={display => setValores(prev => ({ ...prev, [fabricanteId]: display }))}
                              onBlur={() => salvarMeta(fabricanteId)}
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

        {fabricantesDisponiveis.length > 0 && (
          <div className="flex items-center gap-2">
            <SearchableSelect
              className="h-9 flex-1 text-sm"
              options={fabricantesDisponiveis.map(f => ({ value: f.id, label: f.nome }))}
              value={novoFabricanteId}
              onValueChange={setNovoFabricanteId}
              placeholder="Novo fabricante"
              emptyMessage="Nenhum fabricante encontrado."
            />
            <MetaValorInput
              placeholder="Meta R$"
              className="h-9 w-32 text-sm"
              value={novoValor}
              onChangeValue={setNovoValor}
            />
            <Button size="sm" className="h-9" onClick={adicionarMeta}>Adicionar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

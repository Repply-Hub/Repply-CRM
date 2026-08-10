import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TOGGLE_LIST_CLASS, TOGGLE_ITEM_CLASS } from '@/lib/toggle-group-styles';
import { Goal, Pencil, Trash2, Loader2, Copy, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlanoVendasProgresso,
  usePlanoVendasProgressoPorVendedor,
  useMetasVendas,
  useUpsertMetaVenda,
  useDeleteMetaVenda,
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
  );

  const totalMeta = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.meta_valor, 0), [progresso]);
  const totalVendido = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.vendido_valor, 0), [progresso]);
  const totalPct = totalMeta > 0 ? (totalVendido / totalMeta) * 100 : 0;

  const vendedorNome = vendedores.find(v => v.usuario_id === vendedorUnico)?.usuario_nome
    ?? (vendedorUnico === currentUsuarioId ? 'Você' : '');

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
  const porVendedor = useMemo(() => {
    const porId = new Map<string, { usuario_id: string; usuario_nome: string; meta_valor: number; vendido_valor: number }>();
    for (const linha of progressoPorVendedorRaw ?? []) {
      const atual = porId.get(linha.usuario_id) ?? {
        usuario_id: linha.usuario_id,
        usuario_nome: linha.usuario_nome,
        meta_valor: 0,
        vendido_valor: 0,
      };
      atual.meta_valor += linha.meta_valor;
      atual.vendido_valor += linha.vendido_valor;
      porId.set(linha.usuario_id, atual);
    }
    return Array.from(porId.values()).sort((a, b) => b.vendido_valor - a.vendido_valor);
  }, [progressoPorVendedorRaw]);

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
            {isGestor && vendedorUnico && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar metas
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
              ? 'Nenhuma meta definida para este período. Use "Editar metas" para começar.'
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
                  const pct = p.meta_valor > 0 ? (p.vendido_valor / p.meta_valor) * 100 : 0;
                  return (
                    <div key={p.fabricante_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-card-foreground">{p.fabricante_nome}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(p.vendido_valor)} / {formatCurrency(p.meta_valor)}{' '}
                          <span className={`font-bold ${progressoCor(pct)}`}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-2.5" />
                    </div>
                  );
                })}
              </div>
            )}

            {mostrarPorVendedor && porVendedor.length > 0 && (
              <div className="space-y-3 pt-1 border-t border-border/60">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-3">
                  Por vendedor
                </p>
                {porVendedor.map(v => {
                  const pct = v.meta_valor > 0 ? (v.vendido_valor / v.meta_valor) * 100 : 0;
                  return (
                    <div key={v.usuario_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-card-foreground">{v.usuario_nome}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(v.vendido_valor)} / {formatCurrency(v.meta_valor)}{' '}
                          <span className={`font-bold ${progressoCor(pct)}`}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-2.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {isGestor && vendedorUnico && (
        <EditarMetasDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          empresaId={empresaId}
          usuarioId={vendedorUnico}
          vendedorNome={vendedorNome}
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
  usuarioId: string;
  vendedorNome: string;
  ano: number;
  mes: number;
  fabricantes: Fabricante[];
}

function EditarMetasDialog({ open, onOpenChange, empresaId, usuarioId, vendedorNome, ano, mes, fabricantes }: EditarMetasDialogProps) {
  // "Individual" edita a meta do vendedor aberto; "Equipe" edita uma meta que
  // não é de ninguém em particular (usuario_id NULL), somada à visão agregada
  // da empresa no Dashboard sem entrar na conta de nenhum vendedor específico.
  const [escopo, setEscopo] = useState<'individual' | 'equipe'>('individual');
  const scopedUsuarioId = escopo === 'individual' ? usuarioId : null;

  // Reabrir o dialog (ou trocar de vendedor) sempre volta pro escopo individual
  // — evita reabrir "preso" no modo Equipe de uma edição anterior.
  useEffect(() => {
    if (open) setEscopo('individual');
  }, [open, usuarioId]);

  const { data: metas } = useMetasVendas(open ? scopedUsuarioId : undefined, ano, mes);
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const { data: metasMesAnterior } = useMetasVendas(open ? scopedUsuarioId : undefined, anoAnterior, mesAnterior);
  const upsertMeta = useUpsertMetaVenda();
  const deleteMeta = useDeleteMetaVenda();

  const [valores, setValores] = useState<Record<string, string>>({});
  const [fabricantesCopiados, setFabricantesCopiados] = useState<Set<string>>(new Set());
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
  }, [scopedUsuarioId, ano, mes]);

  const linhas = useMemo(() => {
    const existentes = (metas ?? []).map(m => ({ id: m.id as string | undefined, fabricanteId: m.fabricante_id }));
    const idsExistentes = new Set(existentes.map(l => l.fabricanteId));
    const extras = Array.from(fabricantesCopiados)
      .filter(id => !idsExistentes.has(id))
      .map(fabricanteId => ({ id: undefined as string | undefined, fabricanteId }));
    return [...existentes, ...extras];
  }, [metas, fabricantesCopiados]);

  const fabricantesComMeta = useMemo(() => new Set(linhas.map(l => l.fabricanteId)), [linhas]);
  const fabricantesDisponiveis = useMemo(
    () => fabricantes.filter(f => !fabricantesComMeta.has(f.id)),
    [fabricantes, fabricantesComMeta],
  );

  const salvarMeta = (fabricanteId: string) => {
    const valor = parseMetaInputValue(valores[fabricanteId] ?? '');
    if (valor < 0) {
      toast.error('Informe um valor válido');
      return;
    }
    upsertMeta.mutate(
      { empresaId, usuarioId: scopedUsuarioId, fabricanteId, ano, mes, metaValor: valor },
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
    upsertMeta.mutate(
      { empresaId, usuarioId: scopedUsuarioId, fabricanteId: novoFabricanteId, ano, mes, metaValor: valor },
      {
        onSuccess: () => {
          setNovoFabricanteId('');
          setNovoValor('');
        },
        onError: () => toast.error('Erro ao adicionar meta'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Editar metas — {escopo === 'individual' ? vendedorNome : 'Toda a equipe'}
          </DialogTitle>
          <DialogDescription>
            {MESES[mes - 1]} de {ano} — meta de vendas por fabricante
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={escopo}
          onValueChange={(v) => v && setEscopo(v as 'individual' | 'equipe')}
          className={TOGGLE_LIST_CLASS}
        >
          <ToggleGroupItem value="individual" className={`${TOGGLE_ITEM_CLASS} flex-1 gap-1.5`}>
            <User className="h-3.5 w-3.5" /> Individual
          </ToggleGroupItem>
          <ToggleGroupItem value="equipe" className={`${TOGGLE_ITEM_CLASS} flex-1 gap-1.5`}>
            <Users className="h-3.5 w-3.5" /> Toda a equipe
          </ToggleGroupItem>
        </ToggleGroup>

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

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {linhas.map(({ id, fabricanteId }) => {
            const fabricante = fabricantes.find(f => f.id === fabricanteId);
            return (
              <div key={fabricanteId} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{fabricante?.nome ?? '—'}</span>
                <MetaValorInput
                  className="h-9 w-32 text-sm"
                  value={valores[fabricanteId] ?? ''}
                  onChangeValue={display => setValores(prev => ({ ...prev, [fabricanteId]: display }))}
                  onBlur={() => salvarMeta(fabricanteId)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive/70 hover:text-destructive"
                  onClick={() => (id ? removerMeta(id) : removerPendente(fabricanteId))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {fabricantesDisponiveis.length > 0 && (
          <div className="flex items-center gap-2 pt-3 border-t border-border/60">
            <Select value={novoFabricanteId} onValueChange={setNovoFabricanteId}>
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue placeholder="Novo fabricante" />
              </SelectTrigger>
              <SelectContent>
                {fabricantesDisponiveis.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Goal, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlanoVendasProgresso,
  useMetasVendas,
  useUpsertMetaVenda,
  useDeleteMetaVenda,
} from '@/hooks/use-plano-vendas';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  vendedores: Vendedor[];
  fabricantes: Fabricante[];
}

function progressoCor(pct: number) {
  if (pct >= 100) return 'text-[hsl(var(--success))]';
  if (pct >= 60) return 'text-primary';
  return 'text-muted-foreground';
}

export function PlanoVendasSection({ empresaId, isGestor, currentUsuarioId, vendedores, fabricantes }: PlanoVendasSectionProps) {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [vendedorId, setVendedorId] = useState<string | undefined>(currentUsuarioId);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!vendedorId && currentUsuarioId) setVendedorId(currentUsuarioId);
  }, [currentUsuarioId, vendedorId]);

  const { data: progresso, isLoading } = usePlanoVendasProgresso(ano, mes, vendedorId);

  const totalMeta = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.meta_valor, 0), [progresso]);
  const totalVendido = useMemo(() => (progresso ?? []).reduce((acc, p) => acc + p.vendido_valor, 0), [progresso]);
  const totalPct = totalMeta > 0 ? (totalVendido / totalMeta) * 100 : 0;

  const vendedorNome = vendedores.find(v => v.usuario_id === vendedorId)?.usuario_nome
    ?? (vendedorId === currentUsuarioId ? 'Você' : '');

  const anos = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

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
            {isGestor && (
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => (
                    <SelectItem key={v.usuario_id} value={v.usuario_id}>{v.usuario_nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nome, idx) => (
                  <SelectItem key={idx} value={String(idx + 1)}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isGestor && vendedorId && (
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
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total do período</p>
                <p className="text-sm font-bold">
                  {formatCurrency(totalVendido)} <span className="text-muted-foreground font-medium">/ {formatCurrency(totalMeta)}</span>
                </p>
              </div>
              <span className={`text-lg font-extrabold ${progressoCor(totalPct)}`}>{totalPct.toFixed(0)}%</span>
            </div>

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
      </CardContent>

      {isGestor && vendedorId && (
        <EditarMetasDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          empresaId={empresaId}
          usuarioId={vendedorId}
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
  const { data: metas } = useMetasVendas(usuarioId, ano, mes);
  const upsertMeta = useUpsertMetaVenda();
  const deleteMeta = useDeleteMetaVenda();

  const [valores, setValores] = useState<Record<string, string>>({});
  const [novoFabricanteId, setNovoFabricanteId] = useState<string>('');
  const [novoValor, setNovoValor] = useState('');

  useEffect(() => {
    if (!metas) return;
    setValores(Object.fromEntries(metas.map(m => [m.fabricante_id, String(m.meta_valor)])));
  }, [metas]);

  const fabricantesComMeta = useMemo(() => new Set((metas ?? []).map(m => m.fabricante_id)), [metas]);
  const fabricantesDisponiveis = useMemo(
    () => fabricantes.filter(f => !fabricantesComMeta.has(f.id)),
    [fabricantes, fabricantesComMeta],
  );

  const salvarMeta = (fabricanteId: string) => {
    const valor = Number(valores[fabricanteId]);
    if (Number.isNaN(valor) || valor < 0) {
      toast.error('Informe um valor válido');
      return;
    }
    upsertMeta.mutate(
      { empresaId, usuarioId, fabricanteId, ano, mes, metaValor: valor },
      { onError: () => toast.error('Erro ao salvar meta') },
    );
  };

  const removerMeta = (id: string) => {
    deleteMeta.mutate(id, { onError: () => toast.error('Erro ao remover meta') });
  };

  const adicionarMeta = () => {
    const valor = Number(novoValor);
    if (!novoFabricanteId) {
      toast.error('Selecione um fabricante');
      return;
    }
    if (Number.isNaN(valor) || valor < 0) {
      toast.error('Informe um valor válido');
      return;
    }
    upsertMeta.mutate(
      { empresaId, usuarioId, fabricanteId: novoFabricanteId, ano, mes, metaValor: valor },
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
          <DialogTitle>Editar metas — {vendedorNome}</DialogTitle>
          <DialogDescription>
            {MESES[mes - 1]} de {ano} — meta de vendas por fabricante
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {(metas ?? []).map(m => {
            const fabricante = fabricantes.find(f => f.id === m.fabricante_id);
            return (
              <div key={m.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{fabricante?.nome ?? '—'}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-9 w-32 text-sm"
                  value={valores[m.fabricante_id] ?? ''}
                  onChange={e => setValores(prev => ({ ...prev, [m.fabricante_id]: e.target.value }))}
                  onBlur={() => salvarMeta(m.fabricante_id)}
                />
                <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive/70 hover:text-destructive" onClick={() => removerMeta(m.id)}>
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
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Meta R$"
              className="h-9 w-32 text-sm"
              value={novoValor}
              onChange={e => setNovoValor(e.target.value)}
            />
            <Button size="sm" className="h-9" onClick={adicionarMeta}>Adicionar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

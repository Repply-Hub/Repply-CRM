import { useEffect, useState } from 'react';
import { format, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ChevronDown, ChevronUp, HardHat, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogTitle, DialogDescription,
  ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useObras } from '@/hooks/use-obras';
import { useCreateRotaVisita } from '@/hooks/use-eventos';

interface ObraOpcao {
  id: string;
  nome_obra: string | null;
  clientes: { empresa: string | null } | null;
}

interface Parada {
  obraId: string;
  nomeObra: string;
  observacao: string;
}

interface NovaRotaVisitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-popula a lista de paradas — usado ao abrir a partir da seleção em massa da tela de Obras. */
  obrasIniciais?: ObraOpcao[];
}

const DURACAO_PADRAO_MINUTOS = 60;

/**
 * "Rota de visita": criar, de uma vez, um evento de visita por obra
 * selecionada. Não desenha trajeto no mapa (decisão de produto de
 * 25/08/2026) — é só uma lista de paradas do mesmo dia, com horário
 * sequencial sugerido automaticamente.
 *
 * Cada parada vira uma linha independente em `eventos` (ver
 * `useCreateRotaVisita`) — depois de criada, cada visita é editada
 * separadamente pelo Calendário ou pelo histórico da obra, não em conjunto.
 */
export function NovaRotaVisitaDialog({ open, onOpenChange, obrasIniciais }: NovaRotaVisitaDialogProps) {
  const { data: obras = [] } = useObras();
  const criarRota = useCreateRotaVisita();

  const [data, setData] = useState<Date>(new Date());
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [jaRealizada, setJaRealizada] = useState(false);
  const [buscaOpen, setBuscaOpen] = useState(false);
  const [dataPopoverOpen, setDataPopoverOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(new Date());
    setHoraInicio('09:00');
    setJaRealizada(false);
    setParadas(
      (obrasIniciais ?? []).map((o) => ({
        obraId: o.id,
        nomeObra: o.nome_obra || 'Obra sem nome',
        observacao: '',
      })),
    );
  }, [open, obrasIniciais]);

  const obrasDisponiveis = ((obras as ObraOpcao[]) ?? []).filter(
    (o) => !paradas.some((p) => p.obraId === o.id),
  );

  const adicionarParada = (obra: ObraOpcao) => {
    setParadas((prev) => [...prev, { obraId: obra.id, nomeObra: obra.nome_obra || 'Obra sem nome', observacao: '' }]);
    setBuscaOpen(false);
  };

  const removerParada = (obraId: string) => {
    setParadas((prev) => prev.filter((p) => p.obraId !== obraId));
  };

  const moverParada = (index: number, direcao: -1 | 1) => {
    setParadas((prev) => {
      const alvo = index + direcao;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const copia = [...prev];
      [copia[index], copia[alvo]] = [copia[alvo], copia[index]];
      return copia;
    });
  };

  const atualizarObservacao = (obraId: string, observacao: string) => {
    setParadas((prev) => prev.map((p) => (p.obraId === obraId ? { ...p, observacao } : p)));
  };

  const horarioDaParada = (index: number) => {
    const [h, m] = horaInicio.split(':').map(Number);
    const base = new Date(data);
    base.setHours(h || 0, m || 0, 0, 0);
    return addMinutes(base, index * DURACAO_PADRAO_MINUTOS);
  };

  const handleSalvar = () => {
    if (paradas.length === 0) {
      toast.error('Adicione ao menos uma obra à rota.');
      return;
    }
    criarRota.mutate(
      {
        data: format(data, 'yyyy-MM-dd'),
        horaInicio,
        duracaoMinutos: DURACAO_PADRAO_MINUTOS,
        jaRealizada,
        paradas: paradas.map((p) => ({
          obraId: p.obraId,
          nomeObra: p.nomeObra,
          observacao: jaRealizada ? p.observacao : undefined,
        })),
      },
      {
        onSuccess: () => {
          toast.success(
            paradas.length === 1
              ? 'Visita registrada no calendário.'
              : `Rota criada com ${paradas.length} visitas no calendário.`,
          );
          onOpenChange(false);
        },
        onError: () => toast.error('Não foi possível criar a rota de visita.'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-4 w-4 text-primary" />
            Nova rota de visita
          </DialogTitle>
          <DialogDescription>
            Escolha as obras que farão parte da visita e a data. Cada obra vira um evento no
            calendário e entra no histórico de visitas dela.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Popover open={dataPopoverOpen} onOpenChange={setDataPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(data, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={data}
                    defaultMonth={data}
                    onSelect={(d) => {
                      if (d) {
                        setData(d);
                        setDataPopoverOpen(false);
                      }
                    }}
                    locale={ptBR}
                    initialFocus
                    captionLayout="dropdown-buttons"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 1}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hora-inicio">Início da 1ª parada</Label>
              <Input
                id="hora-inicio"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ja-realizada" className="cursor-pointer">Essas visitas já aconteceram</Label>
              <p className="text-xs text-muted-foreground">
                Registra a rota como realizada, com espaço para anotar o que foi visto.
              </p>
            </div>
            <Switch id="ja-realizada" checked={jaRealizada} onCheckedChange={setJaRealizada} />
          </div>

          <div className="space-y-1.5">
            <Label>Obras da rota</Label>
            <Popover open={buscaOpen} onOpenChange={setBuscaOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="text-muted-foreground">Adicionar obra…</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                <Command
                  filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
                >
                  <CommandInput placeholder="Buscar obra..." />
                  <CommandList className="max-h-[240px] overflow-y-auto overflow-x-hidden">
                    <CommandEmpty className="py-6 text-center text-sm">Nenhuma obra encontrada.</CommandEmpty>
                    <CommandGroup>
                      {obrasDisponiveis.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={`${o.nome_obra ?? ''} ${o.clientes?.empresa ?? ''}`}
                          onSelect={() => adicionarParada(o)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{o.nome_obra || 'Obra sem nome'}</div>
                            {o.clientes?.empresa && (
                              <div className="truncate text-xs text-muted-foreground">{o.clientes.empresa}</div>
                            )}
                          </div>
                          <Check className="h-4 w-4 shrink-0 opacity-0" />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {paradas.length === 0 ? (
              <p className="pt-1 text-xs text-muted-foreground">Nenhuma obra adicionada ainda.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {paradas.map((parada, index) => (
                  <div key={parada.obraId} className="rounded-md border bg-card p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className={cn('text-muted-foreground hover:text-foreground', index === 0 && 'opacity-30')}
                          disabled={index === 0}
                          onClick={() => moverParada(index, -1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'text-muted-foreground hover:text-foreground',
                            index === paradas.length - 1 && 'opacity-30',
                          )}
                          disabled={index === paradas.length - 1}
                          onClick={() => moverParada(index, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{parada.nomeObra}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {format(horarioDaParada(index), 'HH:mm')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removerParada(parada.obraId)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {jaRealizada && (
                      <Textarea
                        className="mt-2 text-sm"
                        rows={2}
                        placeholder="O que você viu nesta obra?"
                        value={parada.observacao}
                        onChange={(e) => atualizarObservacao(parada.obraId, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={criarRota.isPending || paradas.length === 0}>
            {criarRota.isPending ? 'Criando...' : paradas.length > 1 ? 'Criar rota' : 'Criar visita'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

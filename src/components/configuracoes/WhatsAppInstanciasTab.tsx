import { useRef, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  useAdminCreateInstance,
  useAdminDeleteInstance,
  useAdminConnect,
  useAdminSyncStatus,
  useAdminDisconnect,
  useAdminLinkInstance,
  useAdminUnlinkInstance,
  useAdminSetApelido,
  useAdminSetCor,
} from '@/hooks/use-admin-whatsapp';
import {
  CORES_INSTANCIA,
  CLASSES_PASTILHA_INSTANCIA,
  NOME_COR_INSTANCIA,
  infoCorInstancia,
} from '@/lib/wa-instancia-cores';
import { Input } from '@/components/ui/input';
import type { WaConfig } from '@/hooks/use-whatsapp-inbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2,
  Wifi,
  WifiOff,
  AlertCircle,
  User,
  Smartphone,
  SmartphoneNfc,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  PlugZap,
  Pencil,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UsuarioOpcao {
  usuario_id: string;
  usuario_auth_id: string;
  nome: string;
  role: string;
}

interface InstanciaRow extends WaConfig {
  usuarios: UsuarioOpcao[];
}

// ─── Combobox de usuários com busca (seleção múltipla) ───────────────────────

function UsuarioMultiCombobox({
  usuarios,
  value,
  onChange,
  placeholder = 'Selecione usuários...',
  emptyText = 'Nenhum usuário encontrado.',
}: {
  usuarios: UsuarioOpcao[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = usuarios.filter(u => value.includes(u.usuario_id));
  const todosMarcados = usuarios.length > 0 && usuarios.every(u => value.includes(u.usuario_id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  function toggleTodos() {
    onChange(todosMarcados ? [] : usuarios.map(u => u.usuario_id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-auto min-h-9 justify-between font-normal"
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 py-0.5 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground font-normal">{placeholder}</span>
            ) : selected.length <= 2 ? (
              selected.map(u => (
                <Badge key={u.usuario_id} variant="secondary" className="font-normal">
                  {u.nome}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="font-normal">
                {selected.length} usuários selecionados
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar usuário..." />
          {usuarios.length > 0 && (
            <button
              type="button"
              onClick={toggleTodos}
              className="w-full border-b px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent"
            >
              {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {usuarios.map(u => {
                const isSelected = value.includes(u.usuario_id);
                return (
                  <CommandItem
                    key={u.usuario_id}
                    value={u.nome}
                    onSelect={() => toggle(u.usuario_id)}
                  >
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex-1 truncate">{u.nome}</span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">({u.role})</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ config }: { config: WaConfig }) {
  if (!config.provisionada) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 gap-1 text-[11px]">
        <AlertCircle className="h-3 w-3" /> Não provisionada
      </Badge>
    );
  }
  if (config.status === 'connected') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 gap-1 text-[11px]">
        <Wifi className="h-3 w-3" /> Conectada
      </Badge>
    );
  }
  if (config.status === 'connecting') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 gap-1 text-[11px]">
        <SmartphoneNfc className="h-3 w-3 animate-pulse" /> Conectando
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 gap-1 text-[11px]">
      <WifiOff className="h-3 w-3" /> Desconectada
    </Badge>
  );
}

// ─── Dialog QR ────────────────────────────────────────────────────────────────

function QrDialog({ open, config, onClose }: { open: boolean; config: WaConfig; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connect = useAdminConnect();
  const syncStatus = useAdminSyncStatus();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current!); setQr(null); setQrError(''); setPolling(false); }
  }, [open]);

  useEffect(() => { if (open && config) startQrFlow(); }, [open]);

  function startQrFlow() {
    setQr(null); setQrError(''); setPolling(false);
    clearInterval(intervalRef.current!);
    connect.mutate(config, {
      onSuccess: ({ qr: qrData, alreadyConnected }) => {
        if (qrData) {
          setQr(qrData); setPolling(true);
          intervalRef.current = setInterval(async () => {
            const result = await syncStatus.mutateAsync(config).catch(() => null);
            if (result?.isConnected) {
              clearInterval(intervalRef.current!); setPolling(false); setQr(null);
              qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
              toast.success('WhatsApp conectado com sucesso!'); onClose();
            }
          }, 3000);
        } else if (alreadyConnected) {
          syncStatus.mutate(config, { onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] }); toast.success('WhatsApp já estava conectado — status atualizado.'); onClose(); } });
        } else {
          setQrError('A uazapi não retornou QR code. Tente novamente em alguns segundos.');
        }
      },
      onError: (err: any) => setQrError(err?.message ?? 'Falha ao gerar QR code'),
    });
  }

  const isLoading = connect.isPending || syncStatus.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-green-600" /> Conectar WhatsApp
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground font-mono">{config.instance_name}</p>
          {isLoading && !qr && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              <p className="text-sm text-muted-foreground">{polling ? 'Aguardando conexão...' : 'Gerando QR Code...'}</p>
            </div>
          )}
          {qr && (
            <div className="flex flex-col items-center gap-3">
              <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} alt="QR Code WhatsApp" className="w-52 h-52 rounded-lg border border-border/60 shadow-sm" />
              <p className="text-xs text-muted-foreground text-center">Abra o WhatsApp no celular e escaneie o QR code</p>
              {polling && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Verificando conexão...</div>}
            </div>
          )}
          {qrError && (
            <div className="space-y-2">
              <p className="text-xs text-red-600">{qrError}</p>
              <Button size="sm" variant="outline" className="w-full" onClick={startQrFlow}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Tentar novamente</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog Nova Instância ────────────────────────────────────────────────────

function NovaInstanciaDialog({
  open,
  todosUsuarios,
  onClose,
}: {
  open: boolean;
  todosUsuarios: UsuarioOpcao[];
  onClose: () => void;
}) {
  const [selectedUsuarioIds, setSelectedUsuarioIds] = useState<string[]>([]);
  const [vincularTodos, setVincularTodos] = useState(false);
  const createMutation = useAdminCreateInstance();

  useEffect(() => { if (!open) { setSelectedUsuarioIds([]); setVincularTodos(false); } }, [open]);

  function handleCriar() {
    if (vincularTodos) {
      createMutation.mutate(
        { targetUsuarioIds: todosUsuarios.map(u => u.usuario_id) },
        { onSuccess: onClose },
      );
      return;
    }
    createMutation.mutate(
      { targetUsuarioIds: selectedUsuarioIds.length > 0 ? selectedUsuarioIds : undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" /> Nova Instância WhatsApp
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Uma nova instância será criada na uazapi. Você pode vinculá-la a um ou mais usuários agora ou depois.
          </p>

          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20">
            <div>
              <Label htmlFor="vincular-todos" className="text-xs font-medium">
                Vincular a todos os usuários da empresa
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {todosUsuarios.length} usuário{todosUsuarios.length === 1 ? '' : 's'} da empresa será{todosUsuarios.length === 1 ? '' : 'ão'} vinculado{todosUsuarios.length === 1 ? '' : 's'} a esta instância
              </p>
            </div>
            <Switch
              id="vincular-todos"
              checked={vincularTodos}
              onCheckedChange={setVincularTodos}
              disabled={todosUsuarios.length === 0}
            />
          </div>

          {!vincularTodos && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Vincular a usuário(s) <span className="font-normal">(opcional)</span>
              </label>
              <UsuarioMultiCombobox
                usuarios={todosUsuarios}
                value={selectedUsuarioIds}
                onChange={setSelectedUsuarioIds}
                placeholder="Sem vínculo por enquanto..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCriar} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Criar Instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Título + cor da instância (só exibição — editar é tudo via o lápis) ──────
//
// Antes eram dois controles interativos (clique no nome pra editar inline,
// pastilha clicável com popover de cor). Os dois viraram só display: editar
// qualquer um dos dois agora é só pelo ícone de lápis (`EditarInstanciaDialog`,
// que edita título, cor e usuários vinculados juntos) — dois caminhos pra
// mudar a mesma coisa é confuso, não redundância útil.

function InstanciaTituloECor({ instancia }: { instancia: InstanciaRow }) {
  const info = infoCorInstancia(instancia.cor);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        title={
          info.tipo === 'preset' ? `Cor: ${NOME_COR_INSTANCIA[info.cor]}`
          : info.tipo === 'hex' ? `Cor: ${info.hex}`
          : 'Sem cor definida'
        }
        className={cn(
          'h-3.5 w-3.5 shrink-0 rounded-full border',
          info.tipo === 'nenhuma' && 'border-dashed border-muted-foreground/40 bg-transparent',
          info.tipo === 'preset' && CLASSES_PASTILHA_INSTANCIA[info.cor],
        )}
        style={info.tipo === 'hex' ? { backgroundColor: info.hex, borderColor: info.hex } : undefined}
      />
      {instancia.apelido ? (
        <span className="text-sm font-medium truncate">{instancia.apelido}</span>
      ) : (
        <span className="text-xs text-muted-foreground/70 italic truncate">Sem título definido</span>
      )}
    </div>
  );
}

// ─── Seletor de cor livre — popover no design system do app ──────────────────
//
// Antes disparava o `<input type="color">` nativo: tecnicamente já era "o
// seletor do sistema", só que cada navegador desenha essa janela do seu
// jeito (no Chrome/Linux sai um popup escuro estilo Google Material, sem
// nada a ver com o resto do app) — e isso o site não tem como estilizar, é UI
// do navegador, fora do DOM da página. A primeira versão desta troca virou só
// um campo de hex — mas nem todo usuário sabe de cabeça o código da cor que
// quer. Esta versão tem a área de saturação/brilho + barra de matiz
// arrastáveis, do mesmo jeito que o seletor nativo (ver print do pedido), só
// que desenhado com as cores/bordas do próprio app. O campo de hex continua
// embaixo, mas como atalho OPCIONAL pra quem já sabe o código — não como
// única forma de escolher.

const HEX_REGEX = /^#[0-9a-f]{6}$/i;

function hexParaHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v };
}

function hsvParaHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const paraHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`;
}

const HSV_PADRAO = hexParaHsv('#888888');

function SeletorCorLivre({
  hexAtual,
  onEscolher,
  disabled,
}: {
  hexAtual: string | null;
  onEscolher: (hex: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [{ h, s, v }, setHsv] = useState(() => (hexAtual ? hexParaHsv(hexAtual) : HSV_PADRAO));
  const [textoHex, setTextoHex] = useState(hexAtual ?? '#888888');
  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef<'area' | 'hue' | null>(null);

  // Sincroniza a cor de trabalho com a cor de verdade toda vez que o popover
  // abre — sem isto, reabrir mostraria o rascunho da última vez em vez do
  // valor salvo.
  useEffect(() => {
    if (!open) return;
    setHsv(hexAtual ? hexParaHsv(hexAtual) : HSV_PADRAO);
    setTextoHex(hexAtual ?? '#888888');
  }, [open, hexAtual]);

  function aplicar(novo: { h: number; s: number; v: number }) {
    setHsv(novo);
    const hex = hsvParaHex(novo.h, novo.s, novo.v);
    setTextoHex(hex);
    onEscolher(hex);
  }

  function moverArea(clientX: number, clientY: number) {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    aplicar({ h, s: x / rect.width, v: 1 - y / rect.height });
  }

  function moverHue(clientX: number) {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    aplicar({ h: (x / rect.width) * 360, s, v });
  }

  // Um único listener no window, ligado enquanto o popover está aberto —
  // arrastar o dedo/mouse pra fora da área pequena do popover não pode
  // interromper o gesto, senão soltar fora do quadrado "trava" a cor no meio
  // do arraste.
  useEffect(() => {
    if (!open) return;
    function onMove(e: PointerEvent) {
      if (arrastando.current === 'area') moverArea(e.clientX, e.clientY);
      else if (arrastando.current === 'hue') moverHue(e.clientX);
    }
    function onUp() { arrastando.current = null; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, h, s, v]);

  function mudarTextoHex(valor: string) {
    setTextoHex(valor);
    if (HEX_REGEX.test(valor)) {
      const novo = hexParaHsv(valor);
      setHsv(novo);
      onEscolher(valor.toLowerCase());
    }
  }

  const hexPrevia = hsvParaHex(h, s, v);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={hexAtual ? `Cor livre: ${hexAtual}` : 'Escolher outra cor'}
          disabled={disabled}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full border-2 text-muted-foreground transition-transform hover:scale-110 hover:text-foreground',
            hexAtual ? 'border-foreground' : 'border-dashed border-muted-foreground/40',
          )}
          style={hexAtual ? { backgroundColor: hexAtual } : undefined}
        >
          {!hexAtual && <Plus className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Cor livre</p>

        {/* Saturação (horizontal) × brilho (vertical). Duas camadas de
            gradiente sobre a cor cheia do matiz atual — branco→transparente
            da esquerda, preto→transparente de baixo — é o truque padrão pra
            desenhar um seletor HSV sem canvas. */}
        <div
          ref={areaRef}
          className="relative h-32 w-full touch-none rounded-md"
          style={{
            backgroundColor: `hsl(${h}, 100%, 50%)`,
            backgroundImage:
              'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            arrastando.current = 'area';
            moverArea(e.clientX, e.clientY);
          }}
        >
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, backgroundColor: hexPrevia }}
          />
        </div>

        {/* Barra de matiz (0–360°). */}
        <div
          ref={hueRef}
          className="relative mt-2 h-3 w-full touch-none rounded-full"
          style={{
            backgroundImage:
              'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            arrastando.current = 'hue';
            moverHue(e.clientX);
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: `${(h / 360) * 100}%`, backgroundColor: `hsl(${h}, 100%, 50%)` }}
          />
        </div>

        {/* Hex como atalho opcional — quem já sabe o código digita direto;
            quem não sabe usa só a área acima. */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className="h-8 w-8 shrink-0 rounded-md border border-border"
            style={{ backgroundColor: hexPrevia }}
          />
          <Input
            value={textoHex}
            onChange={(e) => mudarTextoHex(e.target.value)}
            placeholder="#3b82f6"
            maxLength={7}
            disabled={disabled}
            className="h-8 font-mono text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Dialog Editar Instância (título + cor + usuários vinculados) ─────────────

function EditarInstanciaDialog({
  open,
  instancia,
  todosUsuarios,
  onClose,
}: {
  open: boolean;
  instancia: InstanciaRow;
  todosUsuarios: UsuarioOpcao[];
  onClose: () => void;
}) {
  const [apelido, setApelido] = useState(instancia.apelido ?? '');
  // Guarda o valor CRU (chave da paleta OU hex `#rrggbb`) — `infoCorInstancia`
  // é quem decide o que cada valor representa, na hora de exibir.
  const [cor, setCor] = useState<string | null>(instancia.cor ?? null);
  const [usuarioIds, setUsuarioIds] = useState<string[]>(instancia.usuarios.map(u => u.usuario_id));
  const [salvando, setSalvando] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setApelidoMutation = useAdminSetApelido();
  const setCorMutation = useAdminSetCor();
  const linkMutation = useAdminLinkInstance();
  const unlinkMutation = useAdminUnlinkInstance();
  const deleteInstance = useAdminDeleteInstance();

  const infoCorSelecionada = infoCorInstancia(cor);

  // Reseta pro estado atual da instância toda vez que o dialog abre — sem
  // isto, reabrir depois de cancelar (ou depois de outra instância ter sido
  // editada) mostraria o rascunho da vez anterior em vez do dado de verdade.
  useEffect(() => {
    if (!open) return;
    setApelido(instancia.apelido ?? '');
    setCor(instancia.cor ?? null);
    setUsuarioIds(instancia.usuarios.map(u => u.usuario_id));
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instancia.id]);

  async function handleDelete() {
    await deleteInstance.mutateAsync(instancia.id);
    setConfirmDelete(false);
    onClose();
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const tarefas: Promise<unknown>[] = [];

      const apelidoTrimmed = apelido.trim();
      if (apelidoTrimmed !== (instancia.apelido ?? '')) {
        tarefas.push(setApelidoMutation.mutateAsync({ instanceId: instancia.id, apelido: apelidoTrimmed || null }));
      }
      if (cor !== (instancia.cor ?? null)) {
        tarefas.push(setCorMutation.mutateAsync({ instanceId: instancia.id, cor }));
      }

      const vinculadosAntes = new Set(instancia.usuarios.map(u => u.usuario_id));
      const vinculadosDepois = new Set(usuarioIds);
      const paraVincular = usuarioIds.filter(id => !vinculadosAntes.has(id));
      const paraDesvincular = [...vinculadosAntes].filter(id => !vinculadosDepois.has(id));

      if (paraVincular.length > 0) {
        tarefas.push(linkMutation.mutateAsync({ instanceId: instancia.id, targetUsuarioIds: paraVincular }));
      }
      for (const id of paraDesvincular) {
        tarefas.push(unlinkMutation.mutateAsync({ instanceId: instancia.id, targetUsuarioId: id }));
      }

      if (tarefas.length === 0) { onClose(); return; }
      await Promise.all(tarefas);
      onClose();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" /> Editar Instância
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="editar-instancia-titulo" className="text-xs font-medium">
              Título
            </Label>
            <Input
              id="editar-instancia-titulo"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Ex: WhatsApp Vendas"
              disabled={salvando}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cor de identificação</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {CORES_INSTANCIA.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={NOME_COR_INSTANCIA[c]}
                  onClick={() => setCor(c === cor ? null : c)}
                  disabled={salvando}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                    CLASSES_PASTILHA_INSTANCIA[c],
                    c === cor ? 'border-foreground' : 'border-transparent',
                  )}
                />
              ))}
              {/* Cor livre pra quem não quer nenhuma das 8 da paleta — popover
                  próprio do app, não o color picker nativo do navegador. */}
              <SeletorCorLivre
                hexAtual={infoCorSelecionada.tipo === 'hex' ? infoCorSelecionada.hex : null}
                onEscolher={setCor}
                disabled={salvando}
              />
            </div>
            {cor && (
              <button
                type="button"
                onClick={() => setCor(null)}
                disabled={salvando}
                className="text-[11px] text-muted-foreground hover:text-destructive"
              >
                Remover cor
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Usuários vinculados</Label>
            <UsuarioMultiCombobox
              usuarios={todosUsuarios}
              value={usuarioIds}
              onChange={setUsuarioIds}
              placeholder="Nenhum usuário vinculado"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={salvando}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover instância
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover instância?</AlertDialogTitle>
          <AlertDialogDescription>
            A instância <span className="font-mono font-semibold">{instancia.instance_name}</span> e todos os seus vínculos serão removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteInstance.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={handleDelete}
            disabled={deleteInstance.isPending}
          >
            {deleteInstance.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Card de Instância ────────────────────────────────────────────────────────

function InstanciaCard({
  instancia,
  todosUsuarios,
}: {
  instancia: InstanciaRow;
  todosUsuarios: UsuarioOpcao[];
}) {
  const [showQr, setShowQr] = useState(false);
  const [showEditar, setShowEditar] = useState(false);
  const qc = useQueryClient();

  const syncStatus = useAdminSyncStatus();
  const disconnect = useAdminDisconnect();

  const isConnected = instancia.status === 'connected';

  function invalidate() { qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] }); }

  async function handleSync() {
    const result = await syncStatus.mutateAsync(instancia, { onSuccess: invalidate }).catch(() => null);
    if (result) { toast.success(result.isConnected ? 'Conectada' : 'Desconectada'); invalidate(); }
  }

  const isBusy = syncStatus.isPending || disconnect.isPending;

  return (
    <>
      <div className="p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors border border-border/40 space-y-2.5">
        {/* Linha superior: ícone + nome + status + ações */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <InstanciaTituloECor instancia={instancia} />
            <span className="text-[11px] font-mono text-muted-foreground/70 truncate block mt-0.5">
              {instancia.instance_name}
            </span>
          </div>

          <StatusBadge config={instancia} />

          <div className="flex items-center gap-1.5 shrink-0">
            {!isConnected && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50" onClick={() => setShowQr(true)} disabled={isBusy}>
                <QrCode className="h-3.5 w-3.5" /> Conectar
              </Button>
            )}
            {isConnected && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5 border-red-300 text-red-700 hover:bg-red-50" onClick={() => disconnect.mutate(instancia, { onSuccess: invalidate })} disabled={isBusy}>
                {disconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                Desconectar
              </Button>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setShowEditar(true)} disabled={isBusy}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Editar título, cor e usuários</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={handleSync} disabled={isBusy}>
                  {syncStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sincronizar status</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Chips de usuários vinculados — só exibição, sem "x" nem "+ Vincular"
            aqui: quem está vinculado a esta instância se edita pelo lápis
            (`EditarInstanciaDialog`), junto com título e cor. */}
        {instancia.usuarios.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pl-12">
            {instancia.usuarios.map(u => (
              <span
                key={u.usuario_id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
              >
                <User className="h-2.5 w-2.5 shrink-0" />
                {u.nome}
              </span>
            ))}
          </div>
        ) : (
          <p className="pl-12 text-xs text-muted-foreground/70 italic">Nenhum usuário vinculado</p>
        )}
      </div>

      {showQr && <QrDialog open={showQr} config={instancia} onClose={() => setShowQr(false)} />}

      {showEditar && (
        <EditarInstanciaDialog
          open={showEditar}
          instancia={instancia}
          todosUsuarios={todosUsuarios}
          onClose={() => setShowEditar(false)}
        />
      )}
    </>
  );
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function WhatsAppInstanciasTab() {
  const { user } = useAuth();
  const [showNovaInstancia, setShowNovaInstancia] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['empresa_wa_instancias'],
    queryFn: async () => {
      const { data: meuPerfil, error: errPerfil } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', user!.id)
        .single();

      if (errPerfil || !meuPerfil?.empresa_id) throw new Error('Empresa não encontrada');
      const empresaId = meuPerfil.empresa_id;

      const [
        { data: instancias, error: errI },
        { data: usuarios, error: errU },
      ] = await Promise.all([
        supabase.from('configuracoes_wapi').select('*').eq('empresa_id', empresaId).order('instance_name'),
        supabase.from('usuarios').select('id, nome, role, user_id').eq('empresa_id', empresaId).neq('role', 'admin').order('nome'),
      ]);

      if (errI) throw errI;
      if (errU) throw errU;

      const instanciaIds = (instancias ?? []).map(i => i.id);
      const { data: vinculos } = instanciaIds.length > 0
        ? await supabase.from('wapi_instancia_usuarios').select('instancia_id, usuario_auth_id').in('instancia_id', instanciaIds)
        : { data: [] };

      // auth_id → usuario
      const usuarioByAuthId = new Map((usuarios ?? []).map(u => [u.user_id, u]));

      // instancia_id → [UsuarioOpcao]
      const usuariosPorInstancia = new Map<string, UsuarioOpcao[]>();
      for (const v of vinculos ?? []) {
        const u = usuarioByAuthId.get(v.usuario_auth_id);
        if (!u) continue;
        const arr = usuariosPorInstancia.get(v.instancia_id) ?? [];
        arr.push({ usuario_id: u.id, usuario_auth_id: u.user_id, nome: u.nome, role: u.role });
        usuariosPorInstancia.set(v.instancia_id, arr);
      }

      const rows: InstanciaRow[] = (instancias ?? []).map(inst => ({
        ...(inst as WaConfig),
        usuarios: usuariosPorInstancia.get(inst.id) ?? [],
      }));

      // Usuários sem nenhuma instância vinculada
      const authIdsComInstancia = new Set((vinculos ?? []).map(v => v.usuario_auth_id));
      const todosUsuarios: UsuarioOpcao[] = (usuarios ?? []).map(u => ({
        usuario_id: u.id,
        usuario_auth_id: u.user_id,
        nome: u.nome,
        role: u.role,
      }));
      const usuariosSemInstancia = todosUsuarios.filter(u => !authIdsComInstancia.has(u.usuario_auth_id));

      const conectadas = rows.filter(r => r.status === 'connected').length;
      const desconectadas = rows.filter(r => r.provisionada && r.status !== 'connected').length;
      const semUsuario = rows.filter(r => r.usuarios.length === 0).length;

      return {
        rows, todosUsuarios, usuariosSemInstancia, conectadas, desconectadas, semUsuario,
        empresaId,
      };
    },
    enabled: !!user,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rows = data?.rows ?? [];
  const todosUsuarios = data?.todosUsuarios ?? [];
  const usuariosSemInstancia = data?.usuariosSemInstancia ?? [];

  /*
   Não existe mais interruptor de "assinar remetente" aqui, e a ausência é a decisão.

   O CRM assina SEMPRE: a primeira linha da mensagem sai com "*Nome*", para o contato
   saber com quem está falando. É o padrão do mercado de sistemas de conversação, e foi
   a resposta do Lucas em 31/08/2026 à pergunta de produto que estava aberta desde
   29/08 (ver o item 41 de docs/divida-tecnica.md).

   O cartão que existia aqui gravava em TODAS as empresas de uma vez e, desde
   29/08, só o admin global conseguia usá-lo — o gestor levava um 42501 travestido de
   "Erro ao atualizar preferência". Some o controle inteiro em vez de acertar para quem
   ele aparece: configuração que ninguém deve mudar não precisa de tela.

   A coluna `empresas.whatsapp_assinar_remetente` e a RPC continuam no banco, as dez
   empresas com `true`, e o envio segue lendo a coluna
   (supabase/functions/whatsapp-send/index.ts). Nada muda no que o contato recebe.
   */

  return (
    <div className="space-y-6">
      {/* Cabeçalho + resumo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" /> Instâncias WhatsApp
              </CardTitle>
              <CardDescription className="mt-1">
                Crie instâncias e vincule-as a múltiplos usuários da sua empresa
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => setShowNovaInstancia(true)}>
                <Plus className="h-3.5 w-3.5" /> Nova Instância
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className={cn('flex flex-col items-center justify-center p-3 rounded-lg border text-center gap-1', (data?.conectadas ?? 0) > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-muted/30')}>
              <Wifi className={cn('h-4 w-4', (data?.conectadas ?? 0) > 0 ? 'text-emerald-600' : 'text-muted-foreground')} />
              <span className={cn('text-xl font-bold', (data?.conectadas ?? 0) > 0 ? 'text-emerald-700' : 'text-muted-foreground')}>{data?.conectadas ?? 0}</span>
              <span className="text-[11px] text-muted-foreground">Conectadas</span>
            </div>
            <div className={cn('flex flex-col items-center justify-center p-3 rounded-lg border text-center gap-1', (data?.desconectadas ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30')}>
              <WifiOff className={cn('h-4 w-4', (data?.desconectadas ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground')} />
              <span className={cn('text-xl font-bold', (data?.desconectadas ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground')}>{data?.desconectadas ?? 0}</span>
              <span className="text-[11px] text-muted-foreground">Desconectadas</span>
            </div>
            <div className={cn('flex flex-col items-center justify-center p-3 rounded-lg border text-center gap-1', (data?.semUsuario ?? 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-border bg-muted/30')}>
              <User className={cn('h-4 w-4', (data?.semUsuario ?? 0) > 0 ? 'text-amber-600' : 'text-muted-foreground')} />
              <span className={cn('text-xl font-bold', (data?.semUsuario ?? 0) > 0 ? 'text-amber-700' : 'text-muted-foreground')}>{data?.semUsuario ?? 0}</span>
              <span className="text-[11px] text-muted-foreground">Sem usuário</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de instâncias */}
      <Card>
        <CardContent className="pt-5 space-y-2">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Smartphone className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma instância criada ainda.</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNovaInstancia(true)}>
                <Plus className="h-3.5 w-3.5" /> Criar primeira instância
              </Button>
            </div>
          ) : (
            rows.map(inst => (
              <InstanciaCard key={inst.id} instancia={inst} todosUsuarios={todosUsuarios} />
            ))
          )}
        </CardContent>
      </Card>

      {/* Usuários sem instância */}
      {usuariosSemInstancia.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" /> Usuários sem instância ({usuariosSemInstancia.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            {usuariosSemInstancia.map(u => (
              <div key={u.usuario_id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-muted/10">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm flex-1 truncate">{u.nome}</span>
                <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded-full border border-border/40 bg-muted/30">{u.role}</span>
                <Badge variant="outline" className="text-[11px] text-muted-foreground border-muted-foreground/30 gap-1">
                  <AlertCircle className="h-3 w-3" /> Sem instância
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <NovaInstanciaDialog
        open={showNovaInstancia}
        todosUsuarios={todosUsuarios}
        onClose={() => setShowNovaInstancia(false)}
      />
    </div>
  );
}

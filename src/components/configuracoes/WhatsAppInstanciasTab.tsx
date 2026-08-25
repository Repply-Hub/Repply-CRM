import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from '@/hooks/use-admin-whatsapp';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Link2,
  X,
  Pencil,
  MoreVertical,
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

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
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

// ─── Dialog Vincular Usuário ──────────────────────────────────────────────────

function VincularDialog({
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
  const [selectedUsuarioIds, setSelectedUsuarioIds] = useState<string[]>([]);
  const [vincularTodos, setVincularTodos] = useState(false);
  const linkMutation = useAdminLinkInstance();

  useEffect(() => { if (!open) { setSelectedUsuarioIds([]); setVincularTodos(false); } }, [open]);

  // Usuários ainda não vinculados a ESTA instância
  const jaVinculados = new Set(instancia.usuarios.map(u => u.usuario_id));
  const disponiveis = todosUsuarios.filter(u => !jaVinculados.has(u.usuario_id));

  function handleVincular() {
    if (vincularTodos) {
      linkMutation.mutate({ instanceId: instancia.id, targetUsuarioIds: disponiveis.map(u => u.usuario_id) }, { onSuccess: onClose });
      return;
    }
    if (selectedUsuarioIds.length === 0) return;
    linkMutation.mutate({ instanceId: instancia.id, targetUsuarioIds: selectedUsuarioIds }, { onSuccess: onClose });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> Vincular Usuário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">
            Instância: <span className="font-mono">{instancia.instance_name}</span>
          </p>
          {disponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todos os usuários já estão vinculados a esta instância.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20">
                <div>
                  <Label htmlFor="vincular-todos-existente" className="text-xs font-medium">
                    Vincular a todos os usuários da empresa
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {disponiveis.length} usuário{disponiveis.length === 1 ? '' : 's'} ainda não vinculado{disponiveis.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Switch
                  id="vincular-todos-existente"
                  checked={vincularTodos}
                  onCheckedChange={setVincularTodos}
                />
              </div>
              {!vincularTodos && (
                <UsuarioMultiCombobox
                  usuarios={disponiveis}
                  value={selectedUsuarioIds}
                  onChange={setSelectedUsuarioIds}
                />
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleVincular}
            disabled={(!vincularTodos && selectedUsuarioIds.length === 0) || linkMutation.isPending || disponiveis.length === 0}
          >
            {linkMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Vincular
          </Button>
        </DialogFooter>
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

// ─── Apelido da instância (edição inline) ──────────────────────────────────────

function InstanciaApelido({ instancia }: { instancia: InstanciaRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(instancia.apelido ?? '');
  const setApelido = useAdminSetApelido();

  function startEdit() {
    setValue(instancia.apelido ?? '');
    setEditing(true);
  }

  function save() {
    const trimmed = value.trim();
    if (trimmed === (instancia.apelido ?? '')) {
      setEditing(false);
      return;
    }
    setApelido.mutate(
      { instanceId: instancia.id, apelido: trimmed || null },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={save}
          placeholder="Ex: WhatsApp Vendas"
          className="h-7 text-xs px-2 max-w-[180px]"
          disabled={setApelido.isPending}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 shrink-0"
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          disabled={setApelido.isPending}
        >
          {setApelido.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground shrink-0"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(false)}
          disabled={setApelido.isPending}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group flex items-center gap-1.5 min-w-0 text-left"
      title="Editar apelido da instância"
    >
      {instancia.apelido ? (
        <span className="text-sm font-medium truncate">{instancia.apelido}</span>
      ) : (
        <span className="text-xs text-muted-foreground/70 italic truncate">Sem apelido — clique para nomear</span>
      )}
      <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors shrink-0" />
    </button>
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const qc = useQueryClient();

  const deleteInstance = useAdminDeleteInstance();
  const syncStatus = useAdminSyncStatus();
  const disconnect = useAdminDisconnect();
  const unlink = useAdminUnlinkInstance();

  const isConnected = instancia.status === 'connected';

  function invalidate() { qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] }); }

  async function handleSync() {
    const result = await syncStatus.mutateAsync(instancia, { onSuccess: invalidate }).catch(() => null);
    if (result) { toast.success(result.isConnected ? 'Conectada' : 'Desconectada'); invalidate(); }
  }

  async function handleDelete() {
    await deleteInstance.mutateAsync(instancia.id, { onSuccess: invalidate });
    setConfirmDelete(false); invalidate();
  }

  const isBusy = deleteInstance.isPending || syncStatus.isPending || disconnect.isPending || unlink.isPending;

  return (
    <>
      <div className="p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors border border-border/40 space-y-2.5">
        {/* Linha superior: ícone + nome + status + ações */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <InstanciaApelido instancia={instancia} />
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
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={handleSync} disabled={isBusy}>
                  {syncStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sincronizar status</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" disabled={isBusy}>
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setShowVincular(true)} className="gap-2 text-sm">
                  <Link2 className="h-3.5 w-3.5" /> Vincular usuário
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="gap-2 text-sm text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Remover instância
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Chips de usuários vinculados */}
        <div className="flex flex-wrap items-center gap-1.5 pl-12">
          {instancia.usuarios.map(u => (
            <span
              key={u.usuario_id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
            >
              <User className="h-2.5 w-2.5 shrink-0" />
              {u.nome}
              <button
                className="ml-0.5 hover:text-destructive transition-colors"
                onClick={() => unlink.mutate({ instanceId: instancia.id, targetUsuarioId: u.usuario_id }, { onSuccess: invalidate })}
                disabled={isBusy}
                title={`Desvincular ${u.nome}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setShowVincular(true)}
            disabled={isBusy}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          >
            <Link2 className="h-2.5 w-2.5" /> Vincular
          </button>
        </div>
      </div>

      {showQr && <QrDialog open={showQr} config={instancia} onClose={() => setShowQr(false)} />}

      {showVincular && (
        <VincularDialog
          open={showVincular}
          instancia={instancia}
          todosUsuarios={todosUsuarios}
          onClose={() => setShowVincular(false)}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância <span className="font-mono font-semibold">{instancia.instance_name}</span> e todos os seus vínculos serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              {deleteInstance.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        { data: empresa, error: errE },
      ] = await Promise.all([
        supabase.from('configuracoes_wapi').select('*').eq('empresa_id', empresaId).order('instance_name'),
        supabase.from('usuarios').select('id, nome, role, user_id').eq('empresa_id', empresaId).neq('role', 'admin').order('nome'),
        supabase.from('empresas').select('whatsapp_assinar_remetente').eq('id', empresaId).single(),
      ]);

      if (errE) throw errE;

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
        empresaId, assinarRemetente: empresa?.whatsapp_assinar_remetente ?? true,
      };
    },
    enabled: !!user,
  });

  const queryClient = useQueryClient();
  const toggleAssinarRemetente = useMutation({
    mutationFn: async (novoValor: boolean) => {
      // Aplica a preferência a TODAS as empresas de uma vez (RPC SECURITY DEFINER),
      // independentemente da conta logada. Ver migration
      // 20260715120000_wapi_assinar_remetente_global_rpc.sql
      const { error } = await supabase.rpc('set_whatsapp_assinar_remetente_global', {
        p_valor: novoValor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      toast.success('Preferência aplicada a todas as empresas');
    },
    onError: () => toast.error('Erro ao atualizar preferência'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const rows = data?.rows ?? [];
  const todosUsuarios = data?.todosUsuarios ?? [];
  const usuariosSemInstancia = data?.usuariosSemInstancia ?? [];

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

      {/* Assinatura do remetente nas mensagens enviadas */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="assinar-remetente" className="text-sm font-medium">
                Assinar remetente nas mensagens enviadas
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Inclui "*Nome*" na primeira linha das mensagens enviadas pelo CRM, para que o contato saiba quem está falando.
                Esta preferência é aplicada a <strong>todas as empresas</strong>.
              </p>
            </div>
            <Switch
              id="assinar-remetente"
              checked={data?.assinarRemetente ?? true}
              disabled={toggleAssinarRemetente.isPending || isLoading}
              onCheckedChange={(checked) => toggleAssinarRemetente.mutate(checked)}
            />
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

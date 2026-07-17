import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Wifi,
  WifiOff,
  AlertCircle,
  Building2,
  User,
  ChevronDown,
  ChevronRight,
  Smartphone,
  SmartphoneNfc,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  PlugZap,
  Pencil,
  Link2,
  Unlink,
  Check as CheckIcon,
  X as XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useAdminProvision,
  useAdminDeleteInstance,
  useAdminLinkInstance,
  useAdminUnlinkInstance,
  useAdminConnect,
  useAdminSyncStatus,
  useAdminDisconnect,
  useAdminSetApelido,
} from '@/hooks/use-admin-whatsapp';
import type { WaConfig } from '@/hooks/use-whatsapp-inbox';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UsuarioComInstancia {
  usuario_id: string;       // usuarios.id
  usuario_auth_id: string;  // auth.users.id = configuracoes_wapi.usuario_id
  usuario_nome: string;
  role: string;
  empresa_id: string | null;
  config: WaConfig | null;
}

interface EmpresaGroup {
  empresa_id: string;
  empresa_nome: string;
  usuarios: UsuarioComInstancia[];
  instancias: WaConfig[];
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────

function StatusBadge({ config }: { config: WaConfig | null }) {
  if (!config || !config.provisionada) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 gap-1 text-[11px]">
        <AlertCircle className="h-3 w-3" />
        Não provisionada
      </Badge>
    );
  }
  if (config.status === 'connected') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 gap-1 text-[11px]">
        <Wifi className="h-3 w-3" />
        Conectada
      </Badge>
    );
  }
  if (config.status === 'connecting') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 gap-1 text-[11px]">
        <SmartphoneNfc className="h-3 w-3 animate-pulse" />
        Conectando
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 gap-1 text-[11px]">
      <WifiOff className="h-3 w-3" />
      Desconectada
    </Badge>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'empresa') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
        <Building2 className="h-2.5 w-2.5" />
        Principal
      </span>
    );
  }
  if (role === 'gestor') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
        <User className="h-2.5 w-2.5" />
        Gestor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border/60">
      <User className="h-2.5 w-2.5" />
      Vendedor
    </span>
  );
}

// Nome amigável da instância + edição inline do apelido. Sem apelido, cai no
// instance_name técnico (ex: "bb5fce8c_ohdsdv") só pra não ficar em branco.
function InstanceLabel({ config }: { config: WaConfig }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(config.apelido ?? '');
  const setApelido = useAdminSetApelido();

  function startEdit() {
    setValue(config.apelido ?? '');
    setEditing(true);
  }

  function save() {
    const trimmed = value.trim();
    setApelido.mutate(
      { instanceId: config.id, apelido: trimmed || null },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={config.instance_name}
          className="h-6 text-[11px] px-1.5 py-0 max-w-[160px]"
          disabled={setApelido.isPending}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700"
          onClick={save}
          disabled={setApelido.isPending}
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={() => setEditing(false)}
          disabled={setApelido.isPending}
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group flex items-center gap-1 mt-0.5 text-left"
      title="Editar apelido da instância"
    >
      <Smartphone className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[11px] text-muted-foreground truncate">
        {config.apelido || <span className="font-mono">{config.instance_name}</span>}
      </span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors shrink-0" />
    </button>
  );
}

// ─── Dialog QR Code ───────────────────────────────────────────────────────────

function QrDialog({
  open,
  config,
  onClose,
}: {
  open: boolean;
  config: WaConfig;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connect = useAdminConnect();
  const syncStatus = useAdminSyncStatus();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current!);
      setQr(null);
      setQrError('');
      setPolling(false);
    }
  }, [open]);

  // Inicia o fluxo de QR assim que o dialog abre
  useEffect(() => {
    if (open && config) startQrFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startQrFlow() {
    setQr(null);
    setQrError('');
    setPolling(false);
    clearInterval(intervalRef.current!);

    connect.mutate(config, {
      onSuccess: ({ qr: qrData, alreadyConnected }) => {
        if (qrData) {
          setQr(qrData);
          setPolling(true);
          intervalRef.current = setInterval(async () => {
            const result = await syncStatus.mutateAsync(config).catch(() => null);
            if (result?.isConnected) {
              clearInterval(intervalRef.current!);
              setPolling(false);
              setQr(null);
              qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
              toast.success('WhatsApp conectado com sucesso!');
              onClose();
            }
          }, 3000);
        } else if (alreadyConnected) {
          syncStatus.mutate(config, {
            onSuccess: () => {
              toast.success('WhatsApp já estava conectado — status atualizado.');
              onClose();
            },
          });
        } else {
          setQrError('A uazapi não retornou QR code. Tente novamente em alguns segundos.');
        }
      },
      onError: (err: any) => {
        setQrError(err?.message ?? 'Falha ao gerar QR code');
      },
    });
  }

  const isLoading = connect.isPending || syncStatus.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-green-600" />
            Conectar WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground font-mono">{config.instance_name}</p>

          {isLoading && !qr && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              <p className="text-sm text-muted-foreground">
                {polling ? 'Aguardando conexão...' : 'Gerando QR Code...'}
              </p>
            </div>
          )}

          {qr && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code WhatsApp"
                className="w-52 h-52 rounded-lg border border-border/60 shadow-sm"
              />
              <p className="text-xs text-muted-foreground text-center">
                Abra o WhatsApp no celular e escaneie o QR code
              </p>
              {polling && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Verificando conexão...
                </div>
              )}
            </div>
          )}

          {qrError && (
            <div className="space-y-2">
              <p className="text-xs text-red-600">{qrError}</p>
              <Button size="sm" variant="outline" className="w-full" onClick={startQrFlow}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Linha de usuário ─────────────────────────────────────────────────────────

function UsuarioRow({
  usuario,
  instanciasDaEmpresa,
  onRefresh,
}: {
  usuario: UsuarioComInstancia;
  instanciasDaEmpresa: WaConfig[];
  onRefresh: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');

  const provision = useAdminProvision();
  const deleteInstance = useAdminDeleteInstance();
  const linkInstance = useAdminLinkInstance();
  const unlinkInstance = useAdminUnlinkInstance();
  const syncStatus = useAdminSyncStatus();
  const disconnect = useAdminDisconnect();

  const config = usuario.config;
  const isProvisioned = !!config?.provisionada;
  const isConnected = config?.status === 'connected';

  // Instâncias da mesma empresa que este usuário ainda não está vinculado
  const outrasInstancias = instanciasDaEmpresa.filter(i => i.id !== config?.id);

  async function handleProvision() {
    await provision.mutateAsync({ targetUsuarioId: usuario.usuario_id });
    onRefresh();
  }

  async function handleLink() {
    if (!selectedInstanceId) return;
    await linkInstance.mutateAsync({
      instanceId: selectedInstanceId,
      targetUsuarioId: usuario.usuario_id,
    });
    setLinking(false);
    setSelectedInstanceId('');
    onRefresh();
  }

  async function handleUnlink() {
    if (!config) return;
    await unlinkInstance.mutateAsync({
      instanceId: config.id,
      targetUsuarioId: usuario.usuario_id,
    });
    onRefresh();
  }

  async function handleSync() {
    if (!config) return;
    const result = await syncStatus.mutateAsync(config).catch(() => null);
    if (result) {
      toast.success(result.isConnected ? 'Conectada' : 'Desconectada');
    }
  }

  async function handleDisconnect() {
    if (!config) return;
    disconnect.mutate(config);
  }

  async function handleDelete() {
    if (!config) return;
    await deleteInstance.mutateAsync(config.id);
    setConfirmDelete(false);
    onRefresh();
  }

  const isBusy =
    provision.isPending ||
    deleteInstance.isPending ||
    linkInstance.isPending ||
    unlinkInstance.isPending ||
    syncStatus.isPending ||
    disconnect.isPending;

  return (
    <>
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors border border-border/40">
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{usuario.usuario_nome}</span>
            <RoleBadge role={usuario.role} />
          </div>
          {config ? (
            <InstanceLabel config={config} />
          ) : (
            <span className="text-[11px] text-muted-foreground/60 italic">sem instância</span>
          )}
        </div>

        {/* Status */}
        <StatusBadge config={config} />

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          {!isProvisioned && linking && (
            <div className="flex items-center gap-1">
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger className="h-7 w-40 text-xs px-2">
                  <SelectValue placeholder="Escolha a instância" />
                </SelectTrigger>
                <SelectContent>
                  {outrasInstancias.map(inst => (
                    <SelectItem key={inst.id} value={inst.id} className="text-xs">
                      {inst.apelido || inst.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700"
                onClick={handleLink}
                disabled={isBusy || !selectedInstanceId}
              >
                {linkInstance.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckIcon className="h-3.5 w-3.5" />
                }
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => { setLinking(false); setSelectedInstanceId(''); }}
                disabled={isBusy}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {!isProvisioned && !linking && outrasInstancias.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setLinking(true)}
              disabled={isBusy}
              title="Vincular a uma instância já existente na empresa"
            >
              <Link2 className="h-3 w-3" />
              Vincular
            </Button>
          )}

          {!isProvisioned && !linking && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleProvision}
              disabled={isBusy}
            >
              {provision.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Plus className="h-3 w-3" />
              }
              Criar
            </Button>
          )}

          {isProvisioned && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-600"
              onClick={handleUnlink}
              disabled={isBusy}
              title="Desvincular usuário desta instância (a instância continua existindo para os demais)"
            >
              {unlinkInstance.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Unlink className="h-3.5 w-3.5" />
              }
            </Button>
          )}

          {isProvisioned && !isConnected && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setShowQr(true)}
              disabled={isBusy}
            >
              <QrCode className="h-3 w-3" />
              Conectar
            </Button>
          )}

          {isProvisioned && isConnected && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
              onClick={handleDisconnect}
              disabled={isBusy}
            >
              {disconnect.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <PlugZap className="h-3 w-3" />
              }
              Desconectar
            </Button>
          )}

          {isProvisioned && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleSync}
              disabled={isBusy}
              title="Sincronizar status"
            >
              {syncStatus.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />
              }
            </Button>
          )}

          {isProvisioned && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
              title="Excluir instância da uazapi (remove para todos os usuários vinculados)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* QR Dialog */}
      {showQr && config && (
        <QrDialog
          open={showQr}
          config={config}
          onClose={() => setShowQr(false)}
        />
      )}

      {/* Confirm delete */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância <span className="font-semibold">{config?.apelido || config?.instance_name}</span> de{' '}
              <span className="font-semibold">{usuario.usuario_nome}</span> será removida da uazapi e do banco de dados.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {deleteInstance.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Card de empresa ──────────────────────────────────────────────────────────

function EmpresaCard({
  group,
  onRefresh,
}: {
  group: EmpresaGroup;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const connected = group.usuarios.filter(u => u.config?.status === 'connected').length;
  const total = group.usuarios.length;
  const hasIssue = group.usuarios.some(u => u.config?.provisionada && u.config.status !== 'connected');

  const principal = group.usuarios.find(u => u.role === 'empresa');
  const funcionarios = group.usuarios
    .filter(u => u.role !== 'empresa')
    .sort((a, b) => a.usuario_nome.localeCompare(b.usuario_nome));

  // Cada instância (configuracoes_wapi) pode ter vários usuários vinculados via
  // wapi_instancia_usuarios. A maioria das empresas usa uma única instância
  // compartilhada, mas algumas já têm duas ou mais instâncias distintas — nesse
  // caso agrupamos visualmente por instância para deixar isso explícito.
  const instanciasDistintas = new Set(
    group.usuarios
      .map(u => u.config?.id)
      .filter((id): id is string => !!id),
  );
  const temMultiplasInstancias = instanciasDistintas.size > 1;

  const gruposPorInstancia = temMultiplasInstancias
    ? [...instanciasDistintas]
        .map(instanciaId => {
          const usuarios = group.usuarios.filter(u => u.config?.id === instanciaId);
          return {
            instanciaId,
            instanceName: usuarios[0]?.config?.apelido || usuarios[0]?.config?.instance_name || instanciaId,
            usuarios: usuarios.sort((a, b) => {
              if (a.role === 'empresa' && b.role !== 'empresa') return -1;
              if (b.role === 'empresa' && a.role !== 'empresa') return 1;
              return a.usuario_nome.localeCompare(b.usuario_nome);
            }),
          };
        })
        .sort((a, b) => a.instanceName.localeCompare(b.instanceName))
    : [];
  const semInstancia = group.usuarios.filter(u => !u.config?.id);

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(v => !v)} className="w-full text-left">
        <CardHeader className="py-4 px-5 hover:bg-muted/30 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                hasIssue ? 'bg-amber-100' : 'bg-emerald-100'
              )}>
                <Building2 className={cn('h-4 w-4', hasIssue ? 'text-amber-600' : 'text-emerald-600')} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base font-semibold truncate">{group.empresa_nome}</CardTitle>
                  {temMultiplasInstancias && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
                      <Smartphone className="h-2.5 w-2.5" />
                      {instanciasDistintas.size} instâncias
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {connected}/{total} instâncias conectadas · {total} usuário{total !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                {connected}/{total}
              </div>
              {expanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </div>
          </div>
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="px-5 pb-4 pt-0">
          {temMultiplasInstancias ? (
            <div className="space-y-4">
              {gruposPorInstancia.map((grupo) => (
                <div
                  key={grupo.instanciaId}
                  className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                    <Smartphone className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-[11px] font-semibold truncate">
                      {grupo.instanceName}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      · {grupo.usuarios.length} usuário{grupo.usuarios.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {grupo.usuarios.map(u => (
                      <UsuarioRow key={u.usuario_id} usuario={u} instanciasDaEmpresa={group.instancias} onRefresh={onRefresh} />
                    ))}
                  </div>
                </div>
              ))}

              {semInstancia.length > 0 && (
                <div className="border-l-2 border-border/40 ml-4 pl-4 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                    Sem instância ({semInstancia.length})
                  </p>
                  {semInstancia
                    .sort((a, b) => a.usuario_nome.localeCompare(b.usuario_nome))
                    .map(u => (
                      <UsuarioRow key={u.usuario_id} usuario={u} instanciasDaEmpresa={group.instancias} onRefresh={onRefresh} />
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="border-l-2 border-border/40 ml-4 pl-4 space-y-2">
              {principal && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                    Instância principal
                  </p>
                  <UsuarioRow usuario={principal} instanciasDaEmpresa={group.instancias} onRefresh={onRefresh} />
                </div>
              )}

              {funcionarios.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                    Funcionários ({funcionarios.length})
                  </p>
                  {funcionarios.map(u => (
                    <UsuarioRow key={u.usuario_id} usuario={u} instanciasDaEmpresa={group.instancias} onRefresh={onRefresh} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const AdminWhatsAppInstancias = () => {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin_wa_instancias'],
    queryFn: async () => {
      const [
        { data: usuarios, error: errU },
        { data: empresas, error: errE },
        { data: configs, error: errC },
        { data: links, error: errL },
      ] = await Promise.all([
        supabase.from('usuarios').select('id, nome, role, empresa_id, user_id').neq('role', 'admin'),
        supabase.from('empresas').select('id, nome'),
        supabase.from('configuracoes_wapi').select('*'),
        supabase.from('wapi_instancia_usuarios').select('instancia_id, usuario_auth_id'),
      ]);

      if (errU) throw errU;
      if (errE) throw errE;
      if (errC) throw errC;
      if (errL) throw errL;

      const configById = new Map((configs ?? []).map(c => [c.id, c]));
      // Legado: configuracoes_wapi.usuario_id ainda é usado por instâncias criadas antes do
      // desacoplamento (migration 20260620_wapi_instancia_desacoplada). A tabela de vínculo
      // wapi_instancia_usuarios é a fonte de verdade para instâncias criadas depois.
      const configByAuthId = new Map((configs ?? []).map(c => [c.usuario_id, c]));
      for (const link of links ?? []) {
        const config = configById.get(link.instancia_id);
        if (config) configByAuthId.set(link.usuario_auth_id, config);
      }
      const empresaMap = new Map((empresas ?? []).map(e => [e.id, e.nome]));

      const instanciasPorEmpresa = new Map<string, WaConfig[]>();
      for (const c of (configs ?? []) as WaConfig[]) {
        if (!c.empresa_id) continue;
        const list = instanciasPorEmpresa.get(c.empresa_id) ?? [];
        list.push(c);
        instanciasPorEmpresa.set(c.empresa_id, list);
      }

      const rows: UsuarioComInstancia[] = (usuarios ?? [])
        .filter(u => u.empresa_id)
        .map(u => ({
          usuario_id: u.id,
          usuario_auth_id: u.user_id,
          usuario_nome: u.nome,
          role: u.role,
          empresa_id: u.empresa_id,
          config: (configByAuthId.get(u.user_id) as WaConfig) ?? null,
        }));

      const groupMap = new Map<string, EmpresaGroup>();

      for (const row of rows) {
        const eid = row.empresa_id!;
        if (!groupMap.has(eid)) {
          groupMap.set(eid, {
            empresa_id: eid,
            empresa_nome: empresaMap.get(eid) ?? 'Empresa desconhecida',
            usuarios: [],
            instancias: instanciasPorEmpresa.get(eid) ?? [],
          });
        }
        groupMap.get(eid)!.usuarios.push(row);
      }

      const groups = [...groupMap.values()].map(g => ({
        ...g,
        usuarios: g.usuarios.sort((a, b) => {
          if (a.role === 'empresa' && b.role !== 'empresa') return -1;
          if (b.role === 'empresa' && a.role !== 'empresa') return 1;
          return a.usuario_nome.localeCompare(b.usuario_nome);
        }),
      })).sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome));

      const totalInstancias = rows.filter(r => r.config?.provisionada).length;
      const conectadas = rows.filter(r => r.config?.status === 'connected').length;
      const desconectadas = rows.filter(r => r.config?.provisionada && r.config.status !== 'connected').length;
      const naoProvisionadas = rows.filter(r => !r.config?.provisionada).length;

      return { groups, totalInstancias, conectadas, desconectadas, naoProvisionadas };
    },
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Instâncias WhatsApp"
      subtitle="Gerencie todas as instâncias uazapi por empresa e funcionário"
    >
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total provisionadas</CardTitle>
              <Smartphone className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalInstancias ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">instâncias criadas</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Conectadas</CardTitle>
              <Wifi className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{data?.conectadas ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">ativas agora</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Desconectadas</CardTitle>
              <WifiOff className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{data?.desconectadas ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">precisam de atenção</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Sem instância</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{data?.naoProvisionadas ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">usuários não configurados</p>
            </CardContent>
          </Card>
        </div>

        {/* Header de empresas + botão refresh */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Empresas ({data?.groups.length ?? 0})
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* Lista de empresas */}
        <div className="space-y-3">
          {(data?.groups ?? []).length === 0 && (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma empresa ou usuário encontrado.
              </CardContent>
            </Card>
          )}
          {(data?.groups ?? []).map(group => (
            <EmpresaCard key={group.empresa_id} group={group} onRefresh={handleRefresh} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminWhatsAppInstancias;

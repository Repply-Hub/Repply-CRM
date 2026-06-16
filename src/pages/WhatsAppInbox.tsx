import { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import {
  useWaConversas,
  useWaMensagens,
  useWaSendMessage,
  useWaMarcarLida,
  useWaConfig,
  useWaNovaConversa,
  useWaLimparConversa,
  useWaArquivarConversa,
  useWaConnect,
  useWaSyncStatus,
  useWaDisconnect,
  useWaProvision,
  uploadWaMedia,
  type WaConversa,
  type WaMensagem,
  type WaMidiaTipo,
  type WaConfig,
} from '@/hooks/use-whatsapp-inbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  MessageCircle,
  Send,
  Settings,
  Plus,
  Search,
  Phone,
  CheckCheck,
  Check,
  Clock,
  Wifi,
  WifiOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  X,
  FileText,
  Music,
  Video,
  Image as ImageIcon,
  ChevronDown,
  Mic,
  Square,
  Download,
  Play,
  Pause,
  MoreVertical,
  Trash2,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function colorForPhone(phone: string) {
  const colors = ['bg-green-500', 'bg-teal-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500'];
  let hash = 0;
  for (const c of phone) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

function initials(nome: string | null, telefone: string) {
  if (nome) {
    const parts = nome.trim().split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return telefone.replace(/\D/g, '').slice(-2);
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM', { locale: ptBR });
}

function tipoFromFile(file: File): WaMidiaTipo {
  if (file.type.startsWith('image/')) return 'imagem';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'documento';
}

function AttachmentIcon({ tipo, className }: { tipo: WaMidiaTipo; className?: string }) {
  if (tipo === 'imagem') return <ImageIcon className={className} />;
  if (tipo === 'audio') return <Music className={className} />;
  if (tipo === 'video') return <Video className={className} />;
  return <FileText className={className} />;
}

function MessageStatus({ status }: { status: string }) {
  if (status === 'enviando') return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === 'enviado') return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === 'entregue') return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === 'lido') return <CheckCheck className="h-3 w-3 text-blue-500" />;
  return null;
}

function WaAudioPlayer({
  src,
  isSaida,
  conversaAtiva,
  msg,
}: {
  src: string;
  isSaida: boolean;
  conversaAtiva: WaConversa;
  msg: WaMensagem;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const formatAudioTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration || isNaN(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const clickPercent = Math.min(Math.max(clickX / width, 0), 1);
    audioRef.current.currentTime = clickPercent * duration;
  };

  const totalBars = 30;
  const heights = [
    30, 45, 20, 60, 40, 75, 30, 50, 80, 35, 25, 45, 65, 55, 35, 70, 45, 25, 50, 40, 65, 30, 20, 45, 55, 40, 30, 50, 45, 35
  ];

  let avatarUrl: string | null = null;
  let fallbackInitials = '';
  let avatarColorClass = 'bg-primary';

  if (isSaida) {
    if (msg.usuario) {
      avatarUrl = msg.usuario.avatar_url;
      const parts = msg.usuario.nome.trim().split(' ');
      fallbackInitials = parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    } else {
      fallbackInitials = 'EU';
    }
  } else {
    fallbackInitials = initials(conversaAtiva.nome_contato, conversaAtiva.telefone);
    avatarColorClass = colorForPhone(conversaAtiva.telefone);
  }

  return (
    <div className="flex items-center gap-3 w-[260px] sm:w-[280px] py-1.5 px-2">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <button 
        type="button"
        onClick={togglePlay}
        className={cn(
          "w-8.5 h-8.5 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-sm",
          isSaida 
            ? "bg-white/20 hover:bg-white/30 text-white border border-white/10" 
            : "bg-black/5 hover:bg-black/10 text-foreground border border-black/5"
        )}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div 
          onClick={handleScrub}
          className="relative h-6 flex items-center cursor-pointer group"
        >
          <div className="flex items-end gap-[2px] w-full h-4 justify-between">
            {Array.from({ length: totalBars }).map((_, i) => {
              const barProgress = (i / totalBars) * 100;
              const isPlayed = progress >= barProgress;
              const heightPercent = heights[i % heights.length];
              return (
                <div 
                  key={i}
                  className={cn(
                    "w-[3px] rounded-full transition-all duration-150",
                    isPlayed 
                      ? (isSaida ? "bg-white" : "bg-sky-500") 
                      : (isSaida ? "bg-white/30" : "bg-gray-300 dark:bg-zinc-650")
                  )}
                  style={{ height: `${heightPercent}%` }}
                />
              );
            })}
          </div>

          <div 
            className={cn(
              "absolute w-2.5 h-2.5 rounded-full shadow-md -ml-1.5 transition-transform",
              isSaida ? "bg-white" : "bg-sky-500"
            )}
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[9px] opacity-75 px-0.5">
          <span className={isSaida ? "text-white/90" : "text-muted-foreground"}>
            {formatAudioTime(currentTime || duration)}
          </span>
        </div>
      </div>

      <div className="relative shrink-0 select-none">
        <Avatar className="h-8.5 w-8.5 border border-black/5 dark:border-white/5 shadow-sm">
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <AvatarFallback className={cn(avatarColorClass, "text-[10px] font-semibold text-white")}>
              {fallbackInitials}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="absolute -bottom-1 -left-1 bg-background dark:bg-zinc-800 rounded-full p-0.5 shadow-sm border border-border">
          <Mic className="h-2.5 w-2.5 text-green-500 fill-green-500" />
        </div>
      </div>
    </div>
  );
}

const PLACEHOLDERS = ['[Imagem]', '[Áudio]', '[Vídeo]', '[Documento]', '[Sticker]'];

function MessageContent({ msg, isSaida, onImageClick, conversaAtiva }: { msg: WaMensagem; isSaida: boolean; onImageClick?: (url: string) => void; conversaAtiva: WaConversa }) {
  const textCls = isSaida ? 'text-white' : 'text-foreground';

  if (msg.tipo === 'imagem' && msg.media_url) {
    return (
      <div className="flex flex-col -mx-2 -mt-1 -mb-1 max-w-[240px] sm:max-w-[280px]">
        <img
          src={msg.media_url}
          alt="imagem"
          className="w-full rounded-[14px] cursor-pointer hover:opacity-90 transition-opacity object-cover shadow-sm"
          onClick={() => {
            if (onImageClick) {
              onImageClick(msg.media_url!);
            } else {
              window.open(msg.media_url!, '_blank');
            }
          }}
        />
        {msg.conteudo && !PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn('text-sm mt-1.5 px-2 pb-0.5', textCls)}>{msg.conteudo}</p>
        )}
      </div>
    );
  }

  if (msg.tipo === 'audio' && msg.media_url) {
    return (
      <WaAudioPlayer
        src={msg.media_url}
        isSaida={isSaida}
        conversaAtiva={conversaAtiva}
        msg={msg}
      />
    );
  }

  if (msg.tipo === 'video' && msg.media_url) {
    return (
      <div className="flex flex-col -mx-2 -mt-1 -mb-1 max-w-[240px] sm:max-w-[280px]">
        <video controls src={msg.media_url} className="w-full rounded-[14px] shadow-sm bg-black/10" />
        {msg.conteudo && !PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn('text-sm mt-1.5 px-2 pb-0.5', textCls)}>{msg.conteudo}</p>
        )}
      </div>
    );
  }

  if (msg.tipo === 'documento' && msg.media_url) {
    const label = !PLACEHOLDERS.includes(msg.conteudo) ? msg.conteudo : 'Documento anexado';
    return (
      <a
        href={msg.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-3 p-2.5 rounded-lg border hover:opacity-80 transition-colors w-[220px] sm:w-[260px]',
          isSaida ? 'bg-white/10 border-white/20' : 'bg-muted/50 border-border'
        )}
      >
        <div className={cn("p-2 rounded-md shrink-0", isSaida ? 'bg-white/20 text-white' : 'bg-background text-primary')}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className={cn('text-sm font-medium truncate', textCls)} title={label}>{label}</span>
          <span className={cn('text-[10px] uppercase tracking-wider', isSaida ? 'text-white/70' : 'text-muted-foreground')}>
            Arquivo
          </span>
        </div>
        <Download className={cn("h-4 w-4 shrink-0 opacity-70", textCls)} />
      </a>
    );
  }

  return <span className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</span>;
}

// --- Dialog nova conversa ---
function NovaConversaDialog({ open, onClose }: { open: boolean; onClose: (conversaId?: string) => void }) {
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const novaConversa = useWaNovaConversa();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!telefone.trim()) return;
    const conv = await novaConversa.mutateAsync({ telefone: telefone.trim(), nome_contato: nome.trim() || undefined });
    setTelefone('');
    setNome('');
    onClose(conv.id);
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nova conversa</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Telefone (com DDD)</Label>
            <Input placeholder="(84) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Nome (opcional)</Label>
            <Input placeholder="Nome do contato" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()}>Cancelar</Button>
            <Button type="submit" disabled={novaConversa.isPending || !telefone.trim()}>
              {novaConversa.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Iniciar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Dialog conexão WhatsApp ---
function ConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: config, refetch } = useWaConfig();
  const { provision, isPending: isProvisioning } = useWaProvision();
  const connect = useWaConnect();
  const syncStatus = useWaSyncStatus();
  const disconnect = useWaDisconnect();
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current!);
      setQr(null);
      setQrError('');
    }
  }, [open]);

  function startQrFlow(cfg: WaConfig) {
    setQr(null);
    setQrError('');
    connect.mutate(cfg, {
      onSuccess: ({ qr: qrData }) => {
        if (qrData) {
          setQr(qrData);
          clearInterval(intervalRef.current!);
          intervalRef.current = setInterval(async () => {
            const result = await syncStatus.mutateAsync(cfg).catch(() => null);
            if (result?.isConnected) {
              clearInterval(intervalRef.current!);
              setQr(null);
              toast.success('WhatsApp conectado com sucesso!');
            }
          }, 3000);
        } else {
          setQrError('QR code não disponível — a instância pode já estar conectada');
        }
      },
      onError: (err: any) => {
        setQrError(err?.message ?? 'Falha ao gerar QR code');
      },
    });
  }

  function handleConnect() {
    if (!config) return;
    startQrFlow(config);
  }

  async function handleAtivar() {
    setQrError('');
    try {
      await provision();
      const { data: freshConfig } = await refetch();
      if (freshConfig) startQrFlow(freshConfig);
    } catch {
      // erro já reportado via toast dentro de useWaProvision
    }
  }

  function handleDisconnect() {
    if (!config) return;
    clearInterval(intervalRef.current!);
    setQr(null);
    disconnect.mutate(config);
  }

  const isConnected = config?.status === 'connected';
  const isProvisioned = !!config && config.provisionada;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            WhatsApp
          </DialogTitle>
        </DialogHeader>

        {!isProvisioned ? (
          <div className="space-y-4 py-1">
            {isProvisioning ? (
              <div className="flex flex-col items-center gap-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                Criando sua instância WhatsApp...
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  Você ainda não tem uma instância de WhatsApp ativa.
                </p>
                <Button className="w-full" onClick={handleAtivar} disabled={isProvisioning}>
                  <Wifi className="h-4 w-4 mr-2" />
                  Ativar WhatsApp
                </Button>
              </div>
            )}
            {qrError && <p className="text-xs text-red-600 dark:text-red-400">{qrError}</p>}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Instância (somente leitura) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Instância</Label>
              <Input value={config.instance_name} readOnly disabled className="font-mono text-xs" />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status da conexão</span>
              <span className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium',
                isConnected
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {isConnected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>

            {/* QR code */}
            {connect.isPending && (
              <div className="flex flex-col items-center gap-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                Gerando QR code...
              </div>
            )}
            {qr && !connect.isPending && (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code WhatsApp"
                  className="w-52 h-52 border rounded-xl"
                />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando leitura no WhatsApp...
                </div>
              </div>
            )}
            {qrError && (
              <p className="text-xs text-red-600 dark:text-red-400">{qrError}</p>
            )}

            {/* Ações */}
            {!isConnected && (
              <Button
                className="w-full"
                variant="secondary"
                disabled={!config || connect.isPending}
                onClick={handleConnect}
              >
                {connect.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Wifi className="h-4 w-4 mr-2" />}
                {qr ? 'Atualizar QR code' : 'Conectar via QR code'}
              </Button>
            )}
            {isConnected && (
              <Button
                className="w-full"
                variant="outline"
                disabled={disconnect.isPending}
                onClick={handleDisconnect}
              >
                {disconnect.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <WifiOff className="h-4 w-4 mr-2" />}
                Desconectar
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Componente principal ---
export default function WhatsAppInbox() {
  const { data: conversas = [], isLoading: loadingConversas } = useWaConversas();
  const { data: config } = useWaConfig();
  const [conversaAtiva, setConversaAtiva] = useState<WaConversa | null>(null);
  const { data: mensagens = [], isLoading: loadingMensagens } = useWaMensagens(conversaAtiva?.id ?? null);
  const sendMessage = useWaSendMessage();
  const marcarLida = useWaMarcarLida();
  const limparConversa = useWaLimparConversa();
  const arquivarConversa = useWaArquivarConversa();
  const [confirmLimpar, setConfirmLimpar] = useState(false);

  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'aberto' | 'fechado'>('aberto');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'contatos' | 'empresa'>('todos');
  const [showConfig, setShowConfig] = useState(false);
  const [showNovaConversa, setShowNovaConversa] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<{ file: File; previewUrl: string | null }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = msgScrollRef.current?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null
      ?? msgScrollRef.current;
    if (viewport) {
      const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 150;
      if (isNearBottom || mensagens.length > 0) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [mensagens.length]);

  const scrollToBottom = () => {
    const viewport = msgScrollRef.current?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
    setShowScrollBottom(!isNearBottom);
  };

  useEffect(() => {
    if (conversaAtiva && conversaAtiva.nao_lidas > 0) marcarLida.mutate(conversaAtiva.id);
    inputRef.current?.focus();
  }, [conversaAtiva?.id]);

  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingImage) {
          setViewingImage(null);
        } else if (showConfig) {
          setShowConfig(false);
        } else if (showNovaConversa) {
          setShowNovaConversa(false);
        } else if (confirmLimpar) {
          setConfirmLimpar(false);
        } else if (conversaAtiva) {
          setConversaAtiva(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
    };
  }, [conversaAtiva, viewingImage, showConfig, showNovaConversa, confirmLimpar]);

  const conversasFiltradas = conversas.filter((c) => {
    if (filtroStatus === 'aberto' && c.arquivada) return false;
    if (filtroStatus === 'fechado' && !c.arquivada) return false;

    if (filtroTipo === 'empresa' && !c.cliente_id) return false;
    if (filtroTipo === 'contatos' && !c.contato_id) return false;

    if (!busca) return true;
    const term = busca.toLowerCase();
    return (c.nome_contato ?? '').toLowerCase().includes(term) || c.telefone.includes(term);
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const toAdd: { file: File; previewUrl: string | null }[] = [];
    for (const file of files) {
      if (file.size > 16 * 1024 * 1024) {
        toast.error(`${file.name}: limite de 16 MB excedido.`);
        continue;
      }
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      toAdd.push({ file, previewUrl });
    }
    if (toAdd.length > 0) setAttachments((prev) => [...prev, ...toAdd]);
    e.target.value = '';
    inputRef.current?.focus();
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const item = prev[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearAttachments() {
    setAttachments((prev) => {
      prev.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
        const previewUrl = URL.createObjectURL(blob);
        setAttachments((prev) => [...prev, { file, previewUrl }]);
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingSeconds(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = texto.trim();
    if (!msg && attachments.length === 0) return;
    if (!conversaAtiva) return;

    if (!config || config.status !== 'connected') {
      toast.error('WhatsApp desconectado. Verifique as configurações.');
      return;
    }

    const currentAttachments = attachments;
    setTexto('');
    clearAttachments();

    try {
      // Somente texto
      if (currentAttachments.length === 0) {
        await sendMessage.mutateAsync({
          telefone: conversaAtiva.telefone,
          mensagem: msg,
          conversa_id: conversaAtiva.id,
          tipo: 'texto',
        });
        return;
      }

      // Upload de todos os arquivos em paralelo
      setIsUploading(true);
      let uploadedUrls: string[];
      try {
        uploadedUrls = await Promise.all(
          currentAttachments.map((a) => uploadWaMedia(a.file, conversaAtiva.id))
        );
      } catch {
        toast.error('Erro ao fazer upload dos arquivos');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);

      // Envia um arquivo por vez (useMutation não suporta chamadas paralelas)
      for (let i = 0; i < currentAttachments.length; i++) {
        const { file } = currentAttachments[i];
        const tipo = tipoFromFile(file);
        const caption = i === 0 ? msg : '';
        const conteudo = caption || file.name || `[${tipo}]`;
        await sendMessage.mutateAsync({
          telefone: conversaAtiva.telefone,
          mensagem: conteudo,
          conversa_id: conversaAtiva.id,
          tipo,
          media_url: uploadedUrls[i],
          media_mime: file.type || null,
          nome_arquivo: file.name,
        });
      }
    } catch (err: any) {
      // onError do mutation já mostra toast e remove otimista; aqui só garantimos
      // que o estado não fique travado em caso de erro não capturado
      if (err?.message) toast.error(err.message);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }

  const isConnected = config?.status === 'connected';
  const isBusy = sendMessage.isPending || isUploading;

  const headerContent = (
    <div className="flex items-center gap-3">
      <MessageCircle className="h-5 w-5 text-green-600" />
      <div>
        <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight md:text-xl">WhatsApp</h1>
        <p className="text-[10px] sm:text-sm text-muted-foreground">Atendimento aos clientes via WhatsApp</p>
      </div>
    </div>
  );

  return (
    <AppLayout headerContent={headerContent} mainClassName="flex-1 overflow-hidden">
      <div className="flex h-full">
        {/* Sidebar de conversas */}
        {sidebarCollapsed ? (
          <div className="w-12 border-r border-border flex flex-col h-full shrink-0 items-center gap-1 transition-all duration-300">
            <div className="relative mt-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowNovaConversa(true)} title="Nova conversa">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 w-full pt-2">
              <div className="flex flex-col items-center gap-2 px-1">
                {conversasFiltradas.map((conv) => (
                  <div key={conv.id} className="relative">
                    <button
                      onClick={() => setConversaAtiva(conv)}
                      className={cn('p-1 rounded-lg transition-colors', conversaAtiva?.id === conv.id ? 'bg-primary/10' : 'hover:bg-muted/50')}
                      title={conv.nome_contato ?? formatPhone(conv.telefone)}
                    >
                      <Avatar className="h-7 w-7 border border-primary/10">
                        <AvatarFallback className={cn(colorForPhone(conv.telefone), 'text-white text-[8px] font-semibold')}>
                          {initials(conv.nome_contato, conv.telefone)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                    {conv.nao_lidas > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 text-[7px] font-bold text-white ring-1 ring-background">
                        {conv.nao_lidas > 9 ? '9+' : conv.nao_lidas}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-auto border-t border-border w-full flex justify-center py-2 h-[4rem] items-center bg-muted/30">
              <button onClick={() => setSidebarCollapsed(false)} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" title="Expandir conversas">
                <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-64 border-r border-border flex flex-col h-full shrink-0 transition-all duration-300">
            <div className="px-4 py-3 border-b border-border flex items-center h-[4rem]">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-1">
                <MessageCircle className="h-4 w-4 text-green-600" />
                Conversas
                {config && (
                  <span className={cn(
                    'flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto',
                    isConnected
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  )}>
                    {isConnected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                )}
              </h2>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground ml-1" onClick={() => setShowNovaConversa(true)} title="Nova conversa">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setShowConfig(true)} title="Configurações">
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-2 pt-2 border-b border-border bg-background space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 flex-1">
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('aberto')}
                    className={cn(
                      'flex-1 text-[11px] font-medium rounded-md py-1 transition-colors',
                      filtroStatus === 'aberto'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Em aberto
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroStatus('fechado')}
                    className={cn(
                      'flex-1 text-[11px] font-medium rounded-md py-1 transition-colors',
                      filtroStatus === 'fechado'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Fechado
                  </button>
                </div>
                <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}>
                  <SelectTrigger className="h-7 w-[88px] text-[11px] px-2 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="contatos">Contatos</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative pb-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:ring-1"
                  placeholder="Buscar conversa..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {loadingConversas ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : conversasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 px-4 text-center">
                    <MessageCircle className="h-8 w-8 opacity-30" />
                    {busca ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
                  </div>
                ) : (
                  conversasFiltradas.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setConversaAtiva(conv)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left',
                        conversaAtiva?.id === conv.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                      )}
                    >
                      <Avatar className="h-8 w-8 border border-primary/10">
                        <AvatarFallback className={cn(colorForPhone(conv.telefone), 'text-white text-[10px] font-semibold')}>
                          {initials(conv.nome_contato, conv.telefone)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className={cn('text-xs font-medium text-foreground truncate', conv.nao_lidas > 0 && 'font-bold')}>
                            {conv.nome_contato ?? formatPhone(conv.telefone)}
                          </p>
                          {conv.ultima_mensagem_at && (
                            <span className="text-[9px] text-muted-foreground shrink-0 font-medium">
                              {formatTime(conv.ultima_mensagem_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className="text-[10px] text-muted-foreground truncate">
                            {conv.ultima_mensagem ?? 'Nenhuma mensagem'}
                          </p>
                          {conv.nao_lidas > 0 && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-500 px-1 text-[9px] font-bold text-white shadow-sm">
                              {conv.nao_lidas > 99 ? '99+' : conv.nao_lidas}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="border-t border-border px-3 py-2 mt-auto bg-muted/30 h-[4rem] flex items-center">
              <button onClick={() => setSidebarCollapsed(true)} className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground" title="Recolher conversas">
                <PanelLeftClose className="h-4 w-4" />
                <span className="text-[10px]">Recolher</span>
              </button>
            </div>
          </div>
        )}

        {/* Área de mensagens */}
        <div className="flex-1 flex flex-col min-w-0">
          {conversaAtiva ? (
            <>
              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 h-[4rem]">
                <Avatar className="h-8 w-8 border border-primary/10">
                  <AvatarFallback className={cn(colorForPhone(conversaAtiva.telefone), 'text-white text-xs font-semibold')}>
                    {initials(conversaAtiva.nome_contato, conversaAtiva.telefone)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {conversaAtiva.nome_contato ?? formatPhone(conversaAtiva.telefone)}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {conversaAtiva.nome_contato ? formatPhone(conversaAtiva.telefone) : 'WhatsApp'}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => {
                      const phone = conversaAtiva.telefone.replace(/\D/g, '');
                      window.open(`https://wa.me/${phone}`, '_blank');
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Abrir no WhatsApp
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => {
                          const novaArquivada = !conversaAtiva.arquivada;
                          arquivarConversa.mutate({ conversaId: conversaAtiva.id, arquivada: novaArquivada });
                          if (
                            (novaArquivada && filtroStatus === 'aberto') ||
                            (!novaArquivada && filtroStatus === 'fechado')
                          ) {
                            setConversaAtiva(null);
                          }
                        }}
                      >
                        {conversaAtiva.arquivada
                          ? <ArchiveRestore className="h-4 w-4" />
                          : <Archive className="h-4 w-4" />}
                        {conversaAtiva.arquivada ? 'Reabrir conversa' : 'Marcar como fechada'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2"
                        onClick={() => setConfirmLimpar(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Limpar conversa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Confirmação de limpar conversa */}
                <AlertDialog open={confirmLimpar} onOpenChange={setConfirmLimpar}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todas as mensagens desta conversa serão apagadas permanentemente. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => limparConversa.mutate(conversaAtiva.id)}
                      >
                        {limparConversa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Limpar'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Mensagens */}
              <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
                <ScrollArea className="flex-1 px-4" onScroll={handleScroll}>
                  {loadingMensagens ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : mensagens.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 pt-16">
                      <MessageCircle className="h-12 w-12 opacity-30" />
                      <p className="text-sm">Nenhuma mensagem ainda. Comece a conversa!</p>
                    </div>
                  ) : (
                    <div className="py-4 space-y-1">
                      {mensagens.map((msg, i) => {
                        const isSaida = msg.direcao === 'saida';
                        const prevMsg = mensagens[i - 1];
                        const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
                        const isLast = i === mensagens.length - 1;

                        return (
                          <div key={msg.id} ref={isLast ? msgScrollRef : undefined}>
                            {showDate && (
                              <div className="flex items-center justify-center my-4">
                                <span className="text-[10px] bg-muted text-muted-foreground px-3 py-1 rounded-full">
                                  {isToday(new Date(msg.created_at))
                                    ? 'Hoje'
                                    : isYesterday(new Date(msg.created_at))
                                    ? 'Ontem'
                                    : format(new Date(msg.created_at), "d 'de' MMMM", { locale: ptBR })}
                                </span>
                              </div>
                            )}
                            <div className={cn('flex', isSaida ? 'justify-end' : 'justify-start', prevMsg?.direcao !== msg.direcao ? 'mt-3' : 'mt-0.5')}>
                              <div className={cn('max-w-[75%]', isSaida ? 'items-end' : 'items-start')}>
                                <div
                                  className={cn(
                                    msg.tipo === 'audio' ? 'p-0.5' : 'px-3 py-2',
                                    'break-words',
                                    isSaida
                                      ? 'bg-green-500 text-white rounded-2xl rounded-tr-sm'
                                      : 'bg-muted text-foreground rounded-2xl rounded-tl-sm'
                                  )}
                                >
                                  {!isSaida && msg.usuario && (
                                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5 ml-1">{msg.usuario.nome}</p>
                                  )}
                                  <MessageContent msg={msg} isSaida={isSaida} onImageClick={setViewingImage} conversaAtiva={conversaAtiva} />
                                </div>
                                <div className={cn('flex items-center gap-1 mt-0.5', isSaida ? 'justify-end mr-1' : 'justify-start ml-1')}>
                                  <span className="text-[9px] text-muted-foreground">
                                    {format(new Date(msg.created_at), 'HH:mm')}
                                  </span>
                                  {isSaida && <MessageStatus status={msg.status} />}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
                {showScrollBottom && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-4 right-8 rounded-full shadow-lg z-10 h-10 w-10 border border-border opacity-90 hover:opacity-100 transition-opacity"
                    onClick={scrollToBottom}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {/* Input de envio */}
              <div className="border-t border-border px-4 py-3">
                {!isConnected && config && (
                  <div className="mb-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 px-2">
                    <WifiOff className="h-3.5 w-3.5" />
                    WhatsApp desconectado —{' '}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:opacity-80"
                      onClick={() => setShowConfig(true)}
                    >
                      conectar via QR code
                    </button>
                  </div>
                )}
                {!config && (
                  <div className="mb-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 px-2">
                    <Settings className="h-3.5 w-3.5" />
                    Configure o uazapi para enviar mensagens
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setShowConfig(true)}>
                      Configurar
                    </Button>
                  </div>
                )}

                {/* Preview dos anexos */}
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div key={i} className="relative flex items-center gap-2 px-2 py-1.5 bg-muted/70 rounded-xl border border-border max-w-[200px]">
                        {a.previewUrl && tipoFromFile(a.file) === 'audio' ? (
                          <audio src={a.previewUrl} controls className="h-8 max-w-[160px]" />
                        ) : a.previewUrl ? (
                          <img src={a.previewUrl} alt="preview" className="h-10 w-10 object-cover rounded-lg shrink-0" />
                        ) : (
                          <div className="h-9 w-9 flex items-center justify-center bg-background rounded-lg shrink-0 border border-border">
                            <AttachmentIcon tipo={tipoFromFile(a.file)} className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        {!a.previewUrl && (
                          <p className="text-xs truncate max-w-[90px]">{a.file.name}</p>
                        )}
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80"
                          onClick={() => removeAttachment(i)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-center">
                  {/* Input oculto de arquivo */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.rar,.txt"
                    multiple
                    onChange={handleFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy || isRecording}
                    title="Anexar arquivo"
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  {/* Botão de gravação de áudio */}
                  <Button
                    type="button"
                    variant={isRecording ? 'destructive' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={toggleRecording}
                    disabled={isBusy}
                    title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                  >
                    {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-sm text-red-600 dark:text-red-400 font-mono">
                        {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-red-500/70">Gravando...</span>
                    </div>
                  ) : (
                    <Input
                      ref={inputRef}
                      className="flex-1"
                      placeholder={attachments.length > 0 ? 'Legenda (opcional)...' : isConnected ? 'Digite uma mensagem...' : 'WhatsApp desconectado'}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isBusy}
                      autoFocus
                    />
                  )}
                  <Button
                    onClick={handleSend}
                    size="icon"
                    className="bg-green-500 hover:bg-green-600 text-white shrink-0"
                    disabled={(!texto.trim() && attachments.length === 0) || isBusy || isRecording}
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <MessageCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">WhatsApp CRM</p>
                <p className="text-sm mt-1">Selecione uma conversa para começar</p>
              </div>
              {!config && (
                <Button variant="outline" onClick={() => setShowConfig(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar uazapi
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <NovaConversaDialog
        open={showNovaConversa}
        onClose={(id) => {
          setShowNovaConversa(false);
          if (id) {
            const conv = conversas.find((c) => c.id === id);
            if (conv) setConversaAtiva(conv);
          }
        }}
      />
      <ConfigDialog open={showConfig} onClose={() => setShowConfig(false)} />

      <Dialog open={!!viewingImage} onOpenChange={(open) => !open && setViewingImage(null)}>
        <DialogContent className="max-w-5xl bg-transparent border-none shadow-none p-0 flex items-center justify-center [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualizar Imagem</DialogTitle>
          </DialogHeader>
          {viewingImage && (
            <div className="relative max-h-[90vh] max-w-full flex items-center justify-center p-4">
              <img src={viewingImage} alt="Visualização" className="max-h-[90vh] w-auto max-w-full object-contain rounded-lg shadow-2xl" />
              <Button
                variant="outline"
                size="icon"
                className="fixed top-4 right-4 sm:top-6 sm:right-6 rounded-full bg-white text-black hover:bg-gray-200 hover:scale-105 transition-all z-[1200] h-10 w-10 sm:h-12 sm:w-12 border border-black/10 shadow-2xl"
                onClick={() => setViewingImage(null)}
              >
                <X className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import {
  useWaConversas,
  useWaMensagens,
  useWaSendMessage,
  useWaMarcarLida,
  useWaConfig,
  useWaNovaConversa,
  useWaCriarGrupo,
  useWaLimparConversa,
  useWaArquivarConversa,
  useWaDeletarConversa,
  useWaDeletarConversasEmMassa,
  useWaSetResponsaveis,
  useWaConnect,
  useWaSyncStatus,
  useWaDisconnect,
  useWaProvision,
  useWaFetchContactPhoto,
  useWaFetchGroupParticipantes,
  useWaParticipantePhoto,
  useWaInstancias,
  uploadWaMedia,
  type WaConversa,
  type WaMensagem,
  type WaMidiaTipo,
  type WaConfig,
} from "@/hooks/use-whatsapp-inbox";
import { useVendedores } from "@/hooks/use-clientes";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterButton } from "@/components/FilterButton";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FilePreviewDialog, isPreviewable, type FilePreviewTarget } from "@/components/FilePreviewDialog";
import { Label } from "@/components/ui/label";
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
  Eraser,
  Archive,
  ArchiveRestore,
  CheckSquare,
  UserPlus,
  Users,
  User,
  ExternalLink,
  Building2,
  CalendarDays,
  Mail,
  Link2,
  Smartphone,
  UserCheck,
  UserX,
  List,
  type LucideIcon,
} from "lucide-react";
import {
  format,
  isToday,
  isYesterday,
  subDays,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, autoResizeTextarea } from "@/lib/utils";
import { toast } from "sonner";

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11)
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10)
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function colorForPhone(phone: string) {
  const colors = [
    "bg-green-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-cyan-500",
    "bg-blue-500",
    "bg-indigo-500",
  ];
  let hash = 0;
  for (const c of phone) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

function hashSeed(seed: string) {
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return hash;
}

// Paleta ampla: usada sobre a bolha escura/neutra das mensagens recebidas.
const INCOMING_NAME_COLORS = [
  "text-amber-400",
  "text-sky-400",
  "text-pink-400",
  "text-violet-400",
  "text-orange-400",
  "text-cyan-400",
  "text-rose-400",
  "text-fuchsia-400",
];

function senderNameColor(seed: string) {
  return INCOMING_NAME_COLORS[hashSeed(seed) % INCOMING_NAME_COLORS.length];
}

function roleLabel(role: string | null | undefined) {
  if (role === "empresa") return "Principal";
  if (role === "gestor") return "Gestor";
  if (role === "admin") return "Admin";
  if (role === "vendedor") return "Vendedor";
  return role ?? null;
}

function UserPreviewPopover({
  usuario,
  nameClassName,
}: {
  usuario: NonNullable<WaMensagem["usuario"]>;
  nameClassName: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            nameClassName,
            "text-left hover:underline underline-offset-2 cursor-pointer",
          )}
        >
          {usuario.nome}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-border/60">
            <AvatarImage src={usuario.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials(usuario.nome, "")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{usuario.nome}</p>
            {roleLabel(usuario.role) && (
              <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {roleLabel(usuario.role)}
              </span>
            )}
          </div>
        </div>
        {(usuario.email || usuario.telefone) && (
          <div className="mt-3 space-y-1.5">
            {usuario.email && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{usuario.email}</span>
              </div>
            )}
            {usuario.telefone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {formatPhone(usuario.telefone)}
                </span>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ContactPreviewPopover({
  conversa,
  nameClassName,
  remetenteNome,
  remetenteTelefone,
}: {
  conversa: WaConversa;
  nameClassName: string;
  // Em grupos, quem enviou aquela mensagem específica (participante), não o grupo.
  remetenteNome?: string | null;
  remetenteTelefone?: string | null;
}) {
  const isParticipante =
    conversa.is_group && (remetenteNome || remetenteTelefone);
  const nome = isParticipante ? remetenteNome : conversa.nome_contato;
  const telefone = isParticipante
    ? (remetenteTelefone ?? conversa.telefone)
    : conversa.telefone;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            nameClassName,
            isParticipante && senderNameColor(telefone),
            "text-left hover:underline underline-offset-2 cursor-pointer",
          )}
        >
          {nome || formatPhone(telefone)}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-border/60">
            {!isParticipante && (
              <AvatarImage src={conversa.foto_perfil_url ?? undefined} />
            )}
            <AvatarFallback
              className={cn(
                colorForPhone(telefone),
                "text-white font-semibold",
              )}
            >
              {initials(nome, telefone)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {nome || "Sem nome salvo"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {formatPhone(telefone)}
            </p>
          </div>
        </div>
        {!isParticipante && conversa.cliente_id && (
          <Badge variant="outline" className="mt-3 gap-1 text-[11px]">
            <Building2 className="h-3 w-3" />
            Cliente cadastrado
          </Badge>
        )}
      </PopoverContent>
    </Popover>
  );
}

function initials(nome: string | null, telefone: string) {
  if (nome) {
    const parts = nome.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return telefone.replace(/\D/g, "").slice(-2);
}

// Avatar de um participante de grupo (não é usuário do CRM, então busca a foto de
// perfil sob demanda por telefone — cacheada no back-end — em vez de já vir pronta
// na conversa).
function ParticipanteAvatar({
  nome,
  telefone,
  className,
}: {
  nome: string | null;
  telefone: string;
  className?: string;
}) {
  const { data: fotoUrl } = useWaParticipantePhoto(telefone);
  return (
    <Avatar className={className}>
      {fotoUrl && <AvatarImage src={fotoUrl} alt="" />}
      <AvatarFallback
        className={cn(
          colorForPhone(telefone),
          "text-white text-[9px] font-semibold",
        )}
      >
        {initials(nome, telefone)}
      </AvatarFallback>
    </Avatar>
  );
}

// Avatar principal da conversa na sidebar: foto/iniciais do contato, ou a foto/ícone
// do grupo quando for uma conversa em grupo.
function ConversaAvatar({ conv }: { conv: WaConversa }) {
  if (conv.is_group) {
    return (
      <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
        {conv.foto_perfil_url && (
          <AvatarImage src={conv.foto_perfil_url} alt="" />
        )}
        <AvatarFallback
          className={cn(colorForPhone(conv.telefone), "text-white")}
        >
          <Users className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
    );
  }
  return (
    <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
      {conv.foto_perfil_url && (
        <AvatarImage src={conv.foto_perfil_url} alt="" />
      )}
      <AvatarFallback
        className={cn(
          colorForPhone(conv.telefone),
          "text-white text-[10px] font-semibold",
        )}
      >
        {initials(conv.nome_contato, conv.telefone)}
      </AvatarFallback>
    </Avatar>
  );
}

// Stack de avatares dos atendentes atribuídos (responsáveis pelo atendimento no
// CRM), exibido à direita da linha da conversa — mesmo em grupos, mostra só os
// responsáveis, não os participantes do WhatsApp. Mostra no máximo 3 avatares;
// acima disso mostra um indicador "+N". `spacing="overlap"` (padrão, usado na
// lista lateral) sobrepõe os avatares; `spacing="gap"` (usado no header da
// conversa) mostra cada um separado, sem colar um no outro.
function ConversaParticipantesStack({
  conv,
  spacing = "overlap",
}: {
  conv: WaConversa;
  spacing?: "overlap" | "gap";
}) {
  const membros = (conv.responsaveis ?? []).map((r) => ({
    nome: r.nome,
    chave: r.id,
    foto: r.avatar_url,
  }));
  if (membros.length === 0) return null;

  const visiveis = membros.slice(0, 3);
  const restantes = membros.length - visiveis.length;
  const overlap = spacing === "overlap";

  return (
    <div
      className={cn(
        "flex overflow-hidden shrink-0",
        overlap ? "-space-x-2" : "gap-1.5",
      )}
    >
      {visiveis.map((m, i) => (
        <Avatar
          key={`${m.chave}-${i}`}
          className={cn(
            "inline-block h-5 w-5 rounded-full",
            overlap && "ring-2 ring-background",
          )}
        >
          {m.foto && <AvatarImage src={m.foto} alt="" />}
          <AvatarFallback
            className={cn(
              colorForPhone(m.chave),
              "text-white text-[7px] font-semibold",
            )}
          >
            {initials(m.nome, m.chave)}
          </AvatarFallback>
        </Avatar>
      ))}
      {restantes > 0 && (
        <Avatar
          className={cn(
            "inline-block h-5 w-5 rounded-full",
            overlap && "ring-2 ring-background",
          )}
        >
          <AvatarFallback className="bg-muted text-muted-foreground text-[7px] font-semibold">
            +{restantes}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// Cabeçalho de seção na sidebar de conversas, separando visualmente por instância
// WhatsApp (apelido) ou por responsável ("Meus chats" / "Não atribuídos").
function ConversaGroupHeader({
  label,
  icon: Icon = Smartphone,
  count,
}: {
  label: string;
  icon?: LucideIcon;
  count?: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-orange-500 px-3 pt-3 pb-1 text-white first:pt-1">
      <Icon className="h-3 w-3 text-white/80 shrink-0" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/90 truncate">
        {label}
      </p>
      <div className="flex-1 border-t border-white/30" />
      {typeof count === "number" && (
        <span className="text-[10px] font-bold tabular-nums text-white/90 shrink-0">
          {count}
        </span>
      )}
    </div>
  );
}

// Aba "Meus chats": lista espaçosa (sem o painel de mensagens ao lado) só com
// as conversas atribuídas ao usuário logado.
function MeusChatsList({
  conversas,
  apelidoPorInstanciaId,
  onOpen,
}: {
  conversas: WaConversa[];
  apelidoPorInstanciaId: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  if (conversas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <UserCheck className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          Nenhuma conversa atribuída a você
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Conversas que você assumir ou que forem direcionadas para você
          aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border">
        {conversas.map((conv) => {
          const apelidoInstancia = conv.instancia_id
            ? apelidoPorInstanciaId.get(conv.instancia_id)
            : undefined;
          return (
            <button
              key={conv.id}
              onClick={() => onOpen(conv.id)}
              className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <ConversaAvatar conv={conv} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "truncate text-sm font-medium text-foreground",
                      conv.nao_lidas > 0 && "font-bold",
                    )}
                  >
                    {conv.nome_contato ?? formatPhone(conv.telefone)}
                  </p>
                  {conv.arquivada && (
                    <Badge
                      variant="secondary"
                      className="h-4 shrink-0 px-1.5 py-0 text-[9px]"
                    >
                      Arquivada
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {conv.ultima_mensagem ?? "Nenhuma mensagem"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <ConversaParticipantesStack conv={conv} />
                  {conv.nao_lidas > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                      {conv.nao_lidas > 99 ? "99+" : conv.nao_lidas}
                    </span>
                  )}
                </div>
                {conv.ultima_mensagem_at && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {formatTime(conv.ultima_mensagem_at)}
                  </span>
                )}
                {apelidoInstancia && (
                  <Badge
                    variant="outline"
                    className="h-4 max-w-[88px] truncate px-1.5 py-0 text-[9px] font-medium leading-none text-muted-foreground"
                  >
                    <span className="truncate">{apelidoInstancia}</span>
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

function tipoFromFile(file: File): WaMidiaTipo {
  if (file.type.startsWith("image/")) return "imagem";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "documento";
}

function AttachmentIcon({
  tipo,
  className,
}: {
  tipo: WaMidiaTipo;
  className?: string;
}) {
  if (tipo === "imagem") return <ImageIcon className={className} />;
  if (tipo === "audio") return <Music className={className} />;
  if (tipo === "video") return <Video className={className} />;
  return <FileText className={className} />;
}

function MessageStatus({ status }: { status: string }) {
  // Só é renderizado em mensagens enviadas (bolha laranja), por isso os tons
  // padrão são brancos translúcidos — só "lido" usa azul, como no WhatsApp.
  if (status === "enviando") return <Clock className="h-3 w-3 text-white/70" />;
  if (status === "enviado") return <Check className="h-3 w-3 text-white/70" />;
  if (status === "entregue")
    return <CheckCheck className="h-3 w-3 text-white/70" />;
  if (status === "lido")
    return <CheckCheck className="h-3 w-3 text-blue-300" />;
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

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  const formatAudioTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
    30, 45, 20, 60, 40, 75, 30, 50, 80, 35, 25, 45, 65, 55, 35, 70, 45, 25, 50,
    40, 65, 30, 20, 45, 55, 40, 30, 50, 45, 35,
  ];

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
            : "bg-black/5 hover:bg-black/10 text-foreground border border-black/5",
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
                      ? isSaida
                        ? "bg-white"
                        : "bg-sky-500"
                      : isSaida
                        ? "bg-white/30"
                        : "bg-gray-300 dark:bg-zinc-650",
                  )}
                  style={{ height: `${heightPercent}%` }}
                />
              );
            })}
          </div>

          <div
            className={cn(
              "absolute w-2.5 h-2.5 rounded-full shadow-md -ml-1.5 transition-transform",
              isSaida ? "bg-white" : "bg-sky-500",
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
    </div>
  );
}

const PLACEHOLDERS = [
  "[Imagem]",
  "[Áudio]",
  "[Vídeo]",
  "[Documento]",
  "[Sticker]",
];

function MessageContent({
  msg,
  isSaida,
  onImageClick,
  onPreviewFile,
  conversaAtiva,
}: {
  msg: WaMensagem;
  isSaida: boolean;
  onImageClick?: (url: string) => void;
  onPreviewFile?: (file: FilePreviewTarget) => void;
  conversaAtiva: WaConversa;
}) {
  const textCls = isSaida ? "text-white" : "text-foreground";

  if (msg.tipo === "imagem" && msg.media_url) {
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
              window.open(msg.media_url!, "_blank");
            }
          }}
        />
        {msg.conteudo && !PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn("text-sm mt-1.5 px-2 pb-0.5", textCls)}>
            {msg.conteudo}
          </p>
        )}
      </div>
    );
  }

  if (msg.tipo === "audio" && msg.media_url) {
    return (
      <WaAudioPlayer
        src={msg.media_url}
        isSaida={isSaida}
        conversaAtiva={conversaAtiva}
        msg={msg}
      />
    );
  }

  if (msg.tipo === "video" && msg.media_url) {
    return (
      <div className="flex flex-col -mx-2 -mt-1 -mb-1 max-w-[240px] sm:max-w-[280px]">
        <video
          controls
          src={msg.media_url}
          className="w-full rounded-[14px] shadow-sm bg-black/10"
        />
        {msg.conteudo && !PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn("text-sm mt-1.5 px-2 pb-0.5", textCls)}>
            {msg.conteudo}
          </p>
        )}
      </div>
    );
  }

  if (msg.tipo === "documento" && msg.media_url) {
    const label = !PLACEHOLDERS.includes(msg.conteudo)
      ? msg.conteudo
      : "Documento anexado";
    const previewable = onPreviewFile && isPreviewable(label, msg.media_mime);
    const sharedClassName = cn(
      "flex items-center gap-3 p-2.5 rounded-lg border hover:opacity-80 transition-colors w-[220px] sm:w-[260px]",
      isSaida ? "bg-white/10 border-white/20" : "bg-muted/50 border-border",
    );
    const content = (
      <>
        <div
          className={cn(
            "p-2 rounded-md shrink-0",
            isSaida ? "bg-white/20 text-white" : "bg-background text-primary",
          )}
        >
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className={cn("text-sm font-medium truncate", textCls)}
            title={label}
          >
            {label}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider",
              isSaida ? "text-white/70" : "text-muted-foreground",
            )}
          >
            Arquivo
          </span>
        </div>
        <Download className={cn("h-4 w-4 shrink-0 opacity-70", textCls)} />
      </>
    );

    if (previewable) {
      return (
        <button
          type="button"
          className={sharedClassName}
          onClick={() => onPreviewFile!({ url: msg.media_url!, nome: label, mime: msg.media_mime })}
        >
          {content}
        </button>
      );
    }

    return (
      <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className={sharedClassName}>
        {content}
      </a>
    );
  }

  return (
    <span className="text-sm whitespace-pre-wrap break-words">
      {msg.conteudo}
      <span
        className={cn(
          "float-right flex items-center gap-1 select-none ml-2 mt-1 translate-y-0.5",
          isSaida ? "text-white/70" : "text-muted-foreground",
        )}
      >
        <span className="text-[9px]">
          {format(new Date(msg.created_at), "HH:mm")}
        </span>
        {isSaida && <MessageStatus status={msg.status} />}
      </span>
    </span>
  );
}

// --- Player de confirmação de áudio gravado ---
function PendingAudioPlayer({
  src,
  onCancel,
  onSend,
  isSending,
}: {
  src: string;
  onCancel: () => void;
  onSend: () => void;
  isSending: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const totalBars = 30;
  const heights = [
    30, 45, 20, 60, 40, 75, 30, 50, 80, 35, 25, 45, 65, 55, 35, 70, 45, 25, 50,
    40, 65, 30, 20, 45, 55, 40, 30, 50, 45, 35,
  ];
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      if (audio.duration && !isNaN(audio.duration)) setDuration(audio.duration);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const formatT = (t: number) => {
    if (isNaN(t) || !isFinite(t)) return "0:00";
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime =
      Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * duration;
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border bg-muted/60">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Cancelar */}
      <button
        type="button"
        onClick={onCancel}
        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-destructive hover:bg-destructive/10 transition-colors"
        title="Descartar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* Play/Pause */}
      <button
        type="button"
        onClick={() =>
          isPlaying ? audioRef.current?.pause() : audioRef.current?.play()
        }
        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm"
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 fill-current" />
        ) : (
          <Play className="h-3 w-3 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform + tempo */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div
          onClick={handleScrub}
          className="relative flex-1 h-5 flex items-center cursor-pointer"
        >
          <div className="flex items-end gap-[2px] w-full h-3.5 justify-between">
            {Array.from({ length: totalBars }).map((_, i) => {
              const barProgress = (i / totalBars) * 100;
              const isPlayed = progress >= barProgress;
              return (
                <div
                  key={i}
                  className={cn(
                    "w-[3px] rounded-full transition-all duration-150",
                    isPlayed ? "bg-green-500" : "bg-muted-foreground/25",
                  )}
                  style={{ height: `${heights[i % heights.length]}%` }}
                />
              );
            })}
          </div>
          <div
            className="absolute w-2 h-2 rounded-full bg-green-500 shadow-md -ml-1"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatT(currentTime || duration)}
        </span>
      </div>

      {/* Enviar */}
      <button
        type="button"
        onClick={onSend}
        disabled={isSending}
        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white transition-colors shadow-sm"
        title="Enviar áudio"
      >
        {isSending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// --- Dialog nova conversa ---
function NovaConversaDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (conversaId?: string) => void;
}) {
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const novaConversa = useWaNovaConversa();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!telefone.trim()) return;
    const conv = await novaConversa.mutateAsync({
      telefone: telefone.trim(),
      nome_contato: nome.trim() || undefined,
    });
    setTelefone("");
    setNome("");
    onClose(conv.id);
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Telefone (com DDD)</Label>
            <Input
              placeholder="(84) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome (opcional)</Label>
            <Input
              placeholder="Nome do contato"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={novaConversa.isPending || !telefone.trim()}
            >
              {novaConversa.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Iniciar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Dialog criar grupo ---
function CriarGrupoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (conversaId?: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [participantes, setParticipantes] = useState<string[]>([""]);
  const criarGrupo = useWaCriarGrupo();

  function resetAndClose(conversaId?: string) {
    setNome("");
    setParticipantes([""]);
    onClose(conversaId);
  }

  function updateParticipante(index: number, value: string) {
    setParticipantes((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function removerParticipante(index: number) {
    setParticipantes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lista = participantes.map((p) => p.trim()).filter(Boolean);
    if (!nome.trim() || lista.length === 0) return;
    const conv = await criarGrupo.mutateAsync({
      nome: nome.trim(),
      participantes: lista,
    });
    resetAndClose(conv.id);
  }

  const listaValida = participantes.some((p) => p.trim());

  return (
    <Dialog open={open} onOpenChange={() => resetAndClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do grupo</Label>
            <Input
              placeholder="Ex: Equipe de Obras"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Participantes (com DDD)</Label>
            <div className="space-y-2">
              {participantes.map((valor, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    placeholder="(84) 99999-9999"
                    value={valor}
                    onChange={(e) => updateParticipante(i, e.target.value)}
                  />
                  {participantes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removerParticipante(i)}
                      title="Remover"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setParticipantes((prev) => [...prev, ""])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar participante
            </Button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => resetAndClose()}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={criarGrupo.isPending || !nome.trim() || !listaValida}
            >
              {criarGrupo.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Criar grupo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Dialog conexão WhatsApp ---
function ConfigDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: config, refetch } = useWaConfig();
  const { provision, isPending: isProvisioning } = useWaProvision();
  const connect = useWaConnect();
  const syncStatus = useWaSyncStatus();
  const disconnect = useWaDisconnect();
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current!);
      setQr(null);
      setQrError("");
    }
  }, [open]);

  function startQrFlow(cfg: WaConfig) {
    setQr(null);
    setQrError("");
    connect.mutate(cfg, {
      onSuccess: ({ qr: qrData, alreadyConnected }) => {
        if (qrData) {
          setQr(qrData);
          clearInterval(intervalRef.current!);
          intervalRef.current = setInterval(async () => {
            const result = await syncStatus.mutateAsync(cfg).catch(() => null);
            if (result?.isConnected) {
              clearInterval(intervalRef.current!);
              setQr(null);
              toast.success("WhatsApp conectado com sucesso!");
            }
          }, 3000);
        } else if (alreadyConnected) {
          // Instância já está logada na uazapi — não há QR a gerar.
          // Sincroniza o status local em vez de mostrar um erro genérico.
          syncStatus.mutate(cfg, {
            onSuccess: () =>
              toast.success(
                "WhatsApp já estava conectado — status atualizado.",
              ),
          });
        } else {
          setQrError(
            "A uazapi não retornou um QR code. Tente novamente em alguns segundos.",
          );
        }
      },
      onError: (err: any) => {
        setQrError(err?.message ?? "Falha ao gerar QR code");
      },
    });
  }

  function handleConnect() {
    if (!config) return;
    startQrFlow(config);
  }

  async function handleAtivar() {
    setQrError("");
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

  const isConnected = config?.status === "connected";
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
                <Button
                  className="w-full"
                  onClick={handleAtivar}
                  disabled={isProvisioning}
                >
                  <Wifi className="h-4 w-4 mr-2" />
                  Ativar WhatsApp
                </Button>
              </div>
            )}
            {qrError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {qrError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-1">
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
                  src={
                    qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`
                  }
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
              <p className="text-xs text-red-600 dark:text-red-400">
                {qrError}
              </p>
            )}

            {/* Ações */}
            {!isConnected && (
              <Button
                className="w-full"
                variant="secondary"
                disabled={!config || connect.isPending}
                onClick={handleConnect}
              >
                {connect.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4 mr-2" />
                )}
                {qr ? "Atualizar QR code" : "Conectar via QR code"}
              </Button>
            )}
            {isConnected && (
              <Button
                className="w-full"
                variant="outline"
                disabled={disconnect.isPending}
                onClick={handleDisconnect}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <WifiOff className="h-4 w-4 mr-2" />
                )}
                Desconectar
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Sheet de resumo do lead com responsáveis ---
function LeadSheet({
  conversa,
  participantesGrupo,
  open,
  onOpenChange,
  onImageClick,
  onPreviewFile,
}: {
  conversa: WaConversa;
  participantesGrupo: { nome: string | null; telefone: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImageClick: (url: string) => void;
  onPreviewFile: (file: FilePreviewTarget) => void;
}) {
  const navigate = useNavigate();
  const { data: vendedores = [] } = useVendedores();
  const setResponsaveis = useWaSetResponsaveis();
  const { data: mensagens = [] } = useWaMensagens(conversa.id);
  const atuais = conversa.responsaveis ?? [];
  const atuaisIds = useMemo(
    () => new Set(atuais.map((r) => r.id)),
    [atuais],
  );
  const [addResponsavelOpen, setAddResponsavelOpen] = useState(false);
  const [buscaResponsavel, setBuscaResponsavel] = useState("");
  const vendedoresDisponiveis = useMemo(() => {
    const disponiveis = vendedores.filter((v) => !atuaisIds.has(v.id));
    if (!buscaResponsavel.trim()) return disponiveis;
    const termo = buscaResponsavel.trim().toLowerCase();
    return disponiveis.filter((v) => v.nome.toLowerCase().includes(termo));
  }, [vendedores, atuaisIds, buscaResponsavel]);

  const midia = useMemo(() => {
    const imagens = mensagens.filter((m) => m.tipo === "imagem" && m.media_url);
    const videos = mensagens.filter((m) => m.tipo === "video" && m.media_url);
    const documentos = mensagens.filter((m) => m.tipo === "documento" && m.media_url);

    const urlRegex = /https?:\/\/[^\s]+/g;
    const links: { id: string; url: string; created_at: string }[] = [];
    for (const m of mensagens) {
      if (!m.conteudo) continue;
      const matches = m.conteudo.match(urlRegex);
      if (!matches) continue;
      matches.forEach((raw, i) => {
        const url = raw.replace(/[.,;:!?)\]]+$/, "");
        links.push({ id: `${m.id}-${i}`, url, created_at: m.created_at });
      });
    }

    return { imagens, videos, documentos, links };
  }, [mensagens]);

  const [expandedMediaTab, setExpandedMediaTab] = useState<
    "imagens" | "videos" | "documentos" | "links" | null
  >(null);

  const MEDIA_PREVIEW_LIMIT = 3;

  const renderImagens = (items: typeof midia.imagens) => (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((m) => (
        <button
          key={m.id}
          type="button"
          className="aspect-square rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity"
          onClick={() => onImageClick(m.media_url!)}
          title={format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        >
          <img src={m.media_url!} alt="imagem" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );

  const renderVideos = (items: typeof midia.videos) => (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((m) => (
        <button
          key={m.id}
          type="button"
          className="relative aspect-square rounded-md overflow-hidden border border-border bg-black/5 hover:opacity-80 transition-opacity"
          onClick={() => window.open(m.media_url!, "_blank", "noopener,noreferrer")}
          title={format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        >
          <video src={m.media_url!} className="h-full w-full object-cover" muted />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="h-5 w-5 text-white fill-white" />
          </span>
        </button>
      ))}
    </div>
  );

  const renderDocumentos = (items: typeof midia.documentos) => (
    <ul className="space-y-1.5">
      {items.map((m) => {
        const label = !PLACEHOLDERS.includes(m.conteudo) ? m.conteudo : "Documento anexado";
        const previewable = isPreviewable(label, m.media_mime);
        return (
          <li key={m.id}>
            <div
              className={cn(
                "flex items-center gap-2.5 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors",
                previewable && "cursor-pointer",
              )}
              onClick={
                previewable
                  ? () => onPreviewFile({ url: m.media_url!, nome: label, mime: m.media_mime })
                  : undefined
              }
            >
              <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" title={label}>
                  {label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(m.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                </p>
              </div>
              <a
                href={m.media_url!}
                download={label}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const renderLinks = (items: typeof midia.links) => (
    <ul className="space-y-1.5">
      {items.map((l) => {
        let host = l.url;
        try {
          host = new URL(l.url).hostname.replace(/^www\./, "");
        } catch {
          // mantém a URL bruta se não for parseável
        }
        return (
          <li key={l.id}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
                <Link2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" title={l.url}>
                  {host}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{l.url}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
          </li>
        );
      })}
    </ul>
  );

  const MEDIA_TAB_LABELS: Record<"imagens" | "videos" | "documentos" | "links", string> = {
    imagens: "Imagens",
    videos: "Vídeos",
    documentos: "Documentos",
    links: "Links",
  };

  const { data: cliente } = useQuery({
    queryKey: ["wa_lead_cliente", conversa.cliente_id],
    enabled: !!conversa.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, empresa, slug, email, telefone")
        .eq("id", conversa.cliente_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contato } = useQuery({
    queryKey: ["wa_lead_contato", conversa.contato_id],
    enabled: !!conversa.contato_id && !conversa.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, nome, email, telefone, slug")
        .eq("id", conversa.contato_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  function toggle(uid: string) {
    const novosIds = atuaisIds.has(uid)
      ? atuais.filter((r) => r.id !== uid).map((r) => r.id)
      : [...atuais.map((r) => r.id), uid];
    setResponsaveis.mutate({ conversaId: conversa.id, usuarioIds: novosIds });
  }

  const displayName = conversa.nome_contato ?? formatPhone(conversa.telefone);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 py-5 border-b">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-primary/10">
              <AvatarFallback
                className={cn(
                  colorForPhone(conversa.telefone),
                  "text-white text-sm font-semibold",
                )}
              >
                {initials(conversa.nome_contato, conversa.telefone)}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-base font-bold leading-tight">
                {displayName}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {formatPhone(conversa.telefone)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Dados do cliente/contato vinculado */}
          {(cliente || contato) && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Dados do lead
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {cliente && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" /> Empresa
                    </Label>
                    <button
                      className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
                      onClick={() => {
                        navigate(`/clientes/${cliente.slug ?? cliente.id}`);
                        onOpenChange(false);
                      }}
                    >
                      {cliente.empresa}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </button>
                  </div>
                )}
                {contato && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Contato
                    </Label>
                    <button
                      className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
                      onClick={() => {
                        navigate(`/contatos/${contato.slug ?? contato.id}`);
                        onOpenChange(false);
                      }}
                    >
                      {contato.nome}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </button>
                  </div>
                )}
                {(cliente?.email || contato?.email) && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      E-mail
                    </Label>
                    <p className="text-sm font-medium break-all">
                      {cliente?.email ?? contato?.email}
                    </p>
                  </div>
                )}
              </div>
              <Separator />
            </div>
          )}

          {/* Data de início da conversa */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Conversa
            </p>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" /> Início
              </Label>
              <p className="text-sm font-medium">
                {format(
                  new Date(conversa.created_at),
                  "dd/MM/yyyy 'às' HH:mm",
                  { locale: ptBR },
                )}
              </p>
            </div>
          </div>

          <Separator />

          {/* Mídia, links e documentos */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Mídia, links e documentos
            </p>
            <Tabs defaultValue="imagens" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="imagens" className="text-[10px] px-1">
                  Imagens{midia.imagens.length > 0 && ` (${midia.imagens.length})`}
                </TabsTrigger>
                <TabsTrigger value="videos" className="text-[10px] px-1">
                  Vídeos{midia.videos.length > 0 && ` (${midia.videos.length})`}
                </TabsTrigger>
                <TabsTrigger value="documentos" className="text-[10px] px-1">
                  Docs{midia.documentos.length > 0 && ` (${midia.documentos.length})`}
                </TabsTrigger>
                <TabsTrigger value="links" className="text-[10px] px-1">
                  Links{midia.links.length > 0 && ` (${midia.links.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="imagens" className="mt-3">
                {midia.imagens.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhuma imagem trocada nesta conversa.
                  </p>
                ) : (
                  <>
                    {renderImagens(midia.imagens.slice(0, MEDIA_PREVIEW_LIMIT))}
                    {midia.imagens.length > MEDIA_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedMediaTab("imagens")}
                      >
                        +{midia.imagens.length - MEDIA_PREVIEW_LIMIT} mais
                      </button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="videos" className="mt-3">
                {midia.videos.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhum vídeo trocado nesta conversa.
                  </p>
                ) : (
                  <>
                    {renderVideos(midia.videos.slice(0, MEDIA_PREVIEW_LIMIT))}
                    {midia.videos.length > MEDIA_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedMediaTab("videos")}
                      >
                        +{midia.videos.length - MEDIA_PREVIEW_LIMIT} mais
                      </button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="documentos" className="mt-3">
                {midia.documentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhum documento trocado nesta conversa.
                  </p>
                ) : (
                  <>
                    {renderDocumentos(midia.documentos.slice(0, MEDIA_PREVIEW_LIMIT))}
                    {midia.documentos.length > MEDIA_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedMediaTab("documentos")}
                      >
                        +{midia.documentos.length - MEDIA_PREVIEW_LIMIT} mais
                      </button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="links" className="mt-3">
                {midia.links.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhum link compartilhado nesta conversa.
                  </p>
                ) : (
                  <>
                    {renderLinks(midia.links.slice(0, MEDIA_PREVIEW_LIMIT))}
                    {midia.links.length > MEDIA_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedMediaTab("links")}
                      >
                        +{midia.links.length - MEDIA_PREVIEW_LIMIT} mais
                      </button>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <Dialog open={!!expandedMediaTab} onOpenChange={(v) => !v && setExpandedMediaTab(null)}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {expandedMediaTab ? MEDIA_TAB_LABELS[expandedMediaTab] : ""}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-1">
                {expandedMediaTab === "imagens" && renderImagens(midia.imagens)}
                {expandedMediaTab === "videos" && renderVideos(midia.videos)}
                {expandedMediaTab === "documentos" && renderDocumentos(midia.documentos)}
                {expandedMediaTab === "links" && renderLinks(midia.links)}
              </div>
            </DialogContent>
          </Dialog>

          {conversa.is_group && (
            <>
              <Separator />
              {/* Participantes do grupo no WhatsApp */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Participantes do grupo
                  {participantesGrupo.length > 0 &&
                    ` (${participantesGrupo.length})`}
                </p>
                {participantesGrupo.length > 0 ? (
                  <ul className="space-y-0.5">
                    {participantesGrupo.map((p) => (
                      <li
                        key={p.telefone}
                        className="w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-sm"
                      >
                        <ParticipanteAvatar
                          nome={p.nome}
                          telefone={p.telefone}
                          className="h-6 w-6 shrink-0"
                        />
                        <span className="flex-1 text-left truncate">
                          {p.nome || formatPhone(p.telefone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground px-2">
                    Nenhum participante identificado ainda.
                  </p>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Responsáveis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="h-3 w-3" /> Responsáveis pelo atendimento
              </p>
              <Popover
                open={addResponsavelOpen}
                onOpenChange={(v) => {
                  setAddResponsavelOpen(v);
                  if (!v) setBuscaResponsavel("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    title="Adicionar responsável"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar colega..."
                      value={buscaResponsavel}
                      onValueChange={setBuscaResponsavel}
                    />
                    <CommandList>
                      <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                        {vendedores.length === atuais.length
                          ? "Todos os colegas já são responsáveis."
                          : "Nenhum usuário encontrado."}
                      </CommandEmpty>
                      <CommandGroup>
                        {vendedoresDisponiveis.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.id}
                            onSelect={() => toggle(v.id)}
                            className="gap-2.5"
                          >
                            <Avatar className="h-6 w-6 shrink-0">
                              {v.avatar_url ? (
                                <img
                                  src={v.avatar_url}
                                  alt={v.nome}
                                  className="h-full w-full object-cover rounded-full"
                                />
                              ) : (
                                <AvatarFallback className="text-[9px] bg-muted-foreground/20">
                                  {v.nome
                                    .trim()
                                    .split(" ")
                                    .map((p: string) => p[0])
                                    .slice(0, 2)
                                    .join("")
                                    .toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span className="flex-1 truncate">{v.nome}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {atuais.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {atuais.map((r) => (
                  <Badge
                    key={r.id}
                    variant="secondary"
                    className="flex items-center gap-1.5 pr-1"
                  >
                    <Avatar className="h-4 w-4">
                      {r.avatar_url ? (
                        <img
                          src={r.avatar_url}
                          alt={r.nome}
                          className="h-full w-full object-cover rounded-full"
                        />
                      ) : (
                        <AvatarFallback className="text-[7px] bg-primary text-primary-foreground">
                          {r.nome
                            .trim()
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-xs">{r.nome.split(" ")[0]}</span>
                    <button
                      onClick={() => toggle(r.id)}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddResponsavelOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Nenhum responsável — adicionar
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Componente principal ---
export default function WhatsAppInbox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: conversas = [], isLoading: loadingConversas } =
    useWaConversas();
  const { data: config } = useWaConfig();
  const { data: instancias = [] } = useWaInstancias();
  // Controla o badge de apelido e o filtro "Instância" — aparecem já com 1
  // instância cadastrada, desde que ela tenha apelido/nome conhecido.
  const temInstanciaConhecida = instancias.length > 0;
  // Controla só o agrupamento por cabeçalho na sidebar — agrupar com um único
  // grupo não agrega nada visualmente, por isso continua exigindo 2+.
  const temMultiplasInstancias = instancias.length > 1;
  // Admin/gestor/"empresa" podem direcionar uma conversa não atribuída para
  // qualquer colega — vendedor comum só pode assumir para si mesmo.
  const isGestor =
    profile?.role === "empresa" ||
    profile?.role === "gestor" ||
    profile?.role === "admin";
  const { data: vendedores = [] } = useVendedores();
  const setResponsaveis = useWaSetResponsaveis();

  function assumirConversa(conv: WaConversa) {
    if (!profile?.id) return;
    setResponsaveis.mutate({ conversaId: conv.id, usuarioIds: [profile.id] });
  }

  function direcionarConversa(conv: WaConversa, usuarioId: string) {
    setResponsaveis.mutate({ conversaId: conv.id, usuarioIds: [usuarioId] });
  }
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const conversaAtiva = conversas.find((c) => c.id === conversaAtivaId) ?? null;
  const [atribuicaoModalOpen, setAtribuicaoModalOpen] = useState(false);
  const [dismissedAtribuicaoId, setDismissedAtribuicaoId] = useState<
    string | null
  >(null);

  // Abre automaticamente o modal de atribuição sempre que a conversa selecionada
  // não tiver responsável — e fecha assim que ela for assumida/direcionada
  // (responsaveis deixa de estar vazio). Um "dismiss" manual não reabre o modal
  // para a mesma conversa até ela mudar de estado de responsável de novo.
  useEffect(() => {
    if (!conversaAtiva) {
      setAtribuicaoModalOpen(false);
      return;
    }
    const semResponsavel = (conversaAtiva.responsaveis?.length ?? 0) === 0;
    setAtribuicaoModalOpen(
      semResponsavel && dismissedAtribuicaoId !== conversaAtiva.id,
    );
  }, [conversaAtiva, dismissedAtribuicaoId]);
  const { data: mensagens = [], isLoading: loadingMensagens } = useWaMensagens(
    conversaAtiva?.id ?? null,
  );
  // Participantes do grupo: os salvos na criação (via CRM) somados aos remetentes
  // distintos vistos nas mensagens (cobre membros que entraram depois ou grupos
  // criados fora do CRM, onde a uazapi não devolveu a lista completa).
  const participantesGrupo = useMemo(() => {
    if (!conversaAtiva?.is_group) return [];
    const vistos = new Map<string, { nome: string | null; telefone: string }>();
    for (const p of conversaAtiva.participantes ?? []) {
      if (!p.telefone) continue;
      vistos.set(p.telefone, p);
    }
    for (const msg of mensagens) {
      if (!msg.remetente_telefone) continue;
      if (!vistos.has(msg.remetente_telefone)) {
        vistos.set(msg.remetente_telefone, {
          nome: msg.remetente_nome ?? null,
          telefone: msg.remetente_telefone,
        });
      }
    }
    return Array.from(vistos.values());
  }, [conversaAtiva?.is_group, conversaAtiva?.participantes, mensagens]);
  // Nomes exibidos no subtítulo do grupo: apenas os responsáveis pelo atendimento
  // atribuídos no CRM, sem duplicar nomes iguais.
  const nomesGrupo = useMemo(() => {
    const vistos = new Set<string>();
    const nomes: string[] = [];
    const add = (nome: string | null | undefined) => {
      const limpo = nome?.trim();
      if (!limpo || vistos.has(limpo)) return;
      vistos.add(limpo);
      nomes.push(limpo);
    };
    for (const r of conversaAtiva?.responsaveis ?? []) add(r.nome);
    return nomes;
  }, [conversaAtiva?.responsaveis]);
  const sendMessage = useWaSendMessage();
  const marcarLida = useWaMarcarLida();
  const limparConversa = useWaLimparConversa();
  const arquivarConversa = useWaArquivarConversa();
  const deletarConversa = useWaDeletarConversa();
  const deletarEmMassa = useWaDeletarConversasEmMassa();
  const fetchContactPhoto = useWaFetchContactPhoto();
  const fotoRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    conversas.forEach((c) => {
      if (
        !c.foto_perfil_url &&
        !c.telefone.includes("@g.us") &&
        !fotoRequestedRef.current.has(c.id)
      ) {
        fotoRequestedRef.current.add(c.id);
        fetchContactPhoto.mutate(c.id);
      }
    });
  }, [conversas, fetchContactPhoto]);
  // Backfill dos participantes de grupos criados antes do rastreio existir (ou fora
  // do CRM): a uazapi só devolve a lista completa de membros via /group/list, então
  // buscamos uma vez por grupo sem participantes salvos.
  const fetchGroupParticipantes = useWaFetchGroupParticipantes();
  const participantesRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    conversas.forEach((c) => {
      if (
        c.is_group &&
        (c.participantes?.length ?? 0) === 0 &&
        !participantesRequestedRef.current.has(c.id)
      ) {
        participantesRequestedRef.current.add(c.id);
        fetchGroupParticipantes.mutate(c.id);
      }
    });
  }, [conversas, fetchGroupParticipantes]);
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [confirmDeletar, setConfirmDeletar] = useState(false);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmDeletarMassa, setConfirmDeletarMassa] = useState(false);
  const [leadSheetOpen, setLeadSheetOpen] = useState(false);
  const [abaInbox, setAbaInbox] = useState<"conversas" | "meus-chats">(
    "conversas",
  );

  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"aberto" | "fechado">(
    "aberto",
  );
  const [filtroConversa, setFiltroConversa] = useState<
    "todos" | "geral" | "meu"
  >("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<
    "todos" | "semana" | "mes" | "ano" | "personalizado"
  >("todos");
  const [filtroInstancia, setFiltroInstancia] = useState<string>("todos");
  const [periodoCustom, setPeriodoCustom] = useState<{
    from?: Date;
    to?: Date;
  }>({});
  const [showConfig, setShowConfig] = useState(false);
  const [showNovaConversa, setShowNovaConversa] = useState(false);
  const [showCriarGrupo, setShowCriarGrupo] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [attachments, setAttachments] = useState<
    { file: File; previewUrl: string | null }[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FilePreviewTarget | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    autoResizeTextarea(inputRef.current);
  }, [texto]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const conversaAtivaRef = useRef<WaConversa | null>(null);
  const configRef = useRef<typeof config>(config);

  useEffect(() => {
    conversaAtivaRef.current = conversaAtiva;
  }, [conversaAtiva]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const viewport =
      (msgScrollRef.current?.closest(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null) ?? msgScrollRef.current;
    if (viewport) {
      const isNearBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        150;
      if (isNearBottom || mensagens.length > 0) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [mensagens.length]);

  const scrollToBottom = () => {
    const viewport = msgScrollRef.current?.closest(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 150;
    setShowScrollBottom(!isNearBottom);
  };

  useEffect(() => {
    if (conversaAtiva && conversaAtiva.nao_lidas > 0)
      marcarLida.mutate(conversaAtiva.id);
    inputRef.current?.focus();
  }, [conversaAtiva?.id]);

  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingImage) {
          setViewingImage(null);
        } else if (showConfig) {
          setShowConfig(false);
        } else if (showNovaConversa) {
          setShowNovaConversa(false);
        } else if (confirmLimpar) {
          setConfirmLimpar(false);
        } else if (confirmDeletar) {
          setConfirmDeletar(false);
        } else if (modoSelecao) {
          setModoSelecao(false);
          setSelecionadas(new Set());
        } else if (conversaAtiva) {
          setConversaAtivaId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => {
      window.removeEventListener("keydown", handleKeyDownGlobal);
    };
  }, [
    conversaAtiva,
    viewingImage,
    showConfig,
    showNovaConversa,
    confirmLimpar,
    confirmDeletar,
    modoSelecao,
  ]);

  function toggleSelecao(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodas() {
    if (selecionadas.size === conversasFiltradas.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(conversasFiltradas.map((c) => c.id)));
    }
  }

  function sairModoSelecao() {
    setModoSelecao(false);
    setSelecionadas(new Set());
  }

  async function handleDeletarMassa() {
    await deletarEmMassa.mutateAsync([...selecionadas]);
    if (conversaAtiva && selecionadas.has(conversaAtiva.id)) {
      setConversaAtivaId(null);
    }
    sairModoSelecao();
    setConfirmDeletarMassa(false);
  }

  const conversasPorTipoEBusca = conversas.filter((c) => {
    if (filtroConversa === "geral" && (c.responsaveis?.length ?? 0) > 0)
      return false;
    if (
      filtroConversa === "meu" &&
      (!profile?.id || !c.responsaveis?.some((r) => r.id === profile.id))
    )
      return false;

    if (filtroInstancia !== "todos" && c.instancia_id !== filtroInstancia)
      return false;

    if (filtroPeriodo !== "todos") {
      const dataRefRaw = c.ultima_mensagem_at ?? c.created_at;
      if (!dataRefRaw) return false;
      const dataRef = new Date(dataRefRaw);
      if (filtroPeriodo === "semana" && dataRef < subDays(new Date(), 7))
        return false;
      if (filtroPeriodo === "mes" && dataRef < subMonths(new Date(), 1))
        return false;
      if (filtroPeriodo === "ano" && dataRef < subYears(new Date(), 1))
        return false;
      if (filtroPeriodo === "personalizado") {
        if (periodoCustom.from && dataRef < startOfDay(periodoCustom.from))
          return false;
        if (periodoCustom.to && dataRef > endOfDay(periodoCustom.to))
          return false;
      }
    }

    if (!busca) return true;
    const term = busca.toLowerCase();
    return (
      (c.nome_contato ?? "").toLowerCase().includes(term) ||
      c.telefone.includes(term) ||
      (c.ultima_mensagem ?? "").toLowerCase().includes(term) ||
      (c.responsaveis ?? []).some((r) => r.nome.toLowerCase().includes(term)) ||
      (c.participantes ?? []).some(
        (p) =>
          (p.nome ?? "").toLowerCase().includes(term) ||
          p.telefone.includes(term),
      )
    );
  });

  const countAbertas = conversasPorTipoEBusca.filter(
    (c) => !c.arquivada,
  ).length;
  const countFechadas = conversasPorTipoEBusca.filter(
    (c) => c.arquivada,
  ).length;

  const conversasFiltradas = conversasPorTipoEBusca.filter((c) => {
    if (filtroStatus === "aberto" && c.arquivada) return false;
    if (filtroStatus === "fechado" && !c.arquivada) return false;
    return true;
  });

  // Lista da aba "Meus chats": todas as conversas em que o usuário logado é
  // responsável, independente dos filtros de busca/status/instância da aba
  // "Conversas" — é um atalho fixo, não outra visão dos mesmos filtros.
  const meusChats = useMemo(
    () =>
      conversas.filter((c) =>
        (c.responsaveis ?? []).some((r) => r.id === profile?.id),
      ),
    [conversas, profile?.id],
  );

  // Só agrupa/rotula a sidebar por instância quando a empresa realmente tem mais
  // de uma instância — caso contrário mantém a lista simples de sempre. Com o
  // filtro "Instância" numa instância específica, mostra um único grupo com o
  // apelido dela (senão o cabeçalho some justo ao filtrar, que é o dado mais
  // relevante nesse momento). Toda mensagem sempre vem/vai por alguma instância,
  // então não existe um grupo "sem instância" — conversas legadas sem
  // instancia_id conhecida (dados de antes do backfill, ou instância já
  // removida) só entram soltas no fim, sem cabeçalho, pra não sumir.
  const conversasAgrupadasPorInstancia = useMemo(() => {
    if (!temMultiplasInstancias) return null;

    if (filtroInstancia !== "todos") {
      const inst = instancias.find((i) => i.id === filtroInstancia);
      if (!inst) return null;
      return {
        grupos: [{
          key: inst.id,
          label: inst.apelido || inst.instance_name,
          conversas: conversasFiltradas,
        }],
        avulsas: [] as WaConversa[],
      };
    }

    const idsConhecidos = new Set(instancias.map((i) => i.id));
    const porInstancia = new Map<string, WaConversa[]>();
    const avulsas: WaConversa[] = [];
    for (const c of conversasFiltradas) {
      if (c.instancia_id && idsConhecidos.has(c.instancia_id)) {
        if (!porInstancia.has(c.instancia_id)) porInstancia.set(c.instancia_id, []);
        porInstancia.get(c.instancia_id)!.push(c);
      } else {
        avulsas.push(c);
      }
    }

    const grupos: { key: string; label: string; conversas: WaConversa[] }[] = [];
    for (const inst of instancias) {
      const conversasDaInstancia = porInstancia.get(inst.id);
      if (conversasDaInstancia?.length) {
        grupos.push({
          key: inst.id,
          label: inst.apelido || inst.instance_name,
          conversas: conversasDaInstancia,
        });
      }
    }
    return { grupos, avulsas };
  }, [conversasFiltradas, temMultiplasInstancias, filtroInstancia, instancias]);

  // Divide a sidebar em "Meus chats" / "Não atribuídos" / "Outros atendentes"
  // quando o filtro "Conversa" está em "Todos" — mesmo padrão visual usado para
  // separar por instância. Só grupos com conversas aparecem. Mostra mesmo com um
  // único grupo (ex: vendedor comum, que por causa da RLS só enxerga "Meus
  // chats") para manter a mesma UI em qualquer perfil, não só quem vê tudo
  // (admin/empresa).
  const conversasAgrupadasPorResponsavel = useMemo(() => {
    if (filtroConversa !== "todos" || !profile?.id) return null;

    const meus: WaConversa[] = [];
    const naoAtribuidos: WaConversa[] = [];
    const outros: WaConversa[] = [];
    for (const c of conversasFiltradas) {
      const responsaveis = c.responsaveis ?? [];
      if (responsaveis.length === 0) naoAtribuidos.push(c);
      else if (responsaveis.some((r) => r.id === profile.id)) meus.push(c);
      else outros.push(c);
    }

    const grupos: {
      key: string;
      label: string;
      icon: LucideIcon;
      conversas: WaConversa[];
    }[] = [];
    if (meus.length)
      grupos.push({ key: "meus", label: "Meus chats", icon: UserCheck, conversas: meus });
    if (naoAtribuidos.length)
      grupos.push({ key: "nao-atribuidos", label: "Não atribuídos", icon: UserX, conversas: naoAtribuidos });
    if (outros.length)
      grupos.push({ key: "outros", label: "Outros atendentes", icon: Users, conversas: outros });

    if (grupos.length === 0) return null;
    return grupos;
  }, [conversasFiltradas, filtroConversa, profile?.id]);

  // Mapa id → apelido da instância, para exibir o badge na linha da conversa
  // independente do agrupamento ativo (por responsável ou por instância).
  const apelidoPorInstanciaId = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of instancias) {
      map.set(inst.id, inst.apelido || inst.instance_name);
    }
    return map;
  }, [instancias]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const toAdd: { file: File; previewUrl: string | null }[] = [];
    for (const file of files) {
      if (file.size > 16 * 1024 * 1024) {
        toast.error(`${file.name}: limite de 16 MB excedido.`);
        continue;
      }
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
      toAdd.push({ file, previewUrl });
    }
    if (toAdd.length > 0) setAttachments((prev) => [...prev, ...toAdd]);
    e.target.value = "";
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
      prev.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      return [];
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingSeconds(0);
        setPendingAudio({ file, previewUrl: URL.createObjectURL(blob) });
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
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

  function cancelPendingAudio() {
    if (pendingAudio) URL.revokeObjectURL(pendingAudio.previewUrl);
    setPendingAudio(null);
  }

  async function confirmSendAudio() {
    if (!pendingAudio || !conversaAtiva) return;
    const { file } = pendingAudio;
    cancelPendingAudio();
    setIsUploading(true);
    try {
      const mediaUrl = await uploadWaMedia(file, conversaAtiva.id);
      await sendMessage.mutateAsync({
        telefone: conversaAtiva.telefone,
        mensagem: "[Áudio]",
        conversa_id: conversaAtiva.id,
        tipo: "audio",
        media_url: mediaUrl,
        media_mime: file.type || null,
        nome_arquivo: file.name,
        ptt: true,
      });
    } catch {
      toast.error("Erro ao enviar áudio");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = texto.trim();
    if (!msg && attachments.length === 0) return;
    if (!conversaAtiva) return;

    if (!config || config.status !== "connected") {
      toast.error("WhatsApp desconectado. Verifique as configurações.");
      return;
    }

    const currentAttachments = attachments;
    setTexto("");
    clearAttachments();

    try {
      // Somente texto
      if (currentAttachments.length === 0) {
        await sendMessage.mutateAsync({
          telefone: conversaAtiva.telefone,
          mensagem: msg,
          conversa_id: conversaAtiva.id,
          tipo: "texto",
        });
        return;
      }

      // Upload de todos os arquivos em paralelo
      setIsUploading(true);
      let uploadedUrls: string[];
      try {
        uploadedUrls = await Promise.all(
          currentAttachments.map((a) =>
            uploadWaMedia(a.file, conversaAtiva.id),
          ),
        );
      } catch {
        toast.error("Erro ao fazer upload dos arquivos");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);

      // Envia um arquivo por vez (useMutation não suporta chamadas paralelas)
      for (let i = 0; i < currentAttachments.length; i++) {
        const { file } = currentAttachments[i];
        const tipo = tipoFromFile(file);
        const caption = i === 0 ? msg : "";
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }

  // Item da lista de conversas, compartilhado entre a sidebar (desktop) e o
  // Dialog de conversas (mobile) — só o onClick muda entre os dois.
  function renderConvButton(conv: WaConversa, onSelect: () => void) {
    const apelidoInstancia =
      temInstanciaConhecida && conv.instancia_id
        ? apelidoPorInstanciaId.get(conv.instancia_id)
        : undefined;
    return (
      <button
        key={conv.id}
        onClick={onSelect}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left",
          modoSelecao && selecionadas.has(conv.id)
            ? "bg-primary/10 ring-1 ring-primary/20"
            : conversaAtiva?.id === conv.id && !modoSelecao
              ? "bg-primary/10"
              : "hover:bg-muted/50",
        )}
      >
        {modoSelecao ? (
          <div
            className={cn(
              "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
              selecionadas.has(conv.id)
                ? "bg-primary border-primary"
                : "border-border bg-background",
            )}
          >
            {selecionadas.has(conv.id) && (
              <Check className="h-2.5 w-2.5 text-primary-foreground" />
            )}
          </div>
        ) : (
          <ConversaAvatar conv={conv} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-xs font-medium text-foreground truncate",
              conv.nao_lidas > 0 && !modoSelecao && "font-bold",
            )}
          >
            {conv.nome_contato ?? formatPhone(conv.telefone)}
          </p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {conv.ultima_mensagem ?? "Nenhuma mensagem"}
          </p>
        </div>
        {!modoSelecao &&
          (conv.ultima_mensagem_at ||
            conv.nao_lidas > 0 ||
            apelidoInstancia ||
            (conv.responsaveis ?? []).length > 0) && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1.5">
                <ConversaParticipantesStack conv={conv} />
                {conv.nao_lidas > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50 duration-300">
                    {conv.nao_lidas > 99 ? "99+" : conv.nao_lidas}
                  </span>
                )}
              </div>
              {conv.ultima_mensagem_at && (
                <span className="text-[9px] text-muted-foreground font-medium">
                  {formatTime(conv.ultima_mensagem_at)}
                </span>
              )}
              {apelidoInstancia && (
                <Badge
                  variant="outline"
                  className="h-4 max-w-[88px] truncate px-1.5 py-0 text-[9px] font-medium leading-none text-muted-foreground"
                >
                  <span className="truncate">{apelidoInstancia}</span>
                </Badge>
              )}
            </div>
          )}
      </button>
    );
  }

  function renderConvList(onSelect: (conv: WaConversa) => void) {
    if (conversasAgrupadasPorResponsavel) {
      return (
        <>
          {conversasAgrupadasPorResponsavel.map((grupo) => (
            <div key={grupo.key}>
              <ConversaGroupHeader
                label={grupo.label}
                icon={grupo.icon}
                count={grupo.conversas.length}
              />
              {grupo.conversas.map((conv) =>
                renderConvButton(conv, () => onSelect(conv)),
              )}
            </div>
          ))}
        </>
      );
    }
    if (conversasAgrupadasPorInstancia) {
      const { grupos, avulsas } = conversasAgrupadasPorInstancia;
      return (
        <>
          {grupos.map((grupo) => (
            <div key={grupo.key}>
              <ConversaGroupHeader
                label={grupo.label}
                count={grupo.conversas.length}
              />
              {grupo.conversas.map((conv) =>
                renderConvButton(conv, () => onSelect(conv)),
              )}
            </div>
          ))}
          {avulsas.map((conv) => renderConvButton(conv, () => onSelect(conv)))}
        </>
      );
    }
    return conversasFiltradas.map((conv) =>
      renderConvButton(conv, () => onSelect(conv)),
    );
  }

  const isConnected = config?.status === "connected";
  const isBusy = sendMessage.isPending || isUploading;

  const headerContent = (
    <div className="flex items-center gap-3">
      <MessageCircle className="h-5 w-5 text-green-600" />
      <div>
        <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight md:text-xl">
          WhatsApp
        </h1>
        <p className="text-[10px] sm:text-sm text-muted-foreground">
          Atendimento aos clientes via WhatsApp
        </p>
      </div>
      {/* Botão para abrir lista de conversas em telas pequenas */}
      <div className="ml-auto md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setShowMobileSidebar(true)}
          title="Conversas"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <AppLayout
      headerContent={headerContent}
      mainClassName="flex-1 overflow-hidden"
    >
      {abaInbox === "meus-chats" ? (
        <div className="flex h-full flex-col">
          <MeusChatsList
            conversas={meusChats}
            apelidoPorInstanciaId={apelidoPorInstanciaId}
            onOpen={(id) => {
              setConversaAtivaId(id);
              setAbaInbox("conversas");
            }}
          />
        </div>
      ) : (
      <div className="flex h-full">
        {/* Sidebar de conversas */}
        {/* Em telas pequenas escondemos a sidebar fixa e usamos um Dialog móvel */}
        {sidebarCollapsed ? (
          <div className="hidden md:flex w-12 border-r border-border flex flex-col h-full shrink-0 items-center gap-1 transition-all duration-300">
            <div className="relative mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Criar"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => setShowNovaConversa(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Nova conversa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => setShowCriarGrupo(true)}
                  >
                    <Users className="h-4 w-4" />
                    Novo grupo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ScrollArea className="flex-1 w-full pt-2">
              <div className="flex flex-col items-center gap-2 px-1">
                {conversasFiltradas.map((conv) => (
                  <div key={conv.id} className="relative">
                    <button
                      onClick={() => setConversaAtivaId(conv.id)}
                      className={cn(
                        "p-1 rounded-lg transition-colors",
                        conversaAtiva?.id === conv.id
                          ? "bg-primary/10"
                          : "hover:bg-muted/50",
                      )}
                      title={conv.nome_contato ?? formatPhone(conv.telefone)}
                    >
                      <Avatar className="h-7 w-7 border border-primary/10">
                        {conv.foto_perfil_url && (
                          <AvatarImage src={conv.foto_perfil_url} alt="" />
                        )}
                        <AvatarFallback
                          className={cn(
                            colorForPhone(conv.telefone),
                            "text-white text-[8px] font-semibold",
                          )}
                        >
                          {initials(conv.nome_contato, conv.telefone)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                    {conv.nao_lidas > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-destructive-foreground ring-1 ring-background">
                        {conv.nao_lidas > 9 ? "9+" : conv.nao_lidas}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-auto border-t border-border w-full flex justify-center py-2 h-[4rem] items-center bg-muted/30">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                title="Expandir conversas"
              >
                <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex w-72 lg:w-80 border-r border-border flex-col h-full shrink-0 transition-all duration-300">
            <div className="px-3 py-3 border-b border-border flex items-center gap-1 h-[4rem]">
              <span className="text-sm font-semibold text-foreground flex-1 truncate">
                Conversas
              </span>
              {config && !modoSelecao && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                    isConnected
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  )}
                >
                  {isConnected ? (
                    <Wifi className="h-2.5 w-2.5" />
                  ) : (
                    <WifiOff className="h-2.5 w-2.5" />
                  )}
                  {isConnected ? "Online" : "Offline"}
                </span>
              )}
              {!modoSelecao ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                        title="Criar"
                      >
                        <Plus className="h-4 w-4" />
                        Criar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setShowNovaConversa(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Nova conversa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setShowCriarGrupo(true)}
                      >
                        <Users className="h-4 w-4" />
                        Novo grupo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setModoSelecao(true)}
                    title="Selecionar conversas"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate("/configuracoes?tab=whatsapp")}
                    title="Configurações"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <button
                  onClick={sairModoSelecao}
                  className="text-[11px] text-primary font-medium hover:underline shrink-0"
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="px-2 pt-2 border-b border-border bg-background space-y-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setFiltroStatus("aberto")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1.5 transition-colors",
                      filtroStatus === "aberto"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Em aberto
                    <span
                      className={cn(
                        "text-[9px] px-1 rounded-full font-semibold",
                        filtroStatus === "aberto"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted-foreground/10",
                      )}
                    >
                      {countAbertas}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroStatus("fechado")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1.5 transition-colors",
                      filtroStatus === "fechado"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Fechado
                    <span
                      className={cn(
                        "text-[9px] px-1 rounded-full font-semibold",
                        filtroStatus === "fechado"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted-foreground/10",
                      )}
                    >
                      {countFechadas}
                    </span>
                  </button>
                </div>
                <FilterButton
                  hasFilters={
                    filtroConversa !== "todos" ||
                    filtroPeriodo !== "todos" ||
                    filtroInstancia !== "todos"
                  }
                  activeFilterCount={
                    (filtroConversa !== "todos" ? 1 : 0) +
                    (filtroPeriodo !== "todos" ? 1 : 0) +
                    (filtroInstancia !== "todos" ? 1 : 0)
                  }
                  onClear={() => {
                    setFiltroConversa("todos");
                    setFiltroPeriodo("todos");
                    setPeriodoCustom({});
                    setFiltroInstancia("todos");
                  }}
                  align="start"
                  popoverClassName="w-auto"
                >
                  <div className="flex">
                    <div className="flex flex-col gap-0.5 w-44">
                      <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Visualizar
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setAbaInbox(
                            abaInbox === "meus-chats"
                              ? "conversas"
                              : "meus-chats",
                          )
                        }
                        className={cn(
                          "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                          abaInbox === "meus-chats" &&
                            "bg-primary/10 text-primary",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <List className="h-3.5 w-3.5" />
                          Meus chats em lista
                        </span>
                        {abaInbox === "meus-chats" && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="mx-3 my-1 border-t border-border/50" />
                      <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Conversa
                      </p>
                      {(
                        [
                          ["todos", "Todos"],
                          ["geral", "Não atribuído"],
                          ["meu", "Meus chats"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setFiltroConversa(val)}
                          className={cn(
                            "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                            filtroConversa === val &&
                              "bg-primary/10 text-primary",
                          )}
                        >
                          {label}
                          {filtroConversa === val && (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                      <div className="mx-3 my-1 border-t border-border/50" />
                      <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Período
                      </p>
                      {(
                        [
                          ["semana", "Última semana"],
                          ["mes", "Último mês"],
                          ["ano", "Último ano"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            setFiltroPeriodo(
                              filtroPeriodo === val ? "todos" : val,
                            )
                          }
                          className={cn(
                            "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                            filtroPeriodo === val &&
                              "bg-primary/10 text-primary",
                          )}
                        >
                          {label}
                          {filtroPeriodo === val && (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                      {/* Aparece já com 1 instância WhatsApp conectada — mostra qual
                          número está por trás de cada conversa mesmo sem ter que
                          escolher entre múltiplas. */}
                      {temInstanciaConhecida && (
                        <>
                          <div className="mx-3 my-1 border-t border-border/50" />
                          <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            Instância
                          </p>
                          <button
                            type="button"
                            onClick={() => setFiltroInstancia("todos")}
                            className={cn(
                              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                              filtroInstancia === "todos" &&
                                "bg-primary/10 text-primary",
                            )}
                          >
                            Todas
                            {filtroInstancia === "todos" && (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {instancias.map((inst) => (
                            <button
                              key={inst.id}
                              type="button"
                              onClick={() => setFiltroInstancia(inst.id)}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                filtroInstancia === inst.id &&
                                  "bg-primary/10 text-primary",
                              )}
                            >
                              <span className="truncate text-xs">
                                {inst.apelido || inst.instance_name}
                              </span>
                              {filtroInstancia === inst.id && (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="border-l border-border/50 p-2">
                      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Personalizado
                      </p>
                      <Calendar
                        mode="range"
                        selected={{
                          from: periodoCustom.from,
                          to: periodoCustom.to,
                        }}
                        onSelect={(range) => {
                          setPeriodoCustom({
                            from: range?.from,
                            to: range?.to,
                          });
                          setFiltroPeriodo("personalizado");
                        }}
                        numberOfMonths={1}
                        locale={ptBR}
                        captionLayout="dropdown-buttons"
                        fromYear={1950}
                        toYear={new Date().getFullYear()}
                        className="pointer-events-auto"
                      />
                    </div>
                  </div>
                </FilterButton>
              </div>
              <div className="relative pb-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:ring-1"
                  placeholder="Buscar por nome, telefone, mensagem ou responsável..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            {modoSelecao && conversasFiltradas.length > 0 && (
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/30">
                <button
                  onClick={toggleTodas}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                      selecionadas.size === conversasFiltradas.length
                        ? "bg-primary border-primary"
                        : "border-border bg-background",
                    )}
                  >
                    {selecionadas.size === conversasFiltradas.length && (
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    )}
                  </div>
                  {selecionadas.size === conversasFiltradas.length
                    ? "Desmarcar todas"
                    : "Selecionar todas"}
                </button>
                {selecionadas.size > 0 && (
                  <span className="ml-auto text-[11px] font-medium text-primary">
                    {selecionadas.size} selecionada
                    {selecionadas.size > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5 w-full">
                {loadingConversas ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : conversasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 px-4 text-center">
                    <MessageCircle className="h-8 w-8 opacity-30" />
                    {busca
                      ? "Nenhuma conversa encontrada"
                      : "Nenhuma conversa ainda"}
                  </div>
                ) : (
                  renderConvList((conv) =>
                    modoSelecao
                      ? toggleSelecao(conv.id)
                      : setConversaAtivaId(conv.id),
                  )
                )}
              </div>
            </ScrollArea>
            <div className="border-t border-border px-3 py-2 mt-auto bg-muted/30 h-[4rem] flex items-center">
              {modoSelecao ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                  disabled={selecionadas.size === 0 || deletarEmMassa.isPending}
                  onClick={() => setConfirmDeletarMassa(true)}
                >
                  {deletarEmMassa.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir{" "}
                  {selecionadas.size > 0
                    ? `(${selecionadas.size})`
                    : "selecionadas"}
                </Button>
              ) : (
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
                  title="Recolher conversas"
                >
                  <PanelLeftClose className="h-4 w-4" />
                  <span className="text-[10px]">Recolher</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile: Dialog com lista de conversas (full screen) */}
        <Dialog
          open={showMobileSidebar}
          onOpenChange={() => setShowMobileSidebar(false)}
        >
          <DialogContent className="p-0 w-full max-w-full h-full m-0 md:hidden">
            <div className="w-full h-full flex flex-col bg-background">
              <div className="px-4 py-3 border-b border-border flex items-center h-[4rem]">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-1">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                  Conversas
                </h2>
                {!modoSelecao ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setModoSelecao(true)}
                    title="Selecionar conversas"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                ) : (
                  <button
                    onClick={sairModoSelecao}
                    className="text-[11px] text-primary font-medium hover:underline"
                  >
                    Cancelar
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground ml-1"
                  onClick={() => setShowMobileSidebar(false)}
                  title="Fechar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="px-2 pt-2 border-b border-border bg-background space-y-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 flex-1">
                      <button
                        type="button"
                        onClick={() => setFiltroStatus("aberto")}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1 transition-colors",
                          filtroStatus === "aberto"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Em aberto
                        <span
                          className={cn(
                            "text-[9px] px-1 rounded-full font-semibold",
                            filtroStatus === "aberto"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted-foreground/10",
                          )}
                        >
                          {countAbertas}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroStatus("fechado")}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1 transition-colors",
                          filtroStatus === "fechado"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Fechado
                        <span
                          className={cn(
                            "text-[9px] px-1 rounded-full font-semibold",
                            filtroStatus === "fechado"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted-foreground/10",
                          )}
                        >
                          {countFechadas}
                        </span>
                      </button>
                    </div>
                    <FilterButton
                      hasFilters={
                        filtroConversa !== "todos" ||
                        filtroPeriodo !== "todos" ||
                        filtroInstancia !== "todos"
                      }
                      activeFilterCount={
                        (filtroConversa !== "todos" ? 1 : 0) +
                        (filtroPeriodo !== "todos" ? 1 : 0) +
                        (filtroInstancia !== "todos" ? 1 : 0)
                      }
                      onClear={() => {
                        setFiltroConversa("todos");
                        setFiltroPeriodo("todos");
                        setPeriodoCustom({});
                        setFiltroInstancia("todos");
                      }}
                      align="end"
                      popoverClassName="w-auto"
                    >
                      <div className="flex">
                        <div className="flex flex-col gap-0.5 w-44">
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            Visualizar
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setAbaInbox(
                                abaInbox === "meus-chats"
                                  ? "conversas"
                                  : "meus-chats",
                              )
                            }
                            className={cn(
                              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                              abaInbox === "meus-chats" &&
                                "bg-primary/10 text-primary",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <List className="h-3.5 w-3.5" />
                              Meus chats em lista
                            </span>
                            {abaInbox === "meus-chats" && (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <div className="mx-3 my-1 border-t border-border/50" />
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            Conversa
                          </p>
                          {(
                            [
                              ["todos", "Todos"],
                              ["geral", "Não atribuído"],
                              ["meu", "Meus chats"],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setFiltroConversa(val)}
                              className={cn(
                                "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                filtroConversa === val &&
                                  "bg-primary/10 text-primary",
                              )}
                            >
                              {label}
                              {filtroConversa === val && (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ))}
                          <div className="mx-3 my-1 border-t border-border/50" />
                          <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            Período
                          </p>
                          {(
                            [
                              ["semana", "Última semana"],
                              ["mes", "Último mês"],
                              ["ano", "Último ano"],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() =>
                                setFiltroPeriodo(
                                  filtroPeriodo === val ? "todos" : val,
                                )
                              }
                              className={cn(
                                "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                filtroPeriodo === val &&
                                  "bg-primary/10 text-primary",
                              )}
                            >
                              {label}
                              {filtroPeriodo === val && (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ))}
                          {temInstanciaConhecida && (
                            <>
                              <div className="mx-3 my-1 border-t border-border/50" />
                              <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                Instância
                              </p>
                              <button
                                type="button"
                                onClick={() => setFiltroInstancia("todos")}
                                className={cn(
                                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                  filtroInstancia === "todos" &&
                                    "bg-primary/10 text-primary",
                                )}
                              >
                                Todas
                                {filtroInstancia === "todos" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {instancias.map((inst) => (
                                <button
                                  key={inst.id}
                                  type="button"
                                  onClick={() => setFiltroInstancia(inst.id)}
                                  className={cn(
                                    "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                    filtroInstancia === inst.id &&
                                      "bg-primary/10 text-primary",
                                  )}
                                >
                                  <span className="truncate font-mono text-xs">
                                    {inst.instance_name}
                                  </span>
                                  {filtroInstancia === inst.id && (
                                    <Check className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                        <div className="border-l border-border/50 p-2">
                          <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            Personalizado
                          </p>
                          <Calendar
                            mode="range"
                            selected={{
                              from: periodoCustom.from,
                              to: periodoCustom.to,
                            }}
                            onSelect={(range) => {
                              setPeriodoCustom({
                                from: range?.from,
                                to: range?.to,
                              });
                              setFiltroPeriodo("personalizado");
                            }}
                            numberOfMonths={1}
                            locale={ptBR}
                            captionLayout="dropdown-buttons"
                            fromYear={1950}
                            toYear={new Date().getFullYear()}
                            className="pointer-events-auto"
                          />
                        </div>
                      </div>
                    </FilterButton>
                  </div>
                </div>
                <div className="relative pb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:ring-1"
                    placeholder="Buscar por nome, telefone, mensagem ou responsável..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>

              {modoSelecao && conversasFiltradas.length > 0 && (
                <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/30">
                  <button
                    onClick={toggleTodas}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                        selecionadas.size === conversasFiltradas.length
                          ? "bg-primary border-primary"
                          : "border-border bg-background",
                      )}
                    >
                      {selecionadas.size === conversasFiltradas.length && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    {selecionadas.size === conversasFiltradas.length
                      ? "Desmarcar todas"
                      : "Selecionar todas"}
                  </button>
                  {selecionadas.size > 0 && (
                    <span className="ml-auto text-[11px] font-medium text-primary">
                      {selecionadas.size} selecionada
                      {selecionadas.size > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5 w-full">
                  {loadingConversas ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando...
                    </div>
                  ) : conversasFiltradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 px-4 text-center">
                      <MessageCircle className="h-8 w-8 opacity-30" />
                      {busca
                        ? "Nenhuma conversa encontrada"
                        : "Nenhuma conversa ainda"}
                    </div>
                  ) : (
                    renderConvList((conv) => {
                      if (modoSelecao) {
                        toggleSelecao(conv.id);
                      } else {
                        setConversaAtivaId(conv.id);
                        setShowMobileSidebar(false);
                      }
                    })
                  )}
                </div>
              </ScrollArea>

              {modoSelecao && (
                <div className="border-t border-border px-3 py-2 bg-muted/30">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full gap-2"
                    disabled={
                      selecionadas.size === 0 || deletarEmMassa.isPending
                    }
                    onClick={() => setConfirmDeletarMassa(true)}
                  >
                    {deletarEmMassa.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Excluir{" "}
                    {selecionadas.size > 0
                      ? `(${selecionadas.size})`
                      : "selecionadas"}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Área de mensagens */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {conversaAtiva ? (
            <>
              {/* Modal de atribuição: cobre só o painel da conversa (não a página
                  inteira), ancorado acima do campo de digitação e centralizado
                  horizontalmente. Aparece ao abrir uma conversa sem responsável. */}
              {atribuicaoModalOpen && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-4 pb-24">
                  <div className="pointer-events-auto flex w-full max-w-xl items-center gap-4 rounded-lg border bg-background p-4 shadow-lg">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                      <UserX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-none tracking-tight">
                        Conversa sem responsável!
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Ninguém está atendendo{" "}
                        {conversaAtiva.nome_contato ??
                          formatPhone(conversaAtiva.telefone)}{" "}
                        ainda. Assuma a conversa ou direcione para um colega.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => assumirConversa(conversaAtiva)}
                        disabled={setResponsaveis.isPending}
                      >
                        <UserCheck className="h-4 w-4" />
                        Assumir
                      </Button>
                      {isGestor && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={setResponsaveis.isPending}
                            >
                              <Users className="h-4 w-4" />
                              Direcionar
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="w-56">
                            {vendedores.length === 0 && (
                              <DropdownMenuItem disabled>
                                Nenhum colega disponível
                              </DropdownMenuItem>
                            )}
                            {vendedores.map((v) => (
                              <DropdownMenuItem
                                key={v.id}
                                onClick={() =>
                                  direcionarConversa(conversaAtiva, v.id)
                                }
                              >
                                {v.nome}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAtribuicaoModalOpen(false);
                          setDismissedAtribuicaoId(conversaAtiva.id);
                        }}
                      >
                        Agora não
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 h-[4rem]">
                <button
                  className="flex items-center gap-3 min-w-0 group"
                  onClick={() => setLeadSheetOpen(true)}
                  title="Ver detalhes do lead"
                >
                  <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
                    {conversaAtiva.foto_perfil_url && (
                      <AvatarImage src={conversaAtiva.foto_perfil_url} alt="" />
                    )}
                    <AvatarFallback
                      className={cn(
                        colorForPhone(conversaAtiva.telefone),
                        "text-white text-xs font-semibold",
                      )}
                    >
                      {initials(
                        conversaAtiva.nome_contato,
                        conversaAtiva.telefone,
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {conversaAtiva.nome_contato ??
                        formatPhone(conversaAtiva.telefone)}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize truncate">
                      {conversaAtiva.is_group
                        ? nomesGrupo.length > 0
                          ? nomesGrupo.join(", ")
                          : "Grupo"
                        : conversaAtiva.nome_contato
                          ? formatPhone(conversaAtiva.telefone)
                          : "WhatsApp"}
                    </p>
                  </div>
                </button>
                <ConversaParticipantesStack conv={conversaAtiva} spacing="gap" />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => {
                      const novaArquivada = !conversaAtiva.arquivada;
                      arquivarConversa.mutate({
                        conversaId: conversaAtiva.id,
                        arquivada: novaArquivada,
                      });
                      if (
                        (novaArquivada && filtroStatus === "aberto") ||
                        (!novaArquivada && filtroStatus === "fechado")
                      ) {
                        setConversaAtivaId(null);
                      }
                    }}
                  >
                    {conversaAtiva.arquivada ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    {conversaAtiva.arquivada
                      ? "Reabrir conversa"
                      : "Marcar como fechada"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => {
                          const phone = conversaAtiva.telefone.replace(
                            /\D/g,
                            "",
                          );
                          window.open(`https://wa.me/${phone}`, "_blank");
                        }}
                      >
                        <Phone className="h-4 w-4" />
                        Abrir no WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2"
                        onClick={() => setConfirmLimpar(true)}
                      >
                        <Eraser className="h-4 w-4" />
                        Limpar conversa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2"
                        onClick={() => setConfirmDeletar(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Deletar conversa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Confirmação de limpar conversa */}
                <AlertDialog
                  open={confirmLimpar}
                  onOpenChange={setConfirmLimpar}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todas as mensagens desta conversa serão apagadas
                        permanentemente. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => limparConversa.mutate(conversaAtiva.id)}
                      >
                        {limparConversa.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Limpar"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Confirmação de deletar conversa */}
                <AlertDialog
                  open={confirmDeletar}
                  onOpenChange={setConfirmDeletar}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta conversa e todas as suas mensagens serão deletadas
                        permanentemente. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => {
                          deletarConversa.mutate(conversaAtiva.id, {
                            onSuccess: () => setConversaAtivaId(null),
                          });
                          setConfirmDeletar(false);
                        }}
                      >
                        {deletarConversa.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Deletar"
                        )}
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
                      <p className="text-sm">
                        Nenhuma mensagem ainda. Comece a conversa!
                      </p>
                    </div>
                  ) : (
                    <div className="py-4 space-y-1">
                      {mensagens.map((msg, i) => {
                        const isSaida = msg.direcao === "saida";
                        const prevMsg = mensagens[i - 1];
                        const showDate =
                          !prevMsg ||
                          new Date(msg.created_at).toDateString() !==
                            new Date(prevMsg.created_at).toDateString();
                        const isLast = i === mensagens.length - 1;
                        // Empilha mensagens consecutivas do mesmo remetente sem repetir o
                        // nome/número acima de cada bolha — só mostra na primeira da leva.
                        const isFirstDoRemetente =
                          !prevMsg ||
                          showDate ||
                          prevMsg.direcao !== msg.direcao ||
                          (isSaida
                            ? (prevMsg.usuario?.id ?? null) !==
                              (msg.usuario?.id ?? null)
                            : (prevMsg.remetente_telefone ?? null) !==
                              (msg.remetente_telefone ?? null));

                        return (
                          <div
                            key={msg.id}
                            ref={isLast ? msgScrollRef : undefined}
                          >
                            {showDate && (
                              <div className="flex items-center justify-center my-4">
                                <span className="text-[10px] bg-muted text-muted-foreground px-3 py-1 rounded-full">
                                  {isToday(new Date(msg.created_at))
                                    ? "Hoje"
                                    : isYesterday(new Date(msg.created_at))
                                      ? "Ontem"
                                      : format(
                                          new Date(msg.created_at),
                                          "d 'de' MMMM",
                                          { locale: ptBR },
                                        )}
                                </span>
                              </div>
                            )}
                            <div
                              className={cn(
                                "flex",
                                isSaida ? "justify-end" : "justify-start",
                                prevMsg?.direcao !== msg.direcao
                                  ? "mt-3"
                                  : "mt-0.5",
                              )}
                            >
                              <div
                                className={cn(
                                  "max-w-[75%]",
                                  isSaida ? "items-end" : "items-start",
                                )}
                              >
                                <div
                                  className={cn(
                                    msg.tipo === "audio"
                                      ? "p-0.5"
                                      : "px-3 py-2",
                                    "break-words",
                                    isSaida
                                      ? "bg-orange-500 text-white rounded-2xl rounded-tr-sm"
                                      : "bg-muted text-foreground rounded-2xl rounded-tl-sm",
                                  )}
                                >
                                  {isSaida &&
                                    msg.usuario &&
                                    isFirstDoRemetente && (
                                      <UserPreviewPopover
                                        usuario={msg.usuario}
                                        nameClassName={cn(
                                          "block w-full truncate text-[13px] font-semibold leading-tight mb-2 text-white",
                                          msg.tipo === "audio" &&
                                            "w-[calc(100%-0.75rem)] mx-1.5 mt-1.5",
                                        )}
                                      />
                                    )}
                                  {!isSaida && isFirstDoRemetente && (
                                    <ContactPreviewPopover
                                      conversa={conversaAtiva}
                                      remetenteNome={msg.remetente_nome}
                                      remetenteTelefone={msg.remetente_telefone}
                                      nameClassName={cn(
                                        "block w-full truncate text-[13px] font-semibold leading-tight mb-2",
                                        senderNameColor(conversaAtiva.id),
                                        msg.tipo === "audio" &&
                                          "w-[calc(100%-0.75rem)] mx-1.5 mt-1.5",
                                      )}
                                    />
                                  )}
                                  <MessageContent
                                    msg={msg}
                                    isSaida={isSaida}
                                    onImageClick={setViewingImage}
                                    onPreviewFile={setPreviewFile}
                                    conversaAtiva={conversaAtiva}
                                  />
                                </div>
                                {msg.tipo !== "texto" && (
                                  <div
                                    className={cn(
                                      "flex items-center gap-1 mt-0.5",
                                      isSaida
                                        ? "justify-end mr-1"
                                        : "justify-start ml-1",
                                    )}
                                  >
                                    <span className="text-[9px] text-muted-foreground">
                                      {format(
                                        new Date(msg.created_at),
                                        "HH:mm",
                                      )}
                                    </span>
                                    {isSaida && (
                                      <MessageStatus status={msg.status} />
                                    )}
                                  </div>
                                )}
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
                    WhatsApp desconectado —{" "}
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
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setShowConfig(true)}
                    >
                      Configurar
                    </Button>
                  </div>
                )}

                {/* Preview dos anexos */}
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div
                        key={i}
                        className="relative flex items-center gap-2 px-2 py-1.5 bg-muted/70 rounded-xl border border-border max-w-[200px]"
                      >
                        {a.previewUrl && tipoFromFile(a.file) === "audio" ? (
                          <audio
                            src={a.previewUrl}
                            controls
                            className="h-8 max-w-[160px]"
                          />
                        ) : a.previewUrl ? (
                          <img
                            src={a.previewUrl}
                            alt="preview"
                            className="h-10 w-10 object-cover rounded-lg shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 flex items-center justify-center bg-background rounded-lg shrink-0 border border-border">
                            <AttachmentIcon
                              tipo={tipoFromFile(a.file)}
                              className="h-4 w-4 text-muted-foreground"
                            />
                          </div>
                        )}
                        {!a.previewUrl && (
                          <p className="text-xs truncate max-w-[90px]">
                            {a.file.name}
                          </p>
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

                {/* Confirmação de envio de áudio gravado */}
                {pendingAudio && (
                  <PendingAudioPlayer
                    src={pendingAudio.previewUrl}
                    onCancel={cancelPendingAudio}
                    onSend={confirmSendAudio}
                    isSending={isUploading}
                  />
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
                    disabled={isBusy || isRecording || !!pendingAudio}
                    title="Anexar arquivo"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </Button>
                  {/* Botão de gravação de áudio */}
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "ghost"}
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={toggleRecording}
                    disabled={isBusy || !!pendingAudio}
                    title={isRecording ? "Parar gravação" : "Gravar áudio"}
                  >
                    {isRecording ? (
                      <Square className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-sm text-red-600 dark:text-red-400 font-mono">
                        {String(Math.floor(recordingSeconds / 60)).padStart(
                          2,
                          "0",
                        )}
                        :{String(recordingSeconds % 60).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-red-500/70">
                        Gravando...
                      </span>
                    </div>
                  ) : (
                    <Textarea
                      ref={inputRef}
                      className="flex-1 min-h-9 resize-none py-2 overflow-hidden"
                      rows={1}
                      placeholder={
                        attachments.length > 0
                          ? "Legenda (opcional)..."
                          : isConnected
                            ? "Digite uma mensagem..."
                            : "WhatsApp desconectado"
                      }
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isBusy || !!pendingAudio}
                      autoFocus
                    />
                  )}
                  <Button
                    onClick={handleSend}
                    size="icon"
                    className="bg-green-500 hover:bg-green-600 text-white shrink-0"
                    disabled={
                      (!texto.trim() && attachments.length === 0) ||
                      isBusy ||
                      isRecording ||
                      !!pendingAudio
                    }
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
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
                <p className="text-sm mt-1">
                  Selecione uma conversa para começar
                </p>
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
      )}

      <NovaConversaDialog
        open={showNovaConversa}
        onClose={(id) => {
          setShowNovaConversa(false);
          if (id) {
            const conv = conversas.find((c) => c.id === id);
            if (conv) setConversaAtivaId(conv.id);
          }
        }}
      />
      <CriarGrupoDialog
        open={showCriarGrupo}
        onClose={(id) => {
          setShowCriarGrupo(false);
          if (id) {
            const conv = conversas.find((c) => c.id === id);
            if (conv) setConversaAtivaId(conv.id);
          }
        }}
      />
      <ConfigDialog open={showConfig} onClose={() => setShowConfig(false)} />

      <Dialog
        open={!!viewingImage}
        onOpenChange={(open) => !open && setViewingImage(null)}
      >
        <DialogContent className="max-w-5xl bg-transparent border-none shadow-none p-0 flex items-center justify-center [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualizar Imagem</DialogTitle>
          </DialogHeader>
          {viewingImage && (
            <div className="relative max-h-[90vh] max-w-full flex items-center justify-center p-4">
              <img
                src={viewingImage}
                alt="Visualização"
                className="max-h-[90vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
              />
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

      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />

      {/* Confirmação de exclusão em massa */}
      <AlertDialog
        open={confirmDeletarMassa}
        onOpenChange={setConfirmDeletarMassa}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversas selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              {selecionadas.size === 1
                ? "1 conversa e todas as suas mensagens serão excluídas permanentemente."
                : `${selecionadas.size} conversas e todas as suas mensagens serão excluídas permanentemente.`}{" "}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletarEmMassa.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
              onClick={handleDeletarMassa}
              disabled={deletarEmMassa.isPending}
            >
              {deletarEmMassa.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Excluir{" "}
              {selecionadas.size > 1
                ? `${selecionadas.size} conversas`
                : "conversa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {conversaAtiva && (
        <LeadSheet
          conversa={conversaAtiva}
          participantesGrupo={participantesGrupo}
          open={leadSheetOpen}
          onOpenChange={setLeadSheetOpen}
          onImageClick={setViewingImage}
          onPreviewFile={setPreviewFile}
        />
      )}

    </AppLayout>
  );
}

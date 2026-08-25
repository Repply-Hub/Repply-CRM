import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useWaConversas,
  useWaMensagens,
  useWaSendMessage,
  useWaReagir,
  useWaMarcarLida,
  useWaMarcarNaoLida,
  useWaConfig,
  useWaNovaConversa,
  useWaCriarGrupo,
  useWaLimparConversa,
  useWaArquivarConversa,
  useWaDeletarConversa,
  useWaDeletarConversasEmMassa,
  useWaSetResponsaveis,
  useWaRegistrarVisualizacao,
  useWaAddNota,
  useWaSetNotaFixada,
  useWaExcluirMensagem,
  useWaConnect,
  useWaSyncStatus,
  useWaDisconnect,
  useWaProvision,
  useWaFetchContactPhoto,
  useWaRenomearContato,
  useWaFetchGroupParticipantes,
  useWaParticipantePhoto,
  useWaInstancias,
  useWaBuscarMensagens,
  uploadWaMedia,
  mimeForFile,
  fetchMensagensParaExportar,
  type WaConversa,
  type WaMensagem,
  type WaReacao,
  type WaMensagemBusca,
  type WaMidiaTipo,
  type WaConfig,
} from "@/hooks/use-whatsapp-inbox";
import { useVendedores, useClientes } from "@/hooks/use-clientes";
import { usePedidosOptions } from "@/hooks/use-pedidos";
import { getNomeNegocio } from "@/lib/nome-negocio";
import { useCreateTarefa, useTarefasPorConversa } from "@/hooks/use-tarefas";
import { useSecaoLigada } from "@/hooks/use-secoes";
import { useTarefasKanbanColunas } from "@/hooks/use-tarefas-kanban-colunas";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { ChatMessageSearch } from "@/components/chat/ChatMessageSearch";
import { ProjetoSelect } from "@/components/tarefas/ProjetoSelect";
import { ParticipantesMultiSelect } from "@/components/tarefas/ParticipantesMultiSelect";
import { MarcadoresMultiSelect } from "@/components/tarefas/MarcadoresMultiSelect";
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
  DialogDescription,
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
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from "@/components/shared/DialogoResponsivo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ListPagination } from "@/components/shared/ListPagination";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterButton } from "@/components/shared/FilterButton";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  FilePreviewDialog,
  isPreviewable,
  type FilePreviewTarget,
} from "@/components/chat/FilePreviewDialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  ChevronUp,
  Mic,
  Square,
  Download,
  Play,
  Pause,
  MoreVertical,
  Trash2,
  FilterX,
  Eraser,
  Archive,
  ArchiveRestore,
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
  Reply,
  SmilePlus,
  ListTodo,
  StickyNote,
  MessageSquareText,
  Eye,
  EyeOff,
  Pencil,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sticker,
  FileDown,
  FileSpreadsheet,
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
import { cn, autoResizeTextarea, slugify } from "@/lib/utils";
import { downloadFile } from "@/lib/download-file";
import { linkifyText } from "@/lib/linkify";
import {
  CLASSE_BADGE_INSTANCIA_SEM_COR,
  CLASSES_BADGE_INSTANCIA,
  infoCorInstancia,
  type InfoCorInstancia,
} from "@/lib/wa-instancia-cores";
import {
  MENSAGEM_PLACEHOLDERS,
  infoPreviewMensagem,
} from "@/lib/wa-mensagem-preview";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/shared/DateRangePicker";
import type { ConversaExportRow, ConversaParaExportar } from "@/lib/generate-conversa-pdf";
import {
  TOGGLE_LIST_CLASS,
  TOGGLE_BUTTON_CLASS,
  TOGGLE_BUTTON_ACTIVE,
  TOGGLE_BUTTON_INACTIVE,
} from "@/lib/toggle-group-styles";
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

const TIPO_MENSAGEM_LABELS: Record<string, string> = {
  texto: "Texto",
  imagem: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  documento: "Documento",
  sticker: "Figurinha",
};

// Transcrição pra exportação: mensagem de mídia vira "[Tipo] — legenda" (o
// arquivo em si não entra no PDF/Excel, só o texto), e notas internas ficam de
// fora — a exportação é o histórico real da conversa no WhatsApp, não os
// bastidores do atendimento.
function buildConversaExportRows(
  mensagens: WaMensagem[],
  nomeContato: string,
): ConversaExportRow[] {
  return mensagens
    .filter((m) => !m.is_nota_interna)
    .map((m) => {
      const tipoLabel = TIPO_MENSAGEM_LABELS[m.tipo] ?? m.tipo ?? "Texto";
      let mensagem: string;
      if (m.apagada_para_todos) {
        mensagem = "[Mensagem apagada]";
      } else if (!m.tipo || m.tipo === "texto") {
        mensagem = m.conteudo || "";
      } else {
        mensagem = m.conteudo ? `[${tipoLabel}] — ${m.conteudo}` : `[${tipoLabel}]`;
      }
      return {
        dataHora: format(new Date(m.created_at), "dd/MM/yyyy HH:mm", {
          locale: ptBR,
        }),
        remetente:
          m.direcao === "saida"
            ? (m.usuario?.nome ?? "Equipe")
            : (m.remetente_nome ?? nomeContato),
        tipo: tipoLabel,
        mensagem,
      };
    });
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

// Mensagens enviadas fora do CRM (WhatsApp Web/celular físico ligado à mesma
// instância) chegam via webhook sem usuario_id — quem enviou costuma se
// identificar manualmente prefixando "*Nome:*" no início do texto (convenção comum
// em número compartilhado por vários atendentes). Extrai esse prefixo pra não
// mostrar os asteriscos crus na bolha e pra tentar casar com um usuário do CRM.
const PREFIXO_REMETENTE_EXTERNO_RE = /^\*([^*\n]{1,60}):?\*[ \t]*\n?/;
function extrairPrefixoRemetenteExterno(
  conteudo: string,
): { nome: string; resto: string } | null {
  const m = conteudo.match(PREFIXO_REMETENTE_EXTERNO_RE);
  if (!m) return null;
  return { nome: m[1].trim(), resto: conteudo.slice(m[0].length) };
}
function normalizeNomeBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
            "text-left cursor-pointer rounded px-1 -mx-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
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
            "text-left cursor-pointer rounded px-1 -mx-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
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
// do grupo quando for uma conversa em grupo. `size="lg"` é usado na visão "Lista"
// (mais espaço disponível que a sidebar estreita).
function ConversaAvatar({
  conv,
  size = "sm",
}: {
  conv: WaConversa;
  size?: "sm" | "lg";
}) {
  const dimensionClass = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  if (conv.is_group) {
    return (
      <Avatar
        className={cn(dimensionClass, "border border-primary/10 shrink-0")}
      >
        {conv.foto_perfil_url && (
          <AvatarImage src={conv.foto_perfil_url} alt="" />
        )}
        <AvatarFallback
          className={cn(colorForPhone(conv.telefone), "text-white")}
        >
          <Users className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
        </AvatarFallback>
      </Avatar>
    );
  }
  return (
    <Avatar className={cn(dimensionClass, "border border-primary/10 shrink-0")}>
      {conv.foto_perfil_url && (
        <AvatarImage src={conv.foto_perfil_url} alt="" />
      )}
      <AvatarFallback
        className={cn(
          colorForPhone(conv.telefone),
          "text-white font-semibold",
          size === "lg" ? "text-sm" : "text-xs",
        )}
      >
        {initials(conv.nome_contato, conv.telefone)}
      </AvatarFallback>
    </Avatar>
  );
}

// Segue o contador normal (nao_lidas) para qualquer conversa, atribuída ao
// usuário logado ou não — abrir a conversa é o que marca como lida (ver
// useEffect que chama `marcarLida` ao trocar `conversaAtivaId`), não a mera
// atribuição. `nao_lidas_forcada` é a marcação manual via "Marcar como não
// lida" no menu "..." do header.
function conversaNaoLida(
  conv: WaConversa,
  currentUserId?: string | null,
): boolean {
  if (conv.arquivada) return false;
  return conv.nao_lidas_forcada || conv.nao_lidas > 0;
}

// Uma conversa sem responsável só entra na fila "Não atribuídos" quando
// `precisa_atribuicao` está marcada. Não usar ultima_mensagem_direcao aqui: o
// webhook seta "saida" tanto pra mensagem enviada pelo CRM (aí sim resolvido,
// mas nesse caso whatsapp-send já garante um responsável) quanto pra mensagem
// refletida do celular físico/WhatsApp Web reabrindo uma conversa fechada —
// tratar as duas como a mesma coisa era o bug: a segunda nunca passou por
// ninguém do time e ficava escondida da fila mesmo precisando de alguém.
// `precisa_atribuicao` distingue os dois casos no banco (ver bloco de update
// em supabase/functions/whatsapp-webhook/index.ts) e volta a false assim que
// alguém assume (useWaSetResponsaveis).
function precisaAssumir(conv: WaConversa): boolean {
  return (conv.responsaveis ?? []).length === 0 && conv.precisa_atribuicao === true;
}

// Badge de não lidas. Quando a conversa está aberta (`ativa`) o contador não
// zera mais sozinho — só some quando o usuário envia uma resposta — então aqui
// trocamos o badge sólido por um contorno com ícone de olho, sinalizando que a
// conversa está sendo visualizada mas ainda conta como não lida.
function NaoLidasBadge({
  conv,
  ativa,
  currentUserId,
}: {
  conv: WaConversa;
  ativa: boolean;
  currentUserId?: string | null;
}) {
  if (!conversaNaoLida(conv, currentUserId)) return null;
  const label =
    conv.nao_lidas > 0 ? (conv.nao_lidas > 99 ? "99+" : conv.nao_lidas) : "";
  if (ativa) {
    return (
      <span
        title="Visualizando — a conversa continua não lida até você responder"
        className="flex h-5 items-center justify-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-1.5 text-[10px] font-bold text-destructive"
      >
        <Eye className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50 duration-300">
      {label}
    </span>
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
  size = "sm",
}: {
  conv: WaConversa;
  spacing?: "overlap" | "gap";
  size?: "sm" | "lg";
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
  const dimensionClass = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  const textClass = size === "lg" ? "text-[8px]" : "text-[7px]";

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
            "inline-block rounded-full",
            dimensionClass,
            overlap && "ring-2 ring-background",
          )}
        >
          {m.foto && <AvatarImage src={m.foto} alt="" />}
          <AvatarFallback
            className={cn(
              colorForPhone(m.chave),
              "text-white font-semibold",
              textClass,
            )}
          >
            {initials(m.nome, m.chave)}
          </AvatarFallback>
        </Avatar>
      ))}
      {restantes > 0 && (
        <Avatar
          className={cn(
            "inline-block rounded-full",
            dimensionClass,
            overlap && "ring-2 ring-background",
          )}
        >
          <AvatarFallback
            className={cn(
              "bg-muted text-muted-foreground font-semibold",
              textClass,
            )}
          >
            +{restantes}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// Pilha de avatares em miniatura de quem do time já abriu uma conversa "Não
// atribuída" sem assumi-la — é o que dá pro gestor ver, de relance, quem está
// entrando na conversa do cliente e não está respondendo. Fica ao lado do
// aviso "Conversa sem responsável!" no painel da conversa (não na sidebar):
// só existe uma vez que a conversa está aberta, então faz mais sentido perto
// do "Assumir"/"Direcionar" do que competindo por espaço na linha da lista.
// Anel laranja pontilhado ecoa o badge "Não atribuído" da sidebar. Clicável:
// abre o painel lateral (`VisualizadoresSheet`) com a lista completa — a
// pilha aqui só mostra até 3 avatares + "+N", igual ao "Visualizado por" do
// chat interno (Chat.tsx) resolve o mesmo limite de espaço.
function ConversaVisualizadoresStack({
  conv,
  onClick,
}: {
  conv: WaConversa;
  onClick: () => void;
}) {
  const membros = (conv.visualizadores ?? []).map((v) => ({
    nome: v.nome,
    chave: v.id,
    foto: v.avatar_url,
  }));
  if (membros.length === 0) return null;

  const visiveis = membros.slice(0, 3);
  const restantes = membros.length - visiveis.length;
  const nomesTitle = membros.map((m) => m.nome).join(", ");

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex -space-x-2 overflow-hidden shrink-0 rounded-full transition-opacity hover:opacity-80"
      title={`Visualizaram sem assumir: ${nomesTitle}`}
    >
      {visiveis.map((m, i) => (
        <Avatar
          key={`${m.chave}-${i}`}
          className="inline-block h-5 w-5 rounded-full ring-2 ring-background border border-dashed border-orange-400 dark:border-orange-500/60"
        >
          {m.foto && <AvatarImage src={m.foto} alt="" />}
          <AvatarFallback
            className={cn(colorForPhone(m.chave), "text-white font-semibold text-[7px]")}
          >
            {initials(m.nome, m.chave)}
          </AvatarFallback>
        </Avatar>
      ))}
      {restantes > 0 && (
        <Avatar className="inline-block h-5 w-5 rounded-full ring-2 ring-background">
          <AvatarFallback className="bg-muted text-muted-foreground font-semibold text-[7px]">
            +{restantes}
          </AvatarFallback>
        </Avatar>
      )}
    </button>
  );
}

// Painel lateral com a lista completa de quem visualizou a conversa sem
// assumir — aberto ao clicar em `ConversaVisualizadoresStack`, que só cabe
// 3 avatares. Mesmo padrão visual do "Visualizado por" do chat interno
// (Chat.tsx: Sheet + ScrollArea + linha avatar/nome/quando), adaptado pro
// dado que existe aqui: não há um "ainda não visualizou" pra mostrar, porque
// não existe uma lista fechada de "quem deveria ter visto" — qualquer
// pessoa da empresa pode abrir uma conversa não atribuída.
function VisualizadoresSheet({
  conv,
  open,
  onOpenChange,
}: {
  conv: WaConversa | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const visualizadores = [...(conv?.visualizadores ?? [])].sort(
    (a, b) => new Date(b.visualizado_em).getTime() - new Date(a.visualizado_em).getTime(),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-sm flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Visualizado por</SheetTitle>
          {conv && (
            <SheetDescription className="truncate">
              {conv.nome_contato ?? formatPhone(conv.telefone)}
            </SheetDescription>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="py-2">
            {visualizadores.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                Ninguém visualizou esta conversa ainda.
              </p>
            ) : (
              <>
                <p className="px-4 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Visualizaram sem assumir {visualizadores.length}
                </p>
                {visualizadores.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2">
                    <Avatar className="h-9 w-9 shrink-0 border border-dashed border-orange-400 dark:border-orange-500/60">
                      {v.avatar_url && <AvatarImage src={v.avatar_url} alt="" />}
                      <AvatarFallback className={cn(colorForPhone(v.id), "text-white font-semibold text-xs")}>
                        {initials(v.nome, v.id)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{v.nome}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {format(new Date(v.visualizado_em), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950 border-b border-primary/20 px-3 py-2 mt-1 first:mt-0">
      <Icon className="h-3 w-3 text-primary/70 shrink-0" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary truncate">
        {label}
      </p>
      <div className="flex-1" />
      {typeof count === "number" && (
        <span className="text-[9px] font-bold tabular-nums text-primary-foreground bg-primary rounded-full px-1.5 py-0.5 shrink-0">
          {count}
        </span>
      )}
    </div>
  );
}

// Visão "Lista" (é este o rótulo na tela, e o ícone é uma lista): as MESMAS
// conversas da visão normal, em formato espaçoso e sem o painel de mensagens
// ao lado.
//
// ⚠️ O nome interno mente e já causou confusão. Ele diz "Meus chats", mas esta
// visão NÃO filtra por responsável: recebe `conversasFiltradas` — exatamente a
// mesma lista da outra visão — e usa `currentUserId` só para contar não lidas.
// Quem filtra por responsável é o agrupamento da barra lateral
// ("Meus chats" / "Não atribuídos" / "Outros atendentes"), que é outra coisa.
// Renomear `MeusChatsList` e o estado "meus-chats" para algo como "lista" está
// pendente; até lá, leia o nome como decoração.
function MeusChatsList({
  conversas,
  apelidoPorInstanciaId,
  onOpen,
  onVoltarNormal,
  busca,
  setBusca,
  filtroStatus,
  setFiltroStatus,
  countAbertas,
  countFechadas,
  filtrosDropdownContent,
  periodoFilterButton,
  hasFiltros,
  activeFiltrosCount,
  onLimparFiltros,
  currentUserId,
}: {
  conversas: WaConversa[];
  apelidoPorInstanciaId: Map<string, string>;
  onOpen: (id: string) => void;
  onVoltarNormal: () => void;
  busca: string;
  setBusca: (v: string) => void;
  filtroStatus: "aberto" | "fechado";
  setFiltroStatus: (v: "aberto" | "fechado") => void;
  countAbertas: number;
  countFechadas: number;
  filtrosDropdownContent: React.ReactNode;
  periodoFilterButton: React.ReactNode;
  currentUserId?: string | null;
  hasFiltros: boolean;
  activeFiltrosCount: number;
  onLimparFiltros: () => void;
}) {
  // Mesmos filtros da visualização normal (Conversa/Período/Instância/
  // Responsável/status, vindos via props já aplicados em `conversas`) — só
  // "não lidas/lidas" é um refinamento extra, exclusivo desta visão em lista.
  const [filtroLeitura, setFiltroLeitura] = useState<
    "todas" | "nao_lidas" | "lidas"
  >("todas");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const countNaoLidas = conversas.filter((c) =>
    conversaNaoLida(c, currentUserId),
  ).length;
  const countLidas = conversas.length - countNaoLidas;

  const conversasFiltradas = conversas.filter((c) => {
    if (filtroLeitura === "nao_lidas") return conversaNaoLida(c, currentUserId);
    if (filtroLeitura === "lidas") return !conversaNaoLida(c, currentUserId);
    return true;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(conversasFiltradas.length / pageSize),
  );
  const safePage = Math.min(page, totalPages);
  const paginadas = conversasFiltradas.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 flex flex-col gap-3">
        {/* Mesma linha de filtros da visualização normal (Em aberto/Fechado +
            Filtros + Limpar), pra essa lista deixar de ser restrita só a
            "atribuído a mim" e refletir os mesmos filtros globais. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className={cn(TOGGLE_LIST_CLASS, "w-fit shrink-0")}>
            {(
              [
                ["aberto", "Em aberto", countAbertas],
                ["fechado", "Fechado", countFechadas],
              ] as const
            ).map(([val, label, count]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFiltroStatus(val)}
                className={cn(
                  TOGGLE_BUTTON_CLASS,
                  filtroStatus === val
                    ? TOGGLE_BUTTON_ACTIVE
                    : TOGGLE_BUTTON_INACTIVE,
                )}
              >
                {label}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    filtroStatus === val
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted-foreground/10",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <FilterButton
            hasFilters={hasFiltros}
            activeFilterCount={activeFiltrosCount}
            align="start"
            popoverClassName="w-auto"
          >
            {filtrosDropdownContent}
          </FilterButton>
          {periodoFilterButton}
          {hasFiltros && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 shrink-0 gap-1.5 px-2.5 text-muted-foreground hover:text-destructive"
              onClick={onLimparFiltros}
              title="Limpar filtros"
            >
              <FilterX className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
          <Button
            variant="outline"
            className="h-10 gap-1.5 shrink-0 ml-auto"
            onClick={onVoltarNormal}
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
            Visualização normal
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className={cn(TOGGLE_LIST_CLASS, "w-fit shrink-0")}>
            {(
              [
                { key: "todas", label: "Todas", count: conversas.length },
                { key: "nao_lidas", label: "Não lidas", count: countNaoLidas },
                { key: "lidas", label: "Lidas", count: countLidas },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setFiltroLeitura(opt.key);
                  setPage(1);
                }}
                className={cn(
                  TOGGLE_BUTTON_CLASS,
                  filtroLeitura === opt.key
                    ? TOGGLE_BUTTON_ACTIVE
                    : TOGGLE_BUTTON_INACTIVE,
                )}
              >
                {opt.label}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    filtroLeitura === opt.key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted-foreground/10",
                  )}
                >
                  {opt.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 bg-muted/50 border-transparent focus-visible:ring-1"
              placeholder="Buscar por nome, telefone ou mensagem..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4 sm:p-6">
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-border overflow-hidden">
          {conversasFiltradas.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">
                Nenhuma conversa encontrada
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Tente buscar por outro nome, telefone ou responsável.
              </p>
            </div>
          ) : (
            <Table wrapperClassName="flex-1 min-h-0">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="sticky top-0 z-10 bg-muted min-w-[220px] whitespace-nowrap px-4 py-3 text-xs font-semibold">
                    Contato
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted min-w-[240px] whitespace-nowrap px-4 py-3 text-xs font-semibold">
                    Última mensagem
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold">
                    Responsáveis
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted w-[220px] whitespace-nowrap px-4 py-3 text-xs font-semibold">
                    Instância
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted w-[90px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold">
                    Horário
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginadas.map((conv) => {
                  const apelidoInstancia = conv.instancia_id
                    ? apelidoPorInstanciaId.get(conv.instancia_id)
                    : undefined;
                  return (
                    <TableRow
                      key={conv.id}
                      onClick={() => onOpen(conv.id)}
                      className="cursor-pointer hover:bg-muted/30"
                    >
                      <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <ConversaAvatar conv={conv} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm text-foreground",
                                  conversaNaoLida(conv, currentUserId)
                                    ? "font-bold"
                                    : "font-semibold",
                                )}
                              >
                                {conv.nome_contato ??
                                  formatPhone(conv.telefone)}
                              </span>
                              {conv.arquivada && (
                                <Badge
                                  variant="secondary"
                                  className="h-4 shrink-0 px-1.5 py-0 text-[9px]"
                                >
                                  Arquivada
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatPhone(conv.telefone)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 max-w-[320px]">
                        <span
                          className={cn(
                            "block truncate text-sm text-muted-foreground",
                            conversaNaoLida(conv, currentUserId) &&
                              "text-foreground font-medium",
                          )}
                        >
                          <UltimaMensagemPreview mensagem={conv.ultima_mensagem} />
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <ConversaParticipantesStack conv={conv} />
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        {apelidoInstancia ? (
                          <Badge
                            variant="outline"
                            className="max-w-[200px] truncate px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                          >
                            <span className="truncate">{apelidoInstancia}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <NaoLidasBadge
                            conv={conv}
                            ativa={false}
                            currentUserId={currentUserId}
                          />
                          {conv.ultima_mensagem_at && (
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                              {formatTime(conv.ultima_mensagem_at)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {conversasFiltradas.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted px-4 py-3">
              <ListPagination
                page={safePage}
                totalPages={totalPages}
                totalItems={conversasFiltradas.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
                itemLabel="conversa"
              />
            </div>
          )}
        </div>
      </div>
    </div>
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

const AUDIO_SPEEDS = [1, 1.5, 2] as const;

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
  const [playbackRate, setPlaybackRate] = useState<(typeof AUDIO_SPEEDS)[number]>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, src]);

  const cycleSpeed = () => {
    setPlaybackRate((prev) => {
      const idx = AUDIO_SPEEDS.indexOf(prev);
      return AUDIO_SPEEDS[(idx + 1) % AUDIO_SPEEDS.length];
    });
  };

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

        <div className="flex justify-between items-center text-[9px] px-0.5">
          <span className={cn("opacity-75", isSaida ? "text-white/90" : "text-muted-foreground")}>
            {formatAudioTime(currentTime || duration)}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            className={cn(
              "rounded-full px-1.5 py-0.5 font-semibold leading-none transition-colors",
              isSaida
                ? "bg-white/20 hover:bg-white/30 text-white"
                : "bg-black/5 hover:bg-black/10 text-foreground",
            )}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}

// Preview compacto da última mensagem nos cards de conversa: troca o texto cru
// "[Tipo]" salvo pelo webhook por um ícone + rótulo legível. Mapa e lista de
// placeholders vêm de wa-mensagem-preview.ts — compartilhados com o toast de
// "nova mensagem" em use-whatsapp-inbox.ts, pro mesmo ícone/rótulo valer nos
// dois lugares.
function UltimaMensagemPreview({
  mensagem,
}: {
  mensagem: string | null | undefined;
}) {
  const info = infoPreviewMensagem(mensagem);
  if (!info) return <>{mensagem ?? "Nenhuma mensagem"}</>;
  const Icon = info.icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

// Preview compacto da mensagem citada, tanto dentro da bolha (mensagem já enviada
// com reply) quanto acima do textarea (enquanto o usuário está respondendo).
function QuotedPreview({
  remetenteNome,
  conteudo,
  tipo,
  isSaida,
  onClick,
  onCancel,
}: {
  remetenteNome: string | null | undefined;
  conteudo: string | null | undefined;
  tipo: string | null | undefined;
  isSaida?: boolean;
  onClick?: () => void;
  onCancel?: () => void;
}) {
  const label = remetenteNome || "Você";
  const texto =
    conteudo && !MENSAGEM_PLACEHOLDERS.includes(conteudo) ? conteudo : conteudo || "";
  return (
    <div
      data-no-drag={onClick ? true : undefined}
      className={cn(
        "flex items-stretch gap-2 rounded-md pl-2 pr-2 py-1.5 mb-1.5 cursor-pointer overflow-hidden",
        isSaida ? "bg-white/10" : "bg-black/5 dark:bg-white/5",
        onClick && "hover:opacity-80",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "w-[3px] rounded-full shrink-0",
          isSaida ? "bg-white/60" : "bg-primary/70",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-semibold truncate",
            isSaida ? "text-white" : "text-primary",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-xs truncate",
            isSaida ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {texto}
        </p>
      </div>
      {onCancel && (
        <button
          type="button"
          className="shrink-0 self-start text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// Envolve a bolha de mensagem com o gesto de "puxar para responder" (arrastar
// horizontalmente, como no WhatsApp) e um botão de responder que aparece no hover —
// funciona igual em grupos e conversas individuais, já que ambos usam o mesmo bloco
// de renderização de mensagens.
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Reagir"
          className={cn(
            "h-6 w-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground opacity-0 group-hover/bubble:opacity-100 transition-opacity",
            open && "opacity-100",
          )}
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto p-1 flex gap-0.5"
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="text-lg leading-none p-1.5 rounded-full hover:bg-accent hover:scale-125 transition-transform"
            onClick={() => {
              setOpen(false);
              onPick(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Agrupa as reações por emoji e exibe como um "balãozinho" sobreposto ao canto
// inferior da bolha, igual ao WhatsApp — clicar de novo no próprio emoji remove a
// reação (a mutation já trata isso como toggle).
function ReactionBadge({
  reacoes,
  isSaida,
  onToggle,
}: {
  reacoes: WaReacao[];
  isSaida: boolean;
  onToggle: (emoji: string) => void;
}) {
  if (reacoes.length === 0) return null;
  const grupos = new Map<string, WaReacao[]>();
  for (const r of reacoes) {
    grupos.set(r.emoji, [...(grupos.get(r.emoji) ?? []), r]);
  }
  const minhaReacao = reacoes.find((r) => r.autor === "eu")?.emoji;

  return (
    <div
      className={cn(
        "absolute -bottom-2.5 flex items-center gap-0.5 bg-background border border-border rounded-full px-1 py-0.5 shadow-sm",
        isSaida ? "left-1" : "right-1",
      )}
      title={reacoes.map((r) => `${r.nome}: ${r.emoji}`).join(", ")}
    >
      {[...grupos.entries()].map(([emoji, rs]) => (
        <button
          key={emoji}
          type="button"
          className={cn(
            "text-xs leading-none flex items-center gap-0.5 px-0.5 rounded-full",
            emoji === minhaReacao && "bg-primary/10",
          )}
          onClick={() => onToggle(emoji)}
        >
          <span>{emoji}</span>
          {rs.length > 1 && (
            <span className="text-[9px] text-muted-foreground">
              {rs.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function DraggableBubble({
  msg,
  isSaida,
  onReply,
  onReact,
  onExcluir,
  children,
}: {
  msg: WaMensagem;
  isSaida: boolean;
  onReply: (msg: WaMensagem) => void;
  onReact: (msg: WaMensagem, emoji: string) => void;
  onExcluir: (msg: WaMensagem) => void;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const triggeredRef = useRef(false);
  const THRESHOLD = 56;
  const MAX_DRAG = 72;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    // [data-no-drag] cobre o QuotedPreview (citação clicável dentro da bolha) — sem
    // isso, a captura de ponteiro do swipe-to-reply competia com o clique nele.
    if (target.closest("a, button, video, audio, img, [data-no-drag]")) return;
    setDragging(true);
    triggeredRef.current = false;
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const delta = e.clientX - startXRef.current;
    // Só reage ao arraste "puxando" a bolha para o centro da tela (como no WhatsApp):
    // mensagens enviadas (alinhadas à direita) puxam para a esquerda, recebidas para a direita.
    const relevant = isSaida
      ? Math.min(0, Math.max(-MAX_DRAG, delta))
      : Math.max(0, Math.min(MAX_DRAG, delta));
    setDragX(relevant);
    if (!triggeredRef.current && Math.abs(relevant) >= THRESHOLD) {
      triggeredRef.current = true;
    }
  }

  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    if (triggeredRef.current) onReply(msg);
    setDragX(0);
  }

  const dragProgress = Math.min(1, Math.abs(dragX) / THRESHOLD);

  return (
    <div
      className="relative group/bubble touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="absolute inset-y-0 flex items-center text-muted-foreground pointer-events-none"
        style={{
          [isSaida ? "right" : "left"]: 0,
          opacity: dragProgress,
          transform: `scale(${0.6 + dragProgress * 0.4})`,
        }}
      >
        <Reply className="h-4 w-4" />
      </div>
      <div
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.15s ease-out",
        }}
      >
        {children}
      </div>
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 whitespace-nowrap",
          isSaida ? "right-full mr-1.5 flex-row-reverse" : "left-full ml-1.5",
        )}
      >
        <button
          type="button"
          title="Responder"
          onClick={() => onReply(msg)}
          className="h-6 w-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground opacity-0 group-hover/bubble:opacity-100 transition-opacity"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        <ReactionPicker onPick={(emoji) => onReact(msg, emoji)} />
        {!msg.apagada_para_todos && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Mais opções"
                className="h-6 w-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground opacity-0 group-hover/bubble:opacity-100 transition-opacity"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            {/* data-no-drag: os itens do Radix DropdownMenuItem renderizam <div
                role="menuitem">, não <button> — sem essa marcação, o onPointerDown
                de swipe-to-reply da bolha (que só ignora button/a/img/video/audio)
                capturava o ponteiro antes do clique chegar ao Radix, fechando o menu
                sem disparar a ação. */}
            <DropdownMenuContent
              align={isSaida ? "end" : "start"}
              data-no-drag
            >
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onExcluir(msg)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Excluir mensagem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function MessageContent({
  msg,
  isSaida,
  onImageClick,
  onPreviewFile,
  conversaAtiva,
}: {
  msg: WaMensagem;
  isSaida: boolean;
  onImageClick?: (url: string, msgId?: string) => void;
  onPreviewFile?: (file: FilePreviewTarget) => void;
  conversaAtiva: WaConversa;
}) {
  const textCls = isSaida ? "text-white" : "text-foreground";

  if (msg.apagada_para_todos) {
    return (
      <p className={cn("text-sm italic flex items-center gap-1.5", isSaida ? "text-white/70" : "text-muted-foreground")}>
        <EyeOff className="h-3.5 w-3.5 shrink-0" />
        Esta mensagem foi apagada
      </p>
    );
  }

  if (msg.tipo === "imagem" && msg.media_url) {
    return (
      <div className="flex flex-col -mx-2 -mt-1 -mb-1 max-w-[240px] sm:max-w-[280px]">
        <img
          src={msg.media_url}
          alt="imagem"
          className="w-full rounded-[14px] cursor-pointer hover:opacity-90 transition-opacity object-cover shadow-sm"
          onClick={() => {
            if (onImageClick) {
              onImageClick(msg.media_url!, msg.id);
            } else {
              window.open(msg.media_url!, "_blank");
            }
          }}
        />
        {msg.conteudo && !MENSAGEM_PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn("text-sm mt-1.5 px-2 pb-0.5", textCls)}>
            {linkifyText(msg.conteudo)}
          </p>
        )}
      </div>
    );
  }

  if (msg.tipo === "sticker" && msg.media_url) {
    return (
      <div className="flex flex-col -mx-2 -mt-1 -mb-1">
        <img
          src={msg.media_url}
          alt="figurinha"
          className="w-[128px] h-[128px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => {
            if (onImageClick) {
              onImageClick(msg.media_url!, msg.id);
            } else {
              window.open(msg.media_url!, "_blank");
            }
          }}
        />
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
        {msg.conteudo && !MENSAGEM_PLACEHOLDERS.includes(msg.conteudo) && (
          <p className={cn("text-sm mt-1.5 px-2 pb-0.5", textCls)}>
            {linkifyText(msg.conteudo)}
          </p>
        )}
      </div>
    );
  }

  const renderFileChip = (label: string, url: string, mime?: string) => {
    const previewable = onPreviewFile && isPreviewable(label, mime);
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
          onClick={() => onPreviewFile!({ url, nome: label, mime })}
        >
          {content}
        </button>
      );
    }

    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={sharedClassName}>
        {content}
      </a>
    );
  };

  if (msg.tipo === "documento" && msg.media_url) {
    const label = !MENSAGEM_PLACEHOLDERS.includes(msg.conteudo)
      ? msg.conteudo
      : "Documento anexado";
    return renderFileChip(label, msg.media_url, msg.media_mime);
  }

  // Anexo com URL cujo tipo não bateu em nenhum caso específico acima (ex.: tipo
  // desalinhado com o mimetype real) — mostra um chip de download genérico em vez
  // de deixar o anexo invisível.
  if (msg.media_url) {
    const label = !MENSAGEM_PLACEHOLDERS.includes(msg.conteudo)
      ? msg.conteudo
      : "Arquivo anexado";
    return renderFileChip(label, msg.media_url, msg.media_mime);
  }

  // Tipo indica anexo de mídia, mas o download/descriptografia falhou no webhook
  // (media_url ficou null) — mostra aviso em vez de texto puro sem contexto.
  if (["imagem", "sticker", "audio", "video", "documento"].includes(msg.tipo)) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2.5 rounded-lg border w-[220px] sm:w-[260px]",
          isSaida ? "bg-white/10 border-white/20" : "bg-muted/50 border-border",
        )}
      >
        <FileText className={cn("h-5 w-5 shrink-0 opacity-70", textCls)} />
        <span className={cn("text-sm", textCls)}>
          Não foi possível carregar este arquivo
        </span>
      </div>
    );
  }

  return (
    <span className="text-sm whitespace-pre-wrap break-words">
      {linkifyText(msg.conteudo)}
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
  onJumpToMessage,
}: {
  conversa: WaConversa;
  participantesGrupo: { nome: string | null; telefone: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImageClick: (url: string, msgId?: string) => void;
  onPreviewFile: (file: FilePreviewTarget) => void;
  onJumpToMessage: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: vendedores = [] } = useVendedores();
  const setResponsaveis = useWaSetResponsaveis();
  const addNota = useWaAddNota();
  const renomearContato = useWaRenomearContato();
  const [editarNomeOpen, setEditarNomeOpen] = useState(false);
  const [nomeEditado, setNomeEditado] = useState("");
  function handleSalvarNomeContato() {
    const nome = nomeEditado.trim();
    if (!nome || nome === conversa.nome_contato) {
      setEditarNomeOpen(false);
      return;
    }
    renomearContato.mutate({ conversaId: conversa.id, nome });
    setEditarNomeOpen(false);
  }
  const { data: mensagens = [] } = useWaMensagens(conversa.id);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportRange, setExportRange] = useState<DateRange>(() => ({
    from: new Date(2000, 0, 1),
    to: new Date(),
  }));
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | "md" | null>(null);
  async function handleExportarConversa(formato: "pdf" | "xlsx" | "md") {
    setExportando(formato);
    try {
      const nomeContato = conversa.nome_contato ?? formatPhone(conversa.telefone);
      const mensagensPeriodo = await fetchMensagensParaExportar(
        conversa.id,
        exportRange.from,
        exportRange.to,
      );
      if (mensagensPeriodo.length === 0) {
        toast.info("Nenhuma mensagem encontrada no período selecionado.");
        return;
      }
      const linhas = buildConversaExportRows(mensagensPeriodo, nomeContato);
      const periodoLabel = `${format(exportRange.from, "dd/MM/yyyy", { locale: ptBR })} a ${format(exportRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
      if (formato === "pdf") {
        const { generateConversaPdf } = await import("@/lib/generate-conversa-pdf");
        await generateConversaPdf(linhas, nomeContato, periodoLabel);
      } else if (formato === "xlsx") {
        const { generateConversaExcel } = await import("@/lib/generate-conversa-excel");
        generateConversaExcel(linhas, nomeContato);
      } else {
        const { generateConversaMarkdown } = await import("@/lib/generate-conversa-markdown");
        generateConversaMarkdown(linhas, nomeContato, periodoLabel);
      }
      setExportDialogOpen(false);
    } catch (err) {
      console.error("[wa] erro ao exportar conversa:", err);
      toast.error("Não foi possível exportar a conversa.");
    } finally {
      setExportando(null);
    }
  }
  const { data: tarefasConversa = [] } = useTarefasPorConversa(conversa.id);
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  // Notas internas (mensagens is_nota_interna) criadas a partir desta conversa,
  // mais recente primeiro — tarefasConversa já vem ordenada desc pelo hook.
  const notasConversa = useMemo(
    () =>
      mensagens
        .filter((m) => m.is_nota_interna)
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [mensagens],
  );
  const atuais = conversa.responsaveis ?? [];
  const atuaisIds = useMemo(() => new Set(atuais.map((r) => r.id)), [atuais]);
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
    const documentos = mensagens.filter(
      (m) => m.tipo === "documento" && m.media_url,
    );

    const urlRegex = /https?:\/\/[^\s]+/g;
    const links: {
      id: string;
      msgId: string;
      url: string;
      created_at: string;
    }[] = [];
    for (const m of mensagens) {
      if (!m.conteudo) continue;
      const matches = m.conteudo.match(urlRegex);
      if (!matches) continue;
      matches.forEach((raw, i) => {
        const url = raw.replace(/[.,;:!?)\]]+$/, "");
        links.push({
          id: `${m.id}-${i}`,
          msgId: m.id,
          url,
          created_at: m.created_at,
        });
      });
    }

    return { imagens, videos, documentos, links };
  }, [mensagens]);

  const [expandedMediaTab, setExpandedMediaTab] = useState<
    "imagens" | "videos" | "documentos" | "links" | null
  >(null);

  const MEDIA_PREVIEW_LIMIT = 3;

  const [expandedHistoricoTab, setExpandedHistoricoTab] = useState<
    "notas" | "tarefas" | null
  >(null);
  const HISTORICO_PREVIEW_LIMIT = 3;

  const [participantesExpandido, setParticipantesExpandido] = useState(false);
  const PARTICIPANTES_PREVIEW_LIMIT = 5;

  const renderNotasList = (items: typeof notasConversa) => (
    <ul className="space-y-2">
      {items.map((n) => (
        <li
          key={n.id}
          className="flex items-start gap-2.5 p-2 rounded-lg border border-amber-200/70 dark:border-amber-900/50 bg-amber-100 dark:bg-amber-950/50"
        >
          <div className="p-1.5 rounded-md bg-background text-amber-600 dark:text-amber-400 shrink-0">
            <StickyNote className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs break-words text-foreground">{linkifyText(n.conteudo)}</p>
            <p className="text-[10px] text-amber-700/70 dark:text-amber-300/60">
              {format(new Date(n.created_at), "dd/MM/yyyy HH:mm", {
                locale: ptBR,
              })}
              {n.fixada && " · fixada"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );

  const renderTarefasList = (items: typeof tarefasConversa) => (
    <ul className="space-y-2">
      {items.map((t) => (
        <li
          key={t.id}
          className="flex items-start gap-2.5 p-2 rounded-lg border bg-muted/30"
        >
          <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
            <ListTodo className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{t.titulo}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.status}
              {t.prazo_final &&
                ` · prazo ${format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR })}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );

  const renderImagens = (items: typeof midia.imagens) => (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((m) => (
        <button
          key={m.id}
          type="button"
          className="aspect-square rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity"
          onClick={() => onImageClick(m.media_url!, m.id)}
          title={format(new Date(m.created_at), "dd/MM/yyyy HH:mm", {
            locale: ptBR,
          })}
        >
          <img
            src={m.media_url!}
            alt="imagem"
            className="h-full w-full object-cover"
          />
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
          onClick={() =>
            window.open(m.media_url!, "_blank", "noopener,noreferrer")
          }
          title={format(new Date(m.created_at), "dd/MM/yyyy HH:mm", {
            locale: ptBR,
          })}
        >
          <video
            src={m.media_url!}
            className="h-full w-full object-cover"
            muted
          />
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
        const label = !MENSAGEM_PLACEHOLDERS.includes(m.conteudo)
          ? m.conteudo
          : "Documento anexado";
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
                  ? () =>
                      onPreviewFile({
                        url: m.media_url!,
                        nome: label,
                        mime: m.media_mime,
                        msgId: m.id,
                      })
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
                  {format(new Date(m.created_at), "dd MMM, HH:mm", {
                    locale: ptBR,
                  })}
                </p>
              </div>
              {/* Documentos sem pré-visualização não abrem nenhum modal, então
                  o botão de ir-até-a-mensagem fica aqui mesmo, na linha. Para
                  os que têm preview, o botão vive dentro do FilePreviewDialog. */}
              {!previewable && (
                <button
                  type="button"
                  title="Ir para a mensagem na conversa"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToMessage(m.id);
                  }}
                  className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadFile(m.media_url!, label);
                }}
                className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
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
            <div className="flex items-center gap-2.5 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 min-w-0 flex-1"
              >
                <div className="p-1.5 rounded-md bg-background text-primary shrink-0">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" title={l.url}>
                    {host}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {l.url}
                  </p>
                </div>
              </a>
              <button
                type="button"
                title="Ir para a mensagem na conversa"
                onClick={() => onJumpToMessage(l.msgId)}
                className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
              </button>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir link"
                className="shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const MEDIA_TAB_LABELS: Record<
    "imagens" | "videos" | "documentos" | "links",
    string
  > = {
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
        // `clientes` não tem coluna `slug` — pedi-la fazia o PostgREST recusar a
        // consulta INTEIRA, e o painel "Dados do lead" nunca aparecia. O slug da
        // URL é montado no cliente (ver navigate abaixo), não vem do banco.
        .select("id, empresa, email, telefone")
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
        // `contatos` não tem `nome` nem `slug`: o nome da pessoa está em
        // `nome_contato`. Pedir colunas inexistentes fazia a consulta ser
        // recusada inteira e o painel "Dados do lead" ficava sempre vazio.
        .select("id, nome_contato, email, telefone")
        .eq("id", conversa.contato_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  function toggle(uid: string) {
    const isRemoving = atuaisIds.has(uid);
    const novosIds = isRemoving
      ? atuais.filter((r) => r.id !== uid).map((r) => r.id)
      : [...atuais.map((r) => r.id), uid];
    setResponsaveis.mutate({ conversaId: conversa.id, usuarioIds: novosIds });

    const autor = profile?.nome ?? "Alguém";
    const alvoNome = vendedores.find((v) => v.id === uid)?.nome ?? "alguém";
    const texto =
      uid === profile?.id
        ? isRemoving
          ? `${autor} saiu dos responsáveis desta conversa`
          : `${autor} assumiu esta conversa`
        : isRemoving
          ? `${autor} removeu ${alvoNome} dos responsáveis`
          : `${autor} adicionou ${alvoNome} como responsável`;
    addNota.mutate({ conversaId: conversa.id, texto });
  }

  const displayName = conversa.nome_contato ?? formatPhone(conversa.telefone);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 py-5 border-b">
          <div className="flex flex-col items-center gap-3 text-center">
            <button
              type="button"
              onClick={() =>
                conversa.foto_perfil_url &&
                onImageClick(conversa.foto_perfil_url)
              }
              disabled={!conversa.foto_perfil_url}
              title={
                conversa.foto_perfil_url ? "Ver foto de perfil" : undefined
              }
              className={cn(
                "rounded-full",
                conversa.foto_perfil_url &&
                  "cursor-pointer transition-opacity hover:opacity-80",
              )}
            >
              <Avatar className="h-20 w-20 border border-primary/10">
                {conversa.foto_perfil_url && (
                  <AvatarImage src={conversa.foto_perfil_url} alt="" />
                )}
                <AvatarFallback
                  className={cn(
                    colorForPhone(conversa.telefone),
                    "text-white text-2xl font-semibold",
                  )}
                >
                  {initials(conversa.nome_contato, conversa.telefone)}
                </AvatarFallback>
              </Avatar>
            </button>
            <div className="min-w-0">
              <div className="flex items-center justify-center gap-1.5">
                <SheetTitle className="text-base font-bold leading-tight truncate">
                  {displayName}
                </SheetTitle>
                {!conversa.is_group && (
                  <Popover
                    open={editarNomeOpen}
                    onOpenChange={(v) => {
                      setEditarNomeOpen(v);
                      if (v) setNomeEditado(conversa.nome_contato ?? "");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Editar nome do contato"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 space-y-2">
                      <Label className="text-xs">Nome do contato</Label>
                      <Input
                        value={nomeEditado}
                        onChange={(e) => setNomeEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSalvarNomeContato();
                        }}
                        placeholder="Nome do contato"
                        autoFocus
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Também atualiza o nome salvo no WhatsApp real deste
                        contato.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditarNomeOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={renomearContato.isPending}
                          onClick={handleSalvarNomeContato}
                        >
                          {renomearContato.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Salvar"
                          )}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
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
                        navigate(`/clientes/${slugify(cliente.empresa || "cliente")}-${cliente.id}`);
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
                        navigate(`/contatos/${slugify(contato.nome_contato || "contato")}-${contato.id}`);
                        onOpenChange(false);
                      }}
                    >
                      {contato.nome_contato}
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

          {/* Data de início e exportação da conversa */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
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

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileDown className="h-3 w-3" /> Exportar conversa
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-2"
                onClick={() => setExportDialogOpen(true)}
              >
                <FileDown className="h-3.5 w-3.5" /> Exportar mensagens
              </Button>
            </div>
          </div>

          <Separator />

          {/* Mídia, links e documentos */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Mídia, links e documentos
            </p>
            <Tabs defaultValue="imagens" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-9 items-center rounded-lg border border-muted-foreground/25 overflow-hidden">
                <TabsTrigger
                  value="imagens"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
                  Imagens
                  {midia.imagens.length > 0 && ` (${midia.imagens.length})`}
                </TabsTrigger>
                <TabsTrigger
                  value="videos"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
                  Vídeos{midia.videos.length > 0 && ` (${midia.videos.length})`}
                </TabsTrigger>
                <TabsTrigger
                  value="documentos"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
                  Docs
                  {midia.documentos.length > 0 &&
                    ` (${midia.documentos.length})`}
                </TabsTrigger>
                <TabsTrigger
                  value="links"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
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
                    {renderDocumentos(
                      midia.documentos.slice(0, MEDIA_PREVIEW_LIMIT),
                    )}
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

          <Dialog
            open={!!expandedMediaTab}
            onOpenChange={(v) => !v && setExpandedMediaTab(null)}
          >
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {expandedMediaTab ? MEDIA_TAB_LABELS[expandedMediaTab] : ""}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-1">
                {expandedMediaTab === "imagens" && renderImagens(midia.imagens)}
                {expandedMediaTab === "videos" && renderVideos(midia.videos)}
                {expandedMediaTab === "documentos" &&
                  renderDocumentos(midia.documentos)}
                {expandedMediaTab === "links" && renderLinks(midia.links)}
              </div>
            </DialogContent>
          </Dialog>

          <Separator />

          {/* Histórico de notas internas e tarefas criadas a partir desta conversa —
              mesmo padrão de abas usado em "Mídia, links e documentos" abaixo. */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              {/* Deixar "Notas e tarefas" escrito numa empresa sem a seção é o vazamento
                  mais óbvio desta tela. */}
              <StickyNote className="h-3 w-3" /> {temTarefas === true ? 'Notas e tarefas' : 'Notas'}
            </p>
            <Tabs defaultValue="notas" className="w-full">
              {/* As duas classes escritas por extenso, de propósito: o Tailwind não gera
                  classe montada em texto (`grid-cols-${n}` nunca existiria no CSS final).
                  Sem isto, a aba Notas ocupa metade e a outra metade vira um buraco. */}
              <TabsList className={cn('grid w-full h-9 items-center rounded-lg border border-muted-foreground/25 overflow-hidden', temTarefas === true ? 'grid-cols-2' : 'grid-cols-1')}>
                <TabsTrigger
                  value="notas"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
                  Notas
                  {notasConversa.length > 0 && ` (${notasConversa.length})`}
                </TabsTrigger>
                {temTarefas === true && (
                <TabsTrigger
                  value="tarefas"
                  className="text-[10px] px-1 py-1 rounded-md border border-transparent data-[state=active]:border-muted-foreground/40 data-[state=active]:shadow-none"
                >
                  Tarefas
                  {tarefasConversa.length > 0 && ` (${tarefasConversa.length})`}
                </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="notas" className="mt-3">
                {notasConversa.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhuma nota registrada nesta conversa.
                  </p>
                ) : (
                  <>
                    {renderNotasList(
                      notasConversa.slice(0, HISTORICO_PREVIEW_LIMIT),
                    )}
                    {notasConversa.length > HISTORICO_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedHistoricoTab("notas")}
                      >
                        Ver mais... (+
                        {notasConversa.length - HISTORICO_PREVIEW_LIMIT})
                      </button>
                    )}
                  </>
                )}
              </TabsContent>

              {temTarefas === true && (
              <TabsContent value="tarefas" className="mt-3">
                {tarefasConversa.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-6 text-center">
                    Nenhuma tarefa criada a partir desta conversa.
                  </p>
                ) : (
                  <>
                    {renderTarefasList(
                      tarefasConversa.slice(0, HISTORICO_PREVIEW_LIMIT),
                    )}
                    {tarefasConversa.length > HISTORICO_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpandedHistoricoTab("tarefas")}
                      >
                        Ver mais... (+
                        {tarefasConversa.length - HISTORICO_PREVIEW_LIMIT})
                      </button>
                    )}
                  </>
                )}
              </TabsContent>
              )}
            </Tabs>
          </div>

          <Dialog
            open={!!expandedHistoricoTab}
            onOpenChange={(v) => !v && setExpandedHistoricoTab(null)}
          >
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {expandedHistoricoTab === "notas" ? "Notas" : "Tarefas"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-1">
                {expandedHistoricoTab === "notas" &&
                  renderNotasList(notasConversa)}
                {expandedHistoricoTab === "tarefas" &&
                  renderTarefasList(tarefasConversa)}
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
                  <>
                    <ul className="space-y-0.5">
                      {(participantesExpandido
                        ? participantesGrupo
                        : participantesGrupo.slice(
                            0,
                            PARTICIPANTES_PREVIEW_LIMIT,
                          )
                      ).map((p) => (
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
                    {participantesGrupo.length >
                      PARTICIPANTES_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="w-full text-center text-xs font-medium text-primary hover:underline"
                        onClick={() => setParticipantesExpandido((v) => !v)}
                      >
                        {participantesExpandido
                          ? "Ver menos"
                          : `Ver mais (+${
                              participantesGrupo.length -
                              PARTICIPANTES_PREVIEW_LIMIT
                            })`}
                      </button>
                    )}
                  </>
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
                    className="flex items-center gap-2 pl-1.5 pr-2 py-1.5"
                  >
                    <Avatar className="h-5 w-5">
                      {r.avatar_url ? (
                        <img
                          src={r.avatar_url}
                          alt={r.nome}
                          className="h-full w-full object-cover rounded-full"
                        />
                      ) : (
                        <AvatarFallback className="text-[8px] bg-primary text-primary-foreground">
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
                    <span className="text-sm">{r.nome.split(" ")[0]}</span>
                    <button
                      onClick={() => toggle(r.id)}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
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

          <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Exportar conversa</DialogTitle>
                <DialogDescription>
                  Escolha o período e o formato do arquivo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Período
                  </Label>
                  <DateRangePicker value={exportRange} onChange={setExportRange} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    disabled={!!exportando}
                    onClick={() => handleExportarConversa("pdf")}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {exportando === "pdf" ? (
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    ) : (
                      <FileDown className="h-6 w-6 text-muted-foreground" />
                    )}
                    PDF
                  </button>
                  <button
                    type="button"
                    disabled={!!exportando}
                    onClick={() => handleExportarConversa("xlsx")}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {exportando === "xlsx" ? (
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                    )}
                    Excel
                  </button>
                  <button
                    type="button"
                    disabled={!!exportando}
                    onClick={() => handleExportarConversa("md")}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {exportando === "md" ? (
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    ) : (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    )}
                    Markdown
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
  // Nomenclatura padronizada entre vendedor e admin/gestor: "Meus chats" é
  // sempre "atribuídos a mim", em qualquer perfil. Admin/gestor enxergam a
  // empresa toda, mas diferenciam o que é deles do resto da equipe pelo
  // filtro "Outros atendentes" (abaixo), em vez de um rótulo próprio.
  const meuChatsLabel = "Meus chats";
  const { data: vendedores = [] } = useVendedores();
  const setResponsaveis = useWaSetResponsaveis();
  const addNota = useWaAddNota();

  const [direcionarOpen, setDirecionarOpen] = useState(false);
  const [buscaDirecionar, setBuscaDirecionar] = useState("");
  const vendedoresDirecionar = useMemo(() => {
    if (!buscaDirecionar.trim()) return vendedores;
    const termo = buscaDirecionar.trim().toLowerCase();
    return vendedores.filter((v) => v.nome.toLowerCase().includes(termo));
  }, [vendedores, buscaDirecionar]);

  function assumirConversa(conv: WaConversa) {
    if (!profile?.id) return;
    setResponsaveis.mutate({ conversaId: conv.id, usuarioIds: [profile.id] });
    // Assumir uma conversa fechada reabre — não faz sentido ficar "atribuída"
    // mas escondida na aba Fechado.
    if (conv.arquivada)
      arquivarConversa.mutate({ conversaId: conv.id, arquivada: false });
    addNota.mutate({
      conversaId: conv.id,
      texto: `${profile.nome ?? "Alguém"} assumiu esta conversa`,
    });
    // Conversa sem responsável nunca zera nao_lidas sozinha ao ser aberta (só o
    // próprio responsável dispara esse reset, ver efeito de `marcarLida` abaixo)
    // — então assumir precisa zerar na hora, senão o contador fica preso mesmo
    // já tendo sido lida por quem assumiu.
    if (conv.nao_lidas > 0 || conv.nao_lidas_forcada) {
      marcarLida.mutate(conv.id);
    }
  }

  function direcionarConversa(conv: WaConversa, usuarioId: string) {
    setResponsaveis.mutate({ conversaId: conv.id, usuarioIds: [usuarioId] });
    if (conv.arquivada)
      arquivarConversa.mutate({ conversaId: conv.id, arquivada: false });
    setDirecionarOpen(false);
    setBuscaDirecionar("");
    const nomeDestino =
      vendedores.find((v) => v.id === usuarioId)?.nome ?? "um colega";
    addNota.mutate({
      conversaId: conv.id,
      texto: `${profile?.nome ?? "Alguém"} direcionou esta conversa para ${nomeDestino}`,
    });
  }

  // Toggle de responsáveis direto no header da conversa — mesma semântica de
  // "adicionar/remover" do popover de responsáveis do LeadSheet, mas operando
  // sobre a conversa ativa sem precisar abrir o painel de detalhes.
  const [editarResponsavelOpen, setEditarResponsavelOpen] = useState(false);
  const [buscaEditarResponsavel, setBuscaEditarResponsavel] = useState("");
  const vendedoresEditarResponsavel = useMemo(() => {
    if (!buscaEditarResponsavel.trim()) return vendedores;
    const termo = buscaEditarResponsavel.trim().toLowerCase();
    return vendedores.filter((v) => v.nome.toLowerCase().includes(termo));
  }, [vendedores, buscaEditarResponsavel]);

  function toggleResponsavelHeader(conv: WaConversa, uid: string) {
    const atuais = conv.responsaveis ?? [];
    const isRemoving = atuais.some((r) => r.id === uid);
    const novosIds = isRemoving
      ? atuais.filter((r) => r.id !== uid).map((r) => r.id)
      : [...atuais.map((r) => r.id), uid];
    setResponsaveis.mutate({ conversaId: conv.id, usuarioIds: novosIds });
    if (conv.arquivada)
      arquivarConversa.mutate({ conversaId: conv.id, arquivada: false });
    const autor = profile?.nome ?? "Alguém";
    const alvoNome = vendedores.find((v) => v.id === uid)?.nome ?? "alguém";
    const texto =
      uid === profile?.id
        ? isRemoving
          ? `${autor} saiu dos responsáveis desta conversa`
          : `${autor} assumiu esta conversa`
        : isRemoving
          ? `${autor} removeu ${alvoNome} dos responsáveis`
          : `${autor} adicionou ${alvoNome} como responsável`;
    addNota.mutate({ conversaId: conv.id, texto });
  }
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const conversaAtiva = conversas.find((c) => c.id === conversaAtivaId) ?? null;
  const [atribuicaoModalOpen, setAtribuicaoModalOpen] = useState(false);

  // Deep-link vindo do toast/ação de "nova mensagem" (ver useUnreadWaMessages em
  // use-whatsapp-inbox.ts): navega para /whatsapp?conversaId=X. Só dá pra selecionar
  // depois que `conversas` carregou, por isso o efeito espera a lista chegar. O param
  // é removido da URL logo em seguida para não reabrir a mesma conversa numa
  // atualização de página ou navegação manual dentro do inbox.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const conversaIdParam = searchParams.get("conversaId");
    if (!conversaIdParam || conversas.length === 0) return;
    if (conversas.some((c) => c.id === conversaIdParam)) {
      setConversaAtivaId(conversaIdParam);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("conversaId");
        return next;
      },
      { replace: true },
    );
  }, [conversas, searchParams, setSearchParams]);

  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);
  // Nome diferente do usado no LeadSheet (temTarefas) para não confundir os dois escopos.
  const { ligada: temTarefasSecao } = useSecaoLigada('tarefas');

  /**
   * Mesmo padrão de formulário/campos do modal de criação em src/pages/Tarefas.tsx.
   *
   * As três consultas abaixo alimentam APENAS o diálogo "Nova tarefa", e eram
   * disparadas na abertura da tela de WhatsApp — toda vez, para todo mundo.
   * `useClientes()` pagina 1.305 clientes de 1000 em 1000 trazendo `obras(*)`;
   * `usePedidosOptions` traz até 500 pedidos com dois joins. Um diálogo que
   * quase nunca é aberto custava isso a cada entrada na inbox.
   *
   * Agora só carregam quando o diálogo abre. O atraso de abrir é o preço, e é
   * o certo: quem abre espera; quem não abre não paga.
   */
  const createTarefa = useCreateTarefa();
  const empresaIdTarefas =
    profile?.empresa_id ?? profile?.empresas?.id ?? undefined;

  // As colunas do kanban CONTINUAM sempre carregadas: são poucas linhas de
  // configuração, e `abrirNovaTarefa` usa a primeira delas para preencher o
  // status — adiar isso faria a primeira abertura cair no fallback "pendente".
  const { data: kanbanColunasTarefas = [] } =
    useTarefasKanbanColunas(empresaIdTarefas);

  // Estas duas, sim, só quando o diálogo abre. `isFetching` alimenta a mensagem
  // dos selects enquanto as listas não chegam.
  const { data: clientesTarefas = [], isFetching: carregandoClientes } =
    useClientes({ enabled: novaTarefaOpen });
  const { data: pedidosOptionsTarefas = [], isFetching: carregandoPedidos } =
    usePedidosOptions(novaTarefaOpen ? empresaIdTarefas : undefined);
  const KANBAN_STAGES_TAREFAS = useMemo(
    () =>
      kanbanColunasTarefas.map((c) => ({
        key: c.slug,
        label: c.nome,
        color: c.cor,
      })),
    [kanbanColunasTarefas],
  );
  const [tarefaForm, setTarefaForm] = useState({
    titulo: "",
    descricao: "",
    status: "pendente",
    prazo_final: "",
    responsavel: "",
    participantes: "",
    projeto: "",
    marcadores: "",
    cliente_id: "",
    pedido_id: "",
  });

  function abrirNovaTarefa() {
    if (!conversaAtiva) return;
    setTarefaForm({
      titulo: "",
      descricao: "",
      status: KANBAN_STAGES_TAREFAS[0]?.key || "pendente",
      prazo_final: "",
      responsavel: "",
      participantes: "",
      projeto: "",
      marcadores: "",
      cliente_id: "",
      pedido_id: "",
    });
    setNovaTarefaOpen(true);
  }

  async function salvarNovaTarefa() {
    if (!conversaAtiva) return;
    if (!tarefaForm.titulo.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    try {
      await createTarefa.mutateAsync({
        ...tarefaForm,
        cliente_id: tarefaForm.cliente_id || null,
        pedido_id: tarefaForm.pedido_id || null,
        conversa_id: conversaAtiva.id,
        prazo_final: tarefaForm.prazo_final
          ? new Date(tarefaForm.prazo_final).toISOString()
          : null,
      });
      toast.success("Tarefa criada");
      setNovaTarefaOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar tarefa");
    }
  }

  const [novaNotaOpen, setNovaNotaOpen] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [notaFixada, setNotaFixada] = useState(false);
  const setNotaFixadaMutation = useWaSetNotaFixada();

  async function salvarNotaManual() {
    if (!conversaAtiva || !notaTexto.trim()) {
      toast.error("Escreva o conteúdo da nota");
      return;
    }
    try {
      await addNota.mutateAsync({
        conversaId: conversaAtiva.id,
        texto: notaTexto.trim(),
        fixada: notaFixada,
      });
      toast.success("Nota adicionada");
      setNotaTexto("");
      setNotaFixada(false);
      setNovaNotaOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao adicionar nota");
    }
  }

  // Abre automaticamente o modal de atribuição sempre que a conversa selecionada
  // não tiver responsável — e fecha assim que ela for assumida/direcionada
  // (responsaveis deixa de estar vazio).
  useEffect(() => {
    if (!conversaAtiva) {
      setAtribuicaoModalOpen(false);
      return;
    }
    const semResponsavel = (conversaAtiva.responsaveis?.length ?? 0) === 0;
    setAtribuicaoModalOpen(semResponsavel);
  }, [conversaAtiva]);
  const {
    data: mensagens = [],
    isLoading: loadingMensagens,
    fetchOlderMensagens,
    hasOlderMensagens,
    loadingOlderMensagens,
  } = useWaMensagens(conversaAtiva?.id ?? null);
  // Lookup de wamid -> id da mensagem, usado para rolar até a mensagem original ao
  // clicar em uma citação (reply).
  const idPorWamid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mensagens) if (m.wamid) map.set(m.wamid, m.id);
    return map;
  }, [mensagens]);
  const notasFixadas = useMemo(
    () => mensagens.filter((m) => m.is_nota_interna && m.fixada),
    [mensagens],
  );
  // Agrupa mensagens consecutivas do mesmo dia para o marcador de data: cada grupo
  // vira um wrapper com o chip de data em `sticky top-0` — como o wrapper cobre toda
  // a altura das mensagens daquele dia, o chip fica fixo logo abaixo do header
  // enquanto o grupo estiver na tela e só é substituído quando o próximo grupo (dia
  // seguinte) alcança o topo da rolagem. Não precisa de JS rastreando scroll: é o
  // mesmo truque de "sticky section header" já usado em ConversaGroupHeader.
  const gruposPorDia = useMemo(() => {
    const grupos: {
      dateKey: string;
      label: string;
      itens: { msg: WaMensagem; index: number }[];
    }[] = [];
    mensagens.forEach((msg, index) => {
      const data = new Date(msg.created_at);
      const dateKey = data.toDateString();
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dateKey === dateKey) {
        ultimo.itens.push({ msg, index });
        return;
      }
      const label = isToday(data)
        ? "Hoje"
        : isYesterday(data)
          ? "Ontem"
          : format(data, "d 'de' MMMM", { locale: ptBR });
      grupos.push({ dateKey, label, itens: [{ msg, index }] });
    });
    return grupos;
  }, [mensagens]);
  // Menção com "@" em grupos: `mentionQuery` é o texto digitado depois do "@"
  // (null = dropdown fechado), `mentionStartIndex` é a posição do "@" dentro de
  // `texto`, e `mentionedParticipantes` guarda telefone->nome de quem já foi
  // inserido, para montar o campo `mentions` no envio (ver handleSend).
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionedParticipantes, setMentionedParticipantes] = useState<Map<string, string>>(new Map());
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
      const existente = vistos.get(msg.remetente_telefone);
      if (!existente) {
        vistos.set(msg.remetente_telefone, {
          nome: msg.remetente_nome ?? null,
          telefone: msg.remetente_telefone,
        });
      } else if (!existente.nome && msg.remetente_nome) {
        // A uazapi (/group/list) não devolve nome de exibição dos participantes —
        // só telefone/JID —, então quem entrou pela lista salva no grupo fica sem
        // nome. As mensagens em si, porém, trazem o nome de quem mandou; usa isso
        // para completar o nome que a lista de participantes não tinha.
        vistos.set(msg.remetente_telefone, {
          nome: msg.remetente_nome,
          telefone: msg.remetente_telefone,
        });
      }
    }
    return Array.from(vistos.values());
  }, [conversaAtiva?.is_group, conversaAtiva?.participantes, mensagens]);
  // Sugestões do dropdown de menção (@), filtradas pelo texto digitado depois
  // do "@". "Todos" é um item sintético (sem telefone real) que vira mentions:"all"
  // no envio — mesmo atalho do "@Todos" do WhatsApp nativo.
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    const todos = "todos".startsWith(q) || q === ""
      ? [{ telefone: "all", nome: "Todos" }]
      : [];
    const pessoas = participantesGrupo
      .filter((p) => (p.nome ?? formatPhone(p.telefone)).toLowerCase().includes(q))
      .slice(0, 8);
    return [...todos, ...pessoas];
  }, [mentionQuery, participantesGrupo]);
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
  const reagirMutation = useWaReagir();
  const excluirMensagem = useWaExcluirMensagem();
  const [msgParaApagar, setMsgParaApagar] = useState<WaMensagem | null>(null);
  const marcarLida = useWaMarcarLida();
  // Abrir a conversa só marca como lida quando quem abre é o responsável por ela —
  // gestor/admin entrando numa conversa que não é sua não deve alterar o estado de
  // lida/não lida (só o próprio responsável respondendo, ou marcando manualmente,
  // faz isso). Depende só do id da conversa/usuário pra rodar uma vez por abertura,
  // não a cada atualização de `conversas` (senão dispararia em toda mensagem nova).
  useEffect(() => {
    if (!conversaAtivaId || !profile?.id) return;
    const conv = conversas.find((c) => c.id === conversaAtivaId);
    if (!conv) return;
    // Usa nao_lidas/nao_lidas_forcada crus, não `conversaNaoLida` — essa função já
    // suprime o estado "não lida" pra quem é responsável (é só uma regra de exibição
    // do badge), então usá-la aqui nunca deixaria a mutation disparar pro próprio
    // responsável, e o contador ficaria acumulando pra sempre do ponto de vista de
    // quem vê a conversa sem ser o responsável (gestor/admin).
    const souResponsavel = (conv.responsaveis ?? []).some((r) => r.id === profile.id);
    if (souResponsavel && (conv.nao_lidas > 0 || conv.nao_lidas_forcada)) {
      marcarLida.mutate(conversaAtivaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaAtivaId, profile?.id]);
  const registrarVisualizacao = useWaRegistrarVisualizacao();
  // Conversa sem responsável: registra quem do time abriu, pra lista "Não
  // atribuídas" mostrar a pilha de quem já entrou e não assumiu (ver
  // ConversaVisualizadoresStack) — não tem relação com lida/não lida, é só
  // pro gestor enxergar quem está olhando e não está puxando pra si.
  useEffect(() => {
    if (!conversaAtivaId || !profile?.id) return;
    const conv = conversas.find((c) => c.id === conversaAtivaId);
    if (!conv) return;
    const naoAtribuida = (conv.responsaveis ?? []).length === 0;
    const jaVisualizou = (conv.visualizadores ?? []).some((v) => v.id === profile.id);
    if (naoAtribuida && !jaVisualizou) {
      registrarVisualizacao.mutate(conversaAtivaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaAtivaId, profile?.id]);
  const marcarNaoLida = useWaMarcarNaoLida();
  const limparConversa = useWaLimparConversa();
  const arquivarConversa = useWaArquivarConversa();
  const deletarConversa = useWaDeletarConversa();
  const deletarEmMassa = useWaDeletarConversasEmMassa();
  const buscarMensagens = useWaBuscarMensagens();
  const fetchContactPhoto = useWaFetchContactPhoto();
  const fotoRequestedRef = useRef<Set<string>>(new Set());
  /**
   * Busca as fotos de perfil que faltam — com FREIO.
   *
   * Como estava, este efeito percorria as 529 conversas e disparava
   * `whatsapp-contact-photo` para toda foto vencida. Como os links do WhatsApp
   * expiram em dias, quase todas estão sempre vencidas: cada carga da inbox
   * virava uma rajada de centenas de chamadas paralelas, cada uma fazendo um
   * fetch síncrono a `/chat/details` na uazapi com o MESMO token.
   *
   * Era a nossa própria tela derrubando o provedor. Em 15 dias: 2.038 respostas
   * 504 "Request timeout" de `/chat/details` — 97% de todos os erros da
   * integração — e invocações da Edge Function penduradas por 47 segundos. É a
   * origem da "instabilidade", e ela é auto-infligida.
   *
   * Dois freios:
   *
   * 1. `is_group` em vez de `telefone.includes("@g.us")`. O filtro antigo NUNCA
   *    excluía grupo nenhum, porque o JID é gravado sem o sufixo (o webhook o
   *    remove). Pior: `/chat/details` de um grupo de JID legado é impossível de
   *    resolver, então a foto nunca era gravada, a URL seguia "vencida" e as 28
   *    conversas de grupo eram repedidas em TODA carga, para sempre.
   *
   * 2. Teto por carga, das conversas mais recentes para trás. Foto de perfil é
   *    enfeite: quem está no topo da lista é quem a pessoa vai olhar, e o resto
   *    chega nas próximas visitas. Melhor uma lista com alguns avatares
   *    genéricos do que a integração inteira saturada.
   */
  const MAX_FOTOS_POR_CARGA = 12;
  useEffect(() => {
    let pedidas = 0;
    for (const c of conversas) {
      if (pedidas >= MAX_FOTOS_POR_CARGA) break;
      // `foto_perfil_expires_at` virou o único critério: ele é "não pergunte
      // antes disto". Serve tanto para o link que o WhatsApp expira quanto para
      // o "este contato não tem foto", que a function agora grava com uma
      // semana de validade.
      //
      // A condição antiga tinha `!c.foto_perfil_url ||` na frente, e era esse
      // OU que fazia as 65 conversas sem foto serem repedidas em toda carga,
      // para sempre — nenhuma delas podia ser satisfeita.
      const podePerguntar =
        !c.foto_perfil_expires_at ||
        new Date(c.foto_perfil_expires_at).getTime() <= Date.now();
      if (
        podePerguntar &&
        !c.is_group &&
        !fotoRequestedRef.current.has(c.id)
      ) {
        fotoRequestedRef.current.add(c.id);
        fetchContactPhoto.mutate(c.id);
        pedidas++;
      }
    }
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
  // O modo de seleção da sidebar serve duas ações diferentes (excluir em
  // massa e exportar) — este campo decide qual botão de ação aparece no
  // rodapé, sem duplicar todo o mecanismo de seleção (toggleSelecao,
  // toggleTodas, a lista com checkbox etc) para cada uma.
  const [finalidadeSelecao, setFinalidadeSelecao] = useState<
    "excluir" | "exportar" | null
  >(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  // "Selecionar todas" só enxerga a aba (Em aberto/Fechado) visível no
  // momento — pergunta antes de incluir a outra, em vez de silenciosamente
  // exportar/excluir só metade das conversas.
  const [confirmSelecionarTodasOpen, setConfirmSelecionarTodasOpen] =
    useState(false);
  const [confirmDeletarMassa, setConfirmDeletarMassa] = useState(false);
  const [leadSheetOpen, setLeadSheetOpen] = useState(false);
  const [visualizadoresSheetOpen, setVisualizadoresSheetOpen] = useState(false);
  // Busca por texto entre as mensagens já carregadas da conversa ativa
  // (equivalente à busca dentro de uma conversa no WhatsApp mobile) — abre
  // como um dropdown ancorado no botão do header, não confundir com `busca`,
  // que pesquisa entre conversas/contatos na sidebar.
  const [buscaMensagensOpen, setBuscaMensagensOpen] = useState(false);
  const [abaInbox, setAbaInbox] = useState<"conversas" | "meus-chats">(
    "conversas",
  );

  const [texto, setTexto] = useState("");
  const [respondendoA, setRespondendoA] = useState<WaMensagem | null>(null);
  // Ao clicar numa citação (reply), rola até a mensagem original e a destaca
  // brevemente com o anel de cor primária do sistema.
  const [destacadaMsgId, setDestacadaMsgId] = useState<string | null>(null);
  function irParaMensagem(id: string) {
    document
      .getElementById(`wa-msg-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setDestacadaMsgId(id);
    setTimeout(() => {
      setDestacadaMsgId((cur) => (cur === id ? null : cur));
    }, 1600);
  }
  // Resultado da busca global de mensagens (barra de busca da sidebar) pode ser
  // de qualquer conversa — abre e espera o histórico carregar antes de rolar até
  // ela. Se a mensagem for mais antiga que o histórico carregado (useWaMensagens
  // limita as últimas 200), o elemento não existe e cai no aviso.
  function selecionarResultadoBusca(r: WaMensagemBusca) {
    setBusca("");
    setConversaAtivaId(r.conversa_id);
    setShowMobileSidebar(false);
    setTimeout(() => {
      if (document.getElementById(`wa-msg-${r.id}`)) {
        irParaMensagem(r.id);
      } else {
        toast.info(
          "Mensagem fora do histórico recente carregado desta conversa.",
        );
      }
    }, 600);
  }
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"aberto" | "fechado">(
    "aberto",
  );
  const [filtroConversa, setFiltroConversa] = useState<
    "todos" | "geral" | "meu" | "outros"
  >("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<
    "todos" | "semana" | "mes" | "ano" | "personalizado"
  >("todos");
  const [filtroInstancia, setFiltroInstancia] = useState<string>("todos");
  // Array vazio = "Todos". Permite selecionar mais de um responsável ao mesmo
  // tempo (ex: admin/gestor filtrando por si mesmo + um colega).
  const [filtroResponsavel, setFiltroResponsavel] = useState<string[]>([]);
  const [buscaFiltroResponsavel, setBuscaFiltroResponsavel] = useState("");
  const [filtroResponsavelOpenDesktop, setFiltroResponsavelOpenDesktop] =
    useState(false);
  const [filtroResponsavelOpenMobile, setFiltroResponsavelOpenMobile] =
    useState(false);
  const [periodoFiltroOpenDesktop, setPeriodoFiltroOpenDesktop] =
    useState(false);
  const [periodoFiltroOpenMobile, setPeriodoFiltroOpenMobile] = useState(false);
  const [periodoFiltroOpenLista, setPeriodoFiltroOpenLista] = useState(false);
  const vendedoresFiltroResponsavel = useMemo(() => {
    if (!buscaFiltroResponsavel.trim()) return vendedores;
    const termo = buscaFiltroResponsavel.trim().toLowerCase();
    return vendedores.filter((v) => v.nome.toLowerCase().includes(termo));
  }, [vendedores, buscaFiltroResponsavel]);
  const vendedoresResponsavelSelecionados = useMemo(
    () => vendedores.filter((v) => filtroResponsavel.includes(v.id)),
    [vendedores, filtroResponsavel],
  );
  function toggleFiltroResponsavel(id: string) {
    setFiltroResponsavel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  const [periodoCustom, setPeriodoCustom] = useState<{
    from?: Date;
    to?: Date;
  }>({});
  // Compartilhado entre o botão de filtros (desktop + mobile) e o botão
  // "Limpar" que fica ao lado dele na sidebar, fora do dropdown.
  const hasFiltrosConversa =
    filtroConversa !== "todos" ||
    filtroPeriodo !== "todos" ||
    filtroInstancia !== "todos" ||
    filtroResponsavel.length > 0;
  const activeFiltrosConversaCount =
    (filtroConversa !== "todos" ? 1 : 0) +
    (filtroPeriodo !== "todos" ? 1 : 0) +
    (filtroInstancia !== "todos" ? 1 : 0) +
    (filtroResponsavel.length > 0 ? 1 : 0);
  function limparFiltrosConversa() {
    setFiltroConversa("todos");
    setFiltroPeriodo("todos");
    setPeriodoCustom({});
    setFiltroInstancia("todos");
    setFiltroResponsavel([]);
  }
  // Conversas fechadas não têm responsável atribuído (ver comentário acima
  // sobre reabertura) nem faz sentido filtrar por "Conversa" nelas — no menu
  // de fechadas só os filtros de Instância e Período continuam fazendo
  // sentido.
  useEffect(() => {
    if (filtroStatus === "fechado") {
      setFiltroResponsavel((prev) => (prev.length > 0 ? [] : prev));
      setFiltroConversa((prev) => (prev !== "todos" ? "todos" : prev));
    }
  }, [filtroStatus]);
  // Busca por conteúdo de mensagem em todo o histórico (não só nas últimas
  // carregadas): reaproveita a própria barra de busca da sidebar e o filtro de
  // Período (dropdown "Filtros") em vez de um diálogo à parte com campos
  // duplicados.
  const periodoBuscaMensagens = useMemo(() => {
    if (filtroPeriodo === "semana") return { from: subDays(new Date(), 7) };
    if (filtroPeriodo === "mes") return { from: subMonths(new Date(), 1) };
    if (filtroPeriodo === "ano") return { from: subYears(new Date(), 1) };
    if (filtroPeriodo === "personalizado")
      return { from: periodoCustom.from, to: periodoCustom.to };
    return {};
  }, [filtroPeriodo, periodoCustom]);
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      buscarMensagens.reset();
      return;
    }
    const timer = setTimeout(() => {
      buscarMensagens.mutate({
        termo,
        from: periodoBuscaMensagens.from,
        to: periodoBuscaMensagens.to,
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, periodoBuscaMensagens.from, periodoBuscaMensagens.to]);
  const resultadosMensagens = buscarMensagens.data ?? [];
  // Filtro de período — ficava dentro do dropdown "Filtros", agora é seu
  // próprio botão ao lado, pra ficar mais visível/rápido de acessar.
  const periodoLabel = useMemo(() => {
    if (filtroPeriodo === "semana") return "Última semana";
    if (filtroPeriodo === "mes") return "Último mês";
    if (filtroPeriodo === "ano") return "Último ano";
    if (filtroPeriodo === "personalizado") {
      if (periodoCustom.from && periodoCustom.to)
        return `${format(periodoCustom.from, "dd/MM/yy")} - ${format(periodoCustom.to, "dd/MM/yy")}`;
      if (periodoCustom.from)
        return `A partir de ${format(periodoCustom.from, "dd/MM/yy")}`;
      return "Personalizado";
    }
    return;
  }, [filtroPeriodo, periodoCustom]);
  const periodoPopoverBody = (
    <div className="flex flex-col">
      <div className="flex">
        <div className="border-r border-border p-3 space-y-1 min-w-[160px]">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Atalhos
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
                setFiltroPeriodo(filtroPeriodo === val ? "todos" : val)
              }
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                filtroPeriodo === val && "bg-primary/10 text-primary",
              )}
            >
              {label}
              {filtroPeriodo === val && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <div className="p-3 min-w-[280px]">
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
      {filtroPeriodo !== "todos" && (
        <div className="border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setFiltroPeriodo("todos");
              setPeriodoCustom({});
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar período
          </Button>
        </div>
      )}
    </div>
  );
  function renderPeriodoFilterButton(
    open: boolean,
    setOpen: (v: boolean) => void,
    className?: string,
    alwaysShowLabel = false,
  ) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-10 shrink-0 max-w-[200px] items-center justify-center gap-1.5 px-3 font-normal",
              filtroPeriodo !== "todos"
                ? "border-primary/50 text-primary"
                : "text-muted-foreground",
              className,
            )}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {/* Na sidebar (288px abaixo do breakpoint lg) não cabe o rótulo do
                período junto com "Filtros" e a lixeira sem estourar, então some
                o texto e o botão vira um ícone puro (centralizado nos dois eixos
                pelo flex do próprio Button). Onde há mais espaço (lista em
                tabela) o rótulo fica sempre visível. */}
            <span
              className={cn("truncate", !alwaysShowLabel && "hidden lg:inline")}
            >
              {periodoLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          {periodoPopoverBody}
        </PopoverContent>
      </Popover>
    );
  }
  // Conteúdo do dropdown "Filtros" — extraído pra ser reaproveitado tanto na
  // sidebar (desktop) quanto na visualização em lista (MeusChatsList), que
  // agora usa exatamente os mesmos filtros em vez de ser restrita a "atribuído
  // a mim".
  const filtrosDropdownContent = (
    <div className="flex flex-col gap-0.5 w-60">
      {/* Conversas fechadas não têm responsável/atribuição, então "Conversa"
          (Todos/Não atribuído/Meus/Outros atendentes) não se aplica — só o
          filtro de Instância faz sentido. */}
      {filtroStatus !== "fechado" && (
        <>
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            Conversa
          </p>
          {(
            [
              ["todos", "Todos"],
              ["geral", "Não atribuído"],
              ["meu", meuChatsLabel],
              // "Outros atendentes" só faz sentido pra admin/gestor — vendedor
              // comum, por causa da RLS, nunca enxerga conversa atribuída a
              // outra pessoa.
              ...(isGestor ? ([["outros", "Outros atendentes"]] as const) : []),
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setFiltroConversa(val)}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                filtroConversa === val && "bg-primary/10 text-primary",
              )}
            >
              {label}
              {filtroConversa === val && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </>
      )}
      {temInstanciaConhecida && (
        <>
          {filtroStatus !== "fechado" && (
            <div className="mx-3 my-1 border-t border-border/50" />
          )}
          <p
            className={cn(
              "px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70",
              filtroStatus === "fechado" && "pt-1",
            )}
          >
            Instância
          </p>
          <button
            type="button"
            onClick={() => setFiltroInstancia("todos")}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
              filtroInstancia === "todos" && "bg-primary/10 text-primary",
            )}
          >
            Todas
            {filtroInstancia === "todos" && <Check className="h-3.5 w-3.5" />}
          </button>
          {instancias.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => setFiltroInstancia(inst.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                filtroInstancia === inst.id && "bg-primary/10 text-primary",
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
      {vendedores.length > 0 && filtroStatus !== "fechado" && (
        <>
          <div className="mx-3 my-1 border-t border-border/50" />
          <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            Responsável
          </p>
          <Popover
            open={filtroResponsavelOpenDesktop}
            onOpenChange={(v) => {
              setFiltroResponsavelOpenDesktop(v);
              if (!v) setBuscaFiltroResponsavel("");
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                  filtroResponsavel.length > 0 && "bg-primary/10 text-primary",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {vendedoresResponsavelSelecionados.length === 1 ? (
                    <>
                      <Avatar className="h-5 w-5 shrink-0">
                        {vendedoresResponsavelSelecionados[0].avatar_url ? (
                          <img
                            src={
                              vendedoresResponsavelSelecionados[0].avatar_url
                            }
                            alt={vendedoresResponsavelSelecionados[0].nome}
                            className="h-full w-full object-cover rounded-full"
                          />
                        ) : (
                          <AvatarFallback className="text-[9px] bg-muted-foreground/20">
                            {vendedoresResponsavelSelecionados[0].nome
                              .trim()
                              .split(" ")
                              .map((p: string) => p[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="truncate">
                        {vendedoresResponsavelSelecionados[0].nome}
                      </span>
                    </>
                  ) : vendedoresResponsavelSelecionados.length > 1 ? (
                    <span className="truncate">
                      {vendedoresResponsavelSelecionados.length} selecionados
                    </span>
                  ) : (
                    <span>Todos</span>
                  )}
                </span>
                {filtroResponsavelOpenDesktop ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={8}
              className="w-56 p-0"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar responsável..."
                  value={buscaFiltroResponsavel}
                  onValueChange={setBuscaFiltroResponsavel}
                />
                <CommandList>
                  <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                    Nenhum usuário encontrado.
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="todos"
                      onSelect={() => {
                        setFiltroResponsavel([]);
                        setFiltroResponsavelOpenDesktop(false);
                      }}
                      className={cn(
                        "gap-2.5",
                        filtroResponsavel.length === 0 &&
                          "bg-primary/10 text-primary",
                      )}
                    >
                      <span className="flex-1">Todos</span>
                      {filtroResponsavel.length === 0 && (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </CommandItem>
                    {vendedoresFiltroResponsavel.map((v) => (
                      <CommandItem
                        key={v.id}
                        value={v.id}
                        onSelect={() => toggleFiltroResponsavel(v.id)}
                        className={cn(
                          "gap-2.5",
                          filtroResponsavel.includes(v.id) &&
                            "bg-primary/10 text-primary",
                        )}
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
                        {filtroResponsavel.includes(v.id) && (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
  const [showConfig, setShowConfig] = useState(false);
  const [showNovaConversa, setShowNovaConversa] = useState(false);
  const [showCriarGrupo, setShowCriarGrupo] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [attachments, setAttachments] = useState<
    { file: File; previewUrl: string | null }[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    msgId?: string;
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<FilePreviewTarget | null>(
    null,
  );

  // Zoom/pan do "Visualizar imagem" — sempre reinicia ao trocar de imagem ou fechar,
  // senão o dialog abriria a próxima foto já ampliada/deslocada da anterior.
  const IMG_ZOOM_MIN = 1;
  const IMG_ZOOM_MAX = 4;
  const IMG_ZOOM_STEP = 0.5;
  const [imgZoom, setImgZoom] = useState(IMG_ZOOM_MIN);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImg, setIsDraggingImg] = useState(false);
  const imgDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setImgZoom(IMG_ZOOM_MIN);
    setImgOffset({ x: 0, y: 0 });
  }, [viewingImage?.url]);

  function clampImgZoom(z: number) {
    return Math.min(IMG_ZOOM_MAX, Math.max(IMG_ZOOM_MIN, +z.toFixed(2)));
  }

  function zoomImgIn() {
    setImgZoom((z) => clampImgZoom(z + IMG_ZOOM_STEP));
  }

  function zoomImgOut() {
    setImgZoom((z) => {
      const next = clampImgZoom(z - IMG_ZOOM_STEP);
      if (next === IMG_ZOOM_MIN) setImgOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function resetImgZoom() {
    setImgZoom(IMG_ZOOM_MIN);
    setImgOffset({ x: 0, y: 0 });
  }

  function handleImgWheel(e: React.WheelEvent<HTMLImageElement>) {
    const delta = e.deltaY < 0 ? IMG_ZOOM_STEP : -IMG_ZOOM_STEP;
    setImgZoom((z) => {
      const next = clampImgZoom(z + delta);
      if (next === IMG_ZOOM_MIN) setImgOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function handleImgDoubleClick() {
    if (imgZoom > IMG_ZOOM_MIN) {
      resetImgZoom();
    } else {
      setImgZoom(2);
    }
  }

  function handleImgMouseDown(e: React.MouseEvent<HTMLImageElement>) {
    if (imgZoom <= IMG_ZOOM_MIN) return;
    e.preventDefault();
    setIsDraggingImg(true);
    imgDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: imgOffset.x,
      originY: imgOffset.y,
    };
    const zoomAtDragStart = imgZoom;
    const handleMove = (ev: MouseEvent) => {
      const drag = imgDragRef.current;
      if (!drag) return;
      setImgOffset({
        x: drag.originX + (ev.clientX - drag.startX) / zoomAtDragStart,
        y: drag.originY + (ev.clientY - drag.startY) / zoomAtDragStart,
      });
    };
    const handleUp = () => {
      imgDragRef.current = null;
      setIsDraggingImg(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  // Trava de envio duplicado: `isBusy`/`isUploading` só fica true durante o
  // upload de anexos, nunca durante o envio de uma mensagem só de texto — sem
  // essa ref, um Enter duplo (ou clique duplo no botão) antes do primeiro
  // envio terminar disparava handleSend duas vezes com o mesmo texto, já que
  // o guard por state (`texto`/`attachments`) só é limpo de fato no próximo
  // render, não na hora.
  const isSendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgScrollRef = useRef<HTMLDivElement>(null);
  // Guarda a altura/posição de rolagem no instante em que uma página de
  // mensagens mais antigas foi pedida, pra manter o conteúdo visualmente
  // ancorado quando ela chegar (em vez de saltar pro fundo do chat).
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

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

  useLayoutEffect(() => {
    const viewport =
      (msgScrollRef.current?.closest(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null) ?? msgScrollRef.current;
    if (!viewport) return;

    // Mensagens antigas acabaram de ser inseridas no INÍCIO do array (o usuário
    // rolou até o topo) — mantém o mesmo conteúdo ancorado na tela em vez de
    // forçar a rolagem pro fundo, senão a tela "salta" a cada página carregada.
    if (prependAnchorRef.current) {
      const { scrollHeight: alturaAnterior, scrollTop: topoAnterior } = prependAnchorRef.current;
      viewport.scrollTop = viewport.scrollHeight - alturaAnterior + topoAnterior;
      prependAnchorRef.current = null;
      return;
    }

    const isNearBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
      150;
    if (isNearBottom || mensagens.length > 0) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [mensagens.length, atribuicaoModalOpen, conversaAtiva?.id]);

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

    // Perto do topo do histórico carregado — busca a próxima leva de mensagens
    // mais antigas. prependAnchorRef guarda a régua atual pra restaurar a
    // posição de rolagem assim que a página chegar (ver useLayoutEffect acima).
    if (
      target.scrollTop < 200 &&
      hasOlderMensagens &&
      !loadingOlderMensagens &&
      !prependAnchorRef.current
    ) {
      prependAnchorRef.current = {
        scrollHeight: target.scrollHeight,
        scrollTop: target.scrollTop,
      };
      fetchOlderMensagens();
    }
  };

  // Abrir a conversa não marca como lida — a conversa só sai do estado "não lida"
  // quando o usuário efetivamente envia uma mensagem (ver handleSend/confirmSendAudio).
  useEffect(() => {
    inputRef.current?.focus();
    setRespondendoA(null);
    prependAnchorRef.current = null;
  }, [conversaAtiva?.id]);

  // Ao marcar uma mensagem para responder, já deixa o campo de texto pronto pra digitar.
  function handleReply(msg: WaMensagem) {
    setRespondendoA(msg);
    inputRef.current?.focus();
  }

  // Clicar no mesmo emoji que já reagiu remove a reação (toggle, como no WhatsApp).
  function handleReact(msg: WaMensagem, emoji: string) {
    if (!msg.wamid || !conversaAtiva) return;
    const jaReagiu =
      msg.reacoes?.find((r) => r.autor === "eu")?.emoji === emoji;
    reagirMutation.mutate({
      conversaId: conversaAtiva.id,
      mensagemId: msg.id,
      wamid: msg.wamid,
      telefone: conversaAtiva.telefone,
      emoji: jaReagiu ? "" : emoji,
    });
  }

  function confirmarApagarMensagem() {
    if (!msgParaApagar || !conversaAtiva) return;
    excluirMensagem.mutate({ conversaId: conversaAtiva.id, mensagemId: msgParaApagar.id });
    setMsgParaApagar(null);
  }

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
          sairModoSelecao();
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
    const idsAbaAtual = conversasFiltradas.map((c) => c.id);
    if (idsAbaAtual.length === 0) return;
    const todasDaAbaAtualMarcadas = idsAbaAtual.every((id) =>
      selecionadas.has(id),
    );
    if (todasDaAbaAtualMarcadas) {
      // Desmarca só a aba visível agora — preserva o que estiver marcado na
      // outra aba, senão trocar de aba e clicar de novo apaga a seleção de
      // quem não está mais visível.
      setSelecionadas((prev) => {
        const next = new Set(prev);
        idsAbaAtual.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }
    if (conversasOutraAba.some((c) => !selecionadas.has(c.id))) {
      setConfirmSelecionarTodasOpen(true);
      return;
    }
    setSelecionadas((prev) => new Set([...prev, ...idsAbaAtual]));
  }

  // Resolve o AlertDialog de "Selecionar todas": `incluirOutraAba` decide se
  // a aba oposta (fechadas/abertas) entra na seleção também — sempre somando
  // ao que já estava marcado, nunca substituindo.
  function confirmarSelecionarTodas(incluirOutraAba: boolean) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      conversasFiltradas.forEach((c) => next.add(c.id));
      if (incluirOutraAba) {
        conversasOutraAba.forEach((c) => next.add(c.id));
      }
      return next;
    });
    setConfirmSelecionarTodasOpen(false);
  }

  function sairModoSelecao() {
    setModoSelecao(false);
    setFinalidadeSelecao(null);
    setSelecionadas(new Set());
  }

  // Exportação das conversas marcadas no modo de seleção (PDF/Excel
  // consolidado, uma seção/aba por conversa) — mesma mecânica da exportação
  // de uma conversa (ConversaDetalhesSheet), repetida por conversa e
  // concatenada num arquivo só.
  const [exportSelecionadasOpen, setExportSelecionadasOpen] = useState(false);
  const [exportSelecionadasRange, setExportSelecionadasRange] = useState<DateRange>(() => ({
    from: new Date(2000, 0, 1),
    to: new Date(),
  }));
  const [exportandoSelecionadas, setExportandoSelecionadas] = useState<"pdf" | "xlsx" | "md" | null>(null);
  const [progressoExportSelecionadas, setProgressoExportSelecionadas] = useState<{ atual: number; total: number } | null>(null);
  async function handleExportarSelecionadas(formato: "pdf" | "xlsx" | "md") {
    const alvo = conversas.filter((c) => selecionadas.has(c.id));
    setExportandoSelecionadas(formato);
    setProgressoExportSelecionadas({ atual: 0, total: alvo.length });
    try {
      const conversasComMensagens: ConversaParaExportar[] = [];
      for (let i = 0; i < alvo.length; i++) {
        const conv = alvo[i];
        const nomeContato = conv.nome_contato ?? formatPhone(conv.telefone);
        const mensagensPeriodo = await fetchMensagensParaExportar(
          conv.id,
          exportSelecionadasRange.from,
          exportSelecionadasRange.to,
        );
        if (mensagensPeriodo.length > 0) {
          conversasComMensagens.push({
            nomeContato,
            linhas: buildConversaExportRows(mensagensPeriodo, nomeContato),
          });
        }
        setProgressoExportSelecionadas({ atual: i + 1, total: alvo.length });
      }
      if (conversasComMensagens.length === 0) {
        toast.info("Nenhuma mensagem encontrada no período selecionado.");
        return;
      }
      const periodoLabel = `${format(exportSelecionadasRange.from, "dd/MM/yyyy", { locale: ptBR })} a ${format(exportSelecionadasRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
      if (formato === "pdf") {
        const { generateConversasPdf } = await import("@/lib/generate-conversa-pdf");
        await generateConversasPdf(conversasComMensagens, periodoLabel);
      } else if (formato === "xlsx") {
        const { generateConversasExcel } = await import("@/lib/generate-conversa-excel");
        generateConversasExcel(conversasComMensagens);
      } else {
        const { generateConversasMarkdown } = await import("@/lib/generate-conversa-markdown");
        generateConversasMarkdown(conversasComMensagens, periodoLabel);
      }
      setExportSelecionadasOpen(false);
      sairModoSelecao();
    } catch (err) {
      console.error("[wa] erro ao exportar conversas selecionadas:", err);
      toast.error("Não foi possível exportar as conversas.");
    } finally {
      setExportandoSelecionadas(null);
      setProgressoExportSelecionadas(null);
    }
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
    if (filtroConversa === "geral" && !precisaAssumir(c))
      return false;
    // "Meus chats" tem o mesmo significado pra vendedor e admin/gestor:
    // só o que está atribuído ao usuário logado.
    if (
      filtroConversa === "meu" &&
      (!profile?.id || !c.responsaveis?.some((r) => r.id === profile.id))
    )
      return false;
    // "Outros atendentes": só existe pra admin/gestor (vendedor comum, por
    // causa da RLS, nunca enxerga conversa atribuída a outra pessoa) — mostra
    // o que está atribuído a alguém que não é o usuário logado.
    if (
      filtroConversa === "outros" &&
      !(
        (c.responsaveis?.length ?? 0) > 0 &&
        !c.responsaveis?.some((r) => r.id === profile?.id)
      )
    )
      return false;

    if (filtroInstancia !== "todos" && c.instancia_id !== filtroInstancia)
      return false;

    if (
      filtroResponsavel.length > 0 &&
      !(c.responsaveis ?? []).some((r) => filtroResponsavel.includes(r.id))
    )
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
    const term = normalizeNomeBusca(busca);
    return (
      normalizeNomeBusca(c.nome_contato ?? "").includes(term) ||
      c.telefone.includes(term) ||
      normalizeNomeBusca(c.ultima_mensagem ?? "").includes(term) ||
      (c.participantes ?? []).some(
        (p) =>
          normalizeNomeBusca(p.nome ?? "").includes(term) ||
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
  // Base do texto/checkbox de "Selecionar todas": só considera a aba (Em
  // aberto/Fechado) visível agora — `selecionadas.size` sozinho não serve
  // porque pode incluir marcações da outra aba (ver `toggleTodas`).
  const todasDaAbaAtualSelecionadas =
    conversasFiltradas.length > 0 &&
    conversasFiltradas.every((c) => selecionadas.has(c.id));
  // Conversas da aba oposta à visível agora (Fechado quando se está vendo Em
  // aberto, e vice-versa) — sob os mesmos filtros de tipo/busca/instância já
  // aplicados, só sem o corte por `filtroStatus`.
  const conversasOutraAba = conversasPorTipoEBusca.filter((c) =>
    filtroStatus === "aberto" ? c.arquivada : !c.arquivada,
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
        grupos: [
          {
            key: inst.id,
            label: inst.apelido || inst.instance_name,
            conversas: conversasFiltradas,
          },
        ],
        avulsas: [] as WaConversa[],
      };
    }

    const idsConhecidos = new Set(instancias.map((i) => i.id));
    const porInstancia = new Map<string, WaConversa[]>();
    const avulsas: WaConversa[] = [];
    for (const c of conversasFiltradas) {
      if (c.instancia_id && idsConhecidos.has(c.instancia_id)) {
        if (!porInstancia.has(c.instancia_id))
          porInstancia.set(c.instancia_id, []);
        porInstancia.get(c.instancia_id)!.push(c);
      } else {
        avulsas.push(c);
      }
    }

    const grupos: { key: string; label: string; conversas: WaConversa[] }[] =
      [];
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
    if (!profile?.id) return null;

    const grupos: {
      key: string;
      label: string;
      icon: LucideIcon;
      conversas: WaConversa[];
    }[] = [];

    // Fora de "Todos" a lista já vem filtrada por conversasFiltradas (só
    // não atribuídas, ou só atribuídas a mim) — mostra um único header fixo
    // no topo em vez de recalcular a divisão em 3 grupos.
    if (filtroConversa === "geral") {
      if (conversasFiltradas.length)
        grupos.push({
          key: "nao-atribuidos",
          label: "Não atribuídos",
          icon: UserX,
          conversas: conversasFiltradas,
        });
      return grupos.length ? grupos : null;
    }
    if (filtroConversa === "meu") {
      if (conversasFiltradas.length)
        grupos.push({
          key: "meus",
          label: "Atribuídos a mim",
          icon: UserCheck,
          conversas: conversasFiltradas,
        });
      return grupos.length ? grupos : null;
    }
    if (filtroConversa === "outros") {
      if (conversasFiltradas.length)
        grupos.push({
          key: "outros",
          label: "Outros atendentes",
          icon: Users,
          conversas: conversasFiltradas,
        });
      return grupos.length ? grupos : null;
    }
    if (filtroConversa !== "todos") return null;

    const meus: WaConversa[] = [];
    const naoAtribuidos: WaConversa[] = [];
    const outros: WaConversa[] = [];
    for (const c of conversasFiltradas) {
      const responsaveis = c.responsaveis ?? [];
      if (responsaveis.length === 0) {
        // Já respondida por fora do CRM: não tem responsável pra cair em
        // "meus"/"outros", mas também não é mais um "Não atribuídos" que
        // precisa de alguém assumindo — ver `precisaAssumir`.
        if (precisaAssumir(c)) naoAtribuidos.push(c);
      } else if (responsaveis.some((r) => r.id === profile.id)) meus.push(c);
      else outros.push(c);
    }

    if (naoAtribuidos.length)
      grupos.push({
        key: "nao-atribuidos",
        label: "Não atribuídos",
        icon: UserX,
        conversas: naoAtribuidos,
      });
    if (meus.length)
      grupos.push({
        key: "meus",
        label: "Atribuídos a mim",
        icon: UserCheck,
        conversas: meus,
      });
    if (outros.length)
      grupos.push({
        key: "outros",
        label: "Outros atendentes",
        icon: Users,
        conversas: outros,
      });

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

  // Info de cor do badge de instância — preset (classe pronta, com par claro/
  // escuro), hex livre (sem par calculado, tratado à parte no render) ou
  // nenhuma (cinza neutro). Mesmo raciocínio do mapa acima: existe pra
  // funcionar independente do agrupamento ativo na sidebar.
  const infoCorPorInstanciaId = useMemo(() => {
    const map = new Map<string, InfoCorInstancia>();
    for (const inst of instancias) {
      map.set(inst.id, infoCorInstancia(inst.cor));
    }
    return map;
  }, [instancias]);

  function addFiles(files: File[]) {
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
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
    inputRef.current?.focus();
  }

  // Ctrl+V com uma imagem na área de transferência anexa direto, como qualquer
  // outro anexo — sem isso o navegador só colaria o texto/nome do arquivo.
  function handlePasteImage(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => !!f);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    // Imagens copiadas da área de transferência costumam vir sem nome útil
    // (ex: "image.png"); nomeia com timestamp pra não colidir/confundir no preview.
    const named = imageFiles.map(
      (file, i) =>
        new File(
          [file],
          `imagem-colada-${Date.now()}-${i}.${file.type.split("/")[1] || "png"}`,
          { type: file.type },
        ),
    );
    addFiles(named);
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

  // Contador de enter/leave em vez de um booleano simples: arrastar sobre elementos
  // filhos dispara dragLeave do pai antes do dragEnter do filho, e um booleano
  // "piscaria" o overlay. O contador só zera quando o cursor realmente sai do painel.
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
    }
  }

  function handleDropFiles(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
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

  // Nome a exibir na citação de quem mandou a mensagem original: em conversa
  // individual usa o nome do contato/o próprio usuário; em grupo usa o remetente
  // real dentro do grupo (msg.remetente_nome), igual ao que já aparece na bolha.
  function quotedNomeFor(msg: WaMensagem): string | null {
    if (msg.direcao === "saida")
      return msg.usuario?.nome ?? profile?.nome ?? null;
    return msg.remetente_nome ?? conversaAtiva?.nome_contato ?? null;
  }

  function quotedParamsFor(msg: WaMensagem | null) {
    if (!msg) return {};
    return {
      quoted_wamid: msg.wamid,
      quoted_conteudo: msg.conteudo,
      quoted_tipo: msg.tipo,
      quoted_remetente_nome: quotedNomeFor(msg),
    };
  }

  async function confirmSendAudio() {
    if (!pendingAudio || !conversaAtiva) return;
    const conversaId = conversaAtiva.id;
    const { file } = pendingAudio;
    cancelPendingAudio();
    const quoted = quotedParamsFor(respondendoA);
    setRespondendoA(null);
    setIsUploading(true);
    try {
      const mediaUrl = await uploadWaMedia(file, conversaId);
      await sendMessage.mutateAsync({
        telefone: conversaAtiva.telefone,
        mensagem: "[Áudio]",
        conversa_id: conversaId,
        tipo: "audio",
        media_url: mediaUrl,
        media_mime: mimeForFile(file),
        nome_arquivo: file.name,
        ptt: true,
        ...quoted,
      });
      marcarLida.mutate(conversaId);
    } catch (err) {
      // Idem: a mutação já avisou com o motivo real vindo do servidor. Um segundo
      // toast genérico aqui só encobriria a explicação boa.
      console.error('[whatsapp] falha ao enviar áudio:', err);
    } finally {
      setIsUploading(false);
      // Adia pro próximo tick: o textarea ainda está com `disabled` no DOM neste
      // ponto (React só remove o atributo depois de commitar o novo estado), e
      // .focus() em elemento disabled não faz nada.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (isSendingRef.current) return;
    if (!texto.trim() && attachments.length === 0) return;
    if (!conversaAtiva) return;

    if (!config || config.status !== "connected") {
      toast.error("WhatsApp desconectado. Verifique as configurações.");
      return;
    }

    isSendingRef.current = true;
    const conversaId = conversaAtiva.id;
    const currentAttachments = attachments;
    const quoted = quotedParamsFor(respondendoA);
    // Só entra no envio quem ainda está mencionado no texto final: se a pessoa
    // apagou o "@Nome" depois de escolher no dropdown, a menção não deve ir.
    // "all" ignora esse filtro — não há "@Todos " literal no texto de destaque.
    const mentionsAtivas = Array.from(mentionedParticipantes.entries())
      .filter(([telefone, nome]) => telefone === "all" || texto.includes(`@${nome}`));
    const mentionsList = mentionsAtivas.map(([telefone]) => telefone);
    const mentions = mentionsList.includes("all")
      ? "all"
      : mentionsList.length > 0
        ? mentionsList.join(",")
        : undefined;
    // O WhatsApp só transforma "@algo" numa marcação clicável/destacada quando esse
    // "algo" é o NÚMERO da pessoa (sem formatação) — quem troca isso pela etiqueta
    // bonita com o nome é o app de quem recebe, usando a lista `mentions`. "@Nome"
    // literal (o que aparece no textarea, pra ficar legível durante a digitação)
    // não é reconhecido. Por isso o texto de fato ENVIADO troca "@Nome" por
    // "@telefone" logo antes do envio — "Todos" fica como está, não tem "@all"
    // literal no protocolo do WhatsApp.
    let msg = texto.trim();
    for (const [telefone, nome] of mentionsAtivas) {
      if (telefone === "all") continue;
      msg = msg.split(`@${nome}`).join(`@${telefone}`);
    }
    setTexto("");
    setMentionedParticipantes(new Map());
    fecharMencao();
    clearAttachments();
    setRespondendoA(null);

    try {
      // Somente texto
      if (currentAttachments.length === 0) {
        await sendMessage.mutateAsync({
          telefone: conversaAtiva.telefone,
          mensagem: msg,
          conversa_id: conversaId,
          tipo: "texto",
          ...(mentions ? { mentions } : {}),
          ...quoted,
        });
        marcarLida.mutate(conversaId);
        return;
      }

      // Upload de todos os arquivos em paralelo
      setIsUploading(true);
      let uploadedUrls: string[];
      try {
        uploadedUrls = await Promise.all(
          currentAttachments.map((a) => uploadWaMedia(a.file, conversaId)),
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
        // Nome do arquivo só vira legenda para documentos (onde faz sentido ver o
        // nome); imagem/áudio/vídeo sem legenda digitada vão sem texto algum, senão
        // o nome do arquivo (ex: "imagem-colada-...png") aparece na conversa real.
        const conteudo = caption || (tipo === "documento" ? file.name : "");
        await sendMessage.mutateAsync({
          telefone: conversaAtiva.telefone,
          mensagem: conteudo,
          conversa_id: conversaId,
          tipo,
          media_url: uploadedUrls[i],
          media_mime: mimeForFile(file),
          nome_arquivo: file.name,
          ...(i === 0 && mentions ? { mentions } : {}),
          ...(i === 0 ? quoted : {}),
        });
      }
      marcarLida.mutate(conversaId);
    } catch (err) {
      // Sem toast aqui: o onError da mutação já avisou, e repetir mostrava a
      // mesma mensagem duas vezes na tela. Este catch existe só para o estado
      // não ficar travado em "enviando".
      console.error('[whatsapp] falha ao enviar:', err);
    } finally {
      isSendingRef.current = false;
      // Adia pro próximo tick: o textarea ainda está com `disabled` no DOM neste
      // ponto (React só remove o atributo depois de commitar o novo estado), e
      // .focus() em elemento disabled não faz nada.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  // Detecta se o usuário está digitando uma menção: um "@" precedido por início
  // de texto ou espaço/quebra de linha, sem espaço entre ele e o cursor. Só
  // ativa em grupos — mentions da uazapi funcionam apenas nesse contexto.
  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setTexto(newValue);
    if (!conversaAtiva?.is_group) return;
    const cursorPos = e.target.selectionStart;
    const uptoCursor = newValue.slice(0, cursorPos);
    const match = uptoCursor.match(/(?:^|[\s\n])@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStartIndex(cursorPos - match[1].length - 1);
      setMentionActiveIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }
  }

  function fecharMencao() {
    setMentionQuery(null);
    setMentionStartIndex(null);
  }

  function handleSelectMention(p: { telefone: string; nome: string | null }) {
    if (mentionStartIndex === null) return;
    const label = p.nome || formatPhone(p.telefone);
    const before = texto.slice(0, mentionStartIndex);
    const after = texto.slice(mentionStartIndex + 1 + (mentionQuery?.length ?? 0));
    const insercao = `@${label} `;
    const novoTexto = before + insercao + after;
    setTexto(novoTexto);
    setMentionedParticipantes((prev) => {
      const next = new Map(prev);
      next.set(p.telefone, label);
      return next;
    });
    fecharMencao();
    // Adia pro próximo tick: precisa que o React já tenha aplicado o novo
    // `value` no textarea antes de mexer em selectionRange.
    requestAnimationFrame(() => {
      const pos = before.length + insercao.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectMention(mentionSuggestions[mentionActiveIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        fecharMencao();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }

  // Item da lista de conversas, compartilhado entre a sidebar (desktop) e o
  // Dialog de conversas (mobile) — só o onClick muda entre os dois.
  function renderConvButton(conv: WaConversa, onSelect: () => void) {
    const naoAtribuida = (conv.responsaveis ?? []).length === 0;
    // Só quando a empresa tem mais de uma instância cadastrada — com uma só,
    // todo badge diria a mesma coisa em toda conversa, e seria só ruído.
    // Mesma condição já usada pra decidir se a sidebar agrupa por instância
    // (`conversasAgrupadasPorInstancia`) e pra mostrar o filtro "Instância".
    const apelidoInstancia =
      temMultiplasInstancias && conv.instancia_id
        ? apelidoPorInstanciaId.get(conv.instancia_id)
        : undefined;
    const infoCorInstanciaAtual: InfoCorInstancia = conv.instancia_id
      ? (infoCorPorInstanciaId.get(conv.instancia_id) ?? { tipo: "nenhuma" })
      : { tipo: "nenhuma" };
    return (
      <button
        key={conv.id}
        onClick={onSelect}
        className={cn(
          "flex flex-col gap-1.5 rounded-lg px-3 py-2.5 transition-colors w-full text-left",
          modoSelecao && selecionadas.has(conv.id)
            ? "bg-primary/10 ring-1 ring-primary/20"
            : conversaAtiva?.id === conv.id && !modoSelecao
              ? "bg-primary/10"
              : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-center gap-2.5">
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
                "text-sm font-medium text-foreground truncate",
                conversaNaoLida(conv, profile?.id) && !modoSelecao && "font-bold",
              )}
            >
              {conv.nome_contato ?? formatPhone(conv.telefone)}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              <UltimaMensagemPreview mensagem={conv.ultima_mensagem} />
            </p>
          </div>
          {!modoSelecao &&
            (conv.ultima_mensagem_at ||
              conversaNaoLida(conv, profile?.id) ||
              (conv.responsaveis ?? []).length > 0) && (
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1.5">
                  <ConversaParticipantesStack conv={conv} />
                  <NaoLidasBadge
                    conv={conv}
                    ativa={conversaAtiva?.id === conv.id}
                    currentUserId={profile?.id}
                  />
                </div>
                {conv.ultima_mensagem_at && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatTime(conv.ultima_mensagem_at)}
                  </span>
                )}
              </div>
            )}
        </div>
        {/* Rodapé da conversa: instância à esquerda, "Não atribuído" à
            direita (`ml-auto` no segundo em vez de `justify-between` no
            container — assim cada badge continua na ponta certa mesmo
            quando só um dos dois existe). */}
        {!modoSelecao && (naoAtribuida || apelidoInstancia) && (
          // 50px = avatar de 40px (`ConversaAvatar` tamanho "sm") + 10px do
          // `gap-2.5` ao lado dele — alinha com o nome/prévia da conversa em
          // vez de começar embaixo do avatar.
          <div className="flex items-center gap-2 pl-[50px]">
            {apelidoInstancia && infoCorInstanciaAtual.tipo === "hex" ? (
              // Hex livre não tem par claro/escuro calculado (ver
              // wa-instancia-cores.ts), então em vez de colorir borda/texto
              // (que pode não ler bem num dos dois temas), a cor vira só um
              // pontinho — o texto fica na cor neutra de sempre, já validada.
              <Badge
                variant="outline"
                className="h-4 max-w-[180px] gap-1 truncate px-1.5 py-0 text-[9px] font-medium leading-none text-muted-foreground"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: infoCorInstanciaAtual.hex }}
                />
                <span className="truncate">{apelidoInstancia}</span>
              </Badge>
            ) : (
              apelidoInstancia && (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 max-w-[180px] truncate px-1.5 py-0 text-[9px] font-medium leading-none",
                    infoCorInstanciaAtual.tipo === "preset"
                      ? CLASSES_BADGE_INSTANCIA[infoCorInstanciaAtual.cor]
                      : CLASSE_BADGE_INSTANCIA_SEM_COR,
                  )}
                >
                  <span className="truncate">{apelidoInstancia}</span>
                </Badge>
              )
            )}
            {naoAtribuida && (
              <Badge
                variant="outline"
                className="ml-auto h-4 max-w-[88px] truncate border-dashed border-orange-400 px-1.5 py-0 text-[9px] font-medium leading-none text-orange-600 dark:border-orange-500/60 dark:text-orange-400"
              >
                <span className="truncate">Não atribuído</span>
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

  // Resultados da busca por conteúdo de mensagem (todo o histórico), exibidos
  // abaixo da lista de conversas quando a barra de busca da sidebar tem texto.
  function renderResultadosMensagens() {
    const termo = busca.trim();
    if (termo.length < 2) return null;
    return (
      <div className="border-t border-border/60 mt-1 pt-1">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          Mensagens
        </p>
        {buscarMensagens.isPending ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Buscando mensagens...
          </div>
        ) : resultadosMensagens.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhuma mensagem encontrada.
          </p>
        ) : (
          resultadosMensagens.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selecionarResultadoBusca(r)}
              className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Avatar className="h-8 w-8 shrink-0 mt-0.5 border border-primary/10">
                {r.conversa?.foto_perfil_url && (
                  <AvatarImage src={r.conversa.foto_perfil_url} alt="" />
                )}
                <AvatarFallback
                  className={cn(
                    colorForPhone(r.conversa?.telefone ?? ""),
                    "text-white text-xs",
                  )}
                >
                  {initials(
                    r.conversa?.nome_contato ?? null,
                    r.conversa?.telefone ?? "",
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {r.conversa?.nome_contato ||
                      formatPhone(r.conversa?.telefone ?? "")}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(r.created_at), "dd/MM/yy HH:mm")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {r.direcao === "saida" ? "Você: " : ""}
                  {r.conteudo}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    );
  }

  const isConnected = config?.status === "connected";
  // Não trava o composer no envio da mensagem em si (sendMessage.isPending):
  // o usuário deve poder digitar/enviar a próxima mensagem mesmo que a anterior
  // ainda não tenha sido confirmada pelo servidor. Só trava durante upload de anexo.
  const isBusy = isUploading;

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
        <MeusChatsList
          conversas={conversasFiltradas}
          apelidoPorInstanciaId={apelidoPorInstanciaId}
          currentUserId={profile?.id}
          onOpen={(id) => {
            setConversaAtivaId(id);
            setAbaInbox("conversas");
          }}
          onVoltarNormal={() => setAbaInbox("conversas")}
          busca={busca}
          setBusca={setBusca}
          filtroStatus={filtroStatus}
          setFiltroStatus={setFiltroStatus}
          countAbertas={countAbertas}
          countFechadas={countFechadas}
          filtrosDropdownContent={filtrosDropdownContent}
          periodoFilterButton={renderPeriodoFilterButton(
            periodoFiltroOpenLista,
            setPeriodoFiltroOpenLista,
            undefined,
            true,
          )}
          hasFiltros={hasFiltrosConversa}
          activeFiltrosCount={activeFiltrosConversaCount}
          onLimparFiltros={limparFiltrosConversa}
        />
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
                      {conversaNaoLida(conv, profile?.id) && (
                        <span
                          title={
                            conversaAtiva?.id === conv.id
                              ? "Visualizando — continua não lida até você responder"
                              : undefined
                          }
                          className={cn(
                            "absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold ring-1 ring-background",
                            conversaAtiva?.id === conv.id
                              ? "border border-destructive bg-background text-destructive"
                              : "bg-destructive text-destructive-foreground",
                          )}
                        >
                          {conv.nao_lidas > 0
                            ? conv.nao_lidas > 9
                              ? "9+"
                              : conv.nao_lidas
                            : ""}
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
            <div className="hidden md:flex w-80 lg:w-[26rem] border-r border-border flex-col h-full shrink-0 transition-all duration-300">
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
                      onClick={() => {
                        setModoSelecao(true);
                        setFinalidadeSelecao("exportar");
                      }}
                      title="Exportar conversas"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setModoSelecao(true);
                        setFinalidadeSelecao("excluir");
                      }}
                      title="Excluir conversas"
                    >
                      <Trash2 className="h-4 w-4" />
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
                  <div className={TOGGLE_LIST_CLASS}>
                    <button
                      type="button"
                      onClick={() => setFiltroStatus("aberto")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md py-1.5 transition-colors",
                        filtroStatus === "aberto"
                          ? TOGGLE_BUTTON_ACTIVE
                          : TOGGLE_BUTTON_INACTIVE,
                      )}
                    >
                      Em aberto
                      <span
                        className={cn(
                          "text-[9px] px-1 rounded-full font-semibold",
                          filtroStatus === "aberto"
                            ? "bg-primary-foreground/20 text-primary-foreground"
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
                        "flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md py-1.5 transition-colors",
                        filtroStatus === "fechado"
                          ? TOGGLE_BUTTON_ACTIVE
                          : TOGGLE_BUTTON_INACTIVE,
                      )}
                    >
                      Fechado
                      <span
                        className={cn(
                          "text-[9px] px-1 rounded-full font-semibold",
                          filtroStatus === "fechado"
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted-foreground/10",
                        )}
                      >
                        {countFechadas}
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <FilterButton
                      hasFilters={hasFiltrosConversa}
                      activeFilterCount={activeFiltrosConversaCount}
                      className="flex-1"
                      align="start"
                      popoverClassName="w-auto"
                    >
                      {filtrosDropdownContent}
                    </FilterButton>
                    {renderPeriodoFilterButton(
                      periodoFiltroOpenDesktop,
                      setPeriodoFiltroOpenDesktop,
                    )}
                    {hasFiltrosConversa && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 shrink-0 gap-1.5 px-2.5 text-muted-foreground hover:text-destructive"
                        onClick={limparFiltrosConversa}
                        title="Limpar filtros"
                      >
                        <FilterX className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Limpar</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="relative pb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:ring-1"
                    placeholder="Buscar por nome, telefone ou mensagem..."
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
                        todasDaAbaAtualSelecionadas
                          ? "bg-primary border-primary"
                          : "border-border bg-background",
                      )}
                    >
                      {todasDaAbaAtualSelecionadas && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    {todasDaAbaAtualSelecionadas
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
                    busca.trim().length >= 2 ? null : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 px-4 text-center">
                        <MessageCircle className="h-8 w-8 opacity-30" />
                        Nenhuma conversa ainda
                      </div>
                    )
                  ) : (
                    renderConvList((conv) =>
                      modoSelecao
                        ? toggleSelecao(conv.id)
                        : setConversaAtivaId(conv.id),
                    )
                  )}
                  {!modoSelecao && renderResultadosMensagens()}
                </div>
              </ScrollArea>
              <div className="border-t border-border px-3 py-2 mt-auto bg-muted/30 h-[4rem] flex items-center">
                {modoSelecao && finalidadeSelecao === "exportar" ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full gap-2"
                    disabled={selecionadas.size === 0}
                    onClick={() => setExportSelecionadasOpen(true)}
                  >
                    <Download className="h-4 w-4" />
                    Exportar{" "}
                    {selecionadas.size > 0
                      ? `(${selecionadas.size})`
                      : "selecionadas"}
                  </Button>
                ) : modoSelecao ? (
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
                ) : (
                  <div className="flex items-center gap-1 w-full">
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="flex items-center gap-2 flex-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
                      title="Recolher conversas"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                      <span className="text-xs">Recolher</span>
                    </button>
                    <button
                      onClick={() =>
                        setAbaInbox(
                          abaInbox === "meus-chats"
                            ? "conversas"
                            : "meus-chats",
                        )
                      }
                      className={cn(
                        "flex items-center gap-2 flex-1 p-1.5 rounded-lg transition-colors",
                        abaInbox === "meus-chats"
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50 text-muted-foreground",
                      )}
                      title="Lista"
                    >
                      <List className="h-4 w-4" />
                      <span className="text-xs">Lista</span>
                    </button>
                  </div>
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
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setModoSelecao(true);
                          setFinalidadeSelecao("exportar");
                        }}
                        title="Exportar conversas"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setModoSelecao(true);
                          setFinalidadeSelecao("excluir");
                        }}
                        title="Excluir conversas"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
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
                      <div className={cn(TOGGLE_LIST_CLASS, "flex-1")}>
                        <button
                          type="button"
                          onClick={() => setFiltroStatus("aberto")}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1 transition-colors",
                            filtroStatus === "aberto"
                              ? TOGGLE_BUTTON_ACTIVE
                              : TOGGLE_BUTTON_INACTIVE,
                          )}
                        >
                          Em aberto
                          <span
                            className={cn(
                              "text-[9px] px-1 rounded-full font-semibold",
                              filtroStatus === "aberto"
                                ? "bg-primary-foreground/20 text-primary-foreground"
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
                              ? TOGGLE_BUTTON_ACTIVE
                              : TOGGLE_BUTTON_INACTIVE,
                          )}
                        >
                          Fechado
                          <span
                            className={cn(
                              "text-[9px] px-1 rounded-full font-semibold",
                              filtroStatus === "fechado"
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-muted-foreground/10",
                            )}
                          >
                            {countFechadas}
                          </span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <FilterButton
                          hasFilters={hasFiltrosConversa}
                          activeFilterCount={activeFiltrosConversaCount}
                          className="flex-1"
                          align="end"
                          popoverClassName="w-auto"
                        >
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
                                Lista
                              </span>
                              {abaInbox === "meus-chats" && (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <div className="mx-3 my-1 border-t border-border/50" />
                            {filtroStatus !== "fechado" && (
                              <>
                                <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                  Conversa
                                </p>
                                {(
                                  [
                                    ["todos", "Todos"],
                                    ["geral", "Não atribuído"],
                                    ["meu", meuChatsLabel],
                                    ...(isGestor
                                      ? ([
                                          ["outros", "Outros atendentes"],
                                        ] as const)
                                      : []),
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
                              </>
                            )}
                            {temInstanciaConhecida && (
                              <>
                                {filtroStatus !== "fechado" && (
                                  <div className="mx-3 my-1 border-t border-border/50" />
                                )}
                                <p
                                  className={cn(
                                    "px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70",
                                    filtroStatus === "fechado" && "pt-1",
                                  )}
                                >
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
                            {vendedores.length > 0 && filtroStatus !== "fechado" && (
                              <>
                                <div className="mx-3 my-1 border-t border-border/50" />
                                <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                  Responsável
                                </p>
                                <Popover
                                  open={filtroResponsavelOpenMobile}
                                  onOpenChange={(v) => {
                                    setFiltroResponsavelOpenMobile(v);
                                    if (!v) setBuscaFiltroResponsavel("");
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className={cn(
                                        "mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-muted/80",
                                        filtroResponsavel.length > 0 &&
                                          "bg-primary/10 text-primary",
                                      )}
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        {vendedoresResponsavelSelecionados.length ===
                                        1 ? (
                                          <>
                                            <Avatar className="h-5 w-5 shrink-0">
                                              {vendedoresResponsavelSelecionados[0]
                                                .avatar_url ? (
                                                <img
                                                  src={
                                                    vendedoresResponsavelSelecionados[0]
                                                      .avatar_url
                                                  }
                                                  alt={
                                                    vendedoresResponsavelSelecionados[0]
                                                      .nome
                                                  }
                                                  className="h-full w-full object-cover rounded-full"
                                                />
                                              ) : (
                                                <AvatarFallback className="text-[9px] bg-muted-foreground/20">
                                                  {vendedoresResponsavelSelecionados[0].nome
                                                    .trim()
                                                    .split(" ")
                                                    .map((p: string) => p[0])
                                                    .slice(0, 2)
                                                    .join("")
                                                    .toUpperCase()}
                                                </AvatarFallback>
                                              )}
                                            </Avatar>
                                            <span className="truncate">
                                              {
                                                vendedoresResponsavelSelecionados[0]
                                                  .nome
                                              }
                                            </span>
                                          </>
                                        ) : vendedoresResponsavelSelecionados.length >
                                          1 ? (
                                          <span className="truncate">
                                            {
                                              vendedoresResponsavelSelecionados.length
                                            }{" "}
                                            selecionados
                                          </span>
                                        ) : (
                                          <span>Todos</span>
                                        )}
                                      </span>
                                      {filtroResponsavelOpenMobile ? (
                                        <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                      )}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    align="start"
                                    className="w-56 p-0"
                                  >
                                    <Command shouldFilter={false}>
                                      <CommandInput
                                        placeholder="Buscar responsável..."
                                        value={buscaFiltroResponsavel}
                                        onValueChange={
                                          setBuscaFiltroResponsavel
                                        }
                                      />
                                      <CommandList>
                                        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                          Nenhum usuário encontrado.
                                        </CommandEmpty>
                                        <CommandGroup>
                                          <CommandItem
                                            value="todos"
                                            onSelect={() => {
                                              setFiltroResponsavel([]);
                                              setFiltroResponsavelOpenMobile(
                                                false,
                                              );
                                            }}
                                            className="gap-2.5"
                                          >
                                            <span className="flex-1">
                                              Todos
                                            </span>
                                            {filtroResponsavel.length === 0 && (
                                              <Check className="h-3.5 w-3.5 shrink-0" />
                                            )}
                                          </CommandItem>
                                          {vendedoresFiltroResponsavel.map(
                                            (v) => (
                                              <CommandItem
                                                key={v.id}
                                                value={v.id}
                                                onSelect={() =>
                                                  toggleFiltroResponsavel(v.id)
                                                }
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
                                                        .map(
                                                          (p: string) => p[0],
                                                        )
                                                        .slice(0, 2)
                                                        .join("")
                                                        .toUpperCase()}
                                                    </AvatarFallback>
                                                  )}
                                                </Avatar>
                                                <span className="flex-1 truncate">
                                                  {v.nome}
                                                </span>
                                                {filtroResponsavel.includes(
                                                  v.id,
                                                ) && (
                                                  <Check className="h-3.5 w-3.5 shrink-0" />
                                                )}
                                              </CommandItem>
                                            ),
                                          )}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </>
                            )}
                          </div>
                        </FilterButton>
                        {renderPeriodoFilterButton(
                          periodoFiltroOpenMobile,
                          setPeriodoFiltroOpenMobile,
                        )}
                        {hasFiltrosConversa && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 shrink-0 gap-1.5 px-2.5 text-muted-foreground hover:text-destructive"
                            onClick={limparFiltrosConversa}
                            title="Limpar filtros"
                          >
                            <FilterX className="h-3.5 w-3.5" />
                            Limpar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="relative pb-2">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:ring-1"
                      placeholder="Buscar por nome, telefone ou mensagem..."
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
                          todasDaAbaAtualSelecionadas
                            ? "bg-primary border-primary"
                            : "border-border bg-background",
                        )}
                      >
                        {todasDaAbaAtualSelecionadas && (
                          <Check className="h-2.5 w-2.5 text-primary-foreground" />
                        )}
                      </div>
                      {todasDaAbaAtualSelecionadas
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
                      busca.trim().length >= 2 ? null : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 px-4 text-center">
                          <MessageCircle className="h-8 w-8 opacity-30" />
                          Nenhuma conversa ainda
                        </div>
                      )
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
                    {!modoSelecao && renderResultadosMensagens()}
                  </div>
                </ScrollArea>

                {modoSelecao && finalidadeSelecao === "exportar" ? (
                  <div className="border-t border-border px-3 py-2 bg-muted/30">
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full gap-2"
                      disabled={selecionadas.size === 0}
                      onClick={() => setExportSelecionadasOpen(true)}
                    >
                      <Download className="h-4 w-4" />
                      Exportar{" "}
                      {selecionadas.size > 0
                        ? `(${selecionadas.size})`
                        : "selecionadas"}
                    </Button>
                  </div>
                ) : modoSelecao ? (
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
                ) : null}
              </div>
            </DialogContent>
          </Dialog>

          {/* Área de mensagens */}
          <div
            className="flex-1 flex flex-col min-w-0 relative"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropFiles}
          >
            {isDraggingFile && conversaAtiva && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]">
                <div className="flex flex-col items-center gap-2 rounded-lg bg-background/90 px-6 py-4 shadow-lg">
                  <Paperclip className="h-6 w-6 text-primary" />
                  <p className="text-sm font-medium">
                    Solte os arquivos para anexar
                  </p>
                </div>
              </div>
            )}
            {conversaAtiva ? (
              <>
                {/* Modal de atribuição: cobre só o painel da conversa (não a página
                  inteira), ancorado acima do campo de digitação e centralizado
                  horizontalmente. Aparece ao abrir uma conversa sem responsável. */}
                {atribuicaoModalOpen && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-4 pb-24">
                    <div className="pointer-events-auto flex w-fit max-w-[92vw] items-center gap-4 rounded-lg border bg-background p-4 shadow-lg">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                        <UserX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="shrink-0">
                        <p className="text-sm font-semibold leading-none tracking-tight whitespace-nowrap">
                          Conversa sem responsável!
                        </p>
                        <p className="mt-1.5 text-xs text-muted-foreground whitespace-nowrap">
                          Assuma a conversa ou direcione para um colega.
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
                        <Popover
                          open={direcionarOpen}
                          onOpenChange={(v) => {
                            setDirecionarOpen(v);
                            if (!v) setBuscaDirecionar("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={setResponsaveis.isPending}
                            >
                              <Users className="h-4 w-4" />
                              Direcionar
                              {direcionarOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="center" className="w-64 p-0">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Buscar colega..."
                                value={buscaDirecionar}
                                onValueChange={setBuscaDirecionar}
                              />
                              <CommandList>
                                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                  Nenhum colega encontrado.
                                </CommandEmpty>
                                <CommandGroup>
                                  {vendedoresDirecionar.map((v) => (
                                    <CommandItem
                                      key={v.id}
                                      value={v.id}
                                      onSelect={() =>
                                        direcionarConversa(conversaAtiva, v.id)
                                      }
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
                                      <span className="flex-1 truncate">
                                        {v.nome}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <ConversaVisualizadoresStack
                        conv={conversaAtiva}
                        onClick={() => setVisualizadoresSheetOpen(true)}
                      />
                    </div>
                  </div>
                )}

                {/* Header da conversa */}
                <div className="relative flex items-center gap-2 px-2 py-3 border-b border-border bg-muted/30 h-[4rem] sm:gap-3 sm:px-4">
                  <button
                    className="flex flex-1 items-center gap-2 min-w-0 group sm:gap-3"
                    onClick={() => setLeadSheetOpen(true)}
                    title="Ver detalhes do lead"
                  >
                    <Avatar className="h-8 w-8 border border-primary/10 shrink-0">
                      {conversaAtiva.foto_perfil_url && (
                        <AvatarImage
                          src={conversaAtiva.foto_perfil_url}
                          alt=""
                        />
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
                      <p className="text-xs text-muted-foreground capitalize truncate">
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
                  {conversaNaoLida(conversaAtiva, profile?.id) && (
                    <span
                      title="Continua não lida até você responder"
                      className="hidden shrink-0 items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold leading-4 text-destructive md:absolute md:left-1/2 md:top-1/2 md:flex md:-translate-x-1/2 md:-translate-y-1/2"
                    >
                      <Eye className="h-3 w-3" />
                      Não lida
                    </span>
                  )}
                  <Popover
                    open={editarResponsavelOpen}
                    onOpenChange={(v) => {
                      setEditarResponsavelOpen(v);
                      if (!v) setBuscaEditarResponsavel("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Alterar responsável pelo atendimento"
                        className="shrink-0 gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-primary sm:px-2"
                      >
                        {(conversaAtiva.responsaveis ?? []).length > 0 ? (
                          <>
                            <ConversaParticipantesStack
                              conv={conversaAtiva}
                              spacing="gap"
                            />
                            <span className="hidden max-w-[120px] truncate sm:inline">
                              {conversaAtiva.responsaveis!.length === 1
                                ? conversaAtiva.responsaveis![0].nome.split(
                                    " ",
                                  )[0]
                                : `${conversaAtiva.responsaveis!.length} responsáveis`}
                            </span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">
                              Adicionar responsável
                            </span>
                          </>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-0">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar colega..."
                          value={buscaEditarResponsavel}
                          onValueChange={setBuscaEditarResponsavel}
                        />
                        <CommandList>
                          <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                            Nenhum usuário encontrado.
                          </CommandEmpty>
                          <CommandGroup>
                            {vendedoresEditarResponsavel.map((v) => {
                              const selecionado = (
                                conversaAtiva.responsaveis ?? []
                              ).some((r) => r.id === v.id);
                              return (
                                <CommandItem
                                  key={v.id}
                                  value={v.id}
                                  onSelect={() =>
                                    toggleResponsavelHeader(conversaAtiva, v.id)
                                  }
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
                                  <span className="flex-1 truncate">
                                    {v.nome}
                                  </span>
                                  {selecionado && (
                                    <Check className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Popover
                      open={buscaMensagensOpen}
                      onOpenChange={setBuscaMensagensOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          title="Buscar mensagem nesta conversa"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[min(28rem,90vw)] p-0"
                        onInteractOutside={(e) => {
                          // O toast de "nova mensagem" (sonner) some e volta
                          // durante uma rajada de mensagens recebidas, e o
                          // Radix interpreta a interação nele como um clique
                          // fora do popover — fechando a busca e derrubando o
                          // texto digitado. Ignora interações que se originam
                          // no toaster; um clique de verdade fora do popover
                          // continua fechando normalmente.
                          if (
                            e.target instanceof Element &&
                            e.target.closest("[data-sonner-toaster]")
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <ChatMessageSearch
                          className="rounded-md border-none"
                          messages={mensagens.map((m) => ({
                            id: m.id,
                            texto: m.conteudo,
                          }))}
                          onNavigate={irParaMensagem}
                          onClose={() => setBuscaMensagensOpen(false)}
                          placeholder="Buscar mensagem nesta conversa..."
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={
                        conversaAtiva.arquivada
                          ? "Reabrir conversa"
                          : "Fechar conversa"
                      }
                      className="gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-primary transition-colors sm:px-3"
                      onClick={() => {
                        const novaArquivada = !conversaAtiva.arquivada;
                        arquivarConversa.mutate({
                          conversaId: conversaAtiva.id,
                          arquivada: novaArquivada,
                        });
                        if (novaArquivada) {
                          // Fechar a conversa remove todos os responsáveis
                          // automaticamente (trigger no banco); registra isso no
                          // timeline pra ficar visível quem estava no atendimento.
                          const autor = profile?.nome ?? "Alguém";
                          const responsaveisAtuais =
                            conversaAtiva.responsaveis ?? [];
                          const texto =
                            responsaveisAtuais.length > 0
                              ? `${autor} fechou a conversa e removeu ${responsaveisAtuais
                                  .map((r) => r.nome)
                                  .join(", ")} dos responsáveis`
                              : `${autor} fechou a conversa`;
                          addNota.mutate({
                            conversaId: conversaAtiva.id,
                            texto,
                          });
                        }
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
                      <span className="hidden sm:inline">
                        {conversaAtiva.arquivada
                          ? "Reabrir conversa"
                          : "Marcar como fechada"}
                      </span>
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
                          className="gap-2"
                          onClick={() => marcarNaoLida.mutate(conversaAtiva.id)}
                          disabled={conversaNaoLida(conversaAtiva, profile?.id)}
                        >
                          <EyeOff className="h-4 w-4" />
                          Marcar como não lida
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
                          onClick={() =>
                            limparConversa.mutate(conversaAtiva.id)
                          }
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
                          Esta conversa e todas as suas mensagens serão
                          deletadas permanentemente. Esta ação não pode ser
                          desfeita.
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

                  {/* Confirmação de excluir mensagem */}
                  <AlertDialog
                    open={!!msgParaApagar}
                    onOpenChange={(open) => !open && setMsgParaApagar(null)}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta mensagem será removida do WhatsApp para todos os participantes da conversa. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={confirmarApagarMensagem}
                        >
                          {excluirMensagem.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Excluir"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Notas fixadas — ficam sempre visíveis no topo, fora da rolagem normal */}
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
                      <div
                        className={cn(
                          "py-4 space-y-1",
                          atribuicaoModalOpen && "pb-40",
                        )}
                      >
                        {loadingOlderMensagens && (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {gruposPorDia.map((grupo) => (
                          <div key={grupo.dateKey} className="relative">
                            <div className="sticky top-0 z-10 flex items-center justify-center py-2">
                              <span className="text-[10px] bg-muted/90 backdrop-blur-sm text-muted-foreground px-3 py-1 rounded-full shadow-sm">
                                {grupo.label}
                              </span>
                            </div>
                            {grupo.itens.map(({ msg, index: i }) => {
                            const isSaida = msg.direcao === "saida";
                            const prevMsg = mensagens[i - 1];
                            const showDate =
                              !prevMsg ||
                              new Date(msg.created_at).toDateString() !==
                                new Date(prevMsg.created_at).toDateString();
                            const isLast = i === mensagens.length - 1;
                            // Mensagem de saída sem usuario_id = veio de fora do CRM (WhatsApp
                            // Web/celular físico, ver comentário no whatsapp-webhook) — quem
                            // mandou costuma se identificar com um prefixo manual "*Nome:*".
                            const prefixoExterno =
                              isSaida && !msg.usuario
                                ? extrairPrefixoRemetenteExterno(msg.conteudo)
                                : null;
                            const usuarioExterno = prefixoExterno
                              ? (vendedores.find(
                                  (v) =>
                                    normalizeNomeBusca(v.nome) ===
                                    normalizeNomeBusca(prefixoExterno.nome),
                                ) ?? null)
                              : null;
                            const msgParaExibir = prefixoExterno
                              ? { ...msg, conteudo: prefixoExterno.resto }
                              : msg;
                            // Chave de quem mandou uma mensagem de saída: id do usuário do CRM,
                            // senão o nome extraído do prefixo manual "*Nome:*" — sem isso, duas
                            // pessoas diferentes respondendo por fora do CRM em sequência caíam no
                            // mesmo "null === null" e a segunda ficava sem nome, empilhada como se
                            // fosse a primeira.
                            const remetenteSaidaChave = (m: WaMensagem): string | null =>
                              m.usuario?.id ??
                              extrairPrefixoRemetenteExterno(m.conteudo)?.nome ??
                              null;
                            // Empilha mensagens consecutivas do mesmo remetente sem repetir o
                            // nome/número acima de cada bolha — só mostra na primeira da leva.
                            // Quando a mensagem de saída atual não tem como se identificar (sem
                            // usuario_id nem prefixo "*Nome:*"), assume que é continuação de quem
                            // já estava mandando — não tem como saber se é uma pessoa nova, e tratar
                            // como "nova" faria o badge genérico "Fora do CRM" repetir a cada
                            // mensagem de uma sequência da mesma pessoa.
                            const isFirstDoRemetente =
                              !prevMsg ||
                              showDate ||
                              prevMsg.direcao !== msg.direcao ||
                              (isSaida
                                ? remetenteSaidaChave(msg) !== null &&
                                  remetenteSaidaChave(prevMsg) !==
                                    remetenteSaidaChave(msg)
                                : (prevMsg.remetente_telefone ?? null) !==
                                  (msg.remetente_telefone ?? null));
  
                            // Notificação de chamada de voz/vídeo feita pelo cliente via WhatsApp
                            // (webhook de evento "call" da uazapi) — assim como o WhatsApp Web/app
                            // oficial, renderiza como um chip centralizado em vez de bolha normal,
                            // já que não é uma mensagem de texto trocada entre as partes.
                            if (msg.tipo === "chamada") {
                              return (
                                <div
                                  key={msg.id}
                                  id={`wa-msg-${msg.id}`}
                                  ref={isLast ? msgScrollRef : undefined}
                                >
                                  <div
                                    className={cn(
                                      "flex justify-center",
                                      prevMsg?.direcao !== msg.direcao
                                        ? "mt-3"
                                        : "mt-0.5",
                                    )}
                                  >
                                    <div className="max-w-[75%] items-center">
                                      <div
                                        className={cn(
                                          "px-3 py-2 break-words rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 text-foreground flex items-center gap-1.5",
                                          msg.id === destacadaMsgId &&
                                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                                        )}
                                      >
                                        <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <p className="text-xs text-center whitespace-pre-wrap">
                                          {msg.conteudo}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5 justify-center">
                                        <span className="text-[9px] text-muted-foreground">
                                          {format(
                                            new Date(msg.created_at),
                                            "HH:mm",
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // Nota de sistema (ex: "Fulano assumiu esta conversa") — nunca foi
                            // enviada ao WhatsApp. Renderiza centralizada (como um chip de
                            // sistema). Notas digitadas manualmente usam bg âmbar; notas de
                            // sistema usam um cinza neutro, pra diferenciar as duas na conversa.
                            if (msg.is_nota_interna) {
                              const isNotaManual =
                                msg.usuario?.nome &&
                                !msg.conteudo?.startsWith(msg.usuario.nome);
                              return (
                                <div
                                  key={msg.id}
                                  id={`wa-msg-${msg.id}`}
                                  ref={isLast ? msgScrollRef : undefined}
                                >
                                  <div
                                    className={cn(
                                      "flex justify-center",
                                      prevMsg?.direcao !== msg.direcao
                                        ? "mt-3"
                                        : "mt-0.5",
                                    )}
                                  >
                                    <div className="max-w-[75%] items-center">
                                      <div
                                        className={cn(
                                          "px-3 py-2 break-words rounded-2xl border text-foreground",
                                          isNotaManual
                                            ? "bg-amber-100 dark:bg-amber-950/50 border-amber-200/70 dark:border-amber-900/50"
                                            : "bg-slate-200 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700",
                                          msg.id === destacadaMsgId &&
                                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                                        )}
                                      >
                                        <p className="text-xs text-center whitespace-pre-wrap text-foreground">
                                          <StickyNote
                                            className={cn(
                                              "inline-block h-3 w-3 mr-1 -mt-0.5",
                                              isNotaManual
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-slate-600 dark:text-slate-400",
                                            )}
                                          />
                                          <span
                                            className={cn(
                                              "font-semibold",
                                              isNotaManual
                                                ? "text-amber-800 dark:text-amber-300"
                                                : "text-slate-700 dark:text-slate-300",
                                            )}
                                          >
                                            Nota interna
                                            {/* Notas de sistema (assumir/direcionar/fechar conversa,
                                                adicionar/remover responsável) já embutem o nome do
                                                autor no início do texto — repetir aqui seria
                                                redundante. Só mostra o nome quando ele não aparece
                                                no início do conteúdo (nota digitada manualmente). */}
                                            {isNotaManual ? ` (${msg.usuario.nome})` : ""}:
                                          </span>{" "}
                                          {linkifyText(msg.conteudo)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5 justify-center">
                                        <span className="text-[9px] text-muted-foreground">
                                          {format(
                                            new Date(msg.created_at),
                                            "HH:mm",
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
  
                            return (
                              <div
                                key={msg.id}
                                id={`wa-msg-${msg.id}`}
                                ref={isLast ? msgScrollRef : undefined}
                              >
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
                                    <DraggableBubble
                                      msg={msg}
                                      isSaida={isSaida}
                                      onReply={handleReply}
                                      onReact={handleReact}
                                      onExcluir={setMsgParaApagar}
                                    >
                                      <div
                                        className={cn(
                                          "relative",
                                          msg.tipo === "audio"
                                            ? "p-0.5"
                                            : "px-3 py-2",
                                          "break-words transition-shadow duration-500",
                                          isSaida
                                            ? "bg-orange-500 text-white rounded-2xl rounded-tr-sm"
                                            : "bg-muted text-foreground rounded-2xl rounded-tl-sm",
                                          msg.id === destacadaMsgId &&
                                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                                        )}
                                      >
                                        {isSaida &&
                                          msg.usuario &&
                                          isFirstDoRemetente && (
                                            <UserPreviewPopover
                                              usuario={msg.usuario}
                                              nameClassName={cn(
                                                "block w-fit max-w-full whitespace-nowrap text-sm font-semibold leading-tight mb-2 text-white",
                                                msg.tipo === "audio" &&
                                                  "w-[calc(100%-0.75rem)] mx-1.5 mt-1.5",
                                              )}
                                            />
                                          )}
                                        {isSaida &&
                                          !msg.usuario &&
                                          isFirstDoRemetente && (
                                            <div
                                              className={cn(
                                                "flex items-center gap-1 mb-2",
                                                msg.tipo === "audio" &&
                                                  "w-[calc(100%-0.75rem)] mx-1.5 mt-1.5",
                                              )}
                                            >
                                              {usuarioExterno ? (
                                                <UserPreviewPopover
                                                  usuario={usuarioExterno}
                                                  nameClassName="w-fit max-w-full whitespace-nowrap text-sm font-semibold leading-tight text-white"
                                                />
                                              ) : (
                                                <span className="w-fit max-w-full truncate text-sm font-semibold leading-tight text-white">
                                                  {/* Sem "*Nome*" no início do texto pra identificar
                                                      quem mandou (convenção manual) — não dá pra saber
                                                      quem foi, mas ainda assim sinaliza que não veio do
                                                      CRM, em vez de deixar a bolha sem nenhuma pista. */}
                                                  {prefixoExterno?.nome ?? "Fora do CRM"}
                                                </span>
                                              )}
                                              <span
                                                title="Enviado fora do CRM (WhatsApp Web/celular) — sem como identificar quem enviou"
                                                className="inline-flex items-center gap-0.5 shrink-0 px-1 py-0.5 rounded text-[9px] font-medium bg-white/20 text-white"
                                              >
                                                <Smartphone className="h-2.5 w-2.5" />
                                              </span>
                                            </div>
                                          )}
                                        {!isSaida && isFirstDoRemetente && (
                                          <ContactPreviewPopover
                                            conversa={conversaAtiva}
                                            remetenteNome={msg.remetente_nome}
                                            remetenteTelefone={
                                              msg.remetente_telefone
                                            }
                                            nameClassName={cn(
                                              "block w-fit max-w-full whitespace-nowrap text-sm font-semibold leading-tight mb-2",
                                              senderNameColor(conversaAtiva.id),
                                              msg.tipo === "audio" &&
                                                "w-[calc(100%-0.75rem)] mx-1.5 mt-1.5",
                                            )}
                                          />
                                        )}
                                        {msg.quoted_wamid && (
                                          <QuotedPreview
                                            remetenteNome={
                                              msg.quoted_remetente_nome
                                            }
                                            conteudo={msg.quoted_conteudo}
                                            tipo={msg.quoted_tipo}
                                            isSaida={isSaida}
                                            onClick={() => {
                                              const originalId = idPorWamid.get(
                                                msg.quoted_wamid!,
                                              );
                                              if (!originalId) return;
                                              irParaMensagem(originalId);
                                            }}
                                          />
                                        )}
                                        <MessageContent
                                          msg={msgParaExibir}
                                          isSaida={isSaida}
                                          onImageClick={(url) =>
                                            setViewingImage({ url })
                                          }
                                          onPreviewFile={setPreviewFile}
                                          conversaAtiva={conversaAtiva}
                                        />
                                        <ReactionBadge
                                          reacoes={msg.reacoes ?? []}
                                          isSaida={isSaida}
                                          onToggle={(emoji) =>
                                            handleReact(msg, emoji)
                                          }
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
                                    </DraggableBubble>
                                  </div>
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        ))}
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

                {/* Notas fixadas — mostradas coladas acima do campo de digitação */}
                {notasFixadas.length > 0 && (
                  <div className="border-t border-border bg-amber-50 dark:bg-amber-950/20 px-4 py-3 max-h-40 overflow-y-auto space-y-2">
                    {notasFixadas.map((n) => (
                      <div key={n.id} className="flex items-start gap-2">
                        <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-900 dark:text-amber-200 flex-1 break-words">
                          {linkifyText(n.conteudo)}
                          <span className="text-amber-700/70 dark:text-amber-300/60">
                            {" "}
                            ·{" "}
                            {format(
                              new Date(n.created_at),
                              "dd/MM/yyyy HH:mm",
                              { locale: ptBR },
                            )}
                          </span>
                        </p>
                        <button
                          type="button"
                          title="Desafixar"
                          className="shrink-0 text-amber-600/70 dark:text-amber-400/70 hover:text-amber-900 dark:hover:text-amber-200"
                          onClick={() =>
                            setNotaFixadaMutation.mutate({
                              notaId: n.id,
                              fixada: false,
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input de envio */}
                <div className="relative border-t border-border px-4 py-3 min-h-[4rem] flex flex-col justify-center">
                  {/* Dropdown de menção (@participante), só em grupos */}
                  {mentionQuery !== null && mentionSuggestions.length > 0 && (
                    <div className="absolute bottom-full left-4 mb-1 w-64 max-h-52 overflow-auto rounded-md border border-border bg-popover shadow-md z-20">
                      <Command shouldFilter={false}>
                        <CommandList>
                          <CommandGroup>
                            {mentionSuggestions.map((p, i) => (
                              <CommandItem
                                key={p.telefone}
                                onSelect={() => handleSelectMention(p)}
                                className={cn(
                                  "cursor-pointer",
                                  i === mentionActiveIndex && "bg-accent text-accent-foreground",
                                )}
                              >
                                {p.nome || formatPhone(p.telefone)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </div>
                  )}
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

                  {/* Preview da mensagem em resposta — clicar rola até a mensagem original */}
                  {respondendoA && (
                    <div className="max-w-sm">
                      <QuotedPreview
                        remetenteNome={quotedNomeFor(respondendoA)}
                        conteudo={respondendoA.conteudo}
                        tipo={respondendoA.tipo}
                        onClick={() => irParaMensagem(respondendoA.id)}
                        onCancel={() => setRespondendoA(null)}
                      />
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
                    {/* Nova tarefa (sem FK pra clientes/contatos, ver use-tarefas.ts) ou
                      nota interna (is_nota_interna, nunca enviada ao WhatsApp) */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                          disabled={isBusy || isRecording || !!pendingAudio}
                          title="Adicionar"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {/* Só este item sai. O menu continua existindo para "Adicionar
                            nota", que é do WhatsApp e não tem relação com Tarefas — menu
                            com um item só funciona normalmente. */}
                        {temTarefasSecao === true && (
                        <DropdownMenuItem onClick={abrirNovaTarefa}>
                          <ListTodo className="h-4 w-4 mr-2" />
                          Nova tarefa
                        </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setNovaNotaOpen(true)}>
                          <StickyNote className="h-4 w-4 mr-2" />
                          Adicionar nota
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                        onChange={handleTextoChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePasteImage}
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
        <DialogContent className="max-w-6xl w-full p-0 gap-0 flex flex-col max-h-[95vh]">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle>Visualizar imagem</DialogTitle>
          </DialogHeader>
          {viewingImage && (
            <>
              <div className="relative flex-1 min-h-0 flex items-center justify-center bg-muted/30 p-4 overflow-hidden">
                <img
                  src={viewingImage.url}
                  alt="Visualização"
                  draggable={false}
                  onWheel={handleImgWheel}
                  onDoubleClick={handleImgDoubleClick}
                  onMouseDown={handleImgMouseDown}
                  className={cn(
                    "max-w-full max-h-full object-contain rounded-lg shadow-md select-none",
                    imgZoom > IMG_ZOOM_MIN
                      ? isDraggingImg
                        ? "cursor-grabbing"
                        : "cursor-grab"
                      : "cursor-zoom-in",
                  )}
                  style={{
                    transform: `scale(${imgZoom}) translate(${imgOffset.x}px, ${imgOffset.y}px)`,
                    transition: isDraggingImg ? "none" : "transform 0.15s ease-out",
                  }}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1 py-1 shadow-sm backdrop-blur">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={zoomImgOut}
                    disabled={imgZoom <= IMG_ZOOM_MIN}
                    title="Diminuir zoom"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
                    {Math.round(imgZoom * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={zoomImgIn}
                    disabled={imgZoom >= IMG_ZOOM_MAX}
                    title="Aumentar zoom"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  {imgZoom > IMG_ZOOM_MIN && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={resetImgZoom}
                      title="Restaurar zoom"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter className="px-4 py-3 border-t border-border sm:justify-between">
                {viewingImage.msgId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const msgId = viewingImage.msgId!;
                      setViewingImage(null);
                      setLeadSheetOpen(false);
                      setTimeout(() => irParaMensagem(msgId), 300);
                    }}
                  >
                    <MessageSquareText className="h-4 w-4" /> Ver na conversa
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => downloadFile(viewingImage.url, "imagem.jpg")}
                >
                  <Download className="h-4 w-4" /> Baixar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onJumpToMessage={(id) => {
          setPreviewFile(null);
          setLeadSheetOpen(false);
          setTimeout(() => irParaMensagem(id), 300);
        }}
      />

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

      {/* "Selecionar todas" só enxerga a aba visível (Em aberto/Fechado) —
          pergunta antes de deixar a outra de fora da seleção. */}
      <AlertDialog
        open={confirmSelecionarTodasOpen}
        onOpenChange={setConfirmSelecionarTodasOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Incluir as conversas{" "}
              {filtroStatus === "aberto" ? "fechadas" : "em aberto"} também?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está vendo só as conversas{" "}
              {filtroStatus === "aberto" ? "em aberto" : "fechadas"}. Existem{" "}
              {conversasOutraAba.length}{" "}
              {filtroStatus === "aberto"
                ? conversasOutraAba.length === 1
                  ? "conversa fechada"
                  : "conversas fechadas"
                : "conversas em aberto"}{" "}
              que não aparecem nesta lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmarSelecionarTodas(false)}>
              Só as {filtroStatus === "aberto" ? "em aberto" : "fechadas"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmarSelecionarTodas(true)}
            >
              Incluir as{" "}
              {filtroStatus === "aberto" ? "fechadas" : "em aberto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* `leadSheetOpen` na condição, e não só `conversaAtiva`.

          Montado sempre que havia conversa aberta, o painel rodava os próprios
          hooks mesmo invisível: `useWaMensagens(conversa.id)` para a MESMA
          conversa já carregada pela tela, mais `useTarefasPorConversa`. E como o
          nome do canal realtime inclui `Date.now()`, os dois hooks abriam canais
          DISTINTOS para a mesma conversa — sem dedupe — e dois `refetchInterval`
          de 20 s. Toda conversa aberta custava o dobro de consulta, o dobro de
          canal e o dobro de polling, para um painel que quase sempre está
          fechado. */}
      <VisualizadoresSheet
        conv={conversaAtiva}
        open={visualizadoresSheetOpen}
        onOpenChange={setVisualizadoresSheetOpen}
      />

      {conversaAtiva && leadSheetOpen && (
        <LeadSheet
          conversa={conversaAtiva}
          participantesGrupo={participantesGrupo}
          open={leadSheetOpen}
          onOpenChange={setLeadSheetOpen}
          onImageClick={(url, msgId) => setViewingImage({ url, msgId })}
          onPreviewFile={setPreviewFile}
          onJumpToMessage={(id) => {
            setLeadSheetOpen(false);
            setTimeout(() => irParaMensagem(id), 300);
          }}
        />
      )}

      {/* Envolver aqui tem ganho real, não só higiene: as consultas que alimentam este
          formulário estão presas ao diálogo (useClientes e usePedidosOptions, que puxam
          1.305 clientes e até 500 negócios). Com ele fora da árvore, nada disso dispara. */}
      {temTarefasSecao === true && (
      <Dialog open={novaTarefaOpen} onOpenChange={setNovaTarefaOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Título *</Label>
              <Input
                value={tarefaForm.titulo}
                onChange={(e) =>
                  setTarefaForm((f) => ({ ...f, titulo: e.target.value }))
                }
                placeholder="Ex: Follow-up com o cliente"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={tarefaForm.descricao}
                onChange={(e) =>
                  setTarefaForm((f) => ({ ...f, descricao: e.target.value }))
                }
                rows={3}
                placeholder="Detalhes da tarefa (opcional)"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={tarefaForm.status}
                  onValueChange={(v) =>
                    setTarefaForm((f) => ({ ...f, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_STAGES_TAREFAS.map((stage) => (
                      <SelectItem key={stage.key} value={stage.key}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo Final</Label>
                <Input
                  type="datetime-local"
                  value={tarefaForm.prazo_final}
                  onChange={(e) =>
                    setTarefaForm((f) => ({
                      ...f,
                      prazo_final: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <SearchableSelect
                  options={vendedores.map((v) => ({
                    value: v.nome,
                    label: v.nome,
                  }))}
                  value={tarefaForm.responsavel}
                  onValueChange={(v) =>
                    setTarefaForm((f) => ({ ...f, responsavel: v }))
                  }
                  placeholder="Selecione o responsável"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Projeto / Obra</Label>
                <ProjetoSelect
                  value={tarefaForm.projeto}
                  onChange={(v) => setTarefaForm((f) => ({ ...f, projeto: v }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Empresa (cliente)</Label>
                <SearchableSelect
                  options={clientesTarefas.map((c) => ({
                    value: c.id,
                    label: c.empresa,
                  }))}
                  value={tarefaForm.cliente_id}
                  onValueChange={(v) =>
                    setTarefaForm((f) => ({ ...f, cliente_id: v }))
                  }
                  placeholder="Vincular a uma empresa"
                  contentClassName="w-[min(28rem,90vw)]"
                  // Antes, as duas listas já estavam carregadas muito antes de o
                  // diálogo abrir — ao custo de buscá-las em toda entrada na
                  // inbox. Agora que só carregam ao abrir, "lista vazia" passou
                  // a ser o estado inicial garantido, e o texto padrão
                  // ("Nenhuma opção encontrada") faria a pessoa concluir que não
                  // há clientes cadastrados e salvar a tarefa sem vínculo.
                  emptyMessage={
                    carregandoClientes
                      ? "Carregando empresas..."
                      : "Nenhuma opção encontrada."
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Negócio</Label>
                <SearchableSelect
                  options={pedidosOptionsTarefas.map((p) => ({
                    value: p.id,
                    label: getNomeNegocio(p),
                  }))}
                  value={tarefaForm.pedido_id}
                  onValueChange={(v) =>
                    setTarefaForm((f) => ({ ...f, pedido_id: v }))
                  }
                  placeholder="Vincular a um negócio"
                  contentClassName="w-[min(28rem,90vw)]"
                  emptyMessage={
                    carregandoPedidos
                      ? "Carregando negócios..."
                      : "Nenhuma opção encontrada."
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <ParticipantesMultiSelect
                value={tarefaForm.participantes}
                onChange={(v) =>
                  setTarefaForm((f) => ({ ...f, participantes: v }))
                }
                usuarios={vendedores}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Marcadores</Label>
              <MarcadoresMultiSelect
                value={tarefaForm.marcadores}
                onChange={(v) =>
                  setTarefaForm((f) => ({ ...f, marcadores: v }))
                }
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setNovaTarefaOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarNovaTarefa}
              disabled={createTarefa.isPending}
            >
              {createTarefa.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      <Dialog open={novaNotaOpen} onOpenChange={setNovaNotaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar nota</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nota-texto">Nota interna</Label>
            <Textarea
              id="nota-texto"
              rows={4}
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Visível só pra equipe — não é enviada ao contato"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="nota-fixada"
              checked={notaFixada}
              onCheckedChange={(v) => setNotaFixada(v === true)}
            />
            <Label
              htmlFor="nota-fixada"
              className="text-sm font-normal cursor-pointer"
            >
              Fixar no início do chat
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaNotaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarNotaManual} disabled={addNota.isPending}>
              {addNota.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Adicionar nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={exportSelecionadasOpen}
        onOpenChange={setExportSelecionadasOpen}
      >
        <ConteudoDialogo className="sm:max-w-sm">
          <CabecalhoDialogo>
            <DialogTitle>
              Exportar {selecionadas.size}{" "}
              {selecionadas.size === 1
                ? "conversa selecionada"
                : "conversas selecionadas"}
            </DialogTitle>
            <DialogDescription>
              Escolha o período e o formato do arquivo. Cada conversa aparece com
              o nome do contato ou grupo no topo, para separar uma da outra.
            </DialogDescription>
          </CabecalhoDialogo>
          <CorpoDialogo>
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Período
                </Label>
                <DateRangePicker
                  value={exportSelecionadasRange}
                  onChange={setExportSelecionadasRange}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={!!exportandoSelecionadas}
                  onClick={() => handleExportarSelecionadas("pdf")}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {exportandoSelecionadas === "pdf" ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  ) : (
                    <FileDown className="h-6 w-6 text-muted-foreground" />
                  )}
                  PDF
                </button>
                <button
                  type="button"
                  disabled={!!exportandoSelecionadas}
                  onClick={() => handleExportarSelecionadas("xlsx")}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {exportandoSelecionadas === "xlsx" ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                  )}
                  Excel
                </button>
                <button
                  type="button"
                  disabled={!!exportandoSelecionadas}
                  onClick={() => handleExportarSelecionadas("md")}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-sm font-medium hover:bg-muted/80 hover:border-primary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {exportandoSelecionadas === "md" ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  ) : (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  )}
                  Markdown
                </button>
              </div>
              {progressoExportSelecionadas && (
                <p className="text-xs text-muted-foreground text-center">
                  Buscando mensagens: conversa{" "}
                  {progressoExportSelecionadas.atual} de{" "}
                  {progressoExportSelecionadas.total}…
                </p>
              )}
            </div>
          </CorpoDialogo>
        </ConteudoDialogo>
      </Dialog>
    </AppLayout>
  );
}

import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  MailOpen,
  Send,
  Inbox,
  Search,
  Loader2,
  RefreshCw,
  Settings,
  Archive,
  PenBox,
  Trash2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  CornerUpLeft,
} from "lucide-react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TOGGLE_LIST_CLASS,
  TOGGLE_TRIGGER_CLASS,
  TOGGLE_BADGE_CLASS,
  TOGGLE_BUTTON_CLASS,
  TOGGLE_BUTTON_ACTIVE,
  TOGGLE_BUTTON_INACTIVE,
} from "@/lib/toggle-group-styles";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams } from "react-router-dom";
import { useEmailEmpresa } from "@/hooks/use-email-empresa";
import { erroLegivelDaFunction } from "@/lib/erro-edge-function";
import { ConectarEmailCard } from "@/components/email/ConectarEmailCard";
import { LeitorEmail, type EmailAberto } from "@/components/email/LeitorEmail";
import { CompositorEmail } from "@/components/email/CompositorEmail";
import { ConfirmarEnviarEmailDialog } from "@/components/email/ConfirmarEnviarEmailDialog";
import {
  LOGO_EMAIL_URL,
  ehAssinaturaImagem,
  montarRodapeEmailHtml,
  normalizarAssinaturaAntiga,
} from "@/lib/assinatura-email";
import { GerenciarCaixaDialog } from "@/components/email/GerenciarCaixaDialog";
import {
  BarraPastas,
  PASTA_SPAM,
  PASTA_LIXEIRA,
  type PastaSelecionada,
} from "@/components/email/BarraPastas";
import { useEmailPastas, useContagemPorPasta } from "@/hooks/use-email-pastas";
import { MoverParaMarcadorDialog } from "@/components/email/MoverParaMarcadorDialog";

/** Uma linha da caixa de entrada, no formato que a listagem devolve. */
interface MensagemRecebida {
  id: string;
  lido: boolean;
  criado_em: string | null;
  data_recebimento: string | null;
  snippet: string;
  /** Endereço da caixa que recebeu, quando ela já foi desconectada. */
  caixaOrigem: string | null;
  gmail_message_id: string | null;
  /** Id da conversa no provedor — liga esta mensagem às respostas enviadas na mesma conversa. */
  threadId: string | null;
  remetente: string;
  destinatarios: string[];
  assunto: string | null;
}

interface PaginaRecebidos {
  emails: MensagemRecebida[];
  count: number;
}

/** Largura das colunas de data e ações — mesma nos 3 cabeçalhos e nas 3 linhas, para alinhar. */
const LARGURA_COL_DATA = "w-24 shrink-0 whitespace-nowrap";
const LARGURA_COL_ACOES = "w-20 shrink-0";

/**
 * Cabeçalho de colunas acima de cada listagem — repete a MESMA grade da
 * linha (largura do checkbox, do avatar, do bloco de conteúdo em duas linhas,
 * da coluna de data e da coluna de ações) trocando o dado por um rótulo, para
 * remetente/assunto/data/ações pararem de parecer um bloco só de texto.
 * `sticky` dentro do próprio contêiner com rolagem da lista.
 */
const CabecalhoLista = ({
  rotuloPrincipal,
  rotuloData,
  rotuloAssunto,
  checkbox,
}: {
  rotuloPrincipal: string;
  rotuloData: string;
  rotuloAssunto: string;
  /** Omitido nas telas sem seleção em massa (ex.: Rascunhos). */
  checkbox?: { checked: boolean; onChange: () => void };
}) => (
  <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2">
    {/* bg SÓLIDO — de propósito. Um fundo translúcido aqui (bg-muted/5, como o
        rodapé usa) deixa as linhas que rolam por baixo aparecendo através do
        cabeçalho fixo, já que ele fica sobreposto ao conteúdo. O rodapé não
        tem esse problema por não ficar em cima de nada. bg-background é a cor
        de fundo de toda a lista, então o resultado visual é o mesmo tom do
        rodapé — só que sem deixar nada vazar. */}
    {checkbox && (
      <Checkbox
        className="shrink-0"
        checked={checkbox.checked}
        onCheckedChange={checkbox.onChange}
        aria-label="Selecionar todos"
      />
    )}
    <div className="h-9 w-9 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotuloPrincipal}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotuloAssunto}
      </p>
    </div>
    <div
      className={cn(
        LARGURA_COL_DATA,
        "text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
      )}
    >
      {rotuloData}
    </div>
    <div
      className={cn(
        LARGURA_COL_ACOES,
        "text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
      )}
    >
      Ações
    </div>
  </div>
);

const Emails = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  // A busca só vira consulta depois que a digitação para. Enquanto o termo
  // cru estava na queryKey, cada tecla disparava uma ida ao servidor —
  // "orcamento" custava dez requisições, e a resposta de cada letra podia
  // chegar fora de ordem.
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailAberto | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [emailParaConfirmar, setEmailParaConfirmar] = useState<string | null>(
    null,
  );
  const [gerenciarCaixaAberto, setGerenciarCaixaAberto] = useState(false);
  // Marcador escolhido na barra lateral. null = a aba manda sozinha.
  const [pastaSelecionada, setPastaSelecionada] =
    useState<PastaSelecionada>(null);
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<{
    id: string;
    type: "sent" | "received";
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Ids das mensagens em processo de "mover para marcador" — vazio = fechado. */
  const [mensagensParaMover, setMensagensParaMover] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("received");
  /** `nylas_message_id` da mensagem sendo respondida; nulo num e-mail novo. */
  const [respondendoA, setRespondendoA] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [pageSent, setPageSent] = useState(0);
  const [pageReceived, setPageReceived] = useState(0);
  const PAGE_SIZE = 50;
  // Nylas no lugar do Gmail direto: o contrato do hook é o mesmo
  // (isConnected/connectedEmail/sendEmail), então a troca é de import. A
  // diferença de modelo é que a caixa agora é da EMPRESA, compartilhada pelo
  // time, e não uma conta por usuário.
  const {
    isConnected,
    connectedEmail,
    enviarEmail: sendEmail,
    sincronizar,
    sincronizarAsync,
    isSyncing,
    carregarCorpo,
    podeGerenciarCaixa,
    conta,
  } = useEmailEmpresa();
  const { data: pastas = [], isLoading: pastasCarregando } = useEmailPastas(
    conta?.id,
  );
  const { data: contagens = new Map() } = useContagemPorPasta(conta?.id);

  /**
   * Espelha os marcadores sozinho quando eles ainda não existem.
   *
   * A lista de pastas só é gravada em dois momentos: ao CONECTAR a caixa
   * (email-callback) e a cada VARREDURA (email-sync). Uma caixa conectada antes
   * de o espelhamento existir — como a `atendimento@`, ligada em 04/08 — nunca
   * passou por nenhum dos dois, e a barra de marcadores ficava permanentemente
   * vazia. E não havia como sair desse estado sem alguém apertar o ícone de
   * atualizar, que ninguém aperta: em toda a janela de log não houve UMA chamada
   * ao email-sync. As mensagens já carregavam 10 marcadores; faltavam só os
   * nomes.
   *
   * Deixar uma funcionalidade dependendo de um clique que ninguém dá é o mesmo
   * que não entregá-la. Então a tela se conserta: se está conectada e não há
   * marcador nenhum, dispara uma varredura silenciosa.
   *
   * Também renova quando o espelho está VELHO, e não só quando está vazio: um
   * marcador criado no Gmail hoje não apareceria nunca se a condição fosse
   * apenas "está vazio", porque depois do primeiro espelhamento a lista deixa de
   * ser vazia para sempre. Um dia é folgado — quem cria uma pasta não espera
   * vê-la no CRM no mesmo minuto — e mantém isto longe de virar tráfego.
   *
   * Uma vez por sessão (`useRef`), e não a cada render: se a caixa realmente não
   * tiver marcador nenhum no provedor, `pastas` continua vazio e isto viraria um
   * laço de chamadas à API do Nylas a cada atualização da tela.
   */
  const espelhouPastasRef = useRef(false);
  useEffect(() => {
    if (!isConnected || !conta?.id || pastasCarregando) return;
    if (espelhouPastasRef.current) return;

    const UM_DIA = 24 * 60 * 60 * 1000;
    const maisRecente = pastas.reduce<number>((maior, p) => {
      const t = p.atualizadoEm ? new Date(p.atualizadoEm).getTime() : 0;
      return t > maior ? t : maior;
    }, 0);
    const precisaEspelhar =
      pastas.length === 0 || Date.now() - maisRecente > UM_DIA;
    if (!precisaEspelhar) return;

    espelhouPastasRef.current = true;
    void sincronizar({ limit: 50, silencioso: true });
  }, [isConnected, conta?.id, pastasCarregando, pastas, sincronizar]);

  const [formData, setFormData] = useState({
    destinatario: "",
    assunto: "",
    corpo: "",
  });
  /** Id do rascunho em `email_rascunhos` sendo editado; nulo enquanto o autosave ainda não gravou a primeira vez. */
  const [rascunhoId, setRascunhoId] = useState<string | null>(null);

  const { data: perfil } = useQuery({
    queryKey: ["meu_perfil"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("usuarios")
        .select("id, nome, assinatura_email, empresa_id")
        .eq("user_id", user.id)
        .single();
      return data;
    },
  });

  /**
   * Rascunhos do usuário logado, mais recente primeiro. Alimenta a aba
   * "Rascunhos" (item 3.5) e a recuperação automática ao clicar em
   * "Escrever" num compositor em branco (item 3.4) — os dois usam a MESMA
   * lista para não haver dois lugares de verdade sobre o que existe salvo.
   */
  const { data: rascunhos } = useQuery({
    queryKey: ["email_rascunhos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_rascunhos")
        .select("id, destinatario, assunto, corpo, atualizado_em")
        .order("atualizado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!perfil?.id,
  });

  useEffect(() => {
    const to = searchParams.get("to");
    if (to) {
      setFormData((prev) => ({ ...prev, destinatario: to }));
      // Contexto novo (endereço veio de fora, não de um rascunho salvo): não
      // continuar amarrado a um rascunho de uma composição anterior.
      setRascunhoId(null);
      setIsComposeOpen(true);
    }
  }, [searchParams]);

  const salvarRascunhoMutation = useMutation({
    mutationFn: async (dados: {
      id: string | null;
      destinatario: string;
      assunto: string;
      corpo: string;
    }) => {
      if (!perfil?.id || !perfil?.empresa_id) return null;
      if (dados.id) {
        const { error } = await supabase
          .from("email_rascunhos")
          .update({
            destinatario: dados.destinatario,
            assunto: dados.assunto,
            corpo: dados.corpo,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", dados.id);
        if (error) throw error;
        return dados.id;
      }
      const { data, error } = await supabase
        .from("email_rascunhos")
        .insert({
          destinatario: dados.destinatario,
          assunto: dados.assunto,
          corpo: dados.corpo,
          empresa_id: perfil.empresa_id,
          usuario_id: perfil.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data?.id as string) ?? null;
    },
    onSuccess: (id) => {
      if (id) setRascunhoId(id);
      queryClient.invalidateQueries({ queryKey: ["email_rascunhos"] });
    },
    onError: (error: any) => {
      // Autosave é melhor-esforço: falhar aqui não pode interromper a
      // digitação nem exigir que a pessoa perceba e tente de novo.
      console.warn("[email] não consegui salvar o rascunho:", error?.message);
    },
  });

  const descartarRascunhoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_rascunhos")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_rascunhos"] });
    },
  });

  /**
   * Autosave da composição: 2s depois da última tecla, grava (insere na
   * primeira vez, atualiza depois) em `email_rascunhos`. Roda para QUALQUER
   * composição aberta — nova mensagem ou resposta — porque um rascunho de
   * resposta perdido dói tanto quanto um de mensagem nova.
   *
   * `rascunhoId` de propósito FORA das deps: ele muda quando o autosave
   * anterior termina (via `onSuccess`), sem o conteúdo do formulário ter
   * mudado — reagir a essa mudança reagendaria um autosave vazio a cada
   * gravação bem-sucedida. A próxima tecla já dispara o efeito de novo e lê o
   * `rascunhoId` atual do escopo, então não fica desatualizado.
   */
  useEffect(() => {
    if (!isComposeOpen) return;
    if (!perfil?.id || !perfil?.empresa_id) return;
    const { destinatario, assunto, corpo } = formData;
    if (!destinatario && !assunto && !corpo) return;

    const timer = setTimeout(() => {
      salvarRascunhoMutation.mutate({
        id: rascunhoId,
        destinatario,
        assunto,
        corpo,
      });
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isComposeOpen, perfil?.id, perfil?.empresa_id]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(searchTerm.trim());
      // Voltar à primeira página: um termo novo tem outra contagem de
      // resultados, e continuar na página 3 mostraria uma lista vazia.
      //
      // AS DUAS abas. Antes só `pageSent` era zerada, o que não incomodava
      // porque a busca nem chegava a Recebidos; agora que chega, estando na
      // página 3 e digitando um termo com 5 resultados a lista vem vazia — e o
      // paginador some junto, então não sobra nem o botão de voltar.
      setPageSent(0);
      setPageReceived(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const queryClient = useQueryClient();

  // Retorno do OAuth: o email-callback devolve o navegador para cá com
  // ?conexao=ok|erro|cancelada. Sem isto o usuário voltaria de uma falha sem
  // nenhuma explicação — só veria a tela de conectar de novo.
  useEffect(() => {
    const conexao = searchParams.get("conexao");
    if (!conexao) return;

    if (conexao === "ok") {
      toast.success("Caixa de e-mail conectada.");
      queryClient.invalidateQueries({ queryKey: ["email_conta"] });
    } else if (conexao === "cancelada") {
      toast.info("Conexão cancelada.");
    } else {
      const MOTIVOS: Record<string, string> = {
        state_invalido:
          "O link de conexão não é mais válido. Tente conectar de novo.",
        state_expirado: "A conexão demorou demais. Tente de novo.",
        troca_falhou: "O provedor recusou a autorização. Tente de novo.",
        caixa_em_uso: "Esta caixa já está conectada a outra empresa.",
        gravacao_falhou: "Não foi possível salvar a conexão. Tente de novo.",
        retorno_incompleto: "O provedor devolveu uma resposta incompleta.",
      };
      toast.error(
        MOTIVOS[searchParams.get("motivo") ?? ""] ??
          "Não foi possível conectar a caixa.",
      );
    }

    // Limpa a query para o aviso não reaparecer a cada re-render ou refresh.
    const limpa = new URL(window.location.href);
    limpa.searchParams.delete("conexao");
    limpa.searchParams.delete("motivo");
    window.history.replaceState({}, "", limpa.toString());
  }, [searchParams, queryClient]);

  const { data: sentData, isLoading: isSentLoading } = useQuery({
    queryKey: ["emails", buscaAplicada, pageSent],
    queryFn: async () => {
      // Sem filtro por user_id: a caixa é da EMPRESA e o time inteiro
      // compartilha. Quem limita as linhas é o RLS de email_mensagens, por
      // empresa_id — filtrar por usuário aqui esconderia do time o que um
      // colega enviou pela mesma caixa.
      //
      // `corpo_html` NÃO entra aqui: a lista só mostra remetente, assunto e
      // prévia, e trazer o corpo de 15 mensagens fazia a página pesar 79 kB em
      // vez de 5,7 kB — com apenas 3 das 15 tendo corpo em cache. Conforme o
      // time fosse abrindo mensagens, cada uma engordaria a listagem para
      // sempre. O corpo é buscado ao abrir, por `carregarCorpo`.
      let query = supabase
        .from("email_mensagens")
        .select(
          "id, assunto, snippet, destinatarios, remetente_email, envio_status, data_mensagem, caixa_origem, nylas_thread_id, nylas_message_id",
          { count: "exact" },
        )
        .eq("direcao", "enviado")
        .eq("excluido", false)
        .order("data_mensagem", { ascending: false })
        .range(pageSent * PAGE_SIZE, (pageSent + 1) * PAGE_SIZE - 1);

      if (buscaAplicada) {
        query = query.or(
          `assunto.ilike.%${buscaAplicada}%,snippet.ilike.%${buscaAplicada}%`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Remapeia para o formato que o JSX já consome, para a troca de origem
      // não obrigar a reescrever a renderização inteira.
      const emails = (data ?? []).map((m) => {
        const dest = Array.isArray(m.destinatarios) ? m.destinatarios : [];
        return {
          id: m.id,
          destinatario: dest
            .map((d: { email?: string }) => d?.email)
            .filter(Boolean)
            .join(", "),
          remetente: m.remetente_email,
          assunto: m.assunto,
          corpo: m.snippet ?? "",
          html: "",
          status: m.envio_status ?? "enviado",
          caixaOrigem: m.caixa_origem ?? null,
          created_at: m.data_mensagem,
          updated_at: m.data_mensagem,
          threadId: m.nylas_thread_id ?? null,
          gmail_message_id: m.nylas_message_id,
        };
      });

      return { emails, count: count || 0 };
    },
    placeholderData: keepPreviousData,
  });

  const emails = sentData?.emails || [];
  const totalSent = sentData?.count || 0;

  const {
    data: receivedData,
    isLoading: isReceivedLoading,
    isFetching: isReceivedFetching,
  } = useQuery({
    queryKey: [
      "received_emails",
      pageReceived,
      pastaSelecionada,
      buscaAplicada,
      somenteNaoLidas,
    ],
    queryFn: async () => {
      // Mesma regra da caixa de enviados: nada de `corpo_html` na listagem.
      let consulta = supabase
        .from("email_mensagens")
        .select(
          "id, lido, data_mensagem, snippet, nylas_message_id, nylas_thread_id, remetente_nome, remetente_email, destinatarios, assunto, caixa_origem",
          { count: "exact" },
        )
        .eq("direcao", "recebido")
        .eq("excluido", false);

      // O marcador escolhido na barra lateral. `pastas` é TEXT[] com os ids do
      // provedor, que o sync já grava em cada mensagem — `contains` vira o
      // operador `@>` do Postgres, que usa índice se um dia houver um GIN aqui.
      if (pastaSelecionada) {
        consulta = consulta.contains("pastas", [pastaSelecionada]);
      } else {
        /**
         * Sem pasta escolhida, "Recebidos" é a CAIXA DE ENTRADA — e lixo não
         * entra nela.
         *
         * `direcao` é decidida só pelo remetente (ver mensagemParaLinha), sem
         * olhar em que pasta a mensagem está. Então spam e lixeira caíam aqui
         * como qualquer outra: hoje mesmo há 2 mensagens da lixeira contadas
         * nos 337 e aparecendo na lista. Com spam passando a ser sincronizado,
         * isso deixaria de ser duas linhas e viraria volume.
         *
         * Elas continuam alcançáveis — pelos itens Spam e Lixeira da barra.
         */
        consulta = consulta
          .not("pastas", "cs", `{${PASTA_SPAM}}`)
          .not("pastas", "cs", `{${PASTA_LIXEIRA}}`);
      }

      if (somenteNaoLidas) consulta = consulta.eq("lido", false);

      // A busca do topo é UMA só para a tela inteira, mas só a aba Enviados a
      // aplicava: procurar em Recebidos devolvia a caixa inteira, como se nada
      // tivesse sido digitado. Em Recebidos entram também remetente_nome/
      // remetente_email — sem eles, digitar o e-mail de quem mandou (o caso
      // mais comum de "procurar um e-mail") não encontrava nada, porque esse
      // texto não aparece nem no assunto nem na prévia.
      if (buscaAplicada) {
        consulta = consulta.or(
          `assunto.ilike.%${buscaAplicada}%,snippet.ilike.%${buscaAplicada}%,` +
            `remetente_nome.ilike.%${buscaAplicada}%,remetente_email.ilike.%${buscaAplicada}%`,
        );
      }

      const { data, error, count } = await consulta
        .order("data_mensagem", { ascending: false })
        .range(pageReceived * PAGE_SIZE, (pageReceived + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error("Erro ao buscar e-mails recebidos:", error);
        throw error;
      }

      const emails = (data ?? []).map((m) => ({
        id: m.id,
        lido: m.lido,
        criado_em: m.data_mensagem,
        data_recebimento: m.data_mensagem,
        // A listagem do Nylas devolve snippet, não body — e é o snippet que a
        // linha mostra como prévia. O corpo inteiro só é buscado ao abrir.
        snippet: m.snippet ?? "",
        // Preenchido quando a caixa de origem foi desconectada preservando o
        // histórico. Enquanto a conta existe fica nulo, e o endereço vem de
        // email_contas.
        caixaOrigem: m.caixa_origem ?? null,
        gmail_message_id: m.nylas_message_id,
        threadId: m.nylas_thread_id ?? null,
        remetente: m.remetente_nome
          ? `${m.remetente_nome} <${m.remetente_email ?? ""}>`
          : (m.remetente_email ?? ""),
        destinatarios: Array.isArray(m.destinatarios)
          ? m.destinatarios
              .map((d: { email?: string }) => d?.email)
              .filter(Boolean)
          : [],
        assunto: m.assunto,
      }));

      return { emails, count: count || 0 };
    },
    placeholderData: keepPreviousData,
  });

  const receivedEmails = receivedData?.emails || [];
  const totalReceived = receivedData?.count || 0;

  /**
   * Ids de conversa (`nylas_thread_id`) que já têm alguma mensagem ENVIADA —
   * usado só para desenhar o indicador "você respondeu" na lista de
   * Recebidos. Não existe coluna pronta pra isso (ver `enviarEmail` em
   * use-email-empresa.ts: a resposta grava o mesmo `thread_id` da conversa
   * original, mas nada marca a mensagem original como respondida), então a
   * lista de threads respondidas é montada aqui.
   *
   * Consulta enxuta de propósito — só a coluna do id, só linhas enviadas — e
   * não paginada: hoje a caixa tem ~180 mensagens enviadas, então o Set cabe
   * inteiro na memória sem drama. Se o volume crescer muito, isso pede uma
   * função no banco em vez de trazer os ids todos pro cliente.
   */
  const { data: threadsRespondidos } = useQuery({
    queryKey: ["threads_respondidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_mensagens")
        .select("nylas_thread_id")
        .eq("direcao", "enviado")
        .eq("excluido", false)
        .not("nylas_thread_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.nylas_thread_id as string));
    },
    enabled: isConnected,
  });

  /**
   * Quantas mensagens a aba Recebidos tem IGNORANDO o marcador — o número que
   * fica ao lado de "Todas" na barra lateral.
   *
   * Precisa ser uma consulta própria porque `totalReceived` vem do mesmo
   * `select` que já aplicou o `contains`: com um marcador escolhido, os dois
   * números seriam idênticos e "Todas" mostraria a contagem do marcador, como
   * se a caixa inteira tivesse encolhido.
   *
   * `head: true` — só o cabeçalho com a contagem, nenhuma linha trafega. E só
   * roda quando há marcador escolhido; sem ele, `totalReceived` já é a resposta.
   */
  const { data: totalRecebidosSemMarcador } = useQuery({
    queryKey: ["received_emails_total", buscaAplicada, somenteNaoLidas],
    queryFn: async () => {
      let consulta = supabase
        .from("email_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("direcao", "recebido")
        .eq("excluido", false)
        // Os MESMOS cortes da listagem sem marcador. Se "Todas" contasse spam e
        // lixeira, o badge prometeria mensagens que a lista, por regra, esconde.
        .not("pastas", "cs", `{${PASTA_SPAM}}`)
        .not("pastas", "cs", `{${PASTA_LIXEIRA}}`);

      if (somenteNaoLidas) consulta = consulta.eq("lido", false);

      // Mesmos campos da listagem (ver o comentário lá): sem remetente aqui, o
      // badge de "Todas" contaria diferente do que a lista realmente mostra
      // para o mesmo termo.
      if (buscaAplicada) {
        consulta = consulta.or(
          `assunto.ilike.%${buscaAplicada}%,snippet.ilike.%${buscaAplicada}%,` +
            `remetente_nome.ilike.%${buscaAplicada}%,remetente_email.ilike.%${buscaAplicada}%`,
        );
      }

      const { count } = await consulta;
      return count ?? 0;
    },
    enabled: isConnected && !!pastaSelecionada,
    placeholderData: keepPreviousData,
  });

  /**
   * Marcador aberto e vazio → busca aquele marcador na hora.
   *
   * A varredura completa cobre a caixa inteira, mas leva o tempo que leva: numa
   * caixa com dezenas de marcadores, o que a pessoa acabou de clicar pode ser o
   * último da fila. Clicar num marcador e ver "nada aqui" quando o Gmail mostra
   * mensagens é a diferença entre a funcionalidade parecer quebrada e parecer
   * lenta.
   *
   * Só dispara sem busca e sem o filtro de não lidas: com um deles ativo, lista
   * vazia é resposta legítima ("não achei nada"), não falta de sincronização.
   *
   * Uma tentativa por marcador por sessão (`Set` no ref). Marcador realmente
   * vazio no provedor continua vazio depois da varredura, e sem essa trava a
   * tela ficaria pedindo a mesma busca a cada refetch.
   */
  const marcadoresBuscadosRef = useRef(new Set<string>());
  const [marcadorEmBusca, setMarcadorEmBusca] = useState<string | null>(null);

  /** Nome do marcador aberto, para as mensagens de tela falarem dele pelo nome. */
  const nomeDaPastaSelecionada =
    pastaSelecionada === PASTA_SPAM
      ? "Spam"
      : pastaSelecionada === PASTA_LIXEIRA
        ? "Lixeira"
        : (pastas.find((p) => p.pastaId === pastaSelecionada)?.nome ??
          "este marcador");

  useEffect(() => {
    if (!isConnected || !pastaSelecionada) return;
    if (activeTab !== "received") return;
    if (isReceivedLoading || buscaAplicada || somenteNaoLidas) return;
    if (totalReceived > 0) return;
    if (marcadoresBuscadosRef.current.has(pastaSelecionada)) return;

    marcadoresBuscadosRef.current.add(pastaSelecionada);
    const alvo = pastaSelecionada;
    setMarcadorEmBusca(alvo);
    void sincronizarAsync({
      limit: 100,
      backfill: true,
      silencioso: true,
      pastas: [alvo],
    })
      .catch(() => {
        // Falhou: solta a trava para uma segunda tentativa valer a pena, já que
        // a primeira não chegou a responder se o marcador tem ou não mensagem.
        marcadoresBuscadosRef.current.delete(alvo);
      })
      .finally(() =>
        setMarcadorEmBusca((atual) => (atual === alvo ? null : atual)),
      );
  }, [
    isConnected,
    pastaSelecionada,
    activeTab,
    isReceivedLoading,
    buscaAplicada,
    somenteNaoLidas,
    totalReceived,
    sincronizarAsync,
  ]);

  const sendEmailMutation = useMutation({
    mutationFn: async (data: {
      destinatario: string;
      assunto: string;
      corpo: string;
    }) => {
      if (!isConnected) {
        throw new Error(
          "Conecte a caixa de e-mail da empresa para enviar mensagens.",
        );
      }

      // `assinatura_email` já sanitizada em Configurações antes de ser salva —
      // normaliza aqui é só pra converter formato ANTIGO (texto puro com
      // `\n`, de antes do editor de formatação existir). `montarRodapeEmailHtml`
      // sanitiza de novo por conta própria, então dado antigo/legado também
      // não passa cru.
      const assinaturaNormalizada = normalizarAssinaturaAntiga(perfil?.assinatura_email);

      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 16px; color: #333; line-height: 1.5;">
          ${data.corpo.replace(/\n/g, "<br>")}
        </div>
        ${montarRodapeEmailHtml({
          nome: perfil?.nome ?? "",
          assinaturaHtml: assinaturaNormalizada,
          logoUrl: `${LOGO_EMAIL_URL}?t=${Date.now()}`,
          // Assinatura em modo imagem já é autossuficiente — mostrar a logo
          // da empresa em cima dela seria redundante/poluído.
          mostrarLogo: !ehAssinaturaImagem(assinaturaNormalizada),
        })}
      `;

      // O registro em email_mensagens é feito pela Edge Function, que é quem
      // conhece o id devolvido pelo Nylas. Gravar também daqui criaria duas
      // linhas para o mesmo envio — e o cliente nem tem INSERT nessa tabela.
      return await sendEmail(
        data.destinatario,
        data.assunto,
        htmlBody,
        respondendoA,
      );
    },
    onSuccess: () => {
      toast.success("E-mail enviado.");
      setIsComposeOpen(false);
      setRespondendo(false);
      setRespondendoA(null);
      setFormData({
        destinatario: "",
        assunto: "",
        corpo: "",
      });
      // Enviado com sucesso: o rascunho que o alimentava não serve mais.
      if (rascunhoId) {
        descartarRascunhoMutation.mutate(rascunhoId);
        setRascunhoId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      // Se foi resposta a uma conversa recebida, o indicador "você respondeu"
      // daquela linha em Recebidos precisa acompanhar sem esperar um refresh.
      if (respondendoA) {
        queryClient.invalidateQueries({ queryKey: ["threads_respondidos"] });
      }
    },
    onError: (error: any) => {
      toast.error(
        "Erro ao enviar e-mail: " +
          (error.message || "Verifique sua conexão com o Gmail"),
      );
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async ({ id }: { id: string; type: "sent" | "received" }) => {
      // Exclusão lógica nos dois casos. Apagar de verdade faria o webhook e o
      // sync trazerem a mensagem de volta na próxima entrega — e o cliente nem
      // tem DELETE em email_mensagens (só UPDATE de lido/favorito/excluido).
      const { error } = await supabase
        .from("email_mensagens")
        .update({ excluido: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success("E-mail excluído com sucesso");
      queryClient.invalidateQueries({
        queryKey: [variables.type === "sent" ? "emails" : "received_emails"],
      });
      // Chave própria, e o react-query casa por PREFIXO EXATO de elemento:
      // invalidar ["received_emails"] não atinge ["received_emails_total"].
      // Sem esta linha o número ao lado de "Todas" continuaria contando as
      // mensagens que acabaram de ser excluídas.
      queryClient.invalidateQueries({ queryKey: ["received_emails_total"] });
      if (selectedEmail?.id === variables.id) {
        setSelectedEmail(null);
      }
    },
    onError: (error: any) => {
      toast.error(
        "Erro ao excluir e-mail: " + (error.message || "Erro desconhecido"),
      );
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({
      ids,
    }: {
      ids: string[];
      type: "sent" | "received";
    }) => {
      const { error } = await supabase
        .from("email_mensagens")
        .update({ excluido: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(
        `${variables.ids.length} e-mail(s) excluído(s) com sucesso`,
      );
      queryClient.invalidateQueries({
        queryKey: [variables.type === "sent" ? "emails" : "received_emails"],
      });
      // Chave própria, e o react-query casa por PREFIXO EXATO de elemento:
      // invalidar ["received_emails"] não atinge ["received_emails_total"].
      // Sem esta linha o número ao lado de "Todas" continuaria contando as
      // mensagens que acabaram de ser excluídas.
      queryClient.invalidateQueries({ queryKey: ["received_emails_total"] });
      setSelectedIds([]);
      setIsBulkDeleting(false);
    },
    onError: (error: any) => {
      toast.error(
        "Erro ao excluir e-mails: " + (error.message || "Erro desconhecido"),
      );
      setIsBulkDeleting(false);
    },
  });

  const bulkUpdateReadStatusMutation = useMutation({
    // Pela Edge Function, e não por UPDATE direto, pelo MESMO motivo do clique
    // individual: o "lido" precisa chegar ao provedor. Enquanto este caminho
    // gravava só aqui, marcar 15 mensagens em massa durava até a varredura
    // seguinte trazer o `unread` do Gmail por cima — e elas voltavam a aparecer
    // como novas. Metade da funcionalidade é pior do que nenhuma, porque parece
    // que funcionou.
    mutationFn: async ({ ids, lido }: { ids: string[]; lido: boolean }) => {
      const { data, error } = await supabase.functions.invoke(
        "email-marcar-lido",
        {
          body: { mensagem_ids: ids, lido },
        },
      );
      if (error)
        throw await erroLegivelDaFunction(error, "Não foi possível atualizar");
      return data as { alteradas: number; falhas: number };
    },
    onSuccess: (r) => {
      // A gravação daqui sempre valeu; `falhas` é só o espelho no provedor.
      if (r?.falhas) {
        toast.warning(
          "Marcado aqui, mas o provedor não confirmou todas. A próxima sincronização acerta.",
        );
      } else {
        toast.success("E-mails atualizados com sucesso");
      }
      queryClient.invalidateQueries({ queryKey: ["received_emails"] });
      queryClient.invalidateQueries({ queryKey: ["received_emails_total"] });
      queryClient.invalidateQueries({ queryKey: ["email_contagem_por_pasta"] });
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error(
        "Erro ao atualizar e-mails: " + (error.message || "Erro desconhecido"),
      );
    },
  });

  const toggleSelectAll = () => {
    const currentEmails = activeTab === "received" ? receivedEmails : emails;
    if (!currentEmails) return;

    if (selectedIds.length === currentEmails.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(currentEmails.map((e: any) => e.id));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.destinatario || !formData.assunto || !formData.corpo) {
      toast.error("Preencha todos os campos");
      return;
    }
    sendEmailMutation.mutate(formData);
  };

  /** "Fulano <fulano@x.com>" -> "fulano@x.com". */
  const soEndereco = (valor?: string | null) => {
    const bruto = (valor ?? "").trim();
    const m = bruto.match(/<([^>]+)>/);
    return (m ? m[1] : bruto).trim();
  };

  /** Iniciais para o avatar circular da linha: "Fulano de Tal <f@x.com>" -> "FT". */
  const iniciaisDe = (valor?: string | null) => {
    const semEmail = (valor ?? "").replace(/<[^>]*>/g, "").trim();
    if (!semEmail) return "?";
    const partes = semEmail.split(/\s+/).filter(Boolean);
    const iniciais = partes
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
    return iniciais || semEmail[0]?.toUpperCase() || "?";
  };

  /**
   * Só para EXIBIÇÃO na lista: "Fulano de Tal <fulano@x.com>" -> "Fulano de Tal".
   * O endereço entre "<...>" não ajuda a reconhecer o remetente numa linha já
   * compacta — quem precisa dele abre a mensagem. Não usar em `soEndereco`,
   * que depende do "<...>" para responder à pessoa certa.
   */
  const soNome = (valor?: string | null) => {
    const bruto = (valor ?? "").trim();
    const semEmail = bruto.replace(/\s*<[^>]*>\s*/, "").trim();
    return semEmail || bruto;
  };

  /** Corta em `max` caracteres e acrescenta " ..." — dá previsibilidade à largura da coluna. */
  const truncarTexto = (texto: string | null | undefined, max: number) => {
    const valor = (texto ?? "").trim();
    return valor.length > max ? `${valor.slice(0, max).trimEnd()} ...` : valor;
  };
  const LIMITE_ASSUNTO = 40;
  const LIMITE_PREVIA = 130;

  /** Monta a resposta a partir da mensagem aberta e abre o compositor. */
  const responderMensagem = () => {
    if (!selectedEmail) return;
    const assunto = selectedEmail.assunto ?? "";
    const replySubject = assunto.toLowerCase().startsWith("re:")
      ? assunto
      : `Re: ${assunto}`;
    const quando = selectedEmail.created_at || selectedEmail.criado_em;
    const citado = selectedEmail.snippet || selectedEmail.corpo || "";

    setFormData({
      ...formData,
      // Só o endereço: o campo trazia "Nome <e-mail>" inteiro, que é o que o
      // leitor exibe, não o que o provedor aceita como destinatário.
      destinatario: soEndereco(
        selectedEmail.remetente || selectedEmail.destinatario,
      ),
      assunto: replySubject,
      corpo: `\n\n--- Em ${quando ? format(new Date(quando), "dd/MM/yyyy HH:mm") : ""}, ${selectedEmail.remetente} escreveu:\n\n${citado}`,
    });
    // Guarda a QUAL mensagem se está respondendo, no id do provedor. É o que o
    // Nylas usa para montar In-Reply-To/References; sem isso a resposta sai
    // solta, o destinatário a recebe fora da conversa e — aqui dentro — quem
    // tem acesso por marcador não enxerga a própria resposta, porque a regra a
    // reconhece justamente por pertencer à conversa de origem.
    setRespondendoA(selectedEmail.gmail_message_id ?? null);
    // Contexto novo: uma resposta não continua o rascunho de outra
    // composição — o autosave (abaixo) cria uma linha própria para ela.
    setRascunhoId(null);
    // O e-mail aberto CONTINUA aberto atrás do compositor. Fechá-lo aqui era o
    // que jogava a pessoa de volta para a caixa de entrada no meio da resposta.
    setRespondendo(true);
    setIsComposeOpen(true);
  };

  /**
   * Abre o compositor em branco já com "Para" preenchido — usada ao clicar
   * num endereço dentro do e-mail aberto (cabeçalho ou corpo), depois de
   * confirmado no `ConfirmarEnviarEmailDialog`. Ao contrário de
   * `responderMensagem`, não cita nada nem amarra a uma conversa: é uma
   * mensagem nova para aquele endereço, não uma resposta.
   */
  const enviarPara = (endereco: string) => {
    setFormData({ destinatario: endereco, assunto: "", corpo: "" });
    setRespondendoA(null);
    setRespondendo(false);
    setRascunhoId(null);
    setIsComposeOpen(true);
  };

  /**
   * Abre o compositor em branco a partir do botão "Escrever". Se houver um
   * rascunho recente do usuário, recupera-o em vez de começar do zero (item
   * 3.4) — só aqui, e não em `responderMensagem`/`enviarPara`, porque nesses
   * dois o preenchimento automático (citação, destinatário) já é a intenção
   * da pessoa, e sobrepor com um rascunho antigo apagaria isso sem aviso.
   */
  const escreverNovo = () => {
    const maisRecente = rascunhos?.[0];
    const temConteudo =
      maisRecente &&
      (maisRecente.destinatario || maisRecente.assunto || maisRecente.corpo);

    if (temConteudo) {
      setFormData({
        destinatario: maisRecente.destinatario ?? "",
        assunto: maisRecente.assunto ?? "",
        corpo: maisRecente.corpo ?? "",
      });
      setRascunhoId(maisRecente.id);
      toast.info("Rascunho recuperado.");
    } else {
      setFormData({ destinatario: "", assunto: "", corpo: "" });
      setRascunhoId(null);
    }
    setRespondendoA(null);
    setRespondendo(false);
    setIsComposeOpen(true);
  };

  /** Abre um rascunho específico da aba "Rascunhos" para continuar editando. */
  const continuarRascunho = (r: {
    id: string;
    destinatario: string | null;
    assunto: string | null;
    corpo: string | null;
  }) => {
    setFormData({
      destinatario: r.destinatario ?? "",
      assunto: r.assunto ?? "",
      corpo: r.corpo ?? "",
    });
    setRascunhoId(r.id);
    setRespondendoA(null);
    setRespondendo(false);
    setIsComposeOpen(true);
  };

  /** Descarta um rascunho a partir da lista, sem precisar abrir o compositor. */
  const descartarRascunhoDaLista = (id: string) => {
    descartarRascunhoMutation.mutate(id);
    if (rascunhoId === id) setRascunhoId(null);
  };

  /** Marca como lida sem segurar a abertura da mensagem. */
  const marcarLido = (id: string) => {
    // Escreve direto na lista que já está na tela, em vez de invalidar a
    // consulta: trocar um booleano não justifica refazer a busca inteira.
    // A chave tem de ser a MESMA da consulta que alimenta a lista, item por
    // item: `setQueryData` com uma chave a menos escreve num cache que ninguém
    // lê, e o selo de não-lida ficava na tela até a próxima busca.
    queryClient.setQueryData<PaginaRecebidos>(
      [
        "received_emails",
        pageReceived,
        pastaSelecionada,
        buscaAplicada,
        somenteNaoLidas,
      ],
      (antigo) =>
        antigo
          ? {
              ...antigo,
              emails: antigo.emails.map((m) =>
                m.id === id ? { ...m, lido: true } : m,
              ),
            }
          : antigo,
    );

    // A gravação passa pela Edge Function, e não mais por um UPDATE direto,
    // porque agora ela tem DOIS destinos: a linha daqui e a caixa no provedor.
    // Sem o segundo, a próxima varredura trazia o `unread` do Gmail por cima e
    // a mensagem voltava a aparecer como nova — o trabalho de ler não durava.
    //
    // Numa caixa compartilhada isso significa que ler aqui marca lido para o
    // time inteiro, inclusive no celular. É o comportamento de uma caixa de
    // atendimento, e o inverso exigiria um "lido" por pessoa que nunca bateria
    // com o número do provedor.
    void supabase.functions
      .invoke("email-marcar-lido", { body: { mensagem_id: id, lido: true } })
      .then(({ error }) => {
        // Falhar aqui é cosmético — a próxima leitura da lista corrige o selo.
        if (error)
          console.warn("[email] não consegui marcar como lida:", error.message);
        // O badge de não lidas da barra lateral mudou de valor.
        else
          queryClient.invalidateQueries({
            queryKey: ["email_contagem_por_pasta"],
          });
      });
  };

  /** Inverso de `marcarLido`: mesma escrita otimista, mesmo espelho no provedor. */
  const marcarNaoLido = (id: string) => {
    queryClient.setQueryData<PaginaRecebidos>(
      [
        "received_emails",
        pageReceived,
        pastaSelecionada,
        buscaAplicada,
        somenteNaoLidas,
      ],
      (antigo) =>
        antigo
          ? {
              ...antigo,
              emails: antigo.emails.map((m) =>
                m.id === id ? { ...m, lido: false } : m,
              ),
            }
          : antigo,
    );

    void supabase.functions
      .invoke("email-marcar-lido", { body: { mensagem_id: id, lido: false } })
      .then(({ error }) => {
        if (error)
          console.warn(
            "[email] não consegui marcar como não lida:",
            error.message,
          );
        else
          queryClient.invalidateQueries({
            queryKey: ["email_contagem_por_pasta"],
          });
      });
  };

  /**
   * Abre a mensagem imediatamente, com o snippet, e troca pelo corpo quando ele
   * chega — em vez de segurar a tela até o corpo estar em mãos.
   */
  const abrirComCorpo = async (base: EmailAberto) => {
    setSelectedEmail({ ...base, html: "", carregandoCorpo: true });

    const corpo = await carregarCorpo(base.id);
    setSelectedEmail((atual) =>
      // Só escreve se a pessoa ainda estiver nesta mensagem — ela pode ter
      // clicado em outra enquanto a busca voava.
      atual?.id === base.id
        ? { ...atual, html: corpo ?? atual.html, carregandoCorpo: false }
        : atual,
    );
  };

  /**
   * Abre uma mensagem recebida.
   *
   * Antes, o clique esperava o UPDATE de "lido" terminar no servidor antes de
   * qualquer coisa aparecer na tela, e ainda invalidava a listagem inteira.
   * Eram duas idas ao servidor entre o clique e a mensagem abrir.
   */
  const abrirRecebido = (email: MensagemRecebida) => {
    if (!email.lido) marcarLido(email.id);
    void abrirComCorpo({
      ...email,
      destinatario: email.destinatarios?.[0] || "",
      remetente: email.remetente,
      corpo: email.snippet ?? "",
      created_at: email.criado_em,
      type: "received",
      respondida: !!(email.threadId && threadsRespondidos?.has(email.threadId)),
    });
  };

  /**
   * As DEMAIS mensagens da mesma conversa (`nylas_thread_id`) da mensagem
   * aberta no leitor — alimenta os cards de "Nesta conversa" em
   * `LeitorEmail`, já abertos (corpo completo, não só a prévia). Refaz ao
   * trocar de mensagem (a chave leva o id) porque abrir outro card da MESMA
   * conversa muda quem é "a atual" e quem entra na lista de "as outras".
   */
  const { data: mensagensDaConversa, isLoading: carregandoConversa } = useQuery({
    queryKey: ["conversa", selectedEmail?.threadId, selectedEmail?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_mensagens")
        .select(
          "id, direcao, data_mensagem, remetente_nome, remetente_email, snippet, lido",
        )
        .eq("nylas_thread_id", selectedEmail!.threadId as string)
        .eq("excluido", false)
        .order("data_mensagem", { ascending: true });
      if (error) throw error;

      const outras = (data ?? []).filter((m) => m.id !== selectedEmail!.id);

      // Corpo completo de cada uma, para os cards virem já abertos — não só a
      // prévia. `carregarCorpo` cacheia por mensagem (`use-email-empresa.ts`),
      // então reabrir a mesma conversa depois não repete a busca nem a Edge
      // Function.
      const corpos = await Promise.all(outras.map((m) => carregarCorpo(m.id)));

      return outras.map((m, i) => ({
        id: m.id,
        tipo: (m.direcao === "enviado" ? "sent" : "received") as "sent" | "received",
        remetente: m.remetente_nome
          ? `${m.remetente_nome} <${m.remetente_email ?? ""}>`
          : (m.remetente_email ?? ""),
        data: m.data_mensagem,
        snippet: m.snippet ?? "",
        html: corpos[i] ?? "",
        lido: m.lido,
      }));
    },
    enabled: !!selectedEmail?.threadId,
  });

  /** Clique num card de "Nesta conversa": busca a linha inteira e troca a mensagem aberta. */
  const abrirMensagemDaConversa = async (id: string) => {
    const { data: m, error } = await supabase
      .from("email_mensagens")
      .select(
        "id, direcao, data_mensagem, remetente_nome, remetente_email, destinatarios, assunto, snippet, lido, nylas_message_id, nylas_thread_id, caixa_origem",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !m) {
      toast.error("Não foi possível abrir esta mensagem.");
      return;
    }

    const enviado = m.direcao === "enviado";
    const destEmails = Array.isArray(m.destinatarios)
      ? m.destinatarios
          .map((d: { email?: string }) => d?.email)
          .filter(Boolean)
      : [];
    if (!enviado && !m.lido) marcarLido(m.id);

    void abrirComCorpo({
      id: m.id,
      remetente: enviado
        ? (connectedEmail ?? m.remetente_email ?? "")
        : m.remetente_nome
          ? `${m.remetente_nome} <${m.remetente_email ?? ""}>`
          : (m.remetente_email ?? ""),
      destinatario: enviado ? destEmails.join(", ") : (destEmails[0] ?? ""),
      assunto: m.assunto,
      corpo: m.snippet ?? "",
      created_at: m.data_mensagem,
      criado_em: m.data_mensagem,
      type: enviado ? "sent" : "received",
      threadId: m.nylas_thread_id ?? null,
      gmail_message_id: m.nylas_message_id,
      lido: m.lido,
      caixaOrigem: m.caixa_origem ?? null,
      respondida: !enviado && !!(m.nylas_thread_id && threadsRespondidos?.has(m.nylas_thread_id)),
    });
  };

  const escolherPasta = (p: PastaSelecionada) => {
    // Outro marcador = outra contagem; ficar na pagina 3 mostraria vazio.
    setPastaSelecionada(p);
    setPageReceived(0);
    // Marcador só faz sentido em Recebidos: a cópia enviada que o Gmail guarda
    // carrega apenas SENT, nunca os marcadores da conversa, então filtrar
    // Enviados por um marcador daria sempre lista vazia. Clicar num marcador
    // estando em Enviados quer dizer "quero ver esse marcador" — levar para a
    // aba onde ele funciona é mais útil do que aplicar um filtro estéril.
    if (p) setActiveTab("received");
  };

  const fecharCompositor = (aberto: boolean) => {
    setIsComposeOpen(aberto);
    if (!aberto) {
      setRespondendo(false);
      // Sem isto, escrever um e-mail NOVO logo depois de fechar uma resposta
      // sairia amarrado à conversa antiga.
      setRespondendoA(null);
    }
  };

  // Um único compositor, montado nas duas telas — a listagem e o leitor. É o
  // que permite responder sem sair do e-mail aberto.
  const compositor = (
    <CompositorEmail
      open={isComposeOpen}
      onOpenChange={fecharCompositor}
      valores={formData}
      onChange={setFormData}
      onEnviar={handleSubmit}
      onDescartar={() => {
        // Diferente de fechar o compositor (que preserva o rascunho para
        // retomar depois), este botão é a exclusão explícita — some da aba
        // Rascunhos também.
        if (rascunhoId) descartarRascunhoMutation.mutate(rascunhoId);
        setRascunhoId(null);
        setFormData({ destinatario: "", assunto: "", corpo: "" });
        fecharCompositor(false);
      }}
      isConnected={isConnected}
      isEnviando={sendEmailMutation.isPending}
      titulo={respondendo ? "Responder" : "Nova mensagem"}
    />
  );

  // Leitura ocupa a tela inteira, como no Gmail. Antes era um modal, mas e-mail
  // é conteúdo para ler, não confirmação de ação: o modal empilhava um contexto
  // sobre o outro, prendia a rolagem e obrigava a fechar para voltar à lista.
  if (selectedEmail) {
    return (
      <AppLayout
        title="E-mail"
        subtitle={connectedEmail ?? "Caixa da empresa"}
        mainClassName="flex-1 overflow-hidden p-0"
      >
        <LeitorEmail
          email={selectedEmail}
          emailDaConta={connectedEmail}
          onVoltar={() => setSelectedEmail(null)}
          onExcluir={() =>
            setEmailToDelete({
              id: selectedEmail.id,
              type:
                selectedEmail.type ||
                (selectedEmail.criado_em ? "received" : "sent"),
            })
          }
          onResponder={responderMensagem}
          onClicarEndereco={setEmailParaConfirmar}
          onMarcarNaoLido={
            selectedEmail.type === "received"
              ? () => {
                  marcarNaoLido(selectedEmail.id);
                  setSelectedEmail(null);
                }
              : undefined
          }
          onMover={
            selectedEmail.type === "received"
              ? () => setMensagensParaMover([selectedEmail.id])
              : undefined
          }
          mensagensDaConversa={mensagensDaConversa}
          carregandoConversa={carregandoConversa}
          onAbrirMensagemDaConversa={abrirMensagemDaConversa}
        />

        <MoverParaMarcadorDialog
          open={mensagensParaMover.length > 0}
          onOpenChange={(o) => !o && setMensagensParaMover([])}
          contaId={conta?.id}
          mensagemIds={mensagensParaMover}
        />

        {compositor}

        <ConfirmarEnviarEmailDialog
          endereco={emailParaConfirmar}
          onCancelar={() => setEmailParaConfirmar(null)}
          onConfirmar={(endereco) => {
            setEmailParaConfirmar(null);
            enviarPara(endereco);
          }}
        />

        <AlertDialog
          open={!!emailToDelete}
          onOpenChange={(open) => !open && setEmailToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este e-mail?</AlertDialogTitle>
              <AlertDialogDescription>
                Ele sai da sua caixa no CRM. A mensagem original continua na
                conta de e-mail — nada é apagado no provedor.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (emailToDelete) deleteEmailMutation.mutate(emailToDelete);
                  setEmailToDelete(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="E-mail"
      subtitle={connectedEmail ?? "Caixa da empresa"}
      mainClassName="flex-1 overflow-hidden p-0"
    >
      {/* CONTROLADO (`value`, não `defaultValue`). Com `defaultValue` o Radix
          guarda a aba internamente e ignora o estado do React: `activeTab`
          existia só como espelho, e chamar `setActiveTab` de fora — como faz o
          `escolherPasta` ao clicar num marcador estando em Enviados — mudava a
          variável sem mudar a aba na tela. A partir daí tudo que depende de
          `activeTab` (o contador da barra, o marcador aceso, o "selecionar
          todos", o tipo passado ao compositor) passava a falar de uma aba
          diferente da que a pessoa está vendo. */}
      <Tabs
        value={activeTab}
        className="flex flex-col h-full bg-background overflow-hidden"
        onValueChange={(val) => {
          setActiveTab(val);
          setSelectedIds([]);
        }}
      >
        {/* Header with Search and Tab Actions */}
        <div className="px-4 py-3 flex items-center justify-between gap-4 border-b bg-background/95 sticky top-0 z-10">
          {/* `min-w-0` + rolagem própria nesta fileira: sem os dois, as abas e a
              busca não cediam espaço, a linha estourava para a direita e o
              "Escrever" — que é o ÚNICO caminho para um e-mail novo — sumia por
              inteiro entre ~768 e ~917px de janela, sem barra de rolagem em lugar
              nenhum para alcançá-lo. Mesmo padrão de Negocios.tsx:1862. */}
          <div className="flex items-center gap-4 flex-1 min-w-0 overflow-x-auto custom-scrollbar">
            {selectedIds.length > 0 ? (
              <div className="flex shrink-0 items-center gap-4 bg-primary/5 px-3 py-1 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-bulk"
                    checked={
                      selectedIds.length > 0 &&
                      selectedIds.length ===
                        (activeTab === "received"
                          ? receivedEmails?.length
                          : emails?.length)
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm font-medium text-primary">
                    {selectedIds.length} selecionado(s)
                  </span>
                </div>
                <div className="h-4 w-[1px] bg-primary/20 mx-2" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                  onClick={() => setIsBulkDeleting(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
                {activeTab === "received" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-primary hover:bg-primary/10 gap-2"
                    onClick={() =>
                      bulkUpdateReadStatusMutation.mutate({
                        ids: selectedIds,
                        lido: true,
                      })
                    }
                  >
                    <CheckSquare className="h-4 w-4" />
                    Lido
                  </Button>
                )}
                {/* Marcador é conceito de caixa de entrada — em Enviados a
                    mensagem nem tem `pastas` do jeito que a Edge Function espera. */}
                {activeTab === "received" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-primary hover:bg-primary/10 gap-2"
                    onClick={() => setMensagensParaMover(selectedIds)}
                  >
                    <Tag className="h-4 w-4" />
                    Mover
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => setSelectedIds([])}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <TabsList className={cn(TOGGLE_LIST_CLASS, "shrink-0")}>
                <TabsTrigger value="received" className={TOGGLE_TRIGGER_CLASS}>
                  <Inbox className="h-4 w-4" />
                  <span className="hidden sm:inline">Recebidos</span>
                  <Badge variant="secondary" className={TOGGLE_BADGE_CLASS}>
                    {totalReceived}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="sent" className={TOGGLE_TRIGGER_CLASS}>
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Enviados</span>
                  <Badge variant="secondary" className={TOGGLE_BADGE_CLASS}>
                    {totalSent}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="drafts" className={TOGGLE_TRIGGER_CLASS}>
                  <PenBox className="h-4 w-4" />
                  <span className="hidden sm:inline">Rascunhos</span>
                  <Badge variant="secondary" className={TOGGLE_BADGE_CLASS}>
                    {rascunhos?.length ?? 0}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            )}

            {/* Somente não lidas.
                Fica FORA do bloco que a barra de seleção em massa substitui, e
                fora do contêiner `hidden md:flex` da busca — senão sumiria no
                celular, que é justamente onde triar o que falta ler importa
                mais. Só na aba Recebidos: "não lida" não quer dizer nada em
                Enviados. Mesmo padrão de botão do filtro do WhatsApp Inbox. */}
            {activeTab === "received" && selectedIds.length === 0 && (
              <div className={cn(TOGGLE_LIST_CLASS, "w-fit shrink-0")}>
                {[
                  { valor: false, rotulo: "Todas" },
                  { valor: true, rotulo: "Não lidas" },
                ].map((opt) => (
                  <button
                    key={String(opt.valor)}
                    type="button"
                    onClick={() => {
                      setSomenteNaoLidas(opt.valor);
                      // Outra contagem, outra paginação: ficar na página 3 de
                      // um filtro com 6 resultados mostraria lista vazia.
                      setPageReceived(0);
                    }}
                    className={cn(
                      TOGGLE_BUTTON_CLASS,
                      somenteNaoLidas === opt.valor
                        ? TOGGLE_BUTTON_ACTIVE
                        : TOGGLE_BUTTON_INACTIVE,
                    )}
                  >
                    {opt.rotulo}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-1 min-w-[14rem] max-w-md hidden md:flex">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  placeholder="Pesquisar e-mails..."
                  className="pl-10 h-10 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-1 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {isConnected && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-muted shrink-0"
                  onClick={() => sincronizar({ limit: 50 })}
                  disabled={isSyncing}
                  title="Buscar as mensagens mais recentes"
                >
                  <RefreshCw
                    className={`h-5 w-5 text-muted-foreground ${isSyncing ? "animate-spin" : ""}`}
                  />
                </Button>
              )}
              {/* Único caminho para trocar de caixa. O card de conexão — que tem
                  o botão de desconectar — só aparece quando NÃO há caixa
                  conectada, então depois de conectar não sobrava saída.
                  Escondido de quem não é dono nem gestor só para não oferecer
                  uma ação que o servidor vai recusar; a barreira real está na
                  Edge Function. */}
              {isConnected && podeGerenciarCaixa && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-muted shrink-0"
                  onClick={() => setGerenciarCaixaAberto(true)}
                  title={`Gerenciar a caixa conectada (${connectedEmail ?? ""})`}
                  aria-label="Gerenciar a caixa de e-mail da empresa"
                >
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          {/* `shrink-0`: a ação principal da tela nunca cede espaço para os
              filtros. Quem tem de encolher é a fileira da esquerda, que agora
              rola sozinha. */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={escreverNovo}
              className="h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-2 text-sm font-bold px-4 transition-all"
              title="Escrever um e-mail novo"
              aria-label="Escrever um e-mail novo"
            >
              <PenBox className="h-4 w-4" />
              <span className="hidden sm:inline">Escrever</span>
            </Button>
          </div>
        </div>

        {/* A barra fica FORA do TabsContent, ao lado dele: ela vale para a tela
            inteira, e repeti-la dentro de cada aba a faria remontar (perdendo a
            rolagem) a cada troca de Recebidos/Enviados. */}
        <div className="flex flex-1 overflow-hidden">
          {isConnected && (
            <BarraPastas
              pastas={pastas}
              carregando={pastasCarregando}
              // Em Enviados nada fica destacado: o marcador não filtra aquela
              // aba, e mostrar um item aceso ali afirmaria um filtro que não
              // existe.
              selecionada={activeTab === "sent" ? null : pastaSelecionada}
              onSelecionar={escolherPasta}
              totalSemFiltro={
                activeTab === "sent"
                  ? totalSent
                  : pastaSelecionada
                    ? (totalRecebidosSemMarcador ?? totalReceived)
                    : totalReceived
              }
              contagens={contagens}
              contaId={conta?.id}
              podeCriarMarcador={podeGerenciarCaixa}
            />
          )}

          <div className="relative min-w-0 flex-1 overflow-hidden">
            <TabsContent value="sent" className="m-0 h-full overflow-hidden">
              <div className="h-full overflow-hidden flex flex-col bg-background">
                <div className="flex-1 overflow-y-auto">
                  {isSentLoading ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !emails || emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Mail className="h-16 w-16 mb-4 opacity-10" />
                      <p className="text-lg">Nenhum e-mail enviado</p>
                    </div>
                  ) : (
                    <>
                      <CabecalhoLista
                        rotuloPrincipal="Destinatário"
                        rotuloData="Enviado em"
                        rotuloAssunto="Assunto e prévia"
                        checkbox={{
                          checked:
                            emails.length > 0 &&
                            selectedIds.length === emails.length,
                          onChange: toggleSelectAll,
                        }}
                      />
                      <div className="divide-y divide-border/50">
                        {emails.map((email) => (
                          <div
                            key={email.id}
                            className={cn(
                              "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                              selectedIds.includes(email.id) && "bg-primary/5",
                            )}
                            onClick={() =>
                              void abrirComCorpo({ ...email, type: "sent" })
                            }
                          >
                            <Checkbox
                              className="shrink-0"
                              checked={selectedIds.includes(email.id)}
                              onCheckedChange={() => toggleSelectId(email.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {iniciaisDe(email.destinatario)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground/70">
                                Para: {email.destinatario}
                              </span>
                              <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden">
                                <span className="shrink-0 overflow-hidden whitespace-nowrap text-sm font-semibold text-foreground">
                                  {truncarTexto(email.assunto, LIMITE_ASSUNTO)}
                                </span>
                                {email.corpo && (
                                  <span className="overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                                    {truncarTexto(email.corpo, LIMITE_PREVIA)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className={cn(
                                LARGURA_COL_DATA,
                                "text-right text-xs font-medium text-muted-foreground",
                              )}
                            >
                              {format(
                                new Date(email.created_at),
                                "dd 'de' MMM",
                                { locale: ptBR },
                              )}
                            </div>
                            <div
                              className={cn(
                                LARGURA_COL_ACOES,
                                "flex items-center justify-end",
                              )}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailToDelete({
                                    id: email.id,
                                    type: "sent",
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {totalSent > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/5 shrink-0">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {pageSent * PAGE_SIZE + 1} -{" "}
                      {Math.min((pageSent + 1) * PAGE_SIZE, totalSent)} de{" "}
                      {totalSent}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageSent(0)}
                        disabled={pageSent === 0}
                        className="h-8 w-8 p-0"
                        title="Primeira página"
                        aria-label="Primeira página"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageSent((p) => Math.max(0, p - 1))}
                        disabled={pageSent === 0}
                        className="h-8"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageSent((p) => p + 1)}
                        disabled={(pageSent + 1) * PAGE_SIZE >= totalSent}
                        className="h-8"
                      >
                        Próximo <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPageSent(
                            Math.max(0, Math.ceil(totalSent / PAGE_SIZE) - 1),
                          )
                        }
                        disabled={(pageSent + 1) * PAGE_SIZE >= totalSent}
                        className="h-8 w-8 p-0"
                        title="Última página"
                        aria-label="Última página"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent
              value="received"
              className="m-0 h-full overflow-hidden"
            >
              <div className="h-full overflow-hidden flex flex-col bg-background">
                <div className="relative flex-1 overflow-y-auto">
                  {/* Com `keepPreviousData`, trocar de marcador mantém a lista
                    antiga na tela e `isReceivedLoading` fica falso — só
                    `isFetching` sobe. Sem esta faixa, a troca parecia não ter
                    acontecido até os dados novos chegarem. */}
                  {isReceivedFetching && !isReceivedLoading && (
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b bg-background/95 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Atualizando mensagens…
                    </div>
                  )}
                  {isReceivedLoading ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !isConnected && receivedEmails.length === 0 ? (
                    // Antes do "caixa vazia": sem conta conectada a lista está
                    // vazia por falta de conexão, não por falta de e-mail, e
                    // mostrar "sua caixa está limpa" esconderia a ação necessária.
                    <div className="mx-auto w-full max-w-2xl px-4 py-10">
                      <ConectarEmailCard />
                    </div>
                  ) : !receivedEmails || receivedEmails.length === 0 ? (
                    /* Lista vazia tem CAUSAS diferentes, e "sua caixa está limpa"
                     só é verdade numa delas. Um marcador que ainda não foi
                     sincronizado com essa frase fazia a funcionalidade parecer
                     quebrada — o Gmail mostrava mensagens e o CRM dizia que não
                     havia nenhuma. */
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-4">
                      {marcadorEmBusca &&
                      marcadorEmBusca === pastaSelecionada ? (
                        <>
                          <Loader2 className="mb-4 h-10 w-10 animate-spin opacity-30" />
                          <h3 className="mb-1 text-lg font-medium">
                            Buscando as mensagens de {nomeDaPastaSelecionada}…
                          </h3>
                          <p className="max-w-xs text-sm opacity-60">
                            É a primeira vez que este marcador é aberto aqui. Da
                            próxima vez já estará pronto.
                          </p>
                        </>
                      ) : pastaSelecionada ? (
                        <>
                          <Tag className="mb-4 h-16 w-16 opacity-10" />
                          <h3 className="mb-1 text-lg font-medium">
                            Nenhuma mensagem em {nomeDaPastaSelecionada}
                          </h3>
                          <p className="max-w-xs text-sm opacity-60">
                            {somenteNaoLidas
                              ? "Não há mensagens por ler neste marcador."
                              : buscaAplicada
                                ? `Nada encontrado para “${buscaAplicada}” neste marcador.`
                                : "Este marcador não tem mensagens sincronizadas. Use o botão de atualizar para buscar de novo."}
                          </p>
                        </>
                      ) : somenteNaoLidas || buscaAplicada ? (
                        <>
                          <Inbox className="mb-4 h-16 w-16 opacity-10" />
                          <h3 className="mb-1 text-lg font-medium">
                            Nada por aqui
                          </h3>
                          <p className="max-w-xs text-sm opacity-60">
                            {somenteNaoLidas
                              ? "Tudo lido — nenhuma mensagem por ler."
                              : `Nada encontrado para “${buscaAplicada}”.`}
                          </p>
                        </>
                      ) : (
                        <>
                          <Inbox className="mb-4 h-16 w-16 opacity-10" />
                          <h3 className="mb-1 text-lg font-medium">
                            Sua caixa de entrada está limpa
                          </h3>
                          <p className="max-w-xs text-sm opacity-60">
                            Os e-mails recebidos em {connectedEmail} aparecem
                            aqui automaticamente.
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "divide-y divide-border/50 transition-opacity",
                        isReceivedFetching && "opacity-50",
                      )}
                    >
                      {/* Sem caixa conectada mas COM histórico: quem desconectou
                        escolheu preservar, e a promessa foi que as mensagens
                        continuariam aqui. Antes esta aba trocava a lista inteira
                        pelo card de conexão, então o histórico preservado ficava
                        invisível — a opção não entregava nada. Agora o convite a
                        reconectar aparece acima do histórico, sem escondê-lo. */}
                      {!isConnected && (
                        <div className="border-b bg-muted/30 px-4 py-4">
                          <div className="mx-auto w-full max-w-2xl">
                            <ConectarEmailCard />
                            <p className="mt-3 text-center text-xs text-muted-foreground">
                              Abaixo está o histórico das caixas anteriores. Ele
                              continua disponível para consulta, mas não recebe
                              mensagens novas.
                            </p>
                          </div>
                        </div>
                      )}
                      <CabecalhoLista
                        rotuloPrincipal="Remetente"
                        rotuloData="Recebido em"
                        rotuloAssunto="Assunto e prévia"
                        checkbox={{
                          checked:
                            receivedEmails.length > 0 &&
                            selectedIds.length === receivedEmails.length,
                          onChange: toggleSelectAll,
                        }}
                      />
                      {receivedEmails.map((email) => (
                        <div
                          key={email.id}
                          className={cn(
                            "group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                            selectedIds.includes(email.id) && "bg-primary/5",
                          )}
                          // Marca lido aqui E no provedor (ver `marcarLido`).
                          onClick={() => abrirRecebido(email)}
                        >
                          <Checkbox
                            className="shrink-0"
                            checked={selectedIds.includes(email.id)}
                            onCheckedChange={() => toggleSelectId(email.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {/* Avatar-âncora da linha: tonal (bg-primary/10) quando não
                            lida, para o olho encontrar rápido o que falta ler —
                            mesmo recurso visual usado em Clientes.tsx. */}
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              !email.lido
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {iniciaisDe(email.remetente)}
                          </div>
                          <div className="min-w-0 flex-1">
                            {/* Linha 1: remetente. Linha 2: assunto + prévia. Antes as
                              quatro informações disputavam a mesma linha, todas em
                              text-sm — nada se destacava. */}
                            <div className="flex items-center gap-1.5">
                              {!email.lido && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                              )}
                              <span
                                className={cn(
                                  "truncate text-sm",
                                  !email.lido
                                    ? "font-bold text-foreground"
                                    : "font-medium text-foreground/70",
                                )}
                              >
                                {soNome(email.remetente)}
                              </span>
                              {/* "Você respondeu" — só existe hoje via `nylas_thread_id`
                                  compartilhado (ver comentário em `threadsRespondidos`
                                  acima); não há flag "respondido" na mensagem. */}
                              {email.threadId && threadsRespondidos?.has(email.threadId) && (
                                <CornerUpLeft
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  title="Você respondeu esta conversa"
                                />
                              )}
                            </div>
                            <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden">
                              <span
                                className={cn(
                                  "shrink-0 overflow-hidden whitespace-nowrap text-sm",
                                  !email.lido
                                    ? "font-semibold text-foreground"
                                    : "text-foreground/70",
                                )}
                              >
                                {truncarTexto(email.assunto, LIMITE_ASSUNTO)}
                              </span>
                              {/* Prévia de verdade. Antes dizia literalmente
                                "Conteúdo HTML", que não conta nada sobre a
                                mensagem — e o snippet já vinha do Nylas. */}
                              {email.snippet && (
                                <span className="overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                                  {truncarTexto(email.snippet, LIMITE_PREVIA)}
                                </span>
                              )}
                              {/* Só aparece em mensagem de caixa já desconectada.
                                Sem isto, depois de trocar de endereço a lista
                                misturaria mensagens de duas caixas sem nenhuma
                                forma de saber qual é qual — que era justamente o
                                motivo de existir a coluna caixa_origem. */}
                              {email.caixaOrigem && (
                                <Badge
                                  variant="secondary"
                                  className="ml-1 h-5 shrink-0 gap-1 border-none bg-muted px-1.5 text-[11px] font-normal text-muted-foreground"
                                  title={`Recebido na caixa ${email.caixaOrigem}, que não está mais conectada`}
                                >
                                  <Archive className="h-3 w-3" />
                                  {email.caixaOrigem}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div
                            className={cn(
                              LARGURA_COL_DATA,
                              "text-right text-xs",
                              !email.lido
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {email.criado_em &&
                              format(new Date(email.criado_em), "HH:mm", {
                                locale: ptBR,
                              })}
                          </div>
                          <div
                            className={cn(
                              LARGURA_COL_ACOES,
                              "flex items-center justify-end gap-1",
                            )}
                          >
                            {email.lido && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  marcarNaoLido(email.id);
                                }}
                                title="Marcar como não lida"
                                aria-label="Marcar como não lida"
                              >
                                <MailOpen className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEmailToDelete({
                                  id: email.id,
                                  type: "received",
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {totalReceived > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/5 shrink-0">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {pageReceived * PAGE_SIZE + 1} -{" "}
                      {Math.min((pageReceived + 1) * PAGE_SIZE, totalReceived)}{" "}
                      de {totalReceived}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageReceived(0)}
                        disabled={pageReceived === 0}
                        className="h-8 w-8 p-0"
                        title="Primeira página"
                        aria-label="Primeira página"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPageReceived((p) => Math.max(0, p - 1))
                        }
                        disabled={pageReceived === 0}
                        className="h-8"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageReceived((p) => p + 1)}
                        disabled={
                          (pageReceived + 1) * PAGE_SIZE >= totalReceived
                        }
                        className="h-8"
                      >
                        Próximo <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPageReceived(
                            Math.max(
                              0,
                              Math.ceil(totalReceived / PAGE_SIZE) - 1,
                            ),
                          )
                        }
                        disabled={
                          (pageReceived + 1) * PAGE_SIZE >= totalReceived
                        }
                        className="h-8 w-8 p-0"
                        title="Última página"
                        aria-label="Última página"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="drafts" className="m-0 h-full overflow-hidden">
              <div className="h-full overflow-hidden flex flex-col bg-background">
                <div className="flex-1 overflow-y-auto">
                  {!rascunhos || rascunhos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <PenBox className="h-16 w-16 mb-4 opacity-10" />
                      <p className="text-lg">Nenhum rascunho salvo</p>
                    </div>
                  ) : (
                    <>
                      <CabecalhoLista
                        rotuloPrincipal="Destinatário"
                        rotuloData="Editado em"
                        rotuloAssunto="Assunto e prévia"
                      />
                      <div className="divide-y divide-border/50">
                        {rascunhos.map((r) => (
                          <div
                            key={r.id}
                            className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                            onClick={() => continuarRascunho(r)}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <PenBox className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground/70">
                                Para: {r.destinatario || "(sem destinatário)"}
                              </span>
                              <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden">
                                <span className="shrink-0 overflow-hidden whitespace-nowrap text-sm font-semibold text-foreground">
                                  {truncarTexto(
                                    r.assunto || "(sem assunto)",
                                    LIMITE_ASSUNTO,
                                  )}
                                </span>
                                {r.corpo && (
                                  <span className="overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                                    {truncarTexto(r.corpo, LIMITE_PREVIA)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className={cn(
                                LARGURA_COL_DATA,
                                "text-right text-xs font-medium text-muted-foreground",
                              )}
                            >
                              {format(
                                new Date(r.atualizado_em),
                                "dd 'de' MMM",
                                { locale: ptBR },
                              )}
                            </div>
                            <div
                              className={cn(
                                LARGURA_COL_ACOES,
                                "flex items-center justify-end",
                              )}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  descartarRascunhoDaLista(r.id);
                                }}
                                title="Descartar rascunho"
                                aria-label="Descartar rascunho"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {compositor}

      <GerenciarCaixaDialog
        open={gerenciarCaixaAberto}
        onOpenChange={setGerenciarCaixaAberto}
      />

      <MoverParaMarcadorDialog
        open={mensagensParaMover.length > 0}
        onOpenChange={(o) => !o && setMensagensParaMover([])}
        contaId={conta?.id}
        mensagemIds={mensagensParaMover}
        onMoved={() => setSelectedIds([])}
      />

      <AlertDialog
        open={!!emailToDelete}
        onOpenChange={(open) => !open && setEmailToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o
              e-mail do nosso banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (emailToDelete) {
                  deleteEmailMutation.mutate(emailToDelete);
                  setEmailToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isBulkDeleting} onOpenChange={setIsBulkDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir e-mails em massa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedIds.length} e-mail(s). Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsBulkDeleting(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteMutation.mutate({
                  ids: selectedIds,
                  type: activeTab as "sent" | "received",
                });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Emails;

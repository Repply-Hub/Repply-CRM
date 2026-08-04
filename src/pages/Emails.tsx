import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
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
  ChevronRight
} from "lucide-react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS, TOGGLE_BADGE_CLASS } from "@/lib/toggle-group-styles";
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
import { ConectarEmailCard } from "@/components/email/ConectarEmailCard";
import { LeitorEmail, type EmailAberto } from "@/components/email/LeitorEmail";
import { CompositorEmail } from "@/components/email/CompositorEmail";
import { GerenciarCaixaDialog } from "@/components/email/GerenciarCaixaDialog";
import { BarraPastas, type PastaSelecionada } from "@/components/email/BarraPastas";
import { useEmailPastas } from "@/hooks/use-email-pastas";

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
  remetente: string;
  destinatarios: string[];
  assunto: string | null;
}

interface PaginaRecebidos {
  emails: MensagemRecebida[];
  count: number;
}

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
  const [gerenciarCaixaAberto, setGerenciarCaixaAberto] = useState(false);
  // Marcador escolhido na barra lateral. null = a aba manda sozinha.
  const [pastaSelecionada, setPastaSelecionada] = useState<PastaSelecionada>(null);
  const [emailToDelete, setEmailToDelete] = useState<{ id: string; type: "sent" | "received" } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("received");
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [pageSent, setPageSent] = useState(0);
  const [pageReceived, setPageReceived] = useState(0);
  const PAGE_SIZE = 15;
  // Nylas no lugar do Gmail direto: o contrato do hook é o mesmo
  // (isConnected/connectedEmail/sendEmail), então a troca é de import. A
  // diferença de modelo é que a caixa agora é da EMPRESA, compartilhada pelo
  // time, e não uma conta por usuário.
  const { isConnected, connectedEmail, enviarEmail: sendEmail, sincronizar, isSyncing, carregarCorpo,
    podeGerenciarCaixa, conta } = useEmailEmpresa();
  const { data: pastas = [], isLoading: pastasCarregando } = useEmailPastas(conta?.id);
  const [formData, setFormData] = useState({
    destinatario: "",
    assunto: "",
    corpo: ""
  });

  const COMPANY_LOGO_URL = "https://ukwwhwytyovrzefkdeyj.supabase.co/storage/v1/object/public/email-assets/logo-email.png";

  useEffect(() => {
    const to = searchParams.get("to");
    if (to) {
      setFormData(prev => ({ ...prev, destinatario: to }));
      setIsComposeOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(searchTerm.trim());
      // Voltar à primeira página: um termo novo tem outra contagem de
      // resultados, e continuar na página 3 mostraria uma lista vazia.
      setPageSent(0);
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
        state_invalido: "O link de conexão não é mais válido. Tente conectar de novo.",
        state_expirado: "A conexão demorou demais. Tente de novo.",
        troca_falhou: "O provedor recusou a autorização. Tente de novo.",
        caixa_em_uso: "Esta caixa já está conectada a outra empresa.",
        gravacao_falhou: "Não foi possível salvar a conexão. Tente de novo.",
        retorno_incompleto: "O provedor devolveu uma resposta incompleta.",
      };
      toast.error(MOTIVOS[searchParams.get("motivo") ?? ""] ?? "Não foi possível conectar a caixa.");
    }

    // Limpa a query para o aviso não reaparecer a cada re-render ou refresh.
    const limpa = new URL(window.location.href);
    limpa.searchParams.delete("conexao");
    limpa.searchParams.delete("motivo");
    window.history.replaceState({}, "", limpa.toString());
  }, [searchParams, queryClient]);

  const { data: perfil } = useQuery({
    queryKey: ["meu_perfil"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("usuarios")
        .select("nome, assinatura_email")
        .eq("user_id", user.id)
        .single();
      return data;
    },
  });

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
          "id, assunto, snippet, destinatarios, remetente_email, envio_status, data_mensagem, caixa_origem",
          { count: "exact" },
        )
        .eq("direcao", "enviado")
        .eq("excluido", false)
        .order("data_mensagem", { ascending: false })
        .range(pageSent * PAGE_SIZE, (pageSent + 1) * PAGE_SIZE - 1);

      if (buscaAplicada) {
        query = query.or(`assunto.ilike.%${buscaAplicada}%,snippet.ilike.%${buscaAplicada}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Remapeia para o formato que o JSX já consome, para a troca de origem
      // não obrigar a reescrever a renderização inteira.
      const emails = (data ?? []).map((m) => {
        const dest = Array.isArray(m.destinatarios) ? m.destinatarios : [];
        return {
          id: m.id,
          destinatario: dest.map((d: { email?: string }) => d?.email).filter(Boolean).join(", "),
          remetente: m.remetente_email,
          assunto: m.assunto,
          corpo: m.snippet ?? "",
          html: "",
          status: m.envio_status ?? "enviado",
          caixaOrigem: m.caixa_origem ?? null,
          created_at: m.data_mensagem,
          updated_at: m.data_mensagem,
        };
      });

      return { emails, count: count || 0 };
    },
    placeholderData: keepPreviousData,
  });

  const emails = sentData?.emails || [];
  const totalSent = sentData?.count || 0;

  const { data: receivedData, isLoading: isReceivedLoading } = useQuery({
    queryKey: ["received_emails", pageReceived, pastaSelecionada],
    queryFn: async () => {
      // Mesma regra da caixa de enviados: nada de `corpo_html` na listagem.
      let consulta = supabase
        .from("email_mensagens")
        .select(
          "id, lido, data_mensagem, snippet, nylas_message_id, remetente_nome, remetente_email, destinatarios, assunto, caixa_origem",
          { count: "exact" },
        )
        .eq("direcao", "recebido")
        .eq("excluido", false);

      // O marcador escolhido na barra lateral. `pastas` é TEXT[] com os ids do
      // provedor, que o sync já grava em cada mensagem — `contains` vira o
      // operador `@>` do Postgres, que usa índice se um dia houver um GIN aqui.
      if (pastaSelecionada) {
        consulta = consulta.contains("pastas", [pastaSelecionada]);
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
        remetente: m.remetente_nome
          ? `${m.remetente_nome} <${m.remetente_email ?? ""}>`
          : (m.remetente_email ?? ""),
        destinatarios: Array.isArray(m.destinatarios)
          ? m.destinatarios.map((d: { email?: string }) => d?.email).filter(Boolean)
          : [],
        assunto: m.assunto,
      }));

      return { emails, count: count || 0 };
    },
    placeholderData: keepPreviousData,
  });

  const receivedEmails = receivedData?.emails || [];
  const totalReceived = receivedData?.count || 0;

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { destinatario: string; assunto: string; corpo: string }) => {
      if (!isConnected) {
        throw new Error("Conecte a caixa de e-mail da empresa para enviar mensagens.");
      }

      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 16px; color: #333; line-height: 1.5;">
          ${data.corpo.replace(/\n/g, '<br>')}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <img src="${COMPANY_LOGO_URL}?t=${Date.now()}" alt="MD Representações" style="max-height: 50px; display: block; margin-bottom: 10px;" />
          <div style="color: #333; font-weight: bold; font-size: 16px;">${perfil?.nome || "Equipe MD"}</div>
          ${perfil?.assinatura_email ? `<div style="color: #666; font-size: 14px; margin-top: 4px;">${perfil.assinatura_email.replace(/\n/g, '<br>')}</div>` : ''}
          <div style="color: #94a3b8; font-size: 12px; margin-top: 15px;">
            MD Representações
          </div>
        </div>
      `;

      // O registro em email_mensagens é feito pela Edge Function, que é quem
      // conhece o id devolvido pelo Nylas. Gravar também daqui criaria duas
      // linhas para o mesmo envio — e o cliente nem tem INSERT nessa tabela.
      return await sendEmail(data.destinatario, data.assunto, htmlBody);
    },
    onSuccess: () => {
      toast.success("E-mail enviado.");
      setIsComposeOpen(false);
      setRespondendo(false);
      setFormData({
        destinatario: "",
        assunto: "",
        corpo: ""
      });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao enviar e-mail: " + (error.message || "Verifique sua conexão com o Gmail"));
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
      queryClient.invalidateQueries({ queryKey: [variables.type === "sent" ? "emails" : "received_emails"] });
      if (selectedEmail?.id === variables.id) {
        setSelectedEmail(null);
      }
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir e-mail: " + (error.message || "Erro desconhecido"));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ ids }: { ids: string[]; type: "sent" | "received" }) => {
      const { error } = await supabase
        .from("email_mensagens")
        .update({ excluido: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(`${variables.ids.length} e-mail(s) excluído(s) com sucesso`);
      queryClient.invalidateQueries({ queryKey: [variables.type === "sent" ? "emails" : "received_emails"] });
      setSelectedIds([]);
      setIsBulkDeleting(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir e-mails: " + (error.message || "Erro desconhecido"));
      setIsBulkDeleting(false);
    },
  });

  const bulkUpdateReadStatusMutation = useMutation({
    mutationFn: async ({ ids, lido }: { ids: string[]; lido: boolean }) => {
      const { error } = await supabase
        .from("email_mensagens")
        .update({ lido })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("E-mails atualizados com sucesso");
      queryClient.invalidateQueries({ queryKey: ["received_emails"] });
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar e-mails: " + (error.message || "Erro desconhecido"));
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
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
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

  /** Monta a resposta a partir da mensagem aberta e abre o compositor. */
  const responderMensagem = () => {
    if (!selectedEmail) return;
    const assunto = selectedEmail.assunto ?? "";
    const replySubject = assunto.toLowerCase().startsWith("re:") ? assunto : `Re: ${assunto}`;
    const quando = selectedEmail.created_at || selectedEmail.criado_em;
    const citado = selectedEmail.snippet || selectedEmail.corpo || "";

    setFormData({
      ...formData,
      // Só o endereço: o campo trazia "Nome <e-mail>" inteiro, que é o que o
      // leitor exibe, não o que o provedor aceita como destinatário.
      destinatario: soEndereco(selectedEmail.remetente || selectedEmail.destinatario),
      assunto: replySubject,
      corpo: `\n\n--- Em ${quando ? format(new Date(quando), "dd/MM/yyyy HH:mm") : ""}, ${selectedEmail.remetente} escreveu:\n\n${citado}`,
    });
    // O e-mail aberto CONTINUA aberto atrás do compositor. Fechá-lo aqui era o
    // que jogava a pessoa de volta para a caixa de entrada no meio da resposta.
    setRespondendo(true);
    setIsComposeOpen(true);
  };

  /** Marca como lida sem segurar a abertura da mensagem. */
  const marcarLido = (id: string) => {
    // Escreve direto na lista que já está na tela, em vez de invalidar a
    // consulta: trocar um booleano não justifica refazer a busca inteira.
    queryClient.setQueryData<PaginaRecebidos>(["received_emails", pageReceived], (antigo) =>
      antigo
        ? { ...antigo, emails: antigo.emails.map((m) => (m.id === id ? { ...m, lido: true } : m)) }
        : antigo,
    );

    supabase
      .from("email_mensagens")
      .update({ lido: true })
      .eq("id", id)
      .then(({ error }) => {
        // Falhar aqui é cosmético — a próxima leitura da lista corrige o selo.
        if (error) console.warn("[email] não consegui marcar como lida:", error.message);
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
      atual?.id === base.id ? { ...atual, html: corpo ?? atual.html, carregandoCorpo: false } : atual,
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
    });
  };

  const escolherPasta = (p: PastaSelecionada) => {
    // Outro marcador = outra contagem; ficar na pagina 3 mostraria vazio.
    setPastaSelecionada(p);
    setPageReceived(0);
  };

  const fecharCompositor = (aberto: boolean) => {
    setIsComposeOpen(aberto);
    if (!aberto) setRespondendo(false);
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
              type: selectedEmail.type || (selectedEmail.criado_em ? "received" : "sent"),
            })
          }
          onResponder={responderMensagem}
        />

        {compositor}

        <AlertDialog
          open={!!emailToDelete}
          onOpenChange={(open) => !open && setEmailToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este e-mail?</AlertDialogTitle>
              <AlertDialogDescription>
                Ele sai da sua caixa no CRM. A mensagem original continua na conta de
                e-mail — nada é apagado no provedor.
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
    <AppLayout title="E-mail" subtitle={connectedEmail ?? "Caixa da empresa"} mainClassName="flex-1 overflow-hidden p-0">
      <Tabs
        defaultValue="received" 
        className="flex flex-col h-full bg-background overflow-hidden"
        onValueChange={(val) => {
          setActiveTab(val);
          setSelectedIds([]);
        }}
      >
        {/* Header with Search and Tab Actions */}
        <div className="px-4 py-3 flex items-center justify-between gap-4 border-b bg-background/95 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            {selectedIds.length > 0 ? (
              <div className="flex items-center gap-4 bg-primary/5 px-3 py-1 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="select-all-bulk"
                    checked={
                      selectedIds.length > 0 && 
                      selectedIds.length === (activeTab === "received" ? receivedEmails?.length : emails?.length)
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
                    onClick={() => bulkUpdateReadStatusMutation.mutate({ ids: selectedIds, lido: true })}
                  >
                    <CheckSquare className="h-4 w-4" />
                    Lido
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
              <TabsList className={TOGGLE_LIST_CLASS}>
                <TabsTrigger
                  value="received"
                  className={TOGGLE_TRIGGER_CLASS}
                >
                  <Inbox className="h-4 w-4" />
                  <span className="hidden sm:inline">Recebidos</span>
                  <Badge variant="secondary" className={TOGGLE_BADGE_CLASS}>
                    {totalReceived}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="sent"
                  className={TOGGLE_TRIGGER_CLASS}
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Enviados</span>
                  <Badge variant="secondary" className={TOGGLE_BADGE_CLASS}>
                    {totalSent}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            )}

            <div className="flex items-center gap-2 flex-1 max-w-md hidden md:flex">
              <div className="relative flex-1">
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
                  onClick={() => sincronizar({ limit: 20 })}
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
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsComposeOpen(true)}
              className="h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-2 text-sm font-bold px-4 transition-all"
            >
              <PenBox className="h-4 w-4" />
              Escrever
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
              selecionada={pastaSelecionada}
              onSelecionar={escolherPasta}
              totalSemFiltro={activeTab === "sent" ? totalSent : totalReceived}
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
                  <div className="divide-y divide-border/50">
                    {emails.map((email) => (
                      <div 
                        key={email.id} 
                        className={`px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer flex items-center gap-4 ${selectedIds.includes(email.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => void abrirComCorpo({ ...email, type: "sent" })}
                      >
                        <div className="flex items-center gap-3 shrink-0">
                          <Checkbox 
                            checked={selectedIds.includes(email.id)}
                            onCheckedChange={() => toggleSelectId(email.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Mail className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground" />
                        </div>
                        <div className="min-w-[150px] max-w-[200px] truncate shrink-0">
                          <span className="text-sm text-foreground/80 font-medium">Para: {email.destinatario}</span>
                        </div>
                        <div className="flex-1 truncate overflow-hidden">
                          <span className="text-sm font-semibold text-foreground mr-2 shrink-0">{email.assunto}</span>
                          <span className="text-sm text-muted-foreground">- {email.corpo}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 text-xs font-medium text-muted-foreground">
                            {format(new Date(email.created_at), "dd 'de' MMM", { locale: ptBR })}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmailToDelete({ id: email.id, type: "sent" });
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
              {totalSent > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/5 shrink-0">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {pageSent * PAGE_SIZE + 1} - {Math.min((pageSent + 1) * PAGE_SIZE, totalSent)} de {totalSent}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageSent(p => Math.max(0, p - 1))}
                      disabled={pageSent === 0}
                      className="h-8"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageSent(p => p + 1)}
                      disabled={(pageSent + 1) * PAGE_SIZE >= totalSent}
                      className="h-8"
                    >
                      Próximo <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="received" className="m-0 h-full overflow-hidden">
            <div className="h-full overflow-hidden flex flex-col bg-background">
              <div className="flex-1 overflow-y-auto">
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
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-4">
                    <Inbox className="h-16 w-16 mb-4 opacity-10" />
                    <h3 className="font-medium text-lg mb-1">Sua caixa de entrada está limpa</h3>
                    <p className="max-w-xs text-sm opacity-60">
                      Os e-mails recebidos em {connectedEmail} aparecem aqui automaticamente.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
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
                            Abaixo está o histórico das caixas anteriores. Ele continua
                            disponível para consulta, mas não recebe mensagens novas.
                          </p>
                        </div>
                      </div>
                    )}
                    {receivedEmails.map((email) => (
                      <div 
                        key={email.id} 
                        className={`px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer flex items-center gap-4 ${selectedIds.includes(email.id) ? 'bg-primary/5' : ''} ${!email.lido ? 'bg-muted/20' : ''}`}
                        // Marca lido só no CRM. O provedor não é atualizado de
                        // propósito: espelhar o "lido" de volta para a caixa
                        // faria a mensagem sumir como nova do celular do gestor
                        // porque um vendedor abriu aqui — e a caixa é
                        // compartilhada pelo time inteiro.
                        onClick={() => abrirRecebido(email)}
                      >
                        <div className="flex items-center gap-3 shrink-0">
                          <Checkbox 
                            checked={selectedIds.includes(email.id)}
                            onCheckedChange={() => toggleSelectId(email.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Inbox className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground" />
                        </div>
                        <div className="min-w-[150px] max-w-[200px] truncate shrink-0">
                          <span className={`text-sm ${!email.lido ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>{email.remetente}</span>
                        </div>
                        <div className="flex-1 truncate overflow-hidden">
                          <span className={`text-sm ${!email.lido ? 'font-bold text-foreground' : 'font-normal text-foreground'} mr-2 shrink-0`}>{email.assunto}</span>
                          {/* Prévia de verdade. Antes dizia literalmente
                              "Conteúdo HTML", que não conta nada sobre a
                              mensagem — e o snippet já vinha do Nylas. */}
                          {email.snippet && (
                            <span className="text-sm text-muted-foreground opacity-60">- {email.snippet}</span>
                          )}
                          {/* Só aparece em mensagem de caixa já desconectada.
                              Sem isto, depois de trocar de endereço a lista
                              misturaria mensagens de duas caixas sem nenhuma
                              forma de saber qual é qual — que era justamente o
                              motivo de existir a coluna caixa_origem. */}
                          {email.caixaOrigem && (
                            <Badge
                              variant="secondary"
                              className="ml-2 h-5 shrink-0 gap-1 border-none bg-muted px-1.5 text-[11px] font-normal text-muted-foreground"
                              title={`Recebido na caixa ${email.caixaOrigem}, que não está mais conectada`}
                            >
                              <Archive className="h-3 w-3" />
                              {email.caixaOrigem}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`shrink-0 text-xs ${!email.lido ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>
                            {email.criado_em && format(new Date(email.criado_em), "HH:mm", { locale: ptBR })}
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmailToDelete({ id: email.id, type: "received" });
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
                    Mostrando {pageReceived * PAGE_SIZE + 1} - {Math.min((pageReceived + 1) * PAGE_SIZE, totalReceived)} de {totalReceived}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageReceived(p => Math.max(0, p - 1))}
                      disabled={pageReceived === 0}
                      className="h-8"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageReceived(p => p + 1)}
                      disabled={(pageReceived + 1) * PAGE_SIZE >= totalReceived}
                      className="h-8"
                    >
                      Próximo <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
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

      <AlertDialog open={!!emailToDelete} onOpenChange={(open) => !open && setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o e-mail
              do nosso banco de dados.
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
              Você está prestes a excluir {selectedIds.length} e-mail(s). 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsBulkDeleting(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteMutation.mutate({ 
                  ids: selectedIds, 
                  type: activeTab as "sent" | "received" 
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

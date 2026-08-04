import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, 
  Send, 
  Inbox, 
  Search, 
  Plus, 
  Loader2, 
  History,
  Settings,
  RefreshCw,
  PenBox,
  Trash2,
  MoreVertical,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from "@/lib/toggle-group-styles";
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

const Emails = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
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
  const { isConnected, connectedEmail, enviarEmail: sendEmail, sincronizar, isSyncing, carregarCorpo } =
    useEmailEmpresa();
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
    queryKey: ["emails", searchTerm, pageSent],
    queryFn: async () => {
      // Sem filtro por user_id: a caixa é da EMPRESA e o time inteiro
      // compartilha. Quem limita as linhas é o RLS de email_mensagens, por
      // empresa_id — filtrar por usuário aqui esconderia do time o que um
      // colega enviou pela mesma caixa.
      let query = supabase
        .from("email_mensagens")
        .select(
          "id, assunto, corpo_html, snippet, destinatarios, remetente_email, envio_status, data_mensagem",
          { count: "exact" },
        )
        .eq("direcao", "enviado")
        .eq("excluido", false)
        .order("data_mensagem", { ascending: false })
        .range(pageSent * PAGE_SIZE, (pageSent + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.or(`assunto.ilike.%${searchTerm}%,snippet.ilike.%${searchTerm}%`);
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
          html: m.corpo_html ?? "",
          status: m.envio_status ?? "enviado",
          created_at: m.data_mensagem,
          updated_at: m.data_mensagem,
        };
      });

      return { emails, count: count || 0 };
    },
  });

  const emails = sentData?.emails || [];
  const totalSent = sentData?.count || 0;

  const { data: receivedData, isLoading: isReceivedLoading } = useQuery({
    queryKey: ["received_emails", pageReceived],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("email_mensagens")
        .select(
          "id, lido, data_mensagem, corpo_html, snippet, nylas_message_id, remetente_nome, remetente_email, destinatarios, assunto",
          { count: "exact" },
        )
        .eq("direcao", "recebido")
        .eq("excluido", false)
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
        // O corpo só é preenchido quando alguém abre: a listagem do Nylas
        // devolve snippet, não body. Até lá o snippet é o que existe — e
        // `temCorpo` distingue os dois, para saber se vale buscar ao abrir.
        corpo_html: m.corpo_html ?? m.snippet ?? "",
        temCorpo: !!m.corpo_html,
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
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[20px] justify-center bg-primary/10 text-primary border-none">
                    {totalReceived}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="sent"
                  className={TOGGLE_TRIGGER_CLASS}
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Enviados</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[20px] justify-center bg-primary/10 text-primary border-none">
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-2 text-sm font-bold px-4 transition-all">
                  <PenBox className="h-4 w-4" />
                  Escrever
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-xl border-none shadow-2xl">
                <div className="bg-[#404040] text-white px-4 py-2 flex justify-between items-center">
                  <span className="text-sm font-medium">Nova mensagem</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/10" onClick={() => setIsComposeOpen(false)}>
                      <Plus className="h-4 w-4 rotate-45" />
                    </Button>
                  </div>
                </div>
                <form onSubmit={handleSubmit} className="p-0 space-y-0">
                  <div className="px-4 border-b">
                    <div className="flex items-center gap-2 py-2">
                      <span className="text-sm text-muted-foreground min-w-[60px]">Para</span>
                      <Input
                        id="to"
                        placeholder="email@exemplo.com"
                        className="border-none shadow-none focus-visible:ring-0 px-0 h-8 bg-transparent"
                        value={formData.destinatario}
                        onChange={(e) => setFormData({ ...formData, destinatario: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="px-4 border-b">
                    <div className="flex items-center gap-2 py-2">
                      <span className="text-sm text-muted-foreground min-w-[60px]">Assunto</span>
                      <Input
                        id="subject"
                        placeholder="Assunto"
                        className="border-none shadow-none focus-visible:ring-0 px-0 h-8 font-medium bg-transparent"
                        value={formData.assunto}
                        onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="p-4">
                    <Textarea
                      id="body"
                      placeholder="Escreva sua mensagem aqui..."
                      className="min-h-[300px] border-none focus-visible:ring-0 p-0 resize-none text-base"
                      value={formData.corpo}
                      onChange={(e) => setFormData({ ...formData, corpo: e.target.value })}
                    />
                  </div>
                  <div className="p-4 flex justify-between items-center bg-muted/10">
                    <div className="flex gap-2 items-center">
                      {!isConnected ? (
                        // Sem caixa conectada não há de onde enviar. O caminho
                        // para conectar fica na própria aba de e-mails, atrás
                        // deste diálogo — daí fechar em vez de navegar para fora.
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsComposeOpen(false)}
                          className="rounded-full px-6 flex gap-2 items-center"
                        >
                          <Mail className="h-4 w-4" />
                          Conectar uma caixa para enviar
                        </Button>
                      ) : (
                        <Button type="submit" className="rounded-full px-6 bg-[#0b57d0] hover:bg-[#0842a0]" disabled={sendEmailMutation.isPending}>
                          {sendEmailMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Enviar
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="icon" className="rounded-full">
                        <Trash2 className="h-5 w-5 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Logo URL removed to keep it company-exclusive */}
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
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
                        onClick={() => setSelectedEmail({ ...email, type: "sent" })}
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
                ) : !isConnected ? (
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
                    {receivedEmails.map((email) => (
                      <div 
                        key={email.id} 
                        className={`px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer flex items-center gap-4 ${selectedIds.includes(email.id) ? 'bg-primary/5' : ''} ${!email.lido ? 'bg-muted/20' : ''}`}
                        onClick={async () => {
                          if (!email.lido) {
                            // Marca lido só no CRM. O provedor não é atualizado
                            // de propósito: espelhar o "lido" de volta para a
                            // caixa faria a mensagem sumir como nova do celular
                            // do gestor porque um vendedor abriu aqui — e a
                            // caixa é compartilhada pelo time inteiro.
                            await supabase
                              .from("email_mensagens")
                              .update({ lido: true })
                              .eq("id", email.id);

                            queryClient.invalidateQueries({ queryKey: ["received_emails"] });
                          }
                          
                          // Abre já com o snippet e troca pelo corpo quando ele
                          // chegar: esperar a ida ao Nylas antes de abrir daria
                          // a sensação de clique que não responde.
                          setSelectedEmail({
                            ...email,
                            destinatario: email.destinatarios?.[0] || "",
                            remetente: email.remetente,
                            corpo: "",
                            html: email.corpo_html,
                            created_at: email.criado_em,
                            carregandoCorpo: !email.temCorpo,
                            type: "received"
                          });

                          if (!email.temCorpo) {
                            const corpo = await carregarCorpo(email.id);
                            setSelectedEmail((atual: any) =>
                              // Só escreve se a pessoa ainda estiver nesta
                              // mensagem — ela pode ter clicado em outra
                              // enquanto a busca voava.
                              atual?.id === email.id
                                ? { ...atual, html: corpo ?? atual.html, carregandoCorpo: false }
                                : atual,
                            );
                          }
                        }}

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
                          <span className="text-sm text-muted-foreground opacity-60">- {email.corpo_html ? "Conteúdo HTML" : ""}</span>
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
      </Tabs>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0 border shadow-2xl rounded-2xl bg-card">
          <div className="p-6 overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-normal text-foreground mb-6">{selectedEmail?.assunto}</h2>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold uppercase">
                    {(selectedEmail?.remetente || selectedEmail?.destinatario || "?")[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{selectedEmail?.remetente || "Eu"}</span>
                      <span className="text-xs text-muted-foreground">&lt;{selectedEmail?.remetente || connectedEmail}&gt;</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      para {selectedEmail?.destinatario}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedEmail && format(new Date(selectedEmail.created_at || selectedEmail.criado_em), "dd 'de' MMM. 'de' yyyy, HH:mm", { locale: ptBR })}
              </div>
            </div>

            <div className="text-base text-slate-800 leading-relaxed min-h-[200px] bg-white p-4 rounded-lg border border-slate-100">
              {/* Enquanto o corpo completo não chega, o que está na tela é o
                  resumo — dizer isso evita o usuário achar que o e-mail veio
                  truncado. */}
              {selectedEmail?.carregandoCorpo && (
                <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando o conteúdo completo...
                </div>
              )}
              {selectedEmail?.html ? (
                <div 
                  className="prose prose-sm max-w-none text-slate-800"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.html }} 
                />
              ) : (
                <div className="whitespace-pre-wrap text-slate-800">
                  {selectedEmail?.corpo}
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t bg-muted/5 flex justify-between gap-2">
            <Button 
              variant="ghost" 
              className="rounded-full px-4 text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-2"
              onClick={() => {
                setEmailToDelete({ 
                  id: selectedEmail.id, 
                  type: selectedEmail.type || (selectedEmail.criado_em ? "received" : "sent") 
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full px-6" onClick={() => setSelectedEmail(null)}>
                Fechar
              </Button>
              <Button 
                className="rounded-full px-6 gap-2"
                onClick={() => {
                  const replySubject = selectedEmail?.assunto.toLowerCase().startsWith("re:") 
                    ? selectedEmail.assunto 
                    : `Re: ${selectedEmail?.assunto}`;
                  
                  setFormData({
                    ...formData,
                    destinatario: selectedEmail?.remetente || selectedEmail?.destinatario,
                    assunto: replySubject,
                    corpo: `\n\n--- Em ${format(new Date(selectedEmail.created_at || selectedEmail.criado_em), "dd/MM/yyyy HH:mm")}, ${selectedEmail.remetente} escreveu:\n\n${selectedEmail.corpo || ""}`
                  });
                  setSelectedEmail(null);
                  setIsComposeOpen(true);
                }}
              >
                <History className="h-4 w-4" /> Responder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
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
  PenBox,
  Trash2,
  MoreVertical,
  Activity,
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

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useGmail } from "@/hooks/useGmail";

const Emails = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<{ id: string; type: "sent" | "received" } | null>(null);
  const { isConnected, connectedEmail, sendEmail } = useGmail();
  const [formData, setFormData] = useState({ 
    destinatario: "", 
    assunto: "", 
    corpo: "",
    logoUrl: "https://ukwwhwytyovrzefkdeyj.supabase.co/storage/v1/object/public/email-assets/logo-email.png" 
  });

  useEffect(() => {
    const to = searchParams.get("to");
    if (to) {
      setFormData(prev => ({ ...prev, destinatario: to }));
      setIsComposeOpen(true);
    }
  }, [searchParams]);
  const queryClient = useQueryClient();

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

  const { data: emails, isLoading: isSentLoading } = useQuery({
    queryKey: ["emails", searchTerm],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from("emails")
        .select("id, user_id, destinatario, remetente, assunto, corpo, html, status, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (searchTerm) {
        query = query.or(`destinatario.ilike.%${searchTerm}%,assunto.ilike.%${searchTerm}%,corpo.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: receivedEmails, isLoading: isReceivedLoading } = useQuery({
    queryKey: ["received_emails"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("emails_recebidos")
        .select("id, lido, criado_em, user_id, data_recebimento, corpo_html, gmail_message_id, remetente, destinatarios, assunto")
        .eq("user_id", user.id)
        .order("criado_em", { ascending: false });
      
      if (error) {
        console.error("Erro ao buscar e-mails recebidos:", error);
        throw error;
      }
      
      console.log(`Query e-mails recebidos retornou ${data?.length || 0} registros para o usuário ${user.id}`);
      return data;
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { destinatario: string; assunto: string; corpo: string; logoUrl: string }) => {
      if (!isConnected) {
        throw new Error("Conecte seu Gmail nas configurações para enviar e-mails.");
      }

      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 16px; color: #333; line-height: 1.5;">
          ${data.corpo.replace(/\n/g, '<br>')}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <img src="${data.logoUrl}" alt="MD Representações" style="max-height: 50px; display: block; margin-bottom: 10px;" />
          <div style="color: #333; font-weight: bold; font-size: 16px;">${perfil?.nome || "Equipe MD"}</div>
          ${perfil?.assinatura_email ? `<div style="color: #666; font-size: 14px; margin-top: 4px;">${perfil.assinatura_email.replace(/\n/g, '<br>')}</div>` : ''}
          <div style="color: #94a3b8; font-size: 12px; margin-top: 15px;">
            MD Representações
          </div>
        </div>
      `;

      const resData = await sendEmail(data.destinatario, data.assunto, htmlBody);

      const { error: dbError } = await supabase.from("emails").insert({
        destinatario: data.destinatario,
        remetente: connectedEmail || "MD Representações",
        assunto: data.assunto,
        corpo: data.corpo,
        html: htmlBody,
        status: "sent",
        user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (dbError) throw dbError;

      return resData;
    },
    onSuccess: () => {
      toast.success(`E-mail enviado com sucesso via Gmail!`);
      setIsComposeOpen(false);
      setFormData({ 
        destinatario: "", 
        assunto: "", 
        corpo: "",
        logoUrl: "https://ukwwhwytyovrzefkdeyj.supabase.co/storage/v1/object/public/email-assets/logo-email.png"
      });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao enviar e-mail: " + (error.message || "Verifique sua conexão com o Gmail"));
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "sent" | "received" }) => {
      const table = type === "sent" ? "emails" : "emails_recebidos";
      const { error } = await supabase.from(table).delete().eq("id", id);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.destinatario || !formData.assunto || !formData.corpo) {
      toast.error("Preencha todos os campos");
      return;
    }
    sendEmailMutation.mutate(formData);
  };

  return (
    <AppLayout title="E-mail" subtitle="Interface Gmail" mainClassName="flex-1 overflow-hidden p-0">
      <Tabs defaultValue="received" className="flex flex-col h-full bg-background overflow-hidden">
        {/* Header with Search and Tab Actions */}
        <div className="px-4 py-3 flex items-center justify-between gap-4 border-b bg-background/95 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <TabsList className="bg-muted/50 p-1 h-10">
              <TabsTrigger 
                value="received" 
                className="gap-2 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Inbox className="h-4 w-4" /> 
                <span className="hidden sm:inline">Recebidos</span>
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[20px] justify-center bg-primary/10 text-primary border-none">
                  {receivedEmails?.length || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="sent" 
                className="gap-2 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Send className="h-4 w-4" /> 
                <span className="hidden sm:inline">Enviados</span>
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[20px] justify-center bg-primary/10 text-primary border-none">
                  {emails?.length || 0}
                </Badge>
              </TabsTrigger>
            </TabsList>

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
              <Button 
                variant="ghost" 
                size="icon"
                className="rounded-full hover:bg-muted shrink-0"
                onClick={() => window.location.href = '/configuracoes?tab=perfil'}
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2 border-primary/20 hover:bg-primary/5 text-primary"
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                
                const promise = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-debug`, {
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                }).then(res => res.json());

                toast.promise(promise, {
                  loading: 'Executando diagnóstico...',
                  success: (data) => {
                    return (
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-sm mb-1">Resultado do Diagnóstico:</div>
                        <p>Token: {data.tem_token ? "✅" : "❌"}</p>
                        <p>Expirado: {data.token_expirado ? "⚠️ Sim" : "✅ Não"}</p>
                        <p>Email: {data.email_conectado || "N/A"}</p>
                        <p>Status API: {data.gmail_profile_status || "N/A"}</p>
                        <p>Msgs na INBOX: {data.mensagens_encontradas}</p>
                        <p>Registros na Tabela: {data.emails_recebidos_na_tabela}</p>
                        {data.erro && <p className="text-red-500 font-bold">Erro: {data.erro}</p>}
                      </div>
                    );
                  },
                  error: 'Falha ao executar diagnóstico',
                });
              }}
            >
              <Activity className="h-4 w-4" />
              Diagnóstico
            </Button>
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
                        <Button 
                          type="button" 
                          onClick={() => window.location.href = '/configuracoes?tab=perfil'}
                          className="rounded-full px-6 bg-[#4285F4] hover:bg-[#357ae8] text-white flex gap-2 items-center"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Conectar Gmail
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
                      <div className="flex items-center gap-1 group">
                        <Label htmlFor="logo" className="text-xs text-muted-foreground cursor-pointer group-hover:text-primary transition-colors flex items-center gap-1">
                          <MoreVertical className="h-3 w-3" /> Logo
                        </Label>
                        <Input
                          id="logo"
                          className="w-32 h-7 text-[10px]"
                          placeholder="URL do logo"
                          value={formData.logoUrl}
                          onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                        />
                      </div>
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
                        className="px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer flex items-center gap-4"
                        onClick={() => setSelectedEmail({ ...email, type: "sent" })}
                      >
                        <div className="flex items-center gap-3 shrink-0">
                          <Plus className="h-4 w-4 text-muted-foreground/30 rotate-45 group-hover:text-muted-foreground" />
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
            </div>
          </TabsContent>

          <TabsContent value="received" className="m-0 h-full overflow-hidden">
            <div className="h-full overflow-hidden flex flex-col bg-background">
              <div className="flex-1 overflow-y-auto">
                {isReceivedLoading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !receivedEmails || receivedEmails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-4">
                    <Inbox className="h-16 w-16 mb-4 opacity-10" />
                    <h3 className="font-medium text-lg mb-1">Sua caixa de entrada está limpa</h3>
                    <p className="max-w-xs text-sm opacity-60">
                      E-mails recebidos na sua conta Gmail aparecerão aqui automaticamente.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {receivedEmails.map((email) => (
                      <div 
                        key={email.id} 
                        className="px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer flex items-center gap-4"
                        onClick={() => setSelectedEmail({
                          ...email,
                          destinatario: email.destinatarios?.[0] || "",
                          remetente: email.remetente,
                          corpo: "",
                          html: email.corpo_html,
                          created_at: email.criado_em,
                          type: "received"
                        })}
                      >
                        <div className="flex items-center gap-3 shrink-0">
                          <Plus className="h-4 w-4 text-muted-foreground/30 rotate-45 group-hover:text-muted-foreground" />
                          <Inbox className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground" />
                        </div>
                        <div className="min-w-[150px] max-w-[200px] truncate shrink-0">
                          <span className="text-sm font-bold text-foreground">{email.remetente}</span>
                        </div>
                        <div className="flex-1 truncate overflow-hidden">
                          <span className="text-sm font-bold text-foreground mr-2 shrink-0">{email.assunto}</span>
                          <span className="text-sm text-muted-foreground">- {email.corpo_html ? "Conteúdo HTML" : ""}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 text-xs font-bold text-foreground">
                            {email.criado_em && format(new Date(email.criado_em), "HH:mm", { locale: ptBR })}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Deseja realmente excluir este e-mail recebido?")) {
                                deleteEmailMutation.mutate({ id: email.id, type: "received" });
                              }
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

            <div className="text-base text-foreground/90 leading-relaxed min-h-[200px]">
              {selectedEmail?.html ? (
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.html }} 
                />
              ) : (
                <div className="whitespace-pre-wrap">
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
                if (confirm("Deseja realmente excluir este e-mail?")) {
                  deleteEmailMutation.mutate({ 
                    id: selectedEmail.id, 
                    type: selectedEmail.type || (selectedEmail.criado_em ? "received" : "sent") 
                  });
                }
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
                  setFormData({
                    ...formData,
                    destinatario: selectedEmail?.remetente || selectedEmail?.destinatario,
                    assunto: `Re: ${selectedEmail?.assunto}`
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
    </AppLayout>
  );
};

export default Emails;

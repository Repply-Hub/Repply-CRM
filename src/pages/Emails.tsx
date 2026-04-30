import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Settings,
  Save,
  PenBox,
  Star,
  Clock,
  Trash2,
  MoreVertical,
  Archive
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useGmail } from "@/hooks/useGmail";

const Emails = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isConnected, connectedEmail, connectGmail, disconnectGmail, sendEmail, isSending } = useGmail();
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
      let query = supabase
        .from("emails")
        .select("*")
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
      const { data, error } = await supabase
        .from("emails_recebidos")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { destinatario: string; assunto: string; corpo: string; logoUrl: string }) => {
      if (!isConnected) {
        throw new Error("Conecte seu Gmail nas configurações para enviar e-mails.");
      }

      const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background-color: #f8fafc; padding: 30px; border-bottom: 1px solid #e2e8f0; text-align: center;">
            <img src="${data.logoUrl}" alt="Logo MD Representações" style="max-height: 60px; width: auto; display: inline-block;" />
          </div>
          
          <div style="padding: 40px 30px; line-height: 1.6; font-size: 16px; color: #334155;">
            <div style="margin-bottom: 25px;">
              ${data.corpo.replace(/\n/g, '<br>')}
            </div>
          </div>
          
          <div style="background-color: #f8fafc; padding: 30px; border-top: 1px solid #e2e8f0; color: #64748b;">
            <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="vertical-align: middle;">
                  <div style="font-weight: 700; color: #0f172a; font-size: 16px; margin-bottom: 4px;">${perfil?.nome || "Equipe MD"}</div>
                  ${perfil?.assinatura_email ? `<div style="font-size: 14px; line-height: 1.5; color: #64748b; margin-bottom: 15px;">${perfil.assinatura_email.replace(/\n/g, '<br>')}</div>` : ''}
                  <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 15px;">
                    Esta é uma mensagem enviada por MD Representações.
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </div>
      `;

      // Envia via Gmail API
      const resData = await sendEmail(data.destinatario, data.assunto, htmlBody);

      // Registrar no banco de dados local
      const { error: dbError } = await supabase.from("emails").insert({
        destinatario: data.destinatario,
        remetente: connectedEmail || "MD Representações",
        assunto: data.assunto,
        corpo: data.corpo,
        html: htmlBody,
        status: "sent",
        resend_id: resData?.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (dbError) throw dbError;

      return resData;
    },
    onSuccess: (data) => {
      const messageId = data?.id || "enviado";
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.destinatario || !formData.assunto || !formData.corpo) {
      toast.error("Preencha todos os campos");
      return;
    }
    sendEmailMutation.mutate(formData);
  };

  return (
    <AppLayout title="E-mail" subtitle="Interface Gmail">
      <div className="flex flex-col h-full bg-background overflow-hidden">
        {/* Gmail Search Bar Style */}
        <div className="px-6 py-4 flex items-center justify-between border-b bg-card/30">
          <div className="relative w-full max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Pesquisar no correio"
              className="pl-12 h-12 bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/20 rounded-2xl w-full text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 ml-4">
            <Button 
              variant="ghost" 
              size="icon"
              className="rounded-full"
              onClick={() => window.location.href = '/configuracoes?tab=perfil'}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Mobile FAB for Compose */}
          <div className="md:hidden fixed bottom-6 right-6 z-50">
            <Button 
              size="icon" 
              className="h-14 w-14 rounded-2xl bg-white text-slate-700 shadow-xl border"
              onClick={() => setIsComposeOpen(true)}
            >
              <Plus className="h-8 w-8 text-red-500" />
            </Button>
          </div>

          {/* Gmail-style Sidebar */}
          <div className="w-64 flex flex-col p-3 border-r bg-card/10 hidden md:flex">
            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button className="mb-6 h-14 px-6 rounded-2xl bg-white text-slate-700 hover:bg-slate-50 shadow-md border gap-3 text-base font-medium transition-all group">
                  <Plus className="h-6 w-6 text-red-500 group-hover:scale-110 transition-transform" />
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
                      <Button type="submit" className="rounded-full px-6 bg-[#0b57d0] hover:bg-[#0842a0]" disabled={sendEmailMutation.isPending || !isConnected}>
                        {sendEmailMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        {isConnected ? "Enviar" : "Conectar Gmail"}
                      </Button>
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

            <Tabs defaultValue="sent" className="w-full flex flex-col md:flex-row h-full">
              {/* Mobile Tab List */}
              <div className="md:hidden px-4 py-2 border-b bg-muted/20">
                <TabsList className="w-full bg-transparent p-0 flex gap-2">
                  <TabsTrigger 
                    value="received" 
                    className="flex-1 gap-2 rounded-full data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#041e49]"
                  >
                    <Inbox className="h-4 w-4" /> Recebidos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="sent" 
                    className="flex-1 gap-2 rounded-full data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#041e49]"
                  >
                    <Send className="h-4 w-4" /> Enviados
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsList className="hidden md:flex flex-col h-auto bg-transparent border-none p-0 gap-1 w-64 shrink-0">
                <TabsTrigger 
                  value="received" 
                  className="w-full justify-start gap-4 px-6 py-2 rounded-r-full data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#041e49] border-none text-sm font-normal"
                >
                  <Inbox className="h-5 w-5" /> 
                  <span className="flex-1 text-left">Recebidos</span>
                  <span className="text-xs font-semibold">{receivedEmails?.length || 0}</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="sent" 
                  className="w-full justify-start gap-4 px-6 py-2 rounded-r-full data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#041e49] border-none text-sm font-normal"
                >
                  <Send className="h-5 w-5" /> 
                  <span className="flex-1 text-left">Enviados</span>
                  <span className="text-xs font-semibold">{emails?.length || 0}</span>
                </TabsTrigger>
                <div className="px-6 py-2 text-sm text-muted-foreground mt-4 flex items-center gap-4 cursor-not-allowed opacity-50">
                  <Star className="h-5 w-5" /> Estrelas
                </div>
                <div className="px-6 py-2 text-sm text-muted-foreground flex items-center gap-4 cursor-not-allowed opacity-50">
                  <Clock className="h-5 w-5" /> Adiados
                </div>
                <div className="px-6 py-2 text-sm text-muted-foreground flex items-center gap-4 cursor-not-allowed opacity-50">
                  <Archive className="h-5 w-5" /> Arquivados
                </div>
              </TabsList>

              {/* Main Content Area */}
              <div className="flex-1 overflow-hidden flex flex-col md:ml-4 mt-4 md:mt-0">
                <TabsContent value="sent" className="m-0 h-full overflow-hidden">
                  <div className="bg-white rounded-2xl border shadow-sm h-full overflow-hidden flex flex-col">
                    <div className="p-3 border-b flex items-center gap-4">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><Plus className="h-4 w-4 rotate-45" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><MoreVertical className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {isSentLoading ? (
                        <div className="flex justify-center py-20">
                          <Loader2 className="h-8 w-8 animate-spin text-[#0b57d0]" />
                        </div>
                      ) : !emails || emails.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                          <Mail className="h-16 w-16 mb-4 opacity-10" />
                          <p className="text-lg">Nenhum e-mail enviado</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {emails.map((email) => (
                            <div 
                              key={email.id} 
                              className="px-4 py-3 hover:bg-slate-50 transition-colors group cursor-pointer flex items-center gap-4 border-l-4 border-transparent hover:border-l-primary/30"
                              onClick={() => setSelectedEmail(email)}
                            >
                              <div className="flex items-center gap-3 shrink-0">
                                <Plus className="h-4 w-4 text-slate-300 rotate-45" />
                                <Star className="h-4 w-4 text-slate-300" />
                              </div>
                              <div className="min-w-[150px] max-w-[200px] truncate">
                                <span className="font-semibold text-sm">Para: {email.destinatario}</span>
                              </div>
                              <div className="flex-1 truncate">
                                <span className="font-semibold text-sm mr-2">{email.assunto}</span>
                                <span className="text-sm text-muted-foreground">- {email.corpo}</span>
                              </div>
                              <div className="shrink-0 text-xs font-semibold text-slate-500">
                                {format(new Date(email.created_at), "dd 'de' MMM", { locale: ptBR })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="received" className="m-0 h-full overflow-hidden">
                  <div className="bg-white rounded-2xl border shadow-sm h-full overflow-hidden flex flex-col">
                    <div className="p-3 border-b flex items-center gap-4">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><Plus className="h-4 w-4 rotate-45" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><MoreVertical className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {isReceivedLoading ? (
                        <div className="flex justify-center py-20">
                          <Loader2 className="h-8 w-8 animate-spin text-[#0b57d0]" />
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
                        <div className="divide-y divide-slate-100">
                          {receivedEmails.map((email) => (
                            <div 
                              key={email.id} 
                              className="px-4 py-3 hover:bg-slate-50 transition-colors group cursor-pointer flex items-center gap-4 border-l-4 border-transparent hover:border-l-blue-500"
                              onClick={() => setSelectedEmail({
                                ...email,
                                destinatario: email.destinatarios?.[0] || "",
                                remetente: email.remetente,
                                corpo: "",
                                html: email.corpo_html,
                                created_at: email.criado_em
                              })}
                            >
                              <div className="flex items-center gap-3 shrink-0">
                                <Plus className="h-4 w-4 text-slate-300 rotate-45" />
                                <Star className="h-4 w-4 text-slate-300" />
                              </div>
                              <div className="min-w-[150px] max-w-[200px] truncate">
                                <span className="font-bold text-sm">{email.remetente}</span>
                              </div>
                              <div className="flex-1 truncate">
                                <span className="font-bold text-sm mr-2">{email.assunto}</span>
                                <span className="text-sm text-muted-foreground">- {email.corpo_html ? "Conteúdo HTML" : ""}</span>
                              </div>
                              <div className="shrink-0 text-xs font-bold text-slate-900">
                                {email.criado_em && format(new Date(email.criado_em), "HH:mm", { locale: ptBR })}
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
          </div>
        </div>

        <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-2xl">
            <div className="p-6 overflow-y-auto">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-normal text-slate-900 mb-6">{selectedEmail?.assunto}</h2>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold uppercase">
                      {(selectedEmail?.remetente || selectedEmail?.destinatario || "?")[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{selectedEmail?.remetente || "Eu"}</span>
                        <span className="text-xs text-muted-foreground">&lt;{selectedEmail?.remetente || connectedEmail}&gt;</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        para {selectedEmail?.destinatario}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedEmail && format(new Date(selectedEmail.created_at), "dd 'de' MMM. 'de' yyyy, HH:mm", { locale: ptBR })}
                </div>
              </div>

              <div className="text-base text-slate-800 leading-relaxed min-h-[200px]">
                {selectedEmail?.html ? (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.html }} 
                  />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {selectedEmail?.corpo}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t bg-muted/5 flex justify-end gap-2">
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
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Emails;

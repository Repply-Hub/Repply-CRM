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
  Save
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

const Emails = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [formData, setFormData] = useState({ destinatario: "", assunto: "", corpo: "" });
  const [settingsData, setSettingsData] = useState({ resend_api_key: "", resend_from_email: "" });
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

  const { data: userIntegration } = useQuery({
    queryKey: ["user_integration"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (data) {
        setSettingsData({
          resend_api_key: data.resend_api_key || "",
          resend_from_email: data.resend_from_email || "",
        });
      }
      return data;
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsData) => {
      if (!data.resend_api_key.startsWith("re_")) {
        throw new Error("A chave de API deve começar com 're_'");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("user_integrations")
        .upsert({
          user_id: user.id,
          resend_api_key: data.resend_api_key,
          resend_from_email: data.resend_from_email,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      setIsSettingsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["user_integration"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar configurações: " + error.message);
    },
  });

  const { data: emails, isLoading } = useQuery({
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

  const sendEmailMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // 1. Chamar a Edge Function para enviar via Resend
      const { data: resData, error: resError } = await supabase.functions.invoke("send-email", {
        body: {
          to: [data.destinatario],
          subject: data.assunto,
          from: "MD Representações <contato@mdrepresentacoes.com.br>", // Endereço verificado no Resend
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <div style="margin-bottom: 20px;">
                ${data.corpo.replace(/\n/g, '<br>')}
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0; font-weight: bold;">${perfil?.nome || "Equipe MD"}</p>
                ${perfil?.assinatura_email ? `<p style="margin: 5px 0 15px 0; color: #666; font-size: 14px;">${perfil.assinatura_email.replace(/\n/g, '<br>')}</p>` : ''}
                <img src="https://ukwwhwytyovrzefkdeyj.supabase.co/storage/v1/object/public/email-assets/logo-email.png" alt="MD Representações" style="height: 40px;" />
              </div>
            </div>
          `,
        },
      });

      if (resError) throw resError;

      // 2. Registrar no banco de dados local
      const { error: dbError } = await supabase.from("emails").insert({
        destinatario: data.destinatario,
        remetente: "contato@mdrepresentacoes.com.br",
        assunto: data.assunto,
        corpo: data.corpo,
        html: `
          <div style="font-family: sans-serif;">
            ${data.corpo.replace(/\n/g, '<br>')}
            <br><br>
            --<br>
            <strong>${perfil?.nome || "Equipe MD"}</strong><br>
            ${perfil?.assinatura_email || ""}
          </div>
        `,
        status: "sent",
        resend_id: resData?.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (dbError) throw dbError;
      return resData;
    },
    onSuccess: () => {
      toast.success("E-mail enviado com sucesso!");
      setIsComposeOpen(false);
      setFormData({ destinatario: "", assunto: "", corpo: "" });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao enviar e-mail: " + (error.message || "Verifique sua chave do Resend"));
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
    <AppLayout title="E-mails" subtitle="Gerencie suas comunicações por e-mail">
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar e-mails..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Settings className="h-4 w-4" /> Configurações
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Configurações de E-mail</DialogTitle>
                  <DialogDescription>
                    Configure sua integração pessoal com o Resend.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="api_key">Resend API Key</Label>
                    <Input
                      id="api_key"
                      type="password"
                      placeholder="re_..."
                      value={settingsData.resend_api_key}
                      onChange={(e) => setSettingsData({ ...settingsData, resend_api_key: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">Sua chave começa com "re_"</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="from_email">E-mail do Remetente</Label>
                    <Input
                      id="from_email"
                      placeholder="seu@dominio.com"
                      value={settingsData.resend_from_email}
                      onChange={(e) => setSettingsData({ ...settingsData, resend_from_email: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">Deve ser um domínio verificado no seu painel do Resend.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={() => updateSettingsMutation.mutate(settingsData)}
                    disabled={updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Configurações
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Novo E-mail
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Escrever E-mail</DialogTitle>
                <DialogDescription>
                  Envie uma mensagem via Resend.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="to">Destinatário</Label>
                  <Input
                    id="to"
                    placeholder="email@exemplo.com"
                    value={formData.destinatario}
                    onChange={(e) => setFormData({ ...formData, destinatario: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto</Label>
                  <Input
                    id="subject"
                    placeholder="Assunto da mensagem"
                    value={formData.assunto}
                    onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Mensagem</Label>
                  <Textarea
                    id="body"
                    placeholder="Escreva sua mensagem aqui..."
                    className="min-h-[200px]"
                    value={formData.corpo}
                    onChange={(e) => setFormData({ ...formData, corpo: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsComposeOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={sendEmailMutation.isPending}>
                    {sendEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Enviar E-mail
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="sent">
          <TabsList className="mb-4">
            <TabsTrigger value="sent" className="gap-2">
              <History className="h-4 w-4" /> Enviados
            </TabsTrigger>
            <TabsTrigger value="received" className="gap-2">
              <Inbox className="h-4 w-4" /> Recebidos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sent">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !emails || emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Mail className="h-12 w-12 mb-4 opacity-20" />
                    <p>Nenhum e-mail encontrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {emails.map((email) => (
                      <div key={email.id} className="p-4 hover:bg-muted/30 transition-colors group">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Para: {email.destinatario}</span>
                            <Badge variant="outline" className="text-[10px] h-5">
                              {email.status === 'sent' ? (
                                <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                              ) : (
                                <AlertCircle className="h-3 w-3 mr-1 text-amber-500" />
                              )}
                              {email.status === 'sent' ? 'Enviado' : 'Erro'}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(email.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">
                          {email.assunto}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {email.corpo}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received">
            <Card>
              <CardContent className="p-10 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Caixa de Entrada</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  A recepção de e-mails via Webhook do Resend está sendo configurada.
                </p>
                <Button variant="outline" disabled>
                  Configurar Webhook <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Emails;

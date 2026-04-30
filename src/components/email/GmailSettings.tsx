import { useGmail } from "@/hooks/useGmail";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";

export function GmailSettings() {
  const { connectGmail, disconnectGmail, isConnected, connectedEmail, isLoading } = useGmail();

  if (isLoading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Integração de E-mail</CardTitle>
        </div>
        <CardDescription>
          Conecte sua conta do Gmail para enviar e receber e-mails diretamente pela plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {isConnected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{connectedEmail}</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 gap-1 px-2">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua conta está autorizada para enviar e-mails via Gmail API.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => disconnectGmail()}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            >
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex gap-4 items-start max-w-md">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <AlertCircle className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nenhuma conta conectada</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ao conectar, você poderá gerenciar seus e-mails de vendas sem sair do sistema. Utilizamos o protocolo seguro OAuth2 do Google.
                </p>
              </div>
            </div>
            <Button onClick={() => connectGmail()} className="shrink-0 shadow-sm">
              Conectar Gmail
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

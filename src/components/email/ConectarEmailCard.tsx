import { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertTriangle, Plug, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  useEmailEmpresa,
  ROTULO_PROVEDOR,
  type ProvedorEmail,
} from '@/hooks/use-email-empresa';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PROVEDORES: Array<{ id: ProvedorEmail; descricao: string }> = [
  { id: 'google', descricao: 'Contas @gmail.com ou domínio próprio no Google Workspace' },
  { id: 'microsoft', descricao: 'Outlook, Hotmail ou Microsoft 365 corporativo' },
  { id: 'imap', descricao: 'Locaweb, UOL Host, cPanel e outros por servidor e senha' },
];

/** Papéis que respondem pela empresa. Espelha PAPEIS_QUE_CONECTAM da Edge Function. */
const PAPEIS_GESTORES = ['admin', 'empresa', 'gestor'];

/**
 * Conexão da caixa de e-mail da empresa.
 *
 * A caixa é uma só e o time inteiro compartilha — quem conecta é o gestor. Este
 * componente é o único lugar da interface que liga e desliga a integração; a
 * decisão real de autorização é da Edge Function, a partir do JWT. Aqui só
 * decidimos se o botão aparece.
 */
export function ConectarEmailCard() {
  const { profile } = useAuth();
  const { conta, conectar, desconectar, isLoading, isConnecting, precisaReconectar } =
    useEmailEmpresa();
  const [confirmandoDesconexao, setConfirmandoDesconexao] = useState(false);

  const podeGerenciar = PAPEIS_GESTORES.includes(String(profile?.role ?? ''));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando a conexão...
      </div>
    );
  }

  // ---- conectada --------------------------------------------------------
  if (conta && !precisaReconectar) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{conta.email}</p>
            <p className="text-xs text-muted-foreground">
              {ROTULO_PROVEDOR[conta.provedor] ?? conta.provedor}
              {conta.ultima_sync_em && (
                <> · sincronizado {format(new Date(conta.ultima_sync_em), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
            Conectada
          </Badge>
          {podeGerenciar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmandoDesconexao(true)}
              className="text-muted-foreground"
            >
              <Unplug className="mr-1.5 h-4 w-4" />
              Desconectar
            </Button>
          )}
        </div>

        <AlertDialog open={confirmandoDesconexao} onOpenChange={setConfirmandoDesconexao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar {conta.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                O time deixa de enviar e receber e-mail pelo CRM, e as mensagens já
                sincronizadas saem daqui. Nada é apagado na caixa original — você pode
                reconectar quando quiser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => desconectar()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ---- precisa reconectar -----------------------------------------------
  if (conta && precisaReconectar) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Conexão expirada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {conta.ultimo_erro ??
                `O acesso a ${conta.email} foi revogado no provedor. Reconecte para voltar a enviar e receber.`}
            </p>
            {podeGerenciar && (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => conectar(conta.provedor)}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-1.5 h-4 w-4" />
                )}
                Reconectar
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- nunca conectada ---------------------------------------------------
  if (!podeGerenciar) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <Mail className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-medium text-foreground">Nenhuma caixa conectada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Peça ao gestor da empresa para conectar o e-mail nesta tela.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-center">
        <Mail className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-medium text-foreground">Conecte o e-mail da empresa</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Uma caixa só, compartilhada pelo time — todo mundo envia e responde do mesmo
          endereço, como já funciona no WhatsApp.
        </p>
      </div>

      <div className="mx-auto mt-6 grid max-w-md gap-2">
        {PROVEDORES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => conectar(p.id)}
            disabled={isConnecting}
            className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {ROTULO_PROVEDOR[p.id]}
              </span>
              <span className="block text-xs text-muted-foreground">{p.descricao}</span>
            </span>
            {isConnecting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Você será levado ao provedor para autorizar. O CRM não guarda sua senha.
      </p>
    </div>
  );
}

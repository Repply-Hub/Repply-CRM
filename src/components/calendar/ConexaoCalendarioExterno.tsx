import { CalendarClock, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConexaoCalendario } from '@/hooks/use-calendario-conexao';

/**
 * 🔴 TRAVA DE RECURSO — a sincronização com o Google só fica ATIVA quando a Fase 1 estiver
 * completa em produção: migration `calendario_contas` aplicada, funções de servidor
 * (`calendario-conectar`/`calendario-sincronizar`) implantadas e app aprovado no Google.
 * Enquanto `false`, a agenda NÃO mostra este bloco (o gate está no ponto de uso, em Calendario.tsx),
 * senão o vendedor veria um "Conectar meu Google" que dá erro (a tabela e a função ainda não
 * existem em produção). Virar para `true` numa linha quando a Fase 1 estiver de pé.
 */
export const SINCRONIZACAO_CALENDARIO_ATIVA = false;

/** Bloco de conectar/desconectar o calendário externo, na barra lateral da agenda. */
export function ConexaoCalendarioExterno() {
  const { conexao, carregando, iniciarGoogle, desconectar, desconectando } = useConexaoCalendario();
  if (carregando) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> Calendário do celular
      </div>
      {!conexao || conexao.status === 'desconectada' ? (
        <>
          <p className="text-xs text-muted-foreground">
            Ligue seu Google para ver seus compromissos do Repply no celular — e mudanças voltam para cá.
          </p>
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => iniciarGoogle()}>
            <Link2 className="h-4 w-4" /> Conectar meu Google
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Conectado{conexao.contaEmail ? ` como ${conexao.contaEmail}` : ''}.
          </p>
          {conexao.status === 'erro' && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> A conexão caiu — reconecte para voltar a sincronizar.
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="w-full gap-1.5 text-muted-foreground"
            disabled={desconectando}
            onClick={() => desconectar()}
          >
            <Unlink className="h-4 w-4" /> Desconectar
          </Button>
        </>
      )}
    </div>
  );
}

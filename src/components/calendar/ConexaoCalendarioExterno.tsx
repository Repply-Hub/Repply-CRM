import { CalendarClock, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConexaoCalendario } from '@/hooks/use-calendario-conexao';

/**
 * 🔴 TRAVA DE RECURSO da Fase 1 (sincronização com o Google). Dois estágios:
 *
 * - Enquanto o app do Google está em "Teste" (só testadores conectam, até a verificação do Google
 *   — que leva semanas), este bloco aparece SÓ para quem já tem uma linha em `calendario_contas`.
 *   Os testadores recebem uma linha "desconectada" PRÉ-CRIADA no banco; os demais não veem nada.
 *   🔴 Os e-mails/ids dos testadores ficam SÓ no banco, nunca aqui — o repositório é público
 *   (CLAUDE.md §6.9), então o portão é por presença de linha, não por lista de e-mail no código.
 * - ABERTO A TODOS desde 24/09/2026: o Google confirmou que o escopo `calendar.app.created` é NÃO
 *   sensível ("A verificação não é necessária"), sem tela de "app não verificado" nem teto de 100
 *   usuários. Com `true`, o bloco aparece para todos os vendedores (a presença de linha deixa de ser
 *   o portão). Para dormentar de novo em alguma emergência, é só voltar para `false`.
 */
export const SINCRONIZACAO_CALENDARIO_ATIVA = true;

/** Bloco de conectar/desconectar o calendário externo, na barra lateral da agenda. */
export function ConexaoCalendarioExterno() {
  const { conexao, carregando, iniciarGoogle, desconectar, desconectando } = useConexaoCalendario();
  if (carregando) return null;
  // Dormente: sem o recurso aberto a todos E sem linha pré-criada (não é testador) → não mostra nada.
  if (!SINCRONIZACAO_CALENDARIO_ATIVA && !conexao) return null;

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

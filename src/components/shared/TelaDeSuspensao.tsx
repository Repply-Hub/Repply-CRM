import { AlertOctagon, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useEstadoDeCobranca } from '@/hooks/use-estado-de-cobranca';
import { podeGerenciarAssinatura } from '@/lib/plano-gate';

/**
 * O degrau do dia 30: o acesso é suspenso e uma tela cobre o app, com o fundo desfocado.
 *
 * 🔴 POR QUE COBRIR E NÃO EXPULSAR. Até 30/08/2026 o sistema mandava quem estava bloqueado
 * para uma página separada, sem volta a não ser sair da conta. O desenho aprovado pede outra
 * coisa: o app CONTINUA ATRÁS, desfocado. A diferença não é estética — ver a própria carteira
 * ali, borrada e fora de alcance, é o que faz pagar. Uma página em branco só faz esquecer.
 *
 * 🔴 E O QUE ELA PROMETE É VERDADE. "Seus dados não foram apagados" precisa ser literal, e é:
 * nada é removido antes do dia 90, e mesmo lá é a equipe que decide, não um relógio. Se um
 * dia a exclusão virar automática, esta frase tem de mudar junto.
 */

/** "12 dias" / "1 dia" — sem inventar precisão que não temos. */
function emDias(quantos: number): string {
  return quantos === 1 ? '1 dia' : `${quantos} dias`;
}

export function TelaDeSuspensao() {
  const { profile, session, signOut } = useAuth();
  const cobranca = useEstadoDeCobranca();
  const encerrada = cobranca.encerrada;

  /**
   * 🔴 CONTA ENCERRADA TEM TEXTO PRÓPRIO, e NEUTRO.
   *
   * O botão de excluir vai ser usado em empresas de três origens, e só uma delas chegou lá
   * por falta de pagamento. Mostrar a tela de cobrança para uma CORTESIA encerrada inventaria
   * um problema de pagamento que nunca existiu — e o cliente ligaria perguntando qual fatura
   * deixou de pagar.
   *
   * E ela NÃO diz "seus dados serão apagados em 60 dias": esse prazo é informação nossa, de
   * controle interno. Para quem está do outro lado, ele só serviria para assustar sobre algo
   * que a pessoa não pode resolver sozinha.
   */
  if (encerrada) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-encerrada"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
      >
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-xl sm:p-8">
          <h2 id="titulo-encerrada" className="text-lg font-semibold text-foreground">
            Esta conta foi encerrada
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O acesso ao sistema não está mais disponível. Se isso não era esperado, fale com o
            suporte.
          </p>
          <Button
            variant="ghost"
            onClick={() => signOut?.()}
            className="mt-5 text-muted-foreground"
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    );
  }

  // Suspensão é do dia 30 em diante. Vem do mesmo estado fresco, e não do perfil guardado.
  const noPrazoFinal = cobranca.degrau === 'prazo_esgotado';
  if (cobranca.degrau !== 'suspensa' && !noPrazoFinal) return null;

  const dias = cobranca.diasInadimplencia ?? 0;
  const podeResolver = podeGerenciarAssinatura(profile, session);
  const restam = Math.max(0, 90 - dias);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-suspensao"
      // `fixed inset-0` cobre a janela inteira; o desfoque deixa o app visível por trás.
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-5 flex items-start gap-3">
          <AlertOctagon className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
          <div>
            <h2 id="titulo-suspensao" className="text-lg font-semibold text-foreground">
              {noPrazoFinal ? 'O prazo para regularizar terminou' : 'Seu acesso está suspenso'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Foram {emDias(dias)} desde que o pagamento parou de passar, com avisos por e-mail
              nesse período.
            </p>
          </div>
        </div>

        {/* 🔴 A FRASE MAIS IMPORTANTE DA TELA, e por isso ela tem destaque próprio. Quem vê o
            sistema bloqueado presume que perdeu tudo — e é esse presumido que faz a pessoa
            desistir em vez de resolver. */}
        <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">Seus dados não foram apagados.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {noPrazoFinal
              ? 'Tudo continua guardado, mas a conta já pode ser encerrada a qualquer momento pela nossa equipe. Se quiser manter, fale com a gente hoje.'
              : `Clientes, obras, negócios e conversas continuam exatamente como estavam. Você tem ${emDias(
                  restam,
                )} para regularizar e recuperar o acesso.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {podeResolver ? (
            <Button asChild>
              <Link to="/configuracoes?tab=pagamentos">Regularizar pagamento</Link>
            </Button>
          ) : (
            // Quem não responde pela assinatura não recebe um botão que vai recusá-lo — recebe
            // a única coisa que resolve o problema dele.
            <p className="flex-1 text-sm text-muted-foreground">
              Fale com o gestor da sua empresa para regularizar.
            </p>
          )}

          {/* Sair sempre tem de existir: esta tela cobre o app inteiro, e sem saída ela seria
              um beco sem fim para quem entrou na conta errada. */}
          <Button variant="ghost" onClick={() => signOut?.()} className="text-muted-foreground">
            <LogOut className="mr-1.5 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

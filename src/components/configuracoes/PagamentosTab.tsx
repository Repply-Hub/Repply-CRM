import { useState } from 'react';
import { CreditCard, ExternalLink, Gift, Loader2, Receipt, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useAssinatura } from '@/hooks/use-assinatura';
import { usePlanos } from '@/hooks/use-planos';
import { extrairAssinatura, situacaoDoMeuPlano } from '@/lib/plano-gate';
import { ROTULO_SITUACAO, diasDeTrial, type SituacaoCS } from '@/lib/situacao-empresa';
import { formatarMoedaBRL } from '@/lib/moeda';
import { CancelarAssinaturaDialog } from './CancelarAssinaturaDialog';

/**
 * A aba Pagamentos: onde o dono da empresa resolve tudo que envolve dinheiro com a Repply.
 *
 * 🔴 ELA EXISTE PORQUE O CAMINHO ESTAVA ATRÁS DA PORTA ERRADA. Até 30/08/2026, faturas,
 * troca de cartão e cancelamento só eram alcançáveis pela tela `/assinar` — que abre apenas
 * para quem JÁ está bloqueado. Cliente em dia querendo ver a última fatura, ou trocar o
 * cartão que vai vencer, não tinha caminho nenhum.
 *
 * 🔴 O QUE É NOSSO E O QUE É DO STRIPE. Nossa tela responde "qual plano, quanto, quando
 * renova, e qual a minha situação". Fatura, recibo, cartão e o cancelamento em si ficam no
 * portal do Stripe — mecânica de dinheiro que ele já resolve em português, sempre em dia, e
 * sem a gente nunca tocar em número de cartão. Refazer aqui significaria manter uma cópia
 * sincronizada de algo que não é nosso, e é aí que esse tipo de tela começa a mentir.
 */

/** O que a tela diz e oferece em cada situação. Seis, não duas. */
const TEXTO: Record<SituacaoCS, { titulo: string; explica: string }> = {
  pagante: {
    titulo: 'Assinatura ativa',
    explica: 'Tudo certo por aqui. Abaixo você vê e gerencia sua cobrança.',
  },
  trial: {
    titulo: 'Período de teste',
    explica: 'Você está usando o sistema completo. Assine para não perder o acesso.',
  },
  trial_vencido: {
    titulo: 'Seu teste terminou',
    explica:
      'O acesso ficou somente leitura: você continua vendo e exportando tudo, mas não consegue criar nem editar. Assine para voltar a usar.',
  },
  cortesia: {
    titulo: 'Acesso por cortesia',
    explica:
      'Sem cobrança. Este acesso foi combinado direto com a equipe Repply — qualquer dúvida, fale com a gente.',
  },
  nunca_pagou: {
    titulo: 'Assinatura ainda não ativa',
    explica:
      'Você continua vendo e exportando tudo, mas criar e editar ficam indisponíveis até a assinatura começar.',
  },
  bloqueada: {
    titulo: 'Pagamento pendente',
    explica:
      'O acesso ficou somente leitura: você continua vendo e exportando tudo, mas não consegue criar nem editar até regularizar.',
  },
};

const COR_SELO: Record<SituacaoCS, string> = {
  pagante: 'border-success/40 text-success',
  trial: 'border-primary/40 text-primary',
  trial_vencido: 'border-warning/50 text-warning',
  cortesia: 'border-violet-500/40 text-violet-600',
  nunca_pagou: 'border-warning/50 text-warning',
  bloqueada: 'border-destructive/40 text-destructive',
};

/** "15 de março de 2027" — a data por extenso, que é como se lê uma renovação. */
function porExtenso(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto.trim()) return null;
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function PagamentosTab() {
  const { profile } = useAuth();
  const { planos } = usePlanos();
  const { assinar, abrirPortal, processando } = useAssinatura();
  const [cancelando, setCancelando] = useState(false);

  const situacao = situacaoDoMeuPlano(profile);
  const assinatura = extrairAssinatura(profile);

  // Sem assinatura no perfil não dá para afirmar nada. Acontece no plano B da consulta de
  // perfil (sem o embed) — e chutar um estado aqui seria pior que não dizer nada.
  if (!situacao) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar os dados da sua assinatura. Recarregue a página.
        </CardContent>
      </Card>
    );
  }

  const { titulo, explica } = TEXTO[situacao];
  const renovaEm = porExtenso(assinatura?.current_period_end);
  const diasRestantes = diasDeTrial({
    plan_status: typeof assinatura?.plan_status === 'string' ? assinatura.plan_status : null,
    origem: null,
    current_period_end:
      typeof assinatura?.current_period_end === 'string' ? assinatura.current_period_end : null,
    tem_customer_stripe: false,
  });

  // Cortesia não tem o que cancelar nem o que gerenciar: não existe assinatura por trás.
  // Mostrar os botões daria a ela um caminho que termina em erro do Stripe.
  const temCobranca = situacao === 'pagante';
  const podeAssinar = situacao !== 'pagante' && situacao !== 'cortesia';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">{titulo}</CardTitle>
            <Badge variant="outline" className={COR_SELO[situacao]}>
              {ROTULO_SITUACAO[situacao]}
            </Badge>
            {situacao === 'trial' && diasRestantes !== null && diasRestantes > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                {diasRestantes} {diasRestantes === 1 ? 'dia restante' : 'dias restantes'}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="max-w-[65ch] text-sm text-muted-foreground">{explica}</p>

          {temCobranca && renovaEm && (
            <p className="text-sm">
              <span className="text-muted-foreground">Renova em </span>
              <span className="font-medium">{renovaEm}</span>
            </p>
          )}

          {temCobranca && (
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Um botão só para as três coisas do Stripe: é uma página só, e prometer
                  três destinos diferentes que levam ao mesmo lugar seria mentira de tela. */}
              <Button
                variant="outline"
                size="sm"
                onClick={abrirPortal}
                disabled={processando !== null}
              >
                {processando === 'portal' ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Receipt className="mr-1.5 h-4 w-4" />
                )}
                Faturas e forma de pagamento
                <ExternalLink className="ml-1.5 h-3 w-3 opacity-60" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setCancelando(true)}
                disabled={processando !== null}
              >
                Cancelar assinatura
              </Button>
            </div>
          )}

          {situacao === 'cortesia' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4 shrink-0 text-violet-600" />
              Não há cobrança nem assinatura para gerenciar.
            </p>
          )}
        </CardContent>
      </Card>

      {podeAssinar && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {planos.length === 1 ? 'Plano disponível' : 'Planos disponíveis'}
          </h3>

          {/* A grade se ajusta sozinha ao número de planos. Hoje há um; quando houver o
              segundo, é uma linha nova no banco — a tela não precisa mudar. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {planos.map((plano) => (
              <Card key={plano.slug} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{plano.nome}</CardTitle>
                    {plano.selo && (
                      <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">
                        {plano.selo}
                      </Badge>
                    )}
                  </div>
                  <p className="pt-1">
                    <span className="font-mono text-xl font-bold tabular-nums">
                      {formatarMoedaBRL(plano.preco)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plano.intervalo === 'month' ? ' / mês' : ' / ano'}
                    </span>
                  </p>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  {plano.beneficios.length > 0 && (
                    <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
                      {plano.beneficios.map((beneficio) => (
                        <li key={beneficio} className="flex gap-2">
                          <span aria-hidden className="text-primary">
                            •
                          </span>
                          {beneficio}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => assinar(plano.slug)}
                    disabled={processando !== null}
                  >
                    {processando === 'checkout' ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-1.5 h-4 w-4" />
                    )}
                    Assinar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <CancelarAssinaturaDialog
        aberto={cancelando}
        onOpenChange={setCancelando}
        aoConfirmar={abrirPortal}
      />
    </div>
  );
}

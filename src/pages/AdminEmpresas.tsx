import { useMemo, useState } from 'react';
import { ExcluirEmpresaDialog } from '@/components/admin/ExcluirEmpresaDialog';
import {
  useExcluirEmpresa,
  useNumerosDaEmpresa,
  useRestaurarEmpresa,
} from '@/hooks/use-exclusao-empresa';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Ban, Building2, CalendarPlus, ChevronDown, ChevronRight, Clock, CreditCard, Gift, Loader2, Mail, MessageSquare, RefreshCw, RotateCcw, Search, Timer, Trash2, TrendingUp, Unlock, Users } from 'lucide-react';
import {
  useEmpresasCS, useUsuariosDaEmpresa, useDefinirPlano,
  situacaoDaEmpresa, diasDeTrial,
  situacaoNoPainel, ROTULO_NO_PAINEL,
  type EmpresaCS, type SituacaoCS, type SituacaoNoPainel, type AcaoPlano,
} from '@/hooks/use-admin-cs';

/** "há 3 dias" em vez de uma data — é assim que se lê risco de churn. */
function desde(iso: string | null): { texto: string; dias: number | null } {
  if (!iso) return { texto: 'nunca entrou', dias: null };
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return { texto: 'hoje', dias: 0 };
  if (dias === 1) return { texto: 'ontem', dias: 1 };
  if (dias < 30) return { texto: `há ${dias} dias`, dias };
  const meses = Math.floor(dias / 30);
  return { texto: `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`, dias };
}

/** Data curta. O ano so aparece quando nao e o corrente — reduz ruido na linha. */
function data(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mesmoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('pt-BR', mesmoAno
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: '2-digit' });
}

const COR_SITUACAO: Record<SituacaoNoPainel, string> = {
  pagante: 'border-emerald-500/40 text-emerald-600',
  trial: 'border-blue-500/40 text-blue-600',
  trial_vencido: 'border-amber-500/40 text-amber-600',
  cortesia: 'border-violet-500/40 text-violet-600',
  nunca_pagou: 'border-amber-500/40 text-amber-600',
  bloqueada: 'border-destructive/40 text-destructive',
  // 🔴 As situações OPERACIONAIS têm peso visual maior que as comerciais, de propósito: são
  // estados em que alguém do outro lado está sem conseguir trabalhar agora.
  excluida: 'border-destructive bg-destructive/10 text-destructive',
  bloqueada_admin: 'border-destructive/60 text-destructive',
  tolerancia: 'border-amber-500/40 text-amber-600',
  somente_leitura: 'border-amber-500/60 text-amber-700',
  suspensa: 'border-destructive/60 text-destructive',
  prazo_esgotado: 'border-destructive bg-destructive/10 text-destructive',
};

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className={`mt-1 text-2xl font-bold ${destaque && valor > 0 ? 'text-amber-600' : 'text-foreground'}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

function LinhaUso({ icone: Icone, valor, rotulo }: { icone: typeof TrendingUp; valor: number; rotulo: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`${valor} ${rotulo} em 30 dias`}>
      <Icone className="h-3.5 w-3.5" />
      {valor.toLocaleString('pt-BR')}
    </span>
  );
}

function CardEmpresa({ empresa }: { empresa: EmpresaCS }) {
  const [aberto, setAberto] = useState(false);
  // 'restaurar' não é ação de plano — desfaz a exclusão, por outro caminho no banco. Vive
  // na mesma confirmação porque, para quem clica, é a mesma família de gesto.
  const [confirmar, setConfirmar] = useState<AcaoPlano | 'restaurar' | null>(null);
  const { data: usuarios, isLoading: carregandoUsuarios } = useUsuariosDaEmpresa(aberto ? empresa.empresa_id : null);
  const definirPlano = useDefinirPlano();

  const [excluindo, setExcluindo] = useState(false);
  const excluir = useExcluirEmpresa();
  const restaurar = useRestaurarEmpresa();
  // Só conta quando a confirmação abre: são cinco somas pesadas (11.910 negócios na MD), e
  // fazê-las para as 10 empresas ao abrir a tela seria caro por nada.
  const { data: numeros } = useNumerosDaEmpresa(excluindo ? empresa.empresa_id : null);

  // 🔴 A OPERACIONAL, não a comercial. `situacaoDaEmpresa` responde "essa empresa paga ou
  // ganhou de graça?"; esta responde "o que está acontecendo com ela agora?". Uma empresa
  // excluída continua sendo, comercialmente, uma cortesia — e era isso que o painel escrevia.
  const situacao = situacaoNoPainel(empresa);
  const excluida = !!empresa.excluida_em;
  const bloqueadaPeloAdmin = situacao === 'bloqueada_admin';
  const dias = diasDeTrial(empresa);
  const acesso = desde(empresa.ultimo_acesso);
  // 14 dias sem ninguém entrar é o limiar que separa "operando" de "esfriando".
  const frio = acesso.dias !== null && acesso.dias >= 14;

  const CONFIRMACAO: Record<AcaoPlano | 'restaurar', { titulo: string; texto: string }> = {
    trial: {
      titulo: `Liberar 7 dias para ${empresa.nome}?`,
      texto: 'A empresa volta a escrever imediatamente e o acesso expira sozinho ao fim do prazo. Nenhuma cobrança é criada no Stripe.',
    },
    cortesia: {
      titulo: `Liberar cortesia para ${empresa.nome}?`,
      texto: 'Acesso liberado por tempo indeterminado, sem passar pelo Stripe e sem cobrança. Use para parceiros e casos combinados.',
    },
    bloquear: {
      titulo: `Bloquear ${empresa.nome}?`,
      texto: 'A empresa para de criar e editar dados, mas continua vendo tudo que já tem — nada é apagado. Reversível a qualquer momento.',
    },
    // 🔴 "Volta a ser o que era" é literal, e é por isso que este botão existe separado.
    // Desbloquear dando cortesia transformaria um cliente PAGANTE em cliente de graça, em
    // silêncio — o sistema guarda o estado no momento do bloqueio justamente para não ter
    // de adivinhar aqui.
    desbloquear: {
      titulo: `Desbloquear ${empresa.nome}?`,
      texto: 'A empresa volta exatamente ao plano que tinha antes do bloqueio — pagante, cortesia ou teste, o que fosse. Nada é cobrado nem criado no Stripe.',
    },
    restaurar: {
      titulo: `Restaurar ${empresa.nome}?`,
      texto: empresa.tem_assinatura_stripe
        ? 'Todo mundo da empresa volta a entrar e os dados voltam como estavam. A assinatura, não: ela foi cancelada no dia da exclusão e precisa ser refeita pelo cliente.'
        : 'Todo mundo da empresa volta a entrar e os dados voltam exatamente como estavam, no mesmo plano de antes.',
    },
  };

  return (
    <Card className={frio ? 'border-amber-500/30' : undefined}>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <button
            onClick={() => setAberto((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {aberto ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary">
              {(empresa.nome ?? '?')[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{empresa.nome ?? '(sem nome)'}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1" title="Data de cadastro da empresa">
                  <CalendarPlus className="h-3 w-3" />
                  entrou {data(empresa.criada_em)}
                </span>
                <span>·</span>
                {/* "Pagou" só quando existe assinatura no Stripe por trás. As
                    empresas legacy têm `ativado_em` preenchido com o instante em
                    que a migration de grandfathering rodou — exibir aquilo como
                    pagamento seria inventar receita que não houve. */}
                {empresa.tem_assinatura_stripe && empresa.ativado_em ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600" title="Data do primeiro pagamento confirmado">
                    <CreditCard className="h-3 w-3" />
                    pagou {data(empresa.ativado_em)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1" title="Nunca houve cobrança confirmada">
                    <CreditCard className="h-3 w-3" />
                    nunca pagou
                  </span>
                )}
                <span>·</span>
                <span className="inline-flex items-center gap-1" title="Login mais recente de qualquer pessoa da empresa">
                  <Clock className="h-3 w-3" />
                  {acesso.texto}
                </span>
                <span>·</span>
                <span>
                  {empresa.usuarios_ativos_7d}/{empresa.usuarios}{' '}
                  {empresa.usuarios === 1 ? 'usuário ativo' : 'usuários ativos'}
                </span>
              </p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              <LinhaUso icone={TrendingUp} valor={empresa.negocios_30d} rotulo="negócios" />
              <LinhaUso icone={MessageSquare} valor={empresa.wa_msgs_30d} rotulo="mensagens" />
              <LinhaUso icone={Mail} valor={empresa.emails_30d} rotulo="e-mails" />
            </div>
            <Badge variant="outline" className={COR_SITUACAO[situacao]}>
              {ROTULO_NO_PAINEL[situacao]}
            </Badge>
          </div>
        </div>

        {aberto && (
          <div className="border-t bg-muted/20 p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              {/* 🔴 EMPRESA EXCLUÍDA TEM UMA AÇÃO SÓ, e não é economia de tela. Liberar
                  cortesia para quem está excluído não devolve nada: `empresa_plano_ativo()`
                  confere a exclusão ANTES do plano e recusa de qualquer jeito. Deixar os
                  outros botões ali seria oferecer cliques que não fazem nada visível. */}
              {excluida ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => setConfirmar('restaurar')}
                    disabled={restaurar.isPending}
                  >
                    {restaurar.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                    )}
                    Restaurar empresa
                  </Button>
                  <span className="self-center text-xs text-muted-foreground">
                    Excluída {data(empresa.excluida_em)} — ninguém dela consegue entrar. Os
                    dados continuam guardados.
                  </span>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setConfirmar('trial')} disabled={definirPlano.isPending}>
                    <Timer className="mr-1.5 h-4 w-4" /> Liberar 7 dias
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmar('cortesia')} disabled={definirPlano.isPending}>
                    <Gift className="mr-1.5 h-4 w-4" /> Cortesia
                  </Button>

                  {/* 🔴 O MESMO LUGAR NA FILEIRA, o rótulo é que troca. Um botão "Desbloquear"
                      permanente ao lado de "Bloquear" obrigaria a ler os dois para saber qual
                      está valendo agora — e um deles estaria sempre sem efeito. */}
                  {bloqueadaPeloAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                      onClick={() => setConfirmar('desbloquear')}
                      disabled={definirPlano.isPending}
                    >
                      <Unlock className="mr-1.5 h-4 w-4" /> Desbloquear
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmar('bloquear')}
                      disabled={definirPlano.isPending}
                    >
                      <Ban className="mr-1.5 h-4 w-4" /> Bloquear
                    </Button>
                  )}

                  {/* 🔴 SEPARADO DOS OUTROS TRÊS, de propósito. Liberar prazo, cortesia e
                      bloquear são reversíveis com um clique; este abre um caminho que termina
                      em dado apagado. O `border-l` e o espaço são o que impedem o gesto de
                      virar "mais um botão da fileira". */}
                  <span className="mx-1 hidden h-6 self-center border-l sm:block" aria-hidden />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setExcluindo(true)}
                    disabled={definirPlano.isPending || excluir.isPending}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                  </Button>
                </>
              )}
              <span className="ml-auto self-center text-xs text-muted-foreground">
                código <span className="font-mono">{empresa.codigo_acesso}</span>
                {dias !== null && (
                  <>
                    {' · '}
                    {/* Dias restantes, não a data: "vence em 2 dias" é o que faz
                        alguém agir; "vence 11/08" exige contar de cabeça. */}
                    <span className={dias <= 2 ? 'font-medium text-amber-600' : undefined}>
                      {dias > 0
                        ? `teste vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
                        : `teste venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`}
                    </span>
                  </>
                )}
              </span>
            </div>

            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Quem entrou, e quando — é o que revela se a equipe adotou ou só o dono usa
            </p>

            {carregandoUsuarios ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : !usuarios?.length ? (
              <p className="py-3 text-sm text-muted-foreground">Nenhum usuário nesta empresa.</p>
            ) : (
              <div className="divide-y rounded-lg border bg-card">
                {usuarios.map((u) => {
                  const ua = desde(u.ultimo_acesso);
                  return (
                    <div key={u.usuario_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className={`min-w-0 flex-1 truncate ${u.suspenso ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {u.nome ?? u.email}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                      <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                      <span className={`w-24 text-right text-xs ${ua.dias !== null && ua.dias >= 14 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {ua.texto}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ExcluirEmpresaDialog
        aberto={excluindo}
        onOpenChange={setExcluindo}
        nomeDaEmpresa={empresa.nome}
        numeros={numeros ?? null}
        temAssinaturaAtiva={empresa.tem_assinatura_stripe}
        aoConfirmar={(motivo) =>
          excluir.mutateAsync({ empresaId: empresa.empresa_id, motivo }).then(() => undefined)
        }
      />

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar && CONFIRMACAO[confirmar].titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmar && CONFIRMACAO[confirmar].texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmar === 'restaurar') {
                  restaurar.mutate(empresa.empresa_id);
                } else if (confirmar) {
                  definirPlano.mutate({ empresaId: empresa.empresa_id, acao: confirmar, dias: 7 });
                }
                setConfirmar(null);
              }}
              className={confirmar === 'bloquear' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function AdminEmpresas() {
  const { data: empresas, isLoading, refetch, isRefetching } = useEmpresasCS();
  const [busca, setBusca] = useState('');

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas ?? [];
    return (empresas ?? []).filter(
      (e) =>
        (e.nome ?? '').toLowerCase().includes(termo) ||
        e.codigo_acesso.toLowerCase().includes(termo),
    );
  }, [empresas, busca]);

  const resumo = useMemo(() => {
    const e = empresas ?? [];
    /**
     * 🔴 EMPRESA EXCLUÍDA SAI DAS CONTAS COMERCIAIS. Ela não é mais base: contá-la em "Não
     * pagaram" transformaria uma decisão de vocês num problema a resolver, e o número que
     * deveria mostrar quem precisa de atenção passaria a inchar a cada exclusão.
     *
     * "Empresas" continua contando todas, porque é o número que tem de bater com a lista
     * logo abaixo — uma contagem que não bate com o que está na tela vira dúvida sobre as
     * outras quatro.
     */
    const naBase = e.filter((x) => !x.excluida_em);
    const porSituacao = (s: SituacaoCS) => naBase.filter((x) => situacaoDaEmpresa(x) === s).length;
    return {
      total: e.length,
      pagantes: porSituacao('pagante'),
      emTeste: porSituacao('trial'),
      naoPagaram: porSituacao('nunca_pagou') + porSituacao('trial_vencido'),
      frias: naBase.filter((x) => {
        const d = desde(x.ultimo_acesso).dias;
        return d === null || d >= 14;
      }).length,
    };
  }, [empresas]);

  return (
    <AppLayout title="Empresas" subtitle="Quem usa, quem paga e quem precisa de atenção">
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Metrica rotulo="Empresas" valor={resumo.total} />
          <Metrica rotulo="Pagantes" valor={resumo.pagantes} />
          <Metrica rotulo="Em teste" valor={resumo.emTeste} />
          <Metrica rotulo="Não pagaram" valor={resumo.naoPagaram} destaque />
          <Metrica rotulo="Paradas há 14+ dias" valor={resumo.frias} destaque />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando empresas...
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Building2 className="mb-3 h-10 w-10 opacity-20" />
            <p>{busca ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map((e) => (
              <CardEmpresa key={e.empresa_id} empresa={e} />
            ))}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          Uso dos últimos 30 dias: negócios criados, mensagens de WhatsApp e e-mails.
          "Último acesso" é o login mais recente de qualquer pessoa da empresa.
        </p>
      </div>
    </AppLayout>
  );
}

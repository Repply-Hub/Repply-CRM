import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSecaoLigada } from '@/hooks/use-secoes';
import {
  useConfiguracoesAutomacao,
  useSalvarConfiguracaoAutomacao,
  PADROES_DA_PAUTA,
  type ChaveDaPauta,
} from '@/hooks/use-configuracoes-automacao';

/**
 * A aba "Automação" das Configurações.
 *
 * 🔴 ATÉ 24/08/2026 ESTA ABA ERA DECORATIVA. Tinha dois interruptores sem `onCheckedChange`
 * e um campo `useState('5')` que nunca era lido do banco nem salvo — voltava a 5 a cada
 * recarga. Quem mexia ali achava que tinha configurado alguma coisa.
 *
 * Agora cada controle grava em `configuracoes_automacao` e tem efeito imediato na tela
 * "Hoje", porque a função de banco que monta a pauta lê estas mesmas chaves.
 *
 * O que NÃO está aqui e estava no desenho original: "obra fria" e "tabela de preço
 * vencendo". Os dois módulos estão vazios — 0 obras cadastradas, 0 tabelas de preço, e o
 * campo de validade não existe. Voltam quando houver dado; pôr interruptor que não faz nada
 * seria repor exatamente o defeito que esta tela acabou de perder.
 */

const DIAS = [
  { n: 0, curto: 'Dom', longo: 'domingo' },
  { n: 1, curto: 'Seg', longo: 'segunda' },
  { n: 2, curto: 'Ter', longo: 'terça' },
  { n: 3, curto: 'Qua', longo: 'quarta' },
  { n: 4, curto: 'Qui', longo: 'quinta' },
  { n: 5, curto: 'Sex', longo: 'sexta' },
  { n: 6, curto: 'Sáb', longo: 'sábado' },
];

interface Props {
  empresaId?: string;
}

export function AutomacaoTab({ empresaId }: Props) {
  const { data: config, isLoading } = useConfiguracoesAutomacao(empresaId);
  const salvar = useSalvarConfiguracaoAutomacao(empresaId);
  const { ligada: temPauta } = useSecaoLigada('hoje');

  // Os campos de número são digitados: guardar em texto deixa o campo ficar vazio enquanto
  // a pessoa apaga para redigitar. Converter a cada tecla faria "" virar 0 e o cursor
  // saltar (a mesma armadilha do CLAUDE.md §7.10, do lado da quantidade).
  const [dias, setDias] = useState('');
  const [minimo, setMinimo] = useState('');
  const [maximo, setMaximo] = useState('');

  useEffect(() => {
    if (!config) return;
    setDias(String(config.pauta_dias_parado));
    setMinimo(String(config.pauta_min_itens));
    setMaximo(String(config.pauta_max_itens));
  }, [config]);

  const gravar = async (chave: ChaveDaPauta, valor: number | boolean | number[]) => {
    try {
      await salvar.mutateAsync({ chave, valor });
    } catch (e) {
      toast.error(
        e instanceof Error && e.message ? `Não salvou: ${e.message}` : 'Não foi possível salvar',
      );
    }
  };

  /** Grava só quando a pessoa sai do campo, e só se o número fizer sentido. */
  const gravarNumero = (
    chave: ChaveDaPauta,
    texto: string,
    min: number,
    max: number,
    repor: (v: string) => void,
  ) => {
    const n = Number.parseInt(texto, 10);
    if (!Number.isFinite(n) || n < min || n > max) {
      // Valor impossível volta ao que estava, com aviso. Silenciosamente corrigir seria
      // pior: a pessoa acha que gravou 99 e a pauta segue com 7.
      const atual = config?.[chave] as number;
      repor(String(atual ?? PADROES_DA_PAUTA[chave]));
      toast.error(`Use um número entre ${min} e ${max}.`);
      return;
    }
    if (config && (config[chave] as number) === n) return;
    void gravar(chave, n);
  };

  if (isLoading || !config) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const diasSelecionados = config.pauta_dias_da_semana;

  const alternarDia = (n: number) => {
    const novo = diasSelecionados.includes(n)
      ? diasSelecionados.filter((d) => d !== n)
      : [...diasSelecionados, n].sort((a, b) => a - b);
    if (novo.length === 0) {
      toast.error('Escolha pelo menos um dia, ou desligue o resumo diário.');
      return;
    }
    void gravar('pauta_dias_da_semana', novo);
  };

  return (
    <div className="grid gap-4">
      {!temPauta && (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          A seção <strong className="text-card-foreground">Hoje</strong> está desligada para
          esta empresa, então nada aqui tem efeito por enquanto: não há pauta e não há e-mail.
          Quem liga a seção é o administrador da Repply.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A pauta do dia</CardTitle>
          <CardDescription>
            O que aparece na tela "Hoje" para cada pessoa da equipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">
                Dias sem mexer para o negócio entrar na pauta
              </p>
              <p className="text-xs text-muted-foreground">
                Conta a partir da última mudança de etapa. Padrão: {PADROES_DA_PAUTA.pauta_dias_parado} dias.
              </p>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              className="w-20 text-center"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              onBlur={() => gravarNumero('pauta_dias_parado', dias, 1, 365, setDias)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">Quantos itens por dia</p>
              <p className="text-xs text-muted-foreground">
                A pauta varia entre esses dois números conforme o que está parado. Compromisso
                da agenda ocupa vaga: reunião marcada não se corta por teto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                aria-label="Mínimo de itens"
                className="w-16 text-center"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                onBlur={() => gravarNumero('pauta_min_itens', minimo, 1, 20, setMinimo)}
              />
              <span className="text-sm text-muted-foreground">a</span>
              <Input
                type="text"
                inputMode="numeric"
                aria-label="Máximo de itens"
                className="w-16 text-center"
                value={maximo}
                onChange={(e) => setMaximo(e.target.value)}
                onBlur={() => gravarNumero('pauta_max_itens', maximo, 1, 20, setMaximo)}
              />
            </div>
          </div>

          {Number(minimo) > Number(maximo) && (
            <p className="text-xs text-destructive">
              O mínimo está maior que o máximo — a pauta vai respeitar o máximo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo diário por e-mail</CardTitle>
          <CardDescription>
            A mesma pauta da tela, na caixa de entrada de cada pessoa às 7h.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">Enviar o resumo</p>
              <p className="text-xs text-muted-foreground">
                Quem estiver com a pauta vazia não recebe nada.
              </p>
            </div>
            <Switch
              checked={config.pauta_resumo_email}
              onCheckedChange={(v) => void gravar('pauta_resumo_email', v)}
              disabled={salvar.isPending}
            />
          </div>

          <div className={cn('space-y-2', !config.pauta_resumo_email && 'opacity-50')}>
            <Label>Em que dias</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const ativo = diasSelecionados.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={ativo}
                    aria-label={d.longo}
                    disabled={!config.pauta_resumo_email || salvar.isPending}
                    onClick={() => alternarDia(d.n)}
                    className={cn(
                      'h-9 min-w-[46px] rounded-md border px-2 text-xs font-medium transition-colors',
                      ativo
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-foreground/30',
                      'disabled:cursor-not-allowed',
                    )}
                  >
                    {d.curto}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Só o e-mail respeita esses dias. A tela "Hoje" continua mostrando a pauta de hoje
              todo dia, inclusive fim de semana, para quem escolher trabalhar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

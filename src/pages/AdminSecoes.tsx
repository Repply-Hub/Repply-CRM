import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Building2, Users, Loader2, ChevronDown, ChevronRight, Search, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { SECOES } from '@/lib/secoes';
import {
  useAdminSecoes, useDefinirExcecao, type LinhaSecaoEmpresa,
} from '@/hooks/use-admin-secoes';

/**
 * Controle de quais seções cada empresa enxerga.
 *
 * EIXO: por EMPRESA — o que EXISTE para aquele assinante. Quem VÊ, dentro do que existe,
 * continua sendo a matriz de permissões por usuário (Configurações → Usuários).
 *
 * A empresa segue um preset; a exceção, quando existe, ganha do preset. Por isso cada
 * linha mostra DE ONDE veio a resposta — sem isso ninguém entende duas empresas com o
 * mesmo preset divergindo.
 */

/** As 12 seções de UMA empresa, na ordem de SECOES (que é a verdade da ordem). */
function SecoesDaEmpresa({ linhas }: { linhas: LinhaSecaoEmpresa[] }) {
  const definir = useDefinirExcecao();
  const empresaId = linhas[0]?.empresa_id;

  const porSecao = useMemo(
    () => new Map(linhas.map((l) => [l.secao, l])),
    [linhas],
  );

  return (
    <div className="mt-3 border-t pt-2">
      {SECOES.map((s) => {
        const linha = porSecao.get(s.id);
        if (!linha) return null;

        return (
          <div key={s.id} className="flex items-center gap-3 py-2 border-b last:border-0">
            <Switch
              checked={linha.habilitada}
              // Núcleo não desliga: pedidos.cliente_id e pedidos.fabricante_id são NOT NULL
              // e /app é a home. Desabilitado COM explicação, em vez de escondido — assim
              // fica claro que é decisão do produto, não esquecimento da tela.
              disabled={!s.desligavel || definir.isPending}
              onCheckedChange={(marcado) =>
                definir.mutate({ empresaId, secao: s.id, habilitada: marcado })
              }
              aria-label={s.label}
            />

            <span className="flex-1 text-sm">{s.label}</span>

            {!s.desligavel && (
              <span
                className="text-xs text-muted-foreground"
                title="O sistema não funciona sem esta seção"
              >
                sempre ligada
              </span>
            )}

            {s.desligavel && (
              <Badge variant={linha.origem === 'excecao' ? 'default' : 'outline'}>
                {linha.origem === 'excecao' ? 'exceção desta empresa' : 'do preset'}
              </Badge>
            )}

            {linha.origem === 'excecao' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={definir.isPending}
                onClick={() => definir.mutate({ empresaId, secao: s.id, habilitada: null })}
              >
                Voltar a seguir o preset
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardEmpresa({ linhas }: { linhas: LinhaSecaoEmpresa[] }) {
  const [aberto, setAberto] = useState(false);

  const nome = linhas[0].empresa_nome ?? '(sem nome)';
  const usuarios = linhas[0].usuarios;
  const preset = linhas[0].preset_nome ?? 'Padrão';
  const excecoes = linhas.filter((l) => l.origem === 'excecao').length;
  const desligadas = linhas.filter(
    (l) => !l.habilitada && SECOES.find((s) => s.id === l.secao)?.desligavel,
  ).length;

  return (
    <Card>
      <CardContent className="p-4">
        <button
          className="w-full flex items-center gap-3 text-left"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium flex-1 truncate">{nome}</span>

          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {usuarios}
          </span>

          <Badge variant="outline">{preset}</Badge>

          {desligadas > 0 && (
            <Badge variant="secondary">
              {desligadas} desligada{desligadas > 1 ? 's' : ''}
            </Badge>
          )}

          {excecoes > 0 && (
            <Badge>
              {excecoes} exceção{excecoes > 1 ? 'ões' : ''}
            </Badge>
          )}
        </button>

        {aberto && <SecoesDaEmpresa linhas={linhas} />}
      </CardContent>
    </Card>
  );
}

export default function AdminSecoes() {
  const { data: linhas = [], isLoading, isFetching, refetch, error } = useAdminSecoes();
  const [busca, setBusca] = useState('');

  // Agrupa as linhas (empresa × seção) por empresa.
  const porEmpresa = useMemo(() => {
    const m = new Map<string, LinhaSecaoEmpresa[]>();
    for (const l of linhas) {
      const atual = m.get(l.empresa_id) ?? [];
      atual.push(l);
      m.set(l.empresa_id, atual);
    }
    return [...m.values()];
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return porEmpresa;
    return porEmpresa.filter((g) =>
      (g[0].empresa_nome ?? '').toLowerCase().includes(q),
    );
  }, [porEmpresa, busca]);

  return (
    <AppLayout
      title="Seções"
      subtitle="O que cada empresa enxerga do sistema"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>
            A empresa segue um <strong className="text-foreground">preset</strong>. Uma{' '}
            <strong className="text-foreground">exceção</strong> vale só para ela e ganha do
            preset. Isto define o que <strong className="text-foreground">existe</strong>{' '}
            para o assinante — quem <strong className="text-foreground">vê</strong>, dentro
            disso, continua sendo a permissão por usuário, em Configurações.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar empresa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            Atualizar
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Não foi possível carregar as seções'}
          </div>
        )}

        {!isLoading && !error && filtradas.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">Nenhuma empresa encontrada.</p>
        )}

        <div className="space-y-2">
          {filtradas.map((g) => (
            <CardEmpresa key={g[0].empresa_id} linhas={g} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

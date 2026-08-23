import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo,
  DialogTitle, DialogDescription,
} from '@/components/shared/DialogoResponsivo';
import {
  Building2, Users, Loader2, ChevronDown, ChevronRight, Search, RefreshCw, ShieldCheck,
  Layers, Plus, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { SECOES } from '@/lib/secoes';
import {
  useAdminSecoes, useDefinirExcecao, useDefinirPresetDaEmpresa,
  usePresets, useItensDosPresets, useCriarPreset, useRenomearPreset,
  useDefinirItemPreset, useExcluirPreset,
  type LinhaSecaoEmpresa, type PresetResumo,
} from '@/hooks/use-admin-secoes';

/**
 * Controle de quais seções cada empresa enxerga.
 *
 * EIXO: por EMPRESA — o que EXISTE para aquele assinante. Quem VÊ, dentro do que existe,
 * continua sendo a matriz de permissões por usuário (Configurações → Usuários).
 *
 * Duas abas para duas escalas de risco, e a separação é de propósito:
 *
 *   · **Empresas** — mexe em UMA. Errar afeta um assinante, e o caminho de volta está na
 *     mesma linha ("Voltar a seguir o preset").
 *   · **Presets** — mexe em TODAS as que seguem aquele preset de uma vez. É o único lugar
 *     do sistema onde um clique atinge mais de um cliente pagante, e por isso é o único que
 *     pede confirmação dizendo quantos.
 *
 * A empresa segue um preset; a exceção, quando existe, ganha do preset. Por isso cada linha
 * da aba de empresas mostra DE ONDE veio a resposta — sem isso ninguém entende duas
 * empresas com o mesmo preset divergindo.
 */

/** Explicação de por que o interruptor está travado. Igual nas duas abas. */
function RotuloNucleo() {
  return (
    <span
      className="text-xs text-muted-foreground"
      title="O sistema não funciona sem esta seção"
    >
      sempre ligada
    </span>
  );
}

// ================================================================ aba: empresas

/** As 12 seções de UMA empresa, na ordem de SECOES (que é a verdade da ordem). */
function SecoesDaEmpresa({
  linhas,
  presets,
}: {
  linhas: LinhaSecaoEmpresa[];
  presets: PresetResumo[];
}) {
  const definir = useDefinirExcecao();
  const definirPreset = useDefinirPresetDaEmpresa();
  const empresaId = linhas[0]?.empresa_id;

  // Empresa sem preset apontado segue o padrão na prática (ver `empresa_tem_secao`). O
  // seletor mostra o padrão marcado em vez de vazio: campo vazio sugeriria "sem regra
  // nenhuma", e esse estado não existe no sistema.
  const presetAtual = linhas[0]?.preset_id ?? presets.find((p) => p.is_padrao)?.id ?? '';

  const porSecao = useMemo(
    () => new Map(linhas.map((l) => [l.secao, l])),
    [linhas],
  );

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Segue o preset</span>
        <Select
          value={presetAtual}
          disabled={definirPreset.isPending}
          onValueChange={(presetId) => definirPreset.mutate({ empresaId, presetId })}
        >
          <SelectTrigger className="h-8 w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
                {p.is_padrao ? ' (padrão)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Trocar de preset não apaga exceção: ela continua ganhando, agora por cima de
            outro conjunto. Dizer isso aqui evita a leitura de que o seletor "zera tudo". */}
        <span className="text-xs text-muted-foreground">
          As exceções abaixo continuam valendo por cima.
        </span>
      </div>

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

            {!s.desligavel && <RotuloNucleo />}

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

function CardEmpresa({
  linhas,
  presets,
}: {
  linhas: LinhaSecaoEmpresa[];
  presets: PresetResumo[];
}) {
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

        {aberto && <SecoesDaEmpresa linhas={linhas} presets={presets} />}
      </CardContent>
    </Card>
  );
}

function AbaEmpresas({ presets }: { presets: PresetResumo[] }) {
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
    return porEmpresa.filter((g) => (g[0].empresa_nome ?? '').toLowerCase().includes(q));
  }, [porEmpresa, busca]);

  return (
    <div className="space-y-4">
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
          <CardEmpresa key={g[0].empresa_id} linhas={g} presets={presets} />
        ))}
      </div>
    </div>
  );
}

// ================================================================ aba: presets

/** Criar (sem `preset`) ou renomear (com `preset`). O mesmo formulário serve aos dois. */
function DialogoPreset({
  preset,
  aoFechar,
}: {
  preset?: PresetResumo;
  aoFechar: () => void;
}) {
  const criar = useCriarPreset();
  const renomear = useRenomearPreset();
  const [nome, setNome] = useState(preset?.nome ?? '');
  const [descricao, setDescricao] = useState(preset?.descricao ?? '');

  const salvando = criar.isPending || renomear.isPending;

  function salvar() {
    if (!nome.trim()) return;
    const acao = preset
      ? renomear.mutateAsync({ presetId: preset.id, nome, descricao })
      : criar.mutateAsync({ nome, descricao });
    // O erro já virou aviso na tela dentro do hook; aqui só não se fecha o formulário,
    // para o que foi digitado não se perder.
    acao.then(aoFechar).catch(() => undefined);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle>{preset ? 'Renomear preset' : 'Novo preset'}</DialogTitle>
          <DialogDescription>
            {preset
              ? 'Muda só o nome e a descrição. As seções continuam como estão.'
              : 'O preset nasce com uma cópia das seções do preset padrão. Ajuste depois de criar.'}
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preset-nome">Nome</Label>
            <Input
              id="preset-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Plano básico"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-descricao">Descrição (opcional)</Label>
            <Textarea
              id="preset-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Para que serve este preset"
              rows={3}
            />
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {preset ? 'Salvar' : 'Criar preset'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}

/**
 * As 12 seções de UM preset.
 *
 * Diferença central para a aba de empresas: aqui o clique atinge todas as empresas que
 * seguem este preset. Por isso passa por confirmação que diz QUANTAS — e a confirmação some
 * quando não há nenhuma, porque aí não há o que avisar.
 */
function SecoesDoPreset({
  preset,
  itens,
}: {
  preset: PresetResumo;
  itens: Map<string, boolean> | undefined;
}) {
  const definir = useDefinirItemPreset();
  const [pendente, setPendente] = useState<{
    secao: string;
    label: string;
    habilitada: boolean;
  } | null>(null);

  function pedir(secao: string, label: string, habilitada: boolean) {
    if (preset.empresas_seguindo === 0) {
      definir.mutate({ presetId: preset.id, secao, habilitada });
      return;
    }
    setPendente({ secao, label, habilitada });
  }

  return (
    <>
      <div className="mt-3 border-t pt-2">
        {SECOES.map((s) => {
          // Preset criado antes de a seção existir não tem linha para ela. A resolução no
          // banco devolve "ligada" nesse caso, e a tela mostra o mesmo — em vez de um
          // interruptor apagado que diria o contrário do que o cliente enxerga.
          const habilitada = itens?.get(s.id) ?? true;

          return (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <Switch
                checked={habilitada}
                disabled={!s.desligavel || definir.isPending}
                onCheckedChange={(marcado) => pedir(s.id, s.label, marcado)}
                aria-label={s.label}
              />
              <span className="flex-1 text-sm">{s.label}</span>
              {!s.desligavel && <RotuloNucleo />}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!pendente} onOpenChange={(v) => !v && setPendente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
              <span>
                {pendente?.habilitada ? 'Liberar' : 'Bloquear'} {pendente?.label} para{' '}
                {preset.empresas_seguindo} empresa
                {preset.empresas_seguindo > 1 ? 's' : ''}?
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Todas as empresas que seguem o preset{' '}
                  <strong className="text-foreground">{preset.nome}</strong> passam a{' '}
                  {pendente?.habilitada ? 'ver' : 'não ver'} a seção{' '}
                  <strong className="text-foreground">{pendente?.label}</strong>. Vale na
                  hora, inclusive para quem estiver com o sistema aberto agora.
                </p>
                <p>
                  Empresa que tenha exceção para esta seção não muda — a exceção ganha do
                  preset.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendente) {
                  definir.mutate({
                    presetId: preset.id,
                    secao: pendente.secao,
                    habilitada: pendente.habilitada,
                  });
                }
                setPendente(null);
              }}
            >
              {pendente?.habilitada ? 'Liberar' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CardPreset({
  preset,
  itens,
}: {
  preset: PresetResumo;
  itens: Map<string, boolean> | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const [renomeando, setRenomeando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const excluir = useExcluirPreset();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-3 text-left flex-1 min-w-0"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Layers className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="font-medium block truncate">{preset.nome}</span>
              {preset.descricao && (
                <span className="text-xs text-muted-foreground block truncate">
                  {preset.descricao}
                </span>
              )}
            </span>
          </button>

          {preset.is_padrao && <Badge variant="outline">padrão</Badge>}

          <Badge
            variant="secondary"
            className="whitespace-nowrap gap-1"
            title={`${preset.empresas_seguindo} empresa(s) seguem este preset`}
          >
            <Building2 className="h-3 w-3" />
            {preset.empresas_seguindo}
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Renomear preset"
            onClick={() => setRenomeando(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {/* O padrão não some da tela: fica travado, com o motivo no title. Botão ausente
              vira pergunta; botão travado com explicação vira resposta. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Excluir preset"
            disabled={preset.is_padrao || excluir.isPending}
            title={
              preset.is_padrao ? 'O preset padrão não pode ser excluído' : 'Excluir preset'
            }
            onClick={() => setExcluindo(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {aberto && <SecoesDoPreset preset={preset} itens={itens} />}
      </CardContent>

      {renomeando && (
        <DialogoPreset preset={preset} aoFechar={() => setRenomeando(false)} />
      )}

      <AlertDialog open={excluindo} onOpenChange={setExcluindo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o preset {preset.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {preset.empresas_seguindo > 0
                ? `${preset.empresas_seguindo} empresa(s) seguem este preset. O banco vai recusar a exclusão enquanto isso — mova essas empresas para outro preset primeiro.`
                : 'Nenhuma empresa segue este preset. Excluir não muda o que ninguém enxerga.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluir.mutate(preset.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AbaPresets() {
  const { data: presets = [], isLoading, error } = usePresets();
  const { data: itens } = useItensDosPresets();
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mexer num preset muda todas as empresas que o seguem de uma vez.
        </p>
        <Button onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4" />
          Novo preset
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
          {error instanceof Error ? error.message : 'Não foi possível carregar os presets'}
        </div>
      )}

      <div className="space-y-2">
        {presets.map((p) => (
          <CardPreset key={p.id} preset={p} itens={itens?.get(p.id)} />
        ))}
      </div>

      {criando && <DialogoPreset aoFechar={() => setCriando(false)} />}
    </div>
  );
}

// ================================================================ página

export default function AdminSecoes() {
  const { data: presets = [] } = usePresets();

  return (
    <AppLayout title="Seções" subtitle="O que cada empresa enxerga do sistema">
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

        <Tabs defaultValue="empresas">
          <TabsList>
            <TabsTrigger value="empresas" className="gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="presets" className="gap-2">
              <Layers className="h-4 w-4" />
              Presets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="empresas" className="mt-4">
            <AbaEmpresas presets={presets} />
          </TabsContent>

          <TabsContent value="presets" className="mt-4">
            <AbaPresets />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useHistoricoAlteracoes, HistoricoAlteracao } from '@/hooks/use-historico-alteracoes';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListPagination } from '@/components/shared/ListPagination';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

const TABELA_LABELS: Record<string, string> = {
  pedidos: 'Negócio',
  clientes: 'Cliente',
  obras: 'Obra',
  fabricantes: 'Fabricante',
  usuarios: 'Usuário',
  contatos: 'Contato',
  tarefas: 'Tarefa',
  permissoes_usuario: 'Permissão',
  kanban_colunas: 'Coluna do Kanban',
  funis: 'Funil',
};

const ACAO_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  INSERT: { label: 'Criação', variant: 'default' },
  UPDATE: { label: 'Edição', variant: 'secondary' },
  DELETE: { label: 'Exclusão', variant: 'destructive' },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function resumoCampos(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): string | null {
  if (!antes || !depois) return null;
  const camposIgnorados = new Set(['updated_at', 'created_at']);
  const alterados = Object.keys(depois).filter(
    (chave) => !camposIgnorados.has(chave) && JSON.stringify(antes[chave]) !== JSON.stringify(depois[chave]),
  );
  if (alterados.length === 0) return null;
  return `Campos alterados: ${alterados.join(', ')}`;
}

function LinhaHistorico({ item }: { item: HistoricoAlteracao }) {
  const [aberto, setAberto] = useState(false);
  const acao = ACAO_LABELS[item.acao] ?? { label: item.acao, variant: 'secondary' as const };
  const resumo = resumoCampos(item.dados_antes, item.dados_depois);
  const temDetalhe = !!(item.dados_antes || item.dados_depois);

  return (
    <Collapsible asChild open={aberto} onOpenChange={setAberto}>
      <>
        <TableRow className={temDetalhe ? 'cursor-pointer' : undefined} onClick={() => temDetalhe && setAberto((v) => !v)}>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground py-2 px-2.5">
            {new Date(item.created_at).toLocaleString('pt-BR')}
          </TableCell>
          <TableCell className="text-sm py-2 px-2.5">{item.usuario?.nome ?? 'Sistema'}</TableCell>
          <TableCell className="text-sm py-2 px-2.5">{TABELA_LABELS[item.tabela] ?? item.tabela}</TableCell>
          <TableCell className="py-2 px-2.5">
            <Badge variant={acao.variant}>{acao.label}</Badge>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground py-2 px-2.5">
            {item.descricao ?? resumo ?? '—'}
          </TableCell>
          <TableCell className="w-8 py-2 px-2.5">
            {temDetalhe && (
              <CollapsibleTrigger asChild>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
            )}
          </TableCell>
        </TableRow>
        {temDetalhe && (
          <CollapsibleContent asChild>
            <TableRow>
              <TableCell colSpan={6} className="bg-muted/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2 text-xs">
                  {item.dados_antes && (
                    <div>
                      <p className="font-semibold mb-1 text-muted-foreground">Antes</p>
                      <pre className="whitespace-pre-wrap break-all bg-background rounded p-2 border">
                        {JSON.stringify(item.dados_antes, null, 2)}
                      </pre>
                    </div>
                  )}
                  {item.dados_depois && (
                    <div>
                      <p className="font-semibold mb-1 text-muted-foreground">Depois</p>
                      <pre className="whitespace-pre-wrap break-all bg-background rounded p-2 border">
                        {JSON.stringify(item.dados_depois, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          </CollapsibleContent>
        )}
      </>
    </Collapsible>
  );
}

export default function HistoricoAlteracoes() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: vendedores } = useVendedores();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [tabelaFiltro, setTabelaFiltro] = useState<string | undefined>(undefined);
  const [usuarioFiltro, setUsuarioFiltro] = useState<string | undefined>(undefined);

  const filtros = useMemo(
    () => ({ tabela: tabelaFiltro, usuarioId: usuarioFiltro }),
    [tabelaFiltro, usuarioFiltro],
  );

  const { data, isLoading } = useHistoricoAlteracoes(empresaId, page - 1, pageSize, filtros);
  const itens = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <AppLayout title="Histórico de Alterações" subtitle="Registro de toda ação realizada no sistema" mainClassName="flex-1 overflow-hidden flex flex-col">
      {/* Padding que encolhe com a tela: com `p-6` fixo, num celular ou em zoom alto
          48px de cada lado saem da largura útil da tabela. */}
      <div className="flex flex-1 min-h-0 flex-col gap-4 p-3 sm:p-4 md:p-6">
        <div className="flex flex-wrap gap-3 shrink-0">
          <Select
            value={tabelaFiltro ?? 'todas'}
            onValueChange={(value) => {
              setTabelaFiltro(value === 'todas' ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todas as entidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as entidades</SelectItem>
              {Object.entries(TABELA_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={usuarioFiltro ?? 'todos'}
            onValueChange={(value) => {
              setUsuarioFiltro(value === 'todos' ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todos os usuários" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os usuários</SelectItem>
              {(vendedores ?? []).map((v: { id: string; nome: string }) => (
                <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            <Table wrapperClassName="flex-1 min-h-0">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="h-14 px-2.5">Data/Hora</TableHead>
                  <TableHead className="h-14 px-2.5">Usuário</TableHead>
                  <TableHead className="h-14 px-2.5">Entidade</TableHead>
                  <TableHead className="h-14 px-2.5">Ação</TableHead>
                  <TableHead className="h-14 px-2.5">Descrição</TableHead>
                  <TableHead className="w-8 h-14 px-2.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && itens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma alteração registrada.
                    </TableCell>
                  </TableRow>
                )}
                {itens.map((item) => (
                  <LinhaHistorico key={item.id} item={item} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ListPagination
          page={page}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          itemLabel="alteração"
          itemLabelPlural="alterações"
          className="shrink-0"
        />
      </div>
    </AppLayout>
  );
}

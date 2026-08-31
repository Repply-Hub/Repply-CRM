import { useCallback, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useHistoricoAlteracoes, HistoricoAlteracao } from '@/hooks/use-historico-alteracoes';
import { useSecaoLigada } from '@/hooks/use-secoes';
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
import { descreverAlteracao, resumirAlteracao } from '@/lib/historico-legivel';

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
  // A lista de responsáveis de um negócio. Sem esta entrada a tela mostraria o nome cru da
  // tabela na coluna "Entidade", e o filtro não a ofereceria.
  pedido_responsaveis: 'Responsável do Negócio',
};

const ACAO_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  INSERT: { label: 'Criação', variant: 'default' },
  UPDATE: { label: 'Edição', variant: 'secondary' },
  DELETE: { label: 'Exclusão', variant: 'destructive' },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function LinhaHistorico({
  item,
  nomeDe,
}: {
  item: HistoricoAlteracao;
  /** Traduz identificador de pessoa em nome. Ver `historico-legivel.ts`. */
  nomeDe: (id: string) => string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const acao = ACAO_LABELS[item.acao] ?? { label: item.acao, variant: 'secondary' as const };
  const resumo = resumirAlteracao(item.dados_antes, item.dados_depois, nomeDe);
  const mudancas = descreverAlteracao(item.dados_antes, item.dados_depois, nomeDe);
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
                {/* 🔴 CAMPO A CAMPO, NÃO O JSON CRU. Este painel mostrava dois blocos de JSON
                    com identificadores de 36 caracteres — quem quisesse conferir "alguém puxou
                    um negócio para si?" precisava traduzir na mão. É a auditoria em que a
                    liberdade de reatribuir se apoia; ilegível, ela não vale nada. */}
                <div className="py-2 text-xs">
                  {mudancas.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="w-1/4 pb-1 text-left font-semibold">Campo</th>
                          <th className="w-2/5 pb-1 text-left font-semibold">Antes</th>
                          <th className="pb-1 text-left font-semibold">Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mudancas.map((m) => (
                          <tr key={m.campo} className="align-top">
                            <td className="py-0.5 pr-3 font-medium text-foreground">{m.rotulo}</td>
                            <td className="py-0.5 pr-3 break-words text-muted-foreground line-through decoration-muted-foreground/40">
                              {m.de}
                            </td>
                            <td className="py-0.5 break-words text-foreground">{m.para}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    // Criação e exclusão não têm "antes e depois" — aí o retrato cru é a
                    // informação, e não há o que traduzir.
                    <pre className="whitespace-pre-wrap break-all rounded border bg-background p-2">
                      {JSON.stringify(item.dados_depois ?? item.dados_antes, null, 2)}
                    </pre>
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

  const { ligada: temObras } = useSecaoLigada('obras');

  /**
   * Identificador de pessoa → nome. A tela já carrega `useVendedores()` para o filtro; este
   * mapa reaproveita a mesma lista, sem consulta nova.
   *
   * 🔴 INCLUI QUEM FOI EXCLUÍDO? Não — `useVendedores` traz só quem está ativo. Quem saiu da
   * equipe aparece como um pedaço do identificador, que é melhor que o identificador inteiro
   * e honesto sobre não saber. Trazer os removidos exigiria uma segunda consulta em toda
   * abertura da tela, para um caso que quase não acontece.
   */
  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of vendedores ?? []) {
      if (v?.id && v?.nome) mapa.set(v.id, v.nome);
    }
    return mapa;
  }, [vendedores]);
  const nomeDe = useCallback((id: string) => nomePorId.get(id) ?? null, [nomePorId]);

  // Cascata da seção Obras: sem a seção, "Obra" sai das opções deste filtro.
  //
  // O corte é SÓ aqui, e não em TABELA_LABELS: o mesmo mapa traduz a coluna "Entidade" de
  // cada linha da tabela. Registros antigos de obra continuam no banco e têm que continuar
  // legíveis como "Obra" — tirá-los do mapa faria o histórico exibir o nome cru da tabela.
  const entidadesDoFiltro = useMemo(
    () => Object.entries(TABELA_LABELS).filter(([chave]) => chave !== 'obras' || temObras === true),
    [temObras],
  );

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
              {entidadesDoFiltro.map(([key, label]) => (
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
                  <LinhaHistorico key={item.id} item={item} nomeDe={nomeDe} />
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

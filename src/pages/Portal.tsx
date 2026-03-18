import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Loader2, Search, ExternalLink, Globe, Table2, AlertTriangle, RefreshCw, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SiteResult {
  success: boolean;
  error?: string;
  fallback_url?: string;
  site?: { id: string; name: string; url: string };
  data?: {
    text: string;
    links: Array<{ text: string; href: string }>;
    table: Array<Record<string, string>>;
  };
  meta?: {
    year?: string;
    total_pdfs?: number;
    processed_pdfs?: number;
    total_licencas?: number;
    filtered_licencas?: number;
    available_years?: string[];
  };
  fetched_at?: string;
}

const SITES = [
  {
    id: 'idema',
    name: 'IDEMA',
    description: 'Licenças ambientais emitidas pelo Instituto de Desenvolvimento Sustentável e Meio Ambiente',
    url: 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    borderColor: 'border-emerald-500/20',
  },
  {
    id: 'natal',
    name: 'Diário Oficial - Natal',
    description: 'Publicações oficiais da Prefeitura de Natal/RN',
    url: 'https://www.natal.rn.gov.br/dom',
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    borderColor: 'border-blue-500/20',
  },
  {
    id: 'extremoz',
    name: 'Diário Oficial - Extremoz',
    description: 'Licenças e publicações oficiais extraídas dos PDFs do Diário Oficial de Extremoz/RN',
    url: 'https://extremoz.rn.gov.br/diario-oficial/',
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-500/20',
  },
];


export default function Portal() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SiteResult>>({});
  const [pages, setPages] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const ROWS_PER_PAGE = 10;

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const fetchExtremozFromDb = async () => {
    setLoading((prev) => ({ ...prev, extremoz: true }));
    try {
      let query = supabase.from('licencas_extremoz').select('*').order('created_at', { ascending: false });
      
      if (search) {
        const q = `%${search}%`;
        query = query.or(`cnpj.ilike.${q},razao_social.ilike.${q},nome_fantasia.ilike.${q},obra_descricao.ilike.${q},bloco_texto.ilike.${q},tipo_licenca.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const tableData = (data || []).map(row => ({
        'Data da Edição': row.data_edicao || '',
        'Tipo de Licença': row.tipo_licenca || '',
        'Prioridade': row.prioridade || '',
        'CNPJ': row.cnpj || '',
        'Razão Social': row.razao_social || '',
        'Nome Fantasia': row.nome_fantasia || '',
        'Telefone': row.telefone || '',
        'Email': row.email || '',
        'Endereço': row.endereco_empresa || '',
        'Quadro Societário': row.quadro_societario || '',
        'Obra / Descrição': row.obra_descricao || '',
        'PDF': row.pdf_nome || '',
        'Link PDF': row.pdf_link || '',
        'Texto Encontrado': row.bloco_texto || '',
      }));

      setResults((prev) => ({
        ...prev,
        extremoz: {
          success: true,
          site: { id: 'extremoz', name: 'Diário Oficial - Extremoz', url: 'https://extremoz.rn.gov.br/diario-oficial/' },
          data: { text: `${tableData.length} registros encontrados no banco de dados.`, links: [], table: tableData },
          meta: { total_licencas: tableData.length, total_pdfs: tableData.length, processed_pdfs: tableData.length },
          fetched_at: new Date().toISOString(),
        },
      }));
      toast.success(`Extremoz: ${tableData.length} licenças carregadas do banco de dados`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro de conexão';
      setResults((prev) => ({ ...prev, extremoz: { success: false, error: message } }));
      toast.error('Erro ao carregar dados de Extremoz');
    } finally {
      setLoading((prev) => ({ ...prev, extremoz: false }));
    }
  };

  const fetchSite = async (siteId: string) => {
    if (siteId === 'extremoz') {
      return fetchExtremozFromDb();
    }
    setLoading((prev) => ({ ...prev, [siteId]: true }));
    try {
      const body: Record<string, unknown> = { site_id: siteId, search: search || undefined };

      const { data, error } = await supabase.functions.invoke('portal-scraper', { body });
      if (error) throw error;

      setResults((prev) => ({ ...prev, [siteId]: data }));

      if (data.success) {
        const tableCount = data.data?.table?.length || 0;
        const linkCount = data.data?.links?.length || 0;
        toast.success(`${SITES.find((s) => s.id === siteId)?.name}: ${linkCount} links, ${tableCount} registros`);
      } else {
        toast.error(data.error || 'Erro ao consultar site');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro de conexão';
      console.error('Portal fetch error:', err);
      setResults((prev) => ({
        ...prev,
        [siteId]: { success: false, error: message },
      }));
      toast.error('Erro ao consultar o site');
    } finally {
      setLoading((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  const fetchAll = async () => {
    for (const site of SITES) {
      fetchSite(site.id);
    }
  };

  const exportCsv = (siteId: string) => {
    const result = results[siteId];
    if (!result?.success || !result.data?.table?.length) return;

    const headers = Object.keys(result.data.table[0]);
    const csvRows = [
      headers.join(';'),
      ...result.data.table.map(row =>
        headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(';')
      ),
    ];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siteId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso');
  };

  return (
    <AppLayout title="Portal de Consultas" subtitle="Consulte licenças e publicações oficiais de órgãos públicos.">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Search bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por CNPJ, empresa, licença, obra..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              onKeyDown={(e) => e.key === 'Enter' && fetchAll()}
            />
          </div>
          <Button onClick={fetchAll} disabled={Object.values(loading).some(Boolean)}>
            {Object.values(loading).some(Boolean) ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Consultar Todos
          </Button>
        </div>

        {/* Site cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {SITES.map((site) => (
            <Card key={site.id} className={`border ${site.borderColor}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold">{site.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">{site.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className={`${site.color} shrink-0 text-[10px]`}>
                    <Globe className="h-3 w-3 mr-1" />
                    Gov
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Extremoz info */}
                {site.id === 'extremoz' && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    📊 Dados carregados do banco de dados (115 registros da planilha)
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => fetchSite(site.id)}
                    disabled={loading[site.id]}
                  >
                    {loading[site.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Consultar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(
                      site.id === 'extremoz'
                        ? 'https://extremoz.rn.gov.br/diario-oficial/'
                        : site.url,
                      '_blank'
                    )}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Abrir
                  </Button>
                </div>

                {/* Error status */}
                {results[site.id] && !results[site.id].success && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p>{results[site.id].error}</p>
                      {results[site.id].fallback_url && (
                        <a href={results[site.id].fallback_url} target="_blank" rel="noopener noreferrer" className="underline mt-1 inline-block">
                          Acessar site diretamente →
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Success status */}
                {results[site.id]?.success && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {results[site.id].meta ? (
                      <>
                        <p>✓ {results[site.id].meta!.total_licencas} licenças · {results[site.id].meta!.processed_pdfs}/{results[site.id].meta!.total_pdfs} edições</p>
                        {results[site.id].data!.table.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] p-0 text-primary" onClick={() => exportCsv(site.id)}>
                            <Download className="h-3 w-3 mr-1" /> Exportar CSV
                          </Button>
                        )}
                      </>
                    ) : (
                      <p>
                        ✓ {results[site.id].data?.links?.length || 0} links ·{' '}
                        {results[site.id].data?.table?.length || 0} registros
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Results area */}
        {Object.values(results).some((r) => r.success) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="pr-1">
                {(
                  <div className="space-y-6 min-w-0">
                    {SITES.map((site) => {
                      const result = results[site.id];
                      if (!result?.success || !result.data?.table?.length) return null;
                      const headers = Object.keys(result.data.table[0]);
                      const currentPage = pages[site.id] || 0;
                      const totalPages = Math.ceil(result.data.table.length / ROWS_PER_PAGE);
                      const paginatedRows = result.data.table.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);
                      return (
                        <div key={site.id} className="min-w-0">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {site.name} ({result.data.table.length} registros)
                            </p>
                            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => exportCsv(site.id)}>
                              <Download className="mr-1 h-3 w-3" /> CSV
                            </Button>
                          </div>
                          <div className="w-full max-w-full overflow-x-auto rounded-md border overscroll-x-contain">
                            <table className="min-w-[1100px] text-xs">
                              <thead>
                                <tr className="bg-muted/50">
                                  {headers.filter(h => h !== 'Texto Encontrado' && h !== 'Link PDF').map((h) => (
                                    <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                                  ))}
                                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedRows.map((row, i) => (
                                  <tr key={i} className="border-t border-border/50 hover:bg-accent/30">
                                    {headers.filter(h => h !== 'Texto Encontrado' && h !== 'Link PDF').map((h) => (
                                      <td key={h} className="max-w-[200px] truncate px-3 py-2" title={row[h]}>
                                        {row[h]}
                                      </td>
                                    ))}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {row['Link PDF'] && (
                                        <a
                                          href={row['Link PDF']}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-primary hover:underline"
                                        >
                                          <ExternalLink className="h-3 w-3" /> PDF
                                        </a>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {totalPages > 1 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                Página {currentPage + 1} de {totalPages}
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  disabled={currentPage === 0}
                                  onClick={() => setPages((p) => ({ ...p, [site.id]: currentPage - 1 }))}
                                >
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  disabled={currentPage >= totalPages - 1}
                                  onClick={() => setPages((p) => ({ ...p, [site.id]: currentPage + 1 }))}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

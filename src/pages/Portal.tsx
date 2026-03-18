import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, ExternalLink, Globe, FileText, Table2, AlertTriangle, RefreshCw } from 'lucide-react';
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
    description: 'Publicações oficiais da Prefeitura de Extremoz/RN',
    url: 'https://extremoz.rn.gov.br/diario-oficial/diario-oficial-2026/',
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-500/20',
  },
];

export default function Portal() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SiteResult>>({});
  const [activeTab, setActiveTab] = useState<'links' | 'text' | 'table'>('links');

  const fetchSite = async (siteId: string) => {
    setLoading((prev) => ({ ...prev, [siteId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('portal-scraper', {
        body: { site_id: siteId, search: search || undefined },
      });

      if (error) throw error;

      setResults((prev) => ({ ...prev, [siteId]: data }));

      if (data.success) {
        const linkCount = data.data?.links?.length || 0;
        const tableCount = data.data?.table?.length || 0;
        toast.success(`${SITES.find((s) => s.id === siteId)?.name}: ${linkCount} links, ${tableCount} registros encontrados`);
      } else {
        toast.error(data.error || 'Erro ao consultar site');
      }
    } catch (err: any) {
      console.error('Portal fetch error:', err);
      setResults((prev) => ({
        ...prev,
        [siteId]: { success: false, error: err.message || 'Erro de conexão' },
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

  return (
    <AppLayout title="Portal de Consultas" subtitle="Consulte licenças e publicações oficiais de órgãos públicos.">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Search bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por obra, empresa, licença..."
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    onClick={() => window.open(site.url, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Abrir
                  </Button>
                </div>

                {/* Status */}
                {results[site.id] && !results[site.id].success && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p>{results[site.id].error}</p>
                      {results[site.id].fallback_url && (
                        <a
                          href={results[site.id].fallback_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline mt-1 inline-block"
                        >
                          Acessar site diretamente →
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {results[site.id]?.success && (
                  <div className="text-xs text-muted-foreground">
                    ✓ {results[site.id].data?.links?.length || 0} links ·{' '}
                    {results[site.id].data?.table?.length || 0} registros
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
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Resultados</CardTitle>
                <div className="flex gap-1 ml-auto">
                  <Button
                    variant={activeTab === 'links' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setActiveTab('links')}
                  >
                    <FileText className="h-3 w-3 mr-1" /> Links
                  </Button>
                  <Button
                    variant={activeTab === 'table' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setActiveTab('table')}
                  >
                    <Table2 className="h-3 w-3 mr-1" /> Tabelas
                  </Button>
                  <Button
                    variant={activeTab === 'text' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setActiveTab('text')}
                  >
                    <FileText className="h-3 w-3 mr-1" /> Texto
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {activeTab === 'links' && (
                  <div className="space-y-4">
                    {SITES.map((site) => {
                      const result = results[site.id];
                      if (!result?.success || !result.data?.links?.length) return null;
                      return (
                        <div key={site.id}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                            {site.name}
                          </p>
                          <div className="space-y-1">
                            {result.data.links.map((link, i) => (
                              <a
                                key={i}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors text-sm group"
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 group-hover:text-primary" />
                                <span className="truncate">{link.text}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'table' && (
                  <div className="space-y-4">
                    {SITES.map((site) => {
                      const result = results[site.id];
                      if (!result?.success || !result.data?.table?.length) return null;
                      const headers = Object.keys(result.data.table[0]);
                      return (
                        <div key={site.id}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                            {site.name}
                          </p>
                          <div className="overflow-x-auto border rounded-md">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/50">
                                  {headers.map((h) => (
                                    <th key={h} className="px-3 py-2 text-left font-medium">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {result.data.table.map((row, i) => (
                                  <tr key={i} className="border-t border-border/50 hover:bg-accent/30">
                                    {headers.map((h) => (
                                      <td key={h} className="px-3 py-2">
                                        {row[h]}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'text' && (
                  <div className="space-y-4">
                    {SITES.map((site) => {
                      const result = results[site.id];
                      if (!result?.success || !result.data?.text) return null;
                      return (
                        <div key={site.id}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                            {site.name}
                          </p>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {result.data.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

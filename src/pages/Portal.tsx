import { useState, useCallback, useEffect, useRef } from 'react';
import { format, subMonths, startOfMonth, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

const formatDataEdicao = (raw: string): string => {
  if (!raw) return '';
  // Try dd/mm/yyyy
  const slashMatch = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (slashMatch) {
    const d = new Date(+slashMatch[3], +slashMatch[2] - 1, +slashMatch[1]);
    if (isValid(d)) return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }
  // Try yyyy-mm-dd
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    if (isValid(d)) return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }
  // Try parsing as date directly
  const d = new Date(raw);
  if (isValid(d) && !isNaN(d.getTime())) return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return raw;
};
import { CalendarIcon } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ColumnSettings } from '@/components/shared/ColumnSettings';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ListPagination } from '@/components/shared/ListPagination';

import { Loader2, Search, ExternalLink, Globe, AlertTriangle, RefreshCw, Download, ChevronDown, ChevronUp, CloudDownload, List, Settings2, Calendar as CalendarLucide } from 'lucide-react';
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

function maskCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

function idemaTypeBadge(tipo: string) {
  if (tipo.includes('Prévia'))
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-medium whitespace-nowrap">Prévia</Badge>;
  if (tipo.includes('Instalação'))
    return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[10px] font-medium whitespace-nowrap">Instalação</Badge>;
  if (tipo.includes('Operação'))
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-medium whitespace-nowrap">Operação</Badge>;
  return <span className="text-muted-foreground text-xs">{tipo}</span>;
}

const normalizeNatalLicenseType = (value?: string | null) => {
  const text = (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  if (text.includes('licenca previa') || text === 'lp') return 'Licença Prévia';
  if (text.includes('licenca de instalacao') || text === 'li') return 'Licença de Instalação';
  if (text.includes('licenca de operacao') || text === 'lo') return 'Licença de Operação';

  return '';
};

const isNatalRelevantRecord = (row: Record<string, unknown>) => {
  const tipo = normalizeNatalLicenseType(String(row.tipo_licenca || ''));
  const hasCoreData = Boolean(
    String(row.fase_obra || '').trim() ||
    String(row.nome_contato || '').trim() ||
    String(row.email || '').trim() ||
    String(row.construtora || '').trim() ||
    String(row.razao_social || '').trim() ||
    String(row.obra_descricao || '').trim() ||
    String(row.endereco_obra || '').trim()
  );

  return Boolean(tipo && hasCoreData);
};

const isNatalPlaceholderRecord = (row: Record<string, unknown>) =>
  String(row.bloco_texto || '').includes('Nenhuma Licença Prévia, Licença de Instalação ou Licença de Operação identificada');

const SITES = [
  {
    id: 'idema',
    name: 'IDEMA',
    description: 'Licenças ambientais emitidas pelo Instituto de Desenvolvimento Sustentável e Meio Ambiente',
    url: 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/',
    icon: '🌿',
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    borderColor: 'border-emerald-500/20 hover:border-emerald-500/40',
    glowColor: 'hover:shadow-emerald-500/10',
  },
  {
    id: 'natal',
    name: 'Diário Oficial - Natal',
    description: 'Publicações oficiais da Prefeitura de Natal/RN',
    url: 'https://www.natal.rn.gov.br/dom/',
    icon: '🏛️',
    gradient: 'from-blue-500/10 to-blue-600/5',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
    borderColor: 'border-blue-500/20 hover:border-blue-500/40',
    glowColor: 'hover:shadow-blue-500/10',
  },
  {
    id: 'extremoz',
    name: 'Diário Oficial - Extremoz',
    description: 'Licenças e publicações oficiais extraídas dos PDFs do Diário Oficial de Extremoz/RN',
    url: 'https://extremoz.rn.gov.br/diario-oficial/',
    icon: '📄',
    gradient: 'from-amber-500/10 to-amber-600/5',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    borderColor: 'border-amber-500/20 hover:border-amber-500/40',
    glowColor: 'hover:shadow-amber-500/10',
  },
];


export default function Portal() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [scraping, setScraping] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SiteResult>>({});
  const [pages, setPages] = useState<Record<string, number>>({});
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>('extremoz');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('portal-visible-columns');
    if (!saved) return {};
    const parsed: Record<string, string[]> = JSON.parse(saved);
    // Migra nomes antigos e garante colunas obrigatórias do IDEMA
    if (parsed.idema) {
      parsed.idema = parsed.idema
        .map(c => c === 'Empreendimento' ? 'Fato Gerador' : c === 'Razão Social' ? 'Interessado' : c);
      if (!parsed.idema.includes('Nº Processo')) parsed.idema.unshift('Nº Processo');
    }
    return parsed;
  });
  const [columnLabels, setColumnLabels] = useState<Record<string, Record<string, string>>>(() => {
    const saved = localStorage.getItem('portal-column-labels');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('portal-column-labels', JSON.stringify(columnLabels));
  }, [columnLabels]);

  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(subMonths(new Date(), 1)));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [idemaTypeFilter, setIdemaTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('portal-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToResults = (siteId: string) => {
    if (!results[siteId]?.success) {
      const fetchFn = siteId === 'extremoz' ? fetchExtremozFromDb
        : siteId === 'natal' ? fetchNatalFromDb
          : siteId === 'idema' ? fetchIdemaFromDb
            : () => fetchSite(siteId);
      fetchFn().then(() => {
        setTimeout(() => sectionRefs.current[siteId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      });
      return;
    }
    sectionRefs.current[siteId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleReorder = useCallback((siteId: string, startIndex: number, endIndex: number) => {
    setVisibleColumns(prev => {
      const current = prev[siteId] || [];
      const result = Array.from(current);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { ...prev, [siteId]: result };
    });
  }, []);

  // Auto-load data on mount
  useEffect(() => {
    fetchExtremozFromDb();
    fetchNatalFromDb();
    fetchIdemaFromDb();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExtremozFromDb = async () => {
    setLoading((prev) => ({ ...prev, extremoz: true }));
    try {
      let query = supabase.from('licencas_extremoz').select('*').order('created_at', { ascending: false });

      if (search) {
        const q = `%${search}%`;
        query = query.or(`cnpj.ilike.${q},razao_social.ilike.${q},obra_descricao.ilike.${q},bloco_texto.ilike.${q},tipo_licenca.ilike.${q},email.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const relevantData = (data || []).filter((row) => {
        const tipo = String(row.tipo_licenca || '').trim();
        const isAllowed = ['Licença Prévia', 'Licença de Instalação', 'Licença de Operação'].includes(tipo);
        const hasCoreData = Boolean(
          row.obra_descricao || row.razao_social || row.nome_fantasia || row.email || row.bloco_texto
        );
        return isAllowed && hasCoreData;
      });

      const tableData = relevantData.map(row => ({
        'Data da Edição': formatDataEdicao(row.data_edicao || ''),
        'Tipo de Licença': row.tipo_licenca || '',
        'Fase da Obra': row.prioridade || '',
        'Construtora / Obra': row.razao_social || row.nome_fantasia || '',
        'Contato': row.nome_fantasia || '',
        'Email': row.email || '',
        'CNPJ': row.cnpj || '',
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

  // Client-side scraping for Extremoz (bypasses server IP block)
  const scrapeExtremoz = async () => {
    setScraping((prev) => ({ ...prev, extremoz: true }));
    const toastId = toast.loading('Buscando diários oficiais de Extremoz...');
    try {
      // Step 1: Fetch the listing page from user's browser
      const years = ['2026', '2025'];
      const pdfLinks: Array<{ href: string; title: string; date: string }> = [];

      for (const year of years) {
        const baseUrl = `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${year}/`;
        for (let page = 1; page <= 5; page++) {
          const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
          try {
            const resp = await fetch(url);
            if (!resp.ok) break;
            const html = await resp.text();

            // Extract PDF links
            const hrefRegex = /href="(https?:\/\/extremoz\.rn\.gov\.br\/wp-content\/uploads\/[^"]+\.(?:pdf|doc\.pdf))"/gi;
            let match;
            while ((match = hrefRegex.exec(html)) !== null) {
              const href = match[1];
              if (pdfLinks.some(p => p.href === href)) continue;
              const filename = href.split('/').pop() || '';
              const title = filename.replace(/\.doc\.pdf$|\.pdf$/i, '').replace(/-/g, ' ');
              pdfLinks.push({ href, title, date: '' });
            }

            if (!html.includes(`/page/${page + 1}`)) break;
          } catch {
            break;
          }
        }
        if (pdfLinks.length > 0) break; // found PDFs, stop
      }

      if (pdfLinks.length === 0) {
        toast.error('Nenhum PDF encontrado no site de Extremoz', { id: toastId });
        setScraping((prev) => ({ ...prev, extremoz: false }));
        return;
      }

      toast.loading(`Encontrados ${pdfLinks.length} PDFs. Verificando novos...`, { id: toastId });

      // Step 2: Check which PDFs are already in the database
      const { data: existing } = await supabase
        .from('licencas_extremoz')
        .select('pdf_link');
      const existingLinks = new Set((existing || []).map(r => r.pdf_link));
      const newPdfs = pdfLinks.filter(p => !existingLinks.has(p.href));

      if (newPdfs.length === 0) {
        toast.success('Banco de dados já está atualizado! Nenhum novo diário encontrado.', { id: toastId });
        setScraping((prev) => ({ ...prev, extremoz: false }));
        return;
      }

      toast.loading(`Processando ${newPdfs.length} novos PDFs...`, { id: toastId });

      // Step 3: Process new PDFs (limit to 5 at a time)
      const toProcess = newPdfs.slice(0, 5);
      let totalInserted = 0;

      for (const pdf of toProcess) {
        try {
          const resp = await fetch(pdf.href);
          if (!resp.ok) continue;
          const buffer = new Uint8Array(await resp.arrayBuffer());

          if (buffer.length > 2 * 1024 * 1024) {
            continue;
          }

          const raw = new TextDecoder('latin1').decode(buffer);
          const textParts: string[] = [];
          const btEtRegex = /BT\s([\s\S]*?)ET/g;
          let btMatch;
          while ((btMatch = btEtRegex.exec(raw)) !== null) {
            const block = btMatch[1];
            const tjRegex = /\(([^)]*)\)\s*Tj/g;
            let tjMatch;
            while ((tjMatch = tjRegex.exec(block)) !== null) {
              const decoded = tjMatch[1].replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\').trim();
              if (decoded) textParts.push(decoded);
            }
            const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
            let tjArrMatch;
            while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
              const strRegex = /\(([^)]*)\)/g;
              let strMatch;
              const parts: string[] = [];
              while ((strMatch = strRegex.exec(tjArrMatch[1])) !== null) {
                parts.push(strMatch[1].replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'));
              }
              const joined = parts.join('').trim();
              if (joined) textParts.push(joined);
            }
          }
          const text = textParts.join('\n');

          if (!text || text.length < 20) {
            continue;
          }

          const contexts: string[] = [];
          const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
          const cnpjs = [...new Set((text.match(cnpjRegex) || []).map(c => c.replace(/\s/g, '')))];

          if (cnpjs.length > 0) {
            for (const cnpj of cnpjs) {
              const idx = text.indexOf(cnpj);
              if (idx !== -1) contexts.push(text.substring(Math.max(0, idx - 350), Math.min(text.length, idx + 500)));
            }
          } else {
            contexts.push(text.substring(0, 1200));
          }

          for (const context of contexts) {
            const lower = context.toLowerCase();
            let tipo = '';
            if (/\bLP\b/i.test(context) || lower.includes('licença prévia')) tipo = 'Licença Prévia';
            else if (/\bLI\b/i.test(context) || lower.includes('licença de instalação')) tipo = 'Licença de Instalação';
            else if (/\bLO\b/i.test(context) || lower.includes('licença de operação')) tipo = 'Licença de Operação';

            if (!tipo) continue;

            const cnpjMatch = context.match(cnpjRegex);
            const cnpj = cnpjMatch?.[0]?.replace(/\s/g, '') || '';
            const emailMatch = context.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            const email = emailMatch?.[0] || '';
            const faseMatch = context.match(/(implantação[^,\.]{0,80}|instalação[^,\.]{0,80}|operação[^,\.]{0,80}|construção[^,\.]{0,80}|ampliação[^,\.]{0,80}|reforma[^,\.]{0,80})/i);
            const obraMatch = context.match(/((?:CONSTRUÇÃO|REFORMA|AMPLIAÇÃO|IMPLANTAÇÃO|PAVIMENTAÇÃO|LOTEAMENTO)[\s\S]{3,120}?)(?:[,.]|\s+localiz)/i);

            await supabase.from('licencas_extremoz').insert({
              data_edicao: pdf.title,
              tipo_licenca: tipo,
              cnpj,
              razao_social: '',
              nome_fantasia: '',
              email,
              prioridade: faseMatch?.[1]?.trim() || '',
              obra_descricao: obraMatch?.[1]?.replace(/\s+/g, ' ').trim() || '',
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: context.substring(0, 300),
            });
            totalInserted++;
          }
        } catch (err) {
          console.error('Erro ao processar PDF:', pdf.href, err);
        }
      }

      toast.success(`${totalInserted} novos registros importados de ${toProcess.length} PDFs!`, { id: toastId });
      // Reload data
      await fetchExtremozFromDb();
    } catch (err) {
      console.error('Scraping error:', err);
      toast.error('Erro ao fazer scraping de Extremoz', { id: toastId });
    } finally {
      setScraping((prev) => ({ ...prev, extremoz: false }));
    }
  };

  // ─── Natal: load from DB ────────────────────────────────────
  const fetchNatalFromDb = async () => {
    setLoading((prev) => ({ ...prev, natal: true }));
    try {
      let query = supabase.from('licencas_natal').select('*').order('created_at', { ascending: false });

      if (search) {
        const q = `%${search}%`;
        query = query.or(`cnpj.ilike.${q},razao_social.ilike.${q},obra_descricao.ilike.${q},bloco_texto.ilike.${q},tipo_licenca.ilike.${q},construtora.ilike.${q},nome_contato.ilike.${q},email.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const relevantData = (data || []).filter((row) => isNatalRelevantRecord(row as unknown as Record<string, unknown>));

      const tableData = relevantData.map(row => ({
        'Data da Edição': formatDataEdicao(row.data_edicao || ''),
        'Nº DOM': row.numero_dom || '',
        'Tipo de Licença': normalizeNatalLicenseType(row.tipo_licenca) || '',
        'Fase da Obra': (row as any).fase_obra || '',
        'Construtora': (row as any).construtora || '',
        'Contato': (row as any).nome_contato || '',
        'Email': (row as any).email || '',
        'Endereço da Obra': (row as any).endereco_obra || '',
        'Obra / Descrição': row.obra_descricao || '',
        'PDF': row.pdf_nome || '',
        'Link PDF': row.pdf_link || '',
        'Texto Encontrado': row.bloco_texto || '',
      }));

      setResults((prev) => ({
        ...prev,
        natal: {
          success: true,
          site: { id: 'natal', name: 'Diário Oficial - Natal', url: 'https://www.natal.rn.gov.br/dom/' },
          data: { text: `${tableData.length} registros relevantes encontrados no banco de dados.`, links: [], table: tableData },
          meta: { total_licencas: tableData.length },
          fetched_at: new Date().toISOString(),
        },
      }));
      if (tableData.length > 0) toast.success(`Natal: ${tableData.length} registros carregados`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro de conexão';
      setResults((prev) => ({ ...prev, natal: { success: false, error: message } }));
      toast.error('Erro ao carregar dados de Natal');
    } finally {
      setLoading((prev) => ({ ...prev, natal: false }));
    }
  };

  // ─── Natal: lista edições via list-dom-editions ──────────────────────────────
  // Download + parse de PDF roda no GitHub Actions (scripts/dom_natal_scraper.py).
  // Este botão apenas consulta quais edições existem no período selecionado.
  const scrapeNatal = async () => {
    setScraping((prev) => ({ ...prev, natal: true }));
    const toastId = toast.loading('Consultando edições disponíveis do DOM Natal...');
    try {
      const now = new Date();
      const from = dateFrom || startOfMonth(subMonths(now, 1));
      const to   = dateTo   || now;

      // Monta lista de meses sem repetição — ignora o dia selecionado
      const meses: { mes: number; ano: number }[] = [];
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const fim    = new Date(to.getFullYear(),   to.getMonth(),   1);
      while (cursor <= fim) {
        meses.push({ mes: cursor.getMonth() + 1, ano: cursor.getFullYear() });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      // Uma chamada por mês em paralelo — a API do DOM só aceita mes+ano por request
      const respostas = await Promise.all(
        meses.map(({ mes, ano }) =>
          supabase.functions.invoke('list-dom-editions', { body: { mes, ano } })
        )
      );

      let totalEdicoes = 0;
      for (const { data, error } of respostas) {
        if (!error && data?.success) totalEdicoes += data.edicoes?.length ?? 0;
      }

      toast.success(
        `${totalEdicoes} edição(ões) disponível(is) no período. Importação via GitHub Actions.`,
        { id: toastId },
      );
      await fetchNatalFromDb();
    } catch (err) {
      console.error('Erro ao listar edições Natal:', err);
      toast.error('Erro ao consultar edições do DOM Natal', { id: toastId });
    } finally {
      setScraping((prev) => ({ ...prev, natal: false }));
    }
  };

  // ─── IDEMA: load from DB ──────────────────────────────────────
  const fetchIdemaFromDb = async () => {
    setLoading((prev) => ({ ...prev, idema: true }));
    try {
      let query = supabase
        .from('licencas_idema')
        .select('*')
        .not('numero_processo', 'is', null)
        .order('data_formacao', { ascending: false });

      if (search) {
        const q = `%${search}%`;
        query = query.or(`cnpj.ilike.${q},interessado.ilike.${q},fato_gerador.ilike.${q},tipo_licenca.ilike.${q},numero_processo.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const tableData = (data || []).map(row => ({
        'Nº Processo': row.numero_processo || '',
        'Tipo de Licença': row.tipo_licenca || '',
        'Data Emissão': row.data_formacao ? format(new Date(row.data_formacao + 'T12:00:00'), 'dd/MM/yyyy') : '',
        'Interessado': row.interessado || '',
        'CNPJ': maskCNPJ(row.cnpj || ''),
        'Fato Gerador': row.fato_gerador || '',
        'Link PDF': row.url_licenca || '',
      }));

      setResults((prev) => ({
        ...prev,
        idema: {
          success: true,
          site: { id: 'idema', name: 'IDEMA', url: 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/' },
          data: { text: `${tableData.length} registros encontrados no banco de dados.`, links: [], table: tableData },
          meta: { total_licencas: tableData.length },
          fetched_at: new Date().toISOString(),
        },
      }));
      if (tableData.length > 0) toast.success(`IDEMA: ${tableData.length} licenças carregadas`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro de conexão';
      setResults((prev) => ({ ...prev, idema: { success: false, error: message } }));
      toast.error('Erro ao carregar dados do IDEMA');
    } finally {
      setLoading((prev) => ({ ...prev, idema: false }));
    }
  };

  // ─── IDEMA: scraping via edge function dedicada ────────────────
  const scrapeIdema = async () => {
    setScraping((prev) => ({ ...prev, idema: true }));
    const toastId = toast.loading('Buscando licenças do IDEMA...');
    const idemaUrl = 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/';

    try {
      const { data, error } = await supabase.functions.invoke('scrape-licencas-idema');

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const inseridos: number = data?.inseridos ?? 0;
      const totalScraped: number = data?.total_scraped ?? 0;

      if (totalScraped === 0) {
        setResults((prev) => ({
          ...prev,
          idema: {
            success: false,
            error: 'O IDEMA não retornou licenças no período. O site pode estar indisponível.',
            fallback_url: idemaUrl,
            site: { id: 'idema', name: 'IDEMA', url: idemaUrl },
          },
        }));
        toast.warning('IDEMA não retornou resultados.', { id: toastId });
        return;
      }

      toast.success(
        inseridos > 0
          ? `${inseridos} nova${inseridos === 1 ? '' : 's'} licença${inseridos === 1 ? '' : 's'} importada${inseridos === 1 ? '' : 's'} do IDEMA!`
          : `${totalScraped} licenças encontradas (sem novidades).`,
        { id: toastId },
      );
      await fetchIdemaFromDb();
    } catch (err) {
      console.error('Scraping IDEMA error:', err);
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setResults((prev) => ({
        ...prev,
        idema: {
          success: false,
          error: `Erro ao acessar o IDEMA: ${message}`,
          fallback_url: idemaUrl,
          site: { id: 'idema', name: 'IDEMA', url: idemaUrl },
        },
      }));
      toast.error('Erro ao acessar o IDEMA.', { id: toastId });
    } finally {
      setScraping((prev) => ({ ...prev, idema: false }));
    }
  };

  const fetchSite = async (siteId: string) => {
    if (siteId === 'extremoz') return fetchExtremozFromDb();
    if (siteId === 'natal') return fetchNatalFromDb();
    if (siteId === 'idema') return fetchIdemaFromDb();
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
    <AppLayout title="Portal de Consultas" subtitle="Consulte licenças e publicações oficiais de órgãos públicos." mainClassName="flex-1 overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 md:p-6 flex flex-col flex-1 min-h-0 gap-4 sm:gap-6">
        {/* Search bar */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
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
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal text-xs h-9 min-w-[130px]", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} captionLayout="dropdown-buttons" fromYear={2020} toYear={new Date().getFullYear() + 1} />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal text-xs h-9 min-w-[130px]", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} captionLayout="dropdown-buttons" fromYear={2020} toYear={new Date().getFullYear() + 1} />
              </PopoverContent>
            </Popover>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 flex-1 min-h-0 overflow-y-auto content-start">
          {SITES.map((site) => {
            const res = results[site.id];
            const isBusy = loading[site.id] || scraping[site.id];
            const recordCount = res?.data?.table?.length ?? null;
            const hasError = res && !res.success;
            const siteUrl = site.id === 'extremoz' ? 'https://extremoz.rn.gov.br/diario-oficial/' : site.url;

            return (
              <div
                key={site.id}
                className={`group relative flex flex-col rounded-xl border bg-card transition-all hover:shadow-md overflow-hidden ${site.borderColor}`}
              >
                {/* Acento de cor no topo */}
                <div className={`h-0.5 w-full bg-gradient-to-r ${site.gradient.replace('from-', 'from-').replace('/10', '/60').replace('/5', '/40')}`} />

                <div className="flex flex-col gap-3 p-4 flex-1">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${site.borderColor} bg-gradient-to-br ${site.gradient} text-base`}>
                        {site.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{site.name}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{site.description}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${site.badgeClass} shrink-0 text-[10px] font-medium`}>
                      <Globe className="h-2.5 w-2.5 mr-1" />
                      Gov
                    </Badge>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between text-[11px]">
                    {hasError ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]" title={res.error ?? ''}>Erro ao carregar</span>
                      </span>
                    ) : recordCount !== null ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {recordCount} registro{recordCount !== 1 ? 's' : ''} carregado{recordCount !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">Não carregado</span>
                    )}
                    <button
                      onClick={() => window.open(siteUrl, '_blank')}
                      className="ml-2 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      title="Abrir site"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Link de erro detalhado */}
                  {hasError && res.fallback_url && (
                    <a href={res.fallback_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-destructive/80 hover:text-destructive underline -mt-1">
                      Acessar site diretamente →
                    </a>
                  )}

                  {/* Botão de ação */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs mt-auto"
                    onClick={() => (site.id === 'extremoz' ? scrapeExtremoz() : site.id === 'natal' ? scrapeNatal() : site.id === 'idema' ? scrapeIdema() : fetchSite(site.id))}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    ) : (
                      <CloudDownload className="h-3 w-3 mr-1.5" />
                    )}
                    {scraping[site.id] ? 'Atualizando...' : loading[site.id] ? 'Carregando...' : 'Atualizar Dados'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tab-style buttons like reference image */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {SITES.map((site) => {
            const hasData = results[site.id]?.success;
            return (
              <button
                key={site.id}
                onClick={() => {
                  setActiveTab(site.id);
                  if (!results[site.id]?.success) {
                    if (site.id === 'extremoz') fetchExtremozFromDb();
                    else if (site.id === 'natal') fetchNatalFromDb();
                    else if (site.id === 'idema') fetchIdemaFromDb();
                    else fetchSite(site.id);
                  }
                }}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${activeTab === site.id
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                {site.name}
              </button>
            );
          })}
        </div>

        {/* Results area */}
        {activeTab && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-baseline gap-2">
                <CardTitle className="text-base">{SITES.find(s => s.id === activeTab)?.name}</CardTitle>
                {(() => {
                  const tableData = results[activeTab]?.data?.table;
                  if (!tableData?.length) return null;
                  const total = tableData.length;
                  const filtered = activeTab === 'idema' && idemaTypeFilter
                    ? tableData.filter((r: Record<string, string>) => r['Tipo de Licença'] === idemaTypeFilter).length
                    : total;
                  return (
                    <span className="text-xs text-muted-foreground/70">
                      {filtered !== total ? `(${filtered} de ${total} registros)` : `(${total} registros)`}
                    </span>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent>
              <div className="pr-1">
                {(
                  <div className="space-y-6 min-w-0">
                    {SITES.filter(site => site.id === activeTab).map((site) => {
                      const result = results[site.id];

                      if (!result) {
                        return (
                          <div key={site.id} className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                            Nenhum dado carregado ainda. Clique em <span className="font-medium text-foreground">Atualizar Dados</span> para consultar.
                          </div>
                        );
                      }

                      if (!result.success) {
                        return (
                          <div key={site.id} className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Não foi possível carregar dados do {site.name}.</p>
                            <p className="mt-1">{result.error || 'Erro na consulta.'}</p>
                          </div>
                        );
                      }

                      if (!result.data?.table?.length) {
                        return (
                          <div key={site.id} className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                            Nenhum registro encontrado para {site.name} no momento.
                          </div>
                        );
                      }

                      const allHeaders = Object.keys(result.data.table[0]).filter(h => h !== 'Texto Encontrado' && h !== 'Link PDF');

                      const currentVisible = visibleColumns[site.id] || allHeaders;
                      const headers = allHeaders.filter(h => currentVisible.includes(h));

                      const siteLabels = columnLabels[site.id] || {};
                      const colDefinitions = allHeaders.map(h => ({
                        id: h,
                        label: h,
                        customLabel: siteLabels[h] || undefined,
                      }));

                      const IDEMA_TIPOS = ['Licença Prévia', 'Licença de Instalação', 'Licença de Operação'];
                      const activeRows = site.id === 'idema' && idemaTypeFilter
                        ? result.data.table.filter(row => row['Tipo de Licença'] === idemaTypeFilter)
                        : result.data.table;

                      const currentPageSize = pageSizes[site.id] || 10;
                      const totalPages = Math.max(1, Math.ceil(activeRows.length / currentPageSize));
                      const currentPage = Math.min(pages[site.id] || 1, totalPages);
                      const paginatedRows = activeRows.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize);
                      return (
                        <div key={site.id} className="min-w-0" ref={(el) => { sectionRefs.current[site.id] = el; }}>
                          {/* filtros (esq) + opções/csv (dir) */}
                          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex flex-wrap gap-1.5">
                              {site.id === 'idema' && IDEMA_TIPOS.map(tipo => (
                                <button
                                  key={tipo}
                                  onClick={() => {
                                    setIdemaTypeFilter(prev => prev === tipo ? null : tipo);
                                    setPages(prev => ({ ...prev, idema: 1 }));
                                  }}
                                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    idemaTypeFilter === tipo
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground'
                                  }`}
                                >
                                  {tipo.replace('Licença ', '')}
                                </button>
                              ))}
                              {site.id === 'idema' && idemaTypeFilter && (
                                <button
                                  onClick={() => { setIdemaTypeFilter(null); setPages(prev => ({ ...prev, idema: 1 })); }}
                                  className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-destructive/60 hover:text-destructive transition-colors"
                                >
                                  Limpar
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <ColumnSettings
                                columns={colDefinitions}
                                visibleColumns={currentVisible}
                                onChange={(cols) => setVisibleColumns(prev => ({ ...prev, [site.id]: cols }))}
                                onRename={(colId, newLabel) => setColumnLabels(prev => ({
                                  ...prev,
                                  [site.id]: { ...(prev[site.id] || {}), [colId]: newLabel },
                                }))}
                              />
                              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => exportCsv(site.id)}>
                                <Download className="mr-1 h-3 w-3" /> CSV
                              </Button>
                            </div>
                          </div>
                          {/* Mobile card list — IDEMA only */}
                          {site.id === 'idema' && (
                            <div className="flex flex-col gap-3 md:hidden">
                              {paginatedRows.map((row, i) => (
                                <div key={`${site.id}-${currentPage}-${i}-m`} className="rounded-lg border bg-card p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-mono font-semibold text-primary text-xs leading-snug break-all">{row['Nº Processo']}</span>
                                    {idemaTypeBadge(row['Tipo de Licença'] ?? '')}
                                  </div>
                                  <div className="text-sm font-medium text-foreground leading-snug">{row['Interessado']}</div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{row['CNPJ']}</span>
                                    <span>{row['Data Emissão']}</span>
                                  </div>
                                  {row['Fato Gerador'] && (
                                    <p className="text-xs text-muted-foreground leading-snug">
                                      {row['Fato Gerador'].length > 120 ? row['Fato Gerador'].slice(0, 120) + '…' : row['Fato Gerador']}
                                    </p>
                                  )}
                                  {row['Link PDF'] && (
                                    <div className="pt-1.5 border-t">
                                      <a href={row['Link PDF']} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                        <ExternalLink className="h-3 w-3" /> Ver licença
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className={cn("w-full max-w-full overflow-x-auto rounded-md border overscroll-x-contain", site.id === 'idema' && "hidden md:block")}>
                            <table className={site.id === 'idema' ? "w-full min-w-[860px] text-sm table-fixed" : "min-w-[1100px] text-sm"}>
                              <thead>
                                <tr className="bg-muted/50 border-b border-border/60">
                                  <th className="px-2 py-2 w-8"></th>
                                  {headers.map((h) => {
                                    const idemaWidths: Record<string, string> = {
                                      'Nº Processo':    'w-[190px]',
                                      'Tipo de Licença':'w-[110px]',
                                      'Data Emissão':   'w-[104px]',
                                      'Interessado':    'w-[200px]',
                                      'CNPJ':           'w-[168px]',
                                      'Ações':          'w-[60px]',
                                    };
                                    const wClass = site.id === 'idema' ? (idemaWidths[h] ?? '') : '';
                                    return (
                                      <th key={h} className={cn("px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap", wClass)}>{siteLabels[h] || h}</th>
                                    );
                                  })}
                                  <th className={cn("px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap", site.id === 'idema' && 'w-[60px]')}>Ações</th>
                                  {site.id === 'idema' && <th className="w-8" />}
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedRows.map((row, i) => {
                                  const rowKey = `${site.id}-${currentPage}-${i}`;
                                  const isExpanded = expandedRows[rowKey];
                                  const colCount = headers.length + 2;
                                  return (
                                    <>
                                      <tr key={rowKey} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                                        <td className="px-2 py-2">
                                          {row['Texto Encontrado'] && (
                                            <button
                                              onClick={() => toggleRow(rowKey)}
                                              className="p-0.5 rounded hover:bg-accent"
                                            >
                                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                            </button>
                                          )}
                                        </td>
                                        {headers.map((h, hIdx) => {
                                          const rawVal = row[h] ?? '';
                                          // IDEMA: células com render customizado
                                          if (site.id === 'idema' && h === 'Tipo de Licença') {
                                            return (
                                              <td key={h} className="px-3 py-2.5">
                                                {idemaTypeBadge(rawVal)}
                                              </td>
                                            );
                                          }
                                          if (site.id === 'idema' && h === 'Data Emissão') {
                                            return (
                                              <td key={h} className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                                                {rawVal}
                                              </td>
                                            );
                                          }
                                          if (site.id === 'idema' && h === 'Nº Processo') {
                                            return (
                                              <td key={h} className="px-3 py-2.5 whitespace-nowrap font-semibold text-foreground font-mono text-xs">
                                                {rawVal}
                                              </td>
                                            );
                                          }
                                          if (site.id === 'idema' && h === 'CNPJ') {
                                            return (
                                              <td key={h} className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground font-mono">
                                                {rawVal}
                                              </td>
                                            );
                                          }
                                          if (site.id === 'idema' && h === 'Interessado') {
                                            return (
                                              <td key={h} className="px-3 py-2.5 text-xs text-muted-foreground">
                                                {rawVal}
                                              </td>
                                            );
                                          }
                                          if (site.id === 'idema' && h === 'Fato Gerador') {
                                            return (
                                              <td key={h} className="px-3 py-2.5 text-xs text-muted-foreground">
                                                {rawVal}
                                              </td>
                                            );
                                          }
                                          return (
                                            <td
                                              key={h}
                                              className={cn(
                                                "px-3 py-2.5 overflow-hidden",
                                                site.id === 'idema' ? "truncate" : "max-w-[200px] truncate",
                                                hIdx === 0 && site.id === 'idema' ? "font-semibold text-foreground font-mono text-xs" :
                                                hIdx === 0 ? "font-semibold text-foreground" :
                                                (h === 'Construtora / Obra' || h === 'Empresa') ? "font-medium text-foreground" :
                                                "font-normal text-muted-foreground"
                                              )}
                                              title={rawVal}
                                            >
                                              {rawVal}
                                            </td>
                                          );
                                        })}
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          {row['Link PDF'] && (
                                            <a
                                              href={row['Link PDF']}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              {site.id === 'idema' ? 'Ver' : 'PDF'}
                                            </a>
                                          )}
                                        </td>
                                        {site.id === 'idema' && <td className="w-8" />}
                                      </tr>
                                      {isExpanded && row['Texto Encontrado'] && (
                                        <tr key={`${rowKey}-text`} className="bg-muted/30">
                                          <td colSpan={colCount} className="px-4 py-3">
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">Texto Encontrado:</p>
                                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80 max-h-[200px] overflow-y-auto">
                                              {row['Texto Encontrado']}
                                            </p>
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                })}
                              </tbody>
                            </table>
                            <ListPagination
                              page={currentPage}
                              totalPages={totalPages}
                              totalItems={activeRows.length}
                              pageSize={currentPageSize}
                              onPageChange={(nextPage) => setPages((prev) => ({ ...prev, [site.id]: nextPage }))}
                              onPageSizeChange={(nextPageSize) => {
                                setPageSizes((prev) => ({ ...prev, [site.id]: nextPageSize }));
                                setPages((prev) => ({ ...prev, [site.id]: 1 }));
                              }}
                              itemLabel="registro"
                              itemLabelPlural="registros"
                              className="bg-muted/50 border-t border-border/60 px-3 py-2.5"
                            />
                          </div>
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

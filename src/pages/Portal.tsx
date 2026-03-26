import { useState, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ColumnSettings } from '@/components/ColumnSettings';

import { Loader2, Search, ExternalLink, Globe, AlertTriangle, RefreshCw, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CloudDownload, List, Settings2 } from 'lucide-react';
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
    url: 'https://www2.natal.rn.gov.br/dom/',
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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>('extremoz');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('portal-visible-columns');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('portal-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const ROWS_PER_PAGE = 10;
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
            // Too large, just register as entry
            await supabase.from('licencas_extremoz').insert({
              data_edicao: pdf.title,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: '(PDF muito grande para processamento automático)',
            });
            totalInserted++;
            continue;
          }

          // Basic PDF text extraction (same logic as edge function)
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
            await supabase.from('licencas_extremoz').insert({
              data_edicao: pdf.title,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: '(Texto não extraível - PDF baseado em imagem)',
            });
            totalInserted++;
            continue;
          }

          // Extract CNPJs
          const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
          const cnpjs = [...new Set((text.match(cnpjRegex) || []).map(c => c.replace(/\s/g, '')))];

          if (cnpjs.length === 0) {
            await supabase.from('licencas_extremoz').insert({
              data_edicao: pdf.title,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: text.substring(0, 500),
            });
            totalInserted++;
            continue;
          }

          for (const cnpj of cnpjs) {
            const idx = text.indexOf(cnpj);
            const context = text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400));
            const lower = context.toLowerCase();

            // Detect license type
            let tipo = '';
            if (lower.includes('licença prévia') || lower.includes('(lp)')) tipo = 'Licença Prévia';
            else if (lower.includes('licença de instalação') || lower.includes('(li)')) tipo = 'Licença de Instalação';
            else if (lower.includes('licença de operação') || lower.includes('(lo)')) tipo = 'Licença de Operação';
            else if (lower.includes('licença simplificada') || lower.includes('(ls)')) tipo = 'Licença Simplificada';
            else if (lower.includes('renovação de licença')) tipo = 'Renovação de Licença';
            else if (lower.includes('licença ambiental')) tipo = 'Licença Ambiental';

            const hasRelevant = tipo || lower.includes('licen') || lower.includes('construção') || lower.includes('loteamento') || lower.includes('empreendimento');
            if (!hasRelevant) continue;

            await supabase.from('licencas_extremoz').insert({
              data_edicao: pdf.title,
              tipo_licenca: tipo || 'Não identificada',
              cnpj,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: context.substring(0, 500),
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

      const tableData = (data || []).map(row => ({
        'Data da Edição': row.data_edicao || '',
        'Nº DOM': row.numero_dom || '',
        'Tipo de Licença': row.tipo_licenca || '',
        'CNPJ': row.cnpj || '',
        'Razão Social': row.razao_social || '',
        'Obra / Descrição': row.obra_descricao || '',
        'PDF': row.pdf_nome || '',
        'Link PDF': row.pdf_link || '',
        'Texto Encontrado': row.bloco_texto || '',
      }));

      setResults((prev) => ({
        ...prev,
        natal: {
          success: true,
          site: { id: 'natal', name: 'Diário Oficial - Natal', url: 'https://www2.natal.rn.gov.br/dom/' },
          data: { text: `${tableData.length} registros encontrados no banco de dados.`, links: [], table: tableData },
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

  // ─── Natal: client-side scraping ──────────────────────────────
  const scrapeNatal = async () => {
    setScraping((prev) => ({ ...prev, natal: true }));
    const toastId = toast.loading('Buscando diários oficiais de Natal...');
    try {
      // Fetch listing page for current month
      const now = new Date();
      const months = [
        { mes: String(now.getMonth() + 1).padStart(2, '0'), ano: String(now.getFullYear()) },
      ];
      // Also check previous month
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      months.push({ mes: String(prev.getMonth() + 1).padStart(2, '0'), ano: String(prev.getFullYear()) });

      const pdfLinks: Array<{ href: string; title: string; date: string; numero: string }> = [];

      for (const { mes, ano } of months) {
        try {
          const formData = new URLSearchParams();
          formData.append('mes', mes);
          formData.append('ano', ano);
          formData.append('list', 'Listar');

          const resp = await fetch('https://www2.natal.rn.gov.br/dom/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
          });
          if (!resp.ok) continue;
          const html = await resp.text();

          const linkRegex = /<a\s+href="(https?:\/\/www2\.natal\.rn\.gov\.br\/_anexos\/publicacao\/dom\/[^"]+\.pdf)"[^>]*>([^<]+)<\/a>/gi;
          let match;
          while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].trim();
            if (pdfLinks.some(p => p.href === href)) continue;
            const dateMatch = title.match(/(\d{2}\/\d{2}\/\d{4})/);
            const numMatch = title.match(/Num\.\s*(\d+)/i);
            pdfLinks.push({
              href,
              title,
              date: dateMatch ? dateMatch[1] : '',
              numero: numMatch ? numMatch[1] : '',
            });
          }
        } catch {
          // continue
        }
      }

      if (pdfLinks.length === 0) {
        toast.error('Nenhum PDF encontrado no DOM de Natal', { id: toastId });
        setScraping((prev) => ({ ...prev, natal: false }));
        return;
      }

      toast.loading(`Encontrados ${pdfLinks.length} PDFs. Verificando novos...`, { id: toastId });

      // Check existing
      const { data: existing } = await supabase.from('licencas_natal').select('pdf_link');
      const existingLinks = new Set((existing || []).map(r => r.pdf_link));
      const newPdfs = pdfLinks.filter(p => !existingLinks.has(p.href));

      if (newPdfs.length === 0) {
        toast.success('Banco de dados já está atualizado!', { id: toastId });
        setScraping((prev) => ({ ...prev, natal: false }));
        return;
      }

      toast.loading(`Processando ${newPdfs.length} novos PDFs...`, { id: toastId });

      const toProcess = newPdfs.slice(0, 5);
      let totalInserted = 0;

      for (const pdf of toProcess) {
        try {
          const resp = await fetch(pdf.href);
          if (!resp.ok) continue;
          const buffer = new Uint8Array(await resp.arrayBuffer());

          if (buffer.length > 3 * 1024 * 1024) {
            await supabase.from('licencas_natal').insert({
              data_edicao: pdf.date || pdf.title,
              numero_dom: pdf.numero,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: '(PDF muito grande para processamento automático)',
            });
            totalInserted++;
            continue;
          }

          // Basic PDF text extraction
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
            await supabase.from('licencas_natal').insert({
              data_edicao: pdf.date || pdf.title,
              numero_dom: pdf.numero,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: '(Texto não extraível - PDF baseado em imagem)',
            });
            totalInserted++;
            continue;
          }

          // Extract CNPJs
          const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
          const cnpjs = [...new Set((text.match(cnpjRegex) || []).map(c => c.replace(/\s/g, '')))];

          if (cnpjs.length === 0) {
            await supabase.from('licencas_natal').insert({
              data_edicao: pdf.date || pdf.title,
              numero_dom: pdf.numero,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: text.substring(0, 500),
            });
            totalInserted++;
            continue;
          }

          for (const cnpj of cnpjs) {
            const idx = text.indexOf(cnpj);
            const context = text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400));
            const lower = context.toLowerCase();

            let tipo = '';
            if (lower.includes('licença prévia') || lower.includes('(lp)')) tipo = 'Licença Prévia';
            else if (lower.includes('licença de instalação e operação')) tipo = 'Licença de Instalação e Operação';
            else if (lower.includes('licença de instalação') || lower.includes('(li)')) tipo = 'Licença de Instalação';
            else if (lower.includes('licença de operação') || lower.includes('(lo)')) tipo = 'Licença de Operação';
            else if (lower.includes('licença simplificada') || lower.includes('(ls)')) tipo = 'Licença Simplificada';
            else if (lower.includes('renovação de licença')) tipo = 'Renovação de Licença';
            else if (lower.includes('licença ambiental')) tipo = 'Licença Ambiental';
            else if (lower.includes('alvará')) tipo = 'Alvará';
            else if (lower.includes('autorização ambiental')) tipo = 'Autorização Ambiental';

            // Extract obra description
            let obra = '';
            const obraPatterns = [
              /(?:para\s+(?:a\s+|o\s+)?)((?:CONSTRUÇÃO|REFORMA|AMPLIAÇÃO|IMPLANTAÇÃO|PAVIMENTAÇÃO|LOTEAMENTO)[\s\S]{3,120}?)(?:[,.]|\s+localiz)/i,
              /empreendimento\s+(?:imobiliário\s+)?denominado\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
            ];
            for (const p of obraPatterns) {
              const m = context.match(p);
              if (m) { obra = m[1].replace(/\s+/g, ' ').trim(); break; }
            }

            const hasRelevant = tipo || lower.includes('licen') || lower.includes('construção') ||
              lower.includes('loteamento') || lower.includes('empreendimento') || lower.includes('alvará');
            if (!hasRelevant) continue;

            await supabase.from('licencas_natal').insert({
              data_edicao: pdf.date || pdf.title,
              numero_dom: pdf.numero,
              tipo_licenca: tipo || 'Não identificada',
              cnpj,
              razao_social: '',
              obra_descricao: obra,
              pdf_nome: pdf.href.split('/').pop() || '',
              pdf_link: pdf.href,
              bloco_texto: context.substring(0, 500),
            });
            totalInserted++;
          }
        } catch (err) {
          console.error('Erro ao processar PDF Natal:', pdf.href, err);
        }
      }

      toast.success(`${totalInserted} novos registros importados de ${toProcess.length} PDFs!`, { id: toastId });
      await fetchNatalFromDb();
    } catch (err) {
      console.error('Scraping Natal error:', err);
      toast.error('Erro ao fazer scraping de Natal', { id: toastId });
    } finally {
      setScraping((prev) => ({ ...prev, natal: false }));
    }
  };

  // ─── IDEMA: load from DB ──────────────────────────────────────
  const fetchIdemaFromDb = async () => {
    setLoading((prev) => ({ ...prev, idema: true }));
    try {
      let query = supabase.from('licencas_idema').select('*').order('created_at', { ascending: false });

      if (search) {
        const q = `%${search}%`;
        query = query.or(`cnpj.ilike.${q},razao_social.ilike.${q},empreendimento.ilike.${q},bloco_texto.ilike.${q},tipo_licenca.ilike.${q},municipio.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const tableData = (data || []).map(row => ({
        'Nº Licença': row.numero_licenca || '',
        'Tipo de Licença': row.tipo_licenca || '',
        'Data Emissão': row.data_emissao || '',
        'Validade': row.data_validade || '',
        'CNPJ': row.cnpj || '',
        'Razão Social': row.razao_social || '',
        'Empreendimento': row.empreendimento || '',
        'Município': row.municipio || '',
        'Atividade': row.atividade || '',
        'Porte': row.porte || '',
        'Link PDF': row.pdf_link || '',
        'Texto Encontrado': row.bloco_texto || '',
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

  // ─── IDEMA: client-side scraping with proxy fallback ────────────
  const scrapeIdema = async () => {
    setScraping((prev) => ({ ...prev, idema: true }));
    const toastId = toast.loading('Buscando licenças do IDEMA...');
    const idemaUrl = 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/';

    const extractTableFromHtml = (rawHtml: string): Array<Record<string, string>> => {
      const rows: Array<Record<string, string>> = [];
      const tableRegex = /<table[\s\S]*?<\/table>/gi;
      const tables = rawHtml.match(tableRegex);
      if (!tables) return rows;
      for (const table of tables) {
        const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
        const headers: string[] = [];
        let hMatch;
        while ((hMatch = headerRegex.exec(table)) !== null) {
          headers.push(hMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (headers.length < 2) continue;
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;
        let isFirst = true;
        while ((trMatch = trRegex.exec(table)) !== null) {
          if (isFirst && headers.length > 0) { isFirst = false; continue; }
          isFirst = false;
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          const row: Record<string, string> = {};
          let colIdx = 0;
          while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
            const key = headers[colIdx] || `col_${colIdx}`;
            row[key] = tdMatch[1].replace(/<br\s*\/?\s*>/gi, ' | ').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
            colIdx++;
          }
          if (Object.keys(row).length > 0) rows.push(row);
        }
      }
      return rows;
    };

    const processTableRows = async (tableData: Array<Record<string, string>>): Promise<number> => {
      let totalInserted = 0;
      for (const row of tableData) {
        const values = Object.values(row).join(' ');
        const cnpjMatch = values.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/);
        const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\s/g, '') : '';
        if (cnpj) {
          const { data: existing } = await supabase.from('licencas_idema').select('id').eq('cnpj', cnpj).limit(1);
          if (existing && existing.length > 0) continue;
        }
        const rowLower: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => { rowLower[k.toLowerCase()] = String(v); });
        const numeroLicenca = rowLower['nº licença'] || rowLower['nº'] || rowLower['numero'] || rowLower['licença'] || rowLower['n°'] || '';
        const tipoLicenca = rowLower['tipo'] || rowLower['tipo de licença'] || rowLower['tipo licença'] || '';
        const razaoSocial = rowLower['razão social'] || rowLower['empresa'] || rowLower['empreendedor'] || rowLower['interessado'] || '';
        const empreendimento = rowLower['empreendimento'] || rowLower['atividade'] || '';
        const hasRelevantData = Boolean(cnpj || numeroLicenca || tipoLicenca || razaoSocial || empreendimento);
        if (!hasRelevantData) continue;
        await supabase.from('licencas_idema').insert({
          numero_licenca: numeroLicenca, tipo_licenca: tipoLicenca,
          data_emissao: rowLower['emissão'] || rowLower['data'] || rowLower['data de emissão'] || rowLower['data emissão'] || '',
          data_validade: rowLower['validade'] || rowLower['data de validade'] || '',
          cnpj, razao_social: razaoSocial, empreendimento,
          municipio: rowLower['município'] || rowLower['municipio'] || rowLower['local'] || '',
          atividade: rowLower['atividade'] || '', porte: rowLower['porte'] || '',
          bloco_texto: Object.values(row).map(v => String(v)).join(' | ').substring(0, 500),
        });
        totalInserted++;
      }
      return totalInserted;
    };

    try {
      // Strategy 1: Direct browser fetch
      let html = '';
      try {
        const resp = await fetch(idemaUrl, { signal: AbortSignal.timeout(20000) });
        if (resp.ok) html = await resp.text();
      } catch (e) {
        console.log('IDEMA direct fetch failed (likely CORS):', e);
      }

      // Strategy 2: Edge Function proxy fallback
      if (!html) {
        toast.loading('CORS bloqueado. Tentando via servidor...', { id: toastId });
        try {
          const { data, error } = await supabase.functions.invoke('portal-scraper', {
            body: { site_id: 'idema', search: search || undefined },
          });
          if (!error && data?.success && data?.data?.table?.length > 0) {
            const inserted = await processTableRows(data.data.table);
            if (inserted > 0) {
              toast.success(`${inserted} registros importados do IDEMA!`, { id: toastId });
              await fetchIdemaFromDb();
              return;
            }
          }
          if (!error && data?.data?.text) {
            html = data.data.text; // Use extracted text as fallback
          }
        } catch (proxyErr) {
          console.log('IDEMA proxy also failed:', proxyErr);
        }
      }

      if (!html) {
        setResults((prev) => ({
          ...prev,
          idema: {
            success: false,
            error: 'O site do IDEMA está instável ou fora do ar. Tente novamente em alguns minutos ou acesse diretamente.',
            fallback_url: idemaUrl,
            site: { id: 'idema', name: 'IDEMA', url: idemaUrl },
          },
        }));
        toast.error('IDEMA inacessível no momento. Tente novamente mais tarde.', { id: toastId });
        return;
      }

      // Parse and import
      toast.loading('Processando dados do IDEMA...', { id: toastId });
      const tableData = extractTableFromHtml(html);
      let totalInserted = await processTableRows(tableData);

      // Fallback: extract CNPJs from text
      if (totalInserted === 0) {
        const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
        const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
        const cnpjs = [...new Set((textContent.match(cnpjRegex) || []).map(c => c.replace(/\s/g, '')))];
        for (const cnpj of cnpjs.slice(0, 50)) {
          const { data: existing } = await supabase.from('licencas_idema').select('id').eq('cnpj', cnpj).limit(1);
          if (existing && existing.length > 0) continue;
          const idx = textContent.indexOf(cnpj);
          const context = textContent.substring(Math.max(0, idx - 200), Math.min(textContent.length, idx + 300));
          await supabase.from('licencas_idema').insert({ cnpj, bloco_texto: context.substring(0, 500) });
          totalInserted++;
        }
      }

      if (totalInserted === 0) {
        setResults((prev) => ({
          ...prev,
          idema: {
            success: false,
            error: 'O IDEMA respondeu, mas sem resultados importáveis. Tente buscar com um CNPJ ou termo específico.',
            fallback_url: idemaUrl,
            site: { id: 'idema', name: 'IDEMA', url: idemaUrl },
          },
        }));
        toast.warning('IDEMA retornou página sem resultados válidos.', { id: toastId });
        return;
      }

      toast.success(`${totalInserted} registros importados do IDEMA!`, { id: toastId });
      await fetchIdemaFromDb();
    } catch (err) {
      console.error('Scraping IDEMA error:', err);
      setResults((prev) => ({
        ...prev,
        idema: {
          success: false,
          error: 'Erro ao acessar o portal do IDEMA. O site pode estar fora do ar.',
          fallback_url: idemaUrl,
          site: { id: 'idema', name: 'IDEMA', url: idemaUrl },
        },
      }));
      toast.error('Erro ao acessar site do IDEMA.', { id: toastId });
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {SITES.map((site) => (
            <Card key={site.id} className={`rounded-xl border ${site.borderColor} bg-gradient-to-br ${site.gradient} transition-all duration-300 ${site.glowColor} hover:shadow-lg group`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{site.icon}</span>
                    <div>
                      <CardTitle className="text-sm font-bold tracking-tight">{site.name}</CardTitle>
                      <CardDescription className="text-[11px] mt-0.5 leading-snug">{site.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${site.badgeClass} shrink-0 text-[10px] font-medium`}>
                    <Globe className="h-3 w-3 mr-1" />
                    Gov
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-1">

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs rounded-lg"
                    onClick={() => (site.id === 'extremoz' ? scrapeExtremoz() : site.id === 'natal' ? scrapeNatal() : site.id === 'idema' ? scrapeIdema() : fetchSite(site.id))}
                    disabled={loading[site.id] || scraping[site.id]}
                  >
                    {(loading[site.id] || scraping[site.id]) ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    ) : (
                      <CloudDownload className="h-3 w-3 mr-1.5" />
                    )}
                    {scraping[site.id] ? 'Atualizando...' : 'Atualizar Dados'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg opacity-60 hover:opacity-100"
                    onClick={() => window.open(
                      site.id === 'extremoz' ? 'https://extremoz.rn.gov.br/diario-oficial/' : site.url,
                      '_blank'
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Error status */}
                {results[site.id] && !results[site.id].success && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{results[site.id].error}</p>
                      {results[site.id].fallback_url && (
                        <a href={results[site.id].fallback_url} target="_blank" rel="noopener noreferrer" className="underline mt-1 inline-block opacity-80 hover:opacity-100">
                          Acessar site diretamente →
                        </a>
                      )}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          ))}
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
              <CardTitle className="text-base">{SITES.find(s => s.id === activeTab)?.name}</CardTitle>
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

                      const colDefinitions = allHeaders.map(h => ({
                        id: h,
                        label: h
                      }));

                      const currentPage = pages[site.id] || 0;
                      const totalPages = Math.ceil(result.data.table.length / ROWS_PER_PAGE);
                      const paginatedRows = result.data.table.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);
                      return (
                        <div key={site.id} className="min-w-0" ref={(el) => { sectionRefs.current[site.id] = el; }}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {site.name} ({result.data.table.length} registros)
                            </p>
                            <div className="flex items-center gap-2">
                              <ColumnSettings
                                columns={colDefinitions}
                                visibleColumns={currentVisible}
                                onChange={(cols) => setVisibleColumns(prev => ({ ...prev, [site.id]: cols }))}
                              />
                              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => exportCsv(site.id)}>
                                <Download className="mr-1 h-3 w-3" /> CSV
                              </Button>
                            </div>
                          </div>
                          <div className="w-full max-w-full overflow-x-auto rounded-md border overscroll-x-contain">
                            <table className="min-w-[1100px] text-xs">
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="px-2 py-2 w-8"></th>
                                  {headers.map((h) => (
                                    <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                                  ))}
                                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedRows.map((row, i) => {
                                  const rowKey = `${site.id}-${currentPage}-${i}`;
                                  const isExpanded = expandedRows[rowKey];
                                  const colCount = headers.length + 2;
                                  return (
                                    <>
                                      <tr key={rowKey} className="border-t border-border/50 hover:bg-accent/30">
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
                                        {headers.map((h) => (
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

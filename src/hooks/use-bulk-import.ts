import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolveClienteId, resolveFabricanteId, resolveObraId, resolveMarcadorId, resetResolveCache, preloadResolveCache } from '@/lib/import/resolve-entities';
import { computeRowHash } from '@/lib/import/row-hash';
import { resolveEspelhoPdfUrls, type ResolvePdfResult } from '@/lib/import/resolve-pedido-pdf';

export type ImportType = 'clientes' | 'negocios';

export interface ImportSummary {
  total: number;
  inserted: number;
  ignored: number;
  duplicados: number;
  motivosFalha: Record<string, number>;
}

const STATUS_MAP: Record<string, string> = {
  'novo lead': 'novo_lead',
  'elaboracao': 'elaboracao',
  'enviado': 'enviado',
  'negociacao': 'negociacao',
  'fechamento': 'fechamento',
};

function mapStatus(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return STATUS_MAP[normalized] ?? 'novo_lead';
}

/**
 * Extrai uma mensagem de erro legível de um erro do Postgres/PostgREST (ou de uma
 * exceção JS genérica), incluindo código/detalhes quando disponíveis, para que
 * linhas_ignoradas_importacao nunca receba um motivo genérico tipo "Falha desconhecida".
 */
function errorToMotivo(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [
      e.message,
      e.code ? `código: ${e.code}` : null,
      e.details ? `detalhes: ${e.details}` : null,
      e.hint ? `dica: ${e.hint}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }
  return fallback;
}

const PEDIDO_BATCH = 200;
const PEDIDO_CONCURRENCY = 4;
const CLIENTE_BATCH = 50;

export function useBulkImport() {
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  async function getVendedorId(): Promise<string> {
    const { data, error } = await supabase.rpc('get_my_vendedor_id');
    if (error || !data) {
      throw new Error('Não foi possível identificar o vendedor logado. Verifique se sua conta está vinculada a um registro de vendedor.');
    }
    return data as string;
  }

  async function logLinhaIgnorada(tipo: ImportType, dadosOriginais: Record<string, unknown>, motivo: string, nomeArquivo?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('linhas_ignoradas_importacao').insert({
      usuario_id: user.id,
      tipo_importacao: tipo,
      dados_originais: dadosOriginais,
      motivo_ignorado: motivo,
      nome_arquivo: nomeArquivo ?? null,
    });
  }

  async function importClientes(payload: Record<string, unknown>[], nomeArquivo?: string): Promise<ImportSummary> {
    const vendedorId = await getVendedorId();
    let inserted = 0;
    let ignored = 0;
    const motivosFalha: Record<string, number> = {};

    const trackFalha = (motivo: string) => {
      const key = motivo.length > 80 ? motivo.substring(0, 80) + '…' : motivo;
      motivosFalha[key] = (motivosFalha[key] || 0) + 1;
    };

    setImporting(true);
    try {
      for (let i = 0; i < payload.length; i += CLIENTE_BATCH) {
        const batch = payload.slice(i, i + CLIENTE_BATCH).map((row: any) => {
          const { __dateError: _stripped, ...cleanRow } = row;
          return { ...cleanRow, tipo: cleanRow.tipo || 'cliente', usuario_id: vendedorId };
        });

        const { error, count } = await supabase.from('clientes').insert(batch, { count: 'exact' });

        if (error) {
          for (const row of batch) {
            const { error: rowError } = await supabase.from('clientes').insert(row);
            if (rowError) {
              ignored++;
              trackFalha(rowError.message);
              await logLinhaIgnorada('clientes', row, rowError.message, nomeArquivo);
            } else {
              inserted++;
            }
          }
        } else {
          inserted += count ?? batch.length;
        }

        setProgress(Math.round(((i + batch.length) / payload.length) * 100));
      }

      toast({
        title: 'Importação concluída',
        description: `${inserted} de ${payload.length} clientes importados${ignored ? ` — ${ignored} foram para Linhas Ignoradas` : ''}`,
      });

      return { total: payload.length, inserted, ignored, duplicados: 0, motivosFalha };
    } finally {
      setImporting(false);
      setProgress(0);
    }
  }

  async function importNegocios(payload: Record<string, unknown>[], nomeArquivo?: string, funilIdParam?: string, empresaId?: string): Promise<ImportSummary> {
    const vendedorId = await getVendedorId();
    resetResolveCache();

    // Funil escolhido no wizard (quando a empresa tem mais de um); sem seleção,
    // cai no funil padrão da empresa.
    let funilId = funilIdParam;
    if (!funilId) {
      const { data: funilPadrao, error: funilErr } = await supabase
        .from('funis')
        .select('id')
        .eq('is_padrao', true)
        .maybeSingle();
      if (funilErr || !funilPadrao) {
        throw new Error('Não foi possível identificar o funil padrão da empresa para a importação.');
      }
      funilId = funilPadrao.id;
    }

    // Computa hashes, pré-carrega entidades e resolve PDFs de cotação do Bitrix em paralelo — são independentes entre si.
    let rowHashes: string[] = [];
    let pdfResults: Array<ResolvePdfResult | undefined> = [];
    try {
      [rowHashes, , pdfResults] = await Promise.all([
        Promise.all(payload.map(computeRowHash)),
        preloadResolveCache(payload, vendedorId).catch((err: Error) => {
          console.error('Preload de entidades falhou, resolução linha-a-linha será usada como fallback:', err.message);
        }),
        empresaId
          ? resolveEspelhoPdfUrls(payload.map(r => r.pdf_url as string | undefined), empresaId).catch((err: Error) => {
              console.error('Resolução de PDFs de cotação falhou, links originais do Bitrix serão mantidos:', err.message);
              return [] as Array<ResolvePdfResult | undefined>;
            })
          : Promise.resolve([] as Array<ResolvePdfResult | undefined>),
      ]);
    } catch (err) {
      console.error('Erro ao computar hashes ou pré-carregar entidades:', (err as Error).message);
    }

    // Carrega hashes já existentes no banco (chunks de 200 para não estourar URL do PostgREST)
    const existingHashes = new Set<string>();
    const HASH_CHUNK = 200;
    for (let i = 0; i < rowHashes.length; i += HASH_CHUNK) {
      const chunk = rowHashes.slice(i, i + HASH_CHUNK).filter(Boolean);
      if (chunk.length === 0) continue;
      const { data } = await supabase.from('pedidos').select('import_hash').in('import_hash', chunk);
      data?.forEach(r => { if (r.import_hash) existingHashes.add(r.import_hash); });
    }

    let inserted = 0;
    let ignored = 0;
    let duplicados = 0;
    const motivosFalha: Record<string, number> = {};

    const trackFalha = (motivo: string) => {
      const key = motivo.length > 80 ? motivo.substring(0, 80) + '…' : motivo;
      motivosFalha[key] = (motivosFalha[key] || 0) + 1;
    };

    // Divide o payload (e os hashes/PDFs correspondentes) em lotes de PEDIDO_BATCH linhas
    const batches: Array<{ rows: Record<string, unknown>[]; hashes: string[]; pdfResults: Array<ResolvePdfResult | undefined> }> = [];
    for (let i = 0; i < payload.length; i += PEDIDO_BATCH) {
      batches.push({
        rows: payload.slice(i, i + PEDIDO_BATCH),
        hashes: rowHashes.slice(i, i + PEDIDO_BATCH),
        pdfResults: pdfResults.slice(i, i + PEDIDO_BATCH),
      });
    }

    /**
     * Processa um lote: resolve entidades (cache hits após preload), faz um INSERT em lote,
     * e em caso de erro faz retry linha-a-linha.
     * Retorna os resultados parciais sem modificar estado React (thread-safe para Promise.all).
     */
    async function processBatch(batch: Record<string, unknown>[], batchHashes: string[], batchPdfResults: Array<ResolvePdfResult | undefined>): Promise<{
      inserted: number;
      duplicados: number;
      failures: Array<{ row: Record<string, unknown>; motivo: string; logToIgnoradas: boolean }>;
    }> {
      let batchInserted = 0;
      let batchDuplicados = 0;
      const failures: Array<{ row: Record<string, unknown>; motivo: string; logToIgnoradas: boolean }> = [];
      const batchPayloads: Record<string, unknown>[] = [];

      // Resolução de entidades por linha (sequencial dentro do lote; após preload são cache hits)
      for (let ri = 0; ri < batch.length; ri++) {
        const row = batch[ri];
        const hash = batchHashes[ri] ?? '';
        try {
          if ((row as any).__dateError) throw new Error((row as any).__dateError as string);

          // Deduplicação: hash já visto no banco ou em linhas anteriores deste import
          if (hash && existingHashes.has(hash)) {
            batchDuplicados++;
            failures.push({ row, motivo: 'Duplicado: linha idêntica já importada anteriormente', logToIgnoradas: true });
            continue;
          }

          const clienteNome = String(row.cliente ?? '').trim();
          const fabricanteNome = String(row.fabricante ?? '').trim();
          const obraNome = String(row.obra ?? '').trim();

          if (!clienteNome || !fabricanteNome) {
            throw new Error('Cliente e Fabricante são obrigatórios');
          }

          const clienteId = await resolveClienteId(clienteNome, vendedorId);
          const fabricanteId = await resolveFabricanteId(fabricanteNome);
          const obraId = obraNome ? await resolveObraId(obraNome, clienteId) : undefined;
          const marcadorNome = String(row.marcador ?? '').trim();
          const marcadorId = marcadorNome && empresaId ? await resolveMarcadorId(marcadorNome, empresaId) : undefined;

          // Reserva o hash antes do insert — evita duplicatas dentro do próprio arquivo
          if (hash) existingHashes.add(hash);

          // Anexo do negócio: se veio do Bitrix, resolveEspelhoPdfUrls já tentou baixar e
          // reidratar no Storage (resolveEspelhoPdfUrl). Falha no download não trava a
          // linha — mantém o link original do Bitrix e sinaliza em campos_extras.
          const rawPdfUrl = String(row.pdf_url ?? '').trim();
          const pdfResult = batchPdfResults[ri];
          const camposExtras: Record<string, string> = { ...(row.campos_extras as Record<string, string> ?? {}) };
          if (pdfResult?.falhaDownload) {
            camposExtras['Falha Anexo'] = 'Não foi possível baixar automaticamente o anexo do Bitrix; link original mantido.';
          }

          batchPayloads.push({
            cliente_id: clienteId,
            fabricante_id: fabricanteId,
            funil_id: funilId,
            obra_id: obraId,
            valor_total: row.valor,
            observacoes: row.observacoes,
            data_pedido: row.data_pedido,
            prazo_resposta: row.prazo_resposta ?? null,
            created_at: row.created_at ?? undefined,
            status: mapStatus(row.status),
            marcador_id: marcadorId ?? null,
            usuario_id: (row.usuario_id as string | undefined) ?? vendedorId,
            campos_extras: camposExtras,
            import_hash: hash || null,
            pdf_url: pdfResult?.url ?? (rawPdfUrl || null),
          });
        } catch (err) {
          failures.push({ row, motivo: (err as Error).message, logToIgnoradas: true });
        }
      }

      if (batchPayloads.length === 0) return { inserted: batchInserted, duplicados: batchDuplicados, failures };

      // INSERT em lote — se lançar (não só retornar {error}), cai no retry linha-a-linha
      // abaixo em vez de propagar e abortar o import inteiro silenciosamente.
      let batchError: { message?: string; code?: string; details?: string; hint?: string } | null = null;
      try {
        const { error } = await supabase.from('pedidos').insert(batchPayloads);
        batchError = error;
      } catch (err) {
        console.error('[import-pedidos] INSERT em lote lançou exceção, caindo para retry linha-a-linha:', (err as Error).message);
        batchError = err as Error;
      }

      if (batchError) {
        // Lote falhou: retry linha-a-linha, cada uma isolada em seu próprio try/catch,
        // para que uma falha não impeça as demais linhas do lote de serem inseridas.
        for (const pedidoRow of batchPayloads) {
          try {
            const { error: rowError } = await supabase.from('pedidos').insert(pedidoRow);
            if (rowError) {
              failures.push({ row: pedidoRow, motivo: errorToMotivo(rowError, 'Falha desconhecida ao inserir negócio'), logToIgnoradas: true });
            } else {
              batchInserted++;
            }
          } catch (err) {
            failures.push({ row: pedidoRow, motivo: errorToMotivo(err, 'Falha desconhecida ao inserir negócio'), logToIgnoradas: true });
          }
        }
      } else {
        batchInserted += batchPayloads.length;
      }

      return { inserted: batchInserted, duplicados: batchDuplicados, failures };
    }

    setImporting(true);
    try {
      let completedBatches = 0;

      // Processa lotes em grupos de PEDIDO_CONCURRENCY simultâneos
      for (let gi = 0; gi < batches.length; gi += PEDIDO_CONCURRENCY) {
        const group = batches.slice(gi, gi + PEDIDO_CONCURRENCY);

        const groupResults = await Promise.all(group.map(async (b) => {
          try {
            return await processBatch(b.rows, b.hashes, b.pdfResults);
          } catch (err) {
            // Defesa extra: mesmo um erro totalmente inesperado dentro de processBatch não
            // deve abortar os outros lotes em voo nem o restante do import. Isola o lote e
            // loga todas as suas linhas em linhas_ignoradas_importacao com o erro real.
            console.error(`[import-pedidos] Lote falhou inesperadamente (${b.rows.length} linhas), isolando do restante do import:`, (err as Error).message);
            return {
              inserted: 0,
              duplicados: 0,
              failures: b.rows.map(row => ({
                row,
                motivo: errorToMotivo(err, 'Falha inesperada ao processar o lote'),
                logToIgnoradas: true,
              })),
            };
          }
        }));

        completedBatches += group.length;

        // Agrega resultados e grava falhas em linhas_ignoradas (sequencial pós-grupo)
        for (const result of groupResults) {
          inserted += result.inserted;
          duplicados += result.duplicados;
          for (const { row, motivo, logToIgnoradas } of result.failures) {
            ignored++;
            trackFalha(motivo);
            if (logToIgnoradas) await logLinhaIgnorada('negocios', row, motivo, nomeArquivo);
          }
        }

        setProgress(Math.round((completedBatches / batches.length) * 100));
      }

      toast({
        title: 'Importação concluída',
        description: `${inserted} de ${payload.length} negócios importados${duplicados ? ` — ${duplicados} duplicados ignorados` : ''}${ignored - duplicados > 0 ? ` — ${ignored - duplicados} foram para Linhas Ignoradas` : ''}`,
      });

      return { total: payload.length, inserted, ignored, duplicados, motivosFalha };
    } finally {
      setImporting(false);
      setProgress(0);
    }
  }

  return { importClientes, importNegocios, importing, progress };
}

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolveClienteId, resolveFabricanteId, resolveObraId, resetResolveCache, preloadResolveCache } from '@/lib/import/resolve-entities';
import { computeRowHash } from '@/lib/import/row-hash';

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

  async function importNegocios(payload: Record<string, unknown>[], nomeArquivo?: string): Promise<ImportSummary> {
    const vendedorId = await getVendedorId();
    resetResolveCache();

    // Computa hashes e pré-carrega entidades em paralelo — são independentes entre si.
    let rowHashes: string[] = [];
    try {
      [rowHashes] = await Promise.all([
        Promise.all(payload.map(computeRowHash)),
        preloadResolveCache(payload, vendedorId).catch((err: Error) => {
          console.error('Preload de entidades falhou, resolução linha-a-linha será usada como fallback:', err.message);
        }),
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

    // Divide o payload (e os hashes correspondentes) em lotes de PEDIDO_BATCH linhas
    const batches: Array<{ rows: Record<string, unknown>[]; hashes: string[] }> = [];
    for (let i = 0; i < payload.length; i += PEDIDO_BATCH) {
      batches.push({
        rows: payload.slice(i, i + PEDIDO_BATCH),
        hashes: rowHashes.slice(i, i + PEDIDO_BATCH),
      });
    }

    /**
     * Processa um lote: resolve entidades (cache hits após preload), faz um INSERT em lote,
     * e em caso de erro faz retry linha-a-linha.
     * Retorna os resultados parciais sem modificar estado React (thread-safe para Promise.all).
     */
    async function processBatch(batch: Record<string, unknown>[], batchHashes: string[]): Promise<{
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

          // Reserva o hash antes do insert — evita duplicatas dentro do próprio arquivo
          if (hash) existingHashes.add(hash);

          batchPayloads.push({
            cliente_id: clienteId,
            fabricante_id: fabricanteId,
            obra_id: obraId,
            valor_total: row.valor,
            observacoes: row.observacoes,
            data_pedido: row.data_pedido,
            prazo_resposta: row.prazo_resposta ?? null,
            created_at: row.created_at ?? undefined,
            status: mapStatus(row.status),
            usuario_id: (row.usuario_id as string | undefined) ?? vendedorId,
            campos_extras: row.campos_extras ?? {},
            import_hash: hash || null,
          });
        } catch (err) {
          failures.push({ row, motivo: (err as Error).message, logToIgnoradas: true });
        }
      }

      if (batchPayloads.length === 0) return { inserted: batchInserted, failures };

      // INSERT em lote
      const { error } = await supabase.from('pedidos').insert(batchPayloads);

      if (error) {
        // Lote falhou: retry linha-a-linha para não perder o lote inteiro
        for (const pedidoRow of batchPayloads) {
          const { error: rowError } = await supabase.from('pedidos').insert(pedidoRow);
          if (rowError) {
            failures.push({ row: pedidoRow, motivo: rowError.message, logToIgnoradas: true });
          } else {
            batchInserted++;
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

        const groupResults = await Promise.all(group.map(b => processBatch(b.rows, b.hashes)));

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

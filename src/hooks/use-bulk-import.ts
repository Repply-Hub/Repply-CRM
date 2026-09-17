import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolveClienteId, resolveFabricanteId, resolveMarcadorId, resetResolveCache, preloadResolveCache } from '@/lib/import/resolve-entities';
import { computeRowHash } from '@/lib/import/row-hash';
import { resolveEspelhoPdfUrls, type ResolvePdfResult } from '@/lib/import/resolve-pedido-pdf';
import { enderecosDeAnexo, reagruparPorLinha } from '@/lib/import/anexos-da-planilha';
import { nomeDoAnexo } from '@/lib/anexos-do-negocio';
import { matchPedidoStatusToColuna, type ImportKanbanColuna } from '@/components/import-pedidos/importPedidosUtils';
import type { AlteracaoDeNegocio } from '@/lib/import/alteracoes-por-codigo';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

export type ImportType = 'clientes' | 'negocios';

export interface ResultadoDaAtualizacao {
  /** Quantos negócios a planilha mandou alterar. */
  pedidos: number;
  /** Quantos o banco de fato alterou. */
  aceitos: number;
  recusados: number;
  /** Erro de verdade, agrupado pela frase. Recusa silenciosa não aparece aqui. */
  motivos: Record<string, number>;
}

/**
 * A conta honesta do que aconteceu.
 *
 * 🔴 SEPARADA DA GRAVAÇÃO DE PROPÓSITO, para poder ser testada sem banco — e porque a regra
 * que ela carrega é a mais fácil de errar do trabalho inteiro.
 *
 * A política de `pedidos` deixa um vendedor comum EDITAR só os próprios negócios (ele VÊ os
 * da empresa toda, o que é outra coisa). Um `update` numa linha que a política recusa **não
 * dá erro**: ele simplesmente não altera nada e devolve zero linhas. Então "quantos foram
 * alterados" só se sabe contando o que voltou do `select()` da gravação — nunca somando o
 * que foi pedido.
 */
export function contarResultadoDaAtualizacao(
  pedidos: number,
  devolvidos: Array<{ id: string }>,
  errosDeVerdade: string[],
): ResultadoDaAtualizacao {
  const motivos: Record<string, number> = {};
  for (const motivo of errosDeVerdade) {
    const chave = motivo.length > 80 ? `${motivo.slice(0, 80)}…` : motivo;
    motivos[chave] = (motivos[chave] ?? 0) + 1;
  }
  const aceitos = devolvidos.length;
  return { pedidos, aceitos, recusados: Math.max(0, pedidos - aceitos), motivos };
}

export interface ImportSummary {
  total: number;
  inserted: number;
  ignored: number;
  motivosFalha: Record<string, number>;
}

/** Um anexo pronto para gravar: o endereço final (resolvido ou o cru) e se o download falhou. */
interface AnexoImportado {
  url: string;
  falhaDownload: boolean;
}

/**
 * O motivo com que um anexo não-gravado entra no relatório. 🔴 É AVISO, não recusa: o negócio
 * FOI importado (por isso não conta em `ignored`), só o anexo não colou. Negócio sem anexo se
 * recupera anexando pela tela; negócio não importado, não — por isso a falha do anexo nunca
 * derruba a linha.
 */
const MOTIVO_ANEXO_NAO_GRAVADO = 'Anexo não gravado (o negócio foi importado; anexe pela tela)';

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
        description: `${inserted} de ${payload.length} clientes importados${ignored ? ` — ${ignored} não importado(s)` : ''}`,
      });

      return { total: payload.length, inserted, ignored, motivosFalha };
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

    // Colunas reais do funil escolhido — as etapas são configuráveis por empresa (não um
    // enum fixo), então o status importado precisa ser casado contra elas em vez de um
    // dicionário fixo de 5 palavras-chave (isso fazia qualquer etapa customizada ou não
    // reconhecida cair sempre em "Novo Lead").
    let kanbanColunas: ImportKanbanColuna[] = [];

    // Computa hashes (só para gravar em `import_hash`, que marca o negócio como vindo de
    // importação — usado pelo filtro `p_hide_importados`; NÃO é mais usado para deduplicar:
    // linha repetida é cadastrada mesmo assim), pré-carrega entidades, resolve PDFs de
    // cotação do Bitrix e busca as colunas do funil em paralelo — são independentes entre si.
    // Um negócio pode ter VÁRIOS anexos: cada célula da coluna "Anexo" traz uma lista de
    // endereços separados por vírgula. `resolveEspelhoPdfUrls` recebe uma lista achatada (um
    // endereço por posição), então acho todos, resolvo de uma vez, e reagrupo por linha — o
    // índice de cada endereço é quem diz a que linha ele volta.
    const enderecosPorLinha = payload.map(r => enderecosDeAnexo(r.pdf_url));
    const todosEnderecos = enderecosPorLinha.flat();

    let rowHashes: string[] = [];
    let resolvidosAchatados: Array<ResolvePdfResult | undefined> = [];
    try {
      [rowHashes, , resolvidosAchatados, kanbanColunas] = await Promise.all([
        Promise.all(payload.map(computeRowHash)),
        preloadResolveCache(payload, vendedorId).catch((err: Error) => {
          console.error('Preload de entidades falhou, resolução linha-a-linha será usada como fallback:', err.message);
        }),
        empresaId
          ? resolveEspelhoPdfUrls(todosEnderecos, empresaId).catch((err: Error) => {
              console.error('Resolução de PDFs de cotação falhou, links originais do Bitrix serão mantidos:', err.message);
              return [] as Array<ResolvePdfResult | undefined>;
            })
          : Promise.resolve([] as Array<ResolvePdfResult | undefined>),
        supabase.from('kanban_colunas').select('slug, nome').eq('funil_id', funilId).order('ordem', { ascending: true })
          .then(({ data, error }) => {
            if (error) {
              console.error('Falha ao carregar colunas do funil para casar o status importado:', error.message);
              return [] as ImportKanbanColuna[];
            }
            return (data ?? []) as ImportKanbanColuna[];
          }),
      ]);
    } catch (err) {
      console.error('Erro ao computar hashes ou pré-carregar entidades:', (err as Error).message);
    }

    // De volta por linha, cada endereço já no formato de gravação: o endereço final (o resolvido
    // do Storage ou, quando não é do Bitrix / o download falhou, o cru — que ainda abre com o
    // balde público) e se o download falhou (só para avisar em `campos_extras`).
    const anexosPorLinha: AnexoImportado[][] = reagruparPorLinha(
      enderecosPorLinha.map(l => l.length),
      resolvidosAchatados,
    ).map((resolvidos, li) =>
      enderecosPorLinha[li].map((raw, ai) => {
        const resolvido = resolvidos[ai];
        return { url: resolvido?.url ?? raw, falhaDownload: resolvido?.falhaDownload ?? false };
      }),
    );

    let inserted = 0;
    let ignored = 0;
    const motivosFalha: Record<string, number> = {};

    const trackFalha = (motivo: string) => {
      const key = motivo.length > 80 ? motivo.substring(0, 80) + '…' : motivo;
      motivosFalha[key] = (motivosFalha[key] || 0) + 1;
    };

    // Divide o payload (e os hashes/anexos correspondentes) em lotes de PEDIDO_BATCH linhas
    const batches: Array<{ rows: Record<string, unknown>[]; hashes: string[]; anexos: AnexoImportado[][] }> = [];
    for (let i = 0; i < payload.length; i += PEDIDO_BATCH) {
      batches.push({
        rows: payload.slice(i, i + PEDIDO_BATCH),
        hashes: rowHashes.slice(i, i + PEDIDO_BATCH),
        anexos: anexosPorLinha.slice(i, i + PEDIDO_BATCH),
      });
    }

    /**
     * Processa um lote: resolve entidades (cache hits após preload), faz um INSERT em lote,
     * e em caso de erro faz retry linha-a-linha.
     * Retorna os resultados parciais sem modificar estado React (thread-safe para Promise.all).
     */
    async function processBatch(batch: Record<string, unknown>[], batchHashes: string[], batchAnexos: AnexoImportado[][]): Promise<{
      inserted: number;
      failures: Array<{ row: Record<string, unknown>; motivo: string; logToIgnoradas: boolean }>;
      /** Anexos que não gravaram — o negócio ENTROU, só o anexo não (aviso, não recusa). */
      anexosNaoGravados: number;
    }> {
      let batchInserted = 0;
      let anexosNaoGravados = 0;
      const failures: Array<{ row: Record<string, unknown>; motivo: string; logToIgnoradas: boolean }> = [];
      const batchPayloads: Record<string, unknown>[] = [];
      // Paralelo a `batchPayloads`: os anexos de cada negócio que passou na validação, para
      // prendê-los DEPOIS que o negócio existir (o anexo precisa do id do negócio).
      const anexosDosPayloads: AnexoImportado[][] = [];

      // Resolução de entidades por linha (sequencial dentro do lote; após preload são cache hits)
      for (let ri = 0; ri < batch.length; ri++) {
        const row = batch[ri];
        const hash = batchHashes[ri] ?? '';
        try {
          if ((row as any).__dateError) throw new Error((row as any).__dateError as string);

          // Sem deduplicação: linha repetida (dentro do arquivo ou idêntica a um negócio já
          // importado antes) é cadastrada como um negócio novo, por decisão de produto.

          const clienteNome = String(row.cliente ?? '').trim();
          const fabricanteNome = String(row.fabricante ?? '').trim();
          // Coluna "Obra/Endereço" da planilha vira texto livre em endereco_entrega —
          // a importação de negócios nunca cria/vincula registros na tabela `obras`,
          // que é uma entidade própria cadastrada manualmente por cliente.
          const enderecoEntrega = String(row.obra ?? '').trim();

          if (!clienteNome || !fabricanteNome) {
            throw new Error('Cliente e Fabricante são obrigatórios');
          }

          const clienteId = await resolveClienteId(clienteNome, vendedorId);
          const fabricanteId = await resolveFabricanteId(fabricanteNome);
          const marcadorNome = String(row.marcador ?? '').trim();
          const marcadorId = marcadorNome && empresaId ? await resolveMarcadorId(marcadorNome, empresaId) : undefined;

          // Anexos do negócio: se vieram do Bitrix, resolveEspelhoPdfUrls já tentou baixar e
          // reidratar no Storage. Falha no download não trava a linha — mantém o link original e
          // sinaliza em campos_extras. Eles são GRAVADOS depois do INSERT do negócio (precisam do
          // id), como linhas de `pedido_anexos` — não mais na coluna `pdf_url`.
          const anexosDaLinha = batchAnexos[ri] ?? [];
          const camposExtras: Record<string, string> = { ...(row.campos_extras as Record<string, string> ?? {}) };
          if (anexosDaLinha.some(a => a.falhaDownload)) {
            camposExtras['Falha Anexo'] = 'Não foi possível baixar automaticamente o anexo do Bitrix; link original mantido.';
          }

          batchPayloads.push({
            cliente_id: clienteId,
            fabricante_id: fabricanteId,
            funil_id: funilId,
            endereco_entrega: enderecoEntrega || null,
            valor_total: row.valor,
            observacoes: row.observacoes,
            data_pedido: row.data_pedido,
            prazo_resposta: row.prazo_resposta ?? null,
            created_at: row.created_at ?? undefined,
            status: matchPedidoStatusToColuna(row.status, kanbanColunas),
            marcador_id: marcadorId ?? null,
            usuario_id: (row.usuario_id as string | undefined) ?? vendedorId,
            campos_extras: camposExtras,
            import_hash: hash || null,
            // 🔴 `pdf_url` NÃO é mais escrita: os anexos têm tabela própria (`pedido_anexos`) e
            // são gravados abaixo, com o id do negócio. A coluna fica como rota de volta.
          });
          anexosDosPayloads.push(anexosDaLinha);
        } catch (err) {
          failures.push({ row, motivo: (err as Error).message, logToIgnoradas: true });
        }
      }

      if (batchPayloads.length === 0) return { inserted: batchInserted, failures, anexosNaoGravados };

      // As linhas de `pedido_anexos` de UM negócio (uma por endereço). `criado_por` fica nulo e o
      // `tipo` desconhecido, como na cópia que a migration fez dos anexos antigos — é dado
      // importado, sem autor na tela.
      const linhasDeAnexo = (pedidoId: string, anexos: AnexoImportado[]) =>
        anexos.map(a => ({ pedido_id: pedidoId, url: a.url, nome: nomeDoAnexo(a.url) }));

      // Grava um lote de linhas de `pedido_anexos` de uma vez. 🔴 Falha NÃO derruba negócio: ele
      // já existe. Devolve quantas linhas não colaram, para virar aviso no relatório.
      async function gravarLinhasDeAnexo(linhas: Array<{ pedido_id: string; url: string; nome: string }>): Promise<number> {
        if (linhas.length === 0) return 0;
        try {
          const { error } = await supabase.from('pedido_anexos').insert(linhas);
          if (error) {
            console.error('[import-pedidos] Anexos não gravados:', error.message);
            return linhas.length;
          }
          return 0;
        } catch (err) {
          console.error('[import-pedidos] Exceção ao gravar anexos:', (err as Error).message);
          return linhas.length;
        }
      }

      // INSERT em lote — pedindo os ids de volta (`.select('id')`), na ORDEM de entrada, para
      // prender os anexos ao negócio certo. Se lançar (não só retornar {error}), cai no retry
      // linha-a-linha abaixo em vez de propagar e abortar o import inteiro silenciosamente.
      let batchError: { message?: string; code?: string; details?: string; hint?: string } | null = null;
      let idsInseridos: Array<{ id: string }> = [];
      try {
        const { data, error } = await supabase.from('pedidos').insert(batchPayloads).select('id');
        batchError = error;
        idsInseridos = (data ?? []) as Array<{ id: string }>;
      } catch (err) {
        console.error('[import-pedidos] INSERT em lote lançou exceção, caindo para retry linha-a-linha:', (err as Error).message);
        batchError = err as Error;
      }

      if (batchError) {
        // Lote falhou: retry linha-a-linha, cada uma isolada em seu próprio try/catch,
        // para que uma falha não impeça as demais linhas do lote de serem inseridas.
        for (let k = 0; k < batchPayloads.length; k++) {
          const pedidoRow = batchPayloads[k];
          try {
            const { data, error: rowError } = await supabase.from('pedidos').insert(pedidoRow).select('id').single();
            if (rowError) {
              failures.push({ row: pedidoRow, motivo: errorToMotivo(rowError, 'Falha desconhecida ao inserir negócio'), logToIgnoradas: true });
            } else {
              batchInserted++;
              if (data?.id) anexosNaoGravados += await gravarLinhasDeAnexo(linhasDeAnexo(data.id, anexosDosPayloads[k]));
            }
          } catch (err) {
            failures.push({ row: pedidoRow, motivo: errorToMotivo(err, 'Falha desconhecida ao inserir negócio'), logToIgnoradas: true });
          }
        }
      } else {
        batchInserted += batchPayloads.length;
        // Liga os anexos pelos ids devolvidos, na MESMA ordem do INSERT (o PostgREST devolve na
        // ordem de entrada, e a RLS de INSERT de `pedidos` é tudo-ou-nada — não pula linha do
        // meio). 🔴 O pareamento é POSICIONAL, então só é seguro com um id por payload: se o
        // RETURNING vier de tamanho diferente do esperado, NÃO pareio (um anexo no negócio errado
        // é pior que anexo faltando) — trato os anexos do lote inteiro como aviso. Depois, um
        // INSERT só para todos os anexos do lote (não um por negócio): menos idas ao banco.
        if (idsInseridos.length !== batchPayloads.length) {
          console.error('[import-pedidos] RETURNING de tamanho inesperado (', idsInseridos.length, 'ids para', batchPayloads.length, 'negócios); anexos do lote viram aviso para não parear errado.');
          anexosNaoGravados += anexosDosPayloads.reduce((soma, a) => soma + a.length, 0);
        } else {
          const linhas = idsInseridos.flatMap((idRow, k) => linhasDeAnexo(idRow.id, anexosDosPayloads[k]));
          anexosNaoGravados += await gravarLinhasDeAnexo(linhas);
        }
      }

      return { inserted: batchInserted, failures, anexosNaoGravados };
    }

    setImporting(true);
    try {
      let completedBatches = 0;

      // Processa lotes em grupos de PEDIDO_CONCURRENCY simultâneos
      for (let gi = 0; gi < batches.length; gi += PEDIDO_CONCURRENCY) {
        const group = batches.slice(gi, gi + PEDIDO_CONCURRENCY);

        const groupResults = await Promise.all(group.map(async (b) => {
          try {
            return await processBatch(b.rows, b.hashes, b.anexos);
          } catch (err) {
            // Defesa extra: mesmo um erro totalmente inesperado dentro de processBatch não
            // deve abortar os outros lotes em voo nem o restante do import. Isola o lote e
            // loga todas as suas linhas em linhas_ignoradas_importacao com o erro real.
            console.error(`[import-pedidos] Lote falhou inesperadamente (${b.rows.length} linhas), isolando do restante do import:`, (err as Error).message);
            return {
              inserted: 0,
              failures: b.rows.map(row => ({
                row,
                motivo: errorToMotivo(err, 'Falha inesperada ao processar o lote'),
                logToIgnoradas: true,
              })),
              anexosNaoGravados: 0,
            };
          }
        }));

        completedBatches += group.length;

        // Agrega resultados e grava falhas em linhas_ignoradas (sequencial pós-grupo)
        for (const result of groupResults) {
          inserted += result.inserted;
          for (const { row, motivo, logToIgnoradas } of result.failures) {
            ignored++;
            trackFalha(motivo);
            if (logToIgnoradas) await logLinhaIgnorada('negocios', row, motivo, nomeArquivo);
          }
          // Anexos que não colaram entram no relatório como AVISO — sem `ignored++`, porque o
          // negócio foi importado. A pessoa vê "N anexos não gravados" e anexa pela tela.
          if (result.anexosNaoGravados > 0) {
            motivosFalha[MOTIVO_ANEXO_NAO_GRAVADO] = (motivosFalha[MOTIVO_ANEXO_NAO_GRAVADO] ?? 0) + result.anexosNaoGravados;
          }
        }

        setProgress(Math.round((completedBatches / batches.length) * 100));
      }

      toast({
        title: 'Importação concluída',
        description: `${inserted} de ${payload.length} negócios importados${ignored > 0 ? ` — ${ignored} não importado(s)` : ''}`,
      });

      return { total: payload.length, inserted, ignored, motivosFalha };
    } finally {
      setImporting(false);
      setProgress(0);
    }
  }

  /**
   * Grava as alterações vindas da planilha.
   *
   * Uma gravação POR NEGÓCIO, e isso é inevitável: cada um recebe valores diferentes, então
   * não existe um `update` só que sirva para todos. Segue o mesmo limite de concorrência da
   * inserção — mais que isso não acelera (a regra de segurança do banco é o gargalo) e
   * atrapalha o resto do app.
   */
  async function atualizarNegociosPorCodigo(
    alteracoes: AlteracaoDeNegocio[],
    aoProgredir?: (feitos: number) => void,
  ): Promise<ResultadoDaAtualizacao> {
    const devolvidos: Array<{ id: string }> = [];
    const erros: string[] = [];
    let feitos = 0;

    const fila = [...alteracoes];
    const trabalhador = async () => {
      for (;;) {
        const item = fila.shift();
        if (!item) return;
        try {
          const { data, error } = await supabase
            .from('pedidos')
            .update(item.patch)
            .eq('id', item.id)
            .select('id');
          if (error) throw error;
          // Vazio aqui NÃO é erro: é a política do banco recusando em silêncio.
          if (data && data.length > 0) devolvidos.push({ id: item.id });
        } catch (err) {
          erros.push(mensagemDeErro(err, 'Não foi possível atualizar'));
        } finally {
          feitos += 1;
          aoProgredir?.(feitos);
        }
      }
    };

    await Promise.all(Array.from({ length: PEDIDO_CONCURRENCY }, () => trabalhador()));
    return contarResultadoDaAtualizacao(alteracoes.length, devolvidos, erros);
  }

  return { importClientes, importNegocios, atualizarNegociosPorCodigo, importing, progress };
}

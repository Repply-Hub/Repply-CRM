/**
 * Backfill: reidrata no Supabase Storage os anexos de `pedidos` que ainda apontam
 * direto para o CDN do Bitrix24 (`pdf_url` contendo "cdn.bitrix24.com.br").
 *
 * Motivo: até a correção em supabase/functions/resolve-pedido-anexo/index.ts, o
 * download rodava no navegador (src/lib/import/resolve-pedido-pdf.ts) e falhava
 * silenciosamente por CORS — a CDN do Bitrix24 não envia Access-Control-Allow-Origin
 * (confirmado com curl), então o fetch() client-side sempre caía no fallback e mantinha
 * o link original do Bitrix. Todo pedido importado antes da correção ficou com o link
 * externo (que pode expirar) em vez do link do nosso Storage.
 *
 * Idempotente: só seleciona pedidos cujo `pdf_url` ainda bate com o padrão do CDN do
 * Bitrix; uma vez migrado, o `pdf_url` passa a apontar para o Storage e não é
 * selecionado de novo numa reexecução.
 *
 * Uso:
 *   SUPABASE_URL='https://hukeirrmsoiowvvrhivx.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *   npx tsx scripts/backfill-pedido-anexos.ts
 *
 * Adicione --dry-run para apenas listar quantos pedidos seriam afetados, sem gravar nada.
 */
import { createClient } from '@supabase/supabase-js'

const BITRIX_CDN_FILTER = '%cdn.bitrix24.com.br%'
const PAGE_SIZE = 500
const EDGE_FUNCTION_CHUNK_SIZE = 40

interface ResolvePdfResult {
  url: string
  falhaDownload: boolean
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Ver instruções de uso no topo deste arquivo.`)
  }
  return value
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log(dryRun ? '[backfill] Rodando em modo --dry-run (nenhuma escrita será feita).' : '[backfill] Rodando em modo real (COMMIT por linha).')

  // usuario_id -> empresa_id: pedidos não tem empresa_id direto (ver CLAUDE.md,
  // "Legacy table overlap"), precisa passar por usuarios.
  const { data: usuarios, error: usuariosError } = await supabase.from('usuarios').select('id, empresa_id')
  if (usuariosError) throw usuariosError
  const empresaIdByUsuarioId = new Map((usuarios ?? []).map(u => [u.id, u.empresa_id as string]))

  let totalEncontrados = 0
  let totalMigrados = 0
  let totalFalhas = 0
  let totalSemEmpresa = 0
  let page = 0

  for (;;) {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id, usuario_id, pdf_url')
      .ilike('pdf_url', BITRIX_CDN_FILTER)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) throw error
    if (!pedidos || pedidos.length === 0) break

    totalEncontrados += pedidos.length
    console.log(`[backfill] Página ${page}: ${pedidos.length} pedidos com link cru do Bitrix.`)

    // Agrupa por empresa — a Edge Function recebe um empresaId único por chamada
    // (é ele que compõe o path de destino no bucket "pedido-anexos").
    const porEmpresa = new Map<string, Array<{ id: string; pdf_url: string }>>()
    for (const p of pedidos) {
      const empresaId = empresaIdByUsuarioId.get(p.usuario_id)
      if (!empresaId) {
        totalSemEmpresa++
        console.warn(`[backfill] Pedido ${p.id}: usuario_id ${p.usuario_id} sem empresa_id resolvido, pulando.`)
        continue
      }
      const lista = porEmpresa.get(empresaId) ?? []
      lista.push({ id: p.id, pdf_url: p.pdf_url as string })
      porEmpresa.set(empresaId, lista)
    }

    for (const [empresaId, lista] of porEmpresa) {
      for (let i = 0; i < lista.length; i += EDGE_FUNCTION_CHUNK_SIZE) {
        const chunk = lista.slice(i, i + EDGE_FUNCTION_CHUNK_SIZE)

        if (dryRun) {
          console.log(`[backfill] [dry-run] empresa ${empresaId}: ${chunk.length} pedidos seriam resolvidos.`)
          continue
        }

        const { data, error: invokeError } = await supabase.functions.invoke<{ results: ResolvePdfResult[] }>(
          'resolve-pedido-anexo',
          { body: { urls: chunk.map(c => c.pdf_url), empresaId } },
        )

        if (invokeError || !data?.results) {
          totalFalhas += chunk.length
          console.error(`[backfill] Chamada à Edge Function falhou para empresa ${empresaId}:`, invokeError?.message)
          continue
        }

        for (let ci = 0; ci < chunk.length; ci++) {
          const result = data.results[ci]
          const pedido = chunk[ci]
          if (!result || result.falhaDownload) {
            totalFalhas++
            console.warn(`[backfill] Pedido ${pedido.id}: download/upload falhou, mantendo link original.`)
            continue
          }

          const { error: updateError } = await supabase
            .from('pedidos')
            .update({ pdf_url: result.url })
            .eq('id', pedido.id)

          if (updateError) {
            totalFalhas++
            console.error(`[backfill] Pedido ${pedido.id}: falha ao gravar novo pdf_url:`, updateError.message)
          } else {
            totalMigrados++
          }
        }
      }
    }

    page++
  }

  console.log('\n[backfill] Resumo final')
  console.log(`  Encontrados com link cru do Bitrix: ${totalEncontrados}`)
  console.log(`  Migrados com sucesso: ${totalMigrados}`)
  console.log(`  Falhas (download/upload ou sem empresa): ${totalFalhas + totalSemEmpresa}`)
}

main().catch(err => {
  console.error('[backfill] Erro fatal:', err)
  process.exit(1)
})

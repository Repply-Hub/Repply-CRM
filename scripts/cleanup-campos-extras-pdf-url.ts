/**
 * Cleanup: remove a chave "pdf_url" de dentro de `pedidos.campos_extras`.
 *
 * Motivo: importações antigas (pré-refatoração do fluxo de anexos) duplicavam o valor
 * bruto do PDF vindo do Bitrix24 dentro de `campos_extras`, além da coluna estruturada
 * `pedidos.pdf_url`. Essa cópia nunca passa pela Edge Function `resolve-pedido-anexo` —
 * fica parada com o link original do Bitrix (às vezes corrompido por uma conversão de
 * locale que trocou pontos por vírgulas, ex: "cdn,bitrix24,com,br/...,pdf"). A coluna
 * `pedidos.pdf_url` real já está corretamente migrada para o Storage; esta chave em
 * `campos_extras` é só lixo duplicado que pode vazar em telas que renderizam campos
 * extras genericamente (ex: EditarPedido.tsx, drawer de detalhe em Negocios.tsx).
 *
 * Idempotente: só afeta pedidos cujo `campos_extras` ainda tem a chave "pdf_url"; uma
 * vez removida, não é selecionado de novo numa reexecução.
 *
 * Uso:
 *   SUPABASE_URL='https://hukeirrmsoiowvvrhivx.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *   npx tsx scripts/cleanup-campos-extras-pdf-url.ts
 *
 * Adicione --dry-run para apenas listar quantos pedidos seriam afetados, sem gravar nada.
 */
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 500

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

  console.log(dryRun ? '[cleanup] Rodando em modo --dry-run (nenhuma escrita será feita).' : '[cleanup] Rodando em modo real (UPDATE por linha).')

  let totalEncontrados = 0
  let totalLimpos = 0
  let totalFalhas = 0

  for (;;) {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id, campos_extras')
      .not('campos_extras->>pdf_url', 'is', null)
      .range(0, PAGE_SIZE - 1)
    if (error) throw error
    if (!pedidos || pedidos.length === 0) break

    totalEncontrados += pedidos.length
    console.log(`[cleanup] Encontrados nesta página: ${pedidos.length} pedidos com "pdf_url" dentro de campos_extras.`)

    for (const p of pedidos) {
      const campos = { ...(p.campos_extras as Record<string, unknown>) }
      const valorBruto = campos.pdf_url
      delete campos.pdf_url

      console.log(`  id=${p.id}: removendo campos_extras.pdf_url=[${valorBruto}]`)

      if (dryRun) continue

      const { error: updateError } = await supabase
        .from('pedidos')
        .update({ campos_extras: campos })
        .eq('id', p.id)

      if (updateError) {
        totalFalhas++
        console.error(`[cleanup] Pedido ${p.id}: falha ao gravar campos_extras:`, updateError.message)
      } else {
        totalLimpos++
      }
    }

    // Em modo real, as linhas já processadas saem do filtro na próxima iteração
    // (pdf_url foi removido); em dry-run, não há reescrita, então evita loop infinito.
    if (dryRun) break
  }

  console.log('\n[cleanup] Resumo final')
  console.log(`  Encontrados com "pdf_url" em campos_extras: ${totalEncontrados}`)
  console.log(`  Limpos com sucesso: ${totalLimpos}`)
  console.log(`  Falhas: ${totalFalhas}`)
}

main().catch(err => {
  console.error('[cleanup] Erro fatal:', err)
  process.exit(1)
})

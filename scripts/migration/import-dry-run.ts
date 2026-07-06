/**
 * import-dry-run.ts - importa os arquivos gerados por export.ts para um banco de STAGING,
 * dentro de uma unica transacao que e SEMPRE revertida (ROLLBACK) no final, nunca commitada.
 *
 * Isso garante que rodar este script contra um projeto de staging (ou ate, por engano, contra
 * producao) nunca deixa dado nenhum gravado - o pior caso e o dry-run falhar e nao reportar nada.
 *
 * Alem da integridade referencial (o Postgres ja valida FKs/UNIQUE/CHECK durante os INSERTs
 * dentro da transacao), roda uma auditoria de RLS: lista as policies das tabelas do grafo e
 * sinaliza qualquer policy de SELECT cujo `qual` seja literalmente `true` (leitura liberada pra
 * qualquer authenticated, sem checar empresa_id/user_id) - e exatamente o tipo de achado que
 * vira um vazamento cross-tenant apos a consolidacao (ver INVESTIGACAO.md secao 4,
 * configuracoes_automacao).
 *
 * A mecanica de insert (SAVEPOINT por tabela) e a auditoria de RLS vivem em lib/import-shared.ts,
 * compartilhadas com import.ts (o import REAL, que commita) - a unica diferenca deste script e
 * terminar sempre em ROLLBACK, nunca COMMIT.
 *
 * Uso:
 *   DEST_DB_URL='postgresql://...' IMPORT_CLIENT_SLUG='cliente-x' \
 *     npx tsx scripts/migration/import-dry-run.ts [--in-dir scripts/migration/exports]
 */
import { connect } from './lib/db'
import { loadExportedClient, insertAllTables, auditRlsPolicies } from './lib/import-shared'

function parseInDir(): string {
  const idx = process.argv.indexOf('--in-dir')
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return 'scripts/migration/exports'
}

async function main() {
  const clientSlug = process.env.IMPORT_CLIENT_SLUG
  if (!clientSlug) {
    throw new Error('Defina IMPORT_CLIENT_SLUG (mesmo slug usado no export.ts)')
  }

  const { tableRows } = loadExportedClient(parseInDir(), clientSlug)
  const dest = await connect('DEST_DB_URL')

  try {
    await dest.query('BEGIN')

    const results = await insertAllTables(dest, tableRows)

    console.log('=== Resultado do import (dry-run, dentro de transacao) ===\n')
    let anyError = false
    for (const r of results) {
      if (r.error) {
        anyError = true
        console.log(`  [ERRO] ${r.table}: ${r.inserted}/${r.attempted} inseridas - ${r.error}`)
      } else {
        console.log(`  [OK] ${r.table}: ${r.inserted}/${r.attempted} inseridas`)
      }
    }

    await auditRlsPolicies(dest)

    console.log('\n=== Revertendo tudo (ROLLBACK) - nenhum dado foi persistido no staging ===')
    await dest.query('ROLLBACK')

    if (anyError) {
      console.log('\nDry-run encontrou erro(s) de integridade. Corrija antes de repetir ou de agendar o import real.')
      process.exitCode = 1
    } else {
      console.log('\nDry-run OK: todas as tabelas importariam sem violar integridade referencial no schema atual do staging.')
    }
  } catch (err) {
    await dest.query('ROLLBACK').catch(() => undefined)
    console.error('Falha inesperada no import-dry-run.ts (transacao revertida):', err)
    process.exitCode = 1
  } finally {
    await dest.end()
  }
}

main().catch((err) => {
  console.error('Falha no import-dry-run.ts:', err)
  process.exitCode = 1
})

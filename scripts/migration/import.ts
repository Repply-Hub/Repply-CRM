/**
 * import.ts - a versao REAL do import: escreve de fato no projeto destino (COMMIT), diferente de
 * import-dry-run.ts (que sempre reverte). So deve ser rodado depois que o dry-run correspondente
 * passou limpo - ver RUNBOOK.md, secao "Import real (import.ts)".
 *
 * Protecoes, nesta ordem:
 *   1. Flag de confirmacao explicita: --confirm=<slug> precisa ser IDENTICA a IMPORT_CLIENT_SLUG.
 *      Sem isso, o script aborta ANTES de conectar no banco - nao ha chance de rodar "sem querer"
 *      contra o projeto errado so por esquecer um argumento.
 *   2. Idempotencia: se ja existir um log de import COMMITADO para este clientSlug em
 *      scripts/migration/logs/<clientSlug>/, aborta sem tocar no banco.
 *   3. Checagem de colisao de UUID (mesma logica de inventory.ts, a partir dos arquivos
 *      exportados) contra o destino - aborta se encontrar qualquer colisao. Nao ha flag pra
 *      pular essa checagem.
 *   4. Import de verdade: BEGIN, insere tabela por tabela com SAVEPOINT (lib/import-shared.ts,
 *      igual ao dry-run), roda a auditoria de RLS AINDA DENTRO da transacao. Se a auditoria achar
 *      qualquer [RISCO] (policy de SELECT sem escopo de empresa/usuario) ou qualquer erro de
 *      insert, faz ROLLBACK automatico. So COMMITA se tudo passar limpo.
 *   5. Log de auditoria (scripts/migration/logs/, git-ignorado): timestamp, cliente, contagem de
 *      linhas por tabela, hash sha256 dos dados de origem usados, e o resultado (commitado /
 *      revertido / abortado + motivo).
 *
 * Uso:
 *   DEST_DB_URL='postgresql://...' IMPORT_CLIENT_SLUG='cliente-x' \
 *     npx tsx scripts/migration/import.ts --confirm=cliente-x [--in-dir scripts/migration/exports]
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { connect } from './lib/db'
import { ALL_TABLES } from './lib/graph'
import { loadExportedClient, insertAllTables, auditRlsPolicies, checkCollisions } from './lib/import-shared'

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

function parseInDir(): string {
  return parseFlag('in-dir') ?? 'scripts/migration/exports'
}

function logsDirFor(clientSlug: string): string {
  return join('scripts/migration/logs', clientSlug)
}

/** Hash determinístico dos dados de origem usados neste import (para o log de auditoria). */
function computeSourceChecksum(inDir: string): string {
  const hash = createHash('sha256')
  for (const t of ALL_TABLES) {
    const fileName = t.name.replace('.', '__') + '.json'
    const filePath = join(inDir, fileName)
    if (existsSync(filePath)) {
      hash.update(t.name)
      hash.update(readFileSync(filePath))
    }
  }
  return hash.digest('hex')
}

interface ImportLog {
  clientSlug: string
  startedAt: string
  finishedAt: string
  status: 'committed' | 'rolled_back' | 'aborted'
  reason?: string
  sourceChecksum: string
  tables?: Record<string, { attempted: number; inserted: number }>
  rlsFindings?: { table: string; policyname: string; cmd: string; qual: string }[]
}

function writeLog(clientSlug: string, log: ImportLog): string {
  const dir = logsDirFor(clientSlug)
  mkdirSync(dir, { recursive: true })
  const fileName = `${log.finishedAt.replace(/[:.]/g, '-')}.json`
  const filePath = join(dir, fileName)
  writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8')
  return filePath
}

function findPreviousCommit(clientSlug: string): string | null {
  const dir = logsDirFor(clientSlug)
  if (!existsSync(dir)) return null

  for (const fileName of readdirSync(dir)) {
    if (!fileName.endsWith('.json')) continue
    const log = JSON.parse(readFileSync(join(dir, fileName), 'utf-8')) as ImportLog
    if (log.status === 'committed') return join(dir, fileName)
  }
  return null
}

async function main() {
  const startedAt = new Date().toISOString()
  const clientSlug = process.env.IMPORT_CLIENT_SLUG
  if (!clientSlug) {
    throw new Error('Defina IMPORT_CLIENT_SLUG (mesmo slug usado no export.ts)')
  }

  // 1. Flag de confirmacao - checada ANTES de qualquer conexao com o banco.
  const confirm = parseFlag('confirm')
  if (!confirm) {
    console.error(
      `Recusando rodar sem confirmacao explicita. Passe --confirm=${clientSlug} para confirmar que este e de fato o cliente sendo importado.`
    )
    process.exitCode = 1
    return
  }
  if (confirm !== clientSlug) {
    console.error(
      `--confirm="${confirm}" nao bate com IMPORT_CLIENT_SLUG="${clientSlug}". Abortando antes de conectar no banco - confira qual cliente voce pretendia importar.`
    )
    process.exitCode = 1
    return
  }

  // 2. Idempotencia - log de um import ja commitado para este cliente.
  const previousCommit = findPreviousCommit(clientSlug)
  if (previousCommit) {
    console.error(
      `Ja existe um import COMMITADO para "${clientSlug}" registrado em ${previousCommit}. Recusando rodar de novo para nao duplicar/corromper dado. Se isso for esperado (ex.: reprocessar apos um rollback manual dos dados), apague ou mova esse log primeiro e confirme manualmente que o destino esta limpo.`
    )
    process.exitCode = 1
    return
  }

  const inDir = parseInDir()
  const { tableRows } = loadExportedClient(inDir, clientSlug)
  const sourceChecksum = computeSourceChecksum(join(inDir, clientSlug))

  const dest = await connect('DEST_DB_URL')

  try {
    // 3. Checagem de colisao de UUID - nao ha flag pra pular.
    console.log('=== Checagem de colisao de UUID contra o destino ===\n')
    const collisions = await checkCollisions(dest, tableRows)
    if (collisions.length > 0) {
      for (const c of collisions) {
        console.error(`  [COLISAO] ${c.table}: ${c.collidingIds.length} id(s) ja existem no destino (${c.collidingIds.slice(0, 5).join(', ')})`)
      }
      const finishedAt = new Date().toISOString()
      const logPath = writeLog(clientSlug, {
        clientSlug,
        startedAt,
        finishedAt,
        status: 'aborted',
        reason: `Colisao de UUID em ${collisions.length} tabela(s) - ver RUNBOOK.md "Conflito de colisao de UUID"`,
        sourceChecksum,
      })
      console.error(`\nAbortando sem abrir transacao de escrita. Log em ${logPath}`)
      process.exitCode = 1
      return
    }
    console.log('  Nenhuma colisao encontrada.\n')

    // 4. Import real dentro de uma transacao - so commita se tudo (inserts + auditoria de RLS) passar.
    await dest.query('BEGIN')

    const results = await insertAllTables(dest, tableRows)
    console.log('=== Resultado do import ===\n')
    let anyInsertError = false
    for (const r of results) {
      if (r.error) {
        anyInsertError = true
        console.log(`  [ERRO] ${r.table}: ${r.inserted}/${r.attempted} inseridas - ${r.error}`)
      } else {
        console.log(`  [OK] ${r.table}: ${r.inserted}/${r.attempted} inseridas`)
      }
    }

    const rlsFindings = await auditRlsPolicies(dest)
    const riskyFindings = rlsFindings.filter((f) => f.risky)

    const tablesSummary = Object.fromEntries(results.map((r) => [r.table, { attempted: r.attempted, inserted: r.inserted }]))

    if (anyInsertError || riskyFindings.length > 0) {
      await dest.query('ROLLBACK')
      const reason = anyInsertError
        ? 'erro de integridade em uma ou mais tabelas (ver [ERRO] acima)'
        : `auditoria de RLS encontrou ${riskyFindings.length} policy(ies) sem escopo de empresa/usuario (ver [RISCO] acima)`

      const finishedAt = new Date().toISOString()
      const logPath = writeLog(clientSlug, {
        clientSlug,
        startedAt,
        finishedAt,
        status: 'rolled_back',
        reason,
        sourceChecksum,
        tables: tablesSummary,
        rlsFindings: riskyFindings.map(({ table, policyname, cmd, qual }) => ({ table, policyname, cmd, qual })),
      })

      console.error(`\nROLLBACK automatico - ${reason}.`)
      console.error(`Nenhum dado foi persistido. Log em ${logPath}`)
      process.exitCode = 1
      return
    }

    await dest.query('COMMIT')

    const finishedAt = new Date().toISOString()
    const logPath = writeLog(clientSlug, {
      clientSlug,
      startedAt,
      finishedAt,
      status: 'committed',
      sourceChecksum,
      tables: tablesSummary,
    })

    console.log(`\nCOMMIT realizado - dados de "${clientSlug}" persistidos no destino.`)
    console.log(`Log de auditoria em ${logPath}`)
  } catch (err) {
    await dest.query('ROLLBACK').catch(() => undefined)
    const finishedAt = new Date().toISOString()
    const logPath = writeLog(clientSlug, {
      clientSlug,
      startedAt,
      finishedAt,
      status: 'aborted',
      reason: err instanceof Error ? err.message : String(err),
      sourceChecksum,
    })
    console.error(`Falha inesperada - transacao revertida. Log em ${logPath}`, err)
    process.exitCode = 1
  } finally {
    await dest.end()
  }
}

main().catch((err) => {
  console.error('Falha no import.ts:', err)
  process.exitCode = 1
})

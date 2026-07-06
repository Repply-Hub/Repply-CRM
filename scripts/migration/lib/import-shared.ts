/**
 * Logica de import compartilhada entre import-dry-run.ts (sempre ROLLBACK) e import.ts (COMMIT
 * real, com confirmacao explicita). Extraida para nao duplicar a mecanica de insert com
 * SAVEPOINT por tabela nem a auditoria de RLS - qualquer mudanca aqui vale para os dois scripts
 * igualmente, evitando que dry-run e import real divirjam silenciosamente com o tempo.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { tableExists, splitSchemaTable, primaryKeyColumns } from './db'
import { ALL_TABLES, PUBLIC_TABLES } from './graph'

export interface CollisionResult {
  table: string
  collidingIds: string[]
}

export interface ImportResult {
  table: string
  attempted: number
  inserted: number
  error: string | null
}

export interface RlsFinding {
  table: string
  policyname: string
  cmd: string
  qual: string
  risky: boolean
}

export interface LoadedExport {
  inDir: string
  manifest: { clientSlug: string; exportedAt: string; tables: Record<string, { rowCount: number; exported: boolean }> }
  tableRows: Map<string, Record<string, unknown>[]>
}

/** Le manifest.json + os arquivos <tabela>.json exportados por export.ts para um cliente. */
export function loadExportedClient(exportsBaseDir: string, clientSlug: string): LoadedExport {
  const inDir = join(exportsBaseDir, clientSlug)
  const manifestPath = join(inDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json nao encontrado em ${inDir} - rode export.ts primeiro`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  const tableRows = new Map<string, Record<string, unknown>[]>()
  for (const t of ALL_TABLES) {
    const fileName = t.name.replace('.', '__') + '.json'
    const filePath = join(inDir, fileName)
    if (!existsSync(filePath)) continue

    const rows = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>[]
    const expectedCount = manifest.tables?.[t.name]?.rowCount
    if (typeof expectedCount === 'number' && expectedCount !== rows.length) {
      throw new Error(
        `${t.name}: manifest.json diz ${expectedCount} linhas mas o arquivo tem ${rows.length} - export pode estar truncado/corrompido`
      )
    }
    tableRows.set(t.name, rows)
  }

  return { inDir, manifest, tableRows }
}

/**
 * Insere as linhas de uma tabela dentro de um SAVEPOINT proprio - um erro de constraint numa
 * tabela nao aborta a transacao inteira, entao as tabelas seguintes (e a auditoria de RLS depois)
 * continuam rodando e o relatorio mostra todos os problemas de uma vez.
 */
export async function insertRows(client: Client, qualifiedName: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
  const { schema, table } = splitSchemaTable(qualifiedName)
  const result: ImportResult = { table: qualifiedName, attempted: rows.length, inserted: 0, error: null }

  if (rows.length === 0) return result

  const exists = await tableExists(client, schema, table)
  if (!exists) {
    result.error = 'tabela nao existe no destino - crie o schema antes de importar'
    return result
  }

  const columns = Object.keys(rows[0])
  const columnList = columns.map((c) => `"${c}"`).join(', ')
  const savepoint = `sp_${table.replace(/[^a-z0-9_]/gi, '_')}`

  try {
    await client.query(`SAVEPOINT ${savepoint}`)
    for (const row of rows) {
      const values = columns.map((c) => row[c])
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(`INSERT INTO ${schema}.${table} (${columnList}) VALUES (${placeholders})`, values)
      result.inserted++
    }
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    result.inserted = 0
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }

  return result
}

/** Insere todas as tabelas do grafo, na ordem de graph.ts, dentro da transacao ja aberta em `client`. */
export async function insertAllTables(client: Client, tableRows: Map<string, Record<string, unknown>[]>): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  for (const t of ALL_TABLES) {
    const rows = tableRows.get(t.name)
    if (!rows) {
      results.push({ table: t.name, attempted: 0, inserted: 0, error: null })
      continue
    }
    results.push(await insertRows(client, t.name, rows))
  }
  return results
}

/**
 * Mesma checagem de colisao de UUID do inventory.ts, mas a partir dos arquivos ja exportados
 * (nao exige uma conexao com a origem) - usada pelo import.ts antes de abrir qualquer transacao
 * de escrita real. So compara tabelas com PK de uma unica coluna (todas as do grafo atual).
 */
export async function checkCollisions(dest: Client, tableRows: Map<string, Record<string, unknown>[]>): Promise<CollisionResult[]> {
  const results: CollisionResult[] = []

  for (const t of ALL_TABLES) {
    const rows = tableRows.get(t.name)
    if (!rows || rows.length === 0) continue

    const { schema, table } = splitSchemaTable(t.name)
    const exists = await tableExists(dest, schema, table)
    if (!exists) continue

    const pkCols = await primaryKeyColumns(dest, schema, table)
    if (pkCols.length !== 1) continue
    const pkColumn = pkCols[0]

    if (!(pkColumn in rows[0])) continue
    const sourceIds = rows.map((r) => String(r[pkColumn]))

    const { rows: destRows } = await dest.query(
      `SELECT "${pkColumn}"::text AS pk FROM ${schema}.${table} WHERE "${pkColumn}"::text = ANY($1::text[])`,
      [sourceIds]
    )
    const collidingIds = destRows.map((r) => String(r.pk))

    if (collidingIds.length > 0) {
      results.push({ table: t.name, collidingIds })
    }
  }

  return results
}

/**
 * Lista as RLS policies das tabelas do grafo e sinaliza qualquer policy de SELECT cujo `qual`
 * seja literalmente `true`/vazio (leitura liberada pra qualquer authenticated, sem checar
 * empresa_id/user_id) - o tipo de achado que vira vazamento cross-tenant apos a consolidacao.
 */
export async function auditRlsPolicies(client: Client): Promise<RlsFinding[]> {
  const findings: RlsFinding[] = []
  console.log('\n=== Auditoria de RLS (destino) ===\n')

  for (const t of PUBLIC_TABLES) {
    const { rows } = await client.query(
      `SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
      [t.name]
    )

    if (rows.length === 0) {
      console.log(`  [SEM POLICY] ${t.name}: nenhuma RLS policy encontrada no destino`)
      continue
    }

    for (const p of rows) {
      const qual = (p.qual ?? '').toString().trim()
      const isSelect = p.cmd === 'r' || p.cmd === 'SELECT' || p.cmd === '*'
      const risky = isSelect && (qual === 'true' || qual === '')

      findings.push({ table: t.name, policyname: p.policyname, cmd: p.cmd, qual, risky })

      if (risky) {
        console.log(
          `  [RISCO] ${t.name}.${p.policyname} (${p.cmd}): qual = "${qual || '(vazio)'}" - leitura nao escopada por empresa_id/user_id, vaza entre empresas apos consolidacao`
        )
      } else {
        console.log(`  [ok] ${t.name}.${p.policyname} (${p.cmd}): ${qual.slice(0, 80)}`)
      }
    }
  }

  return findings
}

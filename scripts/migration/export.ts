/**
 * export.ts - le do projeto ORIGEM e escreve arquivos JSON locais. NUNCA toca no destino.
 *
 * Uso:
 *   SOURCE_DB_URL='postgresql://...' EXPORT_CLIENT_SLUG='cliente-x' \
 *     npx tsx scripts/migration/export.ts [--out-dir scripts/migration/exports]
 *
 * Gera, dentro de <out-dir>/<EXPORT_CLIENT_SLUG>/:
 *   - um <tabela>.json por tabela do grafo (array de linhas, na ordem de import de graph.ts)
 *   - manifest.json com contagens e timestamp, para o import-dry-run.ts validar contra o
 *     inventario original (detectar arquivo truncado/corrompido antes de importar)
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { connect, tableExists, splitSchemaTable } from './lib/db'
import { ALL_TABLES } from './lib/graph'

function parseOutDir(): string {
  const idx = process.argv.indexOf('--out-dir')
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return 'scripts/migration/exports'
}

async function exportTable(client: Client, qualifiedName: string): Promise<unknown[] | null> {
  const { schema, table } = splitSchemaTable(qualifiedName)
  const exists = await tableExists(client, schema, table)
  if (!exists) return null
  const { rows } = await client.query(`SELECT * FROM ${schema}.${table}`)
  return rows
}

async function main() {
  const clientSlug = process.env.EXPORT_CLIENT_SLUG
  if (!clientSlug) {
    throw new Error('Defina EXPORT_CLIENT_SLUG (identificador do cliente sendo exportado, ex.: "acme-materiais")')
  }

  const source = await connect('SOURCE_DB_URL')
  const outDir = join(parseOutDir(), clientSlug)
  mkdirSync(outDir, { recursive: true })

  const manifest: Record<string, { rowCount: number; exported: boolean }> = {}

  try {
    console.log(`Exportando cliente "${clientSlug}" para ${outDir}\n`)

    for (const t of ALL_TABLES) {
      const rows = await exportTable(source, t.name)
      const fileName = t.name.replace('.', '__') + '.json'

      if (rows === null) {
        console.log(`  [PULADO] ${t.name} - tabela nao existe no schema ao vivo`)
        manifest[t.name] = { rowCount: 0, exported: false }
        continue
      }

      writeFileSync(join(outDir, fileName), JSON.stringify(rows, null, 2), 'utf-8')
      manifest[t.name] = { rowCount: rows.length, exported: true }
      console.log(`  [OK] ${t.name}: ${rows.length} linha(s) -> ${fileName}`)
    }

    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify(
        {
          clientSlug,
          exportedAt: new Date().toISOString(),
          tables: manifest,
        },
        null,
        2
      ),
      'utf-8'
    )

    console.log(`\nExport concluido. manifest.json gravado em ${outDir}/manifest.json`)
  } finally {
    await source.end()
  }
}

main().catch((err) => {
  console.error('Falha no export.ts:', err)
  process.exitCode = 1
})

/**
 * inventory.ts - relatorio de leitura, NAO escreve nada.
 *
 * Aponta para o projeto Supabase de um cliente (via connection string em env var) e gera:
 *  - contagem de linhas em cada tabela do grafo (ALL_TABLES)
 *  - contagem de usuarios em auth.users
 *  - se SOURCE_DB_URL e DEST_DB_URL forem ambas passadas: checagem de colisao de UUID
 *    (compara os ids de auth.users e das tabelas com PK propria entre origem e destino)
 *
 * Uso:
 *   SOURCE_DB_URL='postgresql://...' npx tsx scripts/migration/inventory.ts
 *   SOURCE_DB_URL='postgresql://...' DEST_DB_URL='postgresql://...' npx tsx scripts/migration/inventory.ts
 */
import type { Client } from 'pg'
import { connect, tableExists, splitSchemaTable, primaryKeyColumns } from './lib/db'
import { ALL_TABLES } from './lib/graph'

interface TableCount {
  table: string
  exists: boolean
  rowCount: number | null
}

async function countRows(client: Client, qualifiedName: string): Promise<TableCount> {
  const { schema, table } = splitSchemaTable(qualifiedName)
  const exists = await tableExists(client, schema, table)
  if (!exists) {
    return { table: qualifiedName, exists: false, rowCount: null }
  }
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS count FROM ${schema}.${table}`)
  return { table: qualifiedName, exists: true, rowCount: Number(rows[0].count) }
}

async function collectIds(client: Client, qualifiedName: string): Promise<{ ids: Set<string>; pkColumn: string | null }> {
  const { schema, table } = splitSchemaTable(qualifiedName)
  const exists = await tableExists(client, schema, table)
  if (!exists) return { ids: new Set(), pkColumn: null }

  const pkCols = await primaryKeyColumns(client, schema, table)
  if (pkCols.length !== 1) {
    // PK composta ou tabela sem PK - checagem de colisao por id unico nao se aplica
    // (nenhuma tabela do grafo atual cai nesse caso, mas fica defendido caso mude)
    return { ids: new Set(), pkColumn: null }
  }

  const pkColumn = pkCols[0]
  const { rows } = await client.query(`SELECT "${pkColumn}" AS pk FROM ${schema}.${table}`)
  return { ids: new Set(rows.map((r) => String(r.pk))), pkColumn }
}

async function main() {
  const source = await connect('SOURCE_DB_URL')
  const destUrl = process.env.DEST_DB_URL
  const dest = destUrl ? await connect('DEST_DB_URL') : null

  try {
    console.log('=== Inventario do projeto ORIGEM ===\n')

    const counts: TableCount[] = []
    for (const t of ALL_TABLES) {
      counts.push(await countRows(source, t.name))
    }

    for (const c of counts) {
      if (!c.exists) {
        console.log(`  [AUSENTE] ${c.table} - tabela nao encontrada no schema ao vivo (ver drift em INVESTIGACAO.md)`)
      } else {
        console.log(`  ${c.table.padEnd(30)} ${c.rowCount} linha(s)`)
      }
    }

    const totalRows = counts.reduce((acc, c) => acc + (c.rowCount ?? 0), 0)
    console.log(`\n  TOTAL de linhas no grafo: ${totalRows}`)

    if (dest) {
      console.log('\n=== Checagem de colisao de UUID contra o projeto DESTINO ===\n')
      let anyCollision = false

      for (const t of ALL_TABLES) {
        const { schema, table } = splitSchemaTable(t.name)
        const existsSource = await tableExists(source, schema, table)
        const existsDest = await tableExists(dest, schema, table)
        if (!existsSource || !existsDest) continue

        const { ids: sourceIds, pkColumn } = await collectIds(source, t.name)
        const { ids: destIds } = await collectIds(dest, t.name)

        if (!pkColumn) {
          console.log(`  [PULADO] ${t.name}: PK composta ou ausente, checagem de colisao nao se aplica`)
          continue
        }

        const collisions = [...sourceIds].filter((id) => destIds.has(id))

        if (collisions.length > 0) {
          anyCollision = true
          console.log(`  [COLISAO] ${t.name}: ${collisions.length} id(s) ja existem no destino`)
          console.log(`            exemplos: ${collisions.slice(0, 5).join(', ')}`)
        } else {
          console.log(`  [OK] ${t.name}: nenhuma colisao de id com o destino`)
        }
      }

      if (anyCollision) {
        console.log(
          '\n  ATENCAO: existe colisao de UUID. NAO prossiga com o import real - ver RUNBOOK.md secao "Conflito de colisao de UUID".'
        )
        process.exitCode = 1
      } else {
        console.log('\n  Nenhuma colisao de UUID encontrada entre origem e destino.')
      }
    } else {
      console.log('\n(DEST_DB_URL nao informado - checagem de colisao pulada, apenas inventario da origem)')
    }
  } finally {
    await source.end()
    if (dest) await dest.end()
  }
}

main().catch((err) => {
  console.error('Falha no inventory.ts:', err)
  process.exitCode = 1
})

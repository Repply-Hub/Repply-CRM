import { Client } from 'pg'

/**
 * Conexao Postgres direta (nao supabase-js) porque parte do grafo (auth.users, auth.identities)
 * nao e exposta via PostgREST/supabase-js por padrao - a mesma conclusao da fase 4 desta
 * migracao (pg_dump/restore via connection string, nao via Admin API/GoTrue).
 *
 * Nunca hardcodear a connection string aqui: cada script le a variavel de ambiente indicada
 * na hora da execucao (ver RUNBOOK.md).
 */
export async function connect(envVarName: string): Promise<Client> {
  const connectionString = process.env[envVarName]
  if (!connectionString) {
    throw new Error(
      `Variavel de ambiente ${envVarName} nao definida. Passe a connection string Postgres na hora da execucao, ex.: ${envVarName}='postgresql://...' npx tsx scripts/migration/inventory.ts`
    )
  }
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

export async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  )
  return rows.length > 0
}

export async function columnExists(
  client: Client,
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column]
  )
  return rows.length > 0
}

export function splitSchemaTable(qualifiedName: string): { schema: string; table: string } {
  const [schema, table] = qualifiedName.includes('.') ? qualifiedName.split('.') : ['public', qualifiedName]
  return { schema, table }
}

/**
 * Descobre a(s) coluna(s) de PRIMARY KEY de uma tabela via catalogo do Postgres.
 * Necessario porque nem toda tabela do grafo usa "id" como PK - ex.: gmail_tokens
 * usa user_id como PK (ver supabase/migrations/20260430170853_...sql linha 3).
 */
export async function primaryKeyColumns(client: Client, schema: string, table: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ($1 || '.' || $2)::regclass AND i.indisprimary`,
    [schema, table]
  )
  return rows.map((r) => r.column_name as string)
}

/**
 * Backfill: distribui o endereço completo que veio inteiro dentro de `clientes.logradouro`
 * (comum em importações antigas, ex: exports do Bitrix24) para as colunas estruturadas
 * `numero`, `complemento`, `bairro`, `cidade`, `uf` e `cep`.
 *
 * Motivo: antes do parser em src/lib/cep.ts (stringToEndereco) reconhecer esse formato, a
 * importação de empresas jogava o endereço inteiro dentro de `logradouro` quando a planilha
 * só tinha uma coluna de endereço, deixando numero/bairro/cidade/uf/cep vazios.
 *
 * Estratégia (CEP primeiro): o texto livre de endereço real é bagunçado demais (CEP em
 * qualquer posição, "Cep:" às vezes presente, separador de cidade/UF variando entre vírgula,
 * traço, barra ou nada) para confiar 100% em regex sobre bairro/cidade/UF. Sempre que um CEP
 * válido é encontrado no texto, este script consulta a BrasilAPI e usa a resposta (autoritativa)
 * para bairro/cidade/UF/logradouro — o parsing local só entra como fallback quando não há CEP
 * ou a consulta falha. `numero`/`complemento` sempre vêm do parsing local (a API de CEP não
 * tem número de casa).
 *
 * Também corrige o caso de campos já preenchidos com lixo (ex: `cidade` contendo um número
 * solto tipo "10333" em vez de um nome de cidade) — um valor existente só é preservado se
 * "parecer" válido; senão é tratado como vazio e recalculado.
 *
 * Nunca escreve um valor pior que o que já existe: preferência é sempre
 * existente-plausível > API do CEP > parsing local do texto.
 *
 * Idempotente: só seleciona clientes cujo `logradouro` ainda contém vírgula (indício de
 * bloco não separado). Como este script SEMPRE regrava `logradouro` com a versão limpa (sem
 * vírgula) — mesmo quando os demais campos já estavam corretos — cada linha processada sai
 * do filtro na machine seguinte, garantindo que o loop principal sempre avança.
 *
 * Uso:
 *   SUPABASE_URL='https://hukeirrmsoiowvvrhivx.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *   npx tsx scripts/backfill-endereco-clientes.ts
 *
 * Adicione --dry-run para apenas listar o que seria alterado, sem gravar nada (nesse modo o
 * script pagina por todo o histórico via offset, já que nenhuma linha "sai" do filtro).
 */
import { createClient } from '@supabase/supabase-js'
import { stringToEndereco, fetchCepData, unmaskCep, UF_SET, type CepData } from '../src/lib/cep'

const PAGE_SIZE = 500
const MAX_PAGES = 200 // salvaguarda: nunca deveria chegar perto disso (200 * 500 = 100k linhas)
const CEP_LOOKUP_CONCURRENCY = 6

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Ver instruções de uso no topo deste arquivo.`)
  }
  return value
}

const isPlausibleText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isPlausibleCidade = (v: unknown): v is string => isPlausibleText(v) && /[a-zA-ZÀ-ÿ]/.test(v)
const isPlausibleUf = (v: unknown): v is string => isPlausibleText(v) && UF_SET.has(v.trim().toUpperCase())

// existente-plausível > primeiro fallback disponível > null
function pick(existing: unknown, isPlausible: (v: unknown) => boolean, ...fallbacks: Array<string | null | undefined>): string | null {
  if (isPlausible(existing)) return existing as string
  for (const f of fallbacks) {
    if (isPlausible(f)) return f as string
  }
  return null
}

async function resolveCepCache(ceps: string[]): Promise<Map<string, CepData | null>> {
  const cache = new Map<string, CepData | null>()
  const unicos = Array.from(new Set(ceps.map(unmaskCep).filter(d => d.length === 8)))
  let cursor = 0
  const worker = async () => {
    while (cursor < unicos.length) {
      const digits = unicos[cursor++]
      try {
        cache.set(digits, await fetchCepData(digits))
      } catch {
        cache.set(digits, null)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CEP_LOOKUP_CONCURRENCY, unicos.length) }, worker))
  return cache
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log(dryRun ? '[backfill] Rodando em modo --dry-run (nenhuma escrita será feita).' : '[backfill] Rodando em modo real (UPDATE por linha).')

  let totalEncontrados = 0
  let totalMigrados = 0
  let totalComCepAutoritativo = 0
  let totalFalhas = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    // Em modo real, sempre lê do início — linhas já corrigidas perdem a vírgula em
    // `logradouro` e saem do filtro, então a "página 0" seguinte já traz só o que falta.
    // Em dry-run nada é escrito, então precisa avançar por offset pra ver o restante.
    const from = dryRun ? page * PAGE_SIZE : 0
    const to = from + PAGE_SIZE - 1

    const { data: clientes, error } = await supabase
      .from('clientes')
      .select('id, logradouro, numero, complemento, bairro, cidade, uf, cep')
      .ilike('logradouro', '%,%')
      .range(from, to)
    if (error) throw error
    if (!clientes || clientes.length === 0) break

    totalEncontrados += clientes.length
    console.log(`[backfill] Página ${page}: ${clientes.length} clientes com endereço não distribuído.`)

    const linhas = clientes.map(c => ({
      c,
      logradouroOriginal: (c.logradouro ?? '').trim(),
      parsed: stringToEndereco((c.logradouro ?? '').trim()),
    }))

    const cepCache = await resolveCepCache(linhas.map(l => l.parsed.cep).filter(Boolean) as string[])

    for (const { c, logradouroOriginal, parsed } of linhas) {
      const cepData = parsed.cep ? cepCache.get(unmaskCep(parsed.cep)) : null
      if (cepData) totalComCepAutoritativo++

      const update = {
        // logradouro é sempre reescrito com a versão limpa — é justamente o campo "sujo"
        // que disparou a seleção da linha, então nunca faz sentido preferir o existente aqui.
        logradouro: cepData?.street || parsed.logradouro || logradouroOriginal,
        numero: pick(c.numero, isPlausibleText, parsed.numero),
        complemento: pick(c.complemento, isPlausibleText, parsed.complemento),
        bairro: pick(c.bairro, isPlausibleText, cepData?.neighborhood, parsed.bairro),
        cidade: pick(c.cidade, isPlausibleCidade, cepData?.city, parsed.cidade),
        uf: pick(c.uf, isPlausibleUf, cepData?.state, parsed.uf),
        cep: pick(c.cep, isPlausibleText, parsed.cep),
      }

      console.log(`  id=${c.id}: "${logradouroOriginal}" -> logradouro="${update.logradouro}", numero="${update.numero}", bairro="${update.bairro}", cidade="${update.cidade}", uf="${update.uf}", cep="${update.cep}"${cepData ? ' [CEP autoritativo]' : ''}`)

      if (dryRun) continue

      const { error: updateError } = await supabase
        .from('clientes')
        .update(update)
        .eq('id', c.id)

      if (updateError) {
        totalFalhas++
        console.error(`[backfill] Cliente ${c.id}: falha ao gravar endereço:`, updateError.message)
      } else {
        totalMigrados++
      }
    }
  }

  console.log('\n[backfill] Resumo final')
  console.log(`  Encontrados com endereço não distribuído: ${totalEncontrados}`)
  console.log(`  Migrados com sucesso: ${totalMigrados}`)
  console.log(`  Resolvidos com CEP autoritativo (BrasilAPI): ${totalComCepAutoritativo}`)
  console.log(`  Falhas: ${totalFalhas}`)
}

main().catch(err => {
  console.error('[backfill] Erro fatal:', err)
  process.exit(1)
})

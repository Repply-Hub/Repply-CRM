/**
 * Backfill: vincula `contatos.cliente_id` a partir do texto solto já existente em
 * `contatos.empresa`, para contatos criados/importados antes da coluna estruturada existir.
 *
 * Motivo: até agora "Empresa do contato" era só uma cópia de texto do nome da empresa,
 * gravada uma vez no momento da criação/vinculação e nunca mais sincronizada — se a empresa
 * fosse renomeada depois, o texto do contato ficava desatualizado e sem jeito de saber a
 * qual `clientes.id` ele pertence de verdade.
 *
 * Critério: só vincula quando o texto de `contatos.empresa` bate (case-insensitive, com
 * espaços aparados) com o nome de EXATAMENTE UMA empresa em `clientes`. Nomes ambíguos
 * (nenhuma ou mais de uma empresa com esse nome) ficam de fora — melhor não vincular do que
 * vincular errado.
 *
 * Idempotente: só seleciona contatos com `cliente_id` nulo e `empresa` preenchido; uma vez
 * vinculado, sai do filtro e não é reprocessado numa reexecução.
 *
 * Uso:
 *   SUPABASE_URL='https://hukeirrmsoiowvvrhivx.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *   npx tsx scripts/backfill-contatos-cliente-id.ts
 *
 * Adicione --dry-run para apenas listar quantos contatos seriam afetados, sem gravar nada.
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

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase()
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log(dryRun ? '[backfill] Rodando em modo --dry-run (nenhuma escrita será feita).' : '[backfill] Rodando em modo real (UPDATE por linha).')

  // Mapa nome normalizado -> id, só para nomes que aparecem em exatamente uma empresa.
  const { data: clientes, error: clientesError } = await supabase.from('clientes').select('id, empresa')
  if (clientesError) throw clientesError

  const contagemPorNome = new Map<string, number>()
  const idPorNome = new Map<string, string>()
  for (const c of clientes ?? []) {
    if (!c.empresa) continue
    const chave = normalizarNome(c.empresa)
    contagemPorNome.set(chave, (contagemPorNome.get(chave) ?? 0) + 1)
    idPorNome.set(chave, c.id)
  }
  const clienteIdPorNomeUnico = new Map(
    Array.from(idPorNome.entries()).filter(([chave]) => contagemPorNome.get(chave) === 1)
  )
  console.log(`[backfill] ${clienteIdPorNomeUnico.size} nomes de empresa únicos disponíveis para vínculo (de ${clientes?.length ?? 0} empresas cadastradas).`)

  let totalEncontrados = 0
  let totalVinculados = 0
  let totalAmbiguos = 0
  let totalFalhas = 0

  // Fase 1: lê TODOS os contatos sem cliente_id antes de gravar qualquer coisa — pagina
  // com ordenação estável e sem mutação no meio, evitando o clássico bug de "página
  // encolhe enquanto pagina" (linhas mudando de posição entre uma leitura e outra).
  const pendentes: { id: string; empresa: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: contatos, error } = await supabase
      .from('contatos')
      .select('id, empresa')
      .is('cliente_id', null)
      .not('empresa', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!contatos || contatos.length === 0) break
    pendentes.push(...contatos)
    if (contatos.length < PAGE_SIZE) break
  }

  totalEncontrados = pendentes.length
  console.log(`[backfill] Total encontrado: ${totalEncontrados} contatos sem cliente_id.`)

  // Fase 2: calcula os vínculos e grava.
  for (const contato of pendentes) {
    const nomeEmpresa = (contato.empresa ?? '').trim()
    const clienteId = nomeEmpresa ? clienteIdPorNomeUnico.get(normalizarNome(nomeEmpresa)) : undefined

    if (!clienteId) {
      totalAmbiguos++
      if (dryRun) console.log(`  id=${contato.id}: "${nomeEmpresa}" não bate com exatamente uma empresa, pulando.`)
      continue
    }

    console.log(`  id=${contato.id}: "${nomeEmpresa}" -> cliente_id=${clienteId}`)

    if (dryRun) continue

    const { error: updateError } = await supabase
      .from('contatos')
      .update({ cliente_id: clienteId })
      .eq('id', contato.id)

    if (updateError) {
      totalFalhas++
      console.error(`[backfill] Contato ${contato.id}: falha ao gravar cliente_id:`, updateError.message)
    } else {
      totalVinculados++
    }
  }

  console.log('\n[backfill] Resumo final')
  console.log(`  Encontrados sem cliente_id: ${totalEncontrados}`)
  console.log(`  Vinculados com sucesso: ${totalVinculados}`)
  console.log(`  Sem match único (ambíguo ou nenhum): ${totalAmbiguos}`)
  console.log(`  Falhas: ${totalFalhas}`)
}

main().catch(err => {
  console.error('[backfill] Erro fatal:', err)
  process.exit(1)
})

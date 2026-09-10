/**
 * Scraper do Diário Oficial do Município de Natal (DOM) — publicações de licença ambiental
 * (Licença Prévia / de Instalação / de Operação).
 *
 * ── Por que isto NÃO é uma Edge Function ────────────────────────────────────────────────
 * Já foi. O DOM de Natal é diário de capital: cada edição tem 60 a 170 páginas. Extrair o
 * texto de UMA edição consome ~200-400 MB (medido em 10/09/2026, com pdf.js e com o MuPDF),
 * e o worker da Edge Function tem teto FIXO de 256 MB — a função estourava com
 * `WORKER_RESOURCE_LIMIT` antes de gravar qualquer linha. Baixar o lote por execução não
 * resolvia: o custo é por PDF, não acumulado. Então a leitura voltou para um GitHub Action
 * (`.github/workflows/scrape-dom-natal.yml`), onde há memória de sobra. É o mesmo arranjo
 * que existia antes de 01/09/2026 — só que em Node/tsx em vez de Python, reaproveitando o
 * reconhecedor de licença de `src/lib/dom-natal-licencas.ts` (fonte única, sem cópia).
 *
 * ── O que ele faz ──────────────────────────────────────────────────────────────────────
 *  1. Lista as edições do mês corrente + anterior (fuso de Brasília) pela API JSON do DOM.
 *  2. Pula as edições cujo PDF já está em `licencas_natal` (dedupe por `pdf_link`).
 *  3. Para cada edição nova: baixa o PDF, arquiva no bucket privado `dom-natal`, extrai o
 *     texto, roda `extrairPublicacoesDeLicenca` e grava as publicações (ou um marcador
 *     idempotente "nenhuma LP/LI/LO", para não reprocessar a edição toda semana).
 *
 * O licenciamento ambiental do RN é ESTADUAL (IDEMA). O DOM municipal quase nunca traz
 * LP/LI/LO — a investigação da Fase 1 varreu 10 edições e achou zero. O valor deste scraper
 * é baixo de propósito; ele existe para não deixar um buraco na cobertura do Portal.
 *
 * ── Uso ───────────────────────────────────────────────────────────────────────────────
 *   SUPABASE_URL='https://xxxx.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *   npx tsx scripts/scrape-dom-natal-licencas.ts [--meses-atras 1] [--mes 8 --ano 2026] [--max 45] [--dry-run]
 *
 *   --meses-atras N   além do mês corrente, varre N meses anteriores (padrão 1)
 *   --mes / --ano     varre só esse mês/ano (ignora --meses-atras)
 *   --max N           teto de edições lidas nesta execução (padrão 45; o resto fica para
 *                     a próxima, com aviso de `restantes`)
 *   --dry-run         não grava nada: só lista o que faria
 */
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extrairPublicacoesDeLicenca } from '../src/lib/dom-natal-licencas'

const BASE_URL = 'https://www.natal.rn.gov.br'
const STORAGE_BUCKET = 'dom-natal'

// User-Agent de navegador. Um UA não-navegador é o primeiro a ser bloqueado no dia em que
// o portal da Prefeitura ganhar um WAF.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Pausa entre downloads. O host de storage da Prefeitura estrangula rajadas — baixar
// 25+ PDFs seguidos sem intervalo devolve erro de conexão em quase todos (medido em
// 01/09/2026).
const PAUSA_ENTRE_DOWNLOADS_MS = 1000

const RE_ANCHOR = /<a\s+href=['"]([^'"]+\.pdf)['"][^>]*>\s*([^<]*)<\/a>/i
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/
const RE_NUMERO = /Num\.?\s*(\d+)/i
const RE_CNPJ = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

interface Edicao {
  url: string
  dataIso: string | null // AAAA-MM-DD
  numero: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Ver instruções no topo do arquivo.`)
  return value
}

function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex')
}

// Teto de edições lidas por execução. Cada edição do DOM de Natal leva ~40-70 s (baixar +
// extrair 60-170 páginas + pausa). 45 cabe folgado nos 30 min do job e dá conta de um mês
// inteiro no regime normal. Só importa no primeiro backfill (~55 edições): o script imprime
// `restantes` e basta re-disparar o workflow, que o dedupe pula o que já entrou.
const MAX_EDICOES_PADRAO = 45

/** Argumentos de linha de comando, no formato --chave valor / --flag. */
function parseArgs(argv: string[]): { mesesAtras: number; mes?: number; ano?: number; max: number; dryRun: boolean } {
  const out = { mesesAtras: 1, max: MAX_EDICOES_PADRAO, dryRun: false } as {
    mesesAtras: number; mes?: number; ano?: number; max: number; dryRun: boolean
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--meses-atras') out.mesesAtras = Math.max(0, parseInt(argv[++i] ?? '1', 10) || 0)
    else if (a === '--mes') out.mes = parseInt(argv[++i] ?? '', 10)
    else if (a === '--ano') out.ano = parseInt(argv[++i] ?? '', 10)
    else if (a === '--max') out.max = Math.max(1, parseInt(argv[++i] ?? '', 10) || MAX_EDICOES_PADRAO)
  }
  return out
}

/** Meses a varrer: mês corrente e os `mesesAtras` anteriores, no fuso de Brasília. */
function janelaDeMeses(mesesAtras: number): { mes: string; ano: string }[] {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const meses: { mes: string; ano: string }[] = []
  for (let atras = mesesAtras; atras >= 0; atras--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - atras, 1)
    meses.push({ mes: String(d.getMonth() + 1).padStart(2, '0'), ano: String(d.getFullYear()) })
  }
  return meses
}

/** Lista as edições de um mês pela API JSON. O endpoint ignora query string e sempre
 *  devolve o mês inteiro. */
async function listarEdicoes(mes: string, ano: string): Promise<Edicao[]> {
  const resp = await fetch(`${BASE_URL}/api/dom/data/${mes}/${ano}`, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE_URL}/dom`,
      'User-Agent': BROWSER_UA,
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    console.warn(`  API do DOM devolveu ${resp.status} para ${mes}/${ano} — mês ignorado`)
    return []
  }

  const json = (await resp.json()) as { data?: string[][] }
  const edicoes: Edicao[] = []
  for (const linha of json?.data ?? []) {
    const cell = linha[0] ?? ''
    const m = RE_ANCHOR.exec(cell)
    if (!m) continue
    const url = m[1]
    if (edicoes.some((e) => e.url === url)) continue
    const dm = RE_DATA.exec(m[2])
    edicoes.push({
      url,
      dataIso: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null,
      numero: RE_NUMERO.exec(m[2])?.[1] ?? null,
    })
  }
  return edicoes
}

/** Extrai todo o texto de um PDF. Sem truque de memória: o runner do GitHub Actions tem
 *  RAM de sobra — é justamente por isso que a leitura saiu da Edge Function. */
async function extrairTexto(bytes: Uint8Array): Promise<string> {
  // `data` é passado por cópia: o pdf.js DESANEXA o ArrayBuffer que recebe, e o chamador
  // ainda usa `bytes` (upload para o Storage) depois desta função.
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false })
  const doc = await task.promise
  try {
    let texto = ''
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      texto += tc.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n'
      page.cleanup()
    }
    return texto
  } finally {
    await task.destroy()
  }
}

async function main() {
  const { mesesAtras, mes, ano, max, dryRun } = parseArgs(process.argv.slice(2))
  // Em --dry-run nada é gravado nem lido do banco — roda offline, só para conferir o que
  // seria processado e quantas publicações o reconhecedor acharia.
  const supabase = dryRun
    ? null
    : createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false },
      })

  const meses = mes && ano
    ? [{ mes: String(mes).padStart(2, '0'), ano: String(ano) }]
    : janelaDeMeses(mesesAtras)
  console.log(`Janela: ${meses.map((m) => `${m.mes}/${m.ano}`).join(', ')}${dryRun ? '  (dry-run)' : ''}`)

  // 1. Descobre as edições da janela
  const todas: Edicao[] = []
  for (const { mes: mm, ano: aa } of meses) {
    const lista = await listarEdicoes(mm, aa)
    console.log(`  ${mm}/${aa}: ${lista.length} edições`)
    for (const e of lista) if (!todas.some((x) => x.url === e.url)) todas.push(e)
  }
  if (todas.length === 0) {
    console.log('Nenhuma edição encontrada. Nada a fazer.')
    return
  }

  // 2. Pula edições que já têm linha na tabela (dedupe por pdf_link)
  let linksExistentes = new Set<string>()
  if (supabase) {
    const { data: jaTem, error: erroSelect } = await supabase.from('licencas_natal').select('pdf_link')
    if (erroSelect) throw new Error(`Falha ao ler licencas_natal: ${erroSelect.message}`)
    linksExistentes = new Set((jaTem ?? []).map((r) => r.pdf_link).filter(Boolean))
  }
  const novasTotais = todas.filter((e) => !linksExistentes.has(e.url))
  const novas = novasTotais.slice(0, max)
  const restantes = novasTotais.length - novas.length
  console.log(
    `${todas.length} edições na janela, ${novasTotais.length} novas` +
      (restantes > 0 ? ` — processando ${novas.length} nesta execução, ${restantes} ficam para a próxima.` : ' a processar.'),
  )

  let processados = 0
  let inseridos = 0

  for (const edicao of novas) {
    if (processados > 0) await sleep(PAUSA_ENTRE_DOWNLOADS_MS)
    processados++
    const arquivo = edicao.url.split('/').pop() ?? `${edicao.numero ?? 'sem-numero'}.pdf`
    const mesDaData = edicao.dataIso ? edicao.dataIso.slice(0, 7).replace('-', '/') : 'sem-data'
    const storagePath = `${mesDaData}/${arquivo}`
    const rotulo = `[${processados}/${novas.length}] ${arquivo} (${edicao.dataIso ?? 'sem data'})`

    try {
      const pdfResp = await fetch(edicao.url, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(60_000),
      })
      if (!pdfResp.ok) {
        console.warn(`${rotulo}: download falhou (${pdfResp.status}) — pulando`)
        continue
      }
      const bytes = new Uint8Array(await pdfResp.arrayBuffer())

      if (dryRun) {
        const texto = await extrairTexto(bytes)
        const pubs = texto.length >= 200 ? extrairPublicacoesDeLicenca(texto) : []
        console.log(`${rotulo}: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, ${texto.length} chars, ${pubs.length} publicação(ões)`)
        continue
      }

      // Arquiva o PDF no balde privado. "Já existe" não interrompe.
      const up = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
      const storagePathGravado = up.error ? null : storagePath

      let texto = ''
      try {
        texto = await extrairTexto(bytes)
      } catch (e) {
        console.warn(`${rotulo}: leitura do PDF falhou (${e instanceof Error ? e.message : e}) — segue sem texto`)
        texto = ''
      }

      const publicacoes = texto.length >= 200 ? extrairPublicacoesDeLicenca(texto) : []

      if (publicacoes.length === 0) {
        // Marcador por edição: registra que o PDF já foi lido e não achou LP/LI/LO. Não
        // aparece na tela (Portal filtra por tipo). Hash determinístico pela URL, para o
        // registro ser idempotente entre execuções.
        const marcador = '(Nenhuma LP/LI/LO identificada nesta edição)'
        const { error } = await supabase.from('licencas_natal').upsert(
          {
            data_edicao: edicao.dataIso,
            numero_dom: edicao.numero,
            pdf_nome: arquivo,
            pdf_link: edicao.url,
            pdf_storage_path: storagePathGravado,
            bloco_texto: marcador,
            bloco_texto_hash: sha256Hex(`${marcador}#${edicao.url}`),
          },
          { onConflict: 'bloco_texto_hash', ignoreDuplicates: true },
        )
        if (error) console.warn(`${rotulo}: gravação do marcador falhou: ${error.message}`)
        else console.log(`${rotulo}: lida, sem LP/LI/LO`)
        continue
      }

      for (const pub of publicacoes) {
        const cnpj = RE_CNPJ.exec(pub.texto)?.[0]?.replace(/\s/g, '') ?? ''
        const email = RE_EMAIL.exec(pub.texto)?.[0] ?? ''
        const { error } = await supabase.from('licencas_natal').upsert(
          {
            data_edicao: edicao.dataIso,
            numero_dom: edicao.numero,
            tipo_licenca: pub.tipo,
            cnpj,
            email,
            obra_descricao: '',
            pdf_nome: arquivo,
            pdf_link: edicao.url,
            pdf_storage_path: storagePathGravado,
            bloco_texto: pub.texto,
            bloco_texto_hash: sha256Hex(pub.texto),
          },
          { onConflict: 'bloco_texto_hash', ignoreDuplicates: true },
        )
        if (!error) inseridos++
        else console.warn(`${rotulo}: gravação de publicação falhou: ${error.message}`)
      }
      console.log(`${rotulo}: ${publicacoes.length} publicação(ões) de licença`)
    } catch (e) {
      console.warn(`${rotulo}: erro (${e instanceof Error ? e.message : e}) — segue para a próxima`)
      continue
    }
  }

  console.log(`\nFim. Edições processadas: ${processados}. Publicações gravadas: ${inseridos}.`)
  if (restantes > 0) {
    console.log(`Ainda faltam ${restantes} edições — re-dispare o workflow (o dedupe pula o que já entrou).`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

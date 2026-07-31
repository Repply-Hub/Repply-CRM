import { supabase } from '@/integrations/supabase/client';

// Cache por sessão de import — evita re-buscar/recriar a mesma entidade
// quando o nome se repete em múltiplas linhas da planilha.
const cache = {
  clientes: new Map<string, string>(),
  fabricantes: new Map<string, string>(),
  obras: new Map<string, string>(),
  marcadores: new Map<string, string>(),
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Dedup por chave normalizada (trim + lowercase), preservando a primeira grafia encontrada. */
function dedupeByNormalizedKey(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const n of names) {
    if (!n) continue;
    const key = normalizeKey(n);
    if (!seen.has(key)) seen.set(key, n);
  }
  return [...seen.values()];
}

function obraKey(clienteId: string, nome: string): string {
  return `${clienteId}::${normalizeKey(nome)}`;
}

function marcadorKey(empresaId: string, nome: string): string {
  return `${empresaId}::${normalizeKey(nome)}`;
}

function slugifyMarcador(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || `marcador ${Date.now()}`;
}

/**
 * Escapa % e _ (wildcards do ILIKE) para que nomes de cliente/fabricante que
 * contenham esses caracteres literalmente (ex: "100% Acabamentos") não sejam
 * interpretados como padrão de busca.
 */
function escapeIlikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Escapa um valor para uso dentro da sintaxe .or() do PostgREST, que trata
 * `,` `.` `:` `(` `)` como caracteres estruturais do filtro (não só vírgula).
 * Nomes reais de empresa costumam ter ponto (Ltda.), dois-pontos ou parênteses
 * (ex: "Azevedo & Coelho (SP)", "Cyrela S.A."), o que sem essa escapagem
 * corrompe a query inteira e derruba o lote com 400 Bad Request.
 */
function escapeOrValue(value: string): string {
  const needsQuoting = /[,.:()]/.test(value);
  if (!needsQuoting) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Constrói filtro OR ilike para o Supabase .or(), com valores devidamente escapados. */
function buildOrFilter(column: string, values: string[]): string {
  return values
    .map(v => `${column}.ilike.${escapeOrValue(escapeIlikeWildcards(v))}`)
    .join(',');
}

export function resetResolveCache() {
  cache.clientes.clear();
  cache.fabricantes.clear();
  cache.obras.clear();
  cache.marcadores.clear();
}

/**
 * Pré-carrega o cache de entidades para toda a lista de linhas da planilha.
 *
 * Antes do loop linha-a-linha, extrai os nomes únicos de cliente/fabricante/obra,
 * cruza com o banco em poucos SELECTs em lote (OR ilike, chunks de 50) e cria os
 * faltantes num único INSERT por entidade. Após retornar, todas as chamadas a
 * resolveClienteId / resolveFabricanteId / resolveObraId são cache hits — sem
 * queries adicionais independente do tamanho do arquivo.
 *
 * Nota: busca clientes por `empresa` (ilike). Clientes armazenados apenas em
 * `razao_social` não serão pré-carregados e serão resolvidos linha-a-linha como
 * fallback pelas funções individuais abaixo.
 */
export async function preloadResolveCache(
  rows: Array<Record<string, unknown>>,
  usuarioId: string
): Promise<void> {
  // Tamanho máximo do filtro OR por query — mantém a URL bem abaixo do limite de 8KB
  const CHUNK = 50;

  // ── Clientes ──────────────────────────────────────────────────────────────
  // Dedup por chave normalizada (não só trim): planilhas costumam ter o mesmo
  // cliente grafado com variação de maiúsculas/minúsculas entre linhas (ex:
  // "2 C Engenharia Ltda" e "2 C ENGENHARIA LTDA"), e um Set sobre a string
  // exata trataria isso como duas empresas diferentes, criando duplicatas.
  const clienteNames = dedupeByNormalizedKey(rows.map(r => String(r.cliente ?? '').trim()));

  if (clienteNames.length > 0) {
    for (let i = 0; i < clienteNames.length; i += CHUNK) {
      const chunk = clienteNames.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('clientes')
        .select('id, empresa')
        .or(buildOrFilter('empresa', chunk));
      data?.forEach(c => cache.clientes.set(normalizeKey(c.empresa), c.id));
    }

    const missing = clienteNames.filter(n => !cache.clientes.has(normalizeKey(n)));
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from('clientes')
        .insert(missing.map(n => ({ empresa: n, tipo: 'cliente', usuario_id: usuarioId })))
        .select('id, empresa');
      if (error) {
        // Lote falhou: cria um por um para maximizar aproveitamento
        for (const n of missing) {
          const { data: single } = await supabase
            .from('clientes')
            .insert({ empresa: n, tipo: 'cliente', usuario_id: usuarioId })
            .select('id, empresa')
            .single();
          if (single) cache.clientes.set(normalizeKey(single.empresa), single.id);
        }
      } else {
        created?.forEach(c => cache.clientes.set(normalizeKey(c.empresa), c.id));
      }
    }
  }

  // ── Fabricantes ───────────────────────────────────────────────────────────
  const fabricanteNames = dedupeByNormalizedKey(rows.map(r => String(r.fabricante ?? '').trim()));

  if (fabricanteNames.length > 0) {
    for (let i = 0; i < fabricanteNames.length; i += CHUNK) {
      const chunk = fabricanteNames.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('fabricantes')
        .select('id, nome')
        .or(buildOrFilter('nome', chunk));
      data?.forEach(f => cache.fabricantes.set(normalizeKey(f.nome), f.id));
    }

    const missing = fabricanteNames.filter(n => !cache.fabricantes.has(normalizeKey(n)));
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from('fabricantes')
        .insert(missing.map(n => ({ nome: n })))
        .select('id, nome');
      if (error) {
        for (const n of missing) {
          const { data: single } = await supabase
            .from('fabricantes')
            .insert({ nome: n })
            .select('id, nome')
            .single();
          if (single) cache.fabricantes.set(normalizeKey(single.nome), single.id);
        }
      } else {
        created?.forEach(f => cache.fabricantes.set(normalizeKey(f.nome), f.id));
      }
    }
  }

  // ── Obras (segunda passada — depende de cliente_id já resolvido) ──────────
  const obraRows = rows.filter(
    r => String(r.obra ?? '').trim() && String(r.cliente ?? '').trim()
  );

  if (obraRows.length > 0) {
    // Agrupa nomes únicos de obra por cliente_id já resolvido no passo anterior
    const obrasByCliente = new Map<string, Set<string>>();
    for (const r of obraRows) {
      const clienteId = cache.clientes.get(normalizeKey(String(r.cliente ?? '')));
      if (!clienteId) continue;
      if (!obrasByCliente.has(clienteId)) obrasByCliente.set(clienteId, new Set());
      obrasByCliente.get(clienteId)!.add(String(r.obra!).trim());
    }

    if (obrasByCliente.size > 0) {
      const clienteIds = [...obrasByCliente.keys()];

      // Uma SELECT por lote de cliente_ids — traz obras de todos os clientes relevantes
      for (let i = 0; i < clienteIds.length; i += CHUNK) {
        const chunk = clienteIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('obras')
          .select('id, nome_obra, cliente_id')
          .in('cliente_id', chunk);
        data?.forEach(o => {
          if (o.nome_obra) cache.obras.set(obraKey(o.cliente_id, o.nome_obra), o.id);
        });
      }

      // Identifica obras faltantes e cria em um único INSERT em lote
      const missingObras: Array<{ nome_obra: string; cliente_id: string; status: string }> = [];
      for (const [clienteId, nomes] of obrasByCliente) {
        for (const nome of nomes) {
          if (!cache.obras.has(obraKey(clienteId, nome))) {
            missingObras.push({ nome_obra: nome, cliente_id: clienteId, status: 'ativa' });
          }
        }
      }

      if (missingObras.length > 0) {
        const { data: created, error } = await supabase
          .from('obras')
          .insert(missingObras)
          .select('id, nome_obra, cliente_id');
        if (error) {
          console.error('Criação de obras em lote falhou no preload:', error.message);
        } else {
          created?.forEach(o => {
            if (o.nome_obra) cache.obras.set(obraKey(o.cliente_id, o.nome_obra), o.id);
          });
        }
      }
    }
  }
}

/**
 * Busca cliente existente por nome (empresa ou razão social); cria se não achar.
 * Após preloadResolveCache, essa função é sempre um cache hit.
 */
export async function resolveClienteId(nome: string, usuarioId: string): Promise<string> {
  const key = normalizeKey(nome);
  if (cache.clientes.has(key)) return cache.clientes.get(key)!;

  const { data: byEmpresa } = await supabase
    .from('clientes').select('id').ilike('empresa', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
  if (byEmpresa) { cache.clientes.set(key, byEmpresa.id); return byEmpresa.id; }

  const { data: byRazao } = await supabase
    .from('clientes').select('id').ilike('razao_social', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
  if (byRazao) { cache.clientes.set(key, byRazao.id); return byRazao.id; }

  const { data: created, error } = await supabase
    .from('clientes')
    .insert({ empresa: nome, tipo: 'cliente', usuario_id: usuarioId })
    .select('id').single();

  if (error || !created) throw new Error(`Não foi possível criar cliente "${nome}": ${error?.message}`);
  cache.clientes.set(key, created.id);
  return created.id;
}

/** Busca fabricante por nome; cria se não achar. Após preload, sempre cache hit. */
export async function resolveFabricanteId(nome: string): Promise<string> {
  const key = normalizeKey(nome);
  if (cache.fabricantes.has(key)) return cache.fabricantes.get(key)!;

  const { data: existing } = await supabase
    .from('fabricantes').select('id').ilike('nome', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
  if (existing) { cache.fabricantes.set(key, existing.id); return existing.id; }

  const { data: created, error } = await supabase
    .from('fabricantes').insert({ nome }).select('id').single();

  if (error || !created) throw new Error(`Não foi possível criar fabricante "${nome}": ${error?.message}`);
  cache.fabricantes.set(key, created.id);
  return created.id;
}

/** Busca obra por nome dentro do cliente; cria se não achar. Após preload, sempre cache hit. */
export async function resolveObraId(nome: string, clienteId: string): Promise<string | undefined> {
  if (!nome) return undefined;
  const key = obraKey(clienteId, nome);
  if (cache.obras.has(key)) return cache.obras.get(key)!;

  const { data: existing } = await supabase
    .from('obras').select('id').eq('cliente_id', clienteId).ilike('nome_obra', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
  if (existing) { cache.obras.set(key, existing.id); return existing.id; }

  const { data: created, error } = await supabase
    .from('obras')
    .insert({ nome_obra: nome, cliente_id: clienteId, status: 'ativa' })
    .select('id').single();

  if (error || !created) throw new Error(`Não foi possível criar obra "${nome}": ${error?.message}`);
  cache.obras.set(key, created.id);
  return created.id;
}

/**
 * Busca marcador por nome dentro da empresa; cria se não achar (permitindo que a planilha
 * introduza marcadores novos, além dos padrão "Quente"/"Frio"/"Futura"). Marcadores são
 * escopados por empresa, diferente de fabricantes (catálogo compartilhado).
 */
export async function resolveMarcadorId(nome: string, empresaId: string): Promise<string> {
  const key = marcadorKey(empresaId, nome);
  if (cache.marcadores.has(key)) return cache.marcadores.get(key)!;

  const { data: existing } = await supabase
    .from('marcadores').select('id').eq('empresa_id', empresaId).ilike('nome', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
  if (existing) { cache.marcadores.set(key, existing.id); return existing.id; }

  const { data: created, error } = await supabase
    .from('marcadores')
    .insert({ empresa_id: empresaId, nome, slug: slugifyMarcador(nome), cor: 'muted-foreground' })
    .select('id').single();

  if (error || !created) {
    // Corrida rara: outra linha do mesmo import já criou um marcador com o mesmo slug
    // entre a checagem acima e este insert — reaproveita o registro em vez de falhar a linha.
    const { data: raced } = await supabase
      .from('marcadores').select('id').eq('empresa_id', empresaId).ilike('nome', escapeIlikeWildcards(nome)).limit(1).maybeSingle();
    if (raced) { cache.marcadores.set(key, raced.id); return raced.id; }
    throw new Error(`Não foi possível criar marcador "${nome}": ${error?.message}`);
  }
  cache.marcadores.set(key, created.id);
  return created.id;
}

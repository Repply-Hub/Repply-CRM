import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 POR QUE ESTE TESTE EXISTE.
 *
 * O bloqueio por falta de pagamento nasceu em 03/08/2026 cobrindo 5 tabelas
 * (`20260803140402...`). Em 27/08/2026 alguém copiou a mão o mesmo padrão para
 * `obra_contatos` e saiu PELA METADE — só a política de INSERT, sem a de UPDATE. Ninguém
 * percebeu por quatro semanas, porque nada além de olhar o SQL apontava a falta.
 *
 * A partir de 30/08/2026 o cerco passou a ser um GERADOR (`aplicar_gate_de_plano()`, em
 * `supabase/migrations/20260830100500_gerador_do_gate_de_plano.sql`), que varre `pg_tables`
 * e cria as três políticas (`INSERT`/`UPDATE`/`DELETE`) em toda tabela que ainda não as
 * tem. Isso evita a cópia manual pela metade — mas o gerador só ENXERGA tabela com
 * `c.relrowsecurity` ligada. Uma tabela sem RLS é invisível pra ele.
 *
 * Por isso este arquivo verifica três coisas, todas lendo os ARQUIVOS de migration — não
 * há banco local neste ambiente (CLAUDE.md §6.8), então conferir no banco não é uma opção
 * aqui:
 *
 *   A. Toda tabela criada por migration tem RLS ligada em alguma migration. Tabela sem
 *      RLS não só escapa do gerador — ela não tem isolamento nenhum entre empresas, o que
 *      o CLAUDE.md §6.2 já proíbe. Esse é o teste que entrega valor de verdade: mesmo que
 *      o gerador tivesse zero bug, uma tabela sem RLS continuaria fora do cerco.
 *   B. Todo nome da lista de exceções (`tabelas_fora_do_gate()`) é uma tabela que
 *      realmente existe. Nome digitado errado na lista não excetua nada — e ninguém
 *      percebe, porque a lista "parece" completa.
 *   C. A leitura da lista de exceções funciona, e QUEBRA (em vez de devolver conjunto
 *      vazio) se a migration que a define mudar de forma — lista vazia faria toda exceção
 *      virar "violação", e o teste A ficaria vermelho sem relação com o problema real.
 *
 * Este teste NÃO tenta achar o nome da política gerada (`<tabela>_exige_plano_<comando>`)
 * no texto das migrations — essas políticas nascem em tempo de execução, dentro do
 * `aplicar_gate_de_plano()`, e nunca aparecem escritas em arquivo nenhum. Um teste que
 * procurasse esse nome reprovaria toda tabela legítima sem existir defeito algum.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

interface Arquivo {
  nome: string;
  conteudo: string;
}

interface TabelaNova {
  nome: string;
  arquivo: string;
  linha: number;
}

interface Renomeio {
  de: string;
  para: string;
}

/**
 * As exceções, LIDAS DO PRÓPRIO SQL — nunca redigitadas aqui.
 *
 * 🔴 Uma cópia desta lista em TypeScript seria o mesmo defeito que este teste existe para
 * impedir: duas listas que divergem em semanas. Então a função lê o array de
 * `public.tabelas_fora_do_gate()` direto da migration que o define. Acrescentou um nome
 * lá? O teste passa a respeitá-lo sem ninguém tocar neste arquivo.
 *
 * Se a migration sumir ou mudar de forma, isto QUEBRA em vez de assumir lista vazia —
 * lista vazia faria toda exceção virar violação, e o teste A ficaria vermelho apontando
 * para o lugar errado.
 */
export function lerExcecoes(conteudoDaMigration: string): Set<string> {
  const corpo = /tabelas_fora_do_gate[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/i.exec(
    conteudoDaMigration,
  );
  if (!corpo) {
    throw new Error(
      'Nao achei o array de tabelas_fora_do_gate() na migration. ' +
        'Se a funcao mudou de forma, ajuste lerExcecoes() em src/test/gate-de-plano.test.ts ' +
        '— nao desative o teste.',
    );
  }
  return new Set([...corpo[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

/**
 * As tabelas criadas por migration, com onde foram criadas.
 *
 * Aceita `create table` com ou sem `if not exists`, com ou sem o prefixo `public.` — as
 * migrations deste projeto usam as duas formas.
 */
export function tabelasCriadas(arquivos: Arquivo[]): TabelaNova[] {
  const achadas: TabelaNova[] = [];
  const padrao = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/i;

  for (const arq of arquivos) {
    const linhas = arq.conteudo.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      const m = padrao.exec(linhas[i]);
      if (m) achadas.push({ nome: m[1], arquivo: arq.nome, linha: i + 1 });
    }
  }
  return achadas;
}

/** As tabelas apagadas em algum momento por `drop table`, em qualquer migration. */
export function tabelasApagadas(arquivos: Arquivo[]): Set<string> {
  const padrao = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi;
  const apagadas = new Set<string>();
  for (const arq of arquivos) {
    for (const m of arq.conteudo.matchAll(padrao)) apagadas.add(m[1]);
  }
  return apagadas;
}

/** A tabela teve `alter table ... enable row level security` em alguma migration? */
export function temRlsLigada(tabela: string, todoOConteudo: string): boolean {
  const padrao = new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?"?${tabela}"?\\s+enable\\s+row\\s+level\\s+security`,
    'i',
  );
  return padrao.test(todoOConteudo);
}

/** Os `alter table ... rename to ...` de tabela, em alguma migration. */
export function renomeios(arquivos: Arquivo[]): Renomeio[] {
  const padrao =
    /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+rename\s+to\s+"?([a-z0-9_]+)"?/gi;
  const achados: Renomeio[] = [];
  for (const arq of arquivos) {
    for (const m of arq.conteudo.matchAll(padrao)) achados.push({ de: m[1], para: m[2] });
  }
  return achados;
}

/**
 * Todos os nomes que uma tabela já teve — segue a cadeia de `rename to` nos dois
 * sentidos, a partir de QUALQUER nome dela.
 *
 * 🔴 Sem isto o teste A acusa `permissoes_usuario` por engano: ela nasceu com RLS ligada
 * sob o nome `permissoes_vendedor` em 06/03/2026 e só foi renomeada em 16/04/2026
 * (`ALTER TABLE public.permissoes_vendedor RENAME TO permissoes_usuario`). O `ENABLE ROW
 * LEVEL SECURITY` original cita o nome antigo — Postgres não reescreve migration passada
 * quando renomeia. O mesmo vale para `usuarios`, que nasceu `vendedores`.
 */
export function nomesHistoricos(tabela: string, todosOsRenomeios: Renomeio[]): Set<string> {
  const nomes = new Set([tabela]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const r of todosOsRenomeios) {
      if (nomes.has(r.de) && !nomes.has(r.para)) {
        nomes.add(r.para);
        mudou = true;
      }
      if (nomes.has(r.para) && !nomes.has(r.de)) {
        nomes.add(r.de);
        mudou = true;
      }
    }
  }
  return nomes;
}

/**
 * Tabelas que TÊM proteção no banco, mas cujo `enable row level security` não está em
 * migration nenhuma.
 *
 * 🔴 NÃO SÃO BURACO DE SEGURANÇA — e a primeira versão deste comentário dizia que eram.
 * Medido no banco de produção em 29/08/2026: `select relname from pg_class where not
 * relrowsecurity` devolve ZERO linhas, e as duas têm política ativa (`colunas_customizadas`
 * 2, `debug_logs` 3). A proteção existe; ela só foi ligada fora do histórico de migrations,
 * provavelmente pelo painel do Supabase.
 *
 * O que isto é de verdade: um furo de REPRODUTIBILIDADE. O banco não pode ser reconstruído
 * a partir das migrations, porque duas tabelas nasceriam desprotegidas. Vale consertar com
 * uma migration que ligue a RLS de forma idempotente — mas é trabalho à parte, e nada está
 * exposto enquanto isso.
 *
 * 🔴 Tabela NOVA nunca entra aqui. Se o teste A apontar um nome que não está nesta lista, o
 * defeito é real e provavelmente é exposição de verdade: arrume a migration que criou a
 * tabela, não esta constante.
 */
const RLS_FORA_DAS_MIGRATIONS: ReadonlySet<string> = new Set([
  // Criada em 24/04/2026 (20260424031137), guarda log de erro do proprio app.
  'debug_logs',
  // Criada em 04/05/2026 (20260504172116), guarda coluna customizada por empresa.
  'colunas_customizadas',
]);

describe('cerco do bloqueio por falta de pagamento', () => {
  // Ordenado por nome de arquivo: o timestamp no início do nome faz isso coincidir com a
  // ordem cronológica de aplicação — importa para achar o PRIMEIRO `create table` de cada
  // tabela (é onde a pessoa vai procurar ao consertar).
  const arquivos: Arquivo[] = readdirSync(MIGRATIONS)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nome) => ({ nome, conteudo: readFileSync(join(MIGRATIONS, nome), 'utf-8') }));

  const tudo = arquivos.map((a) => a.conteudo).join('\n');

  // 🔴 A ULTIMA DEFINICAO, NAO A PRIMEIRA. `tabelas_fora_do_gate()` e reescrita por
  // `create or replace` toda vez que uma excecao entra — e migration nao se edita
  // (CLAUDE.md §6.3), entao a versao vigente e a do arquivo de nome mais alto.
  //
  // A primeira versao deste teste procurava pelo NOME do arquivo que criou a funcao, e
  // congelou na lista de 22 no dia seguinte, quando `assinatura_cancelamentos` entrou pela
  // migration 20260830140000. O teste continuava verde lendo uma lista velha — exatamente a
  // divergencia silenciosa que ele existe para impedir.
  //
  // `readdirSync` devolve em ordem alfabetica, e o nome comeca com a data: o ultimo da lista
  // e o mais recente.
  const definicoes = arquivos.filter((a) => a.conteudo.includes('tabelas_fora_do_gate'));
  if (definicoes.length === 0) throw new Error('Nenhuma migration define tabelas_fora_do_gate().');
  const EXCECOES = lerExcecoes(definicoes[definicoes.length - 1].conteudo);

  const RENOMEIOS = renomeios(arquivos);

  const apagadas = tabelasApagadas(arquivos);
  // ⚠️ Simplificação deliberada: uma tabela apagada e DEPOIS recriada sob o mesmo nome
  // ficaria de fora daqui também. Não há caso assim no histórico atual (conferido em
  // 29/08/2026 — as três tabelas já apagadas, `status_obras`, `pauta_adiamentos` e
  // `tabela_precos`, nunca voltaram); se um dia houver, este filtro precisa considerar a
  // ORDEM entre `create` e `drop`, não só a existência de um `drop`.
  const criadas = tabelasCriadas(arquivos).filter((t) => !apagadas.has(t.nome));

  // Uma tabela pode ter mais de um `create table` no histórico (a forma
  // `if not exists`, repetida numa migration de "conferência", é comum aqui) — o que
  // importa para o teste A é o PRIMEIRO lugar onde ela nasceu.
  const vistos = new Map<string, TabelaNova>();
  for (const t of criadas) if (!vistos.has(t.nome)) vistos.set(t.nome, t);
  const criadasUnicas = [...vistos.values()];

  // Todo nome que cada tabela criada já teve, incluindo o atual — usado para não acusar
  // renomeio por engano (teste A) e para reconhecer o nome atual de uma exceção que foi
  // escrita com o nome de hoje, mesmo que a tabela tenha nascido com outro (teste B).
  const todosOsNomesConhecidos = new Set<string>();
  for (const t of criadasUnicas) {
    for (const nome of nomesHistoricos(t.nome, RENOMEIOS)) todosOsNomesConhecidos.add(nome);
  }

  it('lê o array de tabelasCriadas a partir de um SQL de exemplo', () => {
    const achadas = tabelasCriadas([
      { nome: 'x.sql', conteudo: 'create table if not exists public.minha_coisa (\n  id uuid\n);' },
    ]);
    expect(achadas).toEqual([{ nome: 'minha_coisa', arquivo: 'x.sql', linha: 1 }]);
  });

  it('lê as exceções do SQL, em vez de duplicá-las aqui', () => {
    const sql = "tabelas_fora_do_gate() ... select array['usuarios', 'app_erros']::text[];";
    expect(lerExcecoes(sql)).toEqual(new Set(['usuarios', 'app_erros']));
  });

  it('🔴 quebra se a migration mudar de forma, em vez de assumir lista vazia', () => {
    expect(() => lerExcecoes('create function outra_coisa()')).toThrow(/tabelas_fora_do_gate/);
  });

  it('🔴 toda tabela criada por migration tem RLS ligada em alguma migration', () => {
    const semRls = criadasUnicas
      .filter((t) => ![...nomesHistoricos(t.nome, RENOMEIOS)].some((n) => temRlsLigada(n, tudo)))
      .filter((t) => !RLS_FORA_DAS_MIGRATIONS.has(t.nome));

    // A mensagem diz o nome da tabela e onde ela nasceu: sem RLS, a tabela é invisível
    // para `aplicar_gate_de_plano()` (que só enxerga `c.relrowsecurity`) E não tem
    // isolamento nenhum entre empresas (CLAUDE.md §6.2). O conserto é acrescentar, numa
    // migration NOVA (nunca editar a existente — CLAUDE.md §6.3):
    //   alter table public.<nome> enable row level security;
    // com a política de acesso ao lado. Se a tabela for dívida herdada e o conserto for
    // trabalho à parte, mova o nome para RLS_FORA_DAS_MIGRATIONS neste arquivo, com o motivo.
    expect(
      semRls.map((t) => `${t.nome} (criada em ${t.arquivo}:${t.linha})`),
    ).toEqual([]);
  });

  it('🔴 nenhum nome da lista de exceções é tabela inexistente', () => {
    const inexistentes = [...EXCECOES].filter((nome) => !todosOsNomesConhecidos.has(nome));

    // Nome digitado errado em `tabelas_fora_do_gate()` não excetua tabela nenhuma — ele só
    // some da lista sem avisar ninguém. Corrija o nome na migration
    // 20260830100000_lista_de_excecoes_do_gate.sql.
    expect(inexistentes).toEqual([]);
  });
});

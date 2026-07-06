/**
 * Grafo de tabelas envolvidas na consolidação de um cliente (projeto Supabase single-tenant)
 * para o projeto multi-tenant único.
 *
 * A ordem do array é a ordem segura de IMPORTAÇÃO (dependências primeiro, dependentes depois),
 * para nunca violar uma FK ao inserir. Export lê na mesma ordem (não importa para export, mas
 * mantém os dois scripts simétricos).
 *
 * Fonte da lista: supabase/migrations/*.sql (ver INVESTIGACAO.md nesta pasta para o levantamento
 * completo, com paths e linhas exatas de cada CREATE TABLE/ALTER TABLE consultado).
 *
 * IMPORTANTE: os migrations deste repo têm "schema drift" documentado (ex.: comentário em
 * supabase/migrations/20260701000000_wapi_instancia_usuarios_retroativa.sql linhas 1-9, e duas
 * definições conflitantes de CREATE TABLE public.empresas em 20260326000001 e 20260326172702) —
 * ou seja, os migrations por si só não são garantia do schema real em produção. Por isso
 * `inventory.ts` sempre introspecta o schema ao vivo (information_schema) antes de exportar/
 * importar, em vez de confiar cegamente nesta lista estática.
 */

export interface TableSpec {
  /** nome da tabela em public.* (ou "auth.users"/"auth.identities" para o schema auth) */
  name: string
  /** coluna que referencia auth.users(id), se houver (para o relatório de UUIDs de usuário) */
  authUserColumn?: string
  /** coluna que referencia empresas(id), se a tabela já tiver escopo por empresa */
  empresaColumn?: string
  /**
   * true se esta tabela HOJE tem uma constraint UNIQUE que não é escopada por empresa_id/user_id
   * e por isso colide ao consolidar múltiplos clientes sem uma migration de ajuste antes.
   * Ver INVESTIGACAO.md seção 3 para o detalhe de cada uma.
   */
  knownGlobalUniqueRisk?: string
}

export const AUTH_TABLES: TableSpec[] = [
  { name: 'auth.users' },
  { name: 'auth.identities' },
]

/** Tabelas public.* na ordem segura de import (dependências antes de dependentes). */
export const PUBLIC_TABLES: TableSpec[] = [
  {
    name: 'empresas',
    // empresas.owner_id referencia auth.users(id) mas sem FK declarada em todas as versões do
    // schema (ver INVESTIGACAO.md secao 2) — mantido aqui só para o relatório de inventário.
    authUserColumn: 'owner_id',
  },
  {
    name: 'usuarios',
    authUserColumn: 'user_id',
    empresaColumn: 'empresa_id',
  },
  {
    name: 'configuracoes_wapi',
    empresaColumn: 'empresa_id',
  },
  {
    name: 'wapi_instancia_usuarios',
    authUserColumn: 'usuario_auth_id',
  },
  {
    name: 'gmail_tokens',
    authUserColumn: 'user_id',
  },
  {
    name: 'emails_recebidos',
    authUserColumn: 'user_id',
    knownGlobalUniqueRisk:
      'gmail_message_id e resend_id sao UNIQUE globais (nao escopados por user_id) - ver INVESTIGACAO.md secao 3',
  },
  {
    name: 'emails',
    authUserColumn: 'user_id',
  },
  {
    name: 'sidebar_preferences',
    authUserColumn: 'user_id',
  },
  {
    name: 'user_integrations',
    authUserColumn: 'user_id',
  },
  {
    name: 'user_domains',
    authUserColumn: 'user_id',
  },
  {
    name: 'eventos',
    authUserColumn: 'user_id',
  },
  {
    name: 'configuracoes_automacao',
    // Corrigido por supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql:
    // ganhou empresa_id e a UNIQUE virou (empresa_id, chave) - deixou de ser uma tabela "global"
    // ignoravel no grafo e passou a exigir o mesmo remapeamento/checagem de empresa_id que
    // usuarios/configuracoes_wapi. Revalidado end-to-end em INVESTIGACAO.md secao "Revalidacao
    // pos-fix" - sem bloqueio remanescente.
    empresaColumn: 'empresa_id',
  },
]

export const ALL_TABLES: TableSpec[] = [...AUTH_TABLES, ...PUBLIC_TABLES]

export function findTable(name: string): TableSpec | undefined {
  return ALL_TABLES.find((t) => t.name === name)
}

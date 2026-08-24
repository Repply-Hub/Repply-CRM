-- Modo observação do webhook do WhatsApp: onde a conferência de origem é ANOTADA
--
-- ============================================================================
-- POR QUE ISTO EXISTE
-- ============================================================================
-- A função `whatsapp-webhook` roda com `verify_jwt = false` (supabase/config.toml) e
-- escreve no banco com `service_role`, que passa por cima de toda regra de RLS. Ela LÊ
-- o `webhook_secret` da consulta (index.ts:51) e NUNCA o compara com nada — não existe
-- `if`. Qualquer pessoa na internet que saiba o `instance_name` escreve nas tabelas de
-- WhatsApp da empresa.
--
-- O pior caminho não é forjar mensagem: é forjar EVENTO DE CONEXÃO. Ele grava `status`
-- em `configuracoes_wapi`, e `whatsapp-send/index.ts:212-215` recusa TODO envio quando
-- `status != 'connected'`. Um único evento forjado derruba o WhatsApp de saída da
-- empresa inteira.
--
-- ============================================================================
-- POR QUE MEDIR ANTES DE RECUSAR — e por que esta tabela vem antes do conserto
-- ============================================================================
-- Medido em 2026-08-24: as 3 instâncias de `configuracoes_wapi` estão com
-- `webhook_secret` VAZIO, e o endereço cadastrado na operadora (uazapi) não manda
-- segredo nenhum. Ligar a recusa hoje recusaria 100% do tráfego real — a caixa de
-- entrada da MD pararia de receber EM SILÊNCIO, com 736 conversas em uso, sem nada na
-- tela indicando: a instância continua aparecendo "conectada". Já aconteceu neste
-- sistema (commit 0715119).
--
-- Esta tabela é o instrumento que mede, com tráfego real, quantos eventos JÁ chegam com
-- segredo. É o número que autoriza — ou proíbe — ligar a recusa depois (Tarefa 6 do
-- plano `docs/operacao/plano-blindagem-whatsapp-execucao.md`).
--
-- ============================================================================
-- POR QUE UMA TABELA NOVA, e não a `webhook_debug` que já existe
-- ============================================================================
-- A `webhook_debug` é justamente a tabela que vazou o token da uazapi em texto puro
-- (`docs/divida-tecnica.md` §1): 77 MB, RLS ligada e ZERO política, sem prazo de guarda,
-- e com fila para ser esvaziada. Escrever coisa nova nela é engordar o problema que
-- está para ser resolvido, e depois não dá para apagar o acumulado sem apagar a
-- medição junto.
--
-- ============================================================================
-- O VALOR DO SEGREDO NUNCA ENTRA AQUI
-- ============================================================================
-- Só entram três booleanos e por qual via o segredo veio. Tabela de auditoria que
-- guarda o segredo é o mesmo vazamento de novo, com outro nome.

create table public.whatsapp_webhook_origem (
  id                      uuid        primary key default gen_random_uuid(),
  criado_em               timestamptz not null     default now(),

  -- Sem chave estrangeira de propósito: é registro de MEDIÇÃO. Não pode segurar a
  -- exclusão de uma instância, nem sumir junto com ela levando a prova embora. O prazo
  -- de guarda abaixo resolve o órfão.
  instancia_id            uuid,
  empresa_id              uuid,

  -- Vem de `configuracoes_wapi`, não da consulta: a linha só é gravada DEPOIS de a
  -- instância ter sido encontrada no banco, então este nome é o do banco, não o que o
  -- chamador digitou.
  instance_name           text        not null,

  -- Tipo do evento já normalizado (messages, messages_update, connection…). Serve para
  -- descobrir se é UM tipo de evento que chega sem segredo, e não todos.
  evento                  text,

  -- A instância tem `webhook_secret` preenchido no banco? Enquanto for `false`, não há
  -- o que comparar — e é exatamente o estado das 3 instâncias hoje.
  tem_segredo_configurado boolean     not null,

  -- A chamada trouxe segredo NÃO VAZIO?
  veio_com_segredo        boolean     not null,

  -- Bateu com o guardado? Comparação em tempo constante, dentro da função.
  confere                 boolean     not null,

  -- Por onde o segredo veio, medido por PRESENÇA e não por conteúdo. É o que separa
  -- "a operadora não mandou nada" de "mandou `&s=` com nada depois" — o segundo é a
  -- Tarefa 4 aplicada pela metade, e some se olharmos só o valor.
  via                     text        not null
                                      check (via in ('url', 'cabecalho', 'nenhuma'))
);

comment on table public.whatsapp_webhook_origem is
  'Modo observação da autenticação do webhook do WhatsApp: anota se o segredo veio e se bateu, sem recusar ninguém. Temporária — some quando a recusa da Tarefa 6 estiver de pé e estável. Nunca guarda o valor do segredo.';

-- Atalho de busca por data: tanto a consulta de apuração quanto a faxina filtram por
-- `criado_em`. Sem ele, as duas varrem a tabela inteira.
create index idx_wa_webhook_origem_criado_em
  on public.whatsapp_webhook_origem (criado_em desc);

-- ============================================================================
-- Quem pode ler
-- ============================================================================
-- O Supabase concede tudo a `anon` e `authenticated` em toda tabela nova do schema
-- `public` (conferido em 2026-08-24 numa tabela recente: os dois papéis vêm com
-- SELECT/INSERT/UPDATE/DELETE). Então a permissão é retirada explicitamente e devolvida
-- só onde precisa. A RLS sozinha já barraria, mas duas trancas custam uma linha.
--
-- As Edge Functions não são afetadas: usam `service_role`, que ignora RLS.

alter table public.whatsapp_webhook_origem enable row level security;

revoke all on public.whatsapp_webhook_origem from anon, authenticated;

-- Só leitura, e só para quem já administra o sistema. `anon` não recebe nada de volta.
grant select on public.whatsapp_webhook_origem to authenticated;

create policy whatsapp_webhook_origem_select_admin
  on public.whatsapp_webhook_origem
  for select
  to authenticated
  using (public.is_admin());

-- Nenhuma política de INSERT/UPDATE/DELETE, de propósito: o único escritor é a Edge
-- Function com `service_role`. Ninguém pela API do navegador escreve aqui.

-- ============================================================================
-- Prazo de guarda: 14 dias
-- ============================================================================
-- Mais curto que os 30 dias usados na faxina da `webhook_debug`, e isso é intencional:
-- lá grava-se em caso de anomalia, aqui grava-se UMA LINHA POR EVENTO. Com ~1.046
-- mensagens recebidas em 24h (medido em 2026-08-24) mais atualizações de status,
-- presença e conexão, o volume real é alto. A janela de observação do plano é de 3
-- dias; 14 cobre uma segunda tentativa inteira e ainda mantém a tabela pequena.
--
-- SQL direto, e não `net.http_post`: para uma chamada HTTP "sucesso" só quer dizer que
-- a requisição saiu. Aqui sucesso é apagou.

create or replace function public.limpa_whatsapp_webhook_origem()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removidas integer;
begin
  delete from public.whatsapp_webhook_origem
  where criado_em < now() - interval '14 days';
  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

revoke all on function public.limpa_whatsapp_webhook_origem() from public, anon, authenticated;

-- 03h40 UTC = 00h40 em Natal, fora do expediente da MD. Dez minutos depois do horário
-- reservado à faxina da `webhook_debug`, para as duas não brigarem pelo mesmo minuto.
select cron.schedule(
  'faxina-whatsapp-webhook-origem',
  '40 3 * * *',
  $$select public.limpa_whatsapp_webhook_origem()$$
);

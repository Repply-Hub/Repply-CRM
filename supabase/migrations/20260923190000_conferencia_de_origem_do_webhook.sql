-- O painel da conferência de origem do webhook — item 16 da dívida técnica.
--
-- ------------------------------------------------------------------ para que isto existe
--
-- O plano de blindagem (`docs/operacao/plano-blindagem-whatsapp.md`, Fase 3) só autoriza
-- passar a RECUSAR quem não apresenta segredo depois de alguns dias com **100% dos eventos
-- reais trazendo o segredo**. Essa é a etapa 3c, e ela é uma medição — não um palpite.
--
-- Até hoje essa medição só existia como consulta solta no painel do Supabase, que só uma
-- pessoa sabe rodar. Isto a põe na tela de administração, onde a decisão é tomada.
--
-- Medido em 23/09/2026: 81.540 eventos anotados desde 09/09, ZERO com segredo — porque
-- nenhuma das 5 instâncias tem segredo configurado. Depois de a ação `reconfigurar-webhook`
-- rodar numa instância, esta função é como se vê o número subir.
--
-- ------------------------------------------------------------------ por que SECURITY DEFINER
--
-- 🔴 A função precisa dizer se a instância TEM segredo, e a coluna `webhook_secret` não é
-- legível pelo papel `authenticated` desde a migration 20260923140000 (item 74: a regra decide
-- a linha, o GRANT decide a coluna). Para responder "tem ou não tem" sem entregar o valor, ela
-- roda como dona — e devolve só o booleano.
--
-- 🔴 E POR ISSO ELA CONFERE QUEM CHAMA, NA PRIMEIRA LINHA. Função que roda como dona ignora
-- toda regra de acesso: sem a checagem, qualquer pessoa logada leria o retrato do WhatsApp de
-- todas as empresas. Foi exatamente assim que `empresas_na_regua` ficou aberta (16/09/2026).
-- O valor do segredo NUNCA sai daqui — só `tem_segredo`.

create or replace function public.wa_conferencia_de_origem()
returns table (
  instancia_id      uuid,
  instance_name     text,
  empresa           text,
  status            text,
  tem_segredo       boolean,
  eventos_24h       bigint,
  com_segredo_24h   bigint,
  conferem_24h      bigint,
  ultimo_evento_em  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Só o administrador da plataforma vê a conferência de origem do webhook.'
      using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.instance_name,
    e.nome,
    c.status,
    coalesce(c.webhook_secret, '') <> '',
    -- 🔴 O DENOMINADOR CONTA SÓ O QUE DAVA PARA CONFERIR. A janela é de 24h, então logo
    -- depois de proteger uma instância ela ainda carrega horas de eventos anteriores — que
    -- chegaram sem senha porque senha não existia. Contá-los mostraria "12% conferem" na hora
    -- exata em que tudo passou a funcionar, e o acerto pareceria fracasso.
    --
    -- `tem_segredo_configurado` é gravado por evento pela função do webhook: ele diz se, NAQUELE
    -- momento, havia senha para comparar. É a coluna que separa "antes" de "depois".
    count(o.id) filter (where o.tem_segredo_configurado),
    count(o.id) filter (where o.tem_segredo_configurado and o.veio_com_segredo),
    count(o.id) filter (where o.tem_segredo_configurado and o.confere),
    max(o.criado_em)
  from public.configuracoes_wapi c
  left join public.empresas e on e.id = c.empresa_id
  left join public.whatsapp_webhook_origem o
    on o.instancia_id = c.id
   and o.criado_em > now() - interval '24 hours'
  group by c.id, c.instance_name, e.nome, c.status, c.webhook_secret
  order by count(o.id) desc, c.instance_name;
end;
$$;

-- Visitante sem login não tem o que fazer aqui; a checagem de admin está dentro.
revoke all on function public.wa_conferencia_de_origem() from public, anon;
grant execute on function public.wa_conferencia_de_origem() to authenticated;

comment on function public.wa_conferencia_de_origem() is
  'Item 16: quantos eventos do webhook chegaram com segredo nas últimas 24h, por instância. '
  'Só admin. Nunca devolve o valor do segredo, só se existe.';

-- ---------------------------------------------------------------- de quebra: o visitante
--
-- 🔴 Achado ao medir os privilégios de coluna para escrever a função acima: o papel `anon` —
-- o visitante SEM login — ainda tem permissão de leitura sobre `api_key` e `webhook_secret`
-- de `configuracoes_wapi`. São a credencial e a senha do WhatsApp de cada empresa.
--
-- Hoje isso não entrega nada: não existe nenhuma regra de acesso que dê UMA linha dessa tabela
-- ao `anon` (conferido em 24/09/2026 — as 6 políticas são todas `TO authenticated`). Ou seja,
-- a proteção real é a regra, não o privilégio.
--
-- Mas é exatamente o tipo de defesa que depende de outra coisa continuar verdadeira para
-- sempre: no dia em que alguém criar uma regra de leitura para visitante nessa tabela — por
-- engano ou por uma funcionalidade nova —, a chave sai junto. A migration 20260923140000 já
-- tinha feito esse corte para o papel `authenticated`; o `anon` ficou para trás.
--
-- Revogar não muda comportamento nenhum: sem linha, não há coluna para ler.
revoke select on public.configuracoes_wapi from anon;

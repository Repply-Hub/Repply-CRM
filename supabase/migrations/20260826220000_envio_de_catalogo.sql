-- ============================================================================
-- Envio de catálogo por WhatsApp, e as travas contra banimento
-- ============================================================================
--
-- Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md §7 e §8
-- Plano:   docs/superpowers/plans/2026-08-26-enviar-catalogo-whatsapp.md
--
-- A conexão com o WhatsApp é por API NÃO OFICIAL. Número que dispara muito arquivo em pouco
-- tempo é derrubado, e perder o número é perder operação — não funcionalidade.
--
-- 🔴 SÃO DOIS TETOS, e o que protege o ativo é o do NÚMERO.
--
-- Medido em 26/08/2026: a MD Representações tem 2 números para 13 pessoas — um deles com 13
-- ligadas. Teto só por pessoa daria 13 × 10 = 130 disparos de um ÚNICO aparelho numa hora, e
-- quem o WhatsApp bane é o aparelho.
--
--   por pessoa ....... 10/hora, 40/dia
--   por número ....... 40/hora, 150/dia
--   mesmo arquivo + mesmo contato ....... 10 minutos
-- ============================================================================

create table public.fabricante_arquivo_envios (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  arquivo_id    uuid not null references public.fabricante_arquivos(id) on delete cascade,

  -- Aceita nulo SÓ para o caso de o contato ser excluído depois. Não existe caminho de envio
  -- sem escolher contato.
  contato_id    uuid references public.contatos(id) on delete set null,
  telefone      text not null,

  -- 🔴 De qual NÚMERO saiu. É esta coluna que a trava do banimento conta.
  instancia_id  uuid not null references public.configuracoes_wapi(id) on delete cascade,
  usuario_id    uuid not null references public.usuarios(id),

  enviado_em    timestamptz not null default now()
);

-- Sem estes índices a contagem vira varredura da tabela inteira a cada clique.
create index fabricante_envios_por_numero on public.fabricante_arquivo_envios (instancia_id, enviado_em desc);
create index fabricante_envios_por_pessoa on public.fabricante_arquivo_envios (usuario_id, enviado_em desc);
create index fabricante_envios_repeticao  on public.fabricante_arquivo_envios (arquivo_id, contato_id, enviado_em desc);

alter table public.fabricante_arquivo_envios enable row level security;

-- Ler: a empresa inteira. O registro também é funcionalidade — é o que permite o cartão dizer
-- "enviado para 12 clientes" e saber quem já recebeu a edição de setembro.
create policy fabricante_envios_select on public.fabricante_arquivo_envios
  for select to authenticated
  using (empresa_id = get_my_empresa_id());

-- 🔴 NENHUMA POLÍTICA DE INSERT, UPDATE OU DELETE PARA QUEM ESTÁ LOGADO, e a ausência é a
-- trava. A escrita passa só pelas funções abaixo, que são SECURITY DEFINER. Se houvesse
-- política de insert, bastaria gravar linhas falsas — ou deixar de gravar — para a contagem
-- deixar de valer, e o botão desabilitado na tela nunca foi proteção nenhuma.

comment on table public.fabricante_arquivo_envios is
  'Cada envio de catálogo por WhatsApp. É o mecanismo das travas contra banimento (contagem '
  'por número e por pessoa) e, de quebra, o histórico de quem já recebeu cada edição. '
  'Escrita SÓ por reservar_envio_de_catalogo / liberar_envio_de_catalogo.';

-- ── Reservar a vaga ────────────────────────────────────────────────────────
--
-- Devolve uma LINHA em vez de lançar erro, de propósito: quem chama precisa do horário em que
-- libera para montar a mensagem. Aviso sem horário é o que faz a pessoa continuar clicando.
create or replace function public.reservar_envio_de_catalogo(
  p_arquivo_id uuid,
  p_contato_id uuid,
  p_telefone   text
)
returns table (
  ok        boolean,
  motivo    text,
  libera_em timestamptz,
  envio_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id   uuid := get_my_usuario_id();
  v_empresa_id   uuid := get_my_empresa_id();
  v_instancia_id uuid;
  v_marco        timestamptz;
  v_novo_id      uuid;
begin
  if v_usuario_id is null or v_empresa_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid;
    return;
  end if;

  -- O arquivo tem que ser da empresa de quem pede. Sem isto, alguém de outra empresa mandaria
  -- o catálogo alheio bastando informar o id.
  if not exists (
    select 1 from fabricante_arquivos a
     where a.id = p_arquivo_id and a.empresa_id = v_empresa_id
  ) then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid;
    return;
  end if;

  -- 🔴 O NÚMERO É RESOLVIDO AQUI, a partir de quem está logado — nunca informado por quem
  -- chama. Se viesse de fora, bastaria mentir o campo para zerar a contagem do número, que é
  -- justamente a trava que protege o ativo.
  select iu.instancia_id into v_instancia_id
    from wapi_instancia_usuarios iu
   where iu.usuario_auth_id = auth.uid()
   limit 1;

  if v_instancia_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid;
    return;
  end if;

  -- ── Trava 1: mesmo arquivo, mesmo contato, 10 minutos ────────────────────
  -- Mata o clique duplo e o "será que foi?". Não é bloqueio: quem chama transforma isto em
  -- "Já enviado às 15h02", que é a resposta que a pessoa realmente queria.
  select max(e.enviado_em) + interval '10 minutes' into v_marco
    from fabricante_arquivo_envios e
   where e.arquivo_id = p_arquivo_id
     and e.contato_id is not distinct from p_contato_id
     and e.enviado_em > now() - interval '10 minutes';
  if v_marco is not null then
    return query select false, 'repeticao'::text, v_marco, null::uuid;
    return;
  end if;

  -- ── Trava 2: a pessoa ────────────────────────────────────────────────────
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where usuario_id = v_usuario_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 10;
  if v_marco is not null then
    return query select false, 'teto_pessoa_hora'::text, v_marco, null::uuid;
    return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where usuario_id = v_usuario_id and enviado_em > now() - interval '1 day') >= 40 then
    return query select false, 'teto_pessoa_dia'::text, null::timestamptz, null::uuid;
    return;
  end if;

  -- ── Trava 3: o NÚMERO. É esta que protege o ativo ────────────────────────
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where instancia_id = v_instancia_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 40;
  if v_marco is not null then
    return query select false, 'teto_numero_hora'::text, v_marco, null::uuid;
    return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where instancia_id = v_instancia_id and enviado_em > now() - interval '1 day') >= 150 then
    return query select false, 'teto_numero_dia'::text, null::timestamptz, null::uuid;
    return;
  end if;

  -- Passou: reserva a vaga NA MESMA TRANSAÇÃO da conferência. Conferir e gravar em chamadas
  -- separadas deixaria a brecha de dois cliques simultâneos passarem pela mesma contagem.
  insert into fabricante_arquivo_envios
    (empresa_id, arquivo_id, contato_id, telefone, instancia_id, usuario_id)
  values (v_empresa_id, p_arquivo_id, p_contato_id, p_telefone, v_instancia_id, v_usuario_id)
  returning id into v_novo_id;

  return query select true, null::text, null::timestamptz, v_novo_id;
end;
$$;

revoke all on function public.reservar_envio_de_catalogo(uuid, uuid, text) from public;
revoke all on function public.reservar_envio_de_catalogo(uuid, uuid, text) from anon;
grant execute on function public.reservar_envio_de_catalogo(uuid, uuid, text) to authenticated;

comment on function public.reservar_envio_de_catalogo(uuid, uuid, text) is
  'Confere as três travas contra banimento e RESERVA a vaga na mesma transação. Resolve a '
  'instância do WhatsApp a partir de auth.uid() — nunca aceita esse dado de quem chama.';

-- ── Devolver a vaga quando o envio falha ───────────────────────────────────
--
-- Sem isto, uma queda de rede consumiria uma vaga sem nenhuma mensagem ter saído — e a pessoa
-- bateria no teto sem ter mandado nada, que é o jeito mais rápido de uma trava de segurança
-- virar reclamação e depois virar pedido para desligá-la.
create or replace function public.liberar_envio_de_catalogo(p_envio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só a própria pessoa devolve a própria reserva, e só nos primeiros minutos. Sem essa
  -- janela, esta função viraria um jeito de apagar o histórico de envio de qualquer um.
  delete from fabricante_arquivo_envios
   where id = p_envio_id
     and usuario_id = get_my_usuario_id()
     and enviado_em > now() - interval '5 minutes';
end;
$$;

revoke all on function public.liberar_envio_de_catalogo(uuid) from public;
revoke all on function public.liberar_envio_de_catalogo(uuid) from anon;
grant execute on function public.liberar_envio_de_catalogo(uuid) to authenticated;

comment on function public.liberar_envio_de_catalogo(uuid) is
  'Devolve a vaga reservada quando o envio falhou. Só a própria pessoa, e só nos 5 primeiros '
  'minutos — senão viraria um jeito de apagar histórico de envio alheio.';

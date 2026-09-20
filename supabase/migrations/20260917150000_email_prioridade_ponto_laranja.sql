-- Prioridade de e-mail: ponto laranja por regra fixa do sistema.
--
-- Um e-mail RECEBIDO nasce "prioritario" quando:
--   (a) o remetente ja e contato ou cliente cadastrado NA MESMA empresa; ou
--   (b) o assunto (sem acento, minusculo) traz uma palavra de urgencia.
-- So destaca (ponto laranja na lista); nao reordena. Vale so para os e-mails
-- que chegam DEPOIS desta migration -- as linhas antigas ficam com o padrao
-- `false` e nao ganham ponto retroativo.
--
-- Decisao do Lucas (17/09/2026): regra do sistema, nao configuravel pelo
-- gestor, para a empresa toda (a caixa de e-mail e compartilhada). Medido em
-- producao antes de aplicar: ~22% dos recebidos visiveis da MD entram na regra
-- (quase todos por remetente ja conhecido; clientes.email esta vazio hoje, o
-- casamento vem de contatos).

alter table public.email_mensagens
  add column if not exists prioritaria boolean not null default false;

comment on column public.email_mensagens.prioritaria is
  'Regra fixa do sistema (gatilho email_define_prioridade): remetente ja cadastrado na empresa OU assunto com palavra de urgencia. So e-mail recebido; so destaca, nao reordena.';

-- O gatilho pergunta "este remetente ja e contato/cliente?" a cada e-mail que
-- chega. Sem um indice por (empresa_id, lower(email)) isso varreria todos os
-- contatos da empresa por insercao (a MD tem ~900). Estes indices tornam a
-- checagem uma busca direta e servem a qualquer consulta por e-mail.
create index if not exists idx_contatos_empresa_lower_email
  on public.contatos (empresa_id, lower(email));
create index if not exists idx_clientes_empresa_lower_email
  on public.clientes (empresa_id, lower(email));

create or replace function public.email_define_prioridade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- So e-mail recebido e candidato. Enviado e rascunho nunca.
  if new.direcao is distinct from 'recebido' then
    return new;
  end if;

  -- (a) Remetente ja cadastrado como contato OU cliente na MESMA empresa.
  if new.remetente_email is not null and (
       exists (
         select 1 from public.contatos c
         where c.empresa_id = new.empresa_id
           and c.email is not null
           and lower(c.email) = lower(new.remetente_email)
       )
    or exists (
         select 1 from public.clientes cl
         where cl.empresa_id = new.empresa_id
           and cl.email is not null
           and lower(cl.email) = lower(new.remetente_email)
       )
     ) then
    new.prioritaria := true;
    return new;
  end if;

  -- (b) Assunto com palavra de urgencia. `translate` tira o acento e a
  -- comparacao e em minusculo; `\y` casa a PALAVRA inteira, para "pendente"
  -- nao disparar dentro de "independente" nem "vencido" dentro de "convencido".
  if translate(
       lower(coalesce(new.assunto, '')),
       'áàâãäéèêëíìîïóòôõöúùûüçñ',
       'aaaaaeeeeiiiiooooouuuucn'
     ) ~ '\y(urgente|urgencia|pendencia|pendente|vencimento|vencido|vencendo|prazo final|aguardando retorno|aguardando resposta|reenvio)\y'
  then
    new.prioritaria := true;
    return new;
  end if;

  return new;
end;
$$;

comment on function public.email_define_prioridade() is
  'BEFORE INSERT em email_mensagens: marca prioritaria=true para e-mail recebido de remetente ja cadastrado na empresa ou com palavra de urgencia no assunto.';

drop trigger if exists trg_email_mensagens_prioridade on public.email_mensagens;
create trigger trg_email_mensagens_prioridade
  before insert on public.email_mensagens
  for each row
  execute function public.email_define_prioridade();

-- Funcao de gatilho nao precisa ser chamavel via REST/RPC. Sem isto o advisor
-- de seguranca marca "executavel por anon/authenticated". O gatilho continua
-- disparando normalmente (a maquina de gatilhos nao checa EXECUTE).
revoke execute on function public.email_define_prioridade() from public, anon, authenticated;

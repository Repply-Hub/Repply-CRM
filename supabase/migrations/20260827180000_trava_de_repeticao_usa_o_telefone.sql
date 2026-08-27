-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- A trava de repetição do envio de catálogo passa a reconhecer a pessoa pelo TELEFONE quando
-- não há contato do CRM.
--
-- 🔴 O DEFEITO. `reservar_envio_de_catalogo` identificava "já mandei este catálogo para essa
-- pessoa nos últimos 10 minutos" pelo contato do CRM:
--
--     and e.contato_id is not distinct from p_contato_id
--
-- Enquanto o destino era sempre um contato cadastrado, funcionava. Ao abrir o envio para as
-- CONVERSAS de WhatsApp, deixa de funcionar — e não um pouco. Medido em produção em 27/08/2026:
--
--     conversas de WhatsApp ........................... 779
--     delas, SEM contato do CRM vinculado ............. 779   (100%)
--
-- Com `p_contato_id` nulo, `is not distinct from null` casa com TODAS as linhas de conversa.
-- Ou seja: a trava passaria a entender que as 779 conversas são a MESMA pessoa.
--
-- O estrago no dia a dia, que é o uso principal: o vendedor manda o catálogo da Deca para o
-- João numa conversa; dois minutos depois tenta mandar para a Maria em outra, e o sistema
-- RECUSA dizendo que a Maria já recebeu. Ela não recebeu. Mandar o mesmo catálogo para vários
-- clientes seguidos é exatamente o que a funcionalidade existe para fazer.
--
-- O CONSERTO: sem contato do CRM, a pessoa é o número. `fabricante_arquivo_envios.telefone` já
-- guarda o destino de cada envio, então não é preciso dado novo nem coluna nova.
--
-- O QUE NÃO MUDA: os tetos (10/hora e 40/dia por pessoa, 40/hora e 150/dia por número), a
-- resolução da instância a partir de `auth.uid()`, a conferência de que o arquivo é da empresa
-- de quem pede, e a reserva na MESMA transação da conferência. Só a primeira trava muda.
--
-- Autorizado pelo Lucas em 27/08/2026.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.reservar_envio_de_catalogo(
  p_arquivo_id uuid,
  p_contato_id uuid,
  p_telefone text
)
returns table(ok boolean, motivo text, libera_em timestamptz, envio_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id   uuid := get_my_usuario_id();
  v_empresa_id   uuid := get_my_empresa_id();
  v_instancia_id uuid;
  v_marco        timestamptz;
  v_novo_id      uuid;
begin
  if v_usuario_id is null or v_empresa_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- O arquivo tem que ser da empresa de quem pede.
  if not exists (select 1 from fabricante_arquivos a
                  where a.id = p_arquivo_id and a.empresa_id = v_empresa_id) then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- 🔴 O NÚMERO É RESOLVIDO AQUI, de auth.uid() — nunca informado por quem chama. Se viesse
  -- de fora, bastaria mentir o campo para zerar a contagem do número.
  select iu.instancia_id into v_instancia_id
    from wapi_instancia_usuarios iu where iu.usuario_auth_id = auth.uid() limit 1;
  if v_instancia_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- ── Trava 1: mesmo arquivo, MESMA PESSOA, 10 minutos ──────────────────────────────────
  --
  -- Quem é "a mesma pessoa" depende de haver cadastro:
  --
  --   COM contato do CRM  -> o contato. Continua como sempre foi: a mesma pessoa alcançada
  --                          por dois números diferentes conta como uma só, que é o certo.
  --   SEM contato         -> o telefone. É o caso das conversas de WhatsApp, e é o que impede
  --                          a trava de tratar conversas distintas como se fossem a mesma.
  --
  -- Ressalva conhecida e aceita: a MESMA pessoa alcançada uma vez pelo cadastro e outra pela
  -- conversa cai em chaves diferentes, e as duas passariam dentro dos 10 minutos. Na prática a
  -- tela não oferece as duas portas — `montarDestinos` (src/lib/destinos-whatsapp.ts) junta
  -- cadastro e conversa numa linha só quando os dígitos do fim do número batem.
  select max(e.enviado_em) + interval '10 minutes' into v_marco
    from fabricante_arquivo_envios e
   where e.arquivo_id = p_arquivo_id
     and e.enviado_em > now() - interval '10 minutes'
     and (
       (p_contato_id is not null and e.contato_id = p_contato_id)
       or
       (p_contato_id is null and e.contato_id is null
          and p_telefone is not null and e.telefone = p_telefone)
     );
  if v_marco is not null then
    return query select false, 'repeticao'::text, v_marco, null::uuid; return;
  end if;

  -- ── Trava 2: a pessoa ──────────────────────────────────────────────────────────────────
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where usuario_id = v_usuario_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 10;
  if v_marco is not null then
    return query select false, 'teto_pessoa_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where usuario_id = v_usuario_id and enviado_em > now() - interval '1 day') >= 40 then
    return query select false, 'teto_pessoa_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- ── Trava 3: o NÚMERO. É esta que protege o ativo. ─────────────────────────────────────
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where instancia_id = v_instancia_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 40;
  if v_marco is not null then
    return query select false, 'teto_numero_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where instancia_id = v_instancia_id and enviado_em > now() - interval '1 day') >= 150 then
    return query select false, 'teto_numero_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- Reserva NA MESMA TRANSAÇÃO da conferência: conferir e gravar em chamadas separadas
  -- deixaria a brecha de dois cliques simultâneos passarem pela mesma contagem.
  insert into fabricante_arquivo_envios
    (empresa_id, arquivo_id, contato_id, telefone, instancia_id, usuario_id)
  values (v_empresa_id, p_arquivo_id, p_contato_id, p_telefone, v_instancia_id, v_usuario_id)
  returning id into v_novo_id;

  return query select true, null::text, null::timestamptz, v_novo_id;
end;
$function$;

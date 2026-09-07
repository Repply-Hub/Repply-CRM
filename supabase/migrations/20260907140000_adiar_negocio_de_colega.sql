-- ============================================================================
-- ADIAR O NEGÓCIO DE UM COLEGA, E AVISAR O DONO
-- ============================================================================
--
-- Decisão do dono do produto (05/09/2026): quem tem a chave `pauta_de_todos` AGE, não só vê.
-- E vale uma verdade só — o adiamento sai da pauta dos dois, e o dono é avisado.
--
-- Duas travas de hoje impediam isso, e as duas estão tratadas aqui:
--   · `historico_contatos_insert` só aceitava dono OU gestor;
--   · `notificacoes_insert` exige `is_gestor()`, então o aviso não pode sair do navegador.
--
-- Por isso o registro passa a ser feito por FUNÇÃO com privilégio: ela confere a permissão,
-- grava o retorno e cria o aviso num gesto só.
--
-- ----------------------------------------------------------------------------
-- 🔴 PARA VOLTAR ATRÁS: a política que este arquivo SUBSTITUI, copiada de `pg_policies`
-- em 07/09/2026, antes de aplicar. Rodar isto devolve o estado anterior (junto com um
-- `DROP FUNCTION public.registrar_retorno(uuid, text, date);` e um
-- `DROP FUNCTION public.posso_agir_no_negocio(uuid);`):
--
--   DROP POLICY IF EXISTS "historico_contatos_insert" ON public.historico_contatos;
--   CREATE POLICY "historico_contatos_insert" ON public.historico_contatos
--     AS PERMISSIVE FOR INSERT TO authenticated
--     WITH CHECK (
--       EXISTS ( SELECT 1
--          FROM pedidos p
--         WHERE ((p.id = historico_contatos.pedido_id)
--                AND ((p.usuario_id = get_my_usuario_id())
--                     OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))))
--     );
--
-- A política RESTRITIVA `historico_contatos_exige_plano_insert` (`empresa_plano_ativo()`)
-- NÃO é tocada por este arquivo e continua valendo para quem grava direto da tela.
-- ----------------------------------------------------------------------------
--
-- 🔴 O QUE FOI CONFERIDO NO BANCO ANTES DE ESCREVER (07/09/2026):
--   · `notificacoes.usuario_id`      -> `usuarios(id)`  (a chave estrangeira se chama
--     `notificacoes_vendedor_id_fkey`, herança do nome antigo — o nome mente, o alvo não).
--   · `historico_contatos.usuario_id`-> `usuarios(id)`  (idem, `..._vendedor_id_fkey`).
--     Ou seja: as duas são da família `usuarios.id`, que é o que `get_my_usuario_id()`
--     devolve. Mandar `auth.users(id)` aqui não daria erro visível — a gravação inteira
--     seria recusada pela chave estrangeira (CLAUDE.md §4.5).
--   · NÃO existe CHECK nem lista fixa em `notificacoes.tipo` nem em `historico_contatos.tipo`
--     (ambas são texto livre), então 'retorno_adiado' e 'retorno' passam.
--   · `historico_contatos.data_contato` e `.proximo_contato_em` são `timestamptz`, NÃO `date`.
--     A data entra como meia-noite UTC — exatamente o que a tela já grava hoje mandando
--     'AAAA-MM-DD' (o fuso da sessão do PostgREST é UTC). A única linha 'retorno' que existe
--     no banco está gravada assim.
--   · Nenhuma outra política de INSERT em `historico_contatos` além da que trocamos e da
--     restritiva de plano. Nenhum gatilho nas duas tabelas.
--   · `registrar_retorno` e `posso_agir_no_negocio` NÃO existiam — não há sobrecarga.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Quem pode agir sobre este negócio: o dono, um gestor, ou quem tem a chave — e, quando o
-- negócio é de OUTRA pessoa, sempre dentro da mesma empresa. Isolada porque a política e a
-- função de gravar precisam da MESMA resposta; duas cópias divergiriam em silêncio.
--
-- 🔴 A CHAVE É LIDA DIRETO DO JSON, e não por `has_funcionalidade()`. Aquela função começa
-- com "se é gestor, devolve true", o que faria todo gestor passar como se "tivesse a chave" e
-- esconderia justamente o que estamos construindo aqui.
--
-- 🔴 A CERCA DE EMPRESA fica só no ramo "negócio de outra pessoa", de propósito. O ramo
-- "negócio meu" não tinha cerca na política antiga, e `empresa_id` é anulável (há 1 usuário
-- ativo sem empresa hoje): `NULL = NULL` é falso, então exigir a igualdade também no próprio
-- negócio TIRARIA de alguém um direito que ela tem hoje. O `is not null` no ramo de fora
-- impede que dois usuários sem empresa virem "colegas".
--
-- Diferença conhecida em relação a `pauta_do_dia_de`: lá a chave, quando gravada, MANDA sobre
-- o papel; aqui ela só SOMA ao papel. É deliberado — fazer a chave desligada tirar de um
-- gestor o direito de registrar contato no negócio de um colega seria uma regressão numa
-- tela que não é a "Hoje" (o histórico do negócio, em Negocios.tsx).
CREATE OR REPLACE FUNCTION public.posso_agir_no_negocio(p_pedido_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from pedidos p
      join usuarios eu on eu.id = get_my_usuario_id()
     where p.id = p_pedido_id
       and (
         p.usuario_id = eu.id
         or (
           exists (
             select 1 from usuarios dono
              where dono.id = p.usuario_id
                and dono.empresa_id is not null
                and dono.empresa_id = eu.empresa_id
           )
           and (
             eu.role in ('gestor','admin','empresa')
             or coalesce(
                  (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
                     from permissoes_usuario pu
                    where pu.usuario_id = eu.id and pu.modulo = 'pedidos'
                      and pu.funcionalidades ? 'pauta_de_todos'),
                  false)
           )
         )
       )
  );
$function$;

-- `TO authenticated` não é decoração: `anon` TEM privilégio de INSERT nesta tabela, e é a
-- ausência de política para ele que o barra. Uma política sem `TO` valeria para PUBLIC.
DROP POLICY IF EXISTS "historico_contatos_insert" ON public.historico_contatos;
CREATE POLICY "historico_contatos_insert" ON public.historico_contatos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.posso_agir_no_negocio(pedido_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Grava o retorno e, quando o negócio é de outra pessoa, avisa o dono. Um gesto só: se o aviso
-- falhasse depois de o retorno ter sido gravado, o negócio sairia da pauta do vendedor em
-- silêncio — exatamente o que a decisão 5 do dono do produto quis evitar.
--
-- 🔴 ESTA FUNÇÃO PULA A RLS (é `SECURITY DEFINER` e o dono, `postgres`, tem `BYPASSRLS`).
-- Isso é o objetivo para as duas políticas de permissão — mas pularia também a política
-- RESTRITIVA de plano ativo, que hoje impede empresa bloqueada de gravar. Por isso a
-- checagem de plano está repetida à mão logo abaixo: sem ela, esta função seria a porta dos
-- fundos por onde uma empresa bloqueada continuaria escrevendo.
--
-- 🔴 O CÓDIGO 42501 É PROPOSITAL, e o navegador NÃO mostra a frase escrita aqui: o projeto
-- traduz toda recusa 42501 em `src/lib/recusa-do-banco.ts`, que sabe distinguir "empresa
-- bloqueada" de "sem permissão neste registro" — as duas causas possíveis deste `raise`.
-- A frase daqui continua valendo para quem lê o log ou chama a função direto no SQL.
CREATE OR REPLACE FUNCTION public.registrar_retorno(
  p_pedido_id uuid, p_motivo text, p_retorno_em date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_eu uuid; v_dono uuid; v_meu_nome text; v_titulo text;
begin
  -- Sem data não existe retorno: o negócio nunca voltaria para a pauta e o aviso ao dono
  -- sairia truncado (`to_char(null,...)` é nulo, e nulo emendado com texto anula a frase
  -- INTEIRA). Melhor recusar alto do que gravar uma linha que não serve para nada.
  if p_retorno_em is null then
    raise exception 'Escolha a data em que vale a pena procurar este negócio de novo.';
  end if;

  v_eu := get_my_usuario_id();

  if not empresa_plano_ativo() then
    raise exception 'O acesso da sua empresa está bloqueado, então nada novo é gravado.'
      using errcode = '42501';
  end if;

  if not public.posso_agir_no_negocio(p_pedido_id) then
    raise exception 'Você não pode adiar este negócio.' using errcode = '42501';
  end if;

  -- A MESMA cadeia de nomes que `pauta_do_dia_de` usa para montar o título do item. Copiar
  -- importa: `pedidos.nome` está VAZIO na base da MD (dos 146 negócios abertos, 131 têm o
  -- nome em `campos_extras ->> 'Negócio'` e 15 só chegam pelo cliente). Usando só `p.nome`, o
  -- aviso diria "o negócio saiu da sua pauta" para praticamente todo mundo — e diria um nome
  -- diferente do que a pessoa vê na tela "Hoje".
  select p.usuario_id,
         coalesce(nullif(trim(p.nome),''),
                  nullif(trim(p.campos_extras ->> 'Negócio'),''),
                  nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
                  'Negócio sem nome')
    into v_dono, v_titulo
    from pedidos p
    left join clientes cl    on cl.id = p.cliente_id
    left join fabricantes fa on fa.id = p.fabricante_id
   where p.id = p_pedido_id;

  -- `data_contato` e `proximo_contato_em` são `timestamptz`. A data entra como meia-noite
  -- UTC, que é exatamente o que a tela grava hoje mandando 'AAAA-MM-DD' — não mexer nisso é
  -- o que mantém as linhas novas comparáveis com as antigas dentro de `pauta_do_dia_de`.
  -- O "hoje" é o do calendário brasileiro, nunca `now()` cru (CLAUDE.md §7.12).
  insert into historico_contatos (pedido_id, usuario_id, tipo, descricao, data_contato, proximo_contato_em)
  values (p_pedido_id, v_eu, 'retorno', p_motivo,
          (now() at time zone 'America/Sao_Paulo')::date, p_retorno_em);

  if v_dono is distinct from v_eu then
    select u.nome into v_meu_nome from usuarios u where u.id = v_eu;
    insert into notificacoes (usuario_id, pedido_id, tipo, titulo, mensagem)
    values (v_dono, p_pedido_id, 'retorno_adiado',
            coalesce(nullif(trim(v_meu_nome),''), 'Alguém da equipe') || ' adiou um negócio seu',
            v_titulo || ' saiu da sua pauta até ' || to_char(p_retorno_em, 'DD/MM/YYYY') ||
            '. Motivo: ' || coalesce(nullif(trim(p_motivo),''), 'sem motivo registrado'));
  end if;
end;
$function$;

-- 🔴 AQUI O PADRÃO É O OPOSTO do de `pauta_do_dia_de`. Aquela é chamada só pelo servidor e
-- por isso teve `authenticated` revogado. Esta é chamada PELO NAVEGADOR: sem o GRANT abaixo,
-- o botão "Retomar depois" para de funcionar para todo mundo.
REVOKE ALL ON FUNCTION public.registrar_retorno(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno(uuid, text, date) TO authenticated;

-- `posso_agir_no_negocio` fica com o privilégio padrão (PUBLIC executa), como `is_gestor()` e
-- `usuario_in_my_empresa()`: ela é avaliada DENTRO da política, como `authenticated`, e não
-- vaza nada — responde sempre sobre quem chama, nunca sobre um identificador passado de fora.

COMMIT;

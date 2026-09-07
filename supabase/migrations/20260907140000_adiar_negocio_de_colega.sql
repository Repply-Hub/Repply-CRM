-- ============================================================================
-- ADIAR O NEGÓCIO DE UM COLEGA, E AVISAR O DONO
-- ============================================================================
--
-- Decisão do dono do produto (05/09/2026): quem tem a chave `pauta_de_todos` AGE, não só vê.
-- E vale uma verdade só — o adiamento sai da pauta dos dois, e o dono é avisado.
--
-- Este arquivo cria TRÊS funções e NÃO mexe em política nenhuma.
--
-- ----------------------------------------------------------------------------
-- 🔴 A PREMISSA QUE ESTAVA ERRADA, E POR QUE A POLÍTICA NÃO É TOCADA
-- ----------------------------------------------------------------------------
-- A primeira versão deste arquivo (commit `1882052c`) trocava a política
-- `historico_contatos_insert`, acreditando que ela recusaria o clique de um vendedor com a
-- chave. **Não recusa — ela nem é consultada.** A revisão de segurança de 07/09/2026 mediu:
--
--   · `registrar_retorno` é `SECURITY DEFINER` e o dono é `postgres`;
--   · `postgres` tem `BYPASSRLS` (`pg_roles.rolbypassrls = true`);
--   · nenhuma das tabelas tem `FORCE ROW LEVEL SECURITY`
--     (`historico_contatos`, `notificacoes`, `pedidos`, `usuarios`, `permissoes_usuario`).
--
-- Ou seja: o `insert into historico_contatos` feito DE DENTRO desta função não passa por
-- política nenhuma. O botão "Retomar depois" funciona com a política antiga intacta.
--
-- E o preço da troca era alto: ela daria a quem tivesse a chave direito de INSERT em TODO
-- negócio da empresa — em qualquer tela, e por chamada direta à API do navegador, não só na
-- tela "Hoje". Medido: a Érika passaria de 1.584 para 12.016 negócios alcançáveis; a Pricila,
-- de 2.979 para 12.016. O rótulo que o gestor lê ao conceder a chave promete outra coisa:
-- "Ver a pauta de toda a equipe" (`src/hooks/use-permissoes.ts`).
--
-- Então a política fica EXATAMENTE como está hoje em produção. Texto colhido de `pg_policies`
-- em 07/09/2026, aqui só como informação — **este arquivo não a executa, não a apaga e não a
-- recria**:
--
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
-- ⚠️ CONSEQUÊNCIA CONHECIDA E DELIBERADA, para ninguém descobrir de susto:
-- um vendedor com a chave consegue adiar pela tela "Hoje" (o gesto passa pela função, que
-- pula a RLS), mas NÃO consegue registrar um contato à mão no painel do negócio de um colega
-- (esse gesto passa pela política, que não mudou). É uma inconsistência assumida: a decisão do
-- dono do produto foi sobre a PAUTA, e abrir escrita em todo o histórico da empresa é muito
-- além do que ele pediu. Se um dia aparecer uma tela de "registrar contato" que precise da
-- régua ampla, isso vira migration própria — com o rótulo da permissão ajustado junto.
--
-- ----------------------------------------------------------------------------
-- 🔴 PARA VOLTAR ATRÁS: como nada de política é tocado, desfazer é só apagar as três funções.
-- Na ordem (a primeira depende das outras duas):
--
--   DROP FUNCTION IF EXISTS public.registrar_retorno(uuid, text, date);
--   DROP FUNCTION IF EXISTS public.posso_agir_no_negocio(uuid);
--   DROP FUNCTION IF EXISTS public.ve_pauta_de_todos(uuid);
--
-- ----------------------------------------------------------------------------
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
--   · Nenhum gatilho em `historico_contatos` nem em `notificacoes`.
--   · `registrar_retorno`, `posso_agir_no_negocio` e `ve_pauta_de_todos` NÃO existiam — não há
--     sobrecarga.
--
-- 🔴 POR QUE AS TRÊS FUNÇÕES USAM `SET search_path TO 'public', 'pg_temp'` E QUALIFICAM TUDO
-- COM `public.`: para tabela e visão, o Postgres pesquisa `pg_temp` ANTES do `search_path`
-- quando `pg_temp` não aparece na lista. São funções `SECURITY DEFINER` que escrevem, e
-- `authenticated` tem privilégio TEMPORARY neste banco (medido). Listar `pg_temp` por último
-- e qualificar cada tabela fecha as duas pontas. É o padrão das vizinhas do projeto —
-- `get_my_usuario_id`, `is_gestor` e `usuario_in_my_empresa` já escrevem `FROM public.usuarios`.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- UMA LEITURA DA CHAVE `pauta_de_todos`, PARA TODO MUNDO USAR.
--
-- Antes desta função a mesma chave era lida em lugares diferentes com regras diferentes, o que
-- diverge em silêncio: `pauta_do_dia_de` (já aplicada) faz `coalesce(chave, papel)` — a chave
-- MANDA sobre o papel —, a primeira versão deste arquivo fazia `papel OR chave` — a chave só
-- SOMA —, e a Tarefa 6 ia criar uma terceira cópia em `dashboard_negocios_risco`.
--
-- A semântica que fica valendo é a de `pauta_do_dia_de`, porque é a que já está em produção e é
-- a que a tela de permissões promete: o interruptor DESLIGADO à mão tira o alcance até de um
-- gestor. O corpo abaixo é cópia literal do bloco que `pauta_do_dia_de` usa hoje (conferido com
-- `pg_get_functiondef` em 07/09/2026) — só com as tabelas qualificadas.
--
-- ⚠️ O que este helper NÃO copia, de propósito: `pauta_do_dia_de` antes disso ainda exige que a
-- pessoa exista, tenha empresa e não esteja excluída. Isso é a checagem de entrada DAQUELA
-- função, não a leitura da chave. Aqui, usuário inexistente devolve NULL — quem chama trata.
CREATE OR REPLACE FUNCTION public.ve_pauta_de_todos(p_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
       from public.permissoes_usuario pu
      where pu.usuario_id = p_usuario_id and pu.modulo = 'pedidos'
        and pu.funcionalidades ? 'pauta_de_todos'),
    (select u.role in ('gestor','admin','empresa') from public.usuarios u where u.id = p_usuario_id)
  );
$function$;

-- 🔴 O CAST `::boolean` FICA, e é dívida conhecida: se alguém gravar um valor não booleano na
-- chave, ele estoura `22P02`. As telas gravam booleano. Trocar por leitura defensiva aqui e não
-- lá faria esta função responder diferente de `pauta_do_dia_de` — que é exatamente o problema
-- que ela existe para acabar. Quando for consertar, conserte nas duas.

-- ────────────────────────────────────────────────────────────────────────────
-- Quem pode agir sobre este negócio: o dono, ou alguém da MESMA empresa que enxerga a pauta de
-- todos. É a única régua do gesto "Retomar depois".
--
-- 🔴 A CHAVE NÃO É LIDA POR `has_funcionalidade()`. Aquela função começa com "se é gestor,
-- devolve true", o que faria todo gestor passar como se "tivesse a chave" e esconderia
-- justamente o que estamos construindo aqui. Quem responde é `ve_pauta_de_todos`, acima.
--
-- 🔴 POR QUE A RESPOSTA É A MESMA DA PAUTA, e não "papel OU chave" como na primeira versão:
-- sem a troca de política (ver o cabeçalho), esta função governa SÓ o gesto da pauta. Então ela
-- tem que responder igualzinho à pauta — se a pessoa não vê o negócio do colega na tela "Hoje",
-- ela não age sobre ele. O argumento antigo ("não regredir o histórico do negócio em
-- Negocios.tsx") deixou de valer no instante em que a política parou de ser tocada: aquele
-- caminho continua governado pela política antiga, que esta função não alcança.
--
-- 🔴 A CERCA DE EMPRESA fica só no ramo "negócio de outra pessoa", de propósito. O ramo
-- "negócio meu" não tem cerca na política que vale hoje, e `empresa_id` é anulável (há 1 usuário
-- ativo sem empresa): `NULL = NULL` é falso, então exigir a igualdade também no próprio negócio
-- TIRARIA de alguém um direito que ela tem hoje. O `is not null` no ramo de fora é redundante
-- com o `=` (nulo já reprova), e fica por ser explícito sobre a intenção.
CREATE OR REPLACE FUNCTION public.posso_agir_no_negocio(p_pedido_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.pedidos p
      join public.usuarios eu on eu.id = public.get_my_usuario_id()
     where p.id = p_pedido_id
       and (
         p.usuario_id = eu.id
         or (
           exists (
             select 1 from public.usuarios dono
              where dono.id = p.usuario_id
                and dono.empresa_id is not null
                and dono.empresa_id = eu.empresa_id
           )
           and public.ve_pauta_de_todos(eu.id)
         )
       )
  );
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Grava o retorno e, quando o negócio é de outra pessoa, avisa o dono. Um gesto só: se o aviso
-- falhasse depois de o retorno ter sido gravado, o negócio sairia da pauta do vendedor em
-- silêncio — exatamente o que a decisão 5 do dono do produto quis evitar.
--
-- 🔴 ESTA FUNÇÃO PULA A RLS (é `SECURITY DEFINER` e o dono, `postgres`, tem `BYPASSRLS`).
-- É o que faz o gesto funcionar sem mexer em política: nem `historico_contatos_insert` nem
-- `notificacoes_insert` (que exige `is_gestor()`) são consultadas daqui. Mas ela pularia também
-- a política RESTRITIVA de plano ativo, que hoje impede empresa bloqueada de gravar. Por isso a
-- checagem de plano está repetida à mão logo abaixo: sem ela, esta função seria a porta dos
-- fundos por onde uma empresa bloqueada continuaria escrevendo.
--
-- 🔴 O CÓDIGO 42501 É PROPOSITAL, e o navegador NÃO mostra a frase escrita aqui: o projeto
-- traduz toda recusa 42501 em `src/lib/recusa-do-banco.ts`, que sabe distinguir "empresa
-- bloqueada" de "sem permissão neste registro" — as duas causas possíveis deste `raise`.
-- A frase daqui continua valendo para quem lê o log ou chama a função direto no SQL.
CREATE OR REPLACE FUNCTION public.registrar_retorno(
  p_pedido_id uuid, p_motivo text, p_retorno_em date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid; v_dono uuid; v_meu_nome text; v_dono_nome text; v_titulo text;
begin
  -- Sem data não existe retorno: o negócio nunca voltaria para a pauta e o aviso ao dono
  -- sairia truncado (`to_char(null,...)` é nulo, e nulo emendado com texto anula a frase
  -- INTEIRA). Melhor recusar alto do que gravar uma linha que não serve para nada.
  if p_retorno_em is null then
    raise exception 'Escolha a data em que vale a pena procurar este negócio de novo.';
  end if;

  v_eu := public.get_my_usuario_id();

  if not public.empresa_plano_ativo() then
    raise exception 'O acesso da sua empresa está bloqueado, então nada novo é gravado.'
      using errcode = '42501';
  end if;

  if not public.posso_agir_no_negocio(p_pedido_id) then
    raise exception 'Você não pode adiar este negócio.' using errcode = '42501';
  end if;

  -- A MESMA cadeia de nomes que `pauta_do_dia_de` usa para montar o título do item. Copiar
  -- importa: `pedidos.nome` está VAZIO na base da MD (dos 146 negócios abertos, 131 têm o
  -- nome em `campos_extras ->> 'Negócio'` e 15 só chegam pelo cliente). Usando só `p.nome`, o
  -- aviso diria "o negócio saiu da pauta" para praticamente todo mundo — e diria um nome
  -- diferente do que a pessoa vê na tela "Hoje".
  -- O nome do DONO vem junto, no mesmo `select`: ele é obrigatório no texto do aviso (abaixo).
  select p.usuario_id, du.nome,
         coalesce(nullif(trim(p.nome),''),
                  nullif(trim(p.campos_extras ->> 'Negócio'),''),
                  nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
                  'Negócio sem nome')
    into v_dono, v_dono_nome, v_titulo
    from public.pedidos p
    left join public.usuarios du    on du.id = p.usuario_id
    left join public.clientes cl    on cl.id = p.cliente_id
    left join public.fabricantes fa on fa.id = p.fabricante_id
   where p.id = p_pedido_id;

  -- `data_contato` e `proximo_contato_em` são `timestamptz`. A data entra como meia-noite
  -- UTC, que é exatamente o que a tela grava hoje mandando 'AAAA-MM-DD' — não mexer nisso é
  -- o que mantém as linhas novas comparáveis com as antigas dentro de `pauta_do_dia_de`.
  -- O "hoje" é o do calendário brasileiro, nunca `now()` cru (CLAUDE.md §7.12).
  insert into public.historico_contatos
    (pedido_id, usuario_id, tipo, descricao, data_contato, proximo_contato_em)
  values (p_pedido_id, v_eu, 'retorno', p_motivo,
          (now() at time zone 'America/Sao_Paulo')::date, p_retorno_em);

  if v_dono is distinct from v_eu then
    select u.nome into v_meu_nome from public.usuarios u where u.id = v_eu;

    -- Nome vazio (ou linha ausente) anularia a frase inteira, porque nulo emendado com `||`
    -- anula tudo. Os dois lados recebem o mesmo cuidado.
    v_meu_nome  := coalesce(nullif(trim(v_meu_nome),''),  'Alguém da equipe');
    v_dono_nome := coalesce(nullif(trim(v_dono_nome),''), 'outra pessoa da equipe');

    -- 🔴 O TEXTO ESTÁ EM TERCEIRA PESSOA DE PROPÓSITO — NÃO "conserte" para "seu"/"sua".
    -- `notificacoes_select` deixa um gestor ler as notificações de TODA a empresa, e a MD tem
    -- 5 gestores. Um aviso criado para a Érika aparece no sininho dos cinco. Escrito como
    -- "adiou um negócio seu", cada um dos outros quatro leria como se o negócio fosse dele —
    -- e é exatamente o que a especificação §6.4 mandou evitar ("o texto precisa deixar claro
    -- de quem é"). Uma linha só, lida por várias pessoas: ela tem que funcionar para qualquer
    -- leitor, não só para o destinatário.
    insert into public.notificacoes (usuario_id, pedido_id, tipo, titulo, mensagem)
    values (v_dono, p_pedido_id, 'retorno_adiado',
            v_meu_nome || ' adiou um negócio de ' || v_dono_nome,
            v_titulo || ' saiu da pauta de ' || v_dono_nome ||
            ' até ' || to_char(p_retorno_em, 'DD/MM/YYYY') ||
            '. Motivo: ' || coalesce(nullif(trim(p_motivo),''), 'sem motivo registrado'));
  end if;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- PRIVILÉGIOS
--
-- `registrar_retorno` é chamada PELO NAVEGADOR (`src/hooks/use-pauta.ts`): sem o GRANT abaixo,
-- o botão "Retomar depois" para de funcionar para todo mundo.
REVOKE ALL ON FUNCTION public.registrar_retorno(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno(uuid, text, date) TO authenticated;

-- As outras duas são chamadas SÓ de dentro de `registrar_retorno`, que roda como `postgres` e
-- por isso não depende de GRANT nenhum. Sem a troca de política, nada mais as chama — nem a
-- tela, nem o PostgREST. Fechar é o mesmo padrão que `pauta_do_dia_de` já usa, e evita mais uma
-- entrada na lista do advisor `anon_security_definer_function_executable` (57 itens hoje).
-- Se um dia a tela precisar perguntar isto ao banco, o GRANT para `authenticated` volta numa
-- migration própria — hoje não precisa.
REVOKE ALL ON FUNCTION public.posso_agir_no_negocio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ve_pauta_de_todos(uuid)     FROM PUBLIC, anon, authenticated;

COMMIT;

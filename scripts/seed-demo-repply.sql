-- ============================================================================
-- BASE DE DEMONSTRAÇÃO — EMPRESA "REPPLY"
-- ============================================================================
--
-- Desenho aprovado em docs/superpowers/specs/2026-08-30-base-demo-repply-design.md
--
-- PARA QUE SERVE: dar à equipe comercial um ambiente de demonstração próprio, para
-- parar de apresentar o produto na conta da MD Representações — o que hoje expõe,
-- numa sala com pessoas de fora, a carteira real de 1.305 clientes da MD, seus
-- 11.910 negócios com valor e suas conversas de WhatsApp.
--
-- 🔴 ISTO NÃO É UMA MIGRATION. Não roda sozinho, não entra na pasta de migrations,
--    e não deve rodar em nenhum ambiente que não seja este. É conteúdo de UMA
--    empresa específica, identificada pelo id cravado abaixo.
--
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO É QUASE TODO SOBRE SEGURANÇA
-- ----------------------------------------------------------------------------
--
-- O isolamento entre empresas neste banco NÃO é por `empresa_id`. Medido em
-- 30/08/2026:
--
--   · `pedidos` não tem coluna de empresa. Só `usuario_id`.
--   · `obras`   não tem coluna de empresa NEM `usuario_id`. Só `cliente_id`.
--   · `contatos` só tem `usuario_id`.
--   · `clientes.empresa_id` existe, está NULO nas 1.306 linhas, e nenhuma
--     política de segurança o lê.
--
-- A corrente real é:   empresa ← usuário ← cliente ← obra
--                                            ↑
--                                         negócio (também preso ao usuário)
--
-- Consequência: um registro não pertence à Repply porque este arquivo diz que
-- pertence. Ele pertence porque o RESPONSÁVEL pertence. Prender ao usuário errado
-- faz o dado nascer dentro do CRM de outra empresa, sem erro nenhum aparecer.
--
-- 🔴 E DUAS TABELAS MOSTRAM PARA TODAS AS EMPRESAS O REGISTRO SEM DONO:
--
--     contatos_select : (... OR usuario_id IS NULL)
--     tarefas_select  : (... OR usuario_id IS NULL)
--
-- Um contato fictício sem responsável apareceria na carteira da MD — o oposto
-- exato do que esta base existe para resolver. Por isso a conferência do LOTE 8.
--
-- ----------------------------------------------------------------------------
-- AS CINCO TRAVAS
-- ----------------------------------------------------------------------------
--
--   1. NENHUM UPDATE OU DELETE SOBRE LINHA PREEXISTENTE. O arquivo tem exatamente
--      DOIS `update`, e os dois agem só sobre linhas que ele mesmo acabou de causar:
--        · 5.1.1 — recua a linha de histórico que o GATILHO carimbou com a data de hoje
--        · 7.3   — aponta a caixa de e-mail para as pastas criadas duas linhas acima
--      Nenhum `delete` em lugar nenhum.
--   2. DONO CRAVADO no texto, nunca deduzido por subconsulta — subconsulta errada
--      acerta a empresa errada em silêncio.
--   3. CARIMBO `_demo` em `campos_extras`, onde a coluna existe.
--   4. CENSO antes (LOTE 0) e depois (LOTE 8). Critério: todo número de toda
--      empresa que não seja a Repply tem de ficar IDÊNTICO.
--   5. NENHUM contato e NENHUMA tarefa sem responsável.
--
-- Trava extra, de brinde: todo identificador desta base segue um padrão visível
-- (11111111-… equipe, 22222222-… fábricas, 33333333-… clientes, 44444444-… obras,
-- 55555555-… contatos, 66666666-… negócios de prova). Dá para reconhecer um dado
-- de demonstração de relance, e colisão com dado real é impossível na prática.
--
-- ----------------------------------------------------------------------------
-- COMO RODAR
-- ----------------------------------------------------------------------------
-- 🔴 NO EDITOR DE SQL DO SUPABASE, COMO DONO DO BANCO. Não rode pela API do site,
--    nem com a chave pública, nem numa sessão de usuário comum — nem de admin.
--    VÁRIAS tabelas deste arquivo recusam escrita de usuário comum, em duas famílias:
--
--    (1) Sem NENHUMA regra de escrita — só o dono do banco entra:
--        · `pedidos_historico_status` — registro só-de-acrescentar; quem grava é um gatilho
--        · `email_contas`   — e ela também não tem regra de alteração, que é o que o 7.3 faz
--        · `email_pastas`
--        · `email_mensagens` — só leitura e alteração; inserir, não
--
--    (2) Escrita reservada a quem responde pela empresa:
--        · `marcadores_obras` · `usuarios` · `metas_vendas` · `plano_vendas_fabricante_ordem`
--
--    Rodando como dono, as regras de segurança por linha não se aplicam e os dois
--    passam. Rodando como usuário comum, os dois falham em silêncio: no PostgREST,
--    gravação recusada por regra de segurança **não** devolve erro — ela grava zero
--    linhas e reporta sucesso.
--
-- Um LOTE por vez, conferindo antes de seguir. O LOTE 4 é o de prova: ele existe
-- para provar o comportamento do gatilho de data ANTES de soltar 147 negócios.
-- ============================================================================


-- ============================================================================
-- LOTE 0 — CENSO INICIAL
-- ============================================================================
-- Rode isto ANTES de qualquer coisa e GUARDE O RESULTADO. É contra ele que o
-- LOTE 8 vai comparar. Sem este número guardado, não existe prova de que nada
-- foi tocado fora da Repply.

select
  e.nome as empresa,
  (select count(*) from usuarios  u where u.empresa_id = e.id)                             as usuarios,
  (select count(*) from clientes  c join usuarios u on u.id = c.usuario_id where u.empresa_id = e.id) as clientes,
  (select count(*) from contatos  k join usuarios u on u.id = k.usuario_id where u.empresa_id = e.id) as contatos,
  (select count(*) from pedidos   p join usuarios u on u.id = p.usuario_id where u.empresa_id = e.id) as negocios,
  (select count(*) from obras     o join clientes c on c.id = o.cliente_id
                                     join usuarios u on u.id = c.usuario_id where u.empresa_id = e.id) as obras,
  (select count(*) from fabricantes f where f.empresa_id = e.id)                           as fabricantes,
  (select count(*) from tarefas   t join usuarios u on u.id = t.usuario_id where u.empresa_id = e.id) as tarefas,
  (select count(*) from whatsapp_mensagens w where w.empresa_id = e.id)                    as wa_mensagens,
  (select count(*) from email_mensagens m where m.empresa_id = e.id)                       as emails
from empresas e
order by e.nome;

-- E as duas contagens da trava 5, que também não podem mudar:
select
  (select count(*) from contatos where usuario_id is null) as contatos_orfaos,
  (select count(*) from tarefas  where usuario_id is null) as tarefas_orfas;


-- ============================================================================
-- LOTE 1 — GUARDA
-- ============================================================================
-- Recusa a execução se o alvo não for exatamente o esperado. Existe para o caso
-- de alguém rodar este arquivo no banco errado, ou duas vezes.

do $$
declare
  v_empresa constant uuid := '9b17bfdf-f631-4af6-9471-a68411909a04';
  v_nome    text;
  v_ja      int;
begin
  select nome into v_nome from empresas where id = v_empresa;

  if v_nome is null then
    raise exception 'ABORTADO: a empresa % não existe neste banco. Este arquivo é de um ambiente específico.', v_empresa;
  end if;

  if v_nome <> 'Repply' then
    raise exception 'ABORTADO: a empresa % se chama "%", e não "Repply". Alvo errado.', v_empresa, v_nome;
  end if;

  -- Já rodou antes? Se já existe gente com o identificador da demo, pare.
  select count(*) into v_ja from usuarios where id = '11111111-0000-4000-8000-000000000001';
  if v_ja > 0 then
    raise exception 'ABORTADO: a base de demonstração já foi inserida. Rodar de novo duplicaria tudo.';
  end if;

  -- O usuário real que ancora os compromissos precisa existir e ter login.
  if not exists (
    select 1 from usuarios
    where id = '37b5a8eb-09d8-4cd6-b823-8b19022edbac'
      and user_id = '1fb1cf42-cd27-4146-91ad-4057f94d5473'
      and empresa_id = v_empresa
  ) then
    raise exception 'ABORTADO: o usuário "Repply Suporte" não está como esperado. Os compromissos dependem do login dele.';
  end if;

  raise notice 'Guarda passou. Alvo: empresa "%" (%).', v_nome, v_empresa;
end $$;


-- ============================================================================
-- LOTE 2 — EQUIPE, REPRESENTADAS E MARCADORES DE OBRA
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 A equipe fictícia — CINCO PESSOAS SEM LOGIN
-- ---------------------------------------------------------------------------
-- `usuarios.user_id` fica NULO de propósito: ninguém entra com estas contas.
-- Elas existem para aparecer como responsável, nos gráficos de conversão e nas
-- metas do Plano de Vendas — sem criar nenhuma senha nova no mundo.
--
-- Os primeiros nomes foram escolhidos fora da lista de pessoas reais já
-- cadastradas no sistema, para ninguém confundir demonstração com gente de
-- verdade. O domínio `demo.` no e-mail deixa isso explícito.

insert into usuarios (id, empresa_id, user_id, nome, email, role, telefone,
                      assinatura_imagem_mostrar_nome, assinatura_imagem_mostrar_empresa)
values
  ('11111111-0000-4000-8000-000000000001', '9b17bfdf-f631-4af6-9471-a68411909a04', null,
   'Helena Braga',   'helena.braga@demo.repplyhub.com.br',   'gestor',   '(84) 99100-0001', true, true),
  ('11111111-0000-4000-8000-000000000002', '9b17bfdf-f631-4af6-9471-a68411909a04', null,
   'Otávio Rangel',  'otavio.rangel@demo.repplyhub.com.br',  'vendedor', '(84) 99100-0002', true, true),
  ('11111111-0000-4000-8000-000000000003', '9b17bfdf-f631-4af6-9471-a68411909a04', null,
   'Beatriz Nunes',  'beatriz.nunes@demo.repplyhub.com.br',  'vendedor', '(84) 99100-0003', true, true),
  ('11111111-0000-4000-8000-000000000004', '9b17bfdf-f631-4af6-9471-a68411909a04', null,
   'Murilo Sandes',  'murilo.sandes@demo.repplyhub.com.br',  'vendedor', '(84) 99100-0004', true, true),
  ('11111111-0000-4000-8000-000000000005', '9b17bfdf-f631-4af6-9471-a68411909a04', null,
   'Larissa Coelho', 'larissa.coelho@demo.repplyhub.com.br', 'vendedor', '(84) 99100-0005', true, true);

-- ---------------------------------------------------------------------------
-- 2.2 As representadas
-- ---------------------------------------------------------------------------
-- 🔴 MARCAS REAIS, POR DECISÃO DO LUCAS EM 30/08/2026 — e escolhidas FORA das 28
-- que a MD e a JHS já cadastraram (Deca, Eliane, Elizabeth, Quartzolit, Soprano,
-- Astra, Brasilit, Durafloor, Isover, Placo, Pormade, Iquine, Hydra, Pado…).
--
-- O motivo não é jurídico, é de vazamento: se a demonstração usasse as mesmas
-- marcas, ela revelaria indiretamente a carteira de representadas da MD numa
-- reunião com terceiros — o mesmo problema que esta base existe para resolver.
--
-- Ao acrescentar marca aqui no futuro, confira antes:
--   select nome from fabricantes where empresa_id <> '9b17bfdf-f631-4af6-9471-a68411909a04';

insert into fabricantes (id, empresa_id, nome, nome_contato, telefone, cnpj, ativo, campos_extras)
values
  ('22222222-0000-4000-8000-000000000001', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Portobello',          'Central de Representantes', '(48) 3279-0001', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Revestimentos cerâmicos"}'::jsonb),
  ('22222222-0000-4000-8000-000000000002', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Biancogres',          'Central de Representantes', '(27) 3336-0002', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Porcelanato"}'::jsonb),
  ('22222222-0000-4000-8000-000000000003', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Docol',               'Central de Representantes', '(47) 3451-0003', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Metais sanitários"}'::jsonb),
  ('22222222-0000-4000-8000-000000000004', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Amanco',              'Central de Representantes', '(11) 4133-0004', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Tubos e conexões"}'::jsonb),
  ('22222222-0000-4000-8000-000000000005', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Suvinil',             'Central de Representantes', '(11) 4589-0005', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Tintas"}'::jsonb),
  ('22222222-0000-4000-8000-000000000006', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Vedacit',             'Central de Representantes', '(11) 2107-0006', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Impermeabilizantes"}'::jsonb),
  ('22222222-0000-4000-8000-000000000007', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Lorenzetti',          'Central de Representantes', '(11) 2118-0007', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Elétrica e aquecimento"}'::jsonb),
  ('22222222-0000-4000-8000-000000000008', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Votorantim Cimentos', 'Central de Representantes', '(11) 4034-0008', null, true, '{"_demo": true, "_lote": "2026-08-30", "segmento": "Cimento e argamassa"}'::jsonb);

-- Ordem das fábricas no Plano de Vendas.
-- ⚠️ Isto só afeta a visão "Por vendedor" e o diálogo de edição: a função
-- `plano_vendas_progresso` perdeu o ORDER BY por esta tabela na migration
-- 20260812120000 e nunca o recuperou (item conhecido). Fica gravado assim mesmo,
-- para quando for consertado.
insert into plano_vendas_fabricante_ordem (empresa_id, fabricante_id, ordem)
select '9b17bfdf-f631-4af6-9471-a68411909a04', id, ordem
from (values
  ('22222222-0000-4000-8000-000000000001'::uuid, 0),
  ('22222222-0000-4000-8000-000000000002'::uuid, 1),
  ('22222222-0000-4000-8000-000000000003'::uuid, 2),
  ('22222222-0000-4000-8000-000000000004'::uuid, 3),
  ('22222222-0000-4000-8000-000000000005'::uuid, 4),
  ('22222222-0000-4000-8000-000000000006'::uuid, 5),
  ('22222222-0000-4000-8000-000000000007'::uuid, 6),
  ('22222222-0000-4000-8000-000000000008'::uuid, 7)
) as v(id, ordem);

-- ---------------------------------------------------------------------------
-- 2.3 Marcadores de obra
-- ---------------------------------------------------------------------------
-- A tabela `marcadores_obras` nasce VAZIA por decisão de produto (24/08/2026) —
-- o antigo `status_obras` foi derrubado justamente por impor uma lista que
-- ninguém usava. Aqui a lista existe porque a demonstração precisa mostrar a
-- funcionalidade; não é um padrão para cliente novo.
--
-- NÃO CONFUNDIR com `marcadores` (negócio/contato), que a empresa já tem com 3
-- linhas criadas por gatilho e que este arquivo não toca.

insert into marcadores_obras (id, empresa_id, slug, nome, cor, ordem, is_sistema)
values
  ('77777777-0000-4000-8000-000000000001', '9b17bfdf-f631-4af6-9471-a68411909a04', 'fundacao',    'Fundação',            'kanban-new',        0, false),
  ('77777777-0000-4000-8000-000000000002', '9b17bfdf-f631-4af6-9471-a68411909a04', 'estrutura',   'Estrutura',           'kanban-budget',     1, false),
  ('77777777-0000-4000-8000-000000000003', '9b17bfdf-f631-4af6-9471-a68411909a04', 'acabamento',  'Acabamento',          'kanban-negotiation', 2, false),
  ('77777777-0000-4000-8000-000000000004', '9b17bfdf-f631-4af6-9471-a68411909a04', 'entregue',    'Entregue',            'kanban-closed',     3, false);

-- CONFERÊNCIA DO LOTE 2 — esperado: 5, 8, 8, 4
select
  (select count(*) from usuarios where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04' and user_id is null) as equipe_sem_login,
  (select count(*) from fabricantes where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as fabricantes,
  (select count(*) from plano_vendas_fabricante_ordem where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as ordem_fabricantes,
  (select count(*) from marcadores_obras where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as marcadores_obra;


-- ============================================================================
-- LOTE 3 — CARTEIRA: CLIENTES, CONTATOS E OBRAS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Clientes — 35 empresas fictícias de Natal e região
-- ---------------------------------------------------------------------------
-- `usuario_id` é o que prende cada cliente à Repply (trava 2). Ele é distribuído
-- entre os cinco vendedores para os gráficos "por responsável" terem o que
-- mostrar.
--
-- `tipo` usa os valores que o próprio sistema reconhece na importação
-- (src/components/clientes/ImportClientesDialog.tsx:45): construtora, loja,
-- pessoa fisica, condominio, hospital, distribuidor, hotel, escola.
--
-- ⚠️ `empresa_id` fica NULO de propósito, igual às 1.306 linhas reais do banco.
-- Preencher só nesta base criaria uma exceção que ninguém espera, e nenhuma
-- política de segurança lê essa coluna. Quem manda é o `usuario_id`.

insert into clientes (id, usuario_id, empresa, razao_social, tipo, cnpj, email, telefone,
                      cidade, uf, bairro, logradouro, numero, cep, classificacao,
                      data_criacao, campos_extras)
select
  ('33333333-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.dono::uuid,
  v.nome,
  v.nome || ' LTDA',
  v.tipo,
  -- CNPJ fictício, com prefixo 00 que não corresponde a registro real
  '00.' || lpad((100 + v.n)::text, 3, '0') || '.' || lpad((200 + v.n)::text, 3, '0') || '/0001-' || lpad(v.n::text, 2, '0'),
  lower(replace(replace(replace(v.nome, ' ', ''), '&', ''), '.', '')) || '@demo.exemplo.com.br',
  '(84) 3' || lpad((200 + v.n)::text, 3, '0') || '-' || lpad((1000 + v.n)::text, 4, '0'),
  v.cidade, 'RN', v.bairro, v.logradouro, (100 + v.n * 7)::text,
  '590' || lpad((10 + v.n)::text, 2, '0') || '-000',
  v.classificacao,
  (current_date - (v.n * 9))::text,
  '{"_demo": true, "_lote": "2026-08-30"}'::jsonb
from (values
  ( 1,'Construtora Ponta Negra',     'construtora','Natal','Ponta Negra','Av. Engenheiro Roberto Freire','11111111-0000-4000-8000-000000000002','A'),
  ( 2,'Edificar Potiguar',           'construtora','Natal','Lagoa Nova','Av. Prudente de Morais',        '11111111-0000-4000-8000-000000000003','A'),
  ( 3,'Construtora Alecrim',         'construtora','Natal','Alecrim','Rua Presidente Quaresma',          '11111111-0000-4000-8000-000000000004','B'),
  ( 4,'Dunas Empreendimentos',       'construtora','Natal','Capim Macio','Av. dos Caiapós',              '11111111-0000-4000-8000-000000000005','A'),
  ( 5,'Construtora Tirol',           'construtora','Natal','Tirol','Av. Afonso Pena',                    '11111111-0000-4000-8000-000000000002','B'),
  ( 6,'Rio Grande Engenharia',       'construtora','Parnamirim','Nova Parnamirim','Av. Ayrton Senna',    '11111111-0000-4000-8000-000000000003','A'),
  ( 7,'Construtora Petrópolis',      'construtora','Natal','Petrópolis','Av. Campos Sales',              '11111111-0000-4000-8000-000000000004','B'),
  ( 8,'Litoral Norte Construções',   'construtora','Extremoz','Centro','Rua São Miguel',                 '11111111-0000-4000-8000-000000000005','C'),
  ( 9,'Habitar Nordeste',            'construtora','Natal','Candelária','Av. Amintas Barros',            '11111111-0000-4000-8000-000000000002','A'),
  (10,'Construtora Mirassol',        'construtora','Natal','Mirassol','Av. Omar O Farril',               '11111111-0000-4000-8000-000000000003','B'),
  (11,'Areia Branca Incorporadora',  'construtora','Natal','Neópolis','Av. Maria Lacerda Montenegro',    '11111111-0000-4000-8000-000000000004','A'),
  (12,'Construtora Cidade Verde',    'construtora','Parnamirim','Cohabinal','Av. Tocantins',             '11111111-0000-4000-8000-000000000005','B'),
  (13,'Serra Azul Engenharia',       'construtora','Macaíba','Centro','Rua Juvenal Lamartine',           '11111111-0000-4000-8000-000000000002','C'),
  (14,'Construtora Redinha',         'construtora','Natal','Redinha','Av. João Medeiros Filho',          '11111111-0000-4000-8000-000000000003','B'),
  (15,'Marinas Empreendimentos',     'construtora','Natal','Areia Preta','Av. Getúlio Vargas',           '11111111-0000-4000-8000-000000000004','A'),
  (16,'Construtora Pitimbu',         'construtora','Natal','Pitimbu','Av. Jaguarari',                    '11111111-0000-4000-8000-000000000005','C'),
  (17,'Nova Era Construções',        'construtora','São Gonçalo do Amarante','Centro','Rua Bela Vista',  '11111111-0000-4000-8000-000000000002','B'),
  (18,'Construtora Candelária',      'construtora','Natal','Candelária','Av. Romualdo Galvão',           '11111111-0000-4000-8000-000000000003','A'),
  (19,'Potengi Obras e Projetos',    'construtora','Natal','Potengi','Av. Moema Tinoco',                 '11111111-0000-4000-8000-000000000004','B'),
  (20,'Construtora Ribeira',         'construtora','Natal','Ribeira','Av. Duque de Caxias',              '11111111-0000-4000-8000-000000000005','C'),
  (21,'Casa Forte Materiais',        'loja','Natal','Lagoa Nova','Av. Salgado Filho',                    '11111111-0000-4000-8000-000000000002','A'),
  (22,'Depósito Cidade Alta',        'loja','Natal','Cidade Alta','Av. Rio Branco',                      '11111111-0000-4000-8000-000000000003','B'),
  (23,'Casa do Construtor Natal',    'loja','Natal','Capim Macio','Av. Abel Cabral',                     '11111111-0000-4000-8000-000000000004','A'),
  (24,'Materiais Bom Preço',         'loja','Parnamirim','Emaús','Av. Maria Lacerda',                    '11111111-0000-4000-8000-000000000005','C'),
  (25,'Center Obra Potiguar',        'loja','Natal','Nazaré','Av. Bernardo Vieira',                      '11111111-0000-4000-8000-000000000002','B'),
  (26,'Depósito São José',           'loja','Macaíba','Centro','Rua Cel. João Medeiros',                 '11111111-0000-4000-8000-000000000003','C'),
  (27,'Distribuidora Norte Rio',     'distribuidor','Natal','Zona Industrial','Rod. BR-101',             '11111111-0000-4000-8000-000000000004','A'),
  (28,'Atacado Construir RN',        'distribuidor','Parnamirim','Distrito Industrial','Av. das Indústrias','11111111-0000-4000-8000-000000000005','B'),
  (29,'Condomínio Vista do Mar',     'condominio','Natal','Ponta Negra','Rua Praia de Genipabu',         '11111111-0000-4000-8000-000000000002','B'),
  (30,'Condomínio Parque das Dunas', 'condominio','Natal','Capim Macio','Av. Praia de Ponta Negra',      '11111111-0000-4000-8000-000000000003','C'),
  (31,'Hotel Costa Atlântica',       'hotel','Natal','Ponta Negra','Via Costeira',                       '11111111-0000-4000-8000-000000000004','A'),
  (32,'Hotel Farol das Dunas',       'hotel','Natal','Areia Preta','Av. Pres. Café Filho',               '11111111-0000-4000-8000-000000000005','B'),
  (33,'Hospital Santa Luzia',        'hospital','Natal','Tirol','Av. Deodoro da Fonseca',                '11111111-0000-4000-8000-000000000002','A'),
  (34,'Colégio Monte Sinai',         'escola','Natal','Lagoa Nova','Av. Xavier da Silveira',             '11111111-0000-4000-8000-000000000003','B'),
  (35,'Escola Técnica do Potengi',   'escola','Natal','Potengi','Av. das Fronteiras',                    '11111111-0000-4000-8000-000000000004','C')
) as v(n, nome, tipo, cidade, bairro, logradouro, dono, classificacao);

-- ---------------------------------------------------------------------------
-- 3.2 Contatos — as pessoas dentro dos clientes
-- ---------------------------------------------------------------------------
-- 🔴 TRAVA 5: `usuario_id` NUNCA nulo. Contato órfão aparece na tela de TODAS as
-- empresas do sistema, inclusive a MD (política `contatos_select`, cláusula
-- `OR usuario_id IS NULL`). O responsável herdado é o mesmo do cliente.
--
-- Dois contatos por cliente nos 25 primeiros, um nos demais — 60 no total.

insert into contatos (id, usuario_id, cliente_id, nome_contato, cargo, email, telefone,
                      empresa, cidade, uf, data_criacao, campos_extras)
select
  ('55555555-0000-4000-8000-' || lpad(b.seq::text, 12, '0'))::uuid,
  b.usuario_id,                       -- herda o dono do cliente. NUNCA nulo.
  b.cliente_id,
  b.nome,
  b.cargo,
  lower(translate(split_part(b.nome, ' ', 1),
                  'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ',
                  'aaaaeeioooucAAAAEEIOOOUC'))
    || '.' || b.seq || '@demo.exemplo.com.br',
  '(84) 9' || lpad((8000 + b.seq)::text, 4, '0') || '-' || lpad((1000 + b.seq)::text, 4, '0'),
  b.empresa, b.cidade, b.uf,
  (current_date - (b.seq * 5))::text,
  '{"_demo": true, "_lote": "2026-08-30"}'::jsonb
from (
  select
    row_number() over (order by a.cliente_n, a.k) as seq,
    a.*
  from (
    select
      c.id  as cliente_id,
      c.usuario_id, c.empresa, c.cidade, c.uf,
      -- os 12 últimos caracteres do identificador são o número do cliente (1..35)
      (right(c.id::text, 12))::int as cliente_n,
      g.k,
      (array[
        'Ana Ferreira','Carlos Tavares','Débora Lins','Eduardo Pontes','Flávia Maia',
        'Gustavo Bezerra','Isabela Rocha','João Vitorino','Karina Melo','Leandro Ávila',
        'Mariana Duarte','Nelson Aguiar','Olívia Campos','Paulo Lopes','Renata Vasconcelos',
        'Sérgio Batista','Tatiana Freire','Ubiratan Costa','Vanessa Moura','Wagner Trindade'
      ])[1 + mod(abs(('x' || substr(md5('ct' || c.id::text || g.k::text), 1, 7))::bit(28)::int), 20)] as nome,
      (array[
        'Engenheiro de Obras','Comprador','Diretor Técnico','Almoxarife','Sócio-proprietário',
        'Gerente de Suprimentos','Arquiteto','Mestre de Obras','Coordenador de Projetos','Financeiro'
      ])[1 + mod(abs(('x' || substr(md5('cg' || c.id::text || g.k::text), 1, 7))::bit(28)::int), 10)] as cargo
    from clientes c
    cross join generate_series(1, 2) as g(k)
    where c.id::text like '33333333-0000-4000-8000-%'
      -- os 25 primeiros clientes ganham DOIS contatos; os 10 últimos, um. Total: 60.
      and (g.k = 1 or (right(c.id::text, 12))::int <= 25)
  ) a
) b;

-- ---------------------------------------------------------------------------
-- 3.3 Obras — 18 canteiros com coordenadas REAIS de Natal
-- ---------------------------------------------------------------------------
-- As coordenadas são de verdade porque o mapa (Leaflet + OpenStreetMap) e a rota
-- de visita só ficam apresentáveis se os pontos caírem em lugares plausíveis da
-- cidade. Elas apontam para vias públicas, não para endereço de ninguém.
--
-- `geocoded_at` é preenchido para o app NÃO tentar geocodificar de novo: o
-- Nominatim aceita uma consulta por segundo (use-geocode-obras.ts) e 18 obras
-- sem coordenada virariam 18 chamadas na primeira abertura da tela.
--
-- A obra pertence à Repply porque o CLIENTE dela pertence — `obras` não tem
-- coluna de empresa nem de usuário.

insert into obras (id, cliente_id, nome_obra, spe_cnpj, endereco_entrega,
                   latitude, longitude, geocoded_at, marcador_id, campos_extras)
select
  ('44444444-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  ('33333333-0000-4000-8000-' || lpad(v.cli::text, 12, '0'))::uuid,
  v.nome,
  case when v.spe then '00.' || lpad((700 + v.n)::text, 3, '0') || '.' || lpad((800 + v.n)::text, 3, '0') || '/0001-' || lpad(v.n::text, 2, '0') else null end,
  v.endereco,
  v.lat, v.lng, now(),
  ('77777777-0000-4000-8000-' || lpad(v.marc::text, 12, '0'))::uuid,
  '{"_demo": true, "_lote": "2026-08-30"}'::jsonb
from (values
  ( 1, 1,'Residencial Mar Aberto',      'Av. Eng. Roberto Freire, 1800 - Ponta Negra, Natal - RN', -5.8817, -35.1740, true , 3),
  ( 2, 1,'Edifício Coral Bay',          'Rua Praia de Ponta Negra, 240 - Ponta Negra, Natal - RN', -5.8865, -35.1698, false, 2),
  ( 3, 2,'Condomínio Solar da Lagoa',   'Av. Prudente de Morais, 4200 - Lagoa Nova, Natal - RN',   -5.8210, -35.2080, true , 2),
  ( 4, 2,'Residencial Vista Nova',      'Av. Salgado Filho, 2100 - Lagoa Nova, Natal - RN',        -5.8175, -35.2045, false, 1),
  ( 5, 4,'Torre Capim Macio',           'Av. dos Caiapós, 900 - Capim Macio, Natal - RN',          -5.8600, -35.2020, true , 3),
  ( 6, 4,'Residencial Dunas Park',      'Av. Abel Cabral, 1500 - Capim Macio, Natal - RN',         -5.8655, -35.1975, false, 2),
  ( 7, 6,'Condomínio Ayrton Senna',     'Av. Ayrton Senna, 3000 - Nova Parnamirim, Parnamirim - RN', -5.9080, -35.2260, true , 1),
  ( 8, 6,'Residencial Cohabinal',       'Av. Tocantins, 450 - Cohabinal, Parnamirim - RN',         -5.9155, -35.2440, false, 1),
  ( 9, 9,'Edifício Amintas Barros',     'Av. Amintas Barros, 3700 - Candelária, Natal - RN',       -5.8350, -35.2130, false, 3),
  (10, 9,'Residencial Candelária Prime','Av. Romualdo Galvão, 1900 - Candelária, Natal - RN',      -5.8290, -35.2115, true , 2),
  (11,11,'Condomínio Neópolis Green',   'Av. Maria Lacerda Montenegro, 800 - Neópolis, Natal - RN',-5.8710, -35.2145, true , 2),
  (12,15,'Edifício Areia Preta',        'Av. Getúlio Vargas, 1500 - Areia Preta, Natal - RN',      -5.7860, -35.1975, false, 4),
  (13,18,'Residencial Romualdo',        'Av. Romualdo Galvão, 2400 - Candelária, Natal - RN',      -5.8305, -35.2100, false, 1),
  (14,19,'Conjunto Moema Tinoco',       'Av. Moema Tinoco, 2200 - Potengi, Natal - RN',            -5.7620, -35.2510, true , 2),
  (15,31,'Reforma Hotel Costa Atlântica','Via Costeira, 8000 - Ponta Negra, Natal - RN',           -5.8650, -35.1810, false, 3),
  (16,33,'Ala Nova Hospital Santa Luzia','Av. Deodoro da Fonseca, 700 - Tirol, Natal - RN',        -5.7935, -35.2070, false, 3),
  (17,17,'Loteamento Nova Era',         'Rua Bela Vista, 300 - Centro, São Gonçalo do Amarante - RN', -5.7930, -35.3290, true , 1),
  (18,13,'Residencial Serra Azul',      'Rua Juvenal Lamartine, 150 - Centro, Macaíba - RN',       -5.8580, -35.3540, false, 4)
) as v(n, cli, nome, endereco, lat, lng, spe, marc);

-- ---------------------------------------------------------------------------
-- 3.4 Vínculo obra ↔ contato
-- ---------------------------------------------------------------------------
-- Relação N:N criada em 27/08/2026. Cada obra recebe um contato do MESMO cliente
-- — vincular contato de outro cliente seria dado incoerente na tela.

insert into obra_contatos (id, obra_id, contato_id)
select gen_random_uuid(), o.id, k.id
from obras o
join lateral (
  select k.id
  from contatos k
  where k.cliente_id = o.cliente_id
  order by k.id
  limit 1
) k on true
where o.id::text like '44444444-0000-4000-8000-%';

-- CONFERÊNCIA DO LOTE 3 — esperado: 35 clientes, 60 contatos, 0 órfãos, 18 obras
select
  (select count(*) from clientes where id::text like '33333333-0000-4000-8000-%') as clientes,
  (select count(*) from contatos where id::text like '55555555-0000-4000-8000-%') as contatos,
  (select count(*) from contatos where id::text like '55555555-0000-4000-8000-%' and usuario_id is null) as contatos_sem_dono_TEM_QUE_SER_ZERO,
  (select count(*) from obras    where id::text like '44444444-0000-4000-8000-%') as obras,
  (select count(*) from obra_contatos oc join obras o on o.id = oc.obra_id where o.id::text like '44444444-0000-4000-8000-%') as vinculos;


-- ============================================================================
-- LOTE 4 — 🔴 LOTE DE PROVA: TRÊS NEGÓCIOS
-- ============================================================================
-- POR QUE ESTE LOTE EXISTE, EM VEZ DE INSERIR OS 150 DE UMA VEZ:
--
-- O gatilho `fn_set_pedido_fechado_em` (migration 20260821120100) age no INSERT
-- quando o negócio já nasce em 'fechamento' ou 'perdido'. Lendo o código, ele
-- RESPEITA a data que vier preenchida e só carimba a de hoje quando ela chega
-- vazia. Se essa leitura estiver errada, os 12 meses de histórico viram todos
-- "hoje" — e o gráfico de faturamento, que é o principal da demonstração, mostra
-- uma barra só.
--
-- Estes três provam o comportamento antes de valer para 147.
--   · um aberto              → não deve ganhar data de fechamento
--   · um ganho COM data      → a data tem de ser respeitada, não sobrescrita
--   · um perdido COM data    → idem

insert into pedidos (id, cliente_id, fabricante_id, usuario_id, funil_id, obra_id,
                     nome, data_pedido, status, prazo_resposta, valor_total,
                     origem_lead, observacoes, campos_extras)
values
  ('66666666-0000-4000-8000-000000000001',
   '33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000002', 'a5f1074c-f35b-4b99-b90c-da4a4014bbb3',
   '44444444-0000-4000-8000-000000000001',
   'Porcelanato área comum - Torre A', current_date - 20, 'negociacao', null, 84500.00,
   'Indicação', 'Cliente pediu revisão do prazo de entrega.', '{"_demo": true, "_lote": "2026-08-30", "_prova": true}'::jsonb),

  ('66666666-0000-4000-8000-000000000002',
   '33333333-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000003',
   '11111111-0000-4000-8000-000000000004', 'a5f1074c-f35b-4b99-b90c-da4a4014bbb3',
   '44444444-0000-4000-8000-000000000003',
   'Metais sanitários - 48 unidades', current_date - 200, 'fechamento', current_date - 170, 132900.00,
   'Visita a obra', 'Fechado com desconto de 4% aprovado pela fábrica.', '{"_demo": true, "_lote": "2026-08-30", "_prova": true}'::jsonb),

  ('66666666-0000-4000-8000-000000000003',
   '33333333-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000005',
   '11111111-0000-4000-8000-000000000003', 'a5f1074c-f35b-4b99-b90c-da4a4014bbb3',
   '44444444-0000-4000-8000-000000000007',
   'Tinta acrílica fachada - 900L', current_date - 150, 'perdido', current_date - 120, 47800.00,
   'WhatsApp', 'Perdido por prazo: concorrente entregava em 10 dias.', '{"_demo": true, "_lote": "2026-08-30", "_prova": true}'::jsonb);

-- 🔴 PARE AQUI E CONFIRA. O resultado esperado é:
--
--   nome                              | status     | prazo_resposta | fechado_em
--   Porcelanato área comum - Torre A  | negociacao | NULO           | NULO
--   Metais sanitários - 48 unidades   | fechamento | hoje-170       | preenchido (now)
--   Tinta acrílica fachada - 900L     | perdido    | hoje-120       | preenchido (now)
--
-- Se `prazo_resposta` dos dois últimos vier com a data de HOJE em vez da que foi
-- mandada, o gatilho sobrescreve — e o LOTE 5 precisa ser ajustado ANTES de rodar.
-- `fechado_em` com a data de hoje é ESPERADO e inofensivo: nenhuma tela lê essa
-- coluna (há teste que impede: src/hooks/use-pedidos-filtro-data.test.ts).

select nome, status, prazo_resposta, fechado_em, data_pedido
from pedidos
where id::text like '66666666-0000-4000-8000-%'
order by id;


-- ============================================================================
-- LOTE 5 — OS 147 NEGÓCIOS RESTANTES
-- ============================================================================
-- Só rode depois de o LOTE 4 conferir.
--
-- DISTRIBUIÇÃO PENSADA PARA A DEMONSTRAÇÃO:
--   novo_lead   24 | elaboracao  20 | enviado     29
--   negociacao  19 | fechamento  40 | perdido     15     = 147
--
-- REGRA DAS DATAS (CLAUDE.md §4.4 — `prazo_resposta` NÃO é prazo, é a DATA DE
-- FECHAMENTO, e é dela que sai todo o dinheiro dos painéis):
--   · `data_pedido`     espalhado nos últimos 12 meses  → alimenta a CONVERSÃO
--   · `prazo_resposta`  só em ganho e perdido           → alimenta o FATURAMENTO
--   · negócio aberto fica SEM data de fechamento. Inventar uma criaria exatamente
--     a distorção que hoje existe na base da MD (32 dos 193 abertos têm data de
--     fechamento anterior à de criação).
--
-- Os ATRIBUTOS dos 147 negócios são determinísticos (md5 do índice): cliente,
-- fabricante, vendedor, obra, produto, valor, origem e datas saem sempre iguais.
-- Já o IDENTIFICADOR de cada negócio é sorteado na hora, e os blocos 5.2, 5.3 e 6.2
-- decidem a partir DELE quem ganha comentário, histórico de interação e tarefa —
-- então esses três variam entre execuções. Não é problema (o script roda uma vez, e
-- a guarda do LOTE 1 impede a segunda), mas a base não é reproduzível byte a byte.

insert into pedidos (id, cliente_id, fabricante_id, usuario_id, funil_id, obra_id,
                     nome, data_pedido, status, prazo_resposta, valor_total,
                     origem_lead, observacoes, campos_extras)
select
  gen_random_uuid(),
  ('33333333-0000-4000-8000-' || lpad((1 + mod(r.h_cli, 35))::text, 12, '0'))::uuid,
  ('22222222-0000-4000-8000-' || lpad((1 + mod(r.h_fab, 8))::text, 12, '0'))::uuid,
  ('11111111-0000-4000-8000-' || lpad((1 + mod(r.h_ven, 5))::text, 12, '0'))::uuid,
  'a5f1074c-f35b-4b99-b90c-da4a4014bbb3',
  -- 🔴 A obra tem de ser DO CLIENTE do negócio. Sortear obra por um hash independente
  --    do cliente casa negócio de um cliente com obra de outro: a tela de negócio
  --    mostra o selo do dono da obra em cima do valor escolhido
  --    (src/lib/opcoes-de-obra.ts) e o prospect vê incoerência na primeira olhada.
  --    Cliente sem obra cadastrada fica sem obra, que é o caso da vida real.
  case when mod(r.h_obr, 10) < 6 then o.id else null end,
  r.produto || ' - ' || r.detalhe,
  r.criado,
  r.status,
  r.fechado,
  r.valor,
  r.origem,
  r.observacao,
  '{"_demo": true, "_lote": "2026-08-30"}'::jsonb
from (
  select
    x.*,
    -- a criação DERIVA do fechamento nos negócios encerrados (12 a 71 dias antes);
    -- nos abertos ela é sorteada nos últimos 12 meses, como antes
    case when x.fechado is not null
         then x.fechado - (12 + mod(x.h_gap, 60))
         else current_date - (8 + mod(x.h_cri, 350))
    end as criado
  from (
  select
    i,
    -- sorteios estáveis: 28 bits, sempre não negativo
    abs(('x' || substr(md5('gap' || i::text), 1, 7))::bit(28)::int) as h_gap,
    abs(('x' || substr(md5('cri' || i::text), 1, 7))::bit(28)::int) as h_cri,
    abs(('x' || substr(md5('cli' || i::text), 1, 7))::bit(28)::int) as h_cli,
    abs(('x' || substr(md5('fab' || i::text), 1, 7))::bit(28)::int) as h_fab,
    abs(('x' || substr(md5('ven' || i::text), 1, 7))::bit(28)::int) as h_ven,
    abs(('x' || substr(md5('obr' || i::text), 1, 7))::bit(28)::int) as h_obr,
    abs(('x' || substr(md5('dia' || i::text), 1, 7))::bit(28)::int) as h_dia,

    -- 🔴 A DATA DE FECHAMENTO É SORTEADA PRIMEIRO, E A DE CRIAÇÃO DERIVA DELA.
    --
    -- O caminho natural (sortear a criação e somar dias para fechar) parece certo e
    -- produz um gráfico de faturamento com BURACOS: quem nasce nos últimos 12 dias
    -- nunca fecha dentro da janela, e os meses das pontas ficam com poucos ganhos ou
    -- nenhum. O painel principal da demonstração é justamente esse gráfico.
    --
    -- Aqui o mês de fechamento sai de 12 baldes — um por mês do último ano —, então
    -- TODO mês tem ganho. A criação vem de 12 a 71 dias antes, o que garante de brinde
    -- que fechar nunca antecede criar (a distorção que existe hoje na base da MD).
    case when (case when i <= 24 then 'a' when i <= 44 then 'a' when i <= 73 then 'a'
                    when i <= 92 then 'a' else 'f' end) = 'f'
         then least(
                (date_trunc('month', current_date)
                  - (mod(abs(('x' || substr(md5('mes' || i::text), 1, 7))::bit(28)::int), 12) || ' months')::interval)::date
                + mod(abs(('x' || substr(md5('dfe' || i::text), 1, 7))::bit(28)::int), 27),
                current_date - 1)
         else null
    end as fechado,

    -- valor entre R$ 8.000 e R$ 380.000, em passos de R$ 100
    (8000 + mod(abs(('x' || substr(md5('val' || i::text), 1, 7))::bit(28)::int), 3720) * 100)::numeric as valor,
    case
      when i <= 24  then 'novo_lead'
      when i <= 44  then 'elaboracao'
      when i <= 73  then 'enviado'
      when i <= 92  then 'negociacao'
      when i <= 132 then 'fechamento'
      else               'perdido'
    end as status,
    (array['Porcelanato','Revestimento cerâmico','Metais sanitários','Tubos e conexões',
           'Tinta acrílica','Impermeabilizante','Chuveiro e aquecedor','Cimento e argamassa',
           'Louça sanitária','Rejunte e argamassa colante'])
      [1 + mod(abs(('x' || substr(md5('prd' || i::text), 1, 7))::bit(28)::int), 10)] as produto,
    (array['Torre A','Torre B','área comum','fachada','1º pavimento','cobertura',
           'garagem','área de lazer','banheiros sociais','reforma'])
      [1 + mod(abs(('x' || substr(md5('det' || i::text), 1, 7))::bit(28)::int), 10)] as detalhe,
    (array['Indicação','Visita a obra','WhatsApp','Telefone','Showroom','Prospecção','Site'])
      [1 + mod(abs(('x' || substr(md5('org' || i::text), 1, 7))::bit(28)::int), 7)] as origem,
    (array['Aguardando aprovação do cliente.',
           'Cliente pediu revisão de prazo.',
           'Orçamento enviado por e-mail e WhatsApp.',
           'Obra em fase inicial, previsão de compra para o próximo mês.',
           'Negociação de desconto em andamento com a fábrica.',
           'Cliente comparando com concorrente.',
           'Pedido lançado na fábrica.',
           'Perdido por preço.',
           'Follow-up agendado.',
           'Aguardando liberação de crédito na fábrica.'])
      [1 + mod(abs(('x' || substr(md5('obs' || i::text), 1, 7))::bit(28)::int), 10)] as observacao
  from generate_series(1, 147) as g(i)
  ) x
) r
-- a obra sai do cliente já sorteado; cliente sem obra devolve nada e o negócio fica sem obra
left join lateral (
  select ob.id
  from obras ob
  where ob.cliente_id = ('33333333-0000-4000-8000-' || lpad((1 + mod(r.h_cli, 35))::text, 12, '0'))::uuid
  order by ob.id
  limit 1
) o on true;

-- ---------------------------------------------------------------------------
-- 5.1 Histórico de movimentação entre etapas
-- ---------------------------------------------------------------------------
-- SEM ISTO, DUAS TELAS DA DEMONSTRAÇÃO NASCEM VAZIAS: o Radar de Risco e o
-- "parado há X dias" da pauta do dia leem `pedidos_historico_status`, não a data
-- do negócio. Um negócio sem histórico parece nunca ter se movido.
--
-- Cada negócio ganha a trilha das etapas por onde passou até a atual.

insert into pedidos_historico_status (id, pedido_id, usuario_id, tipo, campo,
                                      status_anterior, status_novo, created_at)
select
  gen_random_uuid(), p.id, p.usuario_id, 'status', 'status',
  t.anterior, t.novo,
  -- Espalha os passos entre a criação e o FECHAMENTO, não entre a criação e hoje: um
  -- negócio fechado em outubro não pode ter "passou para Negociação" carimbado em agosto.
  -- Para negócio aberto o coalesce devolve hoje, que é o comportamento desejado ali.
  -- meio-dia, nao meia-noite: o banco roda em UTC e a tela do vendedor esta em Brasilia,
  -- entao 00:00 UTC aparece como 21h do DIA ANTERIOR (mesmo cuidado do app, 'T12:00:00')
  (p.data_pedido + (t.ordem * greatest(1, (coalesce(p.prazo_resposta, current_date) - p.data_pedido) / 5)))::timestamptz + interval '12 hours'
from pedidos p
join lateral (
  select * from (values
    ('novo_lead',  'elaboracao', 1),
    ('elaboracao', 'enviado',    2),
    ('enviado',    'negociacao', 3),
    ('negociacao', 'fechamento', 4)
  ) as v(anterior, novo, ordem)
  -- até que etapa este negócio chegou. 'perdido' passou por 3 antes de se perder,
  -- e o passo final dele é inserido logo abaixo, com a data da perda.
  where v.ordem <= case p.status
                     when 'elaboracao' then 1
                     when 'enviado'    then 2
                     when 'negociacao' then 3
                     when 'fechamento' then 4
                     when 'perdido'    then 3
                     else 0                        -- 'novo_lead' não moveu
                   end
) t on true
where p.usuario_id::text like '11111111-0000-4000-8000-%'   -- ancora de identificador, nao so o carimbo
  and p.campos_extras->>'_demo' = 'true';

-- O negócio perdido sai da etapa em que estava direto para 'perdido'.
insert into pedidos_historico_status (id, pedido_id, usuario_id, tipo, campo,
                                      status_anterior, status_novo, created_at)
select gen_random_uuid(), p.id, p.usuario_id, 'status', 'status',
       'negociacao', 'perdido', (coalesce(p.prazo_resposta, current_date))::timestamptz + interval '12 hours'
from pedidos p
where p.usuario_id::text like '11111111-0000-4000-8000-%'   -- ancora de identificador, nao so o carimbo
  and p.campos_extras->>'_demo' = 'true' and p.status = 'perdido';

-- ---------------------------------------------------------------------------
-- 5.1.1 🔴 RECUAR A LINHA QUE O GATILHO DO BANCO CARIMBOU COM A DATA DE HOJE
-- ---------------------------------------------------------------------------
-- O gatilho `trg_pedidos_historico_status` (migration 20260730180000, função vigente
-- em 20260731160000:66-70) grava UMA linha por negócio no próprio INSERT, com
-- `created_at = now()` e `status_novo` = a etapa em que o negócio nasceu.
--
-- CONSEQUÊNCIA SE FICAR ASSIM: como todas as linhas do 5.1 têm data no passado, a
-- linha do gatilho é sempre a MAIS RECENTE — e o Radar de Risco lê exatamente a mais
-- recente (20260824220000_dashboard_negocios_risco.sql:73-79). Resultado: os 150
-- negócios nascem "movidos hoje", o Radar aparece VAZIO na demonstração, e o painel de
-- cada negócio abre com "criado na etapa atual — hoje".
--
-- Este UPDATE recua essa linha para a data de criação do negócio. Ele age SÓ sobre
-- linhas que o próprio script acabou de causar, então não fere a trava 1.
-- O filtro identifica a linha pela FORMA, não pelo calendário. Filtrar por
-- `created_at::date = current_date` amarraria este bloco a rodar no mesmo dia do
-- INSERT — e este arquivo manda rodar um lote por vez, conferindo entre eles. Rodar
-- o LOTE 4 numa noite e o 5 na manhã seguinte deixaria as linhas de ontem intactas,
-- sem erro nenhum: o UPDATE afetaria zero linhas e reportaria sucesso.
--
-- `tipo='status' AND status_anterior IS NULL` acerta exatamente uma linha por negócio:
-- o ramo de UPDATE do gatilho nunca grava status_anterior nulo (a coluna de origem é
-- NOT NULL), e `tipo='status'` exclui as linhas de mudança de campo, que também têm
-- status_anterior nulo.
--
-- O meio-dia não é enfeite: o banco roda em UTC e o navegador do vendedor está em
-- Brasília, então meia-noite UTC aparece na tela como 21h do DIA ANTERIOR. É o mesmo
-- cuidado que o app já toma ao ler data do banco (`+ 'T12:00:00'`).
update pedidos_historico_status h
set created_at = p.data_pedido::timestamptz + interval '12 hours'
from pedidos p
where h.pedido_id = p.id
  and p.usuario_id::text like '11111111-0000-4000-8000-%'   -- âncora de identificador
  and h.tipo = 'status'
  and h.status_anterior is null;

-- ---------------------------------------------------------------------------
-- 5.2 Comentários nos negócios
-- ---------------------------------------------------------------------------

insert into pedidos_comentarios (id, pedido_id, usuario_id, texto, created_at)
select
  gen_random_uuid(), p.id, p.usuario_id,
  (array[
    'Cliente confirmou recebimento do orçamento.',
    'Liguei hoje, pediu para retornar na semana que vem.',
    'Fábrica confirmou disponibilidade de estoque.',
    'Enviei a tabela atualizada por WhatsApp.',
    'Visitei a obra, medição confirmada.',
    'Aguardando aprovação do engenheiro responsável.',
    'Cliente sinalizou que vai fechar até o fim do mês.',
    'Prazo de entrega negociado para 15 dias.'
  ])[1 + mod(abs(('x' || substr(md5('cm' || p.id::text), 1, 7))::bit(28)::int), 8)],
  (p.data_pedido + 3)::timestamptz
from pedidos p
where p.usuario_id::text like '11111111-0000-4000-8000-%'   -- ancora de identificador, nao so o carimbo
  and p.campos_extras->>'_demo' = 'true'
  and mod(abs(('x' || substr(md5('tem' || p.id::text), 1, 7))::bit(28)::int), 10) < 3;

-- ---------------------------------------------------------------------------
-- 5.3 Histórico de interações
-- ---------------------------------------------------------------------------
-- Módulo que tem ZERO linhas até na base real da MD. Aqui ele ganha conteúdo
-- porque a demonstração precisa mostrar que ele existe.
--
-- ⚠️ A coluna se chama `usuario_id` desde a migration 20260416174744, que
-- renomeou `vendedor_id`. O CLAUDE.md §4.2 ainda lista essa coluna como um
-- resquício de "vendedor" — está desatualizado.

insert into historico_contatos (id, pedido_id, usuario_id, tipo, descricao,
                                data_contato, proximo_contato_em)
select
  gen_random_uuid(), p.id, p.usuario_id,
  (array['ligacao','whatsapp','email','visita','automatico'])
    [1 + mod(abs(('x' || substr(md5('hc' || p.id::text), 1, 7))::bit(28)::int), 5)],
  (array[
    'Contato inicial para levantamento da necessidade.',
    'Orçamento enviado e confirmado pelo cliente.',
    'Follow-up: cliente ainda avaliando.',
    'Visita técnica realizada na obra.',
    'Alinhamento de prazo de entrega com a fábrica.'
  ])[1 + mod(abs(('x' || substr(md5('hd' || p.id::text), 1, 7))::bit(28)::int), 5)],
  (p.data_pedido + 2)::timestamptz,
  case when p.status in ('enviado','negociacao') then (current_date + 3)::timestamptz else null end
from pedidos p
where p.usuario_id::text like '11111111-0000-4000-8000-%'   -- ancora de identificador, nao so o carimbo
  and p.campos_extras->>'_demo' = 'true'
  and mod(abs(('x' || substr(md5('th' || p.id::text), 1, 7))::bit(28)::int), 10) < 4;

-- CONFERÊNCIA DO LOTE 5 — esperado: 150 negócios, e nenhum aberto com data de fechamento
select status, count(*) as quantos,
       count(prazo_resposta) as com_data_fechamento,
       to_char(sum(valor_total), 'FM999G999G999D00') as soma
from pedidos
where campos_extras->>'_demo' = 'true'
group by rollup(status)
order by status nulls last;

-- 🔴 TEM QUE SER ZERO: negócio aberto com data de fechamento é a distorção que
-- existe hoje na base da MD e que não pode ser reproduzida aqui.
select count(*) as aberto_com_data_TEM_QUE_SER_ZERO
from pedidos
where campos_extras->>'_demo' = 'true'
  and status not in ('fechamento','perdido')
  and prazo_resposta is not null;


-- ============================================================================
-- LOTE 6 — METAS, TAREFAS, COMPROMISSOS E ROTA DE VISITA
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 6.1 Metas do Plano de Vendas
-- ---------------------------------------------------------------------------
-- Duas camadas, como o produto prevê:
--   · meta de EQUIPE      → `usuario_id` NULO (é o que a coluna significa aqui)
--   · meta INDIVIDUAL     → um `usuario_id`
-- Cobrem os últimos 12 meses para o Plano de Vendas ter histórico.

-- Meta de equipe, por fábrica e por mês
insert into metas_vendas (id, empresa_id, fabricante_id, usuario_id, ano, mes, meta_valor)
select
  gen_random_uuid(), '9b17bfdf-f631-4af6-9471-a68411909a04',
  f.id, null,
  extract(year  from m.mes)::int,
  extract(month from m.mes)::int,
  (60000 + mod(abs(('x' || substr(md5('mt' || f.id::text || m.mes::text), 1, 7))::bit(28)::int), 90) * 1000)::numeric
from fabricantes f
cross join generate_series(
  date_trunc('month', current_date - interval '11 months'),
  date_trunc('month', current_date),
  interval '1 month'
) as m(mes)
where f.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';

-- Meta individual, só dos 3 últimos meses (é o recorte que o gestor costuma usar)
insert into metas_vendas (id, empresa_id, fabricante_id, usuario_id, ano, mes, meta_valor)
select
  gen_random_uuid(), '9b17bfdf-f631-4af6-9471-a68411909a04',
  f.id, u.id,
  extract(year  from m.mes)::int,
  extract(month from m.mes)::int,
  (12000 + mod(abs(('x' || substr(md5('mi' || f.id::text || u.id::text || m.mes::text), 1, 7))::bit(28)::int), 25) * 1000)::numeric
from fabricantes f
cross join usuarios u
cross join generate_series(
  date_trunc('month', current_date - interval '2 months'),
  date_trunc('month', current_date),
  interval '1 month'
) as m(mes)
where f.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
  and u.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
  and u.user_id is null;   -- só a equipe fictícia

-- ---------------------------------------------------------------------------
-- 6.2 Tarefas
-- ---------------------------------------------------------------------------
-- 🔴 TRAVA 5: `usuario_id` NUNCA nulo, pelo mesmo motivo dos contatos — tarefa
-- órfã aparece na tela de todas as empresas (`tarefas_select`).
--
-- Os slugs de `status` são os das colunas padrão criadas por gatilho
-- (migration 20260708194500): 'pendente', 'em andamento', 'concluida'.

insert into tarefas (id, usuario_id, criado_por, pedido_id, cliente_id,
                     titulo, descricao, status, prazo_final, responsavel, campos_extras)
select
  gen_random_uuid(),
  p.usuario_id,                      -- NUNCA nulo (trava 5)
  -- 🔴 `tarefas.criado_por` é TEXT e guarda o NOME de quem criou, não um identificador
  --    (20260326191643:9). Mandar uuid aqui grava um uuid cru na tela.
  u.nome,
  p.id,
  p.cliente_id,
  t.titulo,
  t.descricao,
  (array['pendente','em andamento','concluida'])
    [1 + mod(abs(('x' || substr(md5('ts' || p.id::text), 1, 7))::bit(28)::int), 3)],
  (current_date + (mod(abs(('x' || substr(md5('tp' || p.id::text), 1, 7))::bit(28)::int), 14) - 3))::timestamptz,
  u.nome,
  '{"_demo": true, "_lote": "2026-08-30"}'::jsonb
from pedidos p
join usuarios u on u.id = p.usuario_id
cross join lateral (
  select
    (array['Ligar para o cliente','Enviar orçamento revisado','Agendar visita à obra',
           'Confirmar prazo com a fábrica','Cobrar resposta do orçamento',
           'Levar amostra ao cliente','Conferir liberação de crédito'])
      [1 + mod(abs(('x' || substr(md5('tt' || p.id::text), 1, 7))::bit(28)::int), 7)] as titulo,
    (array['Retomar contato após o envio do orçamento.',
           'Cliente pediu revisão de valores.',
           'Medição precisa ser confirmada no local.',
           'Verificar disponibilidade de estoque.',
           'Follow-up combinado na última conversa.'])
      [1 + mod(abs(('x' || substr(md5('td' || p.id::text), 1, 7))::bit(28)::int), 5)] as descricao
) t
where p.usuario_id::text like '11111111-0000-4000-8000-%'   -- ancora de identificador, nao so o carimbo
  and p.campos_extras->>'_demo' = 'true'
  and p.status in ('enviado','negociacao')
  and mod(abs(('x' || substr(md5('tk' || p.id::text), 1, 7))::bit(28)::int), 10) < 6;

-- ---------------------------------------------------------------------------
-- 6.3 Compromissos do calendário
-- ---------------------------------------------------------------------------
-- 🔴 LIMITE CONHECIDO E ACEITO: `eventos.user_id` e `eventos.criado_por` apontam
-- para `auth.users`, e a equipe fictícia NÃO TEM LOGIN. Por isso todos os
-- compromissos pertencem ao "Repply Suporte", que é o único com login.
--
-- Isso é uma escolha, não um descuido: criar login para cinco pessoas fictícias
-- colocaria cinco senhas novas no mundo só para uma demonstração.
--
-- Note que aqui vai `usuarios.user_id` (o login), NÃO `usuarios.id` — são
-- identificadores diferentes da mesma pessoa (CLAUDE.md §4.5), e trocar um pelo
-- outro faz a gravação ser recusada em silêncio.

insert into eventos (id, user_id, criado_por, grupo_id, titulo, descricao,
                     inicio, fim, dia_inteiro, cor, tipo_calendario,
                     lembrete_minutos, lembrete_enviado, obra_id, visita_realizada)
select
  -- 🔴 identificador com padrão, como todo o resto do arquivo. Sem ele, desfazer a
  --    demonstração exigiria apagar por `user_id` — e isso levaria junto qualquer
  --    compromisso REAL que a conta Repply Suporte tenha.
  ('dddddddd-0000-4000-8000-' || lpad(e.i::text, 12, '0'))::uuid,
  '1fb1cf42-cd27-4146-91ad-4057f94d5473',   -- o LOGIN, não o usuarios.id
  '1fb1cf42-cd27-4146-91ad-4057f94d5473',
  gen_random_uuid(),
  e.titulo,
  e.descricao,
  e.inicio,
  e.inicio + interval '1 hour',
  false,
  e.cor,
  'empresa',
  30,
  false,
  e.obra_id,
  e.inicio < now()
from (
  select
    i,
    (array['Visita à obra','Reunião com o cliente','Apresentação de tabela',
           'Medição no local','Alinhamento com a fábrica','Entrega de amostras'])
      [1 + mod(abs(('x' || substr(md5('ev' || i::text), 1, 7))::bit(28)::int), 6)] as titulo,
    (array['Levar catálogo atualizado.','Confirmar quantidades.','Apresentar condição comercial.',
           'Conferir cronograma da obra.','Rever prazo de entrega.'])
      [1 + mod(abs(('x' || substr(md5('ed' || i::text), 1, 7))::bit(28)::int), 5)] as descricao,
    (array['#FF5A1F','#2F6B5B','#8C6D1F','#3B6EA5'])
      [1 + mod(abs(('x' || substr(md5('ec' || i::text), 1, 7))::bit(28)::int), 4)] as cor,
    -- espalhados de 20 dias atrás a 25 dias à frente, em horário comercial
    (date_trunc('day', now()) - interval '20 days'
      + (mod(abs(('x' || substr(md5('ei' || i::text), 1, 7))::bit(28)::int), 45) || ' days')::interval
      + ((8 + mod(abs(('x' || substr(md5('eh' || i::text), 1, 7))::bit(28)::int), 9)) || ' hours')::interval
    ) as inicio,
    case when mod(i, 3) = 0
         then ('44444444-0000-4000-8000-' || lpad((1 + mod(i, 18))::text, 12, '0'))::uuid
         else null end as obra_id
  from generate_series(1, 40) as g(i)
) e;

-- ---------------------------------------------------------------------------
-- 6.4 Uma rota de visita
-- ---------------------------------------------------------------------------
-- A rota é um GRUPO de compromissos que compartilham `rota_id`, na ordem em que
-- serão visitados. Quatro obras da zona sul de Natal, do mais ao norte para o
-- mais ao sul — a ordem importa: o card de visitas já mostrou a rota de trás
-- para a frente uma vez (commit 2dd82695).

insert into eventos (id, user_id, criado_por, grupo_id, rota_id, rota_titulo,
                     titulo, descricao, inicio, fim, dia_inteiro, cor,
                     tipo_calendario, lembrete_minutos, lembrete_enviado,
                     obra_id, visita_realizada)
select
  -- mesmo padrão dos demais compromissos, na faixa 900+ para separar a rota
  ('dddddddd-0000-4000-8000-' || lpad((900 + v.obra_n)::text, 12, '0'))::uuid,
  '1fb1cf42-cd27-4146-91ad-4057f94d5473',
  '1fb1cf42-cd27-4146-91ad-4057f94d5473',
  -- 🔴 `grupo_id` NÃO agrupa a rota: ele agrupa as CÓPIAS de uma mesma parada, uma por
  --    participante. As telas deduplicam por ele (`dedupPorGrupo`,
  --    use-obra-visitas.ts:39-48 e :159), então dar o mesmo grupo às quatro paradas faz
  --    a rota aparecer com UMA visita só — e marcar uma como realizada respinga nas outras.
  gen_random_uuid(),                        -- grupo_id: UM POR PARADA
  '88888888-0000-4000-8000-000000000001',   -- rota_id: o MESMO nas quatro. É ele que faz a rota
  'Rota zona sul',
  'Visita: ' || v.obra,
  v.observacao,
  (date_trunc('day', now()) + interval '2 days' + (v.hora || ' hours')::interval),
  (date_trunc('day', now()) + interval '2 days' + ((v.hora + 1) || ' hours')::interval),
  false, '#FF5A1F', 'empresa', 30, false,
  ('44444444-0000-4000-8000-' || lpad(v.obra_n::text, 12, '0'))::uuid,
  false
from (values
  ( 9, 'Edifício Amintas Barros',      'Conferir medição do hall.',            8),
  ( 3, 'Condomínio Solar da Lagoa',    'Apresentar linha de porcelanato.',    10),
  ( 5, 'Torre Capim Macio',            'Levar amostras de metais.',           14),
  ( 1, 'Residencial Mar Aberto',       'Fechar pedido da área comum.',        16)
) as v(obra_n, obra, observacao, hora);

-- CONFERÊNCIA DO LOTE 6
select
  (select count(*) from metas_vendas where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04' and usuario_id is null) as metas_equipe,
  (select count(*) from metas_vendas where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04' and usuario_id is not null) as metas_individuais,
  (select count(*) from tarefas where campos_extras->>'_demo' = 'true') as tarefas,
  (select count(*) from tarefas where campos_extras->>'_demo' = 'true' and usuario_id is null) as tarefas_sem_dono_TEM_QUE_SER_ZERO,
  (select count(*) from eventos where user_id = '1fb1cf42-cd27-4146-91ad-4057f94d5473') as compromissos,
  (select count(*) from eventos where rota_id = '88888888-0000-4000-8000-000000000001') as paradas_da_rota;


-- ============================================================================
-- LOTE 7 — COMUNICAÇÃO: CHAT, WHATSAPP E E-MAIL
-- ============================================================================
--
-- 🔴 NADA AQUI ENVIA MENSAGEM PARA NINGUÉM. São linhas de banco. Não há número
-- de WhatsApp conectado (`configuracoes_wapi` continua vazia) nem caixa de
-- e-mail ligada a provedor. A demonstração MOSTRA as telas; não opera.
--
-- Avise a equipe comercial: clicar em "enviar" na caixa de WhatsApp vai falhar,
-- porque não existe instância. Isso é esperado.

-- ---------------------------------------------------------------------------
-- 7.1 Chat interno
-- ---------------------------------------------------------------------------

insert into chat_grupos (id, empresa_id, nome, descricao, criado_por)
values
  ('99999999-0000-4000-8000-000000000001', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Equipe Comercial', 'Alinhamento diário do time', '11111111-0000-4000-8000-000000000001'),
  ('99999999-0000-4000-8000-000000000002', '9b17bfdf-f631-4af6-9471-a68411909a04',
   'Obras em andamento', 'Acompanhamento de canteiro', '11111111-0000-4000-8000-000000000001');

insert into chat_grupo_membros (id, grupo_id, usuario_id)
select gen_random_uuid(), g.id, u.id
from (values ('99999999-0000-4000-8000-000000000001'::uuid), ('99999999-0000-4000-8000-000000000002'::uuid)) as g(id)
cross join usuarios u
where u.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';

insert into chat_mensagens (id, empresa_id, grupo_id, usuario_id, conteudo, lida, created_at)
select
  gen_random_uuid(), '9b17bfdf-f631-4af6-9471-a68411909a04',
  m.grupo, m.autor, m.texto, true,
  now() - ((40 - m.ordem) || ' hours')::interval
from (values
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000001'::uuid,'Bom dia, time. Fechamento do mês na sexta — quem tiver orçamento parado, puxa hoje.', 1),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'Bom dia! Tenho três em negociação, dois devem fechar até quinta.', 2),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000003'::uuid,'A Portobello confirmou o prazo de 12 dias para a linha nova.', 3),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000001'::uuid,'Ótimo. Beatriz, consegue passar isso pra Construtora Ponta Negra?', 4),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000003'::uuid,'Já mandei por WhatsApp agora.', 5),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000004'::uuid,'Pessoal, a Docol subiu tabela em 3% a partir do dia 1º.', 6),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000001'::uuid,'Importante. Quem tiver orçamento aberto com metais, revisa antes de enviar.', 7),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000005'::uuid,'Fechei o Residencial Vista Nova. Argamassa e rejunte, R$ 68 mil.', 8),
  ('99999999-0000-4000-8000-000000000001'::uuid,'11111111-0000-4000-8000-000000000001'::uuid,'Boa, Larissa! 👏', 9),
  ('99999999-0000-4000-8000-000000000002'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'Passei na Torre Capim Macio, estrutura no 8º pavimento.', 10),
  ('99999999-0000-4000-8000-000000000002'::uuid,'11111111-0000-4000-8000-000000000004'::uuid,'Então vale já apresentar revestimento, eles compram cedo.', 11),
  ('99999999-0000-4000-8000-000000000002'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'Combinado, agendei visita pra quinta.', 12),
  ('99999999-0000-4000-8000-000000000002'::uuid,'11111111-0000-4000-8000-000000000003'::uuid,'O Solar da Lagoa entrou em acabamento, marquei na ficha da obra.', 13),
  ('99999999-0000-4000-8000-000000000002'::uuid,'11111111-0000-4000-8000-000000000005'::uuid,'A obra do hospital travou, aguardando liberação de verba.', 14)
) as m(grupo, autor, texto, ordem);

-- ---------------------------------------------------------------------------
-- 7.2 WhatsApp — 12 conversas
-- ---------------------------------------------------------------------------
-- `instancia_id` fica NULO: não há número conectado. A tela trata esse caso
-- (WhatsAppInbox.tsx:3812, `temInstanciaConhecida`).
--
-- ⚠️ `telefone` é o identificador literal da conversa. NUNCA aplicar
-- `replace(/\D/g,'')` nele: em grupo, o formato antigo tem hífen, e limpar o
-- hífen monta um destino inexistente — a operadora responde sucesso e não
-- entrega nada (CLAUDE.md §7.2). Aqui são todos números diretos, sem grupo.

insert into whatsapp_conversas (id, empresa_id, telefone, nome_contato, cliente_id, contato_id,
                                instancia_id, is_group, nao_lidas, precisa_atribuicao,
                                ultima_mensagem, ultima_mensagem_at, ultima_mensagem_direcao,
                                arquivada, participantes)
select
  ('aaaaaaaa-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '9b17bfdf-f631-4af6-9471-a68411909a04',
  v.telefone, v.nome,
  ('33333333-0000-4000-8000-' || lpad(v.cli::text, 12, '0'))::uuid,
  null, null, false,
  v.nao_lidas, false,
  v.ultima, now() - ((v.n * 3) || ' hours')::interval, v.direcao,
  false, '[]'::jsonb
from (values
  ( 1,'5584991000101','Ana Ferreira - Ponta Negra',      1, 2,'Perfeito, pode enviar a proposta.','entrada'),
  ( 2,'5584991000102','Carlos Tavares - Edificar',       2, 0,'Enviado! Qualquer dúvida me chama.','saida'),
  ( 3,'5584991000103','Débora Lins - Alecrim',           3, 1,'Vocês trabalham com porcelanato 90x90?','entrada'),
  ( 4,'5584991000104','Eduardo Pontes - Dunas',          4, 0,'Fechado, vou lançar o pedido.','entrada'),
  ( 5,'5584991000105','Flávia Maia - Tirol',             5, 3,'Bom dia! Consegue passar o prazo?','entrada'),
  ( 6,'5584991000106','Gustavo Bezerra - Rio Grande',    6, 0,'Amanhã às 9h está ótimo.','saida'),
  ( 7,'5584991000107','Isabela Rocha - Petrópolis',      7, 0,'Obrigada pelo atendimento!','entrada'),
  ( 8,'5584991000108','João Vitorino - Habitar',         9, 2,'Preciso de um orçamento urgente.','entrada'),
  ( 9,'5584991000109','Karina Melo - Casa Forte',       21, 0,'Vou conferir o estoque e retorno.','saida'),
  (10,'558430200110','Depósito Cidade Alta',            22, 0,'Recebemos, obrigado.','entrada'),
  (11,'5584991000111','Mariana Duarte - Hotel Costa',   31, 1,'A reforma começa mês que vem.','entrada'),
  (12,'5584991000112','Nelson Aguiar - Santa Luzia',    33, 0,'Segue a tabela atualizada.','saida')
) as v(n, telefone, nome, cli, nao_lidas, ultima, direcao);

-- Responsável por conversa — é o que faz o alarme "precisa atribuição" ficar quieto
insert into whatsapp_conversa_responsaveis (id, conversa_id, usuario_id)
select
  gen_random_uuid(), c.id,
  ('11111111-0000-4000-8000-' || lpad((1 + mod(abs(('x' || substr(md5('wr' || c.id::text), 1, 7))::bit(28)::int), 5))::text, 12, '0'))::uuid
from whatsapp_conversas c
where c.id::text like 'aaaaaaaa-0000-4000-8000-%';

-- As mensagens: 15 por conversa, alternando entrada e saída.
--
-- 🔴 A DE NÚMERO 15 É, LITERALMENTE, A `ultima_mensagem` DA CONVERSA — mesmo texto,
-- mesma direção, mesmo horário. E a trilha inteira termina no `ultima_mensagem_at`.
-- Sem isso a prévia da lista e a última bolha da conversa aberta ao lado dela se
-- contradizem: a lista diz "há 36 horas: 'Recebemos, obrigado.'" e a conversa mostra
-- outra frase, de duas horas atrás. É a primeira tela que o prospect olha.
insert into whatsapp_mensagens (id, empresa_id, conversa_id, direcao, tipo, status,
                                conteudo, remetente_nome, remetente_telefone,
                                lida, is_nota_interna, fixada, apagada_para_todos,
                                reacoes, wamid, created_at)
select
  gen_random_uuid(),
  '9b17bfdf-f631-4af6-9471-a68411909a04',
  c.id,
  case when g.k = 15 then c.ultima_mensagem_direcao
       when mod(g.k, 2) = 1 then 'entrada' else 'saida' end,
  'texto',
  case when g.k = 15 then (case when c.ultima_mensagem_direcao = 'entrada' then 'entregue' else 'enviado' end)
       when mod(g.k, 2) = 1 then 'entregue' else 'enviado' end,
  case when g.k = 15 then c.ultima_mensagem
       when mod(g.k, 2) = 1
       then (array[
              'Bom dia! Tudo bem?',
              'Consegue me passar um orçamento?',
              'Qual o prazo de entrega?',
              'Vocês têm esse material em estoque?',
              'Recebi, obrigado!',
              'Vou avaliar e te retorno.',
              'Pode fechar o pedido.',
              'Consegue melhorar a condição de pagamento?'
            ])[1 + mod(abs(('x' || substr(md5('we' || c.id::text || g.k::text), 1, 7))::bit(28)::int), 8)]
       else (array[
              'Bom dia! Tudo ótimo, e com você?',
              'Claro, me passa a metragem que eu monto.',
              'O prazo está em 12 dias úteis.',
              'Temos sim, acabou de chegar lote novo.',
              'Segue o orçamento em anexo.',
              'Fico no aguardo!',
              'Perfeito, vou lançar na fábrica.',
              'Consigo em 3x sem juros, fecha assim?'
            ])[1 + mod(abs(('x' || substr(md5('ws' || c.id::text || g.k::text), 1, 7))::bit(28)::int), 8)]
  end,
  case when g.k = 15 then (case when c.ultima_mensagem_direcao = 'entrada' then c.nome_contato else 'Repply' end)
       when mod(g.k, 2) = 1 then c.nome_contato else 'Repply' end,
  case when g.k = 15 then (case when c.ultima_mensagem_direcao = 'entrada' then c.telefone else null end)
       when mod(g.k, 2) = 1 then c.telefone else null end,
  true, false, false, false,
  '[]'::jsonb,
  'demo-' || c.id::text || '-' || g.k::text,
  -- a trilha termina exatamente no horário que a lista mostra para a conversa
  c.ultima_mensagem_at - (((15 - g.k) * 2) || ' hours')::interval
from whatsapp_conversas c
cross join generate_series(1, 15) as g(k)
where c.id::text like 'aaaaaaaa-0000-4000-8000-%';

-- ---------------------------------------------------------------------------
-- 7.3 E-mail
-- ---------------------------------------------------------------------------
-- ⚠️ `ultima_sync_em` recebe AGORA de propósito. A tela dispara uma sincronização
-- silenciosa ao abrir quando o espelho de pastas está vazio OU tem mais de 24h
-- (Emails.tsx:322-338). Como não há provedor conectado, essa tentativa falharia.
-- Criar as pastas e marcar a sincronização como recente evita a tentativa.
--
-- Se ainda assim a tela tentar sincronizar, o sintoma é um erro silencioso — não
-- quebra a demonstração, mas vale conferir na validação.

insert into email_contas (id, empresa_id, email, nome_exibicao, provedor, status,
                          conectado_em, conectado_por, ultima_sync_em)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '9b17bfdf-f631-4af6-9471-a68411909a04',
   -- 🔴 `provedor` é o PROVEDOR da caixa, não o integrador. A Nylas é o intermediário;
   --    o CHECK aceita só google/microsoft/imap/icloud/yahoo
   --    (20260804121322_email_nylas.sql:54-56). E `status` aceita só
   --    conectada/revogada/erro (:58-60) — 'ativa' não existe, e a tela acende a caixa
   --    comparando com 'conectada' (use-email-empresa.ts:336).
   'comercial@demo.repplyhub.com.br', 'Comercial', 'google', 'conectada',
   now() - interval '60 days', '37b5a8eb-09d8-4cd6-b823-8b19022edbac', now());

insert into email_pastas (id, conta_id, empresa_id, nome, pasta_id, atributos, nao_lidas, total_mensagens)
values
  ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','9b17bfdf-f631-4af6-9471-a68411909a04','Caixa de entrada','INBOX',  array['\Inbox'], 4, 18),
  ('cccccccc-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001','9b17bfdf-f631-4af6-9471-a68411909a04','Enviados',        'SENT',   array['\Sent'],  0, 12),
  ('cccccccc-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','9b17bfdf-f631-4af6-9471-a68411909a04','Portobello',      'LBL_001',array[]::text[],  1,  6),
  ('cccccccc-0000-4000-8000-000000000004','bbbbbbbb-0000-4000-8000-000000000001','9b17bfdf-f631-4af6-9471-a68411909a04','Docol',           'LBL_002',array[]::text[],  0,  4);

-- A caixa aponta suas pastas de entrada e enviados
update email_contas
set pasta_inbox_id = 'cccccccc-0000-4000-8000-000000000001',
    pasta_sent_id  = 'cccccccc-0000-4000-8000-000000000002'
where id = 'bbbbbbbb-0000-4000-8000-000000000001';
-- ↑ SEGUNDO E ÚLTIMO UPDATE do arquivo (o outro é o do 5.1.1), e ele age sobre uma linha que ESTE arquivo acabou de
--   criar (trava 1: nenhum UPDATE sobre linha preexistente). Está separado do
--   INSERT porque as pastas só existem depois dele.

-- Quem enxerga a caixa: a caixa inteira liberada para a gestora
insert into email_conta_usuarios (id, conta_id, usuario_id, pasta_id, criado_por)
values
  (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000001', null, '37b5a8eb-09d8-4cd6-b823-8b19022edbac');

insert into email_mensagens (id, empresa_id, conta_id, nylas_message_id, nylas_thread_id,
                             assunto, snippet, corpo_html, remetente_nome, remetente_email,
                             destinatarios, cc, bcc, reply_to, anexos, pastas,
                             direcao, data_mensagem, lido, favorito, excluido, tem_anexo)
select
  gen_random_uuid(), '9b17bfdf-f631-4af6-9471-a68411909a04',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'demo-msg-' || v.n::text, 'demo-thr-' || v.n::text,
  v.assunto, v.snippet,
  '<p>' || v.snippet || '</p><p>Atenciosamente,<br>' || v.de_nome || '</p>',
  v.de_nome, v.de_email,
  -- 🔴 A mensagem ENVIADA vai para o cliente, não para a própria caixa. Fixar o
  --    destinatário faria a aba Enviados mostrar "Para: comercial@..." nas três
  --    saídas — a empresa mandando e-mail para si mesma, na tela da demonstração.
  case when v.direcao = 'enviado'
       then jsonb_build_array(jsonb_build_object('name', v.para_nome, 'email', v.para_email))
       else '[{"name":"Comercial","email":"comercial@demo.repplyhub.com.br"}]'::jsonb
  end,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  array[v.pasta],
  v.direcao,
  now() - ((v.n * 7) || ' hours')::interval,
  v.lido, false, false, false
from (values
  ( 1,'Solicitação de orçamento - Residencial Mar Aberto','Bom dia, gostaria de um orçamento para porcelanato da área comum.','Ana Ferreira','ana.ferreira@demo.exemplo.com.br','INBOX','recebido',false,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 2,'Re: Orçamento porcelanato','Segue em anexo a proposta conforme conversamos.','Comercial','comercial@demo.repplyhub.com.br','SENT','enviado',true,'Ana Ferreira','ana.ferreira@demo.exemplo.com.br'),
  ( 3,'Tabela de preços atualizada - Portobello','A nova tabela entra em vigor no dia 1º.','Portobello Representantes','tabela@demo.exemplo.com.br','LBL_001','recebido',false,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 4,'Confirmação de pedido - Solar da Lagoa','Pedido confirmado, previsão de entrega em 12 dias úteis.','Central Docol','pedidos@demo.exemplo.com.br','LBL_002','recebido',true,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 5,'Dúvida sobre prazo de entrega','Conseguem entregar até o dia 20?','Carlos Tavares','carlos.tavares@demo.exemplo.com.br','INBOX','recebido',false,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 6,'Re: Dúvida sobre prazo de entrega','Conseguimos sim, vou reservar o material.','Comercial','comercial@demo.repplyhub.com.br','SENT','enviado',true,'Carlos Tavares','carlos.tavares@demo.exemplo.com.br'),
  ( 7,'Visita técnica - Torre Capim Macio','Podemos marcar para quinta-feira às 14h?','Eduardo Pontes','eduardo.pontes@demo.exemplo.com.br','INBOX','recebido',false,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 8,'Amostras solicitadas','As amostras foram despachadas hoje.','Central Portobello','amostras@demo.exemplo.com.br','LBL_001','recebido',true,'Comercial','comercial@demo.repplyhub.com.br'),
  ( 9,'Reajuste de tabela - metais','Aumento de 3% a partir do próximo mês.','Central Docol','comunicados@demo.exemplo.com.br','LBL_002','recebido',true,'Comercial','comercial@demo.repplyhub.com.br'),
  (10,'Proposta comercial - Hotel Costa Atlântica','Segue proposta para a reforma das suítes.','Comercial','comercial@demo.repplyhub.com.br','SENT','enviado',true,'Mariana Duarte','mariana.duarte@demo.exemplo.com.br'),
  (11,'Aprovação de crédito','O cadastro da construtora foi aprovado.','Financeiro Fábrica','credito@demo.exemplo.com.br','INBOX','recebido',true,'Comercial','comercial@demo.repplyhub.com.br'),
  (12,'Follow-up orçamento 0451','Ainda temos interesse, aguardando aprovação da diretoria.','Flávia Maia','flavia.maia@demo.exemplo.com.br','INBOX','recebido',false,'Comercial','comercial@demo.repplyhub.com.br')
) as v(n, assunto, snippet, de_nome, de_email, pasta, direcao, lido, para_nome, para_email);

-- CONFERÊNCIA DO LOTE 7
select
  (select count(*) from chat_grupos       where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as grupos_chat,
  (select count(*) from chat_mensagens    where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as msgs_chat,
  (select count(*) from whatsapp_conversas where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as conversas_wa,
  (select count(*) from whatsapp_mensagens where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as msgs_wa,
  (select count(*) from email_mensagens   where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04') as emails;


-- ============================================================================
-- LOTE 8 — CENSO FINAL E CONFERÊNCIA DAS TRAVAS
-- ============================================================================
--
-- 🔴 ESTE É O LOTE QUE PROVA QUE A TAREFA FOI CUMPRIDA SEM ENCOSTAR EM NINGUÉM.
-- Compare linha a linha com o resultado guardado do LOTE 0.

select
  e.nome as empresa,
  (select count(*) from usuarios  u where u.empresa_id = e.id)                             as usuarios,
  (select count(*) from clientes  c join usuarios u on u.id = c.usuario_id where u.empresa_id = e.id) as clientes,
  (select count(*) from contatos  k join usuarios u on u.id = k.usuario_id where u.empresa_id = e.id) as contatos,
  (select count(*) from pedidos   p join usuarios u on u.id = p.usuario_id where u.empresa_id = e.id) as negocios,
  (select count(*) from obras     o join clientes c on c.id = o.cliente_id
                                     join usuarios u on u.id = c.usuario_id where u.empresa_id = e.id) as obras,
  (select count(*) from fabricantes f where f.empresa_id = e.id)                           as fabricantes,
  (select count(*) from tarefas   t join usuarios u on u.id = t.usuario_id where u.empresa_id = e.id) as tarefas,
  (select count(*) from whatsapp_mensagens w where w.empresa_id = e.id)                    as wa_mensagens,
  (select count(*) from email_mensagens m where m.empresa_id = e.id)                       as emails
from empresas e
order by e.nome;

-- CRITÉRIO DE APROVAÇÃO:
--   · Toda linha que NÃO for "Repply" tem de estar IDÊNTICA ao LOTE 0.
--   · A linha "Repply" deve mostrar aproximadamente:
--       usuarios 6 · clientes 35 · contatos 60 · negocios 150 · obras 18
--       fabricantes 8 · tarefas ~29 · wa_mensagens 180 · emails 12

-- Trava 5 — tem de continuar igual ao LOTE 0
select
  (select count(*) from contatos where usuario_id is null) as contatos_orfaos,
  (select count(*) from tarefas  where usuario_id is null) as tarefas_orfas;

-- Nenhuma linha da demonstração pode ter vazado para outra empresa
select 'clientes da demo fora da Repply' as verificacao, count(*) as tem_que_ser_zero
from clientes c join usuarios u on u.id = c.usuario_id
where c.campos_extras->>'_demo' = 'true' and u.empresa_id <> '9b17bfdf-f631-4af6-9471-a68411909a04'
union all
select 'negócios da demo fora da Repply', count(*)
from pedidos p join usuarios u on u.id = p.usuario_id
where p.campos_extras->>'_demo' = 'true' and u.empresa_id <> '9b17bfdf-f631-4af6-9471-a68411909a04'
union all
select 'obras da demo fora da Repply', count(*)
from obras o join clientes c on c.id = o.cliente_id join usuarios u on u.id = c.usuario_id
where o.campos_extras->>'_demo' = 'true' and u.empresa_id <> '9b17bfdf-f631-4af6-9471-a68411909a04'
union all
select 'contatos da demo sem responsável', count(*)
from contatos where campos_extras->>'_demo' = 'true' and usuario_id is null
union all
select 'tarefas da demo sem responsável', count(*)
from tarefas where campos_extras->>'_demo' = 'true' and usuario_id is null;

-- O gráfico de faturamento tem 12 meses com valor?
select to_char(prazo_resposta, 'YYYY-MM') as mes,
       count(*) as ganhos,
       to_char(sum(valor_total), 'FM999G999G999D00') as faturamento
from pedidos
where campos_extras->>'_demo' = 'true' and status = 'fechamento'
group by 1 order by 1;


-- ============================================================================
-- COMO DESFAZER  —  🔴 NÃO EXECUTAR SEM AUTORIZAÇÃO
-- ============================================================================
-- Fica escrito para existir, não para ser rodado. Exclusão é irreversível e
-- exige conversa antes.
--
-- A ordem é de baixo para cima; ao contrário, as chaves estrangeiras recusam.
--
--   delete from whatsapp_mensagens where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';
--   delete from whatsapp_conversa_responsaveis where conversa_id in (select id from whatsapp_conversas where id::text like 'aaaaaaaa-0000-4000-8000-%');
--   delete from whatsapp_conversas  where id::text like 'aaaaaaaa-0000-4000-8000-%';
--   delete from email_mensagens     where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';
--   delete from email_conta_usuarios where conta_id = 'bbbbbbbb-0000-4000-8000-000000000001';
--   delete from email_pastas        where conta_id = 'bbbbbbbb-0000-4000-8000-000000000001';
--   delete from email_contas        where id = 'bbbbbbbb-0000-4000-8000-000000000001';
--   delete from chat_mensagens      where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';
--   delete from chat_grupo_membros  where grupo_id::text like '99999999-0000-4000-8000-%';
--   delete from chat_grupos         where id::text like '99999999-0000-4000-8000-%';
--   delete from eventos             where id::text like 'dddddddd-0000-4000-8000-%';
--   ↑ pelo IDENTIFICADOR, nunca por `user_id`: a conta Repply Suporte é de uma pessoa
--     real, e apagar por ela levaria junto os compromissos de verdade dela.
--   delete from tarefas             where campos_extras->>'_demo' = 'true';
--   delete from metas_vendas        where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';
--   delete from historico_contatos  where pedido_id in (select id from pedidos where campos_extras->>'_demo' = 'true');
--   delete from pedidos_comentarios where pedido_id in (select id from pedidos where campos_extras->>'_demo' = 'true');
--   delete from pedidos_historico_status where pedido_id in (select id from pedidos where campos_extras->>'_demo' = 'true');
--   delete from pedidos             where campos_extras->>'_demo' = 'true';
--   delete from obra_contatos       where obra_id::text like '44444444-0000-4000-8000-%';
--   delete from obras               where id::text like '44444444-0000-4000-8000-%';
--   delete from contatos            where id::text like '55555555-0000-4000-8000-%';
--   delete from clientes            where id::text like '33333333-0000-4000-8000-%';
--   delete from marcadores_obras    where id::text like '77777777-0000-4000-8000-%';
--   delete from plano_vendas_fabricante_ordem where fabricante_id::text like '22222222-0000-4000-8000-%';
--   delete from fabricantes         where id::text like '22222222-0000-4000-8000-%';
--   delete from usuarios            where id::text like '11111111-0000-4000-8000-%';
-- ============================================================================

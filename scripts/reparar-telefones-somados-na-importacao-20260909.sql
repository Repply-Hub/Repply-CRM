-- =============================================================================================
-- REPARAR OS TELEFONES QUE A IMPORTAÇÃO DO BITRIX SOMOU
-- 09/09/2026 — lista conferida linha a linha contra a planilha original, com aval do Lucas.
--
-- =============================================================================================
-- A CAUSA (descoberta pelo Lucas em 09/09/2026)
-- =============================================================================================
--
-- O Bitrix exporta o telefone no formato internacional, começando com "+". O Excel converte uma
-- célula que começa com "+" em FÓRMULA (compatibilidade antiga com o Lotus 1-2-3) e SOMOU os
-- números que estavam ali:
--
--     =558487841135 +5584987841135     ->  6143474303926
--
-- Quando a célula começava com dígito, ela ficou texto e sobreviveu inteira
-- ('5584988462000, +558488462000') — são os 79 contatos com dois números no campo.
--
-- 🔴 AS FÓRMULAS CONTINUAM NA PLANILHA. Por isso este reparo NÃO deduz nada: cada número aqui
--    foi LIDO da fórmula original, em
--    D:\lucas\Documents\2-MD REPRESENTAÇÕES\Dados Bitrix24\Importação Repply\
--
-- =============================================================================================
-- O QUE VAI SER ALTERADO
-- =============================================================================================
--
--   linhas ....................... 427   (422 contatos + 5 empresas)
--   colunas ...................... só `telefone`, em `contatos` e `clientes`
--   empresa ...................... só MD Representações
--
--      416  A. Mesmo celular em dois formatos - confirmado
--        3  B. FIXO com nono digito forcado - vale o mais curto
--        7  C. 2 TELEFONES DIFERENTES - gravar todos, separados por virgula
--        1  C. 3 TELEFONES DIFERENTES - gravar todos, separados por virgula
--
--   confirmados por conversa de WhatsApp no número ......... 155
--   sem conversa, mas a pessoa fala por OUTRO número ....... 34
--
-- 🔴 TRÊS ARMADILHAS QUE A PLANILHA REVELOU, e que a dedução sozinha erraria:
--
--   1. FIXO COM NONO DÍGITO FORÇADO (3 casos). Os operandos eram (84) 2030-0387 e o mesmo com um
--      9 na frente. O certo é o CURTO — (84) 92030-0387 não existe (CLAUDE.md §7.1).
--   2. TELEFONES DIFERENTES SOMADOS (8 casos). Fixo + celular de verdade. Aqui gravamos os DOIS,
--      separados por vírgula, por decisão do Lucas — o campo já aceita, e o reconhecimento do
--      WhatsApp lê os dois desde 07/09/2026.
--   3. NÃO É SÓ O DDD 84. O prefixo 6143 é consequência de somar dois números de Natal; contato
--      de Recife, João Pessoa ou Curitiba soma para outro prefixo. Filtrar por 6143 perdia 42.
--
-- =============================================================================================
-- COMO DESFAZER
-- =============================================================================================
--
--   update public.contatos c set telefone = b.telefone_antes
--     from public.backup_telefones_bitrix_20260909 b
--    where b.tabela = 'contato' and b.registro_id = c.id;
--
--   update public.clientes cl set telefone = b.telefone_antes
--     from public.backup_telefones_bitrix_20260909 b
--    where b.tabela = 'empresa' and b.registro_id = cl.id;
--
-- A tabela `backup_telefones_bitrix_20260909` guarda, para cada linha, o valor de ANTES lido do
-- próprio banco no momento da execução — não o que eu supus. Ela pode ser removida quando você
-- tiver certeza:  drop table public.backup_telefones_bitrix_20260909;
--
-- Os gatilhos de auditoria de `contatos` e `clientes` também gravam cópia antes/depois em
-- `historico_alteracoes`, então existe um segundo rastro independente deste.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- PASSO 0 — TRAVA: confirma que estamos na MD Representações.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.empresas
                  where id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128' and nome = 'MD Representações') then
    raise exception 'PAREI: o id não é o da MD Representações. Nada foi alterado.';
  end if;
end $$;


-- ---------------------------------------------------------------------------------------------
-- PASSO 1 — a tabela que é ao mesmo tempo PLANO, CÓPIA DE SEGURANÇA e DESFAZER.
-- ---------------------------------------------------------------------------------------------
create table public.backup_telefones_bitrix_20260909 (
  tabela            text  not null check (tabela in ('contato','empresa')),
  registro_id       uuid  not null,
  nome              text,
  telefone_esperado text,          -- o que eu vi no CRM ao montar a lista
  telefone_antes    text,          -- o que estava LÁ na hora de rodar (preenchido no passo 2)
  telefone_novo     text  not null,
  primary key (tabela, registro_id)
);

alter table public.backup_telefones_bitrix_20260909 enable row level security;
-- Sem política de propósito: tabela de trabalho não é para o aplicativo ler.

comment on table public.backup_telefones_bitrix_20260909 is
  'Reparo de 09/09/2026 dos telefones que a importação do Bitrix somou (o Excel converteu em '
  'fórmula a célula que começava com +). Guarda o valor anterior de cada linha. Para desfazer, '
  'ver o cabeçalho de scripts/reparar-telefones-somados-na-importacao-20260909.sql';

insert into public.backup_telefones_bitrix_20260909
  (tabela, registro_id, nome, telefone_esperado, telefone_novo)
values
  ('contato', '8cd2d0d6-16c5-442d-9d26-8fbd1e9c2f95'::uuid, '- J A Chapeus Ltda', '6143498379748', '(84) 99918-9874'),
  ('contato', '6e79f6b0-3e1b-4813-8245-042d9b040cf0'::uuid, '- Miki - Arsemik Ltda', '6143483167326', '(84) 99158-3663'),
  ('contato', '45cf099f-76a1-4bc1-b0b2-5b0ddb767971'::uuid, 'Abdon Gosson - R A Empreendimentos', '6143492340016', '(84) 99617-0008'),
  ('contato', '2d34f2c6-3ed2-49f2-b6ff-25550ce5a6cc'::uuid, 'Adilson', '6143498349300', '(84) 99917-4650'),
  ('contato', '3364aa4c-0eca-487f-b127-b9e409ba970b'::uuid, 'Admilson', '6140192364862', '(81) 99618-2431'),
  ('contato', '663dceba-7022-4fde-9133-f61b80912ef3'::uuid, 'Adriano Brito - J Brito & Cia Ltda', '6143475728804', '(84) 98786-4402'),
  ('contato', '3aadd46d-338d-448b-b303-bade96ef019e'::uuid, 'Adriano Marques - Serpos Serviços Postumos', '6140173810184', '(81) 98690-5092'),
  ('contato', '209641b6-b1e4-4474-aede-355d49fa953f'::uuid, 'Ailton - Jax', '6143483402452', '(84) 99170-1226'),
  ('contato', '23655640-1c19-4569-ad45-8678549ea7b4'::uuid, 'Airon Kardec - Pirangi Participações', '6143463009670', '(84) 98150-4835'),
  ('contato', '3651a692-abd4-4729-9cfe-2e9cd7ae0bb2'::uuid, 'Alan - MCMV Pernambuco', '6129167061996', '(71) 98353-0998'),
  ('contato', 'bf776c3a-609a-4203-ad06-27561a322c91'::uuid, 'Alan - Nunes Enterprises', '6143496761042', '(84) 99838-0521'),
  ('contato', '0d2dae3b-2b14-40ee-b7b0-52f7109e8d3c'::uuid, 'Alberto - Aldann Construções', '6143499646466', '(84) 99982-3233'),
  ('contato', 'dbe31d0b-5376-4424-b67a-7d7a99b85821'::uuid, 'Alberto Menezes - JL Central De Distribuição', '6143488634178', '(84) 99431-7089'),
  ('contato', '1afdc253-3286-47f2-afb0-cdce96de8e56'::uuid, 'Alcivan Wagner - Interproj', '6143499388342', '(84) 99969-4171'),
  ('contato', '46d4e942-db1a-4959-b43a-129ce8de6455'::uuid, 'Alex - Condominio Edgardo Benavides', '6143499856500', '(84) 99992-8250'),
  ('contato', '06ffecb1-30a3-4af6-ab16-50b4cc767023'::uuid, 'Alex - Sofimo Imoveis', '6143497979848', '(84) 99898-9924'),
  ('contato', '74de8ebc-79ff-4712-91b3-0f0299c32cac'::uuid, 'Alex Izidorio - Comprador Simm Soluções', '6143463633590', '(84) 98181-6795'),
  ('contato', '3dbc4292-e8d9-44fc-8e6f-51d97d15db34'::uuid, 'Alexandre - G2 Construtora', '6143493232990', '(84) 99661-6495'),
  ('contato', '0cedd8ac-ed0a-422d-927f-a0ca67af6130'::uuid, 'Alexandre - Petroimoveis', '6143499702418', '(84) 99985-1209'),
  ('contato', '6267d1ac-295a-4fe7-915c-5f3597566e2b'::uuid, 'Alexandre - S. F. I. Serviço Funerário', '6143492142818', '(84) 99607-1409'),
  ('contato', '6826c564-17dd-4fa9-bfdf-69e08dbf970f'::uuid, 'Alexia Lemos - Reale Empreendimentos Imobiliários', '6143463823320', '(84) 98191-1660'),
  ('contato', 'ccd64aa4-b549-4ba8-80cb-69319a399153'::uuid, 'Alexia Maria Pereira - Águia Construcoes', '6143463823320', '(84) 98191-1660'),
  ('contato', '9edeb085-5f08-40a0-ba49-92f27696fa77'::uuid, 'Almir Eng - Tral Empreendimentos', '6143499459424', '(84) 99972-9712'),
  ('contato', '940cb810-367f-4a66-9038-d69c28aa4bd7'::uuid, 'Aluizio Alves', '6143477123644', '(84) 98856-1822'),
  ('contato', '9b9300c3-efd3-4672-97b3-a0a545e05b7b'::uuid, 'Alvamar - BJR Incorporação', '6143482686592', '(84) 99134-3296'),
  ('contato', 'b7ec4ff9-0826-4c50-a7a9-9331a62ca367'::uuid, 'Alvaro - Silva Cruz Engenharia', '6143499930778', '(84) 99996-5389'),
  ('contato', '72f08dc9-68b5-4fc9-a45c-1d11f87978b1'::uuid, 'Alyson - Engpac', '6143476643060', '(84) 98832-1530'),
  ('contato', 'ef927dc7-b92e-4766-927f-43f1314ac3ef'::uuid, 'Alysson - Ecomax', '6143463188032', '(84) 98159-4016'),
  ('contato', 'e4cc969d-95ba-4b1a-81dd-cee14320e57c'::uuid, 'Amancio - Atlantis', '6143477384664', '(84) 98869-2332'),
  ('contato', 'b723fb32-ee3e-4d88-a325-7611a36446f3'::uuid, 'Ana Cecilia - Prisma Construção', '6143499062416', '(84) 99953-1208'),
  ('contato', 'beaa22e3-939b-47f2-a03f-489e84023a71'::uuid, 'Ana Hermes 880', '6143476923292', '(84) 98846-1646'),
  ('contato', '2d843139-eda0-4ed7-8aa0-9e32a3a7f53a'::uuid, 'Ana Karenina', '6143499829612', '(84) 99991-4806'),
  ('contato', '06d651a0-50fa-4bfa-b43a-ec0de67f1cf6'::uuid, 'Ana Paula Pinto', '6143492808486', '(84) 99640-4243'),
  ('contato', '020e624e-60b7-4606-9267-f36538afbe18'::uuid, 'Anae - Qualita Construcoes e Servicos', '6143493191880', '(84) 99659-5940'),
  ('contato', '4a2e0f26-d167-4bae-9c76-6f008c0d4789'::uuid, 'Andreia - Als Solucoes', '6143499500898', '(84) 99975-0449'),
  ('contato', '87a1aa99-86f4-4eba-829e-bd8cdd6f3c5e'::uuid, 'Andreia Construtora - L S Engenharia', '6143499500898', '(84) 99975-0449'),
  ('contato', '1f97bcca-d638-456a-b048-2104f4b6e0f4'::uuid, 'André Gustavo - Pessoa física', '6143499741166', '(84) 99987-0583'),
  ('contato', '6e508d01-bd08-42cb-a28d-a862137712c7'::uuid, 'André Oliveira - Construtora LCL', '6143488305982', '(84) 99415-2991'),
  ('contato', '90b3460a-142a-4926-9b1c-c4c31bd98d7c'::uuid, 'Angelina - Abart', '6143493259866', '(84) 99662-9933'),
  ('contato', '3bbb6f81-fcf9-40a8-a4bf-3a14b0eccfc9'::uuid, 'Antonio André - J P Neto Natal Mares Turismo e Locações', '6143493776240', '(84) 99688-8120'),
  ('contato', 'd3ff5e3f-f1a5-49ea-a881-08baabb56fe1'::uuid, 'Ari Campos - Cond Água Marinha', '6143463215718', '(84) 98160-7859'),
  ('contato', 'ca4fc8f3-cc8f-4a50-8a17-c74a45a8ca92'::uuid, 'Aron - Azzi Empreendimentos', '6143492914504', '(84) 99645-7252'),
  ('contato', '6f8faa28-e85e-491e-b769-ec5378ee213d'::uuid, 'Arthur - Exata Engenharia', '6143475020390', '(84) 98751-0195'),
  ('contato', '0ca6e6c1-1440-4c11-96e8-beea38fd5219'::uuid, 'Arthur - ML Tavares', '6143499003958', '(84) 99950-1979'),
  ('contato', '6154c551-c1d6-4fdc-8e7b-d10f536faea8'::uuid, 'Arthur Azevedo', '6143493357970', '(84) 99667-8985'),
  ('contato', '91b4c8ec-35fd-4509-831c-88857fe82ddf'::uuid, 'Arthur Silva - Wanderley Construções', '6140171965936', '(81) 98598-2968'),
  ('contato', 'c6984523-9d15-4591-acea-7347147a0df6'::uuid, 'Ayrton Senna - Artecasa Investimentos', '6143492260690', '(84) 99613-0345'),
  ('contato', 'c1a19feb-f26d-426d-ba58-cf4f3cda7629'::uuid, 'Beatriz - Contrel', '6143498758980', '(84) 99937-9490'),
  ('contato', 'a975e932-2370-420f-8248-50d1fc1c99c8'::uuid, 'Benivaldo Alves', '6143488146514', '(84) 99407-3257'),
  ('contato', '856e4af3-ef1d-4f72-b984-fa90748ce40c'::uuid, 'Breno - Daylight Participações', '6143476084182', '(84) 98804-2091'),
  ('contato', '475cdb12-ac49-4d87-80fc-b1d2e274abdd'::uuid, 'Breno - Mood Candelária (Moura Dubeux)', '6143474303926', '(84) 98715-1963'),
  ('contato', '73f0fedb-bfbc-4528-8a39-7ac43a4fd319'::uuid, 'Bruna Gosson - M C Silva Junior', '6143488632626', '(84) 99431-6313'),
  ('contato', 'bd096e7d-e7b7-4ebb-81e1-a9e07de65256'::uuid, 'Brunno Farias - E2', '6142392392724', '(83) 99619-6362'),
  ('contato', '133000b7-4094-4894-b87a-d5e12e5df7df'::uuid, 'Bruno - Horizonte Urbanismo', '6143499755400', '(84) 99987-7700'),
  ('contato', '96f7e780-2671-4797-8890-4f1734490192'::uuid, 'Bruno - W3 Empreendimentos', '6143492620032', '(84) 99631-0016'),
  ('contato', '77fc6b22-3c8e-4c93-ac7a-f5788b023f89'::uuid, 'Bruno Allan - Licenge', '6143492914124', '(84) 99645-7062'),
  ('contato', '58be8125-b572-4fa5-9dbd-b1891884abdd'::uuid, 'Caio França', '6140178614692', '(81) 98930-7346'),
  ('contato', 'a275f431-72b7-4266-9fb1-358d3a2e6230'::uuid, 'Caio Rebouças - C R Engenharia', '6143483421478', '(84) 99171-0739'),
  ('contato', '7954c2cc-778b-4c1b-bcb7-a6a26564377a'::uuid, 'Camila - Ecomax Empreendimentos', '6143488079898', '(84) 99403-9949'),
  ('contato', '315b6f7a-57e5-4c9e-9eea-b61608cf48b6'::uuid, 'Camila Viana - Cabral & Viana', '6143482660244', '(84) 99133-0122'),
  ('contato', '14ab96f9-8ac7-483b-9c08-c4fe478b2336'::uuid, 'Carlo Miali - Genia Empreendimentos', '6143498789860', '(84) 99939-4930'),
  ('contato', '2fb2bbd5-d36c-48c5-bdc4-8bfe27a97af2'::uuid, 'Carlos - LMT Construções', '6143499303234', '(84) 99965-1617'),
  ('contato', '9e74823c-8d68-4618-860c-3e2876912918'::uuid, 'Carlos Aguiar', '6143482984420', '(84) 99149-2210'),
  ('contato', 'a5710dbf-9754-4701-96f9-397b81d007b9'::uuid, 'Carlos Henrique', '6143499201508', '(84) 99960-0754'),
  ('contato', '03f13365-c221-4e33-87ea-c9c1fd4a9e99'::uuid, 'Carlos Henrique - Condominio Costa Do Atlantico', '6143498701556', '(84) 99935-0778'),
  ('contato', '811fd28d-3f19-4f1d-b04a-0b291f0a0630'::uuid, 'Catarinne - Azevedo & Coelho', '6143493814484', '(84) 99690-7242'),
  ('contato', '23997133-d73f-4903-9945-94631f88cbcb'::uuid, 'Christiano Tito - GJB Housi', '6143476880000', '(84) 98844-0000'),
  ('contato', '22f83f6f-e85d-4c4b-a82f-ed8fe5103c8f'::uuid, 'Cinara Guerra - Infinit Empreendimentos', '6143462159012', '(84) 98107-9506'),
  ('contato', '81161d53-cd03-41b4-9f2d-68483a36cf2e'::uuid, 'Claudia - B E C Engenharia', '6143477089294', '(84) 98854-4647'),
  ('contato', '1c0e7914-7acf-4775-b618-6eee60dbca44'::uuid, 'Claudia - The View', '6140195334326', '(81) 99766-7163'),
  ('contato', 'e49f29a5-ff94-49eb-9f29-dddc44a53328'::uuid, 'Claudia Maia - Edificar Engenharia', '6143492431662', '(84) 99621-5831'),
  ('contato', '56c2a56c-76b0-453d-a5c5-1c93e489e879'::uuid, 'Comercial Imperio', '6143475731606', '(84) 98786-5803'),
  ('contato', 'cad372e8-6d3d-4a61-9701-ebeab85690c0'::uuid, 'Compras - Quatros Engenharia (Eduardo)', '6143497937728', '(84) 99896-8864'),
  ('contato', 'c9a4e804-32f2-457b-96ac-f3fdd17d084a'::uuid, 'Cristiano Zadrozny', '6143493095142', '(84) 99654-7571'),
  ('contato', '7fe4940f-73fa-4b20-94de-f977a78ce0ad'::uuid, 'Célia - Mallard Participações e Investimentos', '6143482637954', '(84) 99131-8977'),
  ('contato', '43380873-c1d0-4f6c-93e2-686cc2632aff'::uuid, 'Daniel - Eng Areia Tabatinga', '6143499459424', '(84) 99972-9712'),
  ('contato', '8a6d3b99-27c0-499c-874c-e022e48fbe08'::uuid, 'Daniel - Lopez Diniz Engenharia', '6143496836904', '(84) 99841-8452'),
  ('contato', '71fae50c-c2e4-4700-a2c7-3dee57ca217e'::uuid, 'Daniel Pereira - SDM Empreendimentos', '6143472424196', '(84) 98621-2098'),
  ('contato', 'fed9a178-a20c-45d5-b769-acb389f8e5a9'::uuid, 'Danilo Andreis - DR Empreendimentos', '6143472401138', '(84) 98620-0569'),
  ('contato', '5a2b74bb-0126-44b6-bcb7-202ddd635fa0'::uuid, 'Darlan - Brisa das Dunas', '6143488144100', '(84) 99407-2050'),
  ('contato', '0aa2a480-3f8e-4bec-931f-1e3d4958acc3'::uuid, 'Davi Ismael - Cemitérios Memorial Vila', '6143492142818', '(84) 99607-1409'),
  ('contato', '2a15824d-2248-4f91-9eb4-2a6106403808'::uuid, 'Dayara - Massai', '6142382876368', '(83) 99143-8184'),
  ('contato', '2d8b61d8-1e5f-4c7d-839b-6dd1f857f111'::uuid, 'Deny - Salustio', '6143493183592', '(84) 99659-1796'),
  ('contato', '2252f7df-7aa0-4905-a99f-63670a50014a'::uuid, 'Diassis - Construtora Proel', '6143492940222', '(84) 99647-0111'),
  ('contato', '60a81456-3926-4426-90df-b5fb0a142c35'::uuid, 'Dickson Canuto - Dois Tempos', '6143496672362', '(84) 99833-6181'),
  ('contato', '53bf694f-1d7e-4af2-a3c2-9b7d9d86218f'::uuid, 'Diego - Construfit Engenharia', '6143498512278', '(84) 99925-6139'),
  ('contato', 'bbd07c12-af32-4035-8cda-801fa2d9a23c'::uuid, 'Djair - Hospital do Rim', '6143498404030', '(84) 99920-2015'),
  ('contato', '8f8e899b-f474-4ef7-b294-fd47f405863b'::uuid, 'Djair - Instituto Do Rim', '6143498404030', '(84) 99920-2015'),
  ('contato', '65cd7235-f156-45b1-900b-e411d1e72aa5'::uuid, 'Domingos', '6143474299818', '(84) 98714-9909'),
  ('contato', '2a1f16bd-67fb-466d-86f8-2c5761ad9568'::uuid, 'Domingos - Dtito Construções', '6143477460334', '(84) 98873-0167'),
  ('contato', '31e06a6c-48e4-4438-9efb-a90d0822006f'::uuid, 'Ednaldo - Escol', '6143498220214', '(84) 99911-0107'),
  ('contato', '91a4ce09-fa7f-4f62-ad53-c1114ae84bf6'::uuid, 'Edson França - Construtora Alves', '6143498024064', '(84) 99901-2032'),
  ('contato', '2ebb0071-84cf-4b6d-a055-3348bcceba65'::uuid, 'Eduardo', '6143475682270', '(84) 98784-1135'),
  ('contato', 'f701ca97-b782-4725-ad6c-3e2f04c63b81'::uuid, 'Eduardo - Ramalho Moreira', '6143498356172', '(84) 99917-8086'),
  ('contato', 'bf8f2c6b-4eee-4464-8150-1a211f37203d'::uuid, 'Eduardo Aquiles - Pormade SIS CRM', '6097299501446', '(42) 99975-0723'),
  ('contato', '0b13ad6d-29e8-443e-b530-31f8437a5b0d'::uuid, 'Eduardo Saturno - A A de PAiva', '6143475682270', '(84) 98784-1135'),
  ('contato', 'b508a8b5-4f1b-4bcc-8538-089eea9196f4'::uuid, 'Eliane - IM Engenharia', '6143477028818', '(84) 98851-4409'),
  ('contato', '17d23322-1ffb-4eb6-9655-b3a594659a29'::uuid, 'Elizabeth - A 4 Empreendimentos', '6143498511780', '(84) 99925-5890'),
  ('contato', 'a50baccd-cef9-4f1e-bcde-e7f37f9efde9'::uuid, 'Elthon - Retangulo Construções', '6143483325910', '(84) 99166-2955'),
  ('contato', '5e713532-7048-4032-9a78-269e30090716'::uuid, 'Emanuelle DECOLED', '6143482193324', '(84) 99109-6662'),
  ('contato', 'd15e17ca-a74a-496c-bede-8be158e881a6'::uuid, 'Emerson - Incorporadora Eletrica Leal', '6143475526866', '(84) 98776-3433'),
  ('contato', '286a860c-255e-4b80-a661-128262c92de1'::uuid, 'Eng Praxedes - Construtora Monte Neto', '6143499057312', '(84) 99952-8656'),
  ('contato', '8351857c-66bd-40e3-9ec7-ee422c019ded'::uuid, 'Enrico - Marambaia Apart Hotel', '6143462142022', '(84) 98107-1011'),
  ('contato', '6bbc76ab-2abe-4996-a98e-1671b6801099'::uuid, 'Erick Petronio - Soma Engenharia', '6147892201740', '(88) 99610-0870'),
  ('contato', 'd71e896d-1d29-4bc1-bc81-bc64085b7a2e'::uuid, 'Evanuel - Dalil Holding', '6143476394638', '(84) 98819-7319'),
  ('contato', '4c9753f2-bc08-4732-9fad-198f52248aae'::uuid, 'Ewerton - V. Torres Soluções e Empreendimentos', '6143494074050', '(84) 99703-7025'),
  ('contato', 'daabac37-09a3-4c52-b84a-60bc72786497'::uuid, 'Fabricio Melo - G M A Construções', '6143489224030', '(84) 99461-2015'),
  ('contato', '6bc4cf44-7f06-43e2-91ab-b5892c8d9069'::uuid, 'Felipe', '6143474183844', '(84) 98709-1922'),
  ('contato', '8f562aed-5c4f-4869-823d-7dde5b76dd6f'::uuid, 'Felipe Canuto - Atta', '6143493527326', '(84) 99676-3663'),
  ('contato', '92de8404-b5d3-4dcf-bc75-f849c50e11f2'::uuid, 'Felipe Carvalho - LRC Construcoes', '6143499765198', '(84) 99988-2599'),
  ('contato', '97158ede-3c53-4f27-9612-14d4fdd72523'::uuid, 'Fernanda - Inova', '6143492227210', '(84) 99611-3605'),
  ('contato', '2df778ad-5737-4db5-9999-f6cda6d09eda'::uuid, 'Fernando - SDM Empreendimentos', '6143499629436', '(84) 99981-4718'),
  ('contato', '2a51a658-14e0-426d-ba6b-3b9326f1211e'::uuid, 'Fernando - Viva Construções', '6143499504160', '(84) 99975-2080'),
  ('contato', '562178da-f287-4671-9914-95bd81a593eb'::uuid, 'Filipe Fernandes - BFB', '6143482162776', '(84) 99108-1388'),
  ('contato', 'f995adda-3758-45a6-9a0e-3030e61eaf74'::uuid, 'Filipe Linhares', '6143477219620', '(84) 98860-9810'),
  ('contato', '614dfcf9-955b-44fc-a8e0-ac262b4f179b'::uuid, 'Financeiro MV Dunamis', '6143482236146', '(84) 99111-8073'),
  ('contato', 'bd5710dc-3ff9-464a-9912-f5e48ff6dbca'::uuid, 'Flavia - Interproj', '6143492023666', '(84) 99601-1833'),
  ('contato', 'fc6137f7-fb99-41a7-be8d-84d102ad7b43'::uuid, 'Flavio - V&D Construções', '6143474050110', '(84) 98702-5055'),
  ('contato', '6703e073-cf19-4f31-9730-b21672e77bf7'::uuid, 'Francinete - Espacial Desenvolvimento', '6143499689510', '(84) 99984-4755'),
  ('contato', 'c1f4a6e3-c096-4a20-b7cc-933e279498e2'::uuid, 'Francinildo - Vela Construtora', '6143463105422', '(84) 98155-2711'),
  ('contato', '4b358ff1-03b8-4a9a-ac1a-532723ff0325'::uuid, 'Francisco Wilton - Monte Neto', '6143482596640', '(84) 99129-8320'),
  ('contato', 'e2319dde-1e5a-4fad-8078-364ad770b2cd'::uuid, 'Francisco Wilton - Sudamérica Incorporação', '6143482596640', '(84) 99129-8320'),
  ('contato', '44e52867-636d-4840-8d8a-6263e8454eef'::uuid, 'Franklim - Predesign', '6143482653484', '(84) 99132-6742'),
  ('contato', 'a7945629-83d4-4067-8e79-492ed89a3c2b'::uuid, 'Franklin - Escol', '6141293987778', '(82) 99699-3889'),
  ('contato', '5ecda1b1-e013-404c-9da6-fae502ae538f'::uuid, 'Fred - Innove', '6143489034502', '(84) 99451-7251'),
  ('contato', 'b9073d1e-aa8c-4e6d-9eee-20d37f94e767'::uuid, 'Fred - Soma Engenharia', '6143476333656', '(84) 98816-6828'),
  ('contato', 'd942edff-9d5b-4eb2-9fe2-e9fc5fc29afa'::uuid, 'Fredy - Licenge', '6143483243428', '(84) 99162-1714'),
  ('contato', '2637c6c0-45ce-4747-bdb2-d5b5afc43683'::uuid, 'Fábio - Construtora Correia & Peixoto', '6140173359892', '(81) 98667-9946'),
  ('contato', '5192e836-c4b4-47ce-819e-9b121f8db389'::uuid, 'Gabriel Damasio', '6143483697148', '(84) 99184-8574'),
  ('contato', '3dd76601-6ceb-4fb4-aea8-ef6e3a67c246'::uuid, 'Gabriela - PRM Empreendimentos', '6143498338848', '(84) 99916-9424'),
  ('contato', '7bb5aa17-06f4-45c3-9c44-96a5d4f4dcd6'::uuid, 'George - Construtora A Gaspar', '6143498041528', '(84) 99902-0764'),
  ('contato', 'c126ba22-1b44-4b2e-8a5f-e3bed96ce01b'::uuid, 'George - Engecomp Soluções', '6143498041528', '(84) 99902-0764'),
  ('contato', 'ff077698-b0a1-414b-9b7a-a07f89aaeb6a'::uuid, 'George Dionizio - St Engenharia', '6143492066286', '(84) 99603-3143'),
  ('contato', '4989b77d-6149-4bf7-aadb-9912103a2261'::uuid, 'George Gosson - Morumbi Construtora', '6143499652012', '(84) 99982-6006'),
  ('contato', '897eff40-c2a9-4528-a6db-1b48b2bde98c'::uuid, 'George Gosson - Praiamar Empreendimentos', '6143499652012', '(84) 99982-6006'),
  ('contato', '7a0c18ef-1a14-4dda-9d64-d98e688efca7'::uuid, 'George Lyra - Paradise Investimento', '6143482629798', '(84) 99131-4899'),
  ('contato', '69f584d5-3681-4d9c-bda8-8195e110a41c'::uuid, 'Gerdson Meireles - SPE Empreendimentos', '6143462380700', '(84) 98119-0350'),
  ('contato', '64f90dfc-141d-4879-8577-c48eb2b3c9f7'::uuid, 'Gessione - GF Turismo', '6143492929082', '(84) 99646-4541'),
  ('contato', '0d52d97a-03eb-4db3-b957-bb37fafe0408'::uuid, 'Gil Ca', '6143472412128', '(84) 98620-6064'),
  ('contato', '8d5cf2dc-1039-4c44-9151-04d77320f9c1'::uuid, 'Gilberto - Estruture Engenharia', '6143499363674', '(84) 99968-1837'),
  ('contato', '16c9fe55-cd50-4665-bae4-206c30fafc18'::uuid, 'Gilkleber - Mirantes ML2', '6143499291270', '(84) 99964-5635'),
  ('contato', '294a7ec7-f991-4393-908e-727614d8753b'::uuid, 'Giovana - MM Construções e Serviços', '6143482302300', '(84) 99115-1150'),
  ('contato', '5143ea06-a2c6-4710-944e-3a7ae1c7b99c'::uuid, 'Giovana Moura', '6143482302300', '(84) 99115-1150'),
  ('contato', 'd7322354-b035-4d7a-aaaa-9a9fdd961c7c'::uuid, 'Gipsy - GM Construções', '6143498753292', '(84) 99937-6646'),
  ('contato', '2f088240-e5ec-4ca4-8aa1-dc8cb9b1bea2'::uuid, 'Gisele - Falesias Empreendimentos Imobiliarios', '6143488020148', '(84) 99401-0074'),
  ('contato', '9d5d587d-a0b6-48e8-a5d4-d78c2bd6186f'::uuid, 'Giácomo Bruno', '6143488693116', '(84) 99434-6558'),
  ('contato', 'c47fcdba-0b5e-40d8-a2df-dadbe25906eb'::uuid, 'Guilherme Souza', '6129193245262', '(71) 99662-2631'),
  ('contato', '3c429b9a-7c81-4a22-aa6e-4489e5264ec6'::uuid, 'Gustavo - Esquadros', '6143499823322', '(84) 99991-1661'),
  ('contato', '285b240f-a8be-4c5e-94a6-197898f7254b'::uuid, 'Gustavo - Licenge', '6143497539372', '(84) 99876-9686'),
  ('contato', 'c3b07ce4-2069-4609-b67a-e307f5c8a123'::uuid, 'Gustavo Dumaresq - Duma Engenharia', '6143498039118', '(84) 99901-9559'),
  ('contato', '1712b2a2-f729-4da4-898b-2439ec58af0f'::uuid, 'Gustavo Rodrigues - Arbo Craibeira', '6142372041606', '(83) 98602-0803'),
  ('contato', '83808007-dae6-4627-b050-37f6e2540d5a'::uuid, 'Hamilton - Oldserv', '6143477310952', '(84) 98865-5476'),
  ('contato', '29bfe1fb-559c-4630-bcac-31219bf1be7a'::uuid, 'Haniel Oliveira - Rialma Energia Eolica', '6143476339310', '(84) 98816-9655'),
  ('contato', '4f13bc63-bed2-48da-a3e5-be14d626bb01'::uuid, 'Heitor - Alto Posto Passa e Fica', '6143498958914', '(84) 99947-9457'),
  ('contato', '939f9b9f-1ab9-44bc-8e4d-a073f0964985'::uuid, 'Helena - JTS Empreendimentos', '6143472714084', '(84) 98635-7042'),
  ('contato', '8bb02756-663f-485a-89f7-8fd3e4699ce6'::uuid, 'Henio - M Nelson Assessoria', '6143488139876', '(84) 99406-9938'),
  ('contato', '98aeefa8-c05c-468e-94db-2518246440f2'::uuid, 'Henio - Parâmetro Engenharia', '6143488139876', '(84) 99406-9938'),
  ('contato', '4f2b163f-4142-4cbd-89f7-a279590438da'::uuid, 'Henrik - RHM Eng', '6142393360138', '(83) 99668-0069'),
  ('contato', 'bca3a89a-c330-41b8-8d7e-8bab36083c42'::uuid, 'Henrique - H M Empreendimentos', '6143492158496', '(84) 99607-9248'),
  ('contato', '5fd2deed-d2f8-4361-a130-ff664ccae34a'::uuid, 'Hermidas - Hagalan AEC', '6143498556462', '(84) 99927-8231'),
  ('contato', '7d5f9260-3ae3-45ed-a0c4-74ff8e32c6d1'::uuid, 'Herryson Felipe - IBR Homes', '6143498876616', '(84) 99943-8308'),
  ('contato', 'dcbf5859-fc64-46f4-b349-610dc2658a3b'::uuid, 'Higor - F H M B Engenharia', '6143482010224', '(84) 99100-5112'),
  ('contato', '258e7bee-9d90-4435-adb6-6cad6a80d8b5'::uuid, 'Hivson - A R Projetos', '6143498241864', '(84) 99912-0932'),
  ('contato', '3dde3351-9a35-4f7c-9262-075fa9183046'::uuid, 'Hugo - Interproj', '6143482160964', '(84) 99108-0482'),
  ('contato', 'aff6b7ee-87b8-4ebf-8a3f-dadfaf360e63'::uuid, 'Humberto', '6143493135200', '(84) 99656-7600'),
  ('contato', 'c0060b25-71c7-4ffd-b0e5-792eee136e79'::uuid, 'Ildemar - Nova Casa Construção', '6143499696888', '(84) 99984-8444'),
  ('contato', '9e795f06-594c-40e0-8384-7cbb6b0ca1df'::uuid, 'Ingrid Dias - I L Azevedo', '6143493684680', '(84) 99684-2340'),
  ('contato', '65e334b5-24b3-4d05-8313-dabf240ee7ae'::uuid, 'Ingrid Frutuoso - Ingrid Frutuoso Engenharia', '6143462161786', '(84) 98108-0893'),
  ('contato', '61b0a241-cc4f-4d76-ade6-34a38b880378'::uuid, 'Iran - Vela Construtora', '6143488926820', '(84) 99446-3410'),
  ('contato', '7914cddd-4ff1-4f81-8746-5ddba5c01272'::uuid, 'Iris', '6143492525944', '(84) 99626-2972'),
  ('contato', 'eceade45-75cc-405a-befc-035846b82c7e'::uuid, 'Irival - Irival Engenharia', '6143499468450', '(84) 99973-4225'),
  ('contato', '319f38b8-a56f-4f7b-a566-9a1e77df4993'::uuid, 'Isac - Petroimoveis', '6143477113418', '(84) 98855-6709'),
  ('contato', 'f53efeab-da8d-482b-af86-c80784abff0d'::uuid, 'Isadora Messias - EPF Construções', '6143475674630', '(84) 98783-7315'),
  ('contato', 'ff65ff8d-fe14-4338-abcb-90369b2e8a22'::uuid, 'Isoares - Res Corais de Tibau', '6143488481272', '(84) 99424-0636'),
  ('contato', '08f186a9-8bdc-40ba-b59e-8a99c4675d79'::uuid, 'Itamar - A8 Incorporações', '6143499077600', '(84) 99953-8800'),
  ('contato', 'dc82857c-379c-4a84-8b7f-dd9201bf5ff5'::uuid, 'Ivan Antas - Clinica Marcia Ortiz', '6143488393038', '(84) 99419-6519'),
  ('contato', '99709438-bba3-4c5c-a263-9fbbbb218f4a'::uuid, 'Ivan Costa - Vipetro', '6143499763200', '(84) 99988-1600'),
  ('contato', '8fed3d30-04ad-413b-9c3d-1e842f30aecd'::uuid, 'Ivana - Schimitz Kennedy', '6143483954756', '(84) 99197-7378'),
  ('contato', '0b195ed4-e903-4fb6-aa73-43d8939185f7'::uuid, 'Ivanildo - E D Torres Maia', '6143476789992', '(84) 98839-4996'),
  ('contato', 'd838afb2-1307-4f4f-9e1c-195f1d7f9af9'::uuid, 'Ivo - Sabia Engenharia', '6143477626134', '(84) 98881-3067'),
  ('contato', '97e3d2c9-3022-46bc-803d-2d0da4ca5f8c'::uuid, 'Jacqueline Sousa - Pessoa física', '6143474326754', '(84) 98716-3377'),
  ('contato', '07fb8a26-9c2c-4e80-9b34-333b926327cf'::uuid, 'Jadson Guedes - HRG Construtora', '6143493129220', '(84) 99656-4610'),
  ('contato', '9422740c-f690-4882-a747-649fc61a35dc'::uuid, 'Jairton Gosson - Paradise Construções', '6143482257240', '(84) 99112-8620'),
  ('contato', '18e6f897-bb6c-4339-bd75-0251cd0d7394'::uuid, 'Jamile - MD Empreendimentos', '6143482165036', '(84) 99108-2518'),
  ('contato', 'bf7efa62-6ab4-43bc-a69d-efa1311b88c1'::uuid, 'Janaina Freire - JF Solucoes de Engenharia', '6143477027528', '(84) 98851-3764'),
  ('contato', '7a692119-cce8-4543-9d77-be40b62ee267'::uuid, 'Jandeson', '6143492142818', '(84) 99607-1409'),
  ('contato', '293e9330-0e65-4f67-afd7-a97a322f4c71'::uuid, 'Jean - Mult Fachadas', '6143474423554', '(84) 98721-1777'),
  ('contato', 'c0c78126-592a-44e6-a90b-6af93e0c2b8c'::uuid, 'Jean - Mult Pinturas e Serviços', '6143474423554', '(84) 98721-1777'),
  ('contato', 'f06e5389-2778-4767-bd4d-9c03df55f96c'::uuid, 'Jean Vilela - Edificio Cristo Redentor', '6143474423554', '(84) 98721-1777'),
  ('contato', 'e8e96aac-d28e-462f-be5c-d7301ed0efc5'::uuid, 'Jeferson - Soma Engenharia', '6143484711952', '(84) 99235-5976'),
  ('contato', '472434fd-409c-49cc-92da-e026db793f26'::uuid, 'Jefferson Teixeira - Mest Engenharia', '6143498451422', '(84) 99922-5711'),
  ('contato', '518e3a6a-dc62-4ccb-8d7d-5791a46bfb8b'::uuid, 'Jennifer - Engpac', '6142393522506', '(83) 99676-1253'),
  ('contato', 'ab60c8a5-71f2-4c2a-987a-98e6556f0d9a'::uuid, 'Jeovana - Icone', '6142398775994', '(83) 99938-7997'),
  ('contato', 'a0170ead-c7ea-48b2-96f2-04f31311fe1e'::uuid, 'Jimena - Pessoa Fisica', '6143463824408', '(84) 98191-2204'),
  ('contato', '567462be-c314-4ff5-9ac0-a8288421fd1e'::uuid, 'Joanilson - C S M Construções', '6143499640260', '(84) 99982-0130'),
  ('contato', 'e422c4ea-5e3f-4bd6-a4b2-a408ed20610d'::uuid, 'Joaquim Júnior - Construtora Pontale Ltda', '6143496543636', '(84) 99827-1818'),
  ('contato', '257eb9fc-a507-42b7-8548-9a81cf46e3ce'::uuid, 'Joederson', '6143492984524', '(84) 99649-2262'),
  ('contato', '3344da0d-1d73-4cb2-a28f-2b2e0681bb87'::uuid, 'Joederson - Aldann Construções', '6143492984524', '(84) 99649-2262'),
  ('contato', '4be9b65d-2137-48b9-9904-7eb94fc872cb'::uuid, 'Jose Herlandess - G A Industria e Comercio', '6143499960462', '(84) 99998-0231'),
  ('contato', '93e72d3e-40e8-42c5-8d53-75375841de1e'::uuid, 'José Eder - J N F Construções', '6143498955758', '(84) 99947-7879'),
  ('contato', '609c9978-93a2-4ca4-8456-3902e215f9c2'::uuid, 'José Eduardo Carvalho dos Santos', '6143488033600', '(84) 99401-6800'),
  ('contato', 'f2bdcf0a-cd75-4eaa-8d36-0017d4fb4039'::uuid, 'José Nilton - Realize Construções e Incorporações', '6143496381000', '(84) 99819-0500'),
  ('contato', 'ceb646ea-b7d9-472d-9bed-17b22965c9f1'::uuid, 'José Pereira - Conarte Projetos', '6143477329438', '(84) 98866-4719'),
  ('contato', '6404397e-ebba-4561-85ec-82390334de8e'::uuid, 'Joyce Sales - J3A Participações Societárias', '6143488036130', '(84) 99401-8065'),
  ('contato', 'e6381bc0-551b-4aff-8fc9-5d2d7b3a2b5b'::uuid, 'João Farias - D&G Empreendimentos', '6143498197152', '(84) 99909-8576'),
  ('contato', 'dd0be6b7-255b-4aee-8b0c-1cce22fb074a'::uuid, 'João Henrique - Hotel Liz', '6147892530688', '(88) 99626-5344'),
  ('contato', '097422ef-46ee-4250-b04a-575850b57359'::uuid, 'João Maria - Cantares construções', '6143476719226', '(84) 98835-9613'),
  ('contato', '52f15925-fe74-4a33-b865-d107ab73137c'::uuid, 'João Paulo - Iris Construções', '6143492385796', '(84) 99619-2898'),
  ('contato', 'b1faa5a2-aef7-4335-8ac2-318178c34b01'::uuid, 'João Paulo - Petroimoveis', '6143499274624', '(84) 99963-7312'),
  ('contato', 'afe859de-2dff-4156-bcf4-4f78784c5bd9'::uuid, 'João Paulo - Vipetro Construções', '6143499274624', '(84) 99963-7312'),
  ('contato', '516237a1-c828-4554-b237-ac9dd2e2e52b'::uuid, 'João Victor - Sui Engenharia', '6143489425246', '(84) 99471-2623'),
  ('contato', '5e1a5d0e-76d8-4873-9124-9cb31520b04a'::uuid, 'João Vitor', '6143498254504', '(84) 99912-7252'),
  ('contato', 'e74b5567-b518-428c-9e6c-0ed6f745bdd7'::uuid, 'Judas Tadeu', '6143484099586', '(84) 99204-9793'),
  ('contato', '0d54d45d-f410-418f-a3c0-ea1322dc2e51'::uuid, 'Judson Soares - Inova Mais', '6143493201412', '(84) 99660-0706'),
  ('contato', 'edf42f20-54e4-49fd-9705-24f92682fc30'::uuid, 'Julia', '6143497531772', '(84) 99876-5886'),
  ('contato', '90148771-4963-49ca-995f-8f56cd27af98'::uuid, 'Juliana - Apollo Empreendimentos', '6143483870908', '(84) 99193-5454'),
  ('contato', 'fc9ad4b8-ded6-4998-a4f2-8e9a40a82713'::uuid, 'Juliana - Leão Potiguar Incorporadora', '6143483870908', '(84) 99193-5454'),
  ('contato', '3d7f65d8-82b2-4436-92f5-530388ceaa57'::uuid, 'Julianna - Alelo Consultoria', '6143499169444', '(84) 99958-4722'),
  ('contato', '5761e663-3181-4262-8eae-c50754fbabe9'::uuid, 'Junior - Licenge', '6143483625896', '(84) 99181-2948'),
  ('contato', '21d4a44e-e928-43e9-8342-9fb99a32282c'::uuid, 'Júnior - Imovence Imóveis', '6143489029580', '(84) 99451-4790'),
  ('contato', '37d25579-1a5a-4d07-b1cc-8a20670ea368'::uuid, 'Júnior Diviaço - D. De Brito', '6143477572692', '(84) 98878-6346'),
  ('contato', '76c1b614-d26d-4fd3-9864-eb63b59183b4'::uuid, 'Júnior Maia - Souza empreendimentos', '6143499261354', '(84) 99963-0677'),
  ('contato', '7145b6a9-d2b4-4a0d-83c7-bc58b1a4d68c'::uuid, 'Kadma Maia - Cliente Pormade', '6143497962500', '(84) 99898-1250'),
  ('contato', '838cea46-019c-4a22-b7d0-126013f613b8'::uuid, 'Kalina Marques - Duo Capim Macio', '6143499272326', '(84) 99963-6163'),
  ('contato', '974dd058-8b6c-4738-a91e-7c88831ab166'::uuid, 'Kaline', '6143476280460', '(84) 98814-0230'),
  ('contato', 'ca7eda9b-d3f2-4682-9715-e4833d4fd3b4'::uuid, 'Karine - Jax Participações', '6143463336002', '(84) 98166-8001'),
  ('contato', '69193a49-809a-4462-a42d-332b04223e74'::uuid, 'Karla - F Dois Engenharia', '6143474028928', '(84) 98701-4464'),
  ('contato', 'a4dce801-6db8-49d8-ace6-fc30c41e1e28'::uuid, 'Karla Leitão - Mais Construtora', '6142399822442', '(83) 99991-1221'),
  ('contato', '8ed8607f-669b-46d8-bfb3-62b1083d6e36'::uuid, 'Karol - Plano Urbanismo', '6143483761288', '(84) 99188-0644'),
  ('contato', 'd82eb6d1-c0ca-40a6-afa6-c929a477cc54'::uuid, 'Karoline - R De Paula Construções', '6143482301694', '(84) 99115-0847'),
  ('contato', 'cc1b39ac-41cf-4bae-8a28-290cad21e9a7'::uuid, 'Keite Souza - MRV', '6085186433844', '(31) 99321-6922'),
  ('contato', 'eb514857-4804-4c92-ac8d-da578344443e'::uuid, 'Kellen Diógenes - Zeta Construção', '6143499046682', '(84) 99952-3341'),
  ('contato', '484acb1f-e7d8-4d96-9d7b-46f1067c72d5'::uuid, 'Kelliany Gosson - R K Administração', '6143488385454', '(84) 99419-2727'),
  ('contato', '5f9fe207-e3db-4e5e-96a7-ce8e96043d1a'::uuid, 'kesia', '6143489396216', '(84) 99469-8108'),
  ('contato', 'a4c54ec4-d260-45ad-b055-262fba19bea0'::uuid, 'Kleber - JK Construções', '6143488375860', '(84) 99418-7930'),
  ('contato', '375a979f-8157-48ab-8228-1fedef664ef6'::uuid, 'Kleylson Dantas - Goldmen Hotel Vila do Mar', '6143499711146', '(84) 99985-5573'),
  ('contato', '9690e5d1-3dc8-4b75-9e19-c6206f682cb9'::uuid, 'Lailton Luiz Dantas - Engemax', '6143493340510', '(84) 99667-0255'),
  ('contato', '2c0ac2ca-44bc-44c2-925a-83fc1c1b20a3'::uuid, 'Lauana - Artecasa', '6143496960712', '(84) 99848-0356'),
  ('contato', '9a489822-a36d-423f-8bc7-9fa93900781a'::uuid, 'Leandro - Mossoro Premoldados', '6143492504068', '(84) 99625-2034'),
  ('contato', '01adc507-ec78-4429-97d7-37d2b68fd986'::uuid, 'Leonardo', '6143474425894', '(84) 98721-2947'),
  ('contato', '6d8c5629-c944-4352-ba21-a23a8fe01b62'::uuid, 'Leonardo - Construtora LCL', '6143492907400', '(84) 99645-3700'),
  ('contato', '1bdcce80-e4b3-4586-af66-ff809f5333fc'::uuid, 'Leyciana - M B Empreendimentos', '6143483824440', '(84) 99191-2220'),
  ('contato', '402edd0d-c926-4d27-a4cf-32b5cc166fa1'::uuid, 'Lianne Linhares', '6143492595532', '(84) 99629-7766'),
  ('contato', '3252d39e-732c-43ac-ac33-54c9d9ae209c'::uuid, 'Licínio Corrêa', '6144592573550', '(85) 99628-6775'),
  ('contato', 'a272ff50-4ed7-4a48-a7dc-afe1fcb43cba'::uuid, 'Lidinard - Progresso Atacado', '6143463243434', '(84) 98162-1717'),
  ('contato', '37fc75c9-d2d2-44d3-b55b-887d76cc257a'::uuid, 'Lindemberg - Casa Real Incorporadora', '6143499314458', '(84) 99965-7229'),
  ('contato', '56970704-494a-4e76-a772-7ca730a1bb3a'::uuid, 'Louise - Cosampa Construções', '6147894808028', '(88) 99740-4014'),
  ('contato', '92d4cb29-102a-48b6-8c98-b944e1d32d36'::uuid, 'Luana - Hepta', '6143477493920', '(84) 98874-6960'),
  ('contato', 'a4fdc7f4-56c5-49fc-bf96-ae5c5ea4b070'::uuid, 'Luana - J. P. Oliveira', '6074195672074', '(21) 99783-6037'),
  ('contato', '6a618bab-ccde-4547-a2eb-c59be1b5b683'::uuid, 'Luana Arquiteta', '6143499060040', '(84) 99953-0020'),
  ('contato', '36fd8aa2-7b4f-45c5-b375-867d24edb80c'::uuid, 'Lucas - Macam', '6143482170624', '(84) 99108-5312'),
  ('contato', '646d79da-f234-4e10-b1d5-429680db857c'::uuid, 'Lucas Brito', '6143492902364', '(84) 99645-1182'),
  ('contato', '6fa1346d-151b-4552-aaa8-0e2afb4244bb'::uuid, 'Lucidalva - Mar Vermelho', '6063163220048', '(11) 98161-0024'),
  ('contato', '924771fd-a500-4d7f-a1ed-49f404355d24'::uuid, 'Luiz Amâncio - Sun Set', '6143477384664', '(84) 98869-2332'),
  ('contato', '56c78101-ee51-4e81-a0c7-6ec118f03d22'::uuid, 'Luiz Carlos', '6143498418390', '(84) 99920-9195'),
  ('contato', 'd9b7436a-c998-4cbf-827e-acb6fb4ad3af'::uuid, 'Luiz Eduardo - Construtora LCL', '6143489027698', '(84) 99451-3849'),
  ('contato', 'b7b64bce-0aad-471f-938e-86ca0a3c56a4'::uuid, 'Luiz Felipe - Construtora LCL', '6143463650506', '(84) 98182-5253'),
  ('contato', '3e85a4ee-fe7a-4ce7-85fd-81eb9560a506'::uuid, 'Luiz Felipe Chacon - Trutto', '6143482339932', '(84) 99116-9966'),
  ('contato', 'e3e2fac9-b2e0-4f01-9576-c4f90e2a5ec8'::uuid, 'Luiz Gabriel - Paiva Fernandes Empreendimentos', '6143477191100', '(84) 98859-5550'),
  ('contato', 'fcb423a8-b2b1-4009-80cc-3347e85a48b0'::uuid, 'Luiz Oliveira - CST Construções', '6143483640338', '(84) 99182-0169'),
  ('contato', '427b4583-9dc2-4f36-aab7-9c0f56cf9666'::uuid, 'Lula - Pipa Natureza', '6142398425350', '(83) 99921-2675'),
  ('contato', 'add4a1c6-2c56-4c27-98d3-48a2c5939f65'::uuid, 'Lúcia - L. M. M. Belmont', '6143498136760', '(84) 99906-8380'),
  ('contato', 'e96bc93b-114d-4707-a323-bc25345a5c50'::uuid, 'Lúcio - Meganor', '6143498111022', '(84) 99905-5511'),
  ('contato', '08ba54c0-f0a3-44a1-86e1-e045e8471b10'::uuid, 'Maikia', '6143493666594', '(84) 99683-3297'),
  ('contato', 'dff563cc-d65e-4b26-a91a-f9db738e951c'::uuid, 'Manoela Carrilho', '6143499760556', '(84) 99988-0278'),
  ('contato', '2ad56174-53ef-41f3-93ec-9cf7183e3f17'::uuid, 'Marcel - Dois M Engenharia', '6143488022300', '(84) 99401-1150'),
  ('contato', '9a8993d3-da09-4587-972a-8f43c57ac0e7'::uuid, 'Marcel - Pipa Group', '6143488022300', '(84) 99401-1150'),
  ('contato', '4954c522-d8ef-4f7f-9369-f8aea7aaf5ff'::uuid, 'Marcela Aguiar - Dantas Irmãos', '6143498553384', '(84) 99927-6692'),
  ('contato', '32baf3a1-5c89-4bab-8f74-d732778dcfbb'::uuid, 'Marcela Braz - Esquadros Engenharia', '6143496407034', '(84) 99820-3517'),
  ('contato', 'ef48a711-b5f9-4d7e-83a6-c683f9e4a533'::uuid, 'Marcell - Plana Edificações', '6143499955884', '(84) 99997-7942'),
  ('contato', '89921de4-51d0-4d10-90c9-bd39b8ad7c4b'::uuid, 'Marcelo - Construtora MM Dantas', '6143482552954', '(84) 99127-6477'),
  ('contato', 'e94e5f43-06af-479b-9b38-6b31f38bf5a9'::uuid, 'Marcelo - Planalto Empreendimentos', '6143496986622', '(84) 99849-3311'),
  ('contato', 'a1a32d65-9a07-4da4-872e-ae59fbdf0cac'::uuid, 'Marcelo - Posto Planalto LTDA', '6143496986622', '(84) 99849-3311'),
  ('contato', '177c5512-c4ef-4f91-81e4-9d1a9e8704c8'::uuid, 'Marcelo - Pé Direito', '6143477550100', '(84) 98877-5050'),
  ('contato', 'ff967a46-55af-4a5e-b8eb-f8c103f52902'::uuid, 'Marcelo - Sindico', '6143488546366', '(84) 99427-3183'),
  ('contato', '67399b0e-52d8-40cd-b410-bf5c092d4378'::uuid, 'Marcia Araújo', '6143476938444', '(84) 98846-9222'),
  ('contato', 'fd6ac09c-4f92-496e-a8db-fb534ca9e1cb'::uuid, 'Marcondes - Incorplan Incorporações', '6129183091324', '(71) 99154-5662'),
  ('contato', '494c4f60-e0a1-4a15-bb84-62d5247c4763'::uuid, 'Marcos - Lcmarques Construção', '6143493001308', '(84) 99650-0654'),
  ('contato', '9ff03a25-6fa4-4cce-afb6-17e16679c2c5'::uuid, 'Marcos - Pipa Empreendimentos', '6143474182026', '(84) 98709-1013'),
  ('contato', '328ddc92-7be9-44c5-a53a-ec45604ddd77'::uuid, 'Marcos - Realize Empreendimentos', '6143493001308', '(84) 99650-0654'),
  ('contato', '00f5f76a-05fd-4270-ac20-d024cdf7aab2'::uuid, 'Marcos Santana - Dunas Projetos e Instalações', '6143477772152', '(84) 98888-6076'),
  ('contato', '26009d5e-6069-48a7-bbf0-8cb0bd854e98'::uuid, 'Maria Eduarda - Tecomat', '6140194791864', '(81) 99739-5932'),
  ('contato', 'e7245495-9e2c-46b4-b6dc-c3bfdbdea632'::uuid, 'Maria Eugenia', '6143488119246', '(84) 99405-9623'),
  ('contato', '8da1278b-2559-44cb-863f-7dcf58e37987'::uuid, 'Mariana Freire - Constel', '6143462112530', '(84) 98105-6265'),
  ('contato', '1f141920-b09e-4d14-96f5-194163e64439'::uuid, 'Mariana Nogueira - Construtora J. Queiroz', '6143492231574', '(84) 99611-5787'),
  ('contato', '197b3632-2a38-4ee6-a3b2-d58998b55bca'::uuid, 'Marijânio', '6143482537906', '(84) 99126-8953'),
  ('contato', 'b421128d-6b3d-447c-a117-643f5ed436ab'::uuid, 'Mario Formiga Maciel Filho', '6142398425350', '(83) 99921-2675'),
  ('contato', 'ff6a45b1-870d-4eec-ae14-cd96e25cf16a'::uuid, 'Marllos Santos - Cavicchioli', '6143477962222', '(84) 98898-1111'),
  ('contato', '6edae74c-e49d-4663-ac04-b6d71b47e42b'::uuid, 'Marília - Arko Construções', '6143499100378', '(84) 99955-0189'),
  ('contato', '03a61efa-1a40-4968-946e-85e83af09e4f'::uuid, 'Matias - Cond Resid Abbot Galvão', '6143492138032', '(84) 99606-9016'),
  ('contato', '13633d0d-3aa0-4829-a224-2e5f9015b459'::uuid, 'Mauro - M & R Eng GMA', '6143496360416', '(84) 99818-0208'),
  ('contato', 'a6f7a1ae-d29f-48bd-becf-4d87e3d79130'::uuid, 'Maxsuel - EGS Incorporações', '6143493625404', '(84) 99681-2702'),
  ('contato', 'a4072fba-1026-48ed-bc4b-ec270bf665c8'::uuid, 'Mayana - Plano Urbanismo', '6143492180036', '(84) 99609-0018'),
  ('contato', '3ffae950-1c6a-4bf5-8a0d-69f8ca290ae3'::uuid, 'Mayara - Construfit', '6143482137028', '(84) 99106-8514'),
  ('contato', '3fe00b95-73b7-45b2-a398-cb4c7a2d197d'::uuid, 'Melgbson - Lca Distribuidora Ltda', '6143499672554', '(84) 99983-6277'),
  ('contato', '65f06c1a-b613-4343-b9b3-08beb4db76e1'::uuid, 'Michael', '6096193997954', '(41) 99699-8977'),
  ('contato', 'ea0d9d10-5fa5-4689-84ce-8db217491a94'::uuid, 'Michel - M P Construções', '6143483167326', '(84) 99158-3663'),
  ('contato', 'fed7e15b-9397-455d-bf1d-37e7bf21c36b'::uuid, 'Michelle - WSC Empreendimentos', '6143483159788', '(84) 99157-9894'),
  ('contato', '3fa9446c-61d7-4bfe-ae46-70c31c8d8a2c'::uuid, 'Mikael - Construtora São Carlos', '6143492298776', '(84) 99614-9388'),
  ('contato', '6e65125c-1aca-4360-834a-ef1d59a3a130'::uuid, 'Monielly', '6143483386650', '(84) 99169-3325'),
  ('contato', '469c6a0b-8dbd-462e-b365-1f8d6952ba13'::uuid, 'Monna - WSC Empreendimentos', '6143475083568', '(84) 98754-1784'),
  ('contato', '39941654-cedd-458b-8fb3-34d660f5bc73'::uuid, 'Mozart', '6143492565776', '(84) 99628-2888'),
  ('contato', 'c12e38a2-5b5a-423b-a562-2de2bdf5eb00'::uuid, 'Myller - Licenge', '6143498561408', '(84) 99928-0704'),
  ('contato', '1eccd7dd-7d2b-4ce1-ba45-4a5b9ca3367c'::uuid, 'Márcio - Cond Maximum', '6143473642758', '(84) 98682-1379'),
  ('contato', '3834fce7-273a-4e88-aa85-ab7973cdf54e'::uuid, 'Naiara - Construtora Cimientos', '6143483710038', '(84) 99185-5019'),
  ('contato', 'c5a3787c-e844-4f23-8900-f42f6326c52a'::uuid, 'Nailton Teixeira', '6143477621184', '(84) 98881-0592'),
  ('contato', '279605cf-f283-424b-bfbf-206326096d4d'::uuid, 'Naldo - Atlantis', '6143483445274', '(84) 99172-2637'),
  ('contato', '1b365f95-d0b1-4660-9d96-feb55618f24e'::uuid, 'Nanci Matos - Sindica Cond Lucas Benjamim', '6143488223930', '(84) 99411-1965'),
  ('contato', '9264e40b-8059-4bf6-99a6-542aefa01f1a'::uuid, 'Nara - Licenge', '6143493880040', '(84) 99694-0020'),
  ('contato', '79ccb1f1-1344-40dc-be24-8f9c4dec109b'::uuid, 'Natalia - Allure', '6142388284104', '(83) 99414-2052'),
  ('contato', '93168949-1e62-4fa2-b2be-34001f228184'::uuid, 'Natalia Rocha - Construtora Fonseca & Mercadante', '6143496740148', '(84) 99837-0074'),
  ('contato', 'b8d22480-c923-4ef3-b746-79737afcb85a'::uuid, 'Natasha Souza', '6143488043806', '(84) 99402-1903'),
  ('contato', '7baf6557-e406-43c0-a19d-206ad5e54033'::uuid, 'Nathalia - M B Empreendimentos', '6143498224378', '(84) 99911-2189'),
  ('contato', 'cf057c89-f989-4808-85a5-6eaf738d9f6b'::uuid, 'Nestor Jr', '6143483096598', '(84) 99154-8299'),
  ('contato', 'fa9ba8f0-8f64-4374-b4d0-4d541a6b8578'::uuid, 'Ney', '6143477952566', '(84) 98897-6283'),
  ('contato', 'cdfa7e3a-7ad5-490b-a9a8-712c5d66f853'::uuid, 'Nizario - Ecocil', '6143476025586', '(84) 98801-2793'),
  ('contato', 'bfd156a8-2c35-4381-8e59-99fe973f2f18'::uuid, 'Olavo - Gameleira Vida Emp', '6143499644540', '(84) 99982-2270'),
  ('contato', 'f933c1c6-683e-4fb8-9fb6-a11da31de720'::uuid, 'Oliveiros - Procopio De Lucena Filho', '6143476527460', '(84) 98826-3730'),
  ('contato', '28ede380-be20-47df-8f33-a3c9bb5fdb09'::uuid, 'Onaldo - Incorporadora Macedo & Andrade', '6143482114912', '(84) 99105-7456'),
  ('contato', 'cd5ac3a8-80d8-4fd6-b2a4-996f0a6802f1'::uuid, 'Onaldo Dantas - Dantas e Dantas Construções', '6143482114912', '(84) 99105-7456'),
  ('contato', '2a82515e-de58-4d66-947a-86e87c8bf6c2'::uuid, 'Orlivan - Ods Eng', '6143476690670', '(84) 98834-5335'),
  ('contato', 'a7d6091c-cf69-4106-a268-a678956f13e3'::uuid, 'Otávio - Torini Construções', '6143492458396', '(84) 99622-9198'),
  ('contato', '064888ac-72a9-463c-b53e-93e3b2284fbd'::uuid, 'Pablo - Atlantis', '6143462389818', '(84) 98119-4909'),
  ('contato', 'dd9e8e05-c176-4609-8be5-63b64f25354e'::uuid, 'Pablo - E De M Barbosa', '6143496878098', '(84) 99843-9049'),
  ('contato', '6f681ba9-d9a6-4fc9-9168-a53c47ef71f3'::uuid, 'Pablo - Solo Design Offices', '6143462389818', '(84) 98119-4909'),
  ('contato', '125eab97-e6d3-4339-b1eb-34b02e523615'::uuid, 'Paulo - Condomínio Shopping Center Midway Mall', '6143477765192', '(84) 98888-2596'),
  ('contato', '61436c94-b8ed-4778-9714-3790d7788a81'::uuid, 'Paulo - Vela Incorporadora', '6143476386462', '(84) 98819-3231'),
  ('contato', '924a3200-aeed-4b26-9032-e0ad85305625'::uuid, 'Paulo Adelino', '6143499634414', '(84) 99981-7207'),
  ('contato', '3dca2441-d57d-444a-853d-76150faadfcd'::uuid, 'Paulo Cesar', '6143493105652', '(84) 99655-2826'),
  ('contato', 'c6d81d96-9348-428e-ac69-4bff2fdfff60'::uuid, 'Paulo Rodrigues - Midway Shopping Center', '6143477765192', '(84) 98888-2596'),
  ('contato', '787c4976-10f2-4a1a-8921-30289bce43b9'::uuid, 'Paulo Zurich', '6143493320132', '(84) 99666-0066'),
  ('contato', '3b31a8a5-603a-4a3c-a5a7-0191147264ee'::uuid, 'Pedro', '6143499635758', '(84) 99981-7879'),
  ('contato', 'ba892260-61a0-4dfd-851b-c0268062514d'::uuid, 'Pedro Cardoso - Macam', '6143474671564', '(84) 98733-5782'),
  ('contato', '351b3efc-0cb9-45a9-94a2-32b731f66fe8'::uuid, 'Pedro Henrique', '6143492261536', '(84) 99613-0768'),
  ('contato', 'c66101e6-b3f3-470f-9292-f704637a05ca'::uuid, 'Pereira - IM Engenharia', '6143477329438', '(84) 98866-4719'),
  ('contato', 'eae227d7-32de-42dd-b59c-366da40f3731'::uuid, 'Perola - Edificio Residencial Diego Velazquez', '6143492747534', '(84) 99637-3767'),
  ('contato', 'b0199ffd-3848-4a1d-a0c8-d0a5871562ef'::uuid, 'Pérola Queiroz - Icone Tirol', '6143492747534', '(84) 99637-3767'),
  ('contato', '4d16c050-972d-4b69-af37-6d5ed92ba439'::uuid, 'Rafael Moreira - Construtora Dantas', '6143493082820', '(84) 99654-1410'),
  ('contato', '44cf2036-8401-4a4e-b8f8-0b2efdd315cc'::uuid, 'Rafael Ramos - A G Hoteis e Turismo', '6143488896358', '(84) 99444-8179'),
  ('contato', '6e9daf46-70e2-4eae-814d-277acb8238db'::uuid, 'Raniery - R a De O Filho Eng', '6143477802018', '(84) 98890-1009'),
  ('contato', '71aca8f9-64b4-4dfa-893b-dcaefb6ccb72'::uuid, 'Ransuely - Encon Engenharia', '6143499829100', '(84) 99991-4550'),
  ('contato', 'a33e2d05-97a8-40c5-ad5f-a8188d269f7c'::uuid, 'Raphael - MSB Engenharia', '6143476348432', '(84) 98817-4216'),
  ('contato', '3fdb8d5f-598d-4ac7-b048-d25bc9a9e7bb'::uuid, 'Raquel - SDM Empreendimentos', '6143493387536', '(84) 99669-3768'),
  ('contato', '70b89dd2-f676-44b8-bd64-e2a82c5438ce'::uuid, 'Regivan Almeida - R ALMEIDA DRYWALL', '6143477905044', '(84) 98895-2522'),
  ('contato', '047094bc-948c-4725-a2ca-ca7b7f0cfc32'::uuid, 'Renan - Construtora LCL', '6143493228044', '(84) 99661-4022'),
  ('contato', 'afa91c3f-59d4-419f-8d54-6fc7a9012252'::uuid, 'Renan Lampreia - All Construções', '6143493228044', '(84) 99661-4022'),
  ('contato', 'c1f83d6a-900f-4abf-9449-4dc76c7c7ad7'::uuid, 'Renan Lampreia - Bm cidade verde', '6143493228044', '(84) 99661-4022'),
  ('contato', 'fa70ba45-5401-4262-a2df-4cd3ebe93021'::uuid, 'Renata - Artecasa Investimentos', '6143463298932', '(84) 98164-9466'),
  ('contato', '3dc048ac-ae10-45f7-a6da-497dc9a9c1cc'::uuid, 'Renata - Repres Astra Fortaleza', '6144574809556', '(85) 98740-4778'),
  ('contato', '40b15a0d-7ae0-4f07-ac15-613f6c7ef4bc'::uuid, 'Renato', '6143499489860', '(84) 99974-4930'),
  ('contato', '8f1aafee-a5ae-4a85-bc1c-66ccf817d988'::uuid, 'Renato - Mareg Engenharia', '6143499489860', '(84) 99974-4930'),
  ('contato', 'ba593050-e7f2-435a-ae5d-6e228d372334'::uuid, 'Renato - RR Gessos', '6143477716636', '(84) 98885-8318'),
  ('contato', 'ff2cba51-b415-45b9-ad83-7f7c3ae7f989'::uuid, 'Renato Mattozo - Teto', '6063164471704', '(11) 98223-5852'),
  ('contato', 'cbc6cda9-2c59-4066-97be-420f6e974268'::uuid, 'Rendell Pantoja', '6151161010670', '(91) 98050-5335'),
  ('contato', '4f6fc35b-9f5f-4609-ad03-0dd5cf2b73d9'::uuid, 'Ricardo de Grande - RD Construções', '6143498451606', '(84) 99922-5803'),
  ('contato', '3d21b81b-09aa-4ff3-9b51-b04f6cfd328c'::uuid, 'Ricardo Risuenho', '6143463162024', '(84) 98158-1012'),
  ('contato', '08b83ff6-50d6-4737-a067-11b841ed4187'::uuid, 'Rilder - A R Projetos', '6143482523478', '(84) 99126-1739'),
  ('contato', 'c39cafca-cde3-489c-8de3-c25c91d59be7'::uuid, 'Rildo Andrade - Ecomax', '6143463188032', '(84) 98159-4016'),
  ('contato', '33135496-fd2d-45e8-927f-79cf5b518d72'::uuid, 'Rita Ferreira - Construtora Ferreira Lima', '6143499817746', '(84) 99990-8873'),
  ('contato', 'c6bd467e-0bc3-4dce-89c0-36059bcfdc9b'::uuid, 'Roberto - Macro Empreendimentos Imobiliários', '6143482826324', '(84) 99141-3162'),
  ('contato', 'd94409d4-7386-4813-9ca3-832d8a0dff43'::uuid, 'Roberto - MD RN Helen Costa', '6140146832334', '(81) 97341-6167'),
  ('contato', '600c7702-ef62-49bf-9e1c-9f45cab11ec3'::uuid, 'Roberto Umbelino - Cinco S', '6143462697442', '(84) 98134-8721'),
  ('contato', 'f7806f8a-c237-4f89-9066-a2711f9994e1'::uuid, 'Robério Apolinário - Mipibu', '6143482795744', '(84) 99139-7872'),
  ('contato', 'bcc745db-c004-4213-83b9-e264abe743d1'::uuid, 'Rodrigo - Esquadros Engenharia', '6143498539804', '(84) 99926-9902'),
  ('contato', '92726bc6-fc54-4803-824d-51962e16412f'::uuid, 'Rodrigo Santiago - Fronteira', '6142376327500', '(83) 98816-3750'),
  ('contato', 'deefe3a1-74d2-41a2-9e26-699ae7cd9916'::uuid, 'Rogerio Barreto - RBM Engenharia', '6143476596344', '(84) 98829-8172'),
  ('contato', 'd122610b-7edb-4160-b4bc-8f8a58225999'::uuid, 'Romário - Interproj', '6143483778584', '(84) 99188-9292'),
  ('contato', '607b5c8d-770f-4d21-b52a-608bc7f7ff95'::uuid, 'Rose - J e S Justino', '6143499101564', '(84) 99955-0782'),
  ('contato', '9780e382-0bc2-4cff-9b32-a7be2290cab7'::uuid, 'Samantha Macedo - A C Engenharia', '6143482193648', '(84) 99109-6824'),
  ('contato', '5f5a1401-fe4f-4c53-a5d8-91630cb0e1cb'::uuid, 'Samara Técnica - J. Z. R. Construcoes', '6143475500422', '(84) 98775-0211'),
  ('contato', 'c0d17731-8138-4d78-8e18-566eb7cf68ed'::uuid, 'Sami - Ecomax - Ocean Tower', '6143476445804', '(84) 98822-2902'),
  ('contato', '46d709bf-aa67-4b73-8672-308b7d9c56c6'::uuid, 'Samuel - Dois A Potengi Incorporações I', '6143488047832', '(84) 99402-3916'),
  ('contato', '486f7784-7360-4d52-a687-64b134c43730'::uuid, 'Samuel - Posto Pium', '6143463080884', '(84) 98154-0442'),
  ('contato', '494f2f61-9e11-41e1-9b60-3f815adb1762'::uuid, 'Sanderson Solon - Supermercado Nordestão', '6143489149996', '(84) 99457-4998'),
  ('contato', '9ff864f4-b66c-46ee-9c3b-6b3c826b642c'::uuid, 'Sandro - Florescer Holding', '6143462815000', '(84) 98140-7500'),
  ('contato', '7e635e15-0419-4f17-8328-b877fed0bf4c'::uuid, 'Sergio Freire - SF Construções', '6143476488642', '(84) 98824-4321'),
  ('contato', 'dcdba0c1-cf9f-4d13-ad69-c5a292deca31'::uuid, 'Sergio Lima - RN Borrachas', '6143483387840', '(84) 99169-3920'),
  ('contato', '6b0e2b16-8b29-4903-b5a0-c2577e3c400a'::uuid, 'Sergio Torres - ECCL Empreendimentos', '6143477340046', '(84) 98867-0023'),
  ('contato', '3fe18010-1434-4b80-b8d7-1989d61e88d7'::uuid, 'Setor de Compras - Ramalho Moreira', '6143477974512', '(84) 98898-7256'),
  ('contato', 'b48c45d0-9315-463c-b40b-b3c41832ec4d'::uuid, 'Setor de Compras Ativitá', '6143462655148', '(84) 98132-7574'),
  ('contato', 'f9a3c416-77e3-42fa-a1d1-2e5556cd7aa6'::uuid, 'Severino - Imobiliaria Sao Severino Eireli', '6143483963638', '(84) 99198-1819'),
  ('contato', '604f5852-d387-4133-88a3-29eb7d8541fc'::uuid, 'Silva Júnior - Repav', '6143482683544', '(84) 99134-1772'),
  ('contato', 'c745ef44-8f5d-40b4-a29f-3bd7f050daa7'::uuid, 'Sonia - Condominio Residencial Miguel Barra', '6143499834208', '(84) 99991-7104'),
  ('contato', '93d0897c-bbb4-480e-a770-b1d25d8805c8'::uuid, 'Sonia Aguiar - Marco Engenharia', '6143499834208', '(84) 99991-7104'),
  ('contato', 'd51c7ce3-288b-4a8a-bd3a-ae9755776cba'::uuid, 'Suprimentos - Econtec', '6143482336488', '(84) 99116-8244'),
  ('contato', 'ae912962-815a-4691-a532-6607d89f4841'::uuid, 'Suziara - Trento Engenharia', '6143488364030', '(84) 99418-2015'),
  ('contato', '2ea0896e-6201-4baa-b2f2-bcb546f596a2'::uuid, 'Sylvanne Maia - HN Edificações', '6143488249822', '(84) 99412-4911'),
  ('contato', '007ee682-0148-4ca2-a2c9-ced0af607d1c'::uuid, 'Sérgio - Licenge', '6143499723362', '(84) 99986-1681'),
  ('contato', '02f60a25-c631-43f7-a4a6-de93bf2e1c14'::uuid, 'Taise - I L Azevedo', '6143493577558', '(84) 99678-8779'),
  ('contato', '165fe8b7-9747-4a78-804b-d33fee9bbed7'::uuid, 'Taiuana - Econtec', '6143499698086', '(84) 99984-9043'),
  ('contato', '6b3aa076-7edd-48ad-9014-993e5dd8c32f'::uuid, 'Talita - Colegio Universo Uno', '6143475896628', '(84) 98794-8314'),
  ('contato', 'eb529925-81ee-4a62-8ad0-3f508403618e'::uuid, 'Tathiana Freitas - Pessoa física', '6143489623696', '(84) 99481-1848'),
  ('contato', '16731e62-61ff-4953-bb72-5c811f40b770'::uuid, 'Tatiana - Pousada Jardins De Goa', '6143488480022', '(84) 99424-0011'),
  ('contato', '2289cc90-1cea-49ed-9e95-9c244c5a6104'::uuid, 'Thayse Fabricio - Supermercados MJ De Gois', '6143498213956', '(84) 99910-6978'),
  ('contato', '8e41e559-fa60-4839-81eb-9094172cf0fe'::uuid, 'Thomas - Consteb Construções', '6143474257996', '(84) 98712-8998'),
  ('contato', '30b1367e-e764-4735-a2b0-8f5398e67c63'::uuid, 'Thomas - Erth Engenharia', '6143474257996', '(84) 98712-8998'),
  ('contato', 'c7c37fca-53d6-4cd5-9e06-5e9a3ad753ac'::uuid, 'Thomas Marcelino - Borogodo Cenografia', '6143474257996', '(84) 98712-8998'),
  ('contato', 'f6a6edd9-06ce-4a46-8d31-eec3db96047c'::uuid, 'Tiago - Artecasa Investimento', '6143499839838', '(84) 99991-9919'),
  ('contato', '58578e8e-8801-47ad-8165-52a7692781cc'::uuid, 'Tiago Rego - Tav Empreendimentos', '6143488797838', '(84) 99439-8919'),
  ('contato', '7b1d134c-738c-407f-8fb1-ba3c70b63fc1'::uuid, 'Vanessa - Torre Forte', '6143476059752', '(84) 98802-9876'),
  ('contato', '905a7343-1147-4ac8-919f-c924ff44b86e'::uuid, 'Vania - Interproj', '6143488042554', '(84) 99402-1277'),
  ('contato', '05c8df27-8f1a-43e4-9e28-94104975c68d'::uuid, 'Victor Vittus - Exata Engenharia', '6143462736426', '(84) 98136-8213'),
  ('contato', '70f8098f-058a-4564-9ac3-2eb8e38bc015'::uuid, 'Vilmar Segundo - Vipetro Construções', '6143499839990', '(84) 99991-9995'),
  ('contato', '9b2c9d42-0d85-4848-8af1-24ff7aa491a5'::uuid, 'Vinicius Regis - P2J', '6143498892374', '(84) 99944-6187'),
  ('contato', 'cbba6c9c-21fe-4061-8097-0d5efeb55c7b'::uuid, 'Vitor - CSM', '6143499015738', '(84) 99950-7869'),
  ('contato', '4df68325-0dc7-458b-856d-8f810e758128'::uuid, 'Vitoria - Duo Capim Macio', '6143499140026', '(84) 99957-0013'),
  ('contato', 'b2262132-bc76-4cfb-a5af-78a44d25c2e8'::uuid, 'Vitoria - Innotech Eng', '6143492452790', '(84) 99622-6395'),
  ('contato', '8f11a5a3-526f-4806-b7f4-011a96156c14'::uuid, 'Vânia - Torre Forte', '6143482439766', '(84) 99121-9883'),
  ('contato', 'af6559e9-1979-485e-b9a2-8dcef7a4aacf'::uuid, 'Wallace - WB Piscinas', '6143476292382', '(84) 98814-6191'),
  ('contato', 'dca29f22-e9f1-428e-8324-41c7eebb613e'::uuid, 'Wellison Lima - Enggeral Engenharia', '6143482453474', '(84) 99122-6737'),
  ('contato', '7e68526b-8d4c-4dfc-9781-3fd188e4aa4b'::uuid, 'Welliton - Repav Patamares', '6143482781554', '(84) 99139-0777'),
  ('contato', '60b0136f-a23f-40e6-b067-04e31eec19e2'::uuid, 'Willian - Super Construção', '6143488372094', '(84) 99418-6047'),
  ('contato', 'a4c612f4-dc09-4e76-90f0-700410044dba'::uuid, 'Willyanne - A E C Construções e Serviços', '6085164200912', '(31) 98210-0456'),
  ('contato', 'acdbafe5-8007-40ed-8170-d1a06f509886'::uuid, 'Wylliam - Silva Ribeiro Comercio', '6143492452768', '(84) 99622-6384'),
  ('contato', '1eeb2029-d2b3-4c57-9c56-84920027a062'::uuid, 'Yago Silva - Searq', '6143476202410', '(84) 98810-1205'),
  ('contato', '7610f583-6eec-4cdf-b77a-71ffca8353ef'::uuid, 'Ítalo - I Marcon', '6143476575260', '(84) 98828-7630'),
  ('contato', 'bbf59978-bffc-4c57-8695-466ebbbda67d'::uuid, 'CST Construções', '6143340600774', '(84) 2030-0387'),
  ('contato', '5f564ff6-a2ff-4fa7-9834-9ee88eb6f488'::uuid, 'Lucas - N L V Bacurau', '6143366861372', '(84) 3343-0686'),
  ('contato', '1ac029d4-a410-485c-ae7d-f964478dd66f'::uuid, 'Mylena', '6143343081064', '(84) 2154-0532'),
  ('empresa', 'b4557ff4-3ec0-4c15-a1b9-a12433baa85e'::uuid, 'Arituba Empreendimento Turistico LTDA', '6143427473968', '(84) 3642-7000, (84) 99104-6968'),
  ('contato', 'bf6bfb95-5478-4abe-b078-4113c1c3830a'::uuid, 'Isabella - Pado (Ass. Construtoras)', '6098328789892', '(43) 3249-1170, (43) 99629-8722'),
  ('empresa', 'be9e8842-baf4-42a2-b4b1-a33639304145'::uuid, 'Macam Empreendimentos e Construções Ltda', '6143423203952', '(84) 3211-8640, (84) 99108-5312'),
  ('contato', '01065e45-08ab-454f-a42f-d772313fd8c4'::uuid, 'Marcel - Pedidos Engenharia Pormade', '6651533909274', '(42) 3521-2136, (42) 99934-8569'),
  ('contato', '8302ce5d-d05a-4dc8-9fc5-0778f2879ac4'::uuid, 'Marcelo - Contrel', '12286993157652', '(84) 99678-8343, (84) 99979-0483'),
  ('empresa', 'ad32c4d2-27b9-4554-9cef-a1104b410969'::uuid, 'Nacional Veículos e Serviços LTDA', '1116880192276', '(84) 4009-6115, (84) 4009-6161'),
  ('empresa', '2377ec39-bba0-4a5e-9d46-30be450a18ba'::uuid, 'Realize Construções e Serviços Ltda', '11169988073910', '(84) 99200-0600, (84) 99607-3310'),
  ('empresa', '3f8abe00-18df-4576-9cc0-337cef91125f'::uuid, 'M&D Comércio Serviços e Locações Eirelli EPP', '6701854543197', '(84) 3015-5483, (84) 3611-1500, (84) 98827-6214');


-- ---------------------------------------------------------------------------------------------
-- PASSO 2 — lê do banco o valor de ANTES, agora, e confere se nada mudou desde a conferência.
-- ---------------------------------------------------------------------------------------------
update public.backup_telefones_bitrix_20260909 b
   set telefone_antes = c.telefone
  from public.contatos c
 where b.tabela = 'contato' and b.registro_id = c.id;

update public.backup_telefones_bitrix_20260909 b
   set telefone_antes = cl.telefone
  from public.clientes cl
 where b.tabela = 'empresa' and b.registro_id = cl.id;

do $$
declare
  v_sumiram bigint;
  v_mudaram bigint;
begin
  select count(*) into v_sumiram from public.backup_telefones_bitrix_20260909
   where telefone_antes is null;
  if v_sumiram > 0 then
    raise exception 'PAREI: % linha(s) da lista não existem mais no banco. Nada foi alterado.', v_sumiram;
  end if;

  select count(*) into v_mudaram from public.backup_telefones_bitrix_20260909
   where telefone_antes is distinct from telefone_esperado;
  if v_mudaram > 0 then
    raise exception 'PAREI: % linha(s) mudaram de telefone depois da conferência. Nada foi alterado.', v_mudaram;
  end if;

  raise notice 'Conferido: % linhas prontas para o reparo.',
    (select count(*) from public.backup_telefones_bitrix_20260909);
end $$;


-- ---------------------------------------------------------------------------------------------
-- PASSO 3 — O REPARO.
--
-- O `and c.telefone = b.telefone_antes` é uma segunda trava: se algo mudar entre a conferência
-- do passo 2 e este comando, a linha simplesmente não é tocada, em vez de ser sobrescrita.
-- ---------------------------------------------------------------------------------------------
update public.contatos c
   set telefone = b.telefone_novo
  from public.backup_telefones_bitrix_20260909 b
 where b.tabela = 'contato' and b.registro_id = c.id and c.telefone = b.telefone_antes;

update public.clientes cl
   set telefone = b.telefone_novo
  from public.backup_telefones_bitrix_20260909 b
 where b.tabela = 'empresa' and b.registro_id = cl.id and cl.telefone = b.telefone_antes;


-- ---------------------------------------------------------------------------------------------
-- PASSO 4 — CONFERÊNCIA. Rode e leia antes de sair da tela.
-- ---------------------------------------------------------------------------------------------
select
  (select count(*) from public.backup_telefones_bitrix_20260909)                 as linhas_no_plano,
  (select count(*) from public.backup_telefones_bitrix_20260909 b
     join public.contatos c on c.id = b.registro_id
    where b.tabela='contato' and c.telefone = b.telefone_novo)                    as contatos_ja_corrigidos,
  (select count(*) from public.backup_telefones_bitrix_20260909 b
     join public.clientes cl on cl.id = b.registro_id
    where b.tabela='empresa' and cl.telefone = b.telefone_novo)                   as empresas_ja_corrigidas,
  (select count(*) from public.contatos c
     join public.usuarios u on u.id = c.usuario_id
    where u.empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
      and length(regexp_replace(c.telefone,'\D','','g')) = 13
      and left(regexp_replace(c.telefone,'\D','','g'),2) <> '55')                as contatos_ainda_estranhos,
  (select count(*) from public.clientes cl
     join public.usuarios u on u.id = cl.usuario_id
    where u.empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
      and length(regexp_replace(coalesce(cl.telefone,''),'\D','','g')) = 13
      and left(regexp_replace(coalesce(cl.telefone,''),'\D','','g'),2) <> '55')  as empresas_ainda_estranhas;

-- Esperado:
--   linhas_no_plano ............ 427
--   contatos_ja_corrigidos ..... 422
--   empresas_ja_corrigidas ..... 5
--   contatos_ainda_estranhos ... 0
--   empresas_ainda_estranhas ... 0

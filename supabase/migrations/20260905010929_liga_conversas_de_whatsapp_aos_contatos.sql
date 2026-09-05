-- ════════════════════════════════════════════════════════════════════════════
-- Liga 26 conversas de WhatsApp ao contato (e à empresa) que já estavam no CRM
-- ════════════════════════════════════════════════════════════════════════════
--
-- O DEFEITO. Até 27/08/2026 não existia tela que gravasse o vínculo entre uma conversa de
-- WhatsApp e a ficha do contato. A tela nasceu, mas o estoque ficou: quem já conversava com
-- gente cadastrada continuou aparecendo como desconhecido, e o painel "Dados do lead" — que só é
-- desenhado quando há contato ou cliente — nunca aparecia para essas pessoas.
--
-- MEDIDO EM PRODUÇÃO EM 04/09/2026, antes desta correção:
--
--   conversas de WhatsApp .................................... 1.021
--   ligadas a uma empresa-cliente ............................     16
--   ligadas a um contato .....................................      2
--   soltas ................................................... 1.005
--   soltas cujo telefone JÁ ESTÁ cadastrado em `contatos` ....     75
--
-- Das 75, esta correção toca só as 26 em que o telefone E o nome concordam: telefone que casa
-- com UMA pessoa só, e pelo menos DUAS palavras significativas em comum entre o nome da conversa
-- e o do contato. As outras 49 ficam para o convite que agora existe dentro do chat, porque:
--
--   29 casam o telefone mas só uma palavra do nome. Esse balde tem "Daniel" x "Daniel - FC
--      Imóveis" (certo) do lado de "João - Olinda" x "Adilson - Olinda" (errado: pessoas
--      diferentes no telefone da empresa), e nenhuma regra separa os dois;
--   17 casam o telefone e não têm nada em comum no nome;
--    1 tem o telefone apontando para duas pessoas (o Wagner, que atende por MF4 e por WGM).
--
-- 🔴 DUAS QUE PASSARIAM NA RÉGUA FORAM TIRADAS À MÃO, conferidas uma a uma pelo dono do produto
-- em 04/09/2026:
--
--   "Vanessa Andrade - Torre Forte" x "Humberto - Torre Forte" — as duas palavras em comum são o
--      nome da CONSTRUTORA, não o da pessoa. São pessoas diferentes no mesmo número da empresa.
--   "André - Atres Construtora" x "André - Atres Construtora" — o nome bate, mas o contato no CRM
--      está vinculado à construtora DIPEL, não à Atres. Ligar levaria a Dipel junto.
--
-- É a prova de que a régua não basta sozinha: ela é conservadora e ainda assim deixou passar um
-- casamento entre pessoas diferentes. Por isso a lista foi lida por gente antes de virar SQL.
--
-- O PIOR CASO SE ESTIVER ERRADO: uma conversa aponta para a ficha da pessoa errada. É visível (o
-- painel mostra nome e empresa) e agora é REVERSÍVEL PELA TELA — o botão "Desvincular" foi
-- entregue ANTES desta correção, de propósito, para não escrever no banco sem rota de saída.
-- Nenhuma mensagem é tocada, nenhum contato é criado nem apagado.
--
-- ─── reversibilidade ────────────────────────────────────────────────────────
--
-- A tabela de cópia abaixo guarda o estado anterior das linhas tocadas. Para desfazer TUDO:
--
--   update public.whatsapp_conversas v
--      set contato_id = b.contato_id_antes,
--          cliente_id = b.cliente_id_antes
--     from public.backup_vinculos_whatsapp_20260904 b
--    where v.id = b.conversa_id;
--
-- Manter a cópia por 30 dias e apagá-la só depois de o cliente confirmar no uso real (mesmo
-- critério do Passo 4 de docs/operacao/plano-reparo-datas.md).
--
-- ─── o que isto NÃO faz ─────────────────────────────────────────────────────
--
-- Não impede o problema de voltar — isso é trabalho do código, e já foi feito nos commits desta
-- mesma frente: o reconhecimento por telefone e por nome aparece dentro do chat, a chave passou a
-- aceitar campo com dois números, e dá para desvincular. Esta migration só limpa o estoque.
--
-- Efeito colateral conhecido: o gatilho `trg_whatsapp_conversas_updated_at` faz o `updated_at`
-- das linhas tocadas pular para a data de aplicação. `whatsapp_conversas` NÃO é coberta pelos
-- gatilhos de `historico_alteracoes`, então o registro desta correção é este comentário mais a
-- tabela de cópia.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Passo 0: a cópia de segurança. É a volta atrás; sem ela, a correção não começa. ──────────
create table if not exists public.backup_vinculos_whatsapp_20260904 (
  conversa_id       uuid primary key,
  contato_id_antes  uuid,
  cliente_id_antes  uuid,
  copiado_em        timestamptz not null default now()
);

-- Sem RLS a tabela ficaria legível por qualquer login: ela guarda ids de conversa de dois
-- clientes pagantes, e ninguém precisa lê-la pelo app. Sem política, ninguém lê.
alter table public.backup_vinculos_whatsapp_20260904 enable row level security;

-- ── Passo 1: guardar o estado anterior e aplicar ─────────────────────────────────────────────
do $$
declare
  v_alteradas int;
  v_ja_tinha  int;
begin
  create temporary table pares_do_mutirao (conversa_id uuid, contato_id uuid, cliente_id uuid)
  on commit drop;

  insert into pares_do_mutirao (conversa_id, contato_id, cliente_id) values
    ('38a43c49-546e-441e-a6eb-10aa8bcde92c', '3e20aa6a-9957-4980-801f-34d31f7d4194', null),   -- Danilo - Icone Engenharia
    ('f8131bec-f68b-4afd-96cf-0821133ad2c2', '9c583893-ae46-4830-8389-badd511e63ff', null),   -- Ednaldo - Andrade Marinho
    ('7396ed61-8c2e-46bc-af6d-3970b8311e11', '073d3391-8c45-4f84-8f7a-5acc4d884e2c', null),   -- Emmily Moraes
    ('3878cc08-6f78-4ae6-9a05-5ba272484017', 'c34e4e3d-23a6-4d8c-a55b-ad77280dc85d', null),   -- Erivan - Mendonca Junior
    ('4361afab-055f-4f53-ba30-a9dfaf7dba16', '8d14f384-dd15-46f6-a307-c6eccc84b473', '992d3235-fcfa-404a-9acf-fdbd342ef354'),   -- Fred - Repav
    ('0f27f39e-1ed2-4e12-ba9a-69bf6aaee76e', 'b3376d89-307e-4613-9c10-b7bf2ab6ca9f', null),   -- Genildo - Aldann
    ('499af5fe-2c42-4449-8366-c360e986a630', '38221015-a5d0-4bdf-b234-288ac00af2ac', null),   -- Gisele Simplicio
    ('92dd4e66-7c27-49bc-b288-391cd00cee83', 'e778aad4-0e55-4122-8e08-60c27250e4a0', null),   -- Humberto - Torre Forte
    ('0ebb0377-214b-4fb5-a9ed-b293684f985c', 'aff5763e-7cba-457b-bb9a-dd76161a7aeb', '0daf84e0-d5ee-4b9f-9af0-9f8c97b3cbfb'),   -- Igor - Macam
    ('4d5d1e77-72d2-4216-8631-6cf71589ed56', '93cfc00f-19af-4af9-a0a6-baec8fa10418', null),   -- Ilgner - Pormade
    ('4181ea2a-f09c-4089-a670-b16bc9771560', 'b0ff437c-6b8d-4130-abc9-fa70b3c84dc2', 'c4a38b84-e7f8-4480-9f7f-a6482dac7f32'),   -- Joao Maria - Azevedo e Coelho
    ('0c6fe5da-4676-4d05-95e2-342b5702510a', 'ae09e300-bbe0-4648-a280-2470f4fda3e8', '1f125718-0120-483a-87ae-21cbebb235ed'),   -- Julio Andres - ADL
    ('cc32cffa-d13a-443c-84da-47fad68e1756', '899304fe-6346-49ad-b1d0-ecc1c3ff662c', null),   -- Larissa - Plano Urbanismo
    ('2b951fd8-feb0-47db-8818-7e82cf7e56d4', 'bbaab3d3-9511-455a-9178-eeb27c391fbd', null),   -- Leon - Apian
    ('63337bfe-578f-4a53-a97a-9ab42f2637fc', '6fdbf083-5fc8-4350-8a35-cf3678aa9bc9', null),   -- Lima - Copagel
    ('4cb8aa6c-c009-4657-927a-bf3298cfd05e', '01bb51fb-4a3b-435c-9b37-3738b198c440', null),   -- Luan Freitas - Engpac
    ('533f9db4-a0f3-48cd-9398-acf4818d113e', 'f4ccc100-514b-42bd-875e-600c09ec8cc3', null),   -- Lucas Dutra - Macam
    ('6796eacf-303c-42a7-a6e3-bde464fb168f', '97f1210d-5d6f-4556-89bd-65a1d47d4cda', '30fa1736-37c5-4595-8a74-cd1746cf8963'),   -- Lucas Ferreira - MD Repres
    ('a2115c0c-3757-4551-b408-41c5063ee4c2', 'f340b654-7e4b-459e-89f8-da2a81359f37', '75399d74-dbf0-4c32-836a-3a0a61e86318'),   -- Gabriel Fernandes - Paiva Fernandes
    ('1003826c-69d4-4355-a31e-72a41a576429', 'c73ba373-41cd-4d44-870f-78cbe1337e6b', '59f5dfe8-220d-425a-9d33-a601d5598d97'),   -- Micael - Construtora Diogenes
    ('1d814a21-1180-42e2-9e8a-ca647524f230', 'df1cac2f-7094-4103-bc50-10049b368f0f', null),   -- Obra Prima Banho e Gourmet
    ('c1d39c18-550c-4486-b942-1bc7ba63edfd', 'dee160c6-4778-44f8-8634-89848790394f', 'a7b02469-078b-42c1-b9e3-26a539112607'),   -- Raphael Duarte - RD5
    ('ad217fe7-8301-4de3-86b6-d65fc385d71f', 'c8b9e210-cbed-4f5c-ada3-b0e3dba15e6c', null),   -- Sandro - Taschibra
    ('04f7d5eb-7ee5-47a9-8a74-023cc77ac8e5', 'ae02caed-5dcb-4e73-a48c-de5e8f78f0c9', null),   -- Suprimentos Vipetro
    ('e65a7920-ffc6-47d6-814e-f0b3165a7e98', '3e085bea-dc7e-4cc9-be24-ae96c71c77af', '190cfb0a-6181-4017-bdb9-813e5a08daa1'),   -- Ubiratan - Certa
    ('79382ce0-838f-4e58-a35c-81033f0e83cc', '3ea1c1bf-0ae2-4381-9be3-7c0f26c76cf8', 'd0a01116-105f-46d7-886b-ccd6494fbd8f')   -- Wagner - Projete
  ;

  -- 🔴 SÓ TOCA QUEM AINDA ESTÁ SOLTO. Se alguém tiver vinculado alguma destas conversas à mão
  -- entre a medição e a aplicação, a escolha da PESSOA vale mais que a desta lista.
  select count(*) into v_ja_tinha
    from pares_do_mutirao p
    join public.whatsapp_conversas v on v.id = p.conversa_id
   where v.contato_id is not null or v.cliente_id is not null;

  insert into public.backup_vinculos_whatsapp_20260904 (conversa_id, contato_id_antes, cliente_id_antes)
  select v.id, v.contato_id, v.cliente_id
    from pares_do_mutirao p
    join public.whatsapp_conversas v on v.id = p.conversa_id
   where v.contato_id is null and v.cliente_id is null
  on conflict (conversa_id) do nothing;

  update public.whatsapp_conversas v
     set contato_id = p.contato_id,
         -- `coalesce` porque o contato nem sempre tem empresa: nesses casos a conversa fica com a
         -- pessoa e sem cliente, que é o dado honesto — não inventamos empresa.
         cliente_id = coalesce(p.cliente_id, v.cliente_id)
    from pares_do_mutirao p
   where v.id = p.conversa_id
     and v.contato_id is null
     and v.cliente_id is null;
  get diagnostics v_alteradas = row_count;

  raise notice 'mutirao: % conversas ligadas; % ja tinham vinculo e ficaram como estavam',
    v_alteradas, v_ja_tinha;

  if v_alteradas + v_ja_tinha <> 26 then
    raise warning 'esperava 26 conversas no total e fechou em % — confira antes de seguir',
      v_alteradas + v_ja_tinha;
  end if;
end $$;

-- Confira depois de rodar:
--   select count(*) from whatsapp_conversas where contato_id is not null;  -- esperado: 28 (2 + 26)
--   select count(*) from backup_vinculos_whatsapp_20260904;                 -- esperado: 26

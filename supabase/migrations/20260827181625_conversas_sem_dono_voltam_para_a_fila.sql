-- Devolve à fila as conversas que ficaram INVISÍVEIS na caixa do WhatsApp.
--
-- ---------------------------------------------------------------- o defeito
--
-- A lista de conversas monta os grupos assim (`WhatsAppInbox.tsx`):
--
--   if (responsaveis.length === 0) {
--     if (precisaAssumir(c)) → "Não atribuídos"      // senão, CAI FORA DE TUDO
--   }
--
-- E `precisaAssumir` exige DUAS coisas: sem responsável **e** `precisa_atribuicao`.
-- Conversa sem responsável e com a marca baixa não entra em "Não atribuídos", nem em
-- "Atribuídos a mim", nem em "Outros atendentes" — some da tela. Só a busca acha, porque a
-- busca não passa por esse filtro.
--
-- Como elas chegam nesse estado (duas falhas que se somam, as duas corrigidas no mesmo
-- commit, em `supabase/functions/whatsapp-webhook/index.ts`):
--
--   1. CHAMADA DE VOZ recebida reabre a conversa (`arquivada: false`) e soma não lidas, mas
--      nunca levantava a marca. E fechar uma conversa REMOVE os responsáveis
--      (`trg_wa_conversa_remove_responsaveis_ao_fechar`) sem baixar a marca — então uma
--      chamada perdida numa conversa fechada produzia exatamente "sem responsável + marca
--      baixa + aberta".
--   2. MENSAGEM em conversa JÁ ABERTA não levantava a marca: o código só fazia isso quando
--      `existente.arquivada === true`. A falha 1 criava o estado e a 2 não resgatava.
--
-- ---------------------------------------------------------------- o que foi medido
--
-- Em 27/08/2026, antes desta migration: **17 conversas** nesse estado, somando **79 mensagens
-- não lidas**, em DOIS clientes pagantes:
--
--   JHS Representações  11 conversas · 69 não lidas
--   MD Representações    6 conversas · 10 não lidas  (instância "Atendimento MD Representações")
--
-- 16 das 17 tiveram mensagem enviada de FORA do CRM (respondida pelo celular), que é o padrão
-- que o Lucas identificou sozinho. 7 tiveram chamada de voz; em 3 a chamada é a última coisa
-- que aconteceu. O pior caso: 6 mensagens não lidas há 23 horas, com o cliente esperando.
--
-- ---------------------------------------------------------------- reversibilidade
--
-- Estas são as 17 linhas afetadas, para desfazer se necessário:
--
--   update whatsapp_conversas set precisa_atribuicao = false where id in (
--     '1b986ced-aec1-473d-8afa-04981b8d23d5','49124dc3-6531-4323-a9de-aeb47f5f49a6',
--     '4b2e5006-8369-4782-909c-152203ef459a','511d6ee5-4c00-4081-99e0-d3fcafe94d82',
--     '5141e636-ee2d-4a92-bea3-1fc68654c3f0','5d335b29-e49f-41d9-8542-c7831a39f699',
--     '5e54b1d7-800c-403c-827b-def9765d111f','7cfff3a7-4d64-4c7e-b2f3-25e41e496e00',
--     'a3117cce-f1f9-49ce-af89-81cb91597d8b','a5c05b9f-3476-494b-ab37-fd4853126363',
--     'b1463b55-5a96-4615-8b26-b36ee88625ea','c3ea76f8-e8ed-4241-8986-22c7feaa6a04',
--     'cc707c07-1447-4848-b14a-ee48aff84ef5','d319ed61-2b01-4c72-8922-fc133add862d',
--     'e19d1690-b8e8-42d6-a343-d50365d9b9f2','e535a09e-2adc-447b-9d81-297ff781f447',
--     'e65a7920-ffc6-47d6-814e-f0b3165a7e98');
--
-- Nada é apagado e nenhuma mensagem é tocada: só a marca sobe. O pior caso de estar errado é
-- uma conversa aparecer em "Não atribuídos" sem precisar — visível demais, nunca de menos.

update public.whatsapp_conversas c
   set precisa_atribuicao = true
 where c.arquivada is not true
   and c.precisa_atribuicao is not true
   and not exists (
     select 1 from public.whatsapp_conversa_responsaveis r
      where r.conversa_id = c.id
   );

-- ---------------------------------------------------------------- por que isto não basta
--
-- Esta migration conserta o ESTOQUE. O que impede o problema de voltar é a correção no
-- webhook (levantar a marca sempre que chegar algo numa conversa sem responsável, inclusive
-- chamada de voz) e a da tela (conversa sem responsável entra em "Não atribuídos" SEMPRE,
-- em vez de depender da marca para existir). As três coisas vão no mesmo commit.

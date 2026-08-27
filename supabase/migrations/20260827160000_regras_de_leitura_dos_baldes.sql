-- Passo 6 do plano dos baldes privados: trocar "qualquer identidade lê" por
-- "só quem é da empresa dona lê" — em `whatsapp-media` e `chat-files`.
--
-- `docs/operacao/plano-baldes-privados.md`
--
-- ---------------------------------------------------------------- por que AGORA, com o balde
-- ---------------------------------------------------------------- ainda público
--
-- De propósito. Enquanto `public = true`, o armazenamento PULA a autorização na porta
-- `/object/public/...` — medido em 27/08/2026 com um PDF real de 682 kB: 200 sem nenhuma
-- credencial, e 200 também na porta com identidade. Ou seja: **esta migração não fecha nada
-- sozinha, e por isso não pode quebrar nada.** Ela só deixa a regra pronta e correta para o
-- dia em que o balde virar privado (Passo 7).
--
-- Se a regra estiver errada, dá para descobrir e consertar enquanto o caminho antigo ainda
-- funciona e ninguém fica sem trabalhar. É a ordem que o plano defende.
--
-- ---------------------------------------------------------------- o que foi MEDIDO antes
--
-- Para cada empresa, quantos arquivos que ela REFERENCIA de verdade a regra nova esconderia:
--
--   whatsapp-media   JHS 873 · MD 3 · MD Representações 6.097   → SUMIRIAM: 0
--   chat-files       MD Representações 212                      → SUMIRIAM: 0
--
-- E o teste do outro lado — arquivo cuja PASTA declara uma empresa mas cujo REGISTRO prova
-- outra, que seria entregue para quem não deve:
--
--   whatsapp-media   6.974 objetos com registro, 6.974 batem, 0 divergem
--
-- `pedido-anexos` NÃO entra aqui: já ganhou `pedido_anexos_select` em 27/08/2026.
-- `avatars`, `branding` e `email-assets` ficam abertos por decisão registrada na §8 do plano.

-- ---------------------------------------------------------------- whatsapp-media
--
-- Dois formatos de caminho convivem, e a regra precisa dos dois ramos:
--
--   incoming/{empresa_id}/...   6.137 objetos — o que chega pelo webhook
--   {conversa_id}/...             969 objetos — o que a equipe envia pela tela
--
-- Os 52 restantes são de conversas que não existem mais. Não há dono possível: nenhuma regra
-- consegue atribuí-los, e eles ficam inacessíveis. Está registrado no plano como decisão
-- pendente (deixar ou apagar), não como esquecimento.

drop policy if exists "public_read_whatsapp_media" on storage.objects;

create policy "whatsapp_media_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (
    -- recebidas: a empresa está na segunda pasta
    ((storage.foldername(name))[1] = 'incoming'
      and (storage.foldername(name))[2] = (get_my_empresa_id())::text)
    -- enviadas: a primeira pasta é uma conversa, e a conversa é da minha empresa
    or exists (
      select 1 from public.whatsapp_conversas c
       where c.id::text = (storage.foldername(name))[1]
         and c.empresa_id = get_my_empresa_id()
    )
  )
);

-- ---------------------------------------------------------------- chat-files
--
-- A primeira pasta é o LOGIN de quem enviou (`usuarios.user_id`), não o id da empresa —
-- medido: 220 de 220. É por isso que a regra passa por `usuarios` em vez de comparar direto.
--
-- 🔴 `user_id` e `id` são identificadores DIFERENTES da mesma pessoa (CLAUDE.md §4.5).
-- Aqui é `user_id`, o do login. Trocar por `id` faria a regra recusar TODOS os 220 arquivos
-- sem erro nenhum — só uma tela vazia.
--
-- O recorte é por EMPRESA, não por pessoa: chat interno é da equipe, e o arquivo que um
-- colega mandou no grupo precisa abrir para os outros.

drop policy if exists "Public read access for chat files" on storage.objects;

create policy "chat_files_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-files'
  and exists (
    select 1 from public.usuarios u
     where u.user_id::text = (storage.foldername(name))[1]
       and u.empresa_id = get_my_empresa_id()
  )
);

-- ---------------------------------------------------------------- o que este arquivo NÃO faz
--
-- Não muda `storage.buckets.public`. Enquanto ele for `true`, a porta pública continua
-- servindo o arquivo a quem tiver o endereço, e estas regras seguem inertes para leitura.
-- Fechar é o Passo 7, e só depois de o contador `quedasDeArquivo.ver()` estar VAZIO sob uso
-- real — ver o plano.

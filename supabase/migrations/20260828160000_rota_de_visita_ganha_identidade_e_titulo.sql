-- A rota de visita ganha identidade própria e um título.
--
-- 🔴 O PROBLEMA. Até aqui a rota NÃO EXISTIA como coisa no banco: cada parada é uma linha de
-- `public.eventos`, e a rota era remontada no navegador agrupando por (dia, quem criou) —
-- `src/lib/rota-do-dia.ts:136`, chave `${dia}__${autor}`.
--
-- Duas consequências, e a segunda é a que morde:
--
--   1. não havia onde guardar um título; o cabeçalho do cartão é a data formatada na hora
--      (`VisitasObrasPainel.tsx:163`);
--   2. **duas rotas criadas no mesmo dia pela mesma pessoa viravam UMA SÓ na tela.** O
--      vendedor que planeja a manhã na Zona Norte e a tarde na Zona Sul via um amontoado, com
--      o traçado ligando os dois lados da cidade.
--
-- 🔴 POR QUE NÃO DEU PARA USAR O `grupo_id` QUE JÁ EXISTE. Ele parece a resposta óbvia e não
-- é: em `useCreateRotaVisita` (`src/hooks/use-eventos.ts:410`) o `grupo_id` é gerado **por
-- PARADA**, não pela rota. Ele agrupa as cópias de uma mesma parada — uma linha por
-- participante convidado —, que é outro problema. Reaproveitá-lo quebraria os convites.
--
-- Por isso duas colunas novas, e não uma tabela: a rota continua sendo o conjunto de linhas de
-- `eventos`, só que agora com nome e sobrenome.

alter table public.eventos
  -- Todas as paradas de uma rota compartilham este valor. É ele que passa a definir "uma
  -- rota", no lugar do par (dia, autor).
  add column if not exists rota_id uuid,
  -- O título que a pessoa escreveu. Fica repetido em todas as paradas da rota, de propósito:
  -- é o mesmo desenho do `grupo_id`, evita uma tabela só para um texto, e a leitura da tela
  -- (que já traz as paradas) não ganha nenhuma junção.
  add column if not exists rota_titulo text;

comment on column public.eventos.rota_id is
  'Identidade da rota de visita: todas as paradas da mesma rota compartilham. NULO nas linhas '
  'anteriores a 28/08/2026 e em todo evento que não é rota — nesses casos a tela cai no '
  'agrupamento antigo por (dia, criador). Não confundir com `grupo_id`, que agrupa as cópias '
  'de UMA parada, uma por participante.';

comment on column public.eventos.rota_titulo is
  'Título livre da rota, repetido em todas as paradas dela. Nulo ou vazio = a tela mostra só a '
  'data, como antes de 28/08/2026.';

-- A tela pede as paradas de uma rota pelo `rota_id`. Parcial porque a coluna é nula na imensa
-- maioria das linhas (todo evento de calendário comum), e índice parcial não paga por elas.
create index if not exists idx_eventos_rota_id
  on public.eventos (rota_id)
  where rota_id is not null;

-- 🔴 SEM BACKFILL, E É DECISÃO. Dava para inventar um `rota_id` por (dia, autor) para as
-- linhas antigas, e seria errado: isso CONGELARIA a fusão que esta migration existe para
-- desfazer — duas rotas antigas do mesmo dia ficariam para sempre com o mesmo id, agora
-- gravado no banco em vez de deduzido. Deixando nulo, a tela usa o agrupamento antigo para o
-- que é antigo e a identidade real para o que nasce daqui em diante, e nada é perdido.
--
-- Nenhuma política de segurança muda: as colunas nascem dentro de `eventos`, que já tem RLS
-- por empresa, e ninguém ganha acesso a linha nenhuma que já não tivesse.

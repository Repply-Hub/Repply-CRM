-- Religa o tempo real do chat interno e do sininho.
--
-- O QUE ACONTECIA (medido em 14/09/2026): mensagem nova do chat NÃO aparecia sozinha na
-- tela — só depois de recarregar. Teste com duas abas abertas no Geral da empresa de
-- demonstração: a aba que enviou mostrou a mensagem; a outra ficou vazia por 15 segundos e só
-- mostrou depois de recarregar.
--
-- POR QUÊ: o Supabase só avisa a tela (`postgres_changes`) das tabelas que estão na
-- publicação `supabase_realtime`. As migrations as colocaram lá — `notificacoes` em
-- 20260306172407, `chat_mensagens` em 20260413194106, `chat_grupos` e `chat_grupo_membros` em
-- 20260413210826 — e nenhuma migration as retira. Mesmo assim, em produção nenhuma das quatro
-- estava na publicação: saíram por fora do repositório. A saída foi seletiva — as tabelas de
-- WhatsApp, de e-mail e as de leitura (`*_leituras`) continuaram lá.
--
-- `chat_geral_config` nunca foi colocada por migration, mas `src/hooks/use-chat.ts` a assina
-- ao vivo; entra junto para a tela não depender de recarregar também ali.
--
-- NADA É APAGADO NEM ALTERADO: só volta a haver aviso quando uma linha dessas tabelas muda. A
-- RLS de cada tabela continua valendo para quem recebe o aviso.
--
-- Cada inclusão é guardada: rodar este arquivo duas vezes não falha nem duplica.

-- `alter publication … add table` pede trava na tabela. Sem teto de espera, uma leitura longa
-- em `chat_mensagens` deixaria o comando na fila e, atrás dele, toda mensagem nova. Estourar
-- os 3 s vira falha visível desta mudança — a repetir —, nunca mensagem presa.
set lock_timeout = '3s';

do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise warning '[tempo real] publicação supabase_realtime não existe: nada foi religado';
    return;
  end if;

  foreach v_tabela in array array['chat_mensagens', 'chat_grupos', 'chat_grupo_membros', 'notificacoes', 'chat_geral_config']
  loop
    if to_regclass('public.' || v_tabela) is null then
      raise warning '[tempo real] tabela public.% não existe: pulada', v_tabela;
      continue;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end $$;

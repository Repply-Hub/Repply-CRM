-- `empresa_tem_secao_de(p_empresa_id, p_secao)` — a mesma pergunta, para quem não tem sessão
--
-- POR QUE PRECISA EXISTIR: `empresa_tem_secao(p_secao)` resolve a empresa por
-- `get_my_empresa_id()`, que lê a sessão autenticada. Serve para o app e para as políticas
-- de RLS, onde sempre há um usuário. Não serve para rotina agendada.
--
-- O caso concreto que motivou: `eventos-lembrete` roda a cada 5 minutos com
-- `service_role`, varre a tabela `eventos` de TODAS as empresas e insere notificação de
-- lembrete. Sem esta função, uma empresa que teve o Calendário desligado continuaria
-- recebendo "🔔 Lembrete: reunião X" de eventos que ninguém consegue mais abrir — a rota
-- recusa e o item sumiu do menu, mas o sininho toca.
--
-- Chamar `empresa_tem_secao` de lá seria pior que não chamar: com chave de serviço não há
-- sessão, `get_my_empresa_id()` devolve nulo, nenhum ramo casa e a função responde o padrão
-- — ou seja, liberaria todo mundo, dando a impressão de que a checagem existe.
--
-- A precedência é EXATAMENTE a mesma da irmã (exceção → preset → ligada). Se um dia uma
-- mudar, a outra tem de mudar junto — é o preço de existirem duas, e é menor que o preço de
-- uma rotina agendada não conseguir perguntar.

create or replace function public.empresa_tem_secao_de(p_empresa_id uuid, p_secao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select x.habilitada
       from secao_excecoes x
      where x.empresa_id = p_empresa_id
        and x.secao = p_secao),

    (select i.habilitada
       from secao_preset_itens i
      where i.secao = p_secao
        and i.preset_id = coalesce(
              (select e.secao_preset_id from empresas e where e.id = p_empresa_id),
              (select p.id from secao_presets p where p.is_padrao limit 1))),

    true
  );
$$;

-- Só quem roda no servidor precisa dela. O app usa a irmã, que resolve a empresa sozinha —
-- expor esta ao navegador deixaria qualquer usuário logado perguntar pelas seções de
-- QUALQUER empresa, o que não vaza dado mas entrega o desenho comercial da Repply.
revoke all on function public.empresa_tem_secao_de(uuid, text) from public, anon, authenticated;
grant execute on function public.empresa_tem_secao_de(uuid, text) to service_role;

-- Rota de visita a obras: uma "visita" é um evento de calendário comum
-- (public.eventos) marcado com a obra visitada, se já aconteceu e uma
-- observação de campo. Não é uma tabela nova — é assim que cada parada de
-- uma rota vira, ao mesmo tempo, um evento no calendário e uma linha no
-- histórico da obra, sem duplicar dado.
--
-- obra_id: qual obra essa linha de evento representa. Nullable porque a
--   imensa maioria dos eventos (reunião, tarefa, etc.) não é visita a obra.
-- visita_realizada: confirmação manual do usuário, não deduzida pela data —
--   uma visita agendada pode não acontecer, e uma visita pode ser registrada
--   depois de já ter ocorrido. Decisão de produto tomada com o Lucas em
--   25/08/2026.
-- visita_observacao: o que o vendedor viu/registrou na visita. Campo
--   separado de `descricao` (que é o motivo/pauta escrito ao agendar) para
--   não sobrescrever a intenção original do evento com o relato posterior.
alter table public.eventos
  add column obra_id uuid references public.obras(id) on delete set null,
  add column visita_realizada boolean not null default false,
  add column visita_observacao text;

create index idx_eventos_obra_id on public.eventos (obra_id) where obra_id is not null;

-- Nenhuma política de RLS nova é necessária. A decisão de produto é que toda
-- visita é sempre visível para a empresa inteira — e a policy eventos_select
-- (20260806110000_eventos_empresa_visivel_para_todos.sql) já libera SELECT
-- para todo mundo da mesma empresa quando tipo_calendario = 'empresa'; o
-- frontend sempre cria visita com esse tipo, então a visibilidade já sai
-- correta sem tocar em nenhuma policy. UPDATE/DELETE continuam restritos a
-- quem criou o evento (user_id/criado_por) — a mesma regra de hoje já cobre
-- "só quem registrou marca como realizada".

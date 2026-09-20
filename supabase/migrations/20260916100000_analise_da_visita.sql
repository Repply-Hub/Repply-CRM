-- A análise da visita, ao lado do que a visita já guardava (`visita_realizada`,
-- `visita_observacao`, da migration 20260825170000_visitas_obra.sql).
--
-- Por que em `eventos` e não em tabela nova: a parada de rota É um evento de calendário, e a
-- gravação já acontece por `grupo_id` — o grupo inteiro de uma vez, alcançando a cópia de cada
-- participante. Tabela à parte exigiria repetir esse cuidado em outro lugar.
--
-- Sem CHECK na fase de propósito: a lista de fases é vocabulário do ramo e vive no código
-- (`src/lib/analise-da-visita.ts`). Uma trava no banco transformaria "acrescentar uma fase" em
-- migration, e migration não se edita depois.
alter table public.eventos
  add column if not exists visita_fase text,
  add column if not exists visita_concorrentes text,
  add column if not exists visita_contato_id uuid references public.contatos(id) on delete set null,
  add column if not exists visita_proximo_passo text,
  add column if not exists visita_proximo_passo_em date;

comment on column public.eventos.visita_fase is 'Fase da obra vista na visita (fundacao, estrutura, alvenaria, instalacoes, acabamento, entrega).';
comment on column public.eventos.visita_concorrentes is 'Produto ou marca de concorrente visto na obra.';
comment on column public.eventos.visita_proximo_passo is 'O que ficou combinado na visita; vira tarefa quando tem data.';

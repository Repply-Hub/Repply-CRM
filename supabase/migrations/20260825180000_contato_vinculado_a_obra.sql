-- Um contato da construtora pode ser vinculado a uma obra específica dela
-- (ex.: o engenheiro responsável por UM canteiro, não pela empresa toda).
-- Vínculo opcional e com uma obra só — não é lista, é "este contato fala
-- sobre esta obra" quando fizer sentido; sem vínculo continua valendo para
-- a empresa inteira, como hoje.
--
-- Sem checagem cruzada garantindo que a obra escolhida pertence ao mesmo
-- cliente do contato: `contatos` hoje liga ao cliente por `cliente_id`
-- (nem sempre preenchido — a tela de cadastro atual grava `empresa` em
-- texto) ou por `obras.cliente_id`. Checar isso em constraint exigiria uma
-- trigger comparando duas tabelas; o filtro fica na tela, que já restringe
-- o seletor às obras do cliente sendo editado.
alter table public.contatos
  add column obra_id uuid references public.obras(id) on delete set null;

create index idx_contatos_obra_id on public.contatos (obra_id) where obra_id is not null;

-- Nenhuma política de RLS nova é necessária: contatos_select/insert/update já
-- filtram por usuario_in_my_empresa(usuario_id), que não depende da obra.

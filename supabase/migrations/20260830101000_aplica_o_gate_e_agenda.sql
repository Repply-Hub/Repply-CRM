-- Roda o gerador uma vez (fecha o cerco hoje) e agenda a conferência diária.
--
-- A rotina existe para a tabela criada AMANHÃ: ela nasce sem gate, e às 3h50 da manhã seguinte
-- passa a ter. O teste de vitest (src/test/gate-de-plano.test.ts) avisa antes disso, no build —
-- as duas camadas se cobrem: o teste pega cedo, a rotina não depende de ninguém lembrar.
--
-- Horário escolhido para não colidir com as faxinas já agendadas (3h10, 3h20 e 3h40 estão
-- ocupadas por outras rotinas; 3h50 está livre).
select public.aplicar_gate_de_plano();

select cron.schedule(
  'gate-de-plano-conferencia-diaria',
  '50 3 * * *',
  $$ select public.aplicar_gate_de_plano() $$
);

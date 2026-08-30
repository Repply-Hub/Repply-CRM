-- Agenda a régua de cobrança. Autorizado pelo Lucas em 30/08/2026.
--
-- 🔴 É ESTE ARQUIVO QUE FAZ E-MAIL COMEÇAR A SAIR PARA CLIENTE. Tudo o mais da etapa 4 é
-- inerte sem ele: a função estava publicada e testada há dias, e não mandava nada porque
-- ninguém a chamava.
--
-- 8h da manhã (11h UTC): cedo o bastante para a pessoa ver no começo do dia de trabalho,
-- tarde o bastante para não chegar de madrugada. As faxinas ocupam 3h10, 3h20, 3h40 e 3h50;
-- o resumo da pauta sai às 10h UTC. 11h não colide com nada.
--
-- 🔴 A ROTINA É IDEMPOTENTE, e é isso que torna seguro agendá-la. `assinatura_avisos` tem
-- chave única por (empresa, dia da régua), então rodar duas vezes no mesmo dia não reenvia
-- e-mail nenhum. Importa porque o cron pode disparar de novo depois de falha de rede, e
-- porque alguém pode chamá-la à mão para testar.
--
-- Conferido antes de agendar: o caminho de e-mail funciona. A rotina `pauta-resumo-diario`
-- usa a MESMA chave do Resend e o MESMO remetente padrão
-- (`EMAIL_REMETENTE`, com `Repply <nao-responda@repplyhub.com.br>` de reserva), e entregou
-- 7 e-mails sem erro em 26/08/2026.
select cron.schedule(
  'cobranca-regua-diaria',
  '0 11 * * *',
  $$ select public.chamar_edge_function('cobranca-regua', '{}'::jsonb, 120000, true) $$
);

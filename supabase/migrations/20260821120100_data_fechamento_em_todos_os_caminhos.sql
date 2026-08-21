-- ============================================================================
-- DATA DE FECHAMENTO CARIMBADA EM TODOS OS CAMINHOS
-- ============================================================================
-- A tela mostra "Data de Fechamento" e lê a coluna `prazo_resposta`. Quem carimba
-- data hoje são DOIS pontos do frontend, e só quando o negócio é GANHO. Resultado
-- medido na produção: perder um negócio não registra o dia da perda; salvar a ficha
-- de um negócio já ganho com o campo em branco APAGA a data (src/hooks/use-edit-pedido.ts:75);
-- e um negócio ganho em 19/08 chegou a aparecer como fechado em 18/06, dois meses
-- antes de existir.
--
-- POR QUE A REGRA MORA NO BANCO E NÃO NA TELA
-- Hoje existem SEIS caminhos que mudam o status de um negócio:
--   1. arrastar o cartão no kanban        (src/hooks/use-pedidos.ts)
--   2. ação em massa na lista             (src/hooks/use-pedidos.ts)
--   3. formulário de edição               (src/hooks/use-edit-pedido.ts)
--   4. cadastro de negócio novo           (src/hooks/use-novo-pedido.ts)
--   5. importação de planilha             (src/hooks/use-bulk-import.ts)
--   6. excluir uma etapa do kanban, que move os negócios em massa para outra etapa
--      (src/hooks/use-kanban-colunas.ts)
-- Só 2 dos 6 carimbam data. O caminho 6 é a prova do problema: ninguém lembra que ele
-- existe quando pensa em "fechar um negócio", e ele pode marcar centenas de negócios
-- como ganhos de uma vez, todos sem data. Manter a mesma regra escrita em seis lugares
-- e sincronizada para sempre não funciona — e o sétimo caminho que alguém criar amanhã
-- vai nascer errado, em silêncio, como o sexto nasceu.
-- Todos os seis, sem exceção, passam por este gatilho. É o funil natural da regra, e é
-- o único lugar em que a data vem do relógio do servidor em vez do relógio do
-- computador de cada vendedor.
--
-- A REGRA, EXATAMENTE
--   INSERT com status final e prazo_resposta em branco  -> carimba hoje
--   UPDATE que MUDA o status para 'fechamento'/'perdido':
--       - se o mesmo salvamento também mexeu na data, RESPEITA o que o usuário digitou
--       - senão, carimba hoje
--   UPDATE que devolve o negócio para uma etapa aberta -> NÃO mexe na data
--       (decisão do Lucas: a data antiga fica como histórico. É seguro, porque o
--        faturamento também exige status de ganho — negócio reaberto não conta como
--        venda de jeito nenhum; só a data sobra registrada.)
--   Rede de segurança final: negócio em etapa final não pode ficar sem data. Ponto.
--       É isso que impede o bug do formulário de edição de apagar a data de um negócio
--       ganho — e, depois da migration 20260821120000, apagar essa data é o mesmo que
--       fazer a venda sumir do Faturamento Total e do Plano de Vendas sem avisar
--       ninguém.
--
-- `fechado_em` continua sendo mantida exatamente como era, para não quebrar nada que
-- ainda a leia. O nome da função ficou pequeno para o que ela faz agora (manda nas
-- duas colunas), mas renomear obrigaria a recriar o gatilho sem ganho nenhum.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_set_pedido_fechado_em()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  -- prazo_resposta é DATE e fechado_em é TIMESTAMPTZ. O banco roda com fuso UTC, então
  -- current_date vira o dia SEGUINTE a partir das 21h de Brasília — um negócio fechado
  -- às 21h30 de 31/agosto seria carimbado em 1º/setembro e cairia na meta do mês errado.
  -- Por isso o dia sai convertido para o fuso do Brasil, não do servidor.
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('fechamento', 'perdido') THEN
      NEW.fechado_em := now();
      -- Negócio que já nasce fechado (venda registrada depois do fato, ou linha de
      -- planilha importada) sem data preenchida: melhor a data de hoje do que nenhuma,
      -- porque sem data ele fica invisível em qualquer relatório por fechamento.
      IF NEW.prazo_resposta IS NULL THEN
        NEW.prazo_resposta := v_hoje;
      END IF;
    END IF;

  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('fechamento', 'perdido') THEN
      NEW.fechado_em := now();
      -- Se o MESMO salvamento também mexeu na data, quem manda é o usuário: ele pode
      -- estar registrando hoje uma venda que fechou semana passada. Só carimba quando
      -- ele não disse nada sobre a data.
      IF NEW.prazo_resposta IS NOT DISTINCT FROM OLD.prazo_resposta THEN
        NEW.prazo_resposta := v_hoje;
      END IF;
    ELSE
      -- Negócio reaberto (voltou de uma etapa final pra uma etapa aberta): o registro
      -- de "quando fechou" deixa de fazer sentido até fechar de novo.
      NEW.fechado_em := NULL;
      -- prazo_resposta, ao contrário, é MANTIDA de propósito (decisão do Lucas): ela
      -- vira o histórico de quando aquele negócio tinha sido fechado da última vez.
    END IF;
  END IF;

  -- Rede de segurança, valendo para qualquer INSERT ou UPDATE, tenha o status mudado
  -- ou não. É o que fecha o buraco do formulário de edição, que grava
  -- `prazo_resposta: payload.prazo_resposta || null` (src/hooks/use-edit-pedido.ts:75)
  -- e apaga a data de um negócio já ganho quando o campo é salvo em branco.
  IF NEW.status IN ('fechamento', 'perdido') AND NEW.prazo_resposta IS NULL THEN
    NEW.prazo_resposta := v_hoje;
  END IF;

  RETURN NEW;
END;
$$;

-- O gatilho trg_pedidos_set_fechado_em (BEFORE INSERT OR UPDATE em `pedidos`, criado em
-- 20260811110000) continua o mesmo e já aponta para esta função — não precisa ser
-- recriado, só a função mudou de conteúdo.


-- ============================================================================
-- ATENÇÃO PARA A PRÓXIMA IMPORTAÇÃO DE PLANILHA (não é conserto de banco)
-- ============================================================================
-- A rede de segurança acima carimba o DIA DA IMPORTAÇÃO em toda linha que chegar em
-- etapa final sem data de fechamento na planilha. Foi exatamente assim que a coluna
-- `fechado_em` ficou envenenada: 11.653 negócios com carimbo de 18/08/2026 e 62 de
-- 19/08/2026, que são só os dias em que a importação rodou.
--
-- A importação de hoje escapa disso por sorte: src/components/pedidos/ImportPedidosDialog.tsx
-- já usa a data de criação como substituta quando falta a data de fechamento — mas SÓ
-- para negócio ganho. Linha perdida sem data na planilha vai chegar aqui com NULL e sair
-- carimbada com o dia da importação.
-- Antes da próxima migração de planilha, esse substituto precisa valer também para
-- 'perdido'. É arquivo de tela, não de banco — está fora desta migration de propósito.
-- ============================================================================


-- ============================================================================
-- REPARO DOS DADOS HISTÓRICOS — NÃO EXECUTADO. DEPENDE DE AUTORIZAÇÃO DO LUCAS.
-- ============================================================================
-- Nada abaixo desta linha roda. São os comandos prontos para o dia em que o Lucas
-- decidir mexer no histórico, com o diagnóstico ao lado para ele conferir antes.
-- Medido em 21/08/2026, na produção.
--
-- ----------------------------------------------------------------------------
-- (A) Data de fechamento ANTERIOR à de criação — NÃO É DEFEITO. NÃO REPARAR.
-- ----------------------------------------------------------------------------
-- São 447 negócios encerrados (R$ 6.879.618,26) cuja data de fechamento é anterior
-- à data de criação. Numa primeira leitura parece corrupção de dado. NÃO É.
--
-- O Lucas explicou a origem, e ela é uma regra do ofício: no fecha-mês, na correria,
-- o pedido vendido no último dia útil só é cadastrado no primeiro dia útil do mês
-- seguinte. Quem cadastra então corrige a data de fechamento para o mês anterior,
-- porque a venda foi mesmo do mês anterior — só o cadastro atrasou. Isso não é
-- particularidade da MD: acontece em escritório de representação em geral.
--
-- Os números confirmam a assinatura desse comportamento (medido em 21/08/2026):
--   defasagem de 1 a 3 dias .... 104 negócios — 95 deles criados até o dia 5 do mês
--                                E fechados do dia 25 em diante. É o fecha-mês puro.
--   defasagem de 4 a 7 dias ....  47 negócios — 37 criados até o dia 5.
--   defasagem de 8 a 15 dias ...  74 negócios — 47 fechados do dia 25 em diante.
--   mais de 15 dias ............ 222 negócios — só 41 criados até o dia 5. Este grupo
--                                NÃO tem a assinatura de fecha-mês; é atraso de
--                                cadastro por outro motivo, corrigido à mão do mesmo
--                                jeito. Continua sendo dado correto.
--
-- CONSEQUÊNCIA PARA QUEM MEXER NESTE CÓDIGO:
--   1. NUNCA rode um UPDATE em massa "consertando" prazo_resposta para data_pedido.
--      Isso destruiria a data verdadeira da venda em quase 450 negócios e moveria
--      R$ 6,88 milhões para os meses errados — o oposto do que se pretende.
--   2. NUNCA acrescente CHECK ou validação de formulário exigindo
--      prazo_resposta >= data_pedido. O usuário PRECISA dessa autonomia: informar
--      uma data de fechamento anterior à de criação é uso legítimo e frequente.
--      Esta migration foi escrita de propósito sem nenhuma trava desse tipo, e o
--      gatilho acima respeita a data que o usuário digitar.
--   3. Um relatório que queira medir "atraso de cadastro" pode usar
--      (data_pedido - prazo_resposta) — mas como indicador de processo, nunca
--      como lista de erros a corrigir.
--
-- ----------------------------------------------------------------------------
-- (B) 2 negócios em etapa final sem nenhuma data de fechamento
-- ----------------------------------------------------------------------------
-- Depois da migration acima nenhum negócio novo consegue mais ficar assim, mas estes
-- dois já existem e só seriam corrigidos no dia em que alguém salvasse a ficha deles.
-- Enquanto isso, ficam invisíveis em qualquer relatório por data de fechamento.
--
-- Diagnóstico:
-- SELECT p.id, p.nome_negocio, p.status, p.data_pedido, p.prazo_resposta, p.fechado_em
-- FROM public.pedidos p
-- WHERE p.status IN ('fechamento', 'perdido') AND p.prazo_resposta IS NULL;
--
-- Reparo proposto — usa a data em que o negócio realmente entrou na etapa final,
-- registrada no histórico de status; se não houver registro, cai na data de criação:
-- UPDATE public.pedidos p
-- SET prazo_resposta = COALESCE(
--   (
--     SELECT h.created_at::date
--     FROM public.pedidos_historico_status h
--     WHERE h.pedido_id = p.id AND h.status_novo IN ('fechamento', 'perdido')
--     ORDER BY h.created_at ASC
--     LIMIT 1
--   ),
--   p.data_pedido
-- )
-- WHERE p.status IN ('fechamento', 'perdido') AND p.prazo_resposta IS NULL;
--
-- ----------------------------------------------------------------------------
-- (C) `fechado_em` continua envenenada e NÃO é reparada aqui
-- ----------------------------------------------------------------------------
-- 11.715 linhas preenchidas com apenas DUAS datas distintas (18 e 19/08/2026, os dias
-- da importação). Nenhuma tela lê essa coluna hoje, então ela não está machucando
-- ninguém — e daqui para frente ela passa a ser confiável para tudo que for fechado
-- dentro do sistema. Reparar o passado dela exigiria reescrever 11 mil linhas para
-- alimentar zero telas. Só vale a pena se alguém decidir usar a coluna de novo.

-- Duas funções atravessavam a parede entre empresas. Encontradas em 29/08/2026, durante o
-- levantamento da nova regra de cobrança — nenhuma das duas tem a ver com cobrança.
--
-- As duas são SECURITY DEFINER, ou seja, rodam com privilégio de dono e a RLS NÃO é
-- avaliada. Numa função dessas, o filtro de inquilino não é opcional: é a única parede que
-- existe. Nas duas ele faltava.
--
-- Medido em produção antes da correção: 15 pessoas, espalhadas por 9 empresas, passavam na
-- checagem de papel das duas.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. 🔴 delete_obras_bulk apagava obra de QUALQUER empresa
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- O corpo conferia só o PAPEL de quem chama ('gestor', 'admin', 'empresa') — em qualquer
-- empresa — e então executava:
--
--     DELETE FROM public.obras WHERE id = ANY(obra_ids);
--
-- Sem uma palavra sobre a empresa dona da obra. Bastava conhecer o identificador da obra
-- alheia. A regra `obras_delete`, que existe e faz a checagem certa, não era nem consultada:
-- SECURITY DEFINER passa por cima dela.
--
-- O filtro abaixo é a MESMA cláusula da política `obras_delete` (a obra pertence a um cliente
-- de alguém da minha empresa). Copiar a política em vez de inventar um filtro novo é de
-- propósito: se um dia a regra de quem enxerga obra mudar, os dois lugares têm de mudar
-- juntos, e é mais fácil perceber que são iguais do que descobrir que são parecidos.
--
-- ⚠️ MUDANÇA DE COMPORTAMENTO, e é a desejada: o ADMIN GLOBAL deixa de conseguir apagar obra
-- de cliente por aqui. `usuario_in_my_empresa` compara com a empresa de quem chama, e o admin
-- global não tem empresa — então a comparação é falsa para ele. Isso alinha esta função com a
-- decisão já tomada em 20260804195019_admin_geral_sem_acesso_ao_conteudo_dos_clientes.sql,
-- que tirou do admin o acesso ao conteúdo dos clientes. A função era a última porta que ainda
-- não tinha sido fechada.
--
-- 🔴 OBRA DE OUTRA EMPRESA PASSA A SER IGNORADA EM SILÊNCIO, não a derrubar a chamada inteira.
-- Um `RAISE EXCEPTION` ao encontrar id alheio seria pior de duas formas: desfaria a exclusão
-- legítima das outras obras da mesma seleção, e responderia "esta obra é de outra empresa" —
-- confirmando para quem sondou que aquele identificador existe. Ignorar não conta nada e não
-- estraga o resto.

CREATE OR REPLACE FUNCTION public.delete_obras_bulk(obra_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mesmo conjunto de papéis de antes: `is_gestor()` é verdadeiro para gestor, admin e
  -- empresa — idêntico à lista que estava escrita à mão aqui.
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado: Você não tem permissão para excluir obras.';
  END IF;

  DELETE FROM public.obras o
  WHERE o.id = ANY(obra_ids)
    AND EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = o.cliente_id
        AND public.usuario_in_my_empresa(c.usuario_id)
    );
END;
$$;

COMMENT ON FUNCTION public.delete_obras_bulk(uuid[]) IS
  'Apaga obras em lote. Só alcança obras da empresa de quem chama — id de outra empresa é '
  'ignorado em silêncio. Filtro idêntico ao da política obras_delete.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. 🔴 set_whatsapp_assinar_remetente_global: o gestor de um cliente mudava TODOS
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Aqui o `UPDATE ... SET ... ` sem WHERE é PROPOSITAL — a função existe para aplicar a
-- preferência às 9 empresas de uma vez, e a migration 20260715120000 diz isso com todas as
-- letras. O defeito nunca foi o alcance: foi QUEM podia disparar.
--
-- A checagem era `is_admin() OR is_gestor()`. O comentário original conta de onde veio:
-- "mesmo padrão de gate usado em configuracoes_automacao". E aí está o erro — o padrão foi
-- copiado de um contexto POR EMPRESA para um contexto GLOBAL. Num gate por empresa,
-- `is_gestor()` está certo: o gestor mexe na própria casa. Numa função que escreve em todas,
-- ele passa a mexer na casa dos outros.
--
-- Na prática: o gestor da JHS clicava num botão nas configurações dele e mudava o WhatsApp da
-- MD Representações. A tela ainda confirmava, com todas as letras, "Preferência aplicada a
-- todas as empresas" — ou seja, quem clicasse descobria o poder que tinha.
--
-- Só `is_admin()` agora. `is_gestor()` é verdadeiro para admin também, então o admin global
-- continua podendo — nada muda para quem devia poder.
--
-- ⚠️ Isto NÃO decide se a preferência deveria ser global ou por empresa. Ela continua global,
-- exatamente como está hoje (as 9 empresas com o valor `true`, medido antes desta migration).
-- A pergunta de produto está com o Lucas; esta migration só fecha a porta enquanto isso, e
-- não atrapalha nenhuma das duas respostas.

CREATE OR REPLACE FUNCTION public.set_whatsapp_assinar_remetente_global(p_valor boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode alterar a preferência de assinatura do WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.empresas
    SET whatsapp_assinar_remetente = p_valor;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

COMMENT ON FUNCTION public.set_whatsapp_assinar_remetente_global(boolean) IS
  'Aplica a preferência de assinar remetente a TODAS as empresas. Só o admin global. '
  'O alcance global é proposital (ver 20260715120000); o que mudou em 29/08/2026 foi a '
  'permissão, que aceitava is_gestor() e deixava o gestor de um cliente mexer em todos.';

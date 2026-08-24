-- ============================================================================
-- Fase 0 do multi-responsável: uma regra de 04/05/2026 anulava todas as outras
-- ============================================================================
--
-- Plano completo: docs/operacao/plano-multi-responsavel.md §4.2 e §4.3.
--
-- O QUE ESTAVA ERRADO
--
-- A política `Acesso pedidos empresa` (origem em
-- 20260504172116_d58aba56-3ac8-4d4c-8aeb-e14b7af32eb9.sql:93) é `FOR ALL`, para `PUBLIC`, e
-- diz apenas "o negócio pertence a alguém da minha empresa". Sem `WITH CHECK` — e quando o
-- `WITH CHECK` falta, o Postgres reaproveita o `USING` também na escrita.
--
-- As políticas granulares de abril (20260413223933, 20260416174744, 20260424024022) dizem o
-- certo: só o dono e o gestor alteram, só o gestor apaga. Mas política PERMISSIVE **se soma**
-- — o efeito é a UNIÃO, não a interseção. Basta uma dizer "pode" para poder. A de maio
-- nasceu por cima e transformou as de abril em enfeite, **sem apagá-las**: as duas gerações
-- continuam listadas lado a lado em `pg_policies`, o que faz parecer que estão valendo.
--
-- Efeito real medido em 24/08/2026, antes desta migration:
--
--   ação                          o que as granulares dizem   o que de fato acontecia
--   ver negócio da empresa        qualquer um da empresa      igual
--   ALTERAR qualquer negócio      só o dono e o gestor        QUALQUER UM DA EMPRESA
--   REATRIBUIR para um colega     só o gestor                 QUALQUER UM DA EMPRESA
--   APAGAR qualquer negócio       só o gestor                 QUALQUER UM DA EMPRESA
--
-- É o gêmeo exato do item 13 da dívida técnica, que descreve o mesmo padrão em `clientes` e
-- termina pedindo a conferência nas outras tabelas. Esta é a conferência — e aqui é pior,
-- porque a política larga é `FOR ALL`.
--
-- ISTO NÃO TIRA PERMISSÃO DE NINGUÉM. FAZ O BANCO OBEDECER A TELA.
--
-- Medido em `permissoes_usuario` (módulo `pedidos`) em 24/08/2026: das 10 linhas, a única com
-- `pode_excluir = true` é de um gestor — para quem `has_permission` já devolve true por
-- definição. **Nenhum não-gestor tem a caixinha de excluir marcada.** A tela de Configurações
-- já diz que eles não podem; o banco é que não obedecia. Hoje aquela caixinha é decorativa:
-- marcada ou não, o resultado é o mesmo.
--
-- Quem muda de comportamento no dia (MD Representações):
--
--   Érika Marques    líder_comercial   3.772 negócios   perde apagar
--   Pricila Azevedo  vendedor          3.097            perde apagar
--   Margley Pontes   vendedor          1.658            perde apagar
--   Daniel Nóbrega   vendedor            966            perde apagar
--   José Artur       vendedor            781            perde apagar
--
-- Os 6 gestores da MD continuam apagando. **Ninguém perde ver, criar ou editar** — a política
-- de UPDATE abaixo cobre isso de propósito.
--
-- DECISÃO DO DONO DO PRODUTO, 24/08/2026
--
-- Apagar passa a ser: gestor **ou** quem tiver `pode_excluir` marcado nas Configurações.
-- Hoje o efeito é idêntico a "só gestor", porque ninguém está marcado — a diferença é que a
-- caixinha passa a funcionar de verdade, e liberar alguém vira ação de tela, não migration.
-- É a mesma lógica já escolhida para editar.
--
-- REVERSÍVEL: para voltar ao estado anterior, recrie a política larga (o texto exato está no
-- comentário no fim deste arquivo). Nenhuma linha de dado é tocada.
-- ============================================================================

-- Sem BEGIN/COMMIT: quem aplica (CLI ou painel) já envolve o arquivo numa transação, e um
-- BEGIN aninhado só gera aviso. As três operações abaixo são um bloco só de qualquer forma.

-- ── 1. A política que anulava todas as outras ───────────────────────────────
--
-- `IF EXISTS` porque este arquivo precisa poder rodar duas vezes sem quebrar: o ambiente não
-- tem banco local e a aplicação é feita à mão contra produção.

DROP POLICY IF EXISTS "Acesso pedidos empresa" ON public.pedidos;

-- ── 2. ALTERAR: dono, gestor, ou quem tem a permissão das Configurações ─────
--
-- O terceiro ramo é a decisão do dono: quem tem `pode_editar` no módulo `pedidos` edita
-- qualquer negócio DA PRÓPRIA EMPRESA. O `usuario_in_my_empresa` no mesmo ramo é o que
-- impede a permissão de atravessar a fronteira entre empresas.
--
-- 🔴 O `WITH CHECK` é escrito à mão, IDÊNTICO ao `USING`, e isso não é redundância:
--
--   • `USING`      julga a linha COMO ELA ESTAVA  → decide se você pode ABRIR o negócio
--   • `WITH CHECK` julga a linha COMO VAI FICAR   → decide se você pode SALVAR
--
-- A política antiga tinha `USING` e nenhum `WITH CHECK`, e o Postgres reaproveitava o
-- `USING`. Sem o terceiro ramo no `WITH CHECK`, trocar o responsável para um colega seria
-- RECUSADO — o usuário abriria o negócio, preencheria o formulário e levaria erro genérico
-- de banco na hora de salvar. Deixar o Postgres deduzir é justamente o que mascarou tudo
-- isto até agora.

DROP POLICY IF EXISTS "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos
FOR UPDATE TO authenticated
USING (
      usuario_id = get_my_usuario_id()
   OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
   OR (has_permission(get_my_usuario_id(), 'pedidos', 'editar')
       AND usuario_in_my_empresa(usuario_id))
)
WITH CHECK (
      usuario_id = get_my_usuario_id()
   OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
   OR (has_permission(get_my_usuario_id(), 'pedidos', 'editar')
       AND usuario_in_my_empresa(usuario_id))
);

-- ── 3. APAGAR: gestor, ou quem tem a caixinha marcada ──────────────────────
--
-- Sem `WITH CHECK`: DELETE não produz linha nova, então não há "como vai ficar" para julgar.

DROP POLICY IF EXISTS "pedidos_delete" ON public.pedidos;
CREATE POLICY "pedidos_delete" ON public.pedidos
FOR DELETE TO authenticated
USING (
      (is_gestor() AND usuario_in_my_empresa(usuario_id))
   OR (has_permission(get_my_usuario_id(), 'pedidos', 'excluir')
       AND usuario_in_my_empresa(usuario_id))
);

-- ── 4. SELECT e INSERT ficam como estão, e o motivo de cada um ─────────────
--
-- SELECT (`pedidos_select`): `usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(...)`
-- já cobre a empresa inteira. Ninguém deixa de ver nada. Conferido: o Plano de Vendas mostra
-- o número da empresa ao vendedor comum e depende exatamente disso.
--
-- INSERT (`pedidos_insert`): `usuario_id = get_my_usuario_id() OR (is_gestor() AND ...)`.
-- A IMPORTAÇÃO da MD é a prioridade 00 e passa por aqui — conferida linha a linha antes desta
-- migration: `use-bulk-import.ts:279` grava `row.usuario_id ?? vendedorId`, e
-- `ImportPedidosDialog.tsx:440` só resolve a coluna "Responsável" da planilha **quando quem
-- importa é gestor**. Ou seja: não-gestor sempre atribui a si mesmo (passa pelo 1º ramo) e
-- gestor atribui a quem quiser (passa pelo 2º). Nenhum caminho de importação quebra.

-- ============================================================================
-- COMO VOLTAR ATRÁS (não deveria ser preciso — nenhum dado é tocado)
-- ============================================================================
--
-- CREATE POLICY "Acesso pedidos empresa" ON public.pedidos
-- FOR ALL
-- USING (usuario_id IN (
--   SELECT usuarios.id FROM usuarios
--   WHERE usuarios.empresa_id = (
--     SELECT usuarios_1.empresa_id FROM usuarios usuarios_1
--     WHERE usuarios_1.user_id = auth.uid() LIMIT 1)));
--
-- Recriá-la devolve o "todo mundo pode tudo" e volta a anular as políticas granulares.
-- ============================================================================

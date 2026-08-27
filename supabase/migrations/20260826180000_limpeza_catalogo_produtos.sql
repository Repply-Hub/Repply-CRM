-- ============================================================================
-- Limpeza do catálogo de produtos e da etapa "Itens do Negócio"
-- ============================================================================
--
-- Desenho:  docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
-- Plano:    docs/superpowers/plans/2026-08-26-limpeza-catalogo-e-passo-2.md
--
-- Decisão dos sócios em 26/08/2026: catálogo de produtos vira plano futuro. O que a
-- representação precisa no MVP não é cadastrar produto a produto — é ter o PDF da fábrica à
-- mão e conseguir mandá-lo ao cliente. O drive de catálogos ocupa o lugar deste módulo.
--
-- O módulo NUNCA teve dado real. Medido nesta data, antes de escrever esta migration:
--
--   tabela_precos ....................... 0 linhas, nas 8 empresas
--   itens_pedido ........................ 1 linha, para 1 negócio
--   negócios no total ................... 11.910
--   itens criados DENTRO do CRM ......... 0
--   balde catalogo-produtos ............. 0 arquivos
--   src/pages/Catalogo.tsx .............. já órfã, sem rota e sem import
--
-- 🔴 `itens_pedido` NÃO É APAGADA. Aquela 1 linha é de um negócio real, e apagá-la destruiria
-- o único registro que alguém um dia pode perguntar por quê. A tela sai; a tabela fica órfã e
-- documentada em docs/operacao/catalogo-de-produtos-removido.md.
--
-- 🔴 ORDEM DE APLICAÇÃO: o código do front compara `c.etapa === 'Itens do Negócio'` com o
-- TEXTO gravado aqui. Aplicar esta migration antes de publicar o front faz o passo 2 do
-- assistente deixar de reconhecer os próprios campos, em silêncio. Publique o código primeiro.
-- ============================================================================

-- ── Os campos que perdem a tela ────────────────────────────────────────────
--
-- `itens` some junto com o módulo.
--
-- `proximo_contato` já estava órfão ANTES desta mudança: o campo saiu da tela há tempos e a
-- linha de configuração ficou para trás, prometendo ao gestor um campo que ele não encontra
-- em lugar nenhum do sistema. Sai agora porque é a mesma etapa e o mesmo defeito.
delete from configuracoes_campos
 where etapa = 'Itens do Negócio'
   and campo_key in ('itens', 'proximo_contato');

-- ── A etapa é RENOMEADA, não removida ──────────────────────────────────────
--
-- O assistente continua com dois passos. A aba Campos das Configurações deixa cada empresa
-- escolher em que passo cada campo vive, e as 8 empresas têm linha gravada com isso —
-- colapsar em uma tela só mataria essa configuração.
update configuracoes_campos
   set etapa = 'Valor e orçamento',
       updated_at = now()
 where etapa = 'Itens do Negócio';

-- ── A tabela do catálogo ───────────────────────────────────────────────────
--
-- Sem `cascade`: se algo que ninguém mapeou ainda depender dela, é melhor esta migration
-- falhar em voz alta do que arrastar junto uma tabela que ninguém queria perder.
drop table if exists public.tabela_precos;

-- ── O balde de imagem de produto NÃO sai por aqui ──────────────────────────
--
-- 🔴 O Supabase RECUSA apagar balde por SQL. Tentar `delete from storage.buckets` devolve:
--
--     42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.
--     HINT: This prevents accidental data loss from orphaned objects.
--
-- É uma proteção do próprio Supabase (gatilho `storage.protect_delete`) contra deixar objeto
-- órfão. Descoberto ao testar esta migration em transação desfeita, em 26/08/2026.
--
-- O balde `catalogo-produtos` tem 0 arquivos e sai pelo painel do Supabase, à mão, junto com
-- a aplicação desta migration. Está no plano como passo separado, de propósito: passo manual
-- escondido dentro de um arquivo de migration é passo que ninguém executa.

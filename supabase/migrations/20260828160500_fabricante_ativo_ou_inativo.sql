-- Fabricante pode ser marcado como INATIVO: a marca que o representante não representa mais.
--
-- 🔴 O PROBLEMA. Quando uma representação acaba, hoje o usuário não tem ação nenhuma:
--
--   - EXCLUIR não funciona e nem deveria — a tela já recusa com "Este fabricante possui
--     negócios vinculados e não pode ser excluído" (`src/pages/Fabricantes.tsx:395-399`), e
--     está certa: apagar levaria junto o histórico de venda daquela marca;
--   - DESATIVAR não existia — não havia coluna de status nenhuma em `fabricantes`.
--
-- Resultado medido em 28/08/2026: das 30 marcas cadastradas na MD, várias claramente já não
-- são representadas — Soprano (144 negócios, o último em 17/07/2024), Hydra (3, último em
-- 22/02/2024), Asperbras (23, último em 23/06/2025) — e todas continuam disputando espaço com
-- as vivas em cada lista, em cada filtro e em cada seletor de novo negócio.
--
-- 🔴 INATIVO NÃO É EXCLUÍDO, e a diferença é o ponto inteiro desta migration. O fabricante
-- continua no sistema, continua ligado aos negócios antigos, continua somando no faturamento
-- histórico e continua aparecendo nos relatórios do passado. O que muda é a ORDEM: ele desce
-- para o fim de toda lista de escolha, para não competir com as marcas que estão em jogo.
--
-- Termo escolhido pelo dono do produto em 28/08/2026: "Ativa / Inativa".

alter table public.fabricantes
  add column if not exists ativo boolean not null default true;

comment on column public.fabricantes.ativo is
  'Falso = marca que o representante não representa mais. NÃO é exclusão: os negócios, as '
  'metas e o histórico continuam intactos e continuam contando nos relatórios. O efeito é de '
  'ORDEM — inativa vai para o fim de toda lista de escolha (seletor de negócio, filtros, '
  'página de Fabricantes, Plano de Vendas). Padrão verdadeiro, inclusive para o que a '
  'importação cria sozinha.';

-- 🔴 AS 30 LINHAS EXISTENTES VIRAM `true`, e é o que se quer: o `default true` já as preenche,
-- e presumir o contrário desativaria a operação inteira da MD de uma vez. Quem parou de
-- representar é o dono do produto quem diz, marca a marca, pela tela.

-- O índice serve à ordenação que passa a existir em quase toda leitura de fabricante
-- (`order by ativo desc, nome`). São 30 linhas hoje, então ele não muda nada agora — existe
-- para o assinante que tiver 300.
create index if not exists idx_fabricantes_ativo_nome
  on public.fabricantes (empresa_id, ativo desc, nome);

-- Nenhuma política muda. As quatro de `fabricantes` (reescritas em
-- `20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql`) já permitem que
-- qualquer membro da empresa edite os fabricantes dela, e marcar ativo/inativo é uma edição
-- como outra qualquer. O gatilho de auditoria (`20260728140000_historico_alteracoes.sql:92`)
-- passa a registrar a troca de status, o que é desejável: "quem desativou a Soprano, e quando"
-- é exatamente o tipo de pergunta que aparece depois.

-- Derruba o "Status Inicial" da obra — passo 2 de 2
--
-- O passo 1 (commit `bee8b652`) fez o cadastro parar de mandar `status`, e foi PUBLICADO
-- antes deste arquivo rodar. A ordem é o que evita uma janela em que o cadastro de obra dá
-- erro em produção: derrubar a coluna com o site antigo no ar quebraria todo insert.
--
-- ESTADO MEDIDO ANTES, em 24/08/2026:
--   · `obras`               → 0 linhas
--   · `status_obras`        → 0 linhas, nas 8 empresas
--   · `seed_default_status_obras` → nunca chamada por ninguém: sem gatilho, sem chamada no app
--   · nenhuma view, índice, restrição ou política de RLS cita `obras.status`
--
-- E o histórico das 2.312 obras apagadas em agosto CONTINUA legível: `historico_alteracoes`
-- guarda a foto inteira de cada linha em `dados_antes`, com os valores antigos preservados.
-- Derrubar a coluna não apaga registro nenhum.

-- ---------------------------------------------------------------- a coluna

-- Era `text NOT NULL DEFAULT 'em_andamento'` e nunca teve chave estrangeira para
-- `status_obras`: as duas coisas jamais estiveram casadas de verdade. Daí os TRÊS
-- vocabulários que não conversavam — os 7 slugs da semente, o default da coluna, e o
-- 'ativa' cravado no formulário da ficha do cliente, que foi o que gravou as 2.312 obras.
alter table public.obras drop column status;

-- ---------------------------------------------------------------- a lista de opções

-- Nasceu em 28/04/2026 com a forma certa (empresa_id, slug, nome, cor, ordem, is_sistema) e
-- morreu vazia, porque a função que a preencheria nunca foi chamada. As outras seis tabelas
-- de configuração do sistema têm gatilho de semeadura em `empresas`; esta era a única
-- exceção do padrão. O `marcadores_obras` que a substitui nasce vazio DE PROPÓSITO, e isso
-- está escrito na migration dele para ninguém repetir o engano ao contrário.
drop table if exists public.status_obras;
drop function if exists public.seed_default_status_obras(uuid);

-- ---------------------------------------------------------------- a sobra na tela

-- `configuracoes_campos` tinha uma linha 'status' / "Status Inicial" para obras nas 8
-- empresas. Ela APARECE em Configurações → Campos, oferecendo tornar obrigatório um campo
-- que não existe mais em formulário nenhum.
--
-- ⚠️ O filtro por `entidade = 'obras'` não é detalhe: `pedidos` também tem um campo_key
-- 'status', que é a "Fase do Negócio" do funil e está em pleno uso. Apagar sem o filtro
-- tiraria a fase do negócio da configuração das 8 empresas.
delete from public.configuracoes_campos
 where entidade = 'obras' and campo_key = 'status';

-- E o gatilho que semeia os campos de toda empresa NOVA para de criar essa linha. Sem isto,
-- o próximo assinante nasceria com a sobra de volta.
--
-- A função é recriada inteira porque é assim que o Postgres funciona — não há "remover uma
-- linha do corpo". O único trecho alterado é a linha de `('obras', 'status')`; todo o resto
-- é cópia fiel do que estava em produção, conferido com `pg_get_functiondef` antes de
-- escrever. As ordens de obras ficam 0, 1, 3, 4: o buraco no 2 é de propósito, para empresa
-- nova nascer idêntica às 8 que já existem, em vez de renumerada.
create or replace function public.criar_configuracoes_campos_padrao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, label, obrigatorio, ordem, etapa) VALUES
    (NEW.id, 'pedidos',  'padrao', 'obra_id',          NULL,                        false, 0,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'origem_lead',      NULL,                        false, 1,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'endereco_entrega', NULL,                        false, 2,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'prazo_resposta',   NULL,                        false, 3,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'observacoes',      NULL,                        false, 4,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'cliente_id',       'Cliente',                   true,  5,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'fabricante_id',    'Fabricante',                true,  6,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'vendedor_id',      'Responsável',               true,  7,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'status',           'Fase do Negócio',           false, 8,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'anexo_pdf',        'Anexar PDF',                true,  9,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'data_pedido',      'Data de Criação',           true,  10, 'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'itens',            'Itens do Negócio',          false, 11, 'Itens do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'valor_manual',     'Valor de Negociação',       false, 12, 'Itens do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'proximo_contato',  'Próximo Contato Agendado',  false, 13, 'Itens do Negócio'),
    (NEW.id, 'clientes', 'padrao', 'razao_social',     NULL,                        false, 0,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'email',            NULL,                        true,  1,  'Contato'),
    (NEW.id, 'clientes', 'padrao', 'telefone',         NULL,                        true,  2,  'Contato'),
    (NEW.id, 'clientes', 'padrao', 'endereco',         NULL,                        false, 3,  'Endereço'),
    (NEW.id, 'clientes', 'padrao', 'tipo',             'Tipo',                      false, 4,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'cnpj',             'CNPJ',                      true,  5,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'nome',             'Nome',                      true,  6,  'Dados'),
    (NEW.id, 'contatos', 'padrao', 'email',            NULL,                        true,  0,  NULL),
    (NEW.id, 'contatos', 'padrao', 'telefone',         NULL,                        true,  1,  NULL),
    (NEW.id, 'contatos', 'padrao', 'cargo',            NULL,                        false, 2,  NULL),
    (NEW.id, 'contatos', 'padrao', 'nome_contato',     'Nome do contato',           true,  3,  NULL),
    (NEW.id, 'contatos', 'padrao', 'empresa_vinculo',  'Empresa vinculada',         false, 4,  NULL),
    (NEW.id, 'obras',    'padrao', 'nome_obra',        'Nome da Obra',              true,  0,  NULL),
    (NEW.id, 'obras',    'padrao', 'cliente_id',       'Cliente Responsável',       true,  1,  NULL),
    (NEW.id, 'obras',    'padrao', 'endereco_entrega', 'Endereço de Entrega',       false, 3,  NULL),
    (NEW.id, 'obras',    'padrao', 'spe_cnpj',         'SPE/CNPJ',                  false, 4,  NULL)
  ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- o que NÃO entra aqui
--
-- O marcador de obra NÃO vira campo configurável. Poder marcá-lo como obrigatório recriaria
-- exatamente a armadilha que este arquivo está desfazendo: campo obrigatório cuja lista de
-- opções nasce vazia = cadastro intransponível. Marcador de obra é opcional, e ponto.

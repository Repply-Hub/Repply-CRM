-- ============================================================================
-- A FÁBRICA DE EMPRESAS NOVAS VOLTA A MONTAR O PASSO 2 CERTO
-- ============================================================================
--
-- 🔴 CONSERTO DE BUG EM PRODUÇÃO. A tela de criar negócio nasce TRAVADA em toda empresa
-- criada a partir de 27/08/2026.
--
-- ─── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- Em 26/08/2026 duas migrations mudaram o assistente de Novo Negócio:
--
--   20260826180000  apagou os campos `itens` e `proximo_contato` e renomeou a etapa
--                   'Itens do Negócio' para 'Valor e orçamento'
--   20260826234500  moveu `anexo_pdf` para 'Valor e orçamento' (o passo 2)
--
-- As duas consertaram as LINHAS das 8 empresas que existiam. Nenhuma das duas tocou
-- `criar_configuracoes_campos_padrao()` — a função de gatilho que monta essas mesmas linhas
-- quando nasce empresa. Ou seja: consertaram os carros já vendidos e deixaram a linha de
-- montagem produzindo o defeito.
--
-- Toda empresa nascida depois nasceu com a configuração de 26/08 de manhã:
--
--   PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA   nasceu 28/08/2026   cliente pagante
--   Repply                                          nasceu 29/08/2026   base de demonstração
--
-- ─── POR QUE ISSO TRAVA A TELA, E NÃO APENAS "CONFIGURA DIFERENTE" ───────────
--
-- Qual campo pertence a qual passo do assistente vem do TEXTO desta coluna `etapa`, comparado
-- literalmente em NovoNegocioDialog.tsx:253. E o filtro do passo 1 não é uma lista — é o
-- complemento `c.etapa <> 'Valor e orçamento'`, um pega-tudo. Então etapa velha, etapa
-- desconhecida ou nula: tudo cai no passo 1.
--
-- Com `anexo_pdf` em 'Informações do Negócio' e obrigatorio = true, o passo 1 exige um campo
-- cujo único input de arquivo está desenhado no passo 2 (linha 783). O botão "Próximo" é
-- `disabled={!isStep1Complete}` (linha 854), então ele nem chega a rodar a validação: fica
-- apagado, sem mensagem nenhuma. Beco silencioso, exatamente o que a 20260826234500 descreve
-- ter consertado — e chamou de "a TERCEIRA vez".
--
-- Medido em 31/08/2026: PR & COCENTINO tem 3 usuários e ZERO negócios.
--
-- ⚠️ A frase honesta é "a TELA de criar negócio está travada", não "o sistema não deixa criar":
-- a importação em massa (use-bulk-import.ts) não consulta esta tabela e insere direto. E existe
-- uma fresta de corrida — enquanto a configuração não chega do servidor, `(camposConfig ?? [])`
-- é vazio e o botão nasce habilitado. Ninguém acha isso por acaso, mas por causa dela NÃO se
-- pode concluir do banco que "ninguém passou".
--
-- ─── AS QUATRO DIVERGÊNCIAS, MEDIDAS CAMPO A CAMPO ──────────────────────────
--
-- Comparei as 10 empresas, TODAS as entidades, campo a campo. A divisão é limpa (8 × 2) e não
-- há nenhuma divergência em clientes, contatos ou obras:
--
--   anexo_pdf        etapa 'Informações do Negócio'  (devia ser 'Valor e orçamento')  TRAVA
--   valor_manual     etapa 'Itens do Negócio'        (devia ser 'Valor e orçamento')  ARMADA
--   itens            linha existe                    (devia ter sumido em 26/08)      ARMADA
--   proximo_contato  linha existe                    (devia ter sumido em 26/08)      ARMADA
--
-- As três últimas não disparam hoje só porque estão com obrigatorio = false. `itens` é a pior:
-- ele não tem entrada no mapa de valores nem no criar nem no editar, e não tem exceção escrita
-- à mão como `proximo_contato` e `obra_id` têm. Basta um gestor ligar o interruptor dele em
-- Configurações → Campos para travar criar E editar negócio, sem campo nenhum na tela para
-- resolver.
--
-- ─── POR QUE O `WHERE` DESCREVE O DEFEITO E NUNCA A EMPRESA ─────────────────
--
-- Nada de `where empresa_id in (...)` nem filtro por data. Um WHERE por empresa é o que criou
-- este problema em primeiro lugar: conserta quem está na lista e deixa o resto para trás.
-- Descrevendo o defeito, a migration conserta também qualquer empresa nascida entre a escrita
-- e a aplicação deste arquivo.
--
-- É seguro porque `etapa` NÃO é escolha de gestor: nenhuma tela grava essa coluna. As mutações
-- de use-configuracoes-campos.ts só escrevem `obrigatorio` e `obrigatorio_escopo`, e o insert de
-- campo customizado nem preenche `etapa`. Já `obrigatorio` É escolha do cliente — por isso
-- nenhuma linha abaixo o toca.
-- ============================================================================


-- ─── 1. As duas linhas que não deviam existir ───────────────────────────────
--
-- 🔴 O DELETE VEM ANTES DO UPDATE. Invertido, o UPDATE do passo 2 já teria levado estas duas
-- para 'Valor e orçamento', o filtro por etapa não casaria com nada e as órfãs ficariam — só
-- que agora escondidas dentro do passo certo. É a mesma ordem que a 20260826180000 usou.
--
-- Apagar é seguro, conferido em 31/08/2026: a única chave estrangeira que aponta para cá é
-- `configuracoes_campos_etapas`, com ON DELETE CASCADE, e estas 4 linhas têm ZERO filhas.
-- Todas têm created_by nulo e updated_at igual a created_at — ninguém nunca as abriu.
--
-- `entidade = 'pedidos'` é redundante hoje, e fica de propósito: é a lição da 20260824120000,
-- onde apagar por campo_key sem entidade quase levou junto a "Fase do Negócio".
delete from public.configuracoes_campos
 where entidade = 'pedidos'
   and etapa = 'Itens do Negócio'
   and campo_key in ('itens', 'proximo_contato');


-- ─── 2. O que sobrou em 'Itens do Negócio' é o Valor de Negociação ─────────
--
-- Filtra pela ETAPA, não pelo campo: assim nenhuma linha fica parada num rótulo que a tela não
-- reconhece mais. Depois do DELETE acima, `valor_manual` é a única que resta ali.
update public.configuracoes_campos
   set etapa = 'Valor e orçamento'
 where entidade = 'pedidos'
   and etapa = 'Itens do Negócio';


-- ─── 3. O anexo do PDF volta para o passo 2 ────────────────────────────────
--
-- É esta linha que destrava a tela da PR & Cocentino e da base de demonstração.
--
-- Repete o que a 20260826234500 fez, para as empresas que nasceram depois dela. Não copio o
-- `set updated_at = now()` daquela migration: a tabela já tem gatilho BEFORE UPDATE que cuida
-- disso, e escrever à mão só mascararia se o gatilho parasse de funcionar.
update public.configuracoes_campos
   set etapa = 'Valor e orçamento'
 where entidade = 'pedidos'
   and campo_key = 'anexo_pdf'
   and etapa = 'Informações do Negócio';


-- ─── 4. A fábrica ─────────────────────────────────────────────────────────
--
-- Sem isto, os passos 1 a 3 consertam as 10 empresas de hoje e a empresa seguinte nasce
-- quebrada de novo. E o `on conflict ... do nothing` do fim garante que a função NUNCA conserta
-- linha existente: consertar os dados e consertar a fábrica são duas obrigações, não uma
-- redundância.
--
-- O corpo vem INTEIRO porque o Postgres não substitui linha solta — `create or replace` troca a
-- função toda. A base é a definição que estava EM PRODUÇÃO em 31/08/2026 (lida com
-- pg_get_functiondef), não a de um arquivo antigo: hoje as duas batem, mas copiar do banco é o
-- que torna isso seguro em vez de sortudo — já existe pelo menos uma função neste sistema cuja
-- definição no banco divergiu do arquivo que a define.
--
-- 🔴 A ORDEM NÃO É RENUMERADA. Ficam os buracos no 11 e no 13, de propósito: as 8 empresas
-- antigas têm `valor_manual` na ordem 12, e renumerar faria empresa nova nascer diferente delas.
--
-- 🔴 ACENTO AQUI É CONTRATO, NÃO ESTILO. Estes textos são comparados LITERALMENTE com
-- NovoNegocioDialog.tsx. Um acento a menos em 'Valor e orçamento' faz o passo 2 deixar de
-- reconhecer os próprios campos, exatamente como aconteceu agora — e em silêncio.
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
    -- 🔴 Passo 2. Foi esta linha que nasceu errada e travou a tela das empresas novas.
    (NEW.id, 'pedidos',  'padrao', 'anexo_pdf',        'Anexar PDF',                true,  9,  'Valor e orçamento'),
    (NEW.id, 'pedidos',  'padrao', 'data_pedido',      'Data de Criação',           true,  10, 'Informações do Negócio'),
    -- Ordem 11 vaga: era `itens`, apagado em 26/08/2026 junto com o somatório do catálogo.
    (NEW.id, 'pedidos',  'padrao', 'valor_manual',     'Valor de Negociação',       false, 12, 'Valor e orçamento'),
    -- Ordem 13 vaga: era `proximo_contato`, que saiu da tela.
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

comment on function public.criar_configuracoes_campos_padrao() is
  'Semeia configuracoes_campos quando nasce empresa. 🔴 A coluna `etapa` é comparada '
  'LITERALMENTE com NovoNegocioDialog.tsx: apenas "Valor e orçamento" cai no passo 2 do '
  'assistente; qualquer outro texto cai no passo 1. Ao mover um campo de passo na tela, mude '
  'ESTA função também — mexer só nos dados conserta quem já existe e deixa toda empresa futura '
  'nascer quebrada, que foi o bug de 27 a 31/08/2026.';

# Modelo de dados

As 74 tabelas do Repply CRM, explicadas por domínio: o que cada uma guarda, como se
ligam, e onde estão as armadilhas.

**Fonte da verdade:** `supabase/migrations/*.sql` (252 arquivos) e
`src/integrations/supabase/types.ts` (gerado). Quando este documento e o banco
divergirem, o banco está certo — **e este documento está desatualizado, corrija-o**.

---

## 1. O eixo que sustenta tudo

```
                          empresas
                       (o assinante do SaaS)
                              |
        +---------------------+---------------------+
        |                     |                     |
    usuarios          empresa_assinaturas       configuração
   (a equipe)          (estado do plano)     (funis, campos, menu)
        |
        +-- permissoes_usuario
```

Duas regras que valem para o banco inteiro:

1. **Quase toda tabela de domínio carrega `empresa_id`**, mesmo quando poderia chegar lá
   por junção. É redundante de propósito: é o que permite escrever a política de segurança
   sem junção, e junção dentro de política custa caro.
2. **A política de segurança é a autorização real.** Ver
   [permissões e RLS](permissoes-e-rls.md).

---

## 2. Inquilino e acesso

| Tabela | O que guarda |
|---|---|
| `empresas` | A empresa de representação assinante. **Não confunda com o cliente dela** |
| `usuarios` | A equipe da empresa. Carrega `role` e `empresa_id`. Antigamente chamada `vendedores` |
| `empresa_assinaturas` | Estado da assinatura no Stripe |
| `planos` | Catálogo de planos, com `stripe_price_id`. Leitura liberada até para quem não está logado (a página de preços precisa) |
| `stripe_eventos` | Eventos recebidos do Stripe, para não processar duas vezes |
| `permissoes_usuario` | Por módulo: ver / criar / editar / excluir + funcionalidades |
| `permissao_presets`, `perfis_customizados` | Conjuntos prontos de permissão |
| `audit_permissoes` | Quem mudou permissão de quem, e quando |

### A ambiguidade de "empresa"

`empresas` é o **assinante do SaaS**. Mas `clientes` tem um campo `empresa` de **texto**,
que é o nome da empresa **cliente**. São coisas diferentes com o mesmo nome.

> **Regra:** inquilino é sempre `empresa_id` (chave estrangeira). Texto em `clientes` é
> dado do cliente, nunca vínculo.

### O papel `empresa`

`usuarios.role` aceita quatro valores: `admin`, `empresa`, `gestor`, `vendedor`. O papel
`empresa` é o titular que criou a conta. Ver [permissões](permissoes-e-rls.md) §3.

### 🔴 O que a tela chama × o que o banco chama

**Levantado em 24/08/2026, depois de um erro real:** um plano inteiro foi desenhado sobre a
coluna `prazo_resposta` acreditando que ela fosse um prazo de resposta do cliente. Não é. O
nome da coluna e o significado dela divergem, e isso não aparece em lugar nenhum até alguém
tropeçar.

Mapa completo da lista de Negócios — a tela mais usada do sistema:

| O usuário lê | id na tela | Coluna no banco | Diverge? |
|---|---|---|---|
| Negócio | `negocio` | `pedidos.nome` — **nulo nos 11.911** | 🔴 o nome real mora em `campos_extras['Negócio']` |
| Cliente | `cliente` | `pedidos.cliente_id` → `clientes` | — |
| Contato | `contato` | **`campos_extras['Contato']`** | ⚠️ não é coluna, é campo extra |
| **Obra/Endereço** | `endereco_entrega` | `pedidos.endereco_entrega` | ⚠️ diz "Obra", mas `pedidos.obra_id` é outra coisa e está **nulo nos 11.911** |
| Fabricante | `fabricante` | `pedidos.fabricante_id` | — |
| Valor | `valor` | `pedidos.valor_total` | leve |
| Responsável/Vendedor | `vendedor` | `pedidos.usuario_id` | ⚠️ o id diz "vendedor", a coluna diz "usuario" |
| **Etapa** | `etapa` | **`pedidos.status`** | ⚠️ e o valor guardado é o apelido (`enviado`), não o rótulo (`Orçamento Enviado`) |
| Marcador | `marcador` | `pedidos.marcador_id` | — |
| Criação | `data_pedido` | `pedidos.data_pedido` | — |
| **Fechamento** | `prazo_resposta` | **`pedidos.prazo_resposta`** | 🔴 **o pior: o nome diz "prazo de resposta", o significado é "data de fechamento"** |
| Observações | `observacoes` | `pedidos.observacoes` | — |
| Anexo | `anexo` | `pedidos.pdf_url` | leve |

#### `prazo_resposta` é a data de fechamento. Ponto.

Três lugares do código provam, e não há nenhum que a use como prazo:

```
src/components/pedidos/NovoNegocioDialog.tsx:773        <Label>Data de Fechamento</Label>
src/components/import-pedidos/importPedidosUtils.ts:17  { key: 'prazo_resposta', label: 'Fechamento' }
src/components/import/MappingStep.tsx:79                "Data prevista de fechamento do negócio."
```

É a coluna que o Dashboard usa para **todas as métricas de dinheiro** (ver
[`modulos/dashboard.md`](../modulos/dashboard.md)) e a que o gatilho
`fn_set_pedido_fechado_em` mantém.

**E ninguém a alimenta como previsão:** dos 193 negócios abertos, **32 têm data de fechamento
ANTERIOR à data de criação**. O campo é opcional no cadastro, e só 4 negócios em 11.911
nasceram dentro do CRM — o resto veio da planilha.

> **Nunca use `prazo_resposta` como prazo de coisa nenhuma.** Para negócio aberto ela é uma
> previsão herdada da importação que ninguém atualiza. Quem precisa de "há quanto tempo isso
> está parado" usa `pedidos_historico_status` (real a partir de 08/2026) ou `data_pedido`
> (real sempre). Ver [`operacao/plano-pauta-do-dia.md`](../operacao/plano-pauta-do-dia.md) §1.5.

#### Por que NÃO renomeamos

Medido em 24/08/2026. Renomear `prazo_resposta` alcança:

| onde | quantos | o rename resolve sozinho? |
|---|---|---|
| Funções e RPCs do banco | **8** | ❌ **não** |
| Índices | 2 | ✅ sim |
| Visões (`vw_faturamento_mensal`) | 1 | ✅ sim |
| Referências em `src/` | **100**, em 22 arquivos | ❌ à mão |
| Migrations históricas | 12 arquivos | (não se edita) |
| Funções de borda | 1 | ❌ à mão |

O `ALTER TABLE ... RENAME COLUMN` **atualiza visão e índice sozinho, mas NÃO atualiza o corpo
das funções** — testado neste banco, numa transação desfeita:

```
visão   -> acompanhou   ✅
índice  -> acompanhou   ✅
função  -> ficou com o nome velho   ❌
```

As 8 funções afetadas são `dashboard_stats`, `pedidos_stats`, `plano_vendas_progresso`,
`plano_vendas_progresso_por_vendedor`, `dashboard_indicadores_vendedor`,
`fn_set_pedido_fechado_em`, `fn_log_pedido_historico_status` e
`criar_configuracoes_campos_padrao` — ou seja, **praticamente todo número que o CRM mostra**.

O rename só é seguro se as 8 forem reescritas no MESMO arquivo de migration. É factível, mas
é uma mudança grande e arriscada em produção **cujo benefício é só para quem lê o código**.
Nada muda para quem usa o sistema.

**A escolha registrada:** manter o nome, documentar aqui, e deixar um comentário na própria
coluna do banco (`COMMENT ON COLUMN`), que aparece no painel do Supabase para quem for olhar
a tabela. Se um dia o rename acontecer, este bloco é a lista do que precisa ir junto.

---

## 3. O núcleo comercial

```
   clientes ---------------+
      |                    |
   contatos                |
                           v
  fabricantes -------->  pedidos  <-------- usuarios (responsável)
      |                    |
  tabela_precos            +-- itens_pedido
                           +-- pedidos_historico_status
                           |
   obras ------------------+  (opcional)
```

| Tabela | O que guarda |
|---|---|
| `pedidos` | **A entidade central.** Na tela é "Negócio"; no domínio é um **orçamento** |
| `itens_pedido` | As linhas do orçamento |
| `pedidos_historico_status` | Por onde o negócio passou e quando — a base de qualquer leitura de tempo de ciclo |
| `clientes` | A empresa que compra (construtora, loja, PJ) |
| `contatos` | As pessoas dentro do cliente |
| `historico_contatos` | Registro de interação. **Ainda usa `vendedor_id`**, não `usuario_id` |
| `obras` | O canteiro. Pode ter CNPJ próprio (SPE). Endereço vira ponto no mapa |
| `status_obras` | Situações da obra, configuráveis por empresa |
| `fabricantes` | A **representada** — a marca que o representante vende |
| `tabela_precos` | Catálogo e preços por fabricante. **Passou a ser por empresa em 19/08/2026** — antes era global entre todas |

### Os vínculos de `pedidos`

| Campo | Aponta para | Obrigatório |
|---|---|---|
| `cliente_id` | `clientes` | sim |
| `fabricante_id` | `fabricantes` | sim |
| `obra_id` | `obras` | **não** |
| `usuario_id` | `usuarios` | sim |
| `status` | a etapa do Kanban | sim |
| `valor_total` | — | — |

> ⚠️ **`valor_total` não é a receita de quem usa o CRM.** É o que a fábrica vai faturar do
> cliente. A receita do representante é a comissão sobre isso, e **o sistema ainda não
> modela comissão**. Ver [`SPEC.md` §3.1](../../SPEC.md).

### Por que `fabricante_id` é obrigatório

Porque é o segundo eixo do domínio: um representante trabalha para várias fábricas ao mesmo
tempo, e meta, catálogo e desempenho são todos por fábrica. Um CRM genérico não tem esse
eixo. Ver [`SPEC.md` §3.2](../../SPEC.md).

---

## 4. Funil e configuração

Tudo aqui existe para o sistema **não ter opinião** sobre como a empresa organiza o
trabalho.

| Tabela | O que configura |
|---|---|
| `funis` | Mais de um funil por empresa |
| `kanban_colunas` | As etapas: nome, cor, ordem — por funil |
| `configuracoes_campos` | Campos customizados, por entidade |
| `configuracoes_campos_etapas` | **Obrigatoriedade por etapa**: um campo pode ser exigido só quando o negócio chega em determinada coluna |
| `configuracoes_tabelas`, `colunas_customizadas` | Quais colunas aparecem em cada tabela da interface |
| `marcadores` | Etiquetas |
| `tarefas_kanban_colunas` | As etapas do quadro de tarefas |
| `configuracoes_automacao`, `automation_logs` | Automações e o registro delas |

### Obrigatoriedade por etapa — leia antes de usar

`configuracoes_campos.obrigatorio_escopo` aceita `'global'` (obrigatório sempre) ou
`'etapas'` (obrigatório só nas colunas listadas).

> **Nunca leia `campo.obrigatorio` direto para campos de pedido.** Use
> `isCampoObrigatorioNaEtapa(campo, kanbanColunaId)` em
> `src/hooks/use-configuracoes-campos.ts` — é o único lugar que sabe interpretar o escopo.
> Conjunto vazio no escopo `'etapas'` significa "não obrigatório em etapa nenhuma no
> momento", não "obrigatório em todas".

---

## 5. Metas

| Tabela | O que guarda |
|---|---|
| `metas_vendas` | Meta por fabricante, por período. Tem **duas camadas**: meta de equipe e meta individual |
| `plano_vendas_fabricante_ordem` | A ordem em que as fábricas aparecem na tela |

O progresso é calculado **no servidor**, pelas funções `plano_vendas_progresso` e
`plano_vendas_progresso_por_vendedor`. Não puxe os pedidos do período para somar no
navegador.

> **Detalhe de regra:** na visão de um vendedor específico, uma fábrica que só tem meta de
> equipe (sem meta individual) **some da lista e do total**, mesmo tendo venda registrada.
> Na visão agregada "Todos", as metas de equipe somam normalmente. Isso é intencional.

---

## 6. Produtividade

| Tabela | O que guarda |
|---|---|
| `tarefas` | Tarefa com responsável, prazo e marcadores. Pode estar ligada a um **negócio** ou a uma **conversa de WhatsApp** |
| `eventos` | Eventos do calendário, com participantes |
| `chat_grupos`, `chat_grupo_membros` | Grupos do chat interno |
| `chat_mensagens`, `chat_mensagens_leituras` | Mensagens e quem já leu |
| `chat_geral_config` | Configuração do canal geral |

---

## 7. WhatsApp

| Tabela | O que guarda |
|---|---|
| `configuracoes_wapi` | A instância conectada: URL, **`api_key`**, nome, status |
| `wapi_instancia_usuarios` | Quem, além de quem responde pela empresa, usa aquela instância |
| `whatsapp_conversas` | As conversas. **`telefone` guarda o identificador literal** |
| `whatsapp_mensagens` | As mensagens |
| `whatsapp_conversa_responsaveis` | Quem responde por cada conversa |
| `whatsapp_contatos_fotos` | Fotos de perfil dos contatos |
| `mensagens_whatsapp` | *Tabela antiga, anterior à integração atual* |

### Duas armadilhas caras

1. **`whatsapp_conversas.telefone` é literal.** Guarda o identificador do grupo em dois
   formatos, e o antigo **tem hífen**. Qualquer `replace(/\D/g, "")` apaga o hífen e monta
   um destino inexistente — a uazapi responde sucesso e não entrega nada.
2. **Busca de texto sob RLS não usa índice.** `.ilike()` direto não consegue usar o índice
   de busca, porque o Postgres não pode avaliar o texto antes da política. Medido: 12
   segundos para um termo raro, estourando o tempo limite. Use a função
   `wa_buscar_mensagens`, que repete as cláusulas da política explicitamente (22 ms).

### Segurança

> 🔴 A `api_key` da instância está **exposta** em `webhook_debug`, e o próprio navegador a
> recebe no fluxo de QR Code. É a dívida mais grave do sistema:
> [`docs/divida-tecnica.md` §1](../divida-tecnica.md).

---

## 8. E-mail

Ver o [módulo de e-mail](../modulos/email.md) para o detalhe. Resumo das tabelas:

| Tabela | O que guarda |
|---|---|
| `email_contas` | A caixa conectada — **da empresa**, não do usuário |
| `email_conta_grants` | A credencial do Nylas. **RLS ligada sem política = negação total.** Só as funções de borda leem |
| `email_conta_usuarios` | Quem enxerga a caixa |
| `email_conexao_estados` | Segredo de ida e volta do OAuth, uso único, 15 minutos |
| `email_pastas` | Pastas e marcadores espelhados |
| `email_mensagens` | Recebidas e enviadas na mesma tabela |
| `email_rascunhos` | Salvamento automático da composição |
| `emails`, `emails_recebidos`, `gmail_tokens` | **Legado do Gmail** |

---

## 9. Portal de Consultas *(exclusivo MD)*

| Tabela | Fonte |
|---|---|
| `licencas_idema` | IDEMA — licença ambiental do RN |
| `licencas_natal` | Diário Oficial de Natal |
| `licencas_extremoz` | Diário Oficial de Extremoz |
| `dom_licencas` | Consolidação de diário oficial municipal |

---

## 10. Importação

| Tabela | O que guarda |
|---|---|
| `linhas_ignoradas_importacao` | Linhas que não passaram na validação, para revisão manual em `/importacao/ignoradas` |

---

## 11. Interface e operação

| Tabela | O que guarda |
|---|---|
| `sidebar_preferences` | Menu de cada usuário |
| `sidebar_empresa_padrao` | Menu padrão da empresa. **Cosmético** — não bloqueia rota nem dado |
| `sidebar_empresa_padrao_historico` | Versões anteriores desse padrão |
| `notificacoes`, `notificacoes_leituras` | Notificações, com leitura por usuário |
| `historico_alteracoes` | Auditoria de alteração de registro |
| `app_erros` | Erros do app gravados no banco, com identificação do build |
| `debug_logs`, `webhook_debug` | Diagnóstico. **`webhook_debug` está sem proteção** — ver dívida técnica |

---

## 12. Visões

| Visão | Para quê |
|---|---|
| `vw_faturamento_mensal` | Série mensal do Dashboard |
| `vw_indicadores_usuario` | Indicadores por usuário |
| `vw_indicadores_vendedor` | **Apelido legado** da anterior |
| `vw_pedidos_inativos` | Negócios parados |
| `vw_velocidade_por_fabricante` | Tempo de resposta por fábrica |

> **Ordene série mensal por `mes_ano`** (formato `AAAA-MM`, que ordena certo como texto),
> nunca pelo rótulo formatado — ordenar o rótulo alfabeticamente embaralha os meses no
> gráfico. Já aconteceu.

---

## 13. Funções de banco

**Acesso:** `is_admin()` · `is_gestor()` · `get_my_usuario_id()` · `get_my_empresa_id()` ·
`usuario_in_my_empresa()` · `has_permission()` · `has_funcionalidade()` ·
`empresa_plano_ativo()` · `can_access_wa_conversa()` · `is_member_of_grupo()`

**Agregação:** `dashboard_stats()` · `dashboard_indicadores_vendedor()` ·
`pedidos_stats()` · `plano_vendas_progresso()` · `plano_vendas_progresso_por_vendedor()`

**Operação:** `criar_funil()` · `upsert_meta_venda()` · `delete_obras_bulk()` ·
`seed_default_status_obras()` · `validar_codigo_empresa()` ·
`restaurar_usuario_por_email()` · `montar_permissoes_preset_padrao()` ·
`parse_endereco_livre()` · `normalize_whatsapp_phone()` · `wa_buscar_mensagens()` ·
`wa_iniciar_conversa()` · `delete_current_user()`

**Apelidos legados:** `get_my_vendedor_id()` · `vendedor_in_my_empresa()` —
[não remova sem varrer as políticas](../divida-tecnica.md).

---

## 14. Regras ao mexer no banco

1. **Toda tabela nova nasce por migration**, com RLS habilitada e política escrita no
   mesmo arquivo. **Nunca pelo painel do Supabase** — foi assim que a `webhook_debug`
   ficou sem proteção.
2. **Nunca edite migration existente.** Só acrescente arquivo novo.
3. **Carregue `empresa_id`** na tabela nova, mesmo que dê para chegar lá por junção.
4. **Some no banco**, não no navegador.
5. **Atualize `src/integrations/supabase/types.ts` à mão** — não há banco local para
   regenerar.
6. **Teste como `vendedor` comum**, não só como gestor.

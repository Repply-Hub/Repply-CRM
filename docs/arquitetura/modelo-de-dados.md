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

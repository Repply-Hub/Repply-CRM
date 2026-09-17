# Faixa "Agendados para retornar" — desenho

**Data:** 2026-09-17
**Autor:** Lucas (dono do produto) + Claude
**Escopo:** uma seção recolhível nova no fim do Radar de Risco (tela "Hoje"), com uma tabela dos
negócios adiados por "Retomar depois", resumo de engajamento para gestor, e a ação de trazer o
negócio de volta. Mexe no banco (funções novas) e no front.

## Contexto

Ao consertar o "pede atenção" (17/09, `20260917120000`), os negócios com um "Retomar depois"
agendado pra frente **saem** da conta de "pedem atenção" até a data. Eles continuam encontráveis
em Tarefas e no próprio negócio, mas não têm uma **vitrine própria**. Esta é a parte B, que o dono
do produto adiou de propósito e agora pediu: um lugar para **ver** os agendados, com um ângulo de
**engajamento** para o gestor (quem usa mais, quanto valor está "guardado").

## O conjunto

A tabela lista **só os "Retomar depois"**: negócios abertos (status ≠ `fechamento`/`perdido`) com
um retorno agendado **pra frente** — existe `historico_contatos` com `tipo='retorno'` e
`proximo_contato_em >= hoje`. A **data de retorno** de cada negócio é o `max(proximo_contato_em)`
futuro. Tarefa sem retorno agendado **não** entra (isso vive em Tarefas).

**Simetria:** é o outro lado da moeda do "pedem atenção". Um negócio com retorno futuro está aqui;
quando a data chega, ele sai daqui sozinho e volta para "pedem atenção". Nunca nos dois ao mesmo
tempo (a mesma coluna `proximo_contato_em >= hoje` decide os dois lados).

## Onde fica e como se abre

No fim do `RadarDeRisco`, **depois** dos gráficos (a ordem hoje é cartões → tabela do time →
gráficos; esta faixa entra por último). Usa o `Collapsible` que já existe em `components/ui`.

- **Fechada:** uma linha só, com a setinha (chevron) à direita, mostrando o resumo:
  *"Agendados para retornar · N negócios · R$ X guardados"*. Para gestor / quem vê a pauta toda, o
  resumo é do **time**; para os demais, dos **próprios** agendados.
- **Aberta:** revela o conteúdo abaixo.

## Conteúdo (aberta)

1. **Resumo por vendedor** (no topo) — *Fulano: 8 · R$ X · Ciclano: 3 · R$ Y*. **Só** para gestor /
   quem vê a pauta toda, e isso é **garantido no servidor** (a função devolve `[]` para quem não
   tem a chave, como `dashboard_negocios_risco` já faz com `risco_por_vendedor`). Nunca é só
   esconder na tela (CLAUDE.md §6.1).
2. **A tabela**, com a **mesma cara** da "negócios da equipe que pedem atenção" (`TabelaDoTime`):
   colunas negócio, responsável (rosto + nome), valor, **"Volta em"** (a data do retorno) e a
   etiqueta de tentativas; larguras ajustáveis, ordenável por qualquer coluna, "Ver mais" de 10 em
   10. Ordem padrão: **"Volta em" mais próximo primeiro** (o que volta antes aparece no topo).
3. **Vazio:** "Nenhum negócio agendado" quando não há nada (e a faixa fechada mostra 0 / pode nem
   aparecer se não houver agendado — decisão de implementação, mas nunca mentir número).

## Duas ações por linha

- **Abrir negócio** — abre o painel do negócio, igual à tabela do time (botão laranja).
- **Trazer de volta agora** — desfaz o "Retomar depois" **atual**:
  - remove o(s) registro(s) de `historico_contatos` `tipo='retorno'` com `proximo_contato_em >=
    hoje` do negócio (o agendamento ativo) — **não** os retornos passados;
  - apaga a **tarefa** que aquele "Retomar depois" criou (identificada por `pedido_id`, aberta,
    `titulo` começando com "Retomar contato " e `prazo_final` na data do retorno removido — para
    não tocar tarefas manuais nem de outros negócios);
  - com isso o negócio **volta na hora** para "pedem atenção" (não tem mais retorno futuro), e a
    **contagem de tentativas cai** exatamente o tanto que foi desfeito.
  - 🔴 **É irreversível** (apaga linhas), então tem **confirmação** antes ("Isso cancela o
    agendamento e apaga a tarefa criada. Continuar?"), e a exclusão **confere a contagem** (zero
    linhas apagadas com erro de permissão não pode virar "deu certo" — CLAUDE.md §4.6).

**Regra da tentativa (exemplo do dono do produto):** negócio na 2ª tentativa → "Retomar depois" →
vira 3ª e vai para os agendados → "Trazer de volta" → volta a ser **2ª**, como estava. Só o
registro do agendamento ativo some; os anteriores continuam contando.

## Camada de dados (banco)

Três funções novas, no padrão das que já existem. Nenhuma tabela nova.

1. **`negocios_agendados_de(p_usuario_id, p_usuario_ids, p_fabricante_ids, p_funil_id, p_etapas,
   p_limite, p_deslocamento, p_ordenar_por, p_ascendente)`** + invólucro **`negocios_agendados(...)`**
   — espelham `negocios_em_risco_de`/`negocios_em_risco`. Base: negócios abertos da empresa com
   retorno futuro; filtro `ve_pauta_de_todos(p_usuario_id) OR usuario_id = p_usuario_id`. Devolve
   id, nome_exibido, fabrica, etapa, responsavel/_id/_avatar, valor, **data_retorno**
   (`max(proximo_contato_em)` futuro), tentativas, total_geral, valor_geral (o "valor guardado").
   Ordenação por lista branca com teto de 100 (§7.9). `_de` **fechada** (só `service_role`); o
   invólucro concedido a `authenticated`.

2. **`dashboard_agendados(...)`** — espelha `dashboard_negocios_risco`. Devolve `qtd_total`,
   `valor_total` (valor guardado) e `agendados_por_vendedor` (jsonb), este último **só** quando
   `eu_vejo_pauta_de_todos()` (senão `[]`). É o que alimenta a linha fechada e o resumo por
   vendedor. Concedida a `anon`/`authenticated`/`service_role` (é lida pelo navegador).

3. **`cancelar_retorno(p_pedido_id uuid)`** `SECURITY DEFINER` — espelha as guardas de
   `registrar_retorno`: `empresa_plano_ativo()` + `posso_agir_no_negocio(p_pedido_id)`. Apaga os
   `historico_contatos` de retorno com `proximo_contato_em >= hoje` do negócio e a tarefa criada
   por eles (heurística do título + prazo acima). Devolve a contagem do que apagou (para a tela
   tratar zero como recusa). Concedida a `authenticated` (revoga `anon`/`public`). É a única que
   **apaga dado** — aplicação em produção passa pelo "pode" do Lucas.

`src/integrations/supabase/types.ts` ganha as três à mão (o arquivo é gerado, mas não há banco
local — CLAUDE.md §6.8).

## Camada de tela (front)

- **`AgendadosParaRetornar.tsx`** (novo, em `components/pauta/`) — o `Collapsible` no fim do Radar.
  Cabeçalho = resumo (linha fechada). Corpo = resumo por vendedor (quando houver) + a tabela.
- **A tabela reaproveita o estilo da `TabelaDoTime`.** Onde a estrutura (larguras ajustáveis, menu
  de ordenação, rosto do responsável, paginação) for igual, extrair a parte comum para um
  componente compartilhado em vez de copiar — decisão fina para o plano, mantendo a mesma cara.
- **Hooks:** `useNegociosAgendados` (lista, espelha `useNegociosEmRisco`), `useDashboardAgendados`
  (resumo), `useCancelarRetorno` (mutação).
- **Invalidação após "Trazer de volta"** (a mesma família que `useRegistrarRetorno` toca, agora ao
  contrário): `pauta-do-dia`, `dashboard_negocios_risco`, `negocios_em_risco`, `dashboard_agendados`,
  `negocios_agendados`, `tarefas`, `tarefas_por_pedido`, `historico_contatos`, `notificacoes`.

## O que NÃO muda

- A pauta, o "pedem atenção" (recém-ajustado) e o `registrar_retorno` continuam como estão.
- Nenhuma tabela nova no banco; nenhuma migration que altere dado — só funções novas (e a
  `cancelar_retorno` só apaga quando o usuário manda, com permissão conferida).

## Fora de escopo

- Reabrir/reagendar em massa; notificação ao trazer de volta; filtros de período nesta faixa (é um
  retrato do que está agendado, não uma métrica por criação/fechamento — a pergunta do §5 não se
  aplica).

## Verificação

- **Banco:** ensaio em produção das três funções (transação com `RAISE` que desfaz tudo), medindo
  que a lista traz os agendados certos, que o resumo por vendedor vem `[]` para quem não tem a
  chave, e que `cancelar_retorno` (num negócio de teste) apaga o retorno futuro + a tarefa e
  **decrementa a tentativa** — tudo desfeito no RAISE. Papel `authenticated` de verdade.
- **Front:** TDD dos hooks e do componente; um teste que prende a **regra da tentativa** (trazer de
  volta volta de 3ª para 2ª) e o **corte por chave** (sem `pauta_de_todos`, sem resumo por
  vendedor). Bateria inteira verde, tsc na base, lint sem erro novo.
- **Permissão:** testar como vendedor comum (vê só os próprios; sem resumo por vendedor; só
  consegue trazer de volta o que `posso_agir_no_negocio` permite).

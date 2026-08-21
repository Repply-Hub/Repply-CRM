# Documentação técnica — Repply CRM

Índice do detalhe técnico. Os três documentos que valem mais estão **na raiz do
repositório**, não aqui:

| Documento | O que responde |
|---|---|
| [`../SPEC.md`](../SPEC.md) | O que o produto é, para quem, o que já faz de verdade, o que falta e por quê |
| [`../CLAUDE.md`](../CLAUDE.md) | Como trabalhar neste código sem quebrar nada |
| [`../README.md`](../README.md) | Como rodar, publicar e onde fica cada coisa |

---

## Por onde começar

**Nunca mexeu neste projeto?** Leia nesta ordem:

1. [`../SPEC.md`](../SPEC.md) — o produto e o domínio da representação comercial
2. [`../README.md`](../README.md) — como rodar
3. [`../CLAUDE.md`](../CLAUDE.md) — as regras e as armadilhas
4. [`divida-tecnica.md`](divida-tecnica.md) — o que está quebrado, para não confundir bug
   conhecido com bug novo

**Vai mexer num módulo específico?** Vá direto ao documento dele, abaixo.

---

## Arquitetura

| Documento | O que contém |
|---|---|
| [`arquitetura/modelo-de-dados.md`](arquitetura/modelo-de-dados.md) | As 74 tabelas por domínio, como se ligam, e as ambiguidades herdadas que já causaram bug |
| [`arquitetura/permissoes-e-rls.md`](arquitetura/permissoes-e-rls.md) | Os quatro papéis, as permissões por módulo, o portão de plano e a segurança por linha do Postgres |
| [`arquitetura/integracoes-externas.md`](arquitetura/integracoes-externas.md) | Todos os serviços externos, o que trocar ao montar um ambiente novo, e por que o `vercel.json` é do jeito que é |
| [`arquitetura/integracoes-google-e-automacao.md`](arquitetura/integracoes-google-e-automacao.md) | Google Maps, o Gmail legado, e a tabela `configuracoes_automacao` depois da consolidação multi-empresa |

## Módulos

| Documento | O que contém |
|---|---|
| [`modulos/negocios.md`](modulos/negocios.md) | O pipeline: filtros, estado compartilhado entre quadro e lista, desempenho |
| [`modulos/dashboard.md`](modulos/dashboard.md) | Cada métrica do Dashboard e do Plano de Vendas, **de qual coluna de data ela sai e por quê**. A conversão de safra, os dois contadores de "fechados", e a armadilha de desempenho que proíbe o `p_date_field` |
| [`modulos/importacao.md`](modulos/importacao.md) | O assistente de importação ponta a ponta. Conversão de data corrigida em `446779ff` |
| [`modulos/whatsapp.md`](modulos/whatsapp.md) | Integração uazapi: banco, funções, provisionamento de instância, bugs |
| [`modulos/email.md`](modulos/email.md) | Integração Nylas: conexão, sincronização, quem enxerga a caixa |
| [`modulos/anexos.md`](modulos/anexos.md) | Arquivos anexados a negócio, e o armazenamento |
| [`modulos/landing-e-assinatura.md`](modulos/landing-e-assinatura.md) | A landing pública e o fluxo de cadastro com pagamento |

## Operação

| Documento | O que contém |
|---|---|
| [`operacao/colocar-no-ar.md`](operacao/colocar-no-ar.md) | Passo a passo para publicar mudanças que dependem de configuração fora do código |
| [`operacao/cobranca-stripe.md`](operacao/cobranca-stripe.md) | O que falta fazer fora do repositório para a cobrança funcionar |
| [`operacao/guia-de-paginas.md`](operacao/guia-de-paginas.md) | Para que serve cada tela, em linguagem de negócio. Serve de material de uso |
| [`operacao/plano-reparo-datas.md`](operacao/plano-reparo-datas.md) | **Proposto, não executado.** Como reparar as datas trocadas dos 11.903 negócios já importados |
| [`operacao/plano-blindagem-whatsapp.md`](operacao/plano-blindagem-whatsapp.md) | **Fase 0 executada, fases 1–4 propostas.** As duas falhas de segurança do WhatsApp: senha exposta e webhook sem autenticação — **o quê e o porquê** |
| [`operacao/plano-blindagem-whatsapp-execucao.md`](operacao/plano-blindagem-whatsapp-execucao.md) | O **passo a passo** das fases 1 a 4 do documento acima: 10 tarefas, com código, comandos e critério de aprovação de cada uma |
| [`operacao/plano-controle-de-acesso.md`](operacao/plano-controle-de-acesso.md) | **Desenho aprovado, nada implementado.** Ligar e desligar seções por empresa: presets, exceções, e as três camadas de recusa. Fecha o Portal, hoje aberto para todas as empresas |
| [`operacao/plano-controle-de-acesso-execucao.md`](operacao/plano-controle-de-acesso-execucao.md) | O **passo a passo**: 13 tarefas com o código de cada uma, o ponto de parada antes da trava do Portal, e o critério de aprovação de cada fase |

## Dívida

| Documento | O que contém |
|---|---|
| [`divida-tecnica.md`](divida-tecnica.md) | **27 itens** com gravidade, custo real e ordem de conserto. Mais o que já foi resolvido |

---

## Regra de manutenção

**Documento que mente é pior que documento que não existe.** Este conjunto foi reorganizado
em 19/08/2026 justamente porque três documentos descreviam o Gmail como provedor de e-mail
semanas depois da migração para o Nylas, e um chamava o produto de "Repply Imob".

Ao mudar comportamento:

1. Se a mudança altera **o porquê** de algo, atualize [`../SPEC.md`](../SPEC.md)
2. Se altera **como se trabalha no código**, atualize [`../CLAUDE.md`](../CLAUDE.md)
3. Se altera **um módulo**, atualize o documento dele aqui
4. Se resolve uma dívida, mova o item para a seção "Resolvidos" de
   [`divida-tecnica.md`](divida-tecnica.md), com data e commit

---

## O que foi removido nesta reorganização

Nada foi perdido — o conteúdo correto foi migrado para os documentos acima.

| Removido | Por quê | Para onde foi |
|---|---|---|
| `docs/auth-structure.md` | Descrevia a tabela `vendedores`, renomeada para `usuarios` em abril/2026 | `arquitetura/permissoes-e-rls.md`, reescrito |
| `docs/projeto.md` | Visão geral rasa e desatualizada | `../SPEC.md` |
| `docs/IMPORT_STRUCTURE.md` | Cópia antiga da versão da raiz, com conteúdo divergente | `modulos/importacao.md` §12–14 |
| `docs/IMPORTACAO_ESTRUTURA_ATUAL.md` | Sobreposto | `modulos/importacao.md` §12–14 |
| `importacoes_resumo.md` | Sobreposto | `modulos/importacao.md` |
| `LinhasIgnoradas.md` | Era guia de uso de uma tela, não documentação técnica | `operacao/guia-de-paginas.md` (o técnico já estava em `modulos/importacao.md` §9) |
| `docs/uazapi-instancias-analise.md` | Sobreposto | `modulos/whatsapp.md` §8 |
| `documentacao-email.md` | Descrevia o **Gmail** como provedor atual | `modulos/email.md`, reescrito para o Nylas |
| `integracao_email.md` | Idem | `modulos/email.md` |
| `docs/integracoes-gmail-maps.md` | **Mantido**, renomeado — tem conteúdo verificado sobre Maps e automação que não estava em nenhum outro lugar | `arquitetura/integracoes-google-e-automacao.md`, com aviso de que o Gmail é legado |
| `docs/PLANO_LP_E_PAGAMENTO.md` | Plano já executado | `operacao/cobranca-stripe.md` + `modulos/landing-e-assinatura.md` |
| `docs/HANDOFF_REPPLY_IMOB_LP.md` | **Mantido**, renomeado e com o produto corrigido | `modulos/landing-e-assinatura.md` |

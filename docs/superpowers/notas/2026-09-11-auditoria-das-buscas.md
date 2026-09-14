# Levantamento das barras de busca — 11 e 12/09/2026

**Método.** Navegador do app, em conta real de teste, com as Tasks 1 e 2 do Bloco 1 já aplicadas
(teto de largura no `PopoverContent`, teto de altura no `CommandList`, reticências no
`CommandInput`, e as alturas locais retiradas). Larguras: **375×812** (celular), **768×1024**
(tablet), **1024×768** e **1280×720** (computador). Cada busca aberta do zero, recarregando a
página a cada largura — com o painel do navegador escondido, um menu já aberto não se
reposiciona ao mudar o tamanho.

**Critérios:** (a) nada sai pela borda; (b) o último item da lista é alcançável; (c) o texto de
ajuda não corta no meio de uma palavra; (d) os vizinhos continuam visíveis.

"ok" só para o que foi aberto e passou. O que não pôde ser aberto com a conta usada está
marcado como tal — nunca como "ok". Medidas em pixels da tela (esquerda–direita do campo).

## Buscas em menu suspenso

| # | busca | 375 | 768 | 1280 | defeito | receita / commit |
|---|---|---|---|---|---|---|
| 1 | Cadastrar Empresa, passo 4 — seletor de contato | menu ok (abre acima do campo, 45–331, lista 285 rolando); **a fileira de botões estourava**: o terceiro botão terminava em 397 com o diálogo em 363 | — | — | fileira `flex gap-2` sem quebra | `3bb478cb`; **reconferido: o terceiro botão desce para a 2ª linha, os três dentro do diálogo (12–363)** |
| 2 | Ficha do cliente — Vincular contato existente | ok (37–339, lista 300) | ok (153–615, lista 300) | ok (lista encolhe para 267 para caber — o teto novo funcionando) | — | — |
| 4 | Agenda — Novo evento, Participantes (era `w-[400px]`) | ok (359 px, 16–375) | | | — | teto do Task 1 |
| 5a | Nova rota de visita — Participantes (era `w-[400px]`) | ok (359 px) | | | — | teto do Task 1 |
| 5b | Nova rota de visita — Adicionar obra (era `w-[420px]`) | ok (359 px, lista 240 rolando) | | | — | teto do Task 1 |
| 6 | Novo negócio — Responsáveis (`w-[260px]`) | não verificável na conta usada: botão desabilitado | | | — | — |
| 7a | Novo negócio — Cliente | ok (302 px, lista 300 rolando) | | | — | — |
| 7b | Novo negócio — Fabricante | ok (302 px) | | | — | — |
| 9 | Filtros de Negócios — escolha múltipla | não aberto | | | — | — |
| 1b | Cadastrar Empresa, passo 3 — endereço | campo 302 px ok; sugestões não apareceram em 3 s | | | — | — |

## Buscas de tela (barra do topo)

| # | busca | 375 | 768 | 1280 | defeito | receita / commit |
|---|---|---|---|---|---|---|
| 3 | Clientes | ok (214) | ok (220) | ok (429) | — | — |
| 3b | Obras | **78 px**, espremida ao lado das abas | ok (387) | ok (302) | a linha não quebra | `5a9799f8` não resolveu (o `flex-1` embutido no componente vence o `w-full`); `bce1c260` com `flex-none` resolveu — **reconferido: 16–359 no celular, 387 a 768, 303 a 1280** |
| 3c | Tarefas | ok (219) | ok (329) | ok (556) | — | — |
| 3d | Fabricantes | ok (294) | | | — | — |
| 9b | Negócios — busca principal | ok (linha inteira) | ok (240) | ok (345) | — | — |
| 15 | Chat — "Buscar conversas ou membros" | **cortada** (começava em −34) e a conversa ao lado espremida (o campo de mensagem virava uma coluna de letras) | ok (239; mensagem 272) | ok (239; mensagem 784) | arrumação da página no celular | decisão do dono do produto: no celular, lista **ou** conversa, com voltar → `ee4ded63`; conserto da travessia de tamanho → `1f3a794b`. **Reconferido: lista 8–366 sozinha; conversa sozinha com o voltar em 12–40; 768 e 1280 iguais a antes** |
| 16 | E-mails — "Pesquisar e-mails" | **não aparecia** (bloco `hidden md:flex`) | **estourava** (696–824 numa tela de 768) | ok | escondida abaixo de 768 e fileira que não quebra | decisão do dono do produto: no celular, numa linha própria → `d263eca4`, `fb3768d6` e `c9acd8ff` (a fileira só volta a ser uma linha só a partir de 1280). **Reconferido: 375 = 16–151, 768 = 80–530, 1024 = 80–738 (fileira 802 de 802), 1280 = 706–994** |
| 22 | Portal — "Buscar por CNPJ, empresa, licença, obra" | **74 px**, espremida ao lado das datas | ok (201) | ok (702) | a linha não quebra | `98a13bff` — **reconferido: 12–363 no celular** |
| 10–14 | WhatsApp (todas) | não verificável na conta usada | | | — | — |
| 18 | Configurações — Usuários, Empresas, Permissões, WhatsApp | não verificável na conta usada (perfil de vendedor só vê a aba Perfil) | | | — | — |
| 19 | Painel — Plano de vendas | nenhuma busca na tela inicial dessa conta | | | — | — |

## Achados fora das receitas

- **Nova rota de visita (Obras) no celular:** não é um diálogo, é um painel lateral na mesma linha
  da lista de obras. No celular o painel ocupava a largura e a coluna da lista ficava por baixo dele
  — a busca da lista aparecia sobre o título do painel. Decisão do dono do produto: no celular
  aparece só o painel, e a lista volta ao fechar → `49588ea0`. **Reconferido: a 375 o painel ocupa
  16–359 com as abas e a busca escondidas, e fechar devolve a lista; a 768 painel (296–744) e lista
  (busca 88–280) continuam lado a lado.**
- **Chat, travessia de tamanho:** com a coluna da equipe recolhida no computador, estreitar a janela
  até o celular deixava a lista com 48 px. Consertado em `1f3a794b`. **Reconferido: ao estreitar, a
  lista ocupa 8–366; ao voltar a alargar, a coluna reaparece recolhida como estava.**
- **Barra de seleção em massa dos E-mails no celular:** conferida a 375 com itens marcados — cabe
  na linha (a fileira mede 134 de 134 disponíveis), sem rolagem lateral da página.
- **Comportamento (não tamanho):** o seletor de contato de "Vincular contato existente" guarda o
  texto digitado entre fechar e reabrir o diálogo.

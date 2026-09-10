# Manual do usuário — Repply CRM

Para quem **usa** o sistema no dia a dia: representantes, gestores e equipe comercial.
Sem termo técnico. Se você é desenvolvedor, o que procura está em [`../SPEC.md`](../SPEC.md)
e [`README.md`](README.md).

> **O que é o Repply CRM.** É o lugar onde a sua empresa de representação acompanha as
> negociações, a carteira de clientes, as obras, as marcas representadas e a conversa com
> o cliente (WhatsApp e e-mail) — tudo num só sistema. Cada empresa tem o seu espaço
> fechado: você só enxerga os dados da sua empresa.

---

## Índice

1. [Primeiros passos](#1-primeiros-passos)
2. [Como o sistema é organizado](#2-como-o-sistema-é-organizado)
3. [Quem pode ver e fazer o quê](#3-quem-pode-ver-e-fazer-o-quê)
4. [As telas, uma a uma](#4-as-telas-uma-a-uma)
5. [Importar planilhas](#5-importar-planilhas)
6. [Assinatura e cobrança](#6-assinatura-e-cobrança)
7. [Quando algo dá errado](#7-quando-algo-dá-errado)
8. [Glossário](#8-glossário)

---

## 1. Primeiros passos

### Entrar pela primeira vez

Você precisa de um **código de acesso** da sua empresa. Quem administra a equipe
(o titular da conta ou um gestor) gera esse código em **Configurações › Usuários** e te
passa.

1. Abra o endereço do sistema e clique em **Criar conta / Cadastro**.
2. Informe seu nome, e-mail, senha e o **código de acesso** da empresa.
3. Pronto — você entra já ligado à equipe certa.

### Entrar no dia a dia

Login com **e-mail e senha**. Esqueceu a senha? Clique em **Esqueci minha senha**, você
recebe um link por e-mail para cadastrar uma nova.

### O que você vê ao entrar

- **Menu lateral (à esquerda)** — a lista de telas. O que aparece ali depende do seu
  plano e das suas permissões; nem toda empresa tem todas as telas ligadas.
- **Sino de notificações (no topo)** — avisos de coisas que aconteceram (novo negócio,
  mudança de etapa, mensagem recebida).
- **Seu perfil (canto inferior do menu)** — foto, nome, atalho para **Configurações ›
  Perfil** e o botão de **sair**.

Você pode **renomear e reordenar** os itens do menu no seu próprio login, sem afetar os
colegas (botão de editar menu, no rodapé da lista).

---

## 2. Como o sistema é organizado

O objeto central é o **Negócio** — que é um **orçamento**. Quase tudo gira em torno dele:

- Um **Negócio** pertence a um **Cliente** (a empresa que compra) e é de um **Fabricante**
  (a marca que você representa). Pode estar ligado a uma **Obra**.
- Um **Cliente** tem um ou mais **Contatos** (as pessoas dentro dele).
- Cada Negócio está numa **Etapa** do funil (a coluna do quadro), e caminha da primeira
  etapa até o fechamento.
- Cada Negócio tem um **responsável** — o membro da equipe que cuida dele.

Termos da tela e o que significam de verdade estão no [Glossário](#8-glossário).

---

## 3. Quem pode ver e fazer o quê

Existem quatro tipos de acesso:

| Tipo | Quem é | O que alcança |
|---|---|---|
| **Titular da empresa** | Quem criou a conta | A empresa inteira, sem restrição |
| **Gestor** | Membro promovido a gerente | A empresa inteira, sem restrição |
| **Vendedor** | Membro comum da equipe | Só o que as permissões dele liberarem |
| **Admin Repply** | Suporte da Repply | Administração do serviço — **não** enxerga o funil comercial de ninguém |

Para o **vendedor**, o gestor define, em **Configurações › Usuários**, o que ele pode em
cada tela: **ver, criar, editar, excluir**, mais permissões específicas (importar,
exportar, mover card, enviar WhatsApp, gerar PDF, filtrar por vendedor…). Há **modelos de
permissão** (presets) para não configurar tudo na mão a cada pessoa nova.

> Esconder um botão é só conforto visual — a barreira de verdade é no banco de dados.
> Um vendedor sem permissão de ver os negócios dos colegas **não consegue** vê-los, nem
> por link direto.

---

## 4. As telas, uma a uma

A ordem abaixo é a do menu. Algumas telas podem estar desligadas para a sua empresa.

### 🌅 Hoje — a pauta do dia

Uma **fila de trabalho**: os negócios que pedem uma ação sua hoje, em ordem, com o valor
em jogo ao lado e um botão de ação. Não é um mural de avisos — é o que fazer agora.

Cada item traz um verbo ("Retornar", por exemplo). Você age ou **adia** o item. O
**Radar de risco** destaca o que está parado há mais tempo.

**Quando usar:** ao começar o dia, para saber por onde atacar.

> Disponível hoje para a MD Representações; sendo liberada para as demais empresas aos
> poucos.

### 📋 Negócios — o funil de vendas

A tela principal. Mostra os negócios de dois jeitos, a partir dos mesmos dados:

- **Quadro (Kanban)** — cada coluna é uma etapa. **Arraste o card** de uma coluna para
  outra para mudar a etapa da negociação.
- **Lista** — tabela, boa para ver valores e localizar um negócio específico.

O que dá para fazer:

- **Novo negócio** — botão no topo. Informe cliente, fabricante, valor, data de
  fechamento prevista e os campos que a sua empresa configurou.
- **Editar** — abre a ficha completa do negócio.
- **Filtrar** — por responsável, fabricante, cliente, etapa, período. Os filtros valem
  para o quadro e para a lista ao mesmo tempo.
- **Ações em massa** — marque vários negócios (ou use **"selecionar todos que casam com
  o filtro atual"**) e, de uma vez: mudar de etapa, trocar o responsável ou excluir.

**Configurável pela sua empresa** (em Configurações, ou com quem administra):

- **Funis** — sua empresa pode ter mais de um funil.
- **Etapas** — nome, cor e ordem das colunas, por funil.
- **Campos do negócio** — campos próprios da sua empresa, inclusive **obrigatórios só a
  partir de uma etapa** (ex.: "número do pedido" vira obrigatório quando o negócio chega
  em "Fechado").
- **Colunas da lista** — quais aparecem e em que ordem.

**Sobre "Data de Fechamento":** no negócio aberto ela é uma **previsão**. Os valores do
Dashboard que dependem de fechamento só contam o negócio quando ele é de fato ganho.

### 📊 Dashboard — os números do time

Painel de desempenho comercial:

- **Faturamento mensal**
- **Taxa de conversão** (dos negócios criados no período, quantos foram ganhos)
- **Ticket médio**
- **Velocidade de resposta dos fabricantes**
- **Rendimento por responsável e por fábrica**
- **Exportar em PDF**

Filtre por período para ver a tendência. Um vendedor comum vê os próprios números e a
visão geral; o gestor vê tudo.

**Plano de Vendas** (dentro do Dashboard): **metas por fabricante**, em duas camadas —
**meta da equipe** e **meta individual**. O vendedor vê a própria barra e a meta geral;
editar metas é função do gestor. A ordem das fábricas na tela é ajustável.

> A meta mostrada é sempre a do **mês inteiro**, mesmo quando você filtra um período mais
> curto. É de propósito.

### 👥 Clientes

A carteira: todas as empresas com quem você trabalha e as pessoas dentro delas
(**Contatos**).

- Buscar, filtrar por tipo (construtora, loja, pessoa física — os tipos são configuráveis
  pela sua empresa).
- **Importar** uma planilha de clientes e **exportar** a lista.
- Cada cliente e cada contato tem uma **página própria** com dados, negócios ligados e
  **histórico de interações**.

**Quando usar:** cadastrar cliente novo, consultar contato, ver o histórico de um cliente.

### 🏗️ Obras

O canteiro de obra, ligado ao cliente. Cada obra tem endereço de entrega, CNPJ da SPE
(quando tem CNPJ próprio) e status (ativa, concluída, parada — configurável pela sua
empresa).

O endereço vira **ponto no mapa** automaticamente. O mapa é aberto (OpenStreetMap), sem
custo. A localização por endereço processa **um endereço por segundo** — em importações
grandes, o mapa se completa aos poucos.

**Quando usar:** cadastrar obra, consultar endereço de entrega, ver quais obras estão
ativas.

### 🏭 Fabricantes

As marcas que a sua empresa representa. Para cada uma: dados de contato, CNPJ, e a data da
**última atualização da tabela de preços**.

Inclui **catálogo de produtos** e **tabela de preços** por fabricante, com categorias e
importação por planilha.

> Catálogo e preços são **da sua empresa** — nenhuma outra empresa vê os seus. Qualquer
> membro da equipe pode cadastrar e editar (não precisa ser gestor).

### 🔍 Portal de Consultas — prospecção

Lê **licenças de construção** emitidas por órgãos públicos e transforma numa lista de
possíveis novos clientes e obras.

> **Cobre só o Rio Grande do Norte** (licença ambiental do IDEMA, Diário Oficial de Natal
> e de Extremoz) e é **exclusivo da MD Representações**. As demais empresas não têm esta
> tela.

### 📅 Calendário

Sua agenda visual: prazos de negócios, follow-ups e eventos que você criar. Visão por
mês, semana ou dia. Dá para criar vários eventos de uma vez e adicionar participantes.

> ⚠️ **O lembrete automático de evento ainda não é enviado.** Use o calendário para se
> organizar, mas não conte com um aviso automático na hora do compromisso.

### ✅ Tarefas

Quadro próprio de atividades da equipe, com responsável, prazo e marcadores. Colunas
configuráveis (a fazer, fazendo, feito, ou como a sua empresa preferir).

Uma tarefa pode estar ligada a **um negócio** ou a **uma conversa de WhatsApp** — é assim
que se organiza a cobrança de um retorno.

### 💬 Chat interno

Conversa em tempo real **entre os membros da equipe**, dentro do sistema. Grupos por
projeto ou tema, confirmação de leitura (com a foto de quem já viu) e indicador de quem
está online.

Não é o WhatsApp do cliente — é a conversa interna do time.

### 📱 WhatsApp

A conversa com o **cliente**, dentro do CRM.

- **Conectar o número:** em **Configurações › WhatsApp**, escaneie o **QR Code** com o
  celular (mesma ideia do WhatsApp Web). Feito isso, as conversas aparecem na tela.
- **Caixa de entrada** com todas as conversas.
- **Enviar** texto, foto, documento e áudio.
- **Grupos** — criar, adicionar e remover participantes.
- **Reagir**, apagar mensagem, ver e trocar a foto do contato, renomear o contato.
- **Responsável pela conversa** — quem do time está cuidando daquele cliente.

### 📧 E-mail

Sua caixa de e-mail dentro do sistema.

- **Conectar a caixa** em **Configurações** (ou pelo aviso na própria tela).
- Ler, responder na mesma conversa, organizar por pastas e marcadores.
- **Rascunho com salvamento automático.**
- **Assinatura** com o logo da empresa, em texto ou imagem.

> ⚠️ **A atualização automática ainda não roda.** A caixa só busca e-mails novos quando
> você clica em **atualizar** na tela. Pegue o hábito de atualizar ao abrir.

### ⚙️ Configurações

Seis abas:

| Aba | Para quê |
|---|---|
| **Perfil** | Sua foto, seu nome, sua assinatura de e-mail |
| **Usuários** | Adicionar e remover membros, definir permissões, gerar o **código de acesso** da empresa |
| **WhatsApp** | Conectar o número por QR Code |
| **Automação** | Regras automáticas da empresa |
| **Campos** | Criar e configurar os campos próprios dos negócios |
| **Empresa** | Nome e logo da empresa (aparece no rodapé dos e-mails e no topo dos PDFs) |

As mudanças de permissão ficam registradas (quem mudou o quê e quando).

### Área da Repply (`/admin`)

Só o suporte da Repply acessa. Serve para cadastrar empresas assinantes, definir plano e
provisionar o número de WhatsApp. Não toca no funil comercial de ninguém.

---

## 5. Importar planilhas

Existe importação em **Clientes**, **Negócios** e **Catálogo** (dentro de Fabricantes).
O assistente tem **três passos**:

1. **Enviar o arquivo** — Excel (`.xlsx`) ou CSV.
2. **Conferir o de-para das colunas** — o sistema tenta adivinhar qual coluna da sua
   planilha corresponde a cada campo; ajuste o que estiver errado.
3. **Conferir a prévia e confirmar.**

**Cuidados na prévia — vale a pena olhar:**

- **Datas.** Planilhas exportadas de outros sistemas (Bitrix24, por exemplo) às vezes
  trazem a data no formato americano (mês/dia). A prévia **avisa quando alguma data de
  criação cai depois de hoje** — se aparecer esse aviso, a coluna de data provavelmente
  está sendo lida trocada. Não confirme; ajuste a planilha e reenvie.
- **CNPJ.** Se o CNPJ aparecer como número "quebrado" (`1,23457E+13`), a planilha está
  guardando como número. Formate a coluna como **texto** antes de exportar.

As linhas que não passam na validação ficam guardadas para revisão, com o motivo de cada
uma.

---

## 6. Assinatura e cobrança

- A empresa assina um **plano**. Enquanto a assinatura está em dia, tudo funciona
  normalmente.
- Se a assinatura fica **em atraso**, o sistema **bloqueia a criação e a edição** de
  dados — você ainda consegue **consultar**, mas não gravar. A tela leva para a página de
  assinatura.
- O pagamento é pelo Stripe (cartão), com uma área para ver faturas e trocar o cartão.

Dúvida de cobrança ou de plano: falar com a Repply.

---

## 7. Quando algo dá errado

### "Saiu uma versão nova do sistema"

Apareceu essa mensagem? A aba estava aberta desde antes de uma atualização. **Recarregue
a página** — nada do seu trabalho é perdido. Se uma tela ficar estranha depois de uma
atualização, recarregar resolve.

### "Conta suspensa"

Sua conta foi desativada por quem administra a equipe. Fale com o gestor ou o titular da
empresa para reativar.

### "Você não está vinculado a nenhuma empresa"

O cadastro foi feito sem o código de acesso, ou o vínculo foi removido. Peça o **código
de acesso** a quem administra a equipe e refaça o cadastro.

### A tela fica "rodando" e não termina

Geralmente é uma consulta **pesada demais** — muitos dados de uma vez. Tente **filtrar
mais** (um período menor, um fabricante só). Se com o filtro estreito funciona, era
volume. Se persistir com pouca coisa, avise a Repply.

### Uma mensagem de WhatsApp "enviou" mas o cliente não recebeu

Confirme o número na conversa. Se for **grupo**, não altere o identificador manualmente.
Persistindo, avise a Repply.

---

## 8. Glossário

| Na tela | O que é de verdade |
|---|---|
| **Negócio** | Um **orçamento**. O objeto central do sistema |
| **Cliente** | A empresa que compra (construtora, loja, pessoa jurídica) |
| **Contato** | A pessoa dentro do cliente |
| **Fabricante / Representada** | A marca que você representa e vende |
| **Obra** | O canteiro. Pode ter CNPJ próprio (SPE) |
| **Etapa** | A coluna do funil |
| **Funil / Pipeline** | O caminho do negócio, da primeira etapa ao fechamento |
| **Responsável** | O membro da equipe que cuida do negócio ou da conversa |
| **Empresa** | A **sua** empresa de representação (a assinante do sistema) — não o cliente |
| **SPE** | CNPJ criado só para uma obra |
| **Tabela de preços** | A lista de preços vigente de um fabricante |
| **Alçada de desconto** | Até quanto o vendedor pode dar desconto sem pedir autorização |
| **Código de acesso** | A senha de convite da empresa, usada uma vez, no cadastro |

---

*Este manual descreve o comportamento em 03/09/2026. As ressalvas marcadas com ⚠️ são
limitações conhecidas, não defeitos do seu uso.*

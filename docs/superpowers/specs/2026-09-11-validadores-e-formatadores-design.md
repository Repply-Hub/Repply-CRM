# Validadores e formatadores: um campo de CNPJ só, e um telefone por campo

> Desenho validado com o dono do produto em 11/09/2026. É o **pacote 2** do lote de pedidos de
> 11/09/2026 (ver a memória `pacotes-de-correcoes-11-09-2026`).

## 1. Por que este trabalho existe

Quatro pedidos do Lucas que parecem separados e têm a mesma raiz:

1. **Fabricantes:** fábrica cujo CNPJ a Receita não encontra não pode ser criada — avisar para
   conferir o número, ou cadastrar sem CNPJ.
2. **Fabricantes:** verificar se o validador funciona em situações diferentes, e se os validadores
   do Repply no geral funcionam.
3. **Clientes:** o validador de CNPJ "não funciona quando o tipo não é construtora" — tem de
   funcionar para os tipos atuais, os que as empresas criaram e os que ainda vão criar.
4. **Clientes:** todo campo de telefone, em empresa e contato, precisa de um formatador que limite
   o que se digita.

A raiz comum: **cada tela tem o seu próprio jeito de validar**, e nenhum deles conta a verdade
quando algo dá errado.

## 2. O que existe hoje (medido em 11/09/2026 — não re-descubra)

### CNPJ

- **Três consultas à Receita, independentes:** `Clientes.tsx` (`handleCnpjLookup`),
  `Fabricantes.tsx` (a consulta do formulário) e `components/shared/CampoCnpj.tsx`. O próprio
  `CampoCnpj` diz no comentário que as outras duas "continuam com suas cópias por enquanto". É o
  cenário do conserto das datas que voltou por estar no arquivo que ninguém chamava.
- **`fetchCnpjData` (`src/lib/cnpj.ts`) trata tudo como "não encontrado":** `if (!res.ok) throw
  new Error('CNPJ não encontrado na base da Receita Federal')`. Recusa do serviço, excesso de
  consultas e empresa inexistente saem com a mesma frase. Só o tempo esgotado tem mensagem própria
  — e Clientes e Fabricantes engolem até essa: o `catch` delas mostra frase fixa.
- **O BrasilAPI separa os casos com clareza:** CNPJ inexistente volta **HTTP 404** com
  `{"type":"not_found","name":"NotFoundError"}` (medido com `98765432000198`). Existente volta 200.
  Cliente sem cabeçalho de navegador levou **403** do Cloudflare (`error code: 1010`).
- **13 CNPJs reais da base** (construtoras e o único cliente do tipo loja da MD com CNPJ) voltaram
  **todos 200, em menos de 1 segundo**.
- **Outros dois lugares com CNPJ e nenhuma consulta:**
  - `components/shared/EmpresaSelector.tsx` — o atalho de criar empresa dentro do Novo Negócio:
    máscara e dígito verificador, **nunca consulta a Receita**, e exige 14 dígitos mesmo para
    pessoa física.
  - `components/pedidos/FabricanteSelector.tsx` — o atalho de criar fábrica dentro do Novo
    Negócio: **sem máscara, sem validação, sem consulta**. Hoje cria fábrica com qualquer número.
- **Editar cliente** (`pages/ClienteDetalhe.tsx`): campo de texto comum, sem máscara nem
  validação. O rótulo troca entre CPF e CNPJ por `ehPessoaFisica(tipo)`, mas nada confere o valor.
- **Novo cliente** (`pages/Clientes.tsx`): rótulo sempre "CNPJ" e exige 14 dígitos quando o campo
  é obrigatório ou preenchido — **cliente pessoa física com CPF não passa**.
- **Não existe validador de CPF** no sistema.

### O bug do CNPJ por tipo

O Lucas reproduziu em **Clientes → Nova empresa**: com tipo loja (e outros), "CNPJ não encontrado
na Receita Federal"; com construtora, encontra. **O código não tem nenhum caminho que dependa do
tipo** — as 40 menções a `tipo` em `Clientes.tsx` foram conferidas uma a uma. A única comparação
com `'construtora'` do sistema (`NovoNegocioDialog.tsx`, `isConstrutora`) é variável declarada e
**nunca usada**.

Conclusão: o que falhou foram os **CNPJs específicos** do teste. Ou a empresa ainda não estava na
base pública (loja recém-aberta demora a aparecer), ou o serviço recusou a consulta naquele
momento — a tela de hoje não distingue. **Este trabalho resolve pelo único lado possível: a tela
passa a mostrar o motivo verdadeiro.**

### Telefone

- **3.759 cadastros** (clientes + contatos) têm telefone. **148 guardam mais de um número**, e o
  separador é **sempre a vírgula** — nenhum com barra, ponto e vírgula ou "e".
- A maioria está em dígitos crus (923 com 11 dígitos, 906 com 13 — o `55` do país grudado —, 842
  com 10, 396 com 12). **Nenhum começa com `+`.** Os ~530 já mascarados usam `(99) 99999-9999` ou
  `(99) 9999-9999`, **sem `+55`**.
- **Duas funções de telefone com formatos diferentes:** `formatarTelefone` (`src/lib/telefone.ts`)
  escreve `+55 (84) 99999-8888` e **corta tudo depois do 11º dígito** — aplicada a um campo com
  dois números, apaga o segundo. É usada na ficha do contato e no WhatsApp.
  `telefoneParaCadastro` (`src/lib/contato-da-conversa.ts`) escreve `(84) 99999-8888`, sem `+55`,
  e devolve intacto o que não reconhece. É usada em Fabricantes e em `telefoneDaReceita`.
- O reconhecimento de contato do WhatsApp separa os números por `[,;/]`
  (`contato-da-conversa.ts`) — qualquer desenho que mantenha a vírgula no banco continua
  compatível.

**Os 13 campos de telefone de cadastro:**

| Onde | O que cadastra |
|---|---|
| `pages/Clientes.tsx` | telefone da empresa; telefone do contato no assistente de empresa; telefone do contato novo |
| `pages/ClienteDetalhe.tsx` | editar telefone da empresa; contato novo dentro da empresa |
| `pages/ContatoDetalhe.tsx` | editar telefone do contato (hoje com `formatarTelefone`, `+55`) |
| `pages/Fabricantes.tsx` | telefone da fábrica |
| `components/fabricantes/ContatosDaFabrica.tsx` | contato da fábrica |
| `components/shared/EmpresaSelector.tsx` | atalho de empresa no Novo Negócio |
| `components/obras/SeletorContatosObra.tsx` | contato novo criado dentro da obra |
| `components/whatsapp/CriarContatoDaConversaDialog.tsx` | contato criado a partir de uma conversa |
| `components/whatsapp/SalvarContatoRecebidoDialog.tsx` | contato recebido em cartão de contato |
| `components/whatsapp/VincularEAtualizarContato.tsx` | vincular conversa a contato existente (junta o número do chat aos da ficha) |

## 3. Decisões do dono do produto (11/09/2026 — não reabrir)

1. **Fábrica bloqueia só quando a Receita CONFIRMA que o CNPJ não existe** (HTTP 404). A saída é
   cadastrar sem CNPJ. Se o serviço falhar ou demorar, a fábrica é cadastrada com o CNPJ e a tela
   avisa que não deu para conferir — nunca se trava cadastro legítimo por culpa de serviço de fora.
2. **Cliente nunca bloqueia.** CNPJ que a Receita não tem gera aviso ("empresa aberta há pouco
   tempo pode levar semanas para aparecer") e o cadastro segue com o número. Cliente novo é onde
   está a venda nova.
3. **Telefone: um campo por número**, com "+ outro telefone" abaixo e um × para tirar. No banco
   continua a mesma lista separada por vírgula — nenhuma mudança de estrutura.

### Decisões do desenho, apresentadas e aprovadas

4. **Formato do telefone: `(84) 99999-8888`, sem `+55`.** É o formato de todo número já
   mascarado na base, e o dos exemplos dos campos. O `+55` continua onde ele é identificador — o
   WhatsApp —, fora deste trabalho.
5. **Nos cadastros de cliente, o campo aceita CPF ou CNPJ, decidido pelo número de dígitos, não
   pelo tipo.** 11 dígitos é CPF: confere o dígito verificador, sem consulta (CPF não tem consulta
   pública). 14 dígitos é CNPJ: confere e consulta a Receita. É o que faz o validador funcionar
   **para qualquer tipo**, inclusive os que as empresas ainda vão criar — o tipo deixa de ter
   qualquer efeito sobre o campo. Fábrica e obra continuam só CNPJ.
6. **A consulta dispara ao sair do campo**, não a cada tecla — como o `CampoCnpj` já faz. Menos
   consultas repetidas, que são uma causa provável do teste com várias lojas seguidas.
7. **Os 3.759 telefones já gravados não são reescritos.** Ganham o formato quando alguém edita o
   cadastro. Reescrever em massa seria escrita em dado de produção sem necessidade.

## 4. O desenho

### 4.1 A consulta diz o que aconteceu

Uma função só, `consultarCnpj(digitos)` em `src/lib/cnpj.ts`, devolve um resultado com **quatro
casos**, e é a única que fala com o BrasilAPI:

| Caso | Quando | Fábrica | Cliente |
|---|---|---|---|
| `encontrado` | HTTP 200 | preenche os dados | preenche os dados |
| `nao_existe` | HTTP 404 | **bloqueia**: "A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ." | **avisa e segue**: "A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número." |
| `servico_falhou` | 403, 429, 5xx, erro de rede | segue, avisando: "Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência." | idem |
| `demorou` | passou de 10 segundos | idem, com "a consulta demorou demais" | idem |

`fetchCnpjData` deixa de existir como porta de entrada: tudo passa por `consultarCnpj`.

### 4.2 Um campo de CNPJ só

`CampoCnpj` vira o campo único, com duas propriedades novas:

- `aceitaCpf` — liga o modo "CPF ou CNPJ" dos cadastros de cliente. O rótulo passa a "CPF ou
  CNPJ", a máscara acompanha o número de dígitos, e só 14 dígitos consultam a Receita. Ao sair
  do campo, qualquer quantidade que não seja 11 nem 14 (e não seja vazio) é recusada com "CPF tem
  11 dígitos e CNPJ tem 14" — 12 ou 13 dígitos não são nem um nem outro.
- `seNaoExistir: 'bloquear' | 'avisar'` — a regra da fábrica ou a do cliente.

E um retorno novo, `onResultado(caso)`, para o formulário saber se pode salvar. **O formulário da
fábrica confere o resultado ao salvar**: se o CNPJ preenchido ainda não foi consultado (a pessoa
digitou e clicou em Salvar direto), a consulta roda e o salvamento espera por ela.

Onde ele entra:

| Tela | `aceitaCpf` | `seNaoExistir` |
|---|---|---|
| Novo cliente (`Clientes.tsx`) | sim | avisar |
| Editar cliente (`ClienteDetalhe.tsx`) | sim | avisar |
| Atalho de empresa no Novo Negócio (`EmpresaSelector.tsx`) | sim | avisar |
| Fabricantes (`Fabricantes.tsx`) | não | **bloquear** |
| Atalho de fábrica no Novo Negócio (`FabricanteSelector.tsx`) | não | **bloquear** |
| Obras — CNPJ da SPE (já usa) | não | avisar |

### 4.3 Telefones: um campo por número

Componente novo, `CampoTelefones`, em `src/components/shared/`:

- Recebe e devolve o **texto como está no banco** — a lista separada por vírgula. Quem usa o campo
  não precisa saber que ele se divide.
- Desenha **um campo por número**, cada um com a máscara travada em um número: 10 dígitos é fixo
  `(84) 3222-1111`, 11 é celular `(84) 99999-8888`. **Nunca força o nono dígito** em fixo
  (`CLAUDE.md` §7.1).
- Abaixo do último campo, **"+ outro telefone"**; ao lado de cada campo extra, um **×**.
- **O que não é telefone brasileiro passa intacto:** número estrangeiro (começa com `+` e não é
  `+55`), identificador de grupo do WhatsApp (tem hífen ou `@`), sequência curta que ninguém
  reconhece. Nunca é destruído — a regra do `telefoneParaCadastro`, aplicada campo a campo.
- Ao gravar, junta com `", "` — o mesmo separador dos 148 cadastros de hoje.

Entra nos 13 campos listados no §2. As três janelas do WhatsApp ficam por último no plano: são
arquivos da frente do WhatsApp, e se ela voltar a mexer neles essas tarefas se separam sem
atrapalhar o resto.

## 5. O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não reescreve os telefones já gravados | Decisão 7. Ganham o formato na próxima edição |
| Não mexe na lista de conversas do WhatsApp | Lá o número é identificador da conversa, não cadastro |
| Não cria segundo provedor de CNPJ para quando o BrasilAPI cair | Com a decisão 1 (serviço fora não trava), não é necessário agora |
| Não consulta CPF | Não existe consulta pública de CPF |
| Não conserta o `isConstrutora` morto do `NovoNegocioDialog` | Não tem efeito nenhum; apagar é limpeza, não conserto. Pode ir junto se a tarefa passar por ali |

## 6. Como se prova que funcionou

**Testes automatizados:**

- `consultarCnpj`: cada resposta do serviço (200, 404, 403, 429, 500, erro de rede, demora) cai no
  caso certo.
- CPF: dígitos verificadores válidos e inválidos, CPF com todos os dígitos iguais (inválido por
  regra), máscara.
- Telefones: **cada um dos formatos reais de campo com vários números** encontrados na base abre
  em campos separados e volta ao banco **sem perder número**; estrangeiro, identificador de grupo e
  sequência curta passam intactos; fixo de 10 dígitos não ganha o nono dígito.
- `CampoCnpj`: o formulário da fábrica não salva com CNPJ `nao_existe`; salva com
  `servico_falhou`; o cliente salva nos dois.
- **Varredura estrutural**, no molde de `src/test/uma-leitura-de-planilha-so.test.ts`: falha se
  qualquer arquivo fora de `src/lib/cnpj.ts` chamar o BrasilAPI, ou se qualquer tela fora do
  `CampoCnpj` chamar `consultarCnpj`. É o que impede a quarta cópia de nascer.

**Ensaio na tela** (sem gravar em produção — o ensaio para antes de salvar, salvo onde dito):

1. Fabricantes → nova fábrica com `98765432000198` (CNPJ válido e inexistente): o salvamento é
   **recusado** com a frase do §4.1 e a opção de cadastrar sem CNPJ.
2. Clientes → nova empresa, tipo loja, mesmo CNPJ: aparece o **aviso**, e o botão de avançar
   continua liberado.
3. Clientes → nova empresa, tipo pessoa física, com CPF válido: passa sem pedir CNPJ.
4. Abrir um cliente que tem dois números no telefone: aparecem **dois campos**, cada um formatado.
